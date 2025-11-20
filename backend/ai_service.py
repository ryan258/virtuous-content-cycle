import os
import json
import logging
from typing import List, Dict, Any, Optional
from openai import OpenAI
from dotenv import load_dotenv
from .models import ParticipantType, FocusGroupRating, FeedbackTheme, Sentiment

load_dotenv()

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# Configuration
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:3000")
APP_NAME = os.getenv("APP_NAME", "Virtuous Content Cycle")

# Models
FOCUS_MODEL = os.getenv("OPENROUTER_FOCUS_MODEL", "openrouter/sherlock-think-alpha")
EDITOR_MODEL = os.getenv("OPENROUTER_EDITOR_MODEL", "openrouter/sherlock-think-alpha")

# Mock Mode
USE_MOCK_AI = os.getenv("USE_MOCK_AI", "false").lower() == "true"

client = OpenAI(
    base_url=OPENROUTER_BASE_URL,
    api_key=OPENROUTER_API_KEY,
    default_headers={
        "HTTP-Referer": APP_BASE_URL,
        "X-Title": APP_NAME,
    },
)

COST_PER_1K_TOKENS = 0.002  # Approximate cost for estimation

async def get_feedback_from_persona(
    content: str,
    persona: Dict[str, Any],
    target_audience: str
) -> Dict[str, Any]:
    if USE_MOCK_AI:
        return _get_mock_feedback(persona)

    system_prompt = f"""
    {persona['systemPrompt']}

    You are participating in a focus group to evaluate content for a specific target audience: "{target_audience}".
    Your goal is to provide honest, constructive feedback based on your persona.
    
    Output your response in valid JSON format with the following structure:
    {{
      "rating": <number 1-10>,
      "likes": [<string>, <string>],
      "dislikes": [<string>, <string>],
      "suggestions": <string>,
      "fullResponse": <string>
    }}
    """

    try:
        response = client.chat.completions.create(
            model=FOCUS_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Please evaluate this content:\n\n{content}"}
            ],
            response_format={"type": "json_object"}
        )
        
        content_str = response.choices[0].message.content
        result = json.loads(content_str)
        
        # Add cost info
        usage = response.usage
        cost = ((usage.prompt_tokens + usage.completion_tokens) / 1000) * COST_PER_1K_TOKENS
        
        return {
            "feedback": result,
            "usage": {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "cost": cost
            }
        }
    except Exception as e:
        logger.error(f"Error getting feedback from persona {persona['name']}: {e}")
        raise

async def synthesize_feedback(
    content: str,
    feedbacks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    if USE_MOCK_AI:
        return _get_mock_synthesis()

    feedback_text = "\n\n".join([
        f"Participant ({f['participantType']}): Rating {f['rating']}/10\n"
        f"Likes: {', '.join(f['likes'])}\n"
        f"Dislikes: {', '.join(f['dislikes'])}\n"
        f"Suggestions: {f['suggestions']}"
        for f in feedbacks
    ])

    system_prompt = """
    You are an expert Content Moderator. Your goal is to synthesize feedback from a focus group into actionable insights for an editor.
    Identify patterns, key disagreements, and the most critical areas for improvement.
    
    Output JSON:
    {
      "summary": <string>,
      "keyPoints": [<string>, <string>],
      "patterns": <string>,
      "feedbackThemes": [
        {"theme": <string>, "frequency": <number>, "sentiment": "positive" | "negative" | "neutral"}
      ]
    }
    """

    try:
        response = client.chat.completions.create(
            model=FOCUS_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Content:\n{content}\n\nFeedback:\n{feedback_text}"}
            ],
            response_format={"type": "json_object"}
        )
        
        content_str = response.choices[0].message.content
        result = json.loads(content_str)
        
        usage = response.usage
        cost = ((usage.prompt_tokens + usage.completion_tokens) / 1000) * COST_PER_1K_TOKENS
        
        return {
            "synthesis": result,
            "usage": {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "cost": cost
            },
            "model": FOCUS_MODEL
        }
    except Exception as e:
        logger.error(f"Error synthesizing feedback: {e}")
        raise

async def edit_content(
    original_content: str,
    moderator_summary: Dict[str, Any],
    instructions: Optional[str] = None
) -> Dict[str, Any]:
    if USE_MOCK_AI:
        return _get_mock_edit(original_content)

    system_prompt = """
    You are an expert Content Editor. Your goal is to rewrite content based on feedback synthesis and specific instructions.
    Improve the content while maintaining the original intent.
    
    Output JSON:
    {
      "revisedContent": <string>,
      "changesSummary": <string>,
      "reasoning": <string>
    }
    """

    user_prompt = f"""
    Original Content:
    {original_content}
    
    Moderator Summary:
    {moderator_summary['summary']}
    
    Key Points to Address:
    {json.dumps(moderator_summary['keyPoints'])}
    """

    if instructions:
        user_prompt += f"\n\nAdditional Instructions:\n{instructions}"

    try:
        response = client.chat.completions.create(
            model=EDITOR_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        content_str = response.choices[0].message.content
        result = json.loads(content_str)
        
        usage = response.usage
        cost = ((usage.prompt_tokens + usage.completion_tokens) / 1000) * COST_PER_1K_TOKENS
        
        return {
            "edit": result,
            "usage": {
                "prompt_tokens": usage.prompt_tokens,
                "completion_tokens": usage.completion_tokens,
                "cost": cost
            },
            "model": EDITOR_MODEL
        }
    except Exception as e:
        logger.error(f"Error editing content: {e}")
        raise

# --- Mock Helpers ---

def _get_mock_feedback(persona):
    return {
        "feedback": {
            "rating": 8,
            "likes": ["Good tone", "Clear message"],
            "dislikes": ["Too long"],
            "suggestions": "Shorten it.",
            "fullResponse": "I liked it but it was too long."
        },
        "usage": {"prompt_tokens": 100, "completion_tokens": 50, "cost": 0}
    }

def _get_mock_synthesis():
    return {
        "synthesis": {
            "summary": "Participants liked the tone but found it too long.",
            "keyPoints": ["Shorten the content", "Keep the tone"],
            "patterns": "Consistent feedback on length.",
            "feedbackThemes": [
                {"theme": "Length", "frequency": 3, "sentiment": "negative"}
            ]
        },
        "usage": {"prompt_tokens": 100, "completion_tokens": 50, "cost": 0},
        "model": "mock-model"
    }

def _get_mock_edit(content):
    return {
        "edit": {
            "revisedContent": f"Revised: {content}",
            "changesSummary": "Shortened the content.",
            "reasoning": "Addressed feedback on length."
        },
        "usage": {"prompt_tokens": 100, "completion_tokens": 50, "cost": 0},
        "model": "mock-model"
    }
