const { z } = require('zod');

const focusGroupRatingSchema = z.object({
  participantId: z.string(),
  participantType: z.enum(['target_market', 'random']),
  rating: z.number().min(1).max(10),
  likes: z.array(z.string()),
  dislikes: z.array(z.string()),
  suggestions: z.string(),
  fullResponse: z.string(),
  timestamp: z.string().datetime(),
});

const aggregatedFeedbackSchema = z.object({
  averageRating: z.number(),
  ratingDistribution: z.object({
    '1-3': z.number(),
    '4-6': z.number(),
    '7-10': z.number(),
  }),
  topLikes: z.array(z.string()),
  topDislikes: z.array(z.string()),
  convergenceScore: z.number().min(0).max(1),
  feedbackThemes: z.array(z.object({
    theme: z.string(),
    frequency: z.number(),
    sentiment: z.enum(['positive', 'negative', 'neutral']),
  })),
});

const editorPassSchema = z.object({
  revisedContent: z.string(),
  changesSummary: z.string(),
  editorReasoning: z.string(),
  timestamp: z.string().datetime(),
  modelUsed: z.string(),
});

const aiMetaSchema = z.object({
  mode: z.enum(['live', 'mock', 'live-fallback']),
  focusModel: z.string().optional(),
  editorModel: z.string().optional(),
  lastError: z.string().optional(),
}).optional();

const userEditSchema = z.object({
  approved: z.boolean(),
  userEdits: z.string().nullable().optional(),
  notes: z.string(),
  timestamp: z.string().datetime(),
});

const statusHistorySchema = z.object({
  status: z.string(),
  timestamp: z.string().datetime(),
});

const metadataSchema = z.object({
  contentType: z.string(),
  targetAudience: z.string(),
  costEstimate: z.number().nonnegative().default(0),
  maxCycles: z.number(),
  convergenceThreshold: z.number().min(0).max(1),
  focusGroupConfig: z.object({
    targetMarketCount: z.number().min(1).max(10).default(3),
    randomCount: z.number().min(0).max(10).default(2),
  }).optional(),
});

const iterationStateSchema = z.object({
  id: z.string(),
  cycle: z.number(),
  originalInput: z.string(),
  currentVersion: z.string(),
  focusGroupRatings: z.array(focusGroupRatingSchema),
  aggregatedFeedback: aggregatedFeedbackSchema.optional(),
  editorPass: editorPassSchema.optional(),
  userEdit: userEditSchema.optional(),
  status: z.string(),
  statusHistory: z.array(statusHistorySchema),
  metadata: metadataSchema,
  aiMeta: aiMetaSchema,
});

module.exports = {
  iterationStateSchema,
  focusGroupRatingSchema,
  aggregatedFeedbackSchema,
  editorPassSchema,
  userEditSchema,
  statusHistorySchema,
  metadataSchema,
  aiMetaSchema,
};
