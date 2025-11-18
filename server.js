require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const crypto = require('crypto');
const { iterationStateSchema, userEditSchema } = require('./models.js');
const databaseService = require('./databaseService.js');
const aiService = require('./aiService.js');
const { BadRequestError, NotFoundError } = require('./errors.js');
const focusGroupPersonas = require('./focusGroupPersonas.json');

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

// Seed personas on startup only if database is empty
try {
  const existingPersonas = databaseService.getAllPersonas();
  if (existingPersonas.length === 0) {
    console.log('📝 Seeding default personas...');
    databaseService.seedPersonas(focusGroupPersonas);
  } else {
    console.log(`✅ Found ${existingPersonas.length} personas, skipping seed`);
  }
} catch (err) {
  console.error('Failed to seed personas on startup:', err);
  throw err;
}

// Routes
app.post('/api/content/create', createContent);
app.get('/api/content/:id', getContent);
app.post('/api/content/:id/run-focus-group', runFocusGroup);
app.post('/api/content/:id/run-editor', runEditor);
app.post('/api/content/:id/user-review', userReview);
app.get('/api/content/:id/history', getContentHistory);
// Support both GET and POST for export (backward compatibility)
app.get('/api/content/:id/export', exportContent);
app.post('/api/content/:id/export', exportContent);

// Personas CRUD
app.get('/api/personas', listPersonas);
app.post('/api/personas', createPersona);
app.put('/api/personas/:id', updatePersona);
app.delete('/api/personas/:id', deletePersona);


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

    // Validate metadata schema
    const initialState = {
      id: 'temp',
      cycle: 1,
      originalInput,
      currentVersion: originalInput,
      focusGroupRatings: [],
      status: 'awaiting_focus_group',
      statusHistory: [{ status: 'awaiting_focus_group', timestamp: new Date().toISOString() }],
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
    const contentId = `content-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}`;
    const initialCycle = 1;
    const personaIds = Array.isArray(metadata.personaIds) ? metadata.personaIds : null;

    // Wrap content creation in transaction for atomicity
    const createContentAndCycle = databaseService.db.transaction(() => {
      // Create ContentItem
      databaseService.createContentItem({
        id: contentId,
        originalInput,
        contentType: validatedState.metadata.contentType,
        targetAudience: validatedState.metadata.targetAudience,
        maxCycles: validatedState.metadata.maxCycles,
        convergenceThreshold: validatedState.metadata.convergenceThreshold,
        costEstimate: validatedState.metadata.costEstimate ?? 0,
        targetMarketCount: validatedState.metadata.focusGroupConfig?.targetMarketCount ?? 3,
        randomCount: validatedState.metadata.focusGroupConfig?.randomCount ?? 2,
        personaIds
      });

      // Create initial Cycle
      databaseService.createCycle({
        contentId,
        cycleNumber: initialCycle,
        currentVersion: originalInput,
        status: 'awaiting_focus_group',
        aiMode: aiService.getAiMode(),
        focusModel: aiService.getModels().focusModel,
        editorModel: aiService.getModels().editorModel
      });
    });

    // Execute transaction
    createContentAndCycle();

    // Return state in old format for backward compatibility
    const createdState = databaseService.getIterationState(contentId, initialCycle);

    res.status(201).json(createdState);
  } catch (error) {
    next(error);
  }
};

async function getContent(req, res, next) {
  try {
    const { id } = req.params;

    // Check if content exists
    const contentItem = databaseService.getContentItem(id);
    if (!contentItem) {
      throw new NotFoundError(`Content with id ${id} not found`);
    }

    const latestCycle = databaseService.getLatestCycleNumber(id);
    if (latestCycle === 0) {
      throw new NotFoundError(`No cycles found for content ${id}`);
    }

    const iterationState = databaseService.getIterationState(id, latestCycle);
    res.status(200).json(iterationState);
  } catch (error) {
    next(error);
  }
};

