# Roadmap & Status

This is a quick view of what’s done and what’s next to keep `virtuous-content-cycle` aligned with the desired flow and easy to run.

## Core Functionality
- [x] CRUD flow hookups: create → focus group → editor → user review → history/export
- [x] Mock AI path for local demo (`USE_MOCK_AI=true` skips OpenRouter)
- [x] Real AI path with OpenRouter key tested end-to-end
- [x] Configurable focus group size (target market vs. random participants)
- [x] Selective feedback incorporation (choose which participants' feedback to use)
- [x] Auto-run focus group after content creation

## Validation & Data Model
- [x] Zod schemas for iteration state, feedback, editor pass, user review
- [x] Default-safe metadata (costEstimate defaults to 0)
- [ ] Convergence threshold enforcement and max-cycle guardrails in runtime

## Frontend UX
- [x] Interactive dashboard with real-time status updates
- [x] Loading states with spinners for all async operations
- [x] Status messages (loading, success, error) for user feedback
- [x] Right-panel detailed feedback display with individual persona cards
- [x] Checkbox-based selective feedback incorporation
- [x] Focus group size configuration UI
- [x] Diff viewer for editor changes
- [x] Disable/enable buttons by status
- [x] Content preview showing current version
- [x] Cycle info with status badges
- [ ] CSV/Markdown export formats

## Persistence & Files
- [x] JSON file storage per cycle in `results/<content-id>/`
- [ ] Migration/cleanup tools for old runs (optional)

## Operations
- [x] Dev server with nodemon (`npm run dev`)
- [x] Nodemon configured to ignore `results/` directory (prevents restarts during content save)
- [x] Helmet CSP configuration for CDN script loading (Chart.js, Diff.js)
- [x] Smoke tests / Jest coverage for controllers and file service
- [ ] CI hook (lint/test) if needed

## How to run
- Local mock/demo: `USE_MOCK_AI=true npm run dev` then open http://localhost:3000
- Real models: set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_BASE_URL`) then `npm run dev`
