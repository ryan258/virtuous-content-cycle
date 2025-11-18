require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const crypto = require('crypto');
const { iterationStateSchema, userEditSchema } = require('./models.js');
const fileService = require('./fileService.js');
const aiService = require('./aiService.js');
const { BadRequestError } = require('./errors.js');

const app = express();

// Configure Helmet with relaxed CSP for CDN scripts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net"
      ],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

// Routes
app.post('/api/content/create', createContent);
app.get('/api/content/:id', getContent);
app.post('/api/content/:id/run-focus-group', runFocusGroup);
app.post('/api/content/:id/run-editor', runEditor);
app.post('/api/content/:id/user-review', userReview);
app.get('/api/content/:id/history', getContentHistory);
app.post('/api/content/:id/export', exportContent);


app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Controller Functions
async function createContent(req, res, next) {
  try {
    const { originalInput, metadata } = req.body;

    if (!originalInput || !metadata) {
      throw new BadRequestError('Missing originalInput or metadata in request body');
    }

    const contentId = `content-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}`;
    const initialCycle = 1;

    const initialState = {
      id: contentId,
      cycle: initialCycle,
      originalInput,
      currentVersion: originalInput,
      focusGroupRatings: [],
      status: 'created',
      statusHistory: [{ status: 'created', timestamp: new Date().toISOString() }],
      metadata: {
        ...metadata,
        costEstimate: metadata.costEstimate ?? 0,
      },
      aiMeta: { mode: aiService.getAiMode(), ...aiService.getModels() },
    };

    const validationResult = iterationStateSchema.safeParse(initialState);

    if (!validationResult.success) {
      const issues = validationResult.error?.issues || validationResult.error?.errors || [];
      const message = issues.length > 0
        ? issues.map(e => e.message).join(', ')
        : 'Invalid request payload';
      throw new BadRequestError(message);
    }

    const validatedState = validationResult.data;

    await fileService.saveIterationState(contentId, initialCycle, validatedState);

    res.status(201).json(validatedState);
  } catch (error) {
    next(error);
  }
};

async function getContent(req, res, next) {
  try {
    const { id } = req.params;
    const latestCycle = await fileService.getLatestCycle(id);
    const iterationState = await fileService.getIterationState(id, latestCycle);
    res.status(200).json(iterationState);
  } catch (error) {
    next(error);
  }
};

async function runFocusGroup(req, res, next) {
  try {
    const { id } = req.params;
    const latestCycle = await fileService.getLatestCycle(id);
    const iterationState = await fileService.getIterationState(id, latestCycle);

    const focusGroupConfig = iterationState.metadata.focusGroupConfig || { targetMarketCount: 3, randomCount: 2 };
    const { feedback: focusGroupRatings, mode: aiMode, lastError: aiError, focusModel } = await aiService.getFocusGroupFeedback(iterationState.currentVersion, focusGroupConfig);
    const aggregatedFeedback = aiService.aggregateFeedback(focusGroupRatings);

    const newIterationState = {
      ...iterationState,
      focusGroupRatings,
      aggregatedFeedback,
      status: 'focus_group_complete',
      aiMeta: { ...(iterationState.aiMeta || {}), mode: aiMode || aiService.getAiMode(), focusModel, lastError: aiError },
      statusHistory: [...iterationState.statusHistory, { status: 'focus_group_complete', timestamp: new Date().toISOString() }],
    };

    await fileService.saveIterationState(id, latestCycle, newIterationState);

    res.status(200).json(newIterationState);
  } catch (error) {
    next(error);
  }
};

