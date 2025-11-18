const OpenAI = require('openai');
const personas = require('./focusGroupPersonas.json');

const useMockAi = (process.env.USE_MOCK_AI || '').toLowerCase() === 'true' || !process.env.OPENROUTER_API_KEY;
const defaultEditorModel = 'anthropic/claude-3.5-sonnet';
const defaultFocusModel = 'google/gemini-1.5-flash';

let cachedClient = null;

function getClient() {
  if (useMockAi) return null;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set in the environment. Set it or enable USE_MOCK_AI=true to run in mock mode.');
  }

  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey,
      baseURL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_BASE_URL || 'http://localhost:3000',
        'X-Title': process.env.APP_NAME || 'Virtuous Content Cycle'
      }
    });
  }

  return cachedClient;
}

const getEditorRevision = async (originalContent, aggregatedFeedback) => {
  const { editorModel } = getModels();
  try {
    if (useMockAi) {
      const revisionNote = aggregatedFeedback?.topDislikes?.[0] || 'tighten clarity';
      return {
        revisedContent: `${originalContent}\n\n[Mock editor tweak: addressed "${revisionNote}"]`,
        changesSummary: 'Minor clarity and tone adjustments (mock editor).',
        editorReasoning: 'Mock mode applies a lightweight edit to let you demo the flow without API calls.',
        timestamp: new Date().toISOString(),
        modelUsed: 'mock-editor',
      };
    }

    const client = getClient();
    const response = await client.chat.completions.create({
      model: editorModel,
      messages: [
        {
          role: 'system',
          content: `You are an expert editor tasked with improving content based on focus group feedback.

Your task:
1. Identify the 2-3 most critical issues from feedback.
2. Rewrite to address those issues while preserving strengths.
3. Aim to increase clarity and conciseness.
4. Do NOT make dramatic changes; iterate within the spirit of the original.

Output JSON:
{
  "revisedContent": "...",
  "changesSummary": "...",
  "reasoning": "..."
}`
        },
        {
          role: 'user',
          content: `Original content:
[${originalContent}]

Focus group feedback summary:
- Average rating: ${aggregatedFeedback.averageRating}/10
- Top likes: ${aggregatedFeedback.topLikes.join(', ')}
- Top dislikes: ${aggregatedFeedback.topDislikes.join(', ')}
- Specific suggestions: ${aggregatedFeedback.feedbackThemes.map(t => `${t.theme} (${t.sentiment})`).join(', ')}`
        },
      ],
    });

    const revision = JSON.parse(response.choices[0].message.content);

    return {
      revisedContent: revision.revisedContent,
      changesSummary: revision.changesSummary,
      editorReasoning: revision.reasoning,
      timestamp: new Date().toISOString(),
      modelUsed: editorModel,
    };
  } catch (error) {
    console.error('Error getting editor revision, falling back to mock:', error);
    if (!useMockAi) {
      return {
        revisedContent: `${originalContent}\n\n[Mock editor fallback: tightened flow and clarity after API error]`,
        changesSummary: 'Applied lightweight clarity/structure tweaks (fallback editor).',
        editorReasoning: 'API call failed; mock fallback used to keep the cycle moving.',
        timestamp: new Date().toISOString(),
        modelUsed: 'mock-editor-fallback',
      };
    }
    throw new Error('Failed to get editor revision.');
  }
};

const getFocusGroupFeedback = async (content) => {
  const { focusModel } = getModels();
  if (useMockAi) {
    return { feedback: buildMockFocusGroupFeedback(content), mode: 'mock', focusModel };
  }

  try {
    const feedback = await Promise.all(personas.map(persona => getFeedbackFromPersona(content, persona, focusModel)));
    const valid = feedback.filter(f => !f.error && typeof f.rating === 'number' && f.rating > 0);
    if (valid.length === 0) {
      console.warn('Focus group API returned no valid feedback; using mock fallback.');
      return { feedback: buildMockFocusGroupFeedback(content), mode: 'live-fallback', focusModel, lastError: 'No valid focus group responses received.' };
    }
    return { feedback, mode: 'live', focusModel };
  } catch (err) {
    console.warn('Focus group API failed, falling back to mock feedback:', err.message);
    return { feedback: buildMockFocusGroupFeedback(content), mode: 'live-fallback', focusModel, lastError: err.message };
  }
};

