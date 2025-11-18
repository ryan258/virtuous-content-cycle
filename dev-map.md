# **PROJECT ROADMAP: Virtuous Content Cycle v2.0**

Project: "Virtuous Content Cycle" (VCC)  
Goal: Evolve the VCC from a single-run tool into a personalized, autonomous content refinement platform, specifically geared towards producing high-quality, specialized content (e.g., for ryanleej.com).  
**Current State (v1.0):**

* **Core Loop:** A functional single-user "happy path" \[cite: ryan258/virtuous-content-cycle/happy-path.md\] for Create \-\> Focus Group \-\> Edit \-\> Review.  
* **Persistence:** Uses the local filesystem (results/ directory) \[cite: ryan258/virtuous-content-cycle/fileService.js\].  
* **Personas:** Hardcoded in focusGroupPersonas.json \[cite: ryan258/virtuous-content-cycle/focusGroupPersonas.json\].  
* **Editor:** A single-step AI call with static instructions \[cite: ryan258/virtuous-content-cycle/aiService.js\].  
* **UI:** Functional vanilla JS dashboard \[cite: ryan258/virtuous-content-cycle/public/index.html\].

## **Phase 1: Foundation \- Database Migration & Hardening**

**Goal:** Replace the fragile filesystem persistence with a robust database. This is the **critical dependency** for all other features.

**Why:** We cannot build persona management, analytics, or an orchestrator on top of loose JSON files. This refactor unlocks the entire "platform" concept.

**Key Tasks:**

1. [x] **\[DB\] Choose & Integrate Database:**  
   * Add sqlite3 (or preferred DB) to package.json \[cite: ryan258/virtuous-content-cycle/package.json\].  
   * Create a databaseService.js to manage the connection and schema.  
2. [x] **\[DB\] Define Schema:**  
   * Create tables: ContentItems (stores id, originalInput, metadata), Cycles (stores contentId, cycleNumber, status, currentVersion, aggregatedFeedback, etc.), Personas (see Phase 2), and Feedback (stores individual persona feedback linked to a cycle).  
   * This will replace the all-in-one iterationStateSchema \[cite: ryan258/virtuous-content-cycle/models.js\] as the persistence model, though Zod should still be used for API validation.  
3. [x] **\[Refactor\] Update Services:**  
   * Completely refactor fileService.js \[cite: ryan258/virtuous-content-cycle/fileService.js\] to be databaseService.js.  
   * Update all controller functions in server.js (e.g., createContent, runFocusGroup, userReview) to query and write to the database instead of the filesystem \[cite: ryan258/virtuous-content-cycle/server.js\].  
4. [x] **\[Frontend\] Code Hardening:**  
   * **Fix XSS Vulnerability:** In public/script.js \[cite: ryan258/virtuous-content-cycle/public/script.js\], change all instances of .innerHTML that render user or AI content (like contentPreview) to use .textContent to prevent XSS.  
   * **Fix Hardcoded URL:** In public/script.js, change const API\_URL \= 'http://localhost:3000/api/content' to const API\_URL \= '/api/content' to make the app portable.

## **Phase 2: Persona Management UI ("Dream Team Launchpad")**

**Goal:** Empower the user to create, manage, and select their own "Dream Team" of AI personas.

**Why:** This personalizes the tool for specific domains (like MS content) and is the core of the "Launchpad" idea.

**Key Tasks:**

1. [x] **\[DB\] Personas Table:**
   * Ensure the Personas table from Phase 1 exists with fields like id, name (e.g., "The Patient"), type (e.g., "MS Content Council"), and systemPrompt.
2. [x] **\[Backend\] Persona API:**
   * Create new CRUD endpoints in server.js:
     * GET /api/personas (List all personas)
     * POST /api/personas (Create a new persona)
     * PUT /api/personas/:id (Update a persona)
     * DELETE /api/personas/:id (Delete a persona)
3. [x] **\[Backend\] Refactor Focus Group Logic:**
   * Modify POST /api/content/create \[cite: ryan258/virtuous-content-cycle/server.js\] to accept an array of personaIds instead of targetMarketCount and randomCount.
   * Refactor aiService.js \-\> getFocusGroupFeedback \[cite: ryan258/virtuous-content-cycle/aiService.js\] to:
     1. Accept an array of personaIds.
     2. Fetch those personas from the database (via databaseService.js).
     3. Run the focus group using the selected personas.
     4. The static focusGroupPersonas.json \[cite: ryan258/virtuous-content-cycle/focusGroupPersonas.json\] can now be used as a seeder for the database, but not read directly by the app.
4. [x] **\[Frontend\] "Persona Launchpad" UI:**
   * Create a new "Personas" tab/page in public/index.html \[cite: ryan258/virtuous-content-cycle/public/index.html\] with a form to manage (CRUD) personas.
   * In the "Create Content" UI, replace the number inputs \[cite: ryan258/virtuous-content-cycle/public/index.html\] with a dynamic checklist of available personas fetched from GET /api/personas.

## **Phase 3: Core Loop Enhancements ("Editor Steering" & Metrics)**

**Goal:** Give the user more granular control over the editor's actions and provide transparent metrics on performance and cost.

**Why:** This improves the *quality* and *trust* of each cycle, preventing wasted runs and surfacing the value of the tool.

**Key Tasks:**

