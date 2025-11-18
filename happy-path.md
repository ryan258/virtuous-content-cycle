# Happy Path: Using the Virtuous Content Cycle

This document outlines the "happy path" workflows for using the Virtuous Content Cycle - both via the Web UI and the API.

## Prerequisites

- The server is running (`npm run dev`).
- For API usage: You have a tool like `curl` or Postman to make API requests.
- For live AI: The environment variable `OPENROUTER_API_KEY` is set (optional for mock mode).

## Web UI Workflow

The easiest way to use the system is through the web interface at `http://localhost:3000`.

### Steps:

1. **Create Content**
   - Enter your initial content in the text area
   - Specify content type (e.g., "blog post", "product description")
   - Specify target audience (e.g., "tech professionals", "ecommerce shoppers")
   - Configure focus group size:
     - **Target Market Participants**: 1-10 (people matching your target audience)
     - **Random Participants**: 0-10 (diverse perspectives)
   - Click **Create**
   - The focus group will automatically run (30-60 seconds)

2. **Review Focus Group Feedback**
   - View aggregated feedback summary in the Actions panel
   - Review detailed feedback from each participant in the right panel
   - Each persona card shows:
     - Rating (1-10)
     - Likes
     - Dislikes
     - Suggestions
   - Use checkboxes to select which feedback to incorporate
   - Use "Select All" / "Deselect All" buttons for quick selection

3. **Run Editor**
   - Ensure at least one feedback checkbox is selected
   - Click **Run Editor**
   - The AI editor will revise the content based on selected feedback
   - Review the diff showing changes

4. **User Review**
   - Review the editor's changes in the diff viewer
   - Optionally make manual edits in the text area
   - Add notes if desired
   - Choose:
     - **Approve & Continue**: Start next cycle
     - **Approve & Stop**: Finalize this version
     - **Discard & Use Original**: Reject changes and revert

5. **Export**
   - Click **Export History as JSON** to download all cycles

## API Workflow

The workflow consists of the following steps:

1.  [Create Content](#1-create-content)
2.  [Run Focus Group](#2-run-focus-group)
3.  [Run Editor](#3-run-editor)
4.  [User Review](#4-user-review)
5.  [Get Content History](#5-get-content-history)
6.  [Export Content](#6-export-content)

---

## 1. Create Content

The first step is to create a new piece of content. This is done by sending a `POST` request to the `/api/content/create` endpoint with the initial content and some metadata.

**Request:**
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

## 2. Run Focus Group

Next, run a simulated focus group to get feedback on the content. Send a `POST` request to the `/api/content/:id/run-focus-group` endpoint, replacing `:id` with the content ID from the previous step.

**Request:**
```bash
curl -X POST http://localhost:3000/api/content/content-2025-11-17-.../run-focus-group
```

**Response:**

The API will respond with the updated state, now including `focusGroupRatings` and `aggregatedFeedback`.

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
    // ... other aggregated feedback
  }
}
```

---

## 3. Run Editor

With the focus group feedback, you can now ask the AI editor to revise the content. Send a `POST` request to the `/api/content/:id/run-editor` endpoint.

You can optionally specify which participants' feedback to incorporate using `selectedParticipantIds`:

**Request (all feedback):**
```bash
curl -X POST http://localhost:3000/api/content/content-2025-11-17-.../run-editor
```

**Request (selective feedback):**
```bash
curl -X POST http://localhost:3000/api/content/content-2025-11-17-.../run-editor \
-H "Content-Type: application/json" \
-d '{
  "selectedParticipantIds": ["target_market_1_1", "random_1_1"]
}'
```

**Response:**

The API will respond with the updated state, including the `editorPass` with the revised content.

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
    "editorReasoning": "..."
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