const getFeedbackFromPersona = async (content, persona, focusModel) => {
  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: focusModel,
      messages: [
        { role: 'system', content: persona.systemPrompt },
        { role: 'user', content: `Here is the content to evaluate:

${content}` },
        { role: 'user', content: 'Please provide your feedback in JSON format with the following keys: "rating" (1-10), "likes" (array of strings), "dislikes" (array of strings), "suggestions" (string).' },
      ],
    });

    const feedback = JSON.parse(response.choices[0].message.content);

    return {
      participantId: persona.id,
      participantType: persona.type,
      rating: feedback.rating,
      likes: feedback.likes,
      dislikes: feedback.dislikes,
      suggestions: feedback.suggestions,
      fullResponse: response.choices[0].message.content,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error getting feedback from persona ${persona.id}:`, error);
    // Return a default error response or re-throw the error
    return {
      participantId: persona.id,
      participantType: persona.type,
      rating: 0,
      likes: [],
      dislikes: [],
      suggestions: 'Error getting feedback.',
      fullResponse: '',
      timestamp: new Date().toISOString(),
      error: true,
    };
  }
};

const aggregateFeedback = (feedback) => {
    const ratings = feedback.map(f => f.rating).filter(r => r > 0);
    const averageRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    const ratingDistribution = {
        '1-3': feedback.filter(f => f.rating >= 1 && f.rating <= 3).length,
        '4-6': feedback.filter(f => f.rating >= 4 && f.rating <= 6).length,
        '7-10': feedback.filter(f => f.rating >= 7 && f.rating <= 10).length,
    };

    const allLikes = feedback.flatMap(f => f.likes);
    const topLikes = getTopItems(allLikes);

    const allDislikes = feedback.flatMap(f => f.dislikes);
    const topDislikes = getTopItems(allDislikes);
    
    const feedbackThemes = getFeedbackThemes(allLikes, allDislikes);

    // Placeholder for convergence score
    const convergenceScore = 0.85;

    return {
        averageRating,
        ratingDistribution,
        topLikes,
        topDislikes,
        convergenceScore,
        feedbackThemes,
    };
};

const getTopItems = (items) => {
    const frequency = items.reduce((acc, item) => {
        acc[item] = (acc[item] || 0) + 1;
        return acc;
    }, {});

    return Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(entry => entry[0]);
};

const getFeedbackThemes = (likes, dislikes) => {
    const themes = {};

    likes.forEach(like => {
        const theme = like.toLowerCase();
        themes[theme] = themes[theme] || { frequency: 0, sentiment: 'positive' };
        themes[theme].frequency++;
    });

    dislikes.forEach(dislike => {
        const theme = dislike.toLowerCase();
        themes[theme] = themes[theme] || { frequency: 0, sentiment: 'negative' };
        themes[theme].frequency++;
        if (themes[theme].sentiment === 'positive') {
            themes[theme].sentiment = 'neutral';
        }
    });

    return Object.entries(themes).map(([theme, data]) => ({
        theme,
        ...data
    }));
};

function buildMockFocusGroupFeedback(content) {
  const now = new Date();
  const baseRating = Math.max(6, Math.min(9, 7 + (content.length % 3) - 1));
  return personas.map((persona, idx) => {
    const rating = Math.min(10, Math.max(4, baseRating + ((idx % 2 === 0) ? 1 : -1)));
    const likes = ['clarity', 'tone', 'structure'].slice(0, 2);
    const dislikes = ['needs stronger hook', 'add specifics'].slice(0, 1 + (idx % 2));
    return {
      participantId: persona.id,
      participantType: persona.type,
      rating,
      likes,
      dislikes,
      suggestions: 'Mock suggestion: tighten intro and highlight value prop.',
      fullResponse: 'Mock focus group feedback (no API call).',
      timestamp: new Date(now.getTime() + idx * 1000).toISOString(),
    };
  });
}

function getAiMode() {
  return useMockAi ? 'mock' : 'live';
}

function getModels() {
  return {
    focusModel: process.env.OPENROUTER_FOCUS_MODEL || defaultFocusModel,
    editorModel: process.env.OPENROUTER_EDITOR_MODEL || defaultEditorModel,
  };
}

module.exports = {
  getEditorRevision,
  getFocusGroupFeedback,
  aggregateFeedback,
  getAiMode,
  getModels,
};
