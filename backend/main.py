from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
import logging
import asyncio
from datetime import datetime

from . import database as db
from . import ai_service
from . import orchestrator_service
from .models import (
    CreateContentRequest, 
    CreatePersonaRequest, 
    IterationState, 
    Persona,
    ParticipantType
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Virtuous Content Cycle API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB schema on startup
@app.on_event("startup")
async def startup_event():
    db.initialize_schema()
    # Seed personas if empty (migration logic)
    existing = db.get_all_personas()
    if not existing:
        # Load from json file if needed, or just skip for now as we expect existing DB
        pass

@app.get("/health")
def health_check():
    return {"status": "healthy"}

# --- Content Routes ---

@app.get("/api/content", response_model=List[Dict[str, Any]])
def list_content():
    items = db.get_all_content_items()
    # Enrich with latest cycle info
    results = []
    for item in items:
        latest_cycle_num = db.get_latest_cycle_number(item['id'])
        latest_cycle = db.get_cycle_by_content_and_number(item['id'], latest_cycle_num)
        
        results.append({
            **item,
            "latestCycle": latest_cycle_num,
            "status": latest_cycle['status'] if latest_cycle else "new",
            "averageRating": latest_cycle['averageRating'] if latest_cycle else None,
            "updatedAt": latest_cycle['updatedAt'] if latest_cycle else item['updatedAt']
        })
    return results

@app.post("/api/content/create", response_model=IterationState)
def create_content(request: CreateContentRequest):
    content_id = str(uuid.uuid4())
    
    # Create ContentItem
    content_data = {
        "id": content_id,
        "originalInput": request.originalInput,
        "metadata": request.metadata.dict()
    }
    db.create_content_item(content_data)
    
    # Create Cycle 1
    cycle_data = {
        "contentId": content_id,
        "cycleNumber": 1,
        "currentVersion": request.originalInput,
        "status": "draft",
        "aiMode": ai_service.get_ai_service_mode()
    }
    db.create_cycle(cycle_data)
    
    return db.get_iteration_state(content_id, 1)

@app.get("/api/content/{content_id}", response_model=IterationState)
def get_content(content_id: str):
    latest_cycle = db.get_latest_cycle_number(content_id)
    if latest_cycle == 0:
        raise HTTPException(status_code=404, detail="Content not found")
    return db.get_iteration_state(content_id, latest_cycle)

# --- Workflow Routes ---

@app.post("/api/content/{content_id}/run-focus-group")
async def run_focus_group(content_id: str):
    latest_cycle_num = db.get_latest_cycle_number(content_id)
    state = db.get_iteration_state(content_id, latest_cycle_num)
    
    if not state:
        raise HTTPException(status_code=404, detail="Content not found")
        
    # Update status
    db.update_cycle_status(state['cycle']['id'], "focus-group-running")
    
    try:
        # Run Focus Group
        result = await ai_service.get_focus_group_feedback(
            state['currentVersion'],
            state['metadata']['focusGroupConfig'],
            state['metadata']['targetAudience']
        )
        
        # Save Feedback
        cycle_id = state['cycle']['id']
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
            
            # Update cycle costs
            db.update_cycle_costs(
                cycle_id, 
                fb['usage']['promptTokens'], 
                fb['usage']['completionTokens'], 
                fb['usage']['cost']
            )
            
        # Aggregate Feedback
        all_feedback = db.get_all_feedback_for_cycle(cycle_id)
        aggregated = ai_service.aggregate_feedback(all_feedback)
        db.update_cycle_with_aggregated_feedback(cycle_id, aggregated)
        
        # Run Debate/Synthesis
        synthesis = await ai_service.run_feedback_debate(all_feedback)
        # We store synthesis in the cycle (using moderator fields temporarily or update schema)
        # For now, we'll just update status
        
        db.update_cycle_status(cycle_id, "focus-group-complete")
        
        return db.get_iteration_state(content_id, latest_cycle_num)
        
    except Exception as e:
        logger.error(f"Error in focus group: {e}")
        db.update_cycle_status(state['cycle']['id'], "error")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/content/{content_id}/run-editor")
async def run_editor(content_id: str, request: Dict[str, Any]):
    latest_cycle_num = db.get_latest_cycle_number(content_id)
    state = db.get_iteration_state(content_id, latest_cycle_num)
    
    if not state:
        raise HTTPException(status_code=404, detail="Content not found")
        
    db.update_cycle_status(state['cycle']['id'], "editor-running")
    
    try:
        # Get Synthesis first if not present (or re-run)
        # In Node version, synthesis happens in runFeedbackDebate which is called in focus group
        # Here we assume aggregated feedback exists
        
        # Run Editor
        revision = await ai_service.get_editor_revision(
            state['currentVersion'],
            state['aggregatedFeedback'],
            None, # selected feedback
            request.get('instructions', ''),
            None # moderator summary
        )
        
        db.update_cycle_with_editor_pass(state['cycle']['id'], revision)
        db.update_cycle_costs(
            state['cycle']['id'],
            revision['usage']['promptTokens'],
            revision['usage']['completionTokens'],
            revision['usage']['totalCost']
        )
        
        db.update_cycle_status(state['cycle']['id'], "editor-complete")
        
        return db.get_iteration_state(content_id, latest_cycle_num)
        
    except Exception as e:
        logger.error(f"Error in editor: {e}")
        db.update_cycle_status(state['cycle']['id'], "error")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/content/{content_id}/user-review")
def user_review(content_id: str, request: Dict[str, Any]):
    latest_cycle_num = db.get_latest_cycle_number(content_id)
    state = db.get_iteration_state(content_id, latest_cycle_num)
    
    if not state:
        raise HTTPException(status_code=404, detail="Content not found")
        
    db.update_cycle_with_user_review(state['cycle']['id'], {
        "approved": request['approved'],
        "userEdits": request.get('userEdits'),
        "notes": request.get('notes', ''),
        "timestamp": datetime.utcnow().isoformat()
    })
    
    if request['approved']:
        db.update_cycle_status(state['cycle']['id'], "approved")
        
        # Create next cycle if requested
        if request.get('createNextCycle'):
            next_version = request.get('userEdits') or state['editorPass']['revisedContent']
            db.create_cycle({
                "contentId": content_id,
                "cycleNumber": latest_cycle_num + 1,
                "currentVersion": next_version,
                "status": "draft",
                "aiMode": ai_service.get_ai_service_mode()
            })
    else:
        db.update_cycle_status(state['cycle']['id'], "rejected")
        
    return db.get_iteration_state(content_id, latest_cycle_num)

# --- Persona Routes ---

@app.get("/api/personas", response_model=List[Persona])
def list_personas():
    return db.get_all_personas()

@app.post("/api/personas", response_model=Persona)
def create_persona(request: CreatePersonaRequest):
    persona_id = str(uuid.uuid4())
    data = request.dict()
    data['id'] = persona_id
    return db.create_persona(data)

@app.put("/api/personas/{id}", response_model=Persona)
def update_persona(id: str, request: CreatePersonaRequest):
    return db.update_persona(id, request.dict())

@app.delete("/api/personas/{id}")
def delete_persona(id: str):
    db.delete_persona(id)
    return {"success": True}

# --- Orchestrator Routes ---

class OrchestratorRequest(BaseModel):
    contentId: str
    targetRating: float
    maxCycles: int
    personaIds: Optional[List[str]] = []
    editorInstructions: Optional[str] = ""

@app.post("/api/orchestrate/run")
async def run_orchestrator(request: OrchestratorRequest, background_tasks: BackgroundTasks):
    # Run in background to not block
    # Actually, for V1 we might want to await it if the UI expects it.
    # The UI polls or waits? The UI in script.js awaits the fetch.
    # So we should await it here.
    
    try:
        result = await orchestrator_service.run_orchestration(
            request.contentId,
            request.targetRating,
            request.maxCycles,
            request.personaIds,
            request.editorInstructions
        )
        return result
    except Exception as e:
        logger.error(f"Orchestrator error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Helpers ---

# Add missing methods to ai_service wrapper if needed or import directly
# For now assuming ai_service has these methods matching the calls above
