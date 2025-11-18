const aiService = require('../aiService');

describe('AI Service', () => {
  describe('aggregateFeedback', () => {
    test('should correctly aggregate feedback ratings', () => {
      const mockFeedback = [
        { rating: 8, likes: ['clarity', 'tone'], dislikes: ['length'] },
        { rating: 7, likes: ['clarity', 'structure'], dislikes: ['examples'] },
        { rating: 9, likes: ['tone'], dislikes: [] },
      ];

      const result = aiService.aggregateFeedback(mockFeedback);

      expect(result.averageRating).toBeCloseTo(8.0);
      expect(result.topLikes).toContain('clarity');
      expect(result.topDislikes.length).toBeGreaterThan(0);
      expect(result.convergenceScore).toBeGreaterThan(0);
    });

    test('should handle empty feedback array', () => {
      const result = aiService.aggregateFeedback([]);
      expect(result.averageRating).toBe(0);
      expect(result.topLikes).toEqual([]);
    });
  });

  describe('getAiMode', () => {
    test('should return the current AI mode', () => {
      const mode = aiService.getAiMode();
      expect(['mock', 'live']).toContain(mode);
    });
  });

  describe('getModels', () => {
    test('should return focus and editor models', () => {
      const models = aiService.getModels();
      expect(models).toHaveProperty('focusModel');
      expect(models).toHaveProperty('editorModel');
    });
  });
});