async function runFocusGroup(req, res, next) {
  try {
    const { id } = req.params;
    const { personaIds: personaIdsFromBody } = req.body || {};

    // Check if content exists
    const contentItem = databaseService.getContentItem(id);
    if (!contentItem) {
      throw new NotFoundError(`Content with id ${id} not found`);
    }

    const latestCycle = databaseService.getLatestCycleNumber(id);
    if (latestCycle === 0) {
      throw new NotFoundError(`No cycles found for content ${id}`);
    }

    const cycle = databaseService.getCycleByContentAndNumber(id, latestCycle);
    if (!cycle) {
      throw new NotFoundError(`Cycle ${latestCycle} not found for content ${id}`);
    }

    // Only allow running focus group on cycles that are ready
    if (cycle.status !== 'created' && cycle.status !== 'awaiting_focus_group') {
      throw new BadRequestError(`Focus group can only be run on cycles with status 'created' or 'awaiting_focus_group'. Current status: ${cycle.status}`);
    }

    // Prefer explicit personaIds from request, then stored personaIds, else fallback to counts
    const personaIds = Array.isArray(personaIdsFromBody) && personaIdsFromBody.length > 0
      ? personaIdsFromBody
      : (contentItem.personaIds ? JSON.parse(contentItem.personaIds) : []);

    const focusGroupConfig = {
      targetMarketCount: contentItem.targetMarketCount ?? 3,
      randomCount: contentItem.randomCount ?? 2,
      personaIds
    };

    const { feedback: focusGroupRatings, mode: aiMode, lastError: aiError, focusModel } = await aiService.getFocusGroupFeedback(cycle.currentVersion, focusGroupConfig);
    const aggregatedFeedback = aiService.aggregateFeedback(focusGroupRatings);

    // Wrap all database writes in a transaction for atomicity
    const saveFocusGroupResults = databaseService.db.transaction(() => {
      // Delete existing feedback for this cycle to prevent duplicates (in case of retry)
      databaseService.db.prepare('DELETE FROM Feedback WHERE cycleId = ?').run(cycle.id);

      // Save individual feedback items to database
      for (const feedback of focusGroupRatings) {
        databaseService.createFeedback({
          cycleId: cycle.id,
          participantId: feedback.participantId,
          participantType: feedback.participantType,
          rating: feedback.rating,
          likes: feedback.likes,
          dislikes: feedback.dislikes,
          suggestions: feedback.suggestions,
          fullResponse: feedback.fullResponse,
          timestamp: feedback.timestamp,
          promptTokens: feedback.usage?.promptTokens || 0,
          completionTokens: feedback.usage?.completionTokens || 0,
          cost: feedback.usage?.totalCost || 0
        });
      }

      // Update cycle with aggregated feedback
      databaseService.updateCycleWithAggregatedFeedback(cycle.id, aggregatedFeedback);

      // Update cost usage at cycle level (aggregate from participants)
      const totalPrompt = focusGroupRatings.reduce((sum, f) => sum + (f.usage?.promptTokens || 0), 0);
      const totalCompletion = focusGroupRatings.reduce((sum, f) => sum + (f.usage?.completionTokens || 0), 0);
      const totalCost = focusGroupRatings.reduce((sum, f) => sum + (f.usage?.totalCost || 0), 0);
      databaseService.updateCycleCosts(cycle.id, totalPrompt, totalCompletion, totalCost);

      // Update AI metadata
      const now = new Date().toISOString();
      databaseService.db.prepare(`
        UPDATE Cycles SET
          aiMode = ?,
          focusModel = ?,
          lastError = ?,
          updatedAt = ?
        WHERE id = ?
      `).run(aiMode || aiService.getAiMode(), focusModel || null, aiError || null, now, cycle.id);

      // Update status
      databaseService.updateCycleStatus(cycle.id, 'focus_group_complete');
    });

    // Execute transaction
    saveFocusGroupResults();

    // Return state in old format
    const newIterationState = databaseService.getIterationState(id, latestCycle);
    res.status(200).json(newIterationState);
  } catch (error) {
    next(error);
  }
};

