# Virtuous Content Cycle - Project Roadmap & Documentation

**Status**: V1 Complete / Active
**Last Updated**: November 19, 2025

---

## 1. Project Overview

The **Virtuous Content Cycle (VCC)** is an iterative content improvement engine. It cycles content through a simulated focus group (AI personas) → editor refinement (AI) → user review → repeat loop.

**Core Concept**:
1.  **Focus Group**: Parallel AI participants (Target Market & Random) evaluate content.
2.  **Debate**: A Moderator AI synthesizes feedback and identifies key issues.
3.  **Editor**: An Editor AI rewrites content based on the moderator's summary and specific instructions.
4.  **Orchestrator**: An autonomous "Chief of Staff" agent loops this process until a target quality rating is achieved.

---

## 2. Current Status: V1 Complete

All planned phases for the V1 release have been successfully implemented.

### ✅ Phase 1: Foundation & Database
- **SQLite Persistence**: Replaced file-based storage with `better-sqlite3` for robust data management.
- **Schema**: Normalized tables for `ContentItems`, `Cycles`, `Personas`, and `Feedback`.
- **Security**: XSS protection, Helmet CSP, and input validation (Zod).

### ✅ Phase 2: Persona Management ("Dream Team Launchpad")
- **Dynamic Personas**: UI to create, edit, and delete AI personas.
- **Focus Group Config**: Select specific personas for each run.
- **Mock Mode**: `USE_MOCK_AI=true` for local testing without API costs.

### ✅ Phase 3: Core Loop Enhancements
- **Cost Tracking**: Real-time tracking of token usage and estimated costs per cycle.
- **Editor Instructions**: User can provide specific guidance to the AI editor.
- **Convergence Logic**: System calculates agreement scores among focus group participants.

### ✅ Phase 4: The "Debate" Step
- **Moderator Agent**: Synthesizes raw feedback into actionable "Key Points" before the editor sees it.
- **Reduced Noise**: Prevents the editor from being overwhelmed by contradictory feedback.

### ✅ Phase 5: The "Chief of Staff" Orchestrator
- **Autonomous Loop**: "Run until rating > 8.5" functionality.
- **Auto-Stop**: Stops on max cycles or target achievement.
- **Real-time Logs**: Live progress updates in the UI.

### ✅ Phase 6: Gamification & UX Polish
- **Avatars**: Procedural avatars for all personas using DiceBear API.
- **Visual Stats**: Progress bars for rating and convergence scores.
- **Confetti**: Celebration animation when target rating is achieved.
- **Loading Chatter**: "Fake" status updates during AI wait times to improve perceived performance.

### ✅ Phase 7: Content Dashboard & History
- **History Sidebar**: Persistent list of all content items.
- **One-Click Restore**: Instantly load previous content states.
- **Persistence**: All data saved to SQLite, accessible across sessions.

### ✅ Phase 8: Observability
- **Winston Logging**: Structured logging for server events and AI interactions.
- **Verbose AI Logs**: Full prompt/response logging for debugging.
- **Target Audience Injection**: Explicit instruction to AI personas to consider the target audience.

---

## 3. Technical Architecture

### Technology Stack
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: SQLite (`better-sqlite3`)
- **AI Provider**: OpenRouter (supporting Gemini, Claude, Sherlock, etc.)
- **Frontend**: Vanilla JS + HTML/CSS (No build step required)

### Data Schema
- **ContentItems**: Stores base metadata (original input, target audience, cost settings).
- **Cycles**: Tracks each iteration (version text, average rating, moderator summary).
- **Feedback**: Individual ratings and comments from each persona per cycle.
- **Personas**: System prompts and metadata for AI participants.

### Key Design Decisions
- **Why SQLite?**: Zero-config, single-file database perfect for this scale. Removes the complexity of a separate DB server while offering full SQL power.
- **Why OpenRouter?**: Avoids vendor lock-in. Allows mixing cheap models (Gemini Flash) for focus groups with smart models (Claude Sonnet) for editing.
- **Why Vanilla JS?**: Keeps the project lightweight and hackable. No complex React/Vue build chains to maintain.

---

## 4. Historical Context & Fixes (Phase 1)

During the initial build, several critical issues were identified and resolved. This section serves as a record of those fixes.

### Critical Fixes
1.  **Cost Persistence**: `costEstimate` was initially dropped. Added migration and column to `ContentItems` to persist user budgets.
2.  **Zero-Value Handling**: Fixed a bug where `randomCount: 0` was treated as falsy and forced to default (2). Replaced `||` with `??` throughout the codebase.
3.  **Status History**: Added `statusHistory` JSON column to `Cycles` to track state changes over time.
4.  **Transaction Safety**: Wrapped multi-step operations (like `createContent` and `runFocusGroup`) in database transactions to prevent orphaned records.
5.  **XSS Protection**: Switched from `.innerHTML` to `.textContent` for rendering user/AI content in the frontend.

### Known Limitations (V1)
- **Node Version**: Requires Node v18-v20. Node v25+ has binary incompatibility with `better-sqlite3` (v115 vs v127).
- **Single User**: No authentication or multi-user separation.

---

## 5. Future Roadmap (Post-V1)

### 🚀 Near Term
- [ ] **CSV/Markdown Export**: Export full cycle history for external analysis.
- [ ] **Prompt Library**: Save and reuse effective editor instructions.
- [ ] **Persona Marketplace**: Import/export personas as JSON.

### 🔭 Long Term
- [ ] **Multi-User Support**: User auth and private workspaces.
- [ ] **Cloud Migration**: Switch from SQLite to Postgres for scalable deployments.
- [ ] **Real-time Streaming**: Stream AI responses token-by-token (WebSockets).
- [ ] **Advanced Analytics**: Cross-content trends (e.g., "Which persona is consistently the harshest?").

---

## 6. How to Run

1.  **Install**: `npm install`
2.  **Setup**: `cp .env.example .env` (Add OpenRouter Key)
3.  **Migrate**: `node migrate.js` (Seeds DB)
4.  **Run**: `npm run dev`
5.  **View**: http://localhost:3000
