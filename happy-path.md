# Happy Path: Using the Virtuous Content Cycle

This document outlines the "happy path" workflows for using VCC 2.0 - both via the Web UI and the API.

## Prerequisites

- The server is running (`npm run dev`).
- The database is initialized (`node migrate.js`).
- For API usage: You have a tool like `curl` or Postman to make API requests.
- For live AI: The environment variable `OPENROUTER_API_KEY` is set (optional for mock mode).

## Web UI Workflow

The easiest way to use the system is through the web interface at `http://localhost:3000`.

The UI has three tabs: **Content**, **Personas**, and **Orchestrator**. It also features a **History Sidebar** on the left for easy access to past projects.

### Manual Workflow (Content Tab)

1. **Manage Personas (Optional - Personas Tab)**
   - Navigate to the **Personas** tab
   - View the 5 default personas (seeded on first run)
   - Optionally create custom personas:
     - Enter persona name (e.g., "The Patient")
     - Select type: Target Market or Random
     - Write short description
     - Configure system prompt
     - Click **Save Persona**
   - Edit or delete existing personas as needed

2. **Create Content (Content Tab)**
   - Navigate to the **Content** tab
   - Enter your initial content in the text area
   - Specify content type (e.g., "blog post", "product description")
   - Specify target audience (e.g., "tech professionals", "ecommerce shoppers")
   - **Select personas** from the checkbox list (all selected by default)
   - Click **Create**
   - The focus group will automatically run (30-60 seconds)

3. **Review Focus Group Feedback**
   - View aggregated feedback summary in the Actions panel:
     - Average rating (X/10)
     - **Convergence score** (0-1, measures agreement)
     - Top likes/dislikes
   - Review detailed feedback from each participant in the right panel:
     - Rating (1-10)
     - Likes
     - Dislikes
     - Suggestions
   - Use checkboxes to select which feedback to incorporate
   - Use "Select All" / "Deselect All" buttons for quick selection

4. **Run Editor**
   - **(Optional)** Enter custom editor instructions (e.g., "Focus on tone, ignore length")
   - Ensure at least one feedback checkbox is selected
   - Click **Run Editor**
   - The moderator synthesizes feedback into key insights
   - The AI editor revises content based on moderator summary and selected feedback
   - Review:
     - **Moderator's Summary** with synthesized key points
     - **Diff viewer** showing changes
     - **Running cost** (if configured)

5. **User Review**
   - Review the editor's changes in the diff viewer
   - Optionally make manual edits in the text area
   - Add notes if desired
   - Choose:
     - **Approve & Continue**: Start next cycle
     - **Approve & Stop**: Finalize this version
     - **Discard & Use Original**: Reject changes and revert

6. **Export**
   - Click **Export History as JSON** to download all cycles

### Autonomous Workflow (Orchestrator Tab)

1. **Set Up Orchestration**
   - Navigate to the **Orchestrator** tab
   - Enter the **Content ID** from a previously created content item
   - Set **Target Rating** (e.g., 8.5 out of 10)
   - Set **Max Cycles** (1-10, e.g., 3)
   - Select personas from the checkbox list
   - **(Optional)** Enter editor instructions

2. **Run Orchestration**
   - Click **Run Orchestration**
   - Watch the real-time log showing cycle-by-cycle progress
   - The orchestrator will:
     - Run focus groups
     - Check if target rating achieved (stops immediately if yes)
     - Run moderator synthesis
     - Run editor revision
     - Create next cycle
     - Repeat until target achieved or max cycles reached

3. **Review Results**
   - View final state in the Content tab
   - The orchestrator returns to Content tab with the final cycle loaded
   - Export history if desired

## API Workflow

### Manual Refinement (Step-by-Step)