async function runEditor(req, res, next) {
  try {
    const { id } = req.params;
    const { selectedParticipantIds, editorInstructions = '' } = req.body;

    if (editorInstructions && editorInstructions.length > 1000) {
      throw new BadRequestError('editorInstructions cannot exceed 1000 characters');
    }

    // Check if content exists
    const contentItem = databaseService.getContentItem(id);
    if (!contentItem) {
      throw new NotFoundError(`Content with id ${id} not found`);
    }

    const latestCycle = databaseService.getLatestCycleNumber(id);
    if (latestCycle === 0) {
      throw new NotFoundError(`No cycles found for content ${id}`);
    }

    const cycle = databaseService.getCycleByContentAndNumber(id, latestCycle);
    if (!cycle) {
      throw new NotFoundError(`Cycle ${latestCycle} not found for content ${id}`);
    }

    if (cycle.status !== 'focus_group_complete') {
      throw new BadRequestError('Editor can only be run after a focus group has completed.');
    }

    // Get all feedback for this cycle
    const allFeedback = databaseService.getAllFeedbackForCycle(cycle.id);

    // Filter feedback based on selected participants
    let selectedFeedback = allFeedback;
    if (selectedParticipantIds && selectedParticipantIds.length > 0) {
      selectedFeedback = allFeedback.filter(
        rating => selectedParticipantIds.includes(rating.participantId)
      );
    }

    // Re-aggregate feedback if filtered
    const feedbackToUse = selectedParticipantIds && selectedParticipantIds.length > 0
      ? aiService.aggregateFeedback(selectedFeedback)
      : {
          averageRating: cycle.averageRating,
          convergenceScore: cycle.convergenceScore,
          ratingDistribution: {
            '1-3': cycle.ratingDistLow,
            '4-6': cycle.ratingDistMid,
            '7-10': cycle.ratingDistHigh
          },
          topLikes: JSON.parse(cycle.topLikes || '[]'),
          topDislikes: JSON.parse(cycle.topDislikes || '[]'),
          feedbackThemes: JSON.parse(cycle.feedbackThemes || '[]')
        };

    const editorPass = await aiService.getEditorRevision(
      cycle.currentVersion,
      feedbackToUse,
      selectedFeedback,
      editorInstructions
    );

    // Wrap all database writes in a transaction for atomicity
    const saveEditorResults = databaseService.db.transaction(() => {
      // Update cycle with editor pass
      databaseService.updateCycleWithEditorPass(cycle.id, editorPass);

      if (editorPass.usage) {
        databaseService.updateCycleCosts(
          cycle.id,
          editorPass.usage.promptTokens,
          editorPass.usage.completionTokens,
          editorPass.usage.totalCost
        );
      }

      // Update current version
      databaseService.db.prepare('UPDATE Cycles SET currentVersion = ?, updatedAt = ? WHERE id = ?')
        .run(editorPass.revisedContent, new Date().toISOString(), cycle.id);

      // Update status
      databaseService.updateCycleStatus(cycle.id, 'editor_complete');
    });

    // Execute transaction
    saveEditorResults();

    // Return state in old format
    const newIterationState = databaseService.getIterationState(id, latestCycle);
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

    // Check if content exists
    const contentItem = databaseService.getContentItem(id);
    if (!contentItem) {
      throw new NotFoundError(`Content with id ${id} not found`);
    }

    const latestCycle = databaseService.getLatestCycleNumber(id);
    if (latestCycle === 0) {
      throw new NotFoundError(`No cycles found for content ${id}`);
    }

    const cycle = databaseService.getCycleByContentAndNumber(id, latestCycle);
    if (!cycle) {
      throw new NotFoundError(`Cycle ${latestCycle} not found for content ${id}`);
    }

    if (cycle.status !== 'editor_complete') {
      throw new BadRequestError('User review can only be done after an editor pass has completed.');
    }

    // Wrap all database writes in a transaction for atomicity
    const saveUserReview = databaseService.db.transaction(() => {
      // Update cycle with user review
      databaseService.updateCycleWithUserReview(cycle.id, validationResult.data);

      // Update current version if user made edits or rejected
      if (userEdits) {
        databaseService.db.prepare('UPDATE Cycles SET currentVersion = ?, updatedAt = ? WHERE id = ?')
          .run(userEdits, new Date().toISOString(), cycle.id);
      } else if (!approved) {
        databaseService.db.prepare('UPDATE Cycles SET currentVersion = ?, updatedAt = ? WHERE id = ?')
          .run(contentItem.originalInput, new Date().toISOString(), cycle.id);
      }

      // Update status
      databaseService.updateCycleStatus(cycle.id, 'user_review_complete');
    });

    // Execute transaction
    saveUserReview();

    if (continueToNextCycle) {
      if (latestCycle >= contentItem.maxCycles) {
        throw new BadRequestError('Maximum number of cycles reached.');
      }

      const newCycleNumber = latestCycle + 1;

      // Determine correct currentVersion for new cycle:
      // - If user provided edits, use those
      // - Else if approved, use editor's revision
      // - Else (rejected), use original input
      let currentVersion;
      if (userEdits) {
        currentVersion = userEdits;
      } else if (approved) {
        currentVersion = cycle.currentVersion;
      } else {
        currentVersion = contentItem.originalInput;
      }

      databaseService.createCycle({
        contentId: id,
        cycleNumber: newCycleNumber,
        currentVersion,
        status: 'awaiting_focus_group',
        aiMode: aiService.getAiMode(),
        focusModel: aiService.getModels().focusModel,
        editorModel: aiService.getModels().editorModel
      });

      const newIterationState = databaseService.getIterationState(id, newCycleNumber);
      res.status(200).json(newIterationState);
    } else {
      const iterationState = databaseService.getIterationState(id, latestCycle);
      res.status(200).json(iterationState);
    }
  } catch (error) {
    next(error);
  }
};