1. [x] **\[Feature\] "Editor Steering" Instructions:**
   * **UI:** Add \<textarea id="editor-instructions" placeholder="Optional instructions for the editor... (e.g., 'Focus on the tone, ignore the length.')"\> to the "Actions" panel in public/index.html.
   * **Backend:** Update POST /.../run-editor in server.js \[cite: ryan258/virtuous-content-cycle/server.js\] to accept an editorInstructions string from the request body.
   * **Backend:** Pass these instructions to aiService.js \-\> getEditorRevision \[cite: ryan258/virtuous-content-cycle/aiService.js\] and inject them into the system prompt.
2. [x] **\[Feature\] Implement Convergence Logic:**
   * **Backend:** In aiService.js \-\> aggregateFeedback, replace the hardcoded convergenceScore \= 0.85 \[cite: ryan258/virtuous-content-cycle/aiService.js\] with a real calculation (e.g., based on the standard deviation of ratings).
   * **Backend:** Store this score in the Cycles table.
   * **UI:** Display the convergence score on the dashboard.
3. [x] **\[Feature\] Implement Cost Tracking:**
   * **Backend:** In aiService.js, modify all AI calls (both getEditorRevision and getFeedbackFromPersona) to capture the usage (tokens, cost) from the OpenRouter API response.
   * **Backend:** Store prompt\_tokens, completion\_tokens, and cost in the Feedback and Cycles tables.
   * **UI:** Display the *total running cost* for the content item on the dashboard.

## **Phase 4: Advanced AI \- The "Debate" Step**

**Goal:** Improve feedback quality by having an AI moderator synthesize and challenge the focus group's feedback before it goes to the editor.

**Why:** This filters out low-quality/contradictory AI suggestions and mimics a real, collaborative focus group, providing the editor with a much stronger signal.

**Key Tasks:**

1. [x] **\[Backend\] Create runFeedbackDebate function:**
   * In aiService.js, create a new async function runFeedbackDebate(feedbackItems).
   * This function will use a high-reasoning model (like the editor's claude-3.5-sonnet \[cite: ryan258/virtuous-content-cycle/aiService.js\]) with a new prompt: *"You are a focus group moderator. Synthesize the key points of agreement, disagreement, and the most critical actionable suggestions from the following reviews..."*
2. [x] **\[Backend\] Integrate Debate into Editor Step:**
   * Modify the POST /.../run-editor controller in server.js \[cite: ryan258/virtuous-content-cycle/server.js\].
   * The *new* flow will be:
     1. Get the raw Feedback items for the cycle (based on selectedParticipantIds).
     2. Call aiService.js \-\> runFeedbackDebate() with this raw feedback.
     3. Pass the resulting *debate summary* (along with any editorInstructions from Phase 3\) to the aiService.js \-\> getEditorRevision() function.
   * This means the editor is now acting on a *synthesized summary*, not just raw feedback.
3. [x] **\[UI\] Display Debate Summary:**
   * Add a new "Moderator's Summary" section in the UI that appears after the focus group is complete, showing the user the synthesized points.

## **Phase 5: The "Chief of Staff" AI Orchestrator**

**Goal:** Create an autonomous agent that manages the entire refinement loop based on user goals, automating the manual click-based process.

**Why:** This is the ultimate feature, turning the user into a director. It automates the "run-analyze-edit-repeat" loop to achieve a specific quality target.

**Key Tasks:**

1. [x] **\[Backend\] Create orchestratorService.js:**
   * This new service will manage the autonomous loop.
2. [x] **\[Backend\] Create Orchestrator Endpoint:**
   * Create a new endpoint: POST /api/orchestrate/run in server.js.
   * It will accept a payload: { contentId: "...", targetRating: 9.0, maxCycles: 4, personaIds: \["persona\_id\_1", "..."\], editorInstructions: "..." }.
3. [x] **\[Backend\] Implement Orchestration Loop:**
   * The orchestratorService.js will run an async loop:
     while (currentCycle \< maxCycles && currentRating \< targetRating)
   * Inside the loop, the orchestrator will *internally call* the app's own services (NOT via HTTP requests, but by importing the functions):
     1. databaseService.createCycle(...)
     2. aiService.getFocusGroupFeedback(...) \-\> Save feedback.
     3. aiService.aggregateFeedback(...) \-\> Get currentRating.
     4. databaseService.updateCycle(...) \-\> Save currentRating.
     5. Check while condition. If it fails, break and return.
     6. aiService.runFeedbackDebate(...)
     7. aiService.getEditorRevision(...) \-\> Get revisedContent.
     8. databaseService.updateCycle(...) \-\> Save revisedContent as currentVersion.
     9. Increment currentCycle.
   * This service replaces the manual user-review step \[cite: ryan258/virtuous-content-cycle/server.js\] with an automated "approve and continue" logic.
4. [x] **\[Frontend\] "Orchestrator" UI:**
   * Add a new "Orchestrator" tab to public/index.html.
   * This UI will have inputs for targetRating and maxCycles, the "Persona Launchpad" checklist (reused from Phase 2), and a "Run Orchestration" button.
   * It should show a real-time log of the orchestrator's progress (e.g., "Cycle 1 complete. Rating: 7.2. Continuing...", "Cycle 2 complete. Rating: 8.6. Target met.").
