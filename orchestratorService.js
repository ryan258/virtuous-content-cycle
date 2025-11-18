const databaseService = require('./databaseService');
const aiService = require('./aiService');
const { BadRequestError, NotFoundError } = require('./errors');

/**
 * Runs automated refinement until targetRating or maxCycles reached.
 * Returns { logs, finalState }
 */
const runOrchestration = async ({ contentId, targetRating, maxCycles, personaIds = [], editorInstructions = '' }) => {
  const logs = [];

  if (!contentId) throw new BadRequestError('contentId is required');
  if (!targetRating || targetRating <= 0 || targetRating > 10) throw new BadRequestError('targetRating must be between 0 and 10');
  if (!maxCycles || maxCycles <= 0 || maxCycles > 10) throw new BadRequestError('maxCycles must be between 1 and 10');
  if (editorInstructions && editorInstructions.length > 1000) throw new BadRequestError('editorInstructions cannot exceed 1000 characters');

  const contentItem = databaseService.getContentItem(contentId);
  if (!contentItem) throw new NotFoundError(`Content with id ${contentId} not found`);

  let currentCycleNumber = databaseService.getLatestCycleNumber(contentId);
  if (currentCycleNumber === 0) throw new NotFoundError(`No cycles found for content ${contentId}`);

  let achieved = false;
  let latestState = null;

  while (currentCycleNumber <= maxCycles) {
    const cycle = databaseService.getCycleByContentAndNumber(contentId, currentCycleNumber);
    if (!cycle) throw new NotFoundError(`Cycle ${currentCycleNumber} not found for content ${contentId}`);

    // Focus group if needed
    if (cycle.status === 'awaiting_focus_group' || cycle.status === 'created') {
      const focusGroupConfig = {
        targetMarketCount: contentItem.targetMarketCount ?? 3,
        randomCount: contentItem.randomCount ?? 2,
        personaIds: Array.isArray(personaIds) && personaIds.length > 0
          ? personaIds
          : (contentItem.personaIds ? JSON.parse(contentItem.personaIds) : [])
      };

      const { feedback: focusGroupRatings, mode: aiMode, lastError: aiError, focusModel } =
        await aiService.getFocusGroupFeedback(cycle.currentVersion, focusGroupConfig);
      const aggregatedFeedback = aiService.aggregateFeedback(focusGroupRatings);

      const saveFocusGroupResults = databaseService.db.transaction(() => {
        databaseService.db.prepare('DELETE FROM Feedback WHERE cycleId = ?').run(cycle.id);
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

        databaseService.updateCycleWithAggregatedFeedback(cycle.id, aggregatedFeedback);

        const totalPrompt = focusGroupRatings.reduce((sum, f) => sum + (f.usage?.promptTokens || 0), 0);
        const totalCompletion = focusGroupRatings.reduce((sum, f) => sum + (f.usage?.completionTokens || 0), 0);
        const totalCost = focusGroupRatings.reduce((sum, f) => sum + (f.usage?.totalCost || 0), 0);
        databaseService.updateCycleCosts(cycle.id, totalPrompt, totalCompletion, totalCost);

        const now = new Date().toISOString();
        databaseService.db.prepare(`
          UPDATE Cycles SET
            aiMode = ?,
            focusModel = ?,
            lastError = ?,
            updatedAt = ?
          WHERE id = ?
        `).run(aiMode || aiService.getAiMode(), focusModel || null, aiError || null, now, cycle.id);

        databaseService.updateCycleStatus(cycle.id, 'focus_group_complete');
      });
      saveFocusGroupResults();
      logs.push(`Cycle ${currentCycleNumber}: focus group complete. Avg rating ${aggregatedFeedback.averageRating.toFixed(2)}.`);

      if (aggregatedFeedback.averageRating >= targetRating) {
        logs.push(`🎯 Target rating ${targetRating} achieved after focus group.`);
        achieved = true;
        latestState = databaseService.getIterationState(contentId, currentCycleNumber);
        break;
      }
    }

    if (currentCycleNumber >= maxCycles) {
      latestState = databaseService.getIterationState(contentId, currentCycleNumber);
      break;
    }

    // Editor pass driven by moderator summary
    const feedbacks = databaseService.getAllFeedbackForCycle(cycle.id) || [];
    const moderatorSummary = await aiService.runFeedbackDebate(feedbacks);
    const editorPass = await aiService.getEditorRevision(
      (latestState || databaseService.getIterationState(contentId, currentCycleNumber)).currentVersion,
      (latestState || databaseService.getIterationState(contentId, currentCycleNumber)).aggregatedFeedback,
      feedbacks,
      editorInstructions,
      moderatorSummary
    );

    const saveEditorResults = databaseService.db.transaction(() => {
      databaseService.updateCycleWithEditorPass(cycle.id, editorPass);

      if (moderatorSummary?.usage) {
        databaseService.updateCycleCosts(
          cycle.id,
          moderatorSummary.usage.promptTokens || 0,
          moderatorSummary.usage.completionTokens || 0,
          moderatorSummary.usage.totalCost || 0
        );
      }

      if (editorPass.usage) {
        databaseService.updateCycleCosts(
          cycle.id,
          editorPass.usage.promptTokens,
          editorPass.usage.completionTokens,
          editorPass.usage.totalCost
        );
      }

      databaseService.db.prepare('UPDATE Cycles SET currentVersion = ?, updatedAt = ? WHERE id = ?')
        .run(editorPass.revisedContent, new Date().toISOString(), cycle.id);

      databaseService.updateCycleStatus(cycle.id, 'editor_complete');
    });
    saveEditorResults();
    logs.push(`Cycle ${currentCycleNumber}: editor complete.`);

    currentCycleNumber += 1;

    if (currentCycleNumber <= maxCycles) {
      databaseService.createCycle({
        contentId,
        cycleNumber: currentCycleNumber,
        currentVersion: editorPass.revisedContent,
        status: 'awaiting_focus_group',
        aiMode: aiService.getAiMode(),
        focusModel: aiService.getModels().focusModel,
        editorModel: aiService.getModels().editorModel
      });
    }
  }

  const finalState = databaseService.getIterationState(contentId, currentCycleNumber);
  return { logs, achieved, finalState };
};

module.exports = {
  runOrchestration
};
