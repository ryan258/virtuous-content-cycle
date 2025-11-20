from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum

class ParticipantType(str, Enum):
    target_market = 'target_market'
    random = 'random'

class Sentiment(str, Enum):
    positive = 'positive'
    negative = 'negative'
    neutral = 'neutral'

class AIMode(str, Enum):
    live = 'live'
    mock = 'mock'
    live_fallback = 'live-fallback'

class FocusGroupRating(BaseModel):
    participantId: str
    participantType: ParticipantType
    rating: float = Field(..., ge=1, le=10)
    likes: List[str]
    dislikes: List[str]
    suggestions: str
    fullResponse: str
    timestamp: datetime

class FeedbackTheme(BaseModel):
    theme: str
    frequency: int
    sentiment: Sentiment

class AggregatedFeedback(BaseModel):
    averageRating: float
    ratingDistribution: Dict[str, int]
    topLikes: List[str]
    topDislikes: List[str]
    convergenceScore: float = Field(..., ge=0, le=1)
    feedbackThemes: List[FeedbackTheme]

class ModeratorSummary(BaseModel):
    summary: str
    keyPoints: List[str]
    modelUsed: Optional[str] = None
    timestamp: Optional[datetime] = None
    patterns: Optional[str] = None

class EditorPass(BaseModel):
    revisedContent: str
    changesSummary: str
    editorReasoning: str
    timestamp: datetime
    modelUsed: str
    moderator: Optional[ModeratorSummary] = None

class UserEdit(BaseModel):
    approved: bool
    userEdits: Optional[str] = None
    notes: str
    timestamp: datetime

class StatusHistoryItem(BaseModel):
    status: str
    timestamp: datetime

class FocusGroupConfig(BaseModel):
    targetMarketCount: int = Field(3, ge=1, le=10)
    randomCount: int = Field(2, ge=0, le=10)
    personaIds: Optional[List[str]] = None

class Metadata(BaseModel):
    contentType: str
    targetAudience: str
    costEstimate: float = Field(0, ge=0)
    maxCycles: int
    convergenceThreshold: float = Field(..., ge=0, le=1)
    focusGroupConfig: Optional[FocusGroupConfig] = None
    totalCost: float = 0

class AIMeta(BaseModel):
    mode: AIMode
    focusModel: Optional[str] = None
    editorModel: Optional[str] = None
    lastError: Optional[str] = None

class IterationState(BaseModel):
    id: str
    cycle: int
    originalInput: str
    currentVersion: str
    focusGroupRatings: List[FocusGroupRating]
    aggregatedFeedback: Optional[AggregatedFeedback] = None
    editorPass: Optional[EditorPass] = None
    userEdit: Optional[UserEdit] = None
    status: str
    statusHistory: List[StatusHistoryItem]
    metadata: Metadata
    aiMeta: Optional[AIMeta] = None

class CreateContentRequest(BaseModel):
    originalInput: str
    metadata: Metadata

class Persona(BaseModel):
    id: str
    name: str
    type: ParticipantType
    persona: str
    systemPrompt: str
    createdAt: datetime
    updatedAt: datetime

class CreatePersonaRequest(BaseModel):
    name: str
    type: ParticipantType
    persona: str
    systemPrompt: str
