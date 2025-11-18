const OpenAI = require('openai');
const databaseService = require('./databaseService');
const fallbackFocusGroupPersonas = require('./focusGroupPersonas.json');

const useMockAi = (process.env.USE_MOCK_AI || '').toLowerCase() === 'true' || !process.env.OPENROUTER_API_KEY;
const DEFAULT_TARGET_MARKET_COUNT = 3;
const DEFAULT_RANDOM_COUNT = 2;
// Sherlock Think Alpha: reasoning model, better for thoughtful content feedback
const defaultEditorModel = 'openrouter/sherlock-think-alpha';
const defaultFocusModel = 'openrouter/sherlock-think-alpha';

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

const getEditorRevision = async (originalContent, aggregatedFeedback, selectedFeedback = null, editorInstructions = '', moderatorSummary = null) => {
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
        moderator: moderatorSummary || null,
        usage: { promptTokens: 0, completionTokens: 0, totalCost: 0 }
      };
    }

    // Build detailed feedback context if individual feedback is provided
    let detailedFeedback = '';
    if (selectedFeedback && selectedFeedback.length > 0) {
      detailedFeedback = '\n\nDetailed feedback from selected participants:\n' +
        selectedFeedback.map(f => `
- ${f.participantId} (${f.participantType}, rated ${f.rating}/10):
  Likes: ${f.likes.join(', ')}
  Dislikes: ${f.dislikes.join(', ')}
  Suggestions: ${f.suggestions}`).join('\n');
    }

    const moderatorContext = moderatorSummary
      ? `\n\nModerator's synthesized summary:\n${moderatorSummary.summary}\nKey points: ${(moderatorSummary.keyPoints || []).join('; ')}\n`
      : '';

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
  "reasoning": "...",
  "instructionsApplied": true
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
- Specific suggestions: ${aggregatedFeedback.feedbackThemes.map(t => `${t.theme} (${t.sentiment})`).join(', ')}
${editorInstructions ? `\nAdditional editor instructions: ${editorInstructions}` : ''}${moderatorContext}${detailedFeedback}`
        },
      ],
    });

    const choice = response.choices[0];
    const revision = JSON.parse(choice.message.content);

    return {
      revisedContent: revision.revisedContent,
      changesSummary: revision.changesSummary,
      editorReasoning: revision.reasoning,
      timestamp: new Date().toISOString(),
      modelUsed: editorModel,
      moderator: moderatorSummary || null,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalCost: calculateCost(response)
      }
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
        moderator: moderatorSummary || null,
        usage: { promptTokens: 0, completionTokens: 0, totalCost: 0 },
      };
    }
    throw new Error('Failed to get editor revision.');
  }
};

const getFocusGroupFeedback = async (content, focusGroupConfig = {}) => {
  const { focusModel } = getModels();
  const targetMarketCount = focusGroupConfig.targetMarketCount ?? DEFAULT_TARGET_MARKET_COUNT;
  const randomCount = focusGroupConfig.randomCount ?? DEFAULT_RANDOM_COUNT;
  const personaIds = Array.isArray(focusGroupConfig.personaIds) ? focusGroupConfig.personaIds : [];

  const selectedPersonas = selectPersonas({ personaIds, targetMarketCount, randomCount });

  if (selectedPersonas.length === 0) {
    return {
      feedback: buildMockFocusGroupFeedback(content, selectedPersonas),
      mode: 'live-fallback',
      focusModel,
      lastError: 'No personas available for focus group.'
    };
  }

  if (useMockAi) {
    return { feedback: buildMockFocusGroupFeedback(content, selectedPersonas), mode: 'mock', focusModel };
  }

  try {
    const feedback = await Promise.all(selectedPersonas.map(persona => getFeedbackFromPersona(content, persona, focusModel)));
    const valid = feedback.filter(f => !f.error && typeof f.rating === 'number' && f.rating > 0);
    if (valid.length === 0) {
      console.warn('Focus group API returned no valid feedback; using mock fallback.');
      return { feedback: buildMockFocusGroupFeedback(content, selectedPersonas), mode: 'live-fallback', focusModel, lastError: 'No valid focus group responses received.' };
    }
    return { feedback, mode: 'live', focusModel };
  } catch (err) {
    console.warn('Focus group API failed, falling back to mock feedback:', err.message);
    return { feedback: buildMockFocusGroupFeedback(content, selectedPersonas), mode: 'live-fallback', focusModel, lastError: err.message };
  }
};

function selectPersonas({ personaIds = [], targetMarketCount = 3, randomCount = 2 }) {
  // Prefer explicit persona IDs
  if (personaIds.length > 0) {
    const dbPersonas = databaseService.getPersonasByIds(personaIds);
    const map = new Map(dbPersonas.map(p => [p.id, p]));
    return personaIds.map(id => map.get(id)).filter(Boolean);
  }

  let targetMarketPersonas = databaseService.getPersonasByType('target_market');
  let randomPersonas = databaseService.getPersonasByType('random');

  if (targetMarketPersonas.length === 0 && randomPersonas.length === 0) {
    console.warn('No personas in database. Seed personas before running focus groups.');
    return [];
  }

  const selected = [];

  for (let i = 0; i < targetMarketCount; i++) {
    const persona = targetMarketPersonas[i % Math.max(targetMarketPersonas.length, 1)];
    if (persona) {
      selected.push({
        ...persona,
        id: i < targetMarketPersonas.length ? persona.id : `${persona.id}_${Math.floor(i / Math.max(targetMarketPersonas.length, 1)) + 1}`
      });
    }
  }

  for (let i = 0; i < randomCount; i++) {
    const persona = randomPersonas[i % Math.max(randomPersonas.length, 1)];
    if (persona) {
      selected.push({
        ...persona,
        id: i < randomPersonas.length ? persona.id : `${persona.id}_${Math.floor(i / Math.max(randomPersonas.length, 1)) + 1}`
      });
    }
  }

  return selected;
}

const runFeedbackDebate = async (feedbackItems) => {
  if (!feedbackItems || feedbackItems.length === 0) {
    return {
      summary: 'No feedback to synthesize.',
      keyPoints: [],
      patterns: '',
      timestamp: new Date().toISOString(),
      modelUsed: 'none',
      usage: { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    };
  }

  const { editorModel } = getModels();

  if (useMockAi) {
    return {
      summary: 'Mock moderator: synthesized key agreements and disagreements.',
      keyPoints: ['Agreement: clear value prop', 'Disagreement: tone too casual', 'Action: tighten intro'],
      patterns: '',
      timestamp: new Date().toISOString(),
      modelUsed: 'mock-debate',
      usage: { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    };
  }

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model: editorModel,
      messages: [
        {
          role: 'system',
          content: `You are a focus group moderator. Analyze the reviews below and synthesize:
