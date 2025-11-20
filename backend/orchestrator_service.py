import logging
import asyncio
from typing import List, Dict, Any, Optional
from . import database as db
from . import ai_service

logger = logging.getLogger(__name__)

async def run_orchestration(
    content_id: str,
    target_rating: float,
    max_cycles: int,
    persona_ids: List[str],
    editor_instructions: str
) -> Dict[str, Any]:
    
    logger.info(f"Starting orchestration for content {content_id}")
    
    # Get current state
    latest_cycle_num = db.get_latest_cycle_number(content_id)
    state = db.get_iteration_state(content_id, latest_cycle_num)
    
    if not state:
        raise ValueError(f"Content {content_id} not found")
        
    # If current cycle is complete/approved/rejected, start a new one
    if state['status'] in ['approved', 'rejected', 'user_review_complete']:
        if latest_cycle_num >= max_cycles:
             return {
                "status": "stopped",
                "reason": "max_cycles_reached",
                "finalRating": state['aggregatedFeedback']['averageRating'] if state['aggregatedFeedback'] else 0,
                "achieved": False
            }
            
        # Create next cycle
        new_cycle_num = latest_cycle_num + 1
        current_version = state['editorPass']['revisedContent'] if state['editorPass'] else state['currentVersion']
        
        db.create_cycle({
            "contentId": content_id,
            "cycleNumber": new_cycle_num,
            "currentVersion": current_version,
            "status": "draft",
            "aiMode": ai_service.get_ai_service_mode()
        })
        
        # Refresh state
        latest_cycle_num = new_cycle_num
        state = db.get_iteration_state(content_id, latest_cycle_num)

    current_cycle_num = latest_cycle_num
    
    while current_cycle_num <= max_cycles:
        logger.info(f"Orchestrator: Processing Cycle {current_cycle_num}")
        
        # 1. Run Focus Group (if needed)
        if state['status'] in ['draft', 'created', 'awaiting_focus_group']:
            # Update status
            db.update_cycle_status(state['cycle']['id'], "focus-group-running")
            
            # Config
            focus_group_config = state['metadata']['focusGroupConfig']
            if persona_ids:
                focus_group_config['personaIds'] = persona_ids
                
            # Run AI
            result = await ai_service.get_focus_group_feedback(
                state['currentVersion'],
                focus_group_config,
                state['metadata']['targetAudience']
            )
            
            # Save Feedback
            cycle_id = state['cycle']['id']
            # Clear existing
            db.get_db_connection().execute('DELETE FROM Feedback WHERE cycleId = ?', (cycle_id,)).close()
            
            for fb in result['feedback']:
                db.create_feedback({
                    "cycleId": cycle_id,
                    "participantId": fb['participantId'],
                    "participantType": fb['participantType'],
                    "rating": fb['rating'],
                    "likes": fb['likes'],
                    "dislikes": fb['dislikes'],
                    "suggestions": fb['suggestions'],
                    "fullResponse": fb['fullResponse'],
                    "promptTokens": fb['usage']['promptTokens'],
                    "completionTokens": fb['usage']['completionTokens'],
                    "cost": fb['usage']['cost'],
                    "timestamp": fb['timestamp']
                })
                
                db.update_cycle_costs(
                    cycle_id, 
                    fb['usage']['promptTokens'], 
                    fb['usage']['completionTokens'], 
                    fb['usage']['cost']
                )
                
            # Aggregate
            all_feedback = db.get_all_feedback_for_cycle(cycle_id)
            aggregated = ai_service.aggregate_feedback(all_feedback)
            db.update_cycle_with_aggregated_feedback(cycle_id, aggregated)
            
            # Debate (Optional but good for editor)
            # We skip explicit debate step here to save time/tokens if not strictly needed for dashboard
            # But editor needs it. Let's run it.
            # synthesis = await ai_service.run_feedback_debate(all_feedback)
            
            db.update_cycle_status(cycle_id, "focus_group_complete")
            
            # Check target rating
            if aggregated['averageRating'] >= target_rating:
                logger.info(f"Target rating achieved: {aggregated['averageRating']}")
                return {
                    "status": "success",
                    "reason": "target_rating_met",
                    "finalRating": aggregated['averageRating'],
                    "achieved": True,
                    "cycle": current_cycle_num
                }
                
            # Refresh state
            state = db.get_iteration_state(content_id, current_cycle_num)

        # 2. Run Editor (if needed)
        if state['status'] == 'focus_group_complete':
            db.update_cycle_status(state['cycle']['id'], "editor-running")
            
            # Run Editor
            # We need synthesis for editor
            all_feedback = db.get_all_feedback_for_cycle(state['cycle']['id'])
            moderator_summary = await ai_service.run_feedback_debate(all_feedback)
            
            revision = await ai_service.get_editor_revision(
                state['currentVersion'],
                state['aggregatedFeedback'],
                None,
                editor_instructions,
                moderator_summary
            )
            
            db.update_cycle_with_editor_pass(state['cycle']['id'], revision)
            db.update_cycle_costs(
                state['cycle']['id'],
                revision['usage']['promptTokens'],
                revision['usage']['completionTokens'],
                revision['usage']['totalCost']
            )
            
            # Update current version for this cycle (it becomes the output of this cycle)
            # Wait, usually currentVersion is input. 
            # In V1: currentVersion updated after editor pass? 
            # Let's check server.js: updateCycleWithEditorPass updates editorRevisedContent.
            # Then user review updates currentVersion.
            # But for autonomous loop, we need to promote it.
            
            db.update_cycle_status(state['cycle']['id'], "editor_complete")
            
            # Refresh state
            state = db.get_iteration_state(content_id, current_cycle_num)
            
        # 3. Prepare Next Cycle
        if state['status'] == 'editor_complete':
            if current_cycle_num >= max_cycles:
                 return {
                    "status": "stopped",
                    "reason": "max_cycles_reached",
                    "finalRating": state['aggregatedFeedback']['averageRating'],
                    "achieved": False
                }
            
            # Create next cycle
            new_cycle_num = current_cycle_num + 1
            next_version = state['editorPass']['revisedContent']
            
            db.create_cycle({
                "contentId": content_id,
                "cycleNumber": new_cycle_num,
                "currentVersion": next_version,
                "status": "draft",
                "aiMode": ai_service.get_ai_service_mode()
            })
            
            current_cycle_num = new_cycle_num
            state = db.get_iteration_state(content_id, current_cycle_num)
            
            # Loop continues...
            
    return {
        "status": "stopped",
        "reason": "max_cycles_reached",
        "finalRating": state['aggregatedFeedback']['averageRating'] if state and state.get('aggregatedFeedback') else 0,
        "achieved": False
    }
