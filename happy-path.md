# Happy Path: The Ideal User Flow

This document describes the primary workflow for a user getting the most value out of the Virtuous Content Cycle.

## 1. Initialization
- User starts the backend (`uvicorn`) and frontend (`npm run dev`).
- User opens `http://localhost:5173` in their browser.
- The **History Sidebar** loads previous content items (if any).

## 2. Content Creation
- User clicks the **"Content"** tab.
- User pastes a rough draft of a LinkedIn post into the text area.
- User sets metadata:
    - **Type**: "LinkedIn Post"
    - **Audience**: "Software Engineers"
- User clicks **"Start Cycle"**.
- System creates `Cycle 1` in "Draft" status.

## 3. The Feedback Loop
- User sees the "Next Step: Focus Group" panel.
- User selects **3 Target Market Personas** and **2 Random Personas**.
- User clicks **"Run Focus Group"**.
- **System Action**:
    - AI Personas analyze the content.
    - Feedback is saved to the database.
    - Aggregated score is calculated (e.g., 6.2/10).
- User sees the **Feedback Summary** (Rating, Themes) and a confetti animation if the score is high.

## 4. AI Refinement
- User reviews the feedback themes (e.g., "Too verbose", "Lacks call to action").
- User adds instructions for the editor: "Make it punchier and add a question at the end."
- User clicks **"Run Editor"**.
- **System Action**:
    - AI Editor reviews the draft + feedback + instructions.
    - Generates a revised version.
- User sees the **Diff View** showing changes between the original and the revision.

## 5. User Approval
- User tweaks the revised text slightly in the "User Review" box.
- User clicks **"Approve & Next Cycle"**.
- System saves the result and creates `Cycle 2` with the new text as the baseline.

## 6. Automated Orchestration (Optional)
- User switches to the **"Orchestrator"** tab.
- User sets **Target Rating** to 9.0 and **Max Cycles** to 5.
- User clicks **"Start Orchestrator"**.
- System automatically runs the Focus Group -> Editor -> Review loop until the score meets the target.
- User watches the logs populate with progress: "Cycle 3: 7.8/10... Cycle 4: 8.5/10... Cycle 5: 9.1/10 - Success!"