1) A concise summary (2-3 sentences) of consensus and key disagreements.
2) The 3-5 most critical, actionable suggestions (prioritized by impact and frequency).
3) Any notable patterns by persona type.

Return JSON exactly as:
{"summary":"...","keyPoints":["...","..."],"patterns":"..."}`
        },
        {
          role: 'user',
          content: feedbackItems.map(f => `
Participant: ${f.participantId} (${f.participantType})
Rating: ${f.rating}/10
Likes: ${f.likes.join(', ')}
Dislikes: ${f.dislikes.join(', ')}
Suggestions: ${f.suggestions}
---`).join('\n')
        }
      ]
    });

    let parsed;
    try {
      parsed = JSON.parse(response.choices[0].message.content);
    } catch (parseErr) {
      console.error('Failed to parse moderator response:', parseErr);
      return {
        summary: 'Moderator summary unavailable; using direct feedback.',
        keyPoints: [],
        patterns: '',
        timestamp: new Date().toISOString(),
        modelUsed: 'debate-parse-error',
        usage: { promptTokens: 0, completionTokens: 0, totalCost: 0 }
      };
    }
    return {
      summary: parsed.summary,
      keyPoints: parsed.keyPoints || [],
      patterns: parsed.patterns || '',
      timestamp: new Date().toISOString(),
      modelUsed: editorModel,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalCost: calculateCost(response)
      }
    };
  } catch (err) {
    console.error('Error running feedback debate, fallback to mock summary:', err);
    return {
      summary: 'Moderator summary unavailable; using direct feedback.',
      keyPoints: [],
      patterns: '',
      timestamp: new Date().toISOString(),
      modelUsed: 'debate-fallback',
      usage: { promptTokens: 0, completionTokens: 0, totalCost: 0 }
    };
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
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalCost: calculateCost(response)
      }
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
      usage: { promptTokens: 0, completionTokens: 0, totalCost: 0 }
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

    const convergenceScore = calculateConvergenceScore(ratings);

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

function buildMockFocusGroupFeedback(content, selectedPersonas = []) {
  const personasToUse = selectedPersonas.length > 0 ? selectedPersonas : selectPersonas({ targetMarketCount: 3, randomCount: 2 });
  const now = new Date();
  const baseRating = Math.max(6, Math.min(9, 7 + (content.length % 3) - 1));
  return personasToUse.map((persona, idx) => {
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

function calculateCost(response) {
  const promptTokens = response.usage?.prompt_tokens ?? 0;
  const completionTokens = response.usage?.completion_tokens ?? 0;
  const billedUnits = response.usage?.total_tokens ?? (promptTokens + completionTokens);
  // NOTE: OpenRouter pricing varies by model and the API does not return cost.
  // This is a simplified placeholder that relies on an optional env override.
  // TODO: replace with model-aware pricing lookup or OpenRouter include_costs support.
  const perTokenCost = parseFloat(process.env.OPENROUTER_TOKEN_COST || '0');
  return perTokenCost > 0 ? billedUnits * perTokenCost : 0;
}

function calculateConvergenceScore(ratings) {
  if (!ratings || ratings.length === 0) return 0;
  if (ratings.length === 1) return 1;

  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  const variance = ratings.reduce((acc, r) => acc + Math.pow(r - avg, 2), 0) / ratings.length;
  const stdDev = Math.sqrt(variance);

  const MAX_EXPECTED_STD_DEV = 3; // For 1-10 rating scale
  // Normalize: assuming rating scale 1-10, map lower stdDev -> higher score
  const normalized = Math.max(0, Math.min(1, 1 - (stdDev / MAX_EXPECTED_STD_DEV)));
  return Number(normalized.toFixed(2));
}

module.exports = {
  getEditorRevision,
  getFocusGroupFeedback,
  aggregateFeedback,
  runFeedbackDebate,
  getAiMode,
  getModels,
};