1.  [Manage Personas](#1-manage-personas) (Optional)
2.  [Create Content](#2-create-content)
3.  [Run Focus Group](#3-run-focus-group)
4.  [Run Editor](#4-run-editor)
5.  [User Review](#5-user-review)
6.  [Get Content History](#6-get-content-history)
7.  [Export Content](#7-export-content)

### Autonomous Refinement

8.  [Run Orchestrator](#8-run-orchestrator-autonomous)

---

## 1. Manage Personas

Before creating content, you may want to view or create custom personas. By default, 5 personas are seeded when you run `node migrate.js`.

### List All Personas

**Request:**
```bash
curl http://localhost:3000/api/personas
```

**Response:**
```json
[
  {
    "id": "target_market_1",
    "name": "Tech Professional",
    "type": "target_market",
    "persona": "A senior developer interested in efficiency",
    "systemPrompt": "You are a senior developer...",
    "createdAt": "...",
    "updatedAt": "..."
  }
  // ... more personas
]
```

### Create a Custom Persona

**Request:**
```bash
curl -X POST http://localhost:3000/api/personas \
-H "Content-Type: application/json" \
-d '{
  "name": "The Patient",
  "type": "target_market",
  "persona": "Someone living with MS who is frustrated with condescending medical content",
  "systemPrompt": "You are someone living with MS. You value clear, respectful communication..."
}'
```

**Response:**
```json
{
  "id": "persona-<uuid>",
  "name": "The Patient",
  "type": "target_market",
  "persona": "Someone living with MS...",
  "systemPrompt": "You are someone living with MS...",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### Update a Persona

**Request:**
```bash
curl -X PUT http://localhost:3000/api/personas/persona-<uuid> \
-H "Content-Type: application/json" \
-d '{
  "name": "The Patient (Updated)",
  "type": "target_market",
  "persona": "Updated description",
  "systemPrompt": "Updated system prompt"
}'
```

### Delete a Persona

**Request:**
```bash
curl -X DELETE http://localhost:3000/api/personas/persona-<uuid>
```

**Note:** Deletion fails if the persona is in use by any content item.

---

## 2. Create Content

The first step is to create a new piece of content. This is done by sending a `POST` request to the `/api/content/create` endpoint with the initial content and some metadata.

You can optionally specify `personaIds` to pre-select which personas to use in focus groups.

**Request (with persona selection):**
```bash
curl -X POST http://localhost:3000/api/content/create \
-H "Content-Type: application/json" \
-d '{
  "originalInput": "This is the first draft of my new blog post about AI ethics.",
  "metadata": {
    "contentType": "blogpost",
    "targetAudience": "tech professionals",
    "costEstimate": 0,
    "maxCycles": 3,
    "convergenceThreshold": 0.8,
    "focusGroupConfig": {
      "personaIds": ["target_market_1", "target_market_2", "random_1"]
    }
  }
}'
```

**Request (with traditional counts - falls back if personas not found):**
```bash
curl -X POST http://localhost:3000/api/content/create \
-H "Content-Type: application/json" \
-d '{
  "originalInput": "This is the first draft of my new blog post about AI ethics.",
  "metadata": {
    "contentType": "blogpost",
    "targetAudience": "tech professionals",
    "costEstimate": 0,
    "maxCycles": 3,
    "convergenceThreshold": 0.8,
    "focusGroupConfig": {
      "targetMarketCount": 3,
      "randomCount": 2
    }
  }
}'
```

**Response:**

The API will respond with the initial state of the content, including a unique `id`. You will use this `id` in subsequent requests.

```json
{
  "id": "content-2025-11-17-...",
  "cycle": 1,
  "originalInput": "This is the first draft of my new blog post about AI ethics.",
  "currentVersion": "This is the first draft of my new blog post about AI ethics.",
  "focusGroupRatings": [],
  "status": "created",
  "statusHistory": [
    {
      "status": "created",
      "timestamp": "..."
    }
  ],
  "metadata": {
    "contentType": "blogpost",
    "targetAudience": "tech professionals",
    "costEstimate": 0,
    "maxCycles": 3,
    "convergenceThreshold": 0.8
  }
}
```

---

## 3. Run Focus Group

Next, run a simulated focus group to get feedback on the content. Send a `POST` request to the `/api/content/:id/run-focus-group` endpoint, replacing `:id` with the content ID from the previous step.

You can optionally override the stored `personaIds` with a new set for this specific focus group.

**Request (default):**
```bash
curl -X POST http://localhost:3000/api/content/content-2025-11-17-.../run-focus-group
```

**Request (with personaIds override):**
```bash
curl -X POST http://localhost:3000/api/content/content-2025-11-17-.../run-focus-group \
-H "Content-Type: application/json" \
-d '{
  "personaIds": ["target_market_1", "random_2"]
}'
```

**Response:**

The API will respond with the updated state, now including `focusGroupRatings` and `aggregatedFeedback` with convergence score.

```json
{
  "id": "content-2025-11-17-...",
  "cycle": 1,
  // ...
  "status": "focus_group_complete",
  "focusGroupRatings": [
    // ... array of individual ratings
  ],
  "aggregatedFeedback": {
    "averageRating": 7.5,
    "convergenceScore": 0.72,
    "topLikes": ["clarity", "structure"],
    "topDislikes": ["needs examples"],
    // ... other aggregated feedback
  }
}
```

---

## 4. Run Editor

With the focus group feedback, you can now ask the AI editor to revise the content. The moderator first synthesizes the feedback, then the editor revises based on the synthesis. Send a `POST` request to the `/api/content/:id/run-editor` endpoint.

You can optionally:
- Specify which participants' feedback to incorporate using `selectedParticipantIds`
- Provide custom editor instructions using `editorInstructions` (max 1000 chars)

**Request (all feedback):**
```bash
curl -X POST http://localhost:3000/api/content/content-2025-11-17-.../run-editor
```

**Request (selective feedback with editor instructions):**
```bash
curl -X POST http://localhost:3000/api/content/content-2025-11-17-.../run-editor \
-H "Content-Type: application/json" \
-d '{
  "selectedParticipantIds": ["target_market_1", "random_1"],
  "editorInstructions": "Focus on improving the tone. Ignore feedback about length."
}'
```

**Response:**

The API will respond with the updated state, including the `editorPass` with the revised content and moderator summary.

```json
{
  "id": "content-2025-11-17-...",
  "cycle": 1,
  // ...
  "status": "editor_complete",
  "currentVersion": "This is the revised draft of the blog post, addressing key feedback on AI ethics.",
  "editorPass": {
    "revisedContent": "This is the revised draft of the blog post, addressing key feedback on AI ethics.",
    "changesSummary": "...",
    "editorReasoning": "...",
    "moderator": {
      "summary": "The focus group agreed on clarity but disagreed on tone...",
      "keyPoints": ["Add specific examples", "Soften technical jargon", "Include ethical frameworks"],
      "patterns": "Target market wants more depth, random participants want accessibility",
      "modelUsed": "openrouter/sherlock-think-alpha",
      "timestamp": "..."
    }
  }
}
```

---

## 4. User Review

After the editor's revision, you can perform a user review. You can approve the changes, or provide your own edits. In this happy path example, we will approve the changes and continue to the next cycle.

**Request:**
```bash
curl -X POST http://localhost:3000/api/content/content-2025-11-17-.../user-review \
-H "Content-Type: application/json" \
-d '{
  "approved": true,
  "continueToNextCycle": true,
  "notes": "The editor did a great job. Let'\''s see if we can improve it further."
}'
```

**Response:**

The API will respond with the state for the *new* cycle (cycle 2).

```json
{
  "id": "content-2025-11-17-...",
  "cycle": 2,
  "status": "awaiting_focus_group",
  // ...
}
```
You can now repeat steps 2, 3, and 4 for the new cycle.

---

## 5. Get Content History

At any point, you can retrieve the full history of the content across all cycles. Send a `GET` request to the `/api/content/:id/history` endpoint.

**Request:**
```bash
curl http://localhost:3000/api/content/content-2025-11-17-.../history
```

**Response:**

The API will respond with an array of all cycle states.

```json
[
  {
    "id": "content-2025-11-17-...",
    "cycle": 1,
    // ... state for cycle 1
  },
  {
    "id": "content-2025-11-17-...",
    "cycle": 2,
    // ... state for cycle 2
  }
]
```

---

## 6. Export Content

Finally, you can export the content history as a JSON file. Send a `POST` request to the `/api/content/:id/export` endpoint.

**Request:**
```bash
curl -X POST http://localhost:3000/api/content/content-2025-11-17-.../export
```

**Response:**

The API will respond with a JSON file containing the history of the content.

You can also request a CSV export by adding `?format=csv` to the URL. Note that CSV export is not fully implemented yet.

---

## 8. Run Orchestrator (Autonomous)

For autonomous multi-cycle refinement, use the orchestrator endpoint. This replaces the manual loop of steps 3-5 with an automated process that runs until a target rating is achieved or max cycles is reached.

**Request:**
```bash
curl -X POST http://localhost:3000/api/orchestrate/run \
-H "Content-Type: application/json" \
-d '{
  "contentId": "content-2025-11-17-...",
  "targetRating": 8.5,
  "maxCycles": 3,
  "personaIds": ["target_market_1", "target_market_2", "random_1"],
  "editorInstructions": "Focus on making the content more accessible without losing technical accuracy."
}'
```

**Parameters:**
- `contentId` (required): The ID of existing content to orchestrate
- `targetRating` (required): Target average rating (0-10)
- `maxCycles` (required): Maximum cycles to run (1-10)
- `personaIds` (optional): Array of persona IDs to use (uses stored personaIds if omitted)
- `editorInstructions` (optional): Instructions for the editor (max 1000 chars)

**Response:**

The orchestrator returns logs of each cycle and the final state.

```json
{
  "logs": [
    "Cycle 1: focus group complete. Avg rating 7.20.",
    "Cycle 1: editor complete.",
    "Cycle 2: focus group complete. Avg rating 8.10.",
    "Cycle 2: editor complete.",
    "Cycle 3: focus group complete. Avg rating 8.60.",
    "🎯 Target rating 8.5 achieved after focus group."
  ],
  "achieved": true,
  "finalState": {
    "id": "content-2025-11-17-...",
    "cycle": 3,
    "status": "focus_group_complete",
    "currentVersion": "...",
    "aggregatedFeedback": {
      "averageRating": 8.6,
      "convergenceScore": 0.85,
      // ...
    },
    // ... full final state
  }
}
```

**How it works:**
1. Orchestrator loads the specified content item
2. For each cycle (up to maxCycles):
   - Runs focus group with specified personas
   - Checks if target rating achieved (stops immediately if yes)
   - Runs moderator synthesis on feedback
   - Runs editor with moderator summary and editor instructions
   - Creates next cycle (if continuing)
3. Returns logs and final state

**Smart Termination:**
- Stops immediately when target rating is met (no wasteful editor runs)
- Stops when maxCycles is reached
- All cycles, feedback, and costs are saved to database

---

## Summary

VCC 2.0 provides two workflows:

1. **Manual (Steps 2-7):** Step-by-step control over each phase with human review
2. **Autonomous (Step 8):** Set a target and let the orchestrator handle everything

Both workflows benefit from:
- Custom persona management
- Editor steering instructions
- Convergence metrics
- Cost tracking
- Moderator synthesis
- Full history persistence