async function runEditor(req, res, next) {
  try {
    const { id } = req.params;
    const { selectedParticipantIds } = req.body;
    const latestCycle = await fileService.getLatestCycle(id);
    const iterationState = await fileService.getIterationState(id, latestCycle);

    if (iterationState.status !== 'focus_group_complete') {
      throw new BadRequestError('Editor can only be run after a focus group has completed.');
    }

    // Filter feedback based on selected participants
    let feedbackToUse = iterationState.aggregatedFeedback;
    let selectedFeedback = iterationState.focusGroupRatings;

    if (selectedParticipantIds && selectedParticipantIds.length > 0) {
      selectedFeedback = iterationState.focusGroupRatings.filter(
        rating => selectedParticipantIds.includes(rating.participantId)
      );
      // Re-aggregate only selected feedback
      feedbackToUse = aiService.aggregateFeedback(selectedFeedback);
    }

    const editorPass = await aiService.getEditorRevision(
      iterationState.currentVersion,
      feedbackToUse,
      selectedFeedback
    );

    const newIterationState = {
      ...iterationState,
      editorPass: {
        ...editorPass,
        selectedParticipants: selectedParticipantIds || iterationState.focusGroupRatings.map(r => r.participantId),
      },
      currentVersion: editorPass.revisedContent,
      status: 'editor_complete',
      aiMeta: { ...(iterationState.aiMeta || {}), mode: aiService.getAiMode(), editorModel: aiService.getModels().editorModel },
      statusHistory: [...iterationState.statusHistory, { status: 'editor_complete', timestamp: new Date().toISOString() }],
    };

    await fileService.saveIterationState(id, latestCycle, newIterationState);

    res.status(200).json(newIterationState);
  } catch (error) {
    next(error);
  }
};

async function userReview(req, res, next) {
  try {
    const { id } = req.params;
    const { approved, userEdits, continueToNextCycle, notes } = req.body;

    const validationResult = userEditSchema.safeParse({ approved, userEdits, notes, timestamp: new Date().toISOString() });
    if (!validationResult.success) {
      throw new BadRequestError(validationResult.error.errors.map(e => e.message).join(', '));
    }

    const latestCycle = await fileService.getLatestCycle(id);
    const iterationState = await fileService.getIterationState(id, latestCycle);

    if (iterationState.status !== 'editor_complete') {
      throw new BadRequestError('User review can only be done after an editor pass has completed.');
    }

    iterationState.userEdit = validationResult.data;
    iterationState.status = 'user_review_complete';
    iterationState.statusHistory.push({ status: 'user_review_complete', timestamp: new Date().toISOString() });

    if (userEdits) {
      iterationState.currentVersion = userEdits;
    } else if (!approved) {
      iterationState.currentVersion = iterationState.originalInput;
    }

    await fileService.saveIterationState(id, latestCycle, iterationState);

    if (continueToNextCycle) {
      if (latestCycle >= iterationState.metadata.maxCycles) {
        throw new BadRequestError('Maximum number of cycles reached.');
      }

      const newCycle = latestCycle + 1;
      const newIterationState = {
        ...iterationState,
        cycle: newCycle,
        status: 'awaiting_focus_group',
        statusHistory: [...iterationState.statusHistory, { status: 'awaiting_focus_group', timestamp: new Date().toISOString() }],
        focusGroupRatings: [],
        aggregatedFeedback: undefined,
        editorPass: undefined,
        userEdit: undefined,
      };
      await fileService.saveIterationState(id, newCycle, newIterationState);
      res.status(200).json(newIterationState);
    } else {
      res.status(200).json(iterationState);
    }
  } catch (error) {
    next(error);
  }
};

async function getContentHistory(req, res, next) {
  try {
    const { id } = req.params;
    const cycles = await fileService.getAllCycles(id);
    res.status(200).json(cycles);
  } catch (error) {
    next(error);
  }
};

async function exportContent(req, res, next) {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    const cycles = await fileService.getAllCycles(id);

    if (format === 'csv') {
      res.status(501).send('CSV export is not implemented yet.');
    } else {
      res.header('Content-Type', 'application/json');
      res.attachment(`content-${id}.json`);
      res.send(cycles);
    }
  } catch (error) {
    next(error);
  }
};

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Something went wrong!';
  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message
  });
});


const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