async function getContentHistory(req, res, next) {
  try {
    const { id } = req.params;

    // Check if content exists
    const contentItem = databaseService.getContentItem(id);
    if (!contentItem) {
      throw new NotFoundError(`Content with id ${id} not found`);
    }

    const cycles = databaseService.getAllCyclesForContent(id);

    // Convert each cycle to iteration state format
    const iterationStates = cycles.map(cycle =>
      databaseService.getIterationState(id, cycle.cycleNumber)
    );

    res.status(200).json(iterationStates);
  } catch (error) {
    next(error);
  }
};

async function exportContent(req, res, next) {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    // Check if content exists
    const contentItem = databaseService.getContentItem(id);
    if (!contentItem) {
      throw new NotFoundError(`Content with id ${id} not found`);
    }

    const cycles = databaseService.getAllCyclesForContent(id);

    // Convert each cycle to iteration state format
    const iterationStates = cycles.map(cycle =>
      databaseService.getIterationState(id, cycle.cycleNumber)
    );

    if (format === 'csv') {
      res.status(501).send('CSV export is not implemented yet.');
    } else {
      res.header('Content-Type', 'application/json');
      res.attachment(`content-${id}.json`);
      res.send(iterationStates);
    }
  } catch (error) {
    next(error);
  }
};

async function listPersonas(req, res, next) {
  try {
    const personas = databaseService.getAllPersonas();
    res.status(200).json(personas);
  } catch (error) {
    next(error);
  }
};

async function createPersona(req, res, next) {
  try {
    const { id, name, type, persona, systemPrompt } = req.body;
    if (!name || !type || !persona || !systemPrompt) {
      throw new BadRequestError('name, type, persona, and systemPrompt are required');
    }
    const trimmedName = name.trim();
    const trimmedPersona = persona.trim();
    const trimmedPrompt = systemPrompt.trim();
    if (trimmedName.length === 0 || trimmedPersona.length === 0 || trimmedPrompt.length === 0) {
      throw new BadRequestError('Fields cannot be empty');
    }
    if (systemPrompt && systemPrompt.length > 10000) {
      throw new BadRequestError('systemPrompt cannot exceed 10,000 characters');
    }
    if (persona && persona.length > 500) {
      throw new BadRequestError('persona description cannot exceed 500 characters');
    }
    const personaId = id || `persona-${crypto.randomUUID()}`;
    const created = databaseService.createPersona({ id: personaId, name: trimmedName, type, persona: trimmedPersona, systemPrompt: trimmedPrompt });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
};

async function updatePersona(req, res, next) {
  try {
    const { id } = req.params;
    const existing = databaseService.getPersona(id);
    if (!existing) {
      throw new NotFoundError(`Persona with id ${id} not found`);
    }
    const { name, type, persona, systemPrompt } = req.body;
    if (!name || !type || !persona || !systemPrompt) {
      throw new BadRequestError('name, type, persona, and systemPrompt are required');
    }
    const trimmedName = name.trim();
    const trimmedPersona = persona.trim();
    const trimmedPrompt = systemPrompt.trim();
    if (trimmedName.length === 0 || trimmedPersona.length === 0 || trimmedPrompt.length === 0) {
      throw new BadRequestError('Fields cannot be empty');
    }
    if (systemPrompt && systemPrompt.length > 10000) {
      throw new BadRequestError('systemPrompt cannot exceed 10,000 characters');
    }
    if (persona && persona.length > 500) {
      throw new BadRequestError('persona description cannot exceed 500 characters');
    }
    const updated = databaseService.updatePersona(id, { name: trimmedName, type, persona: trimmedPersona, systemPrompt: trimmedPrompt });
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
};

async function deletePersona(req, res, next) {
  try {
    const { id } = req.params;
    const existing = databaseService.getPersona(id);
    if (!existing) {
      throw new NotFoundError(`Persona with id ${id} not found`);
    }
    const inUse = databaseService.db.prepare(`
      SELECT COUNT(*) as count
      FROM ContentItems
      WHERE personaIds IS NOT NULL
        AND json_valid(personaIds)
        AND EXISTS (
          SELECT 1 FROM json_each(personaIds)
          WHERE value = ?
        )
    `).get(id);
    if (inUse.count > 0) {
      throw new BadRequestError(`Cannot delete persona "${id}" - it is in use by ${inUse.count} content item(s)`);
    }
    const result = databaseService.deletePersona(id);
    res.status(200).json(result);
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
