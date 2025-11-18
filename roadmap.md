# Roadmap & Status

This is a quick view of what’s done and what’s next to keep `virtuous-content-cycle` aligned with the desired flow and easy to run.

## Core Functionality
- [x] CRUD flow hookups: create → focus group → editor → user review → history/export
- [x] Mock AI path for local demo (`USE_MOCK_AI=true` skips OpenRouter)
- [ ] Real AI path with OpenRouter key tested end-to-end

## Validation & Data Model
- [x] Zod schemas for iteration state, feedback, editor pass, user review
- [x] Default-safe metadata (costEstimate defaults to 0)
- [ ] Convergence threshold enforcement and max-cycle guardrails in runtime

## Frontend UX
- [x] Basic dashboard with tabs, diff view, charts
- [x] Disable/enable buttons by status, show mock cost message when free
- [ ] Polish charts (real rating history per cycle) and CSV/Markdown export

## Persistence & Files
- [x] JSON file storage per cycle in `results/<content-id>/`
- [ ] Migration/cleanup tools for old runs (optional)

## Operations
- [x] Dev server with nodemon (`npm run dev`)
- [x] Smoke tests / Jest coverage for controllers and file service
- [ ] CI hook (lint/test) if needed

## How to run
- Local mock/demo: `USE_MOCK_AI=true npm run dev` then open http://localhost:3000
- Real models: set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_BASE_URL`) then `npm run dev`
