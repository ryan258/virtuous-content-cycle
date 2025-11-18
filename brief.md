# Developer Brief: Iterative Content Refinement System

**Project**: Focus Group Feedback Loop Engine  
**Based On**: AI Ethics Comparator (Node.js/Express, OpenRouter)  
**Status**: Pre-Development Planning  
**Prepared**: November 17, 2025

---

## Executive Summary

You're building an iterative content improvement engine using the AI Ethics Comparator technology stack. The system will cycle content through a simulated focus group → editor refinement → user edit → repeat loop. This is technically feasible, but requires careful scope management around feedback quality and iteration convergence.

**Key Reality Check**: LLM feedback is inconsistent across runs. Editor refinement is not guaranteed to improve content. You'll reach a quality plateau after 3-4 cycles. Plan accordingly.

---

## System Architecture Overview

### Reusable Components from AI Ethics Comparator
- Express.js REST API pattern
- OpenRouter client with multi-model support
- JSON-based filesystem persistence
- Results dashboard UI structure (tabs, run history, export)
- Chart.js for visualization
- Security hardening (Helmet, input validation, XSS protection)
- Rate limiting and retry logic

### New Components to Build
- **Focus Group Simulator**: Orchestrates 5 parallel LLM "participants" (3 target-market, 2 random) with distinct personas
- **Editor Agent**: Dedicated LLM call that synthesizes feedback and rewrites content
- **Iteration State Manager**: Tracks versions, ratings, feedback across cycles
- **Content Diff Viewer**: Shows before/after comparison between iterations
- **User Edit Interface**: Form for mid-cycle content updates before next focus group round

---

## Data Schema

Define iteration state upfront. This is your single source of truth:

```json
{
  "id": "content-20251117-001",
  "cycle": 1,
  "originalInput": "...",
  "currentVersion": "...",
  "focusGroupRatings": [
    {
      "participantId": "target_market_1",
      "participantType": "target_market | random",
      "rating": 7,
      "likes": ["Easy to understand", "Compelling hook"],
      "dislikes": ["Too long", "Unclear ending"],
      "suggestions": "Consider breaking into sections...",
      "fullResponse": "...",
      "timestamp": "2025-11-17T10:30:00Z"
    }
  ],
  "aggregatedFeedback": {
    "averageRating": 7.2,
    "ratingDistribution": { "1-3": 0, "4-6": 1, "7-10": 4 },
    "topLikes": ["Easy to understand", "Compelling"],
    "topDislikes": ["Too long", "Unclear"],
    "convergenceScore": 0.85,
    "feedbackThemes": [
      { "theme": "length", "frequency": 4, "sentiment": "negative" }
    ]
  },
  "editorPass": {
    "revisedContent": "...",
    "changesSummary": "Reduced length by 30%, clarified ending, restructured into 3 sections",
    "editorReasoning": "Feedback heavily weighted toward brevity and clarity...",
    "timestamp": "2025-11-17T10:35:00Z",
    "modelUsed": "claude-3.5-sonnet"
  },
  "userEdit": {
    "approved": true,
    "userChanges": null,
    "notes": "Editor version looks good. Ready for next cycle.",
    "timestamp": "2025-11-17T10:40:00Z"
  },
  "status": "awaiting_focus_group",
  "statusHistory": [
    { "status": "created", "timestamp": "2025-11-17T10:25:00Z" },
    { "status": "focus_group_complete", "timestamp": "2025-11-17T10:33:00Z" },
    { "status": "editor_complete", "timestamp": "2025-11-17T10:35:00Z" },
    { "status": "user_review_complete", "timestamp": "2025-11-17T10:40:00Z" }
  ],
  "metadata": {
    "contentType": "product_description",
    "targetAudience": "ecommerce_shoppers",
    "costEstimate": 0.12,
    "maxCycles": 5,
    "convergenceThreshold": 0.8
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation & API Layer (Week 1 | 16-20 hours)

**Deliverables:**
- Data schema definition and validation (Zod)
- Express endpoints skeleton
- File-based persistence layer
- Basic error handling

**Endpoints to build:**
```
POST /api/content/create
  → Initialize new iteration cycle with user input

GET /api/content/:id
  → Retrieve current state and history

POST /api/content/:id/run-focus-group
  → Execute 5 parallel participant evaluations

POST /api/content/:id/run-editor
  → Run editor refinement pass

POST /api/content/:id/user-review
  → Accept user edits or approvals

GET /api/content/:id/history
  → Full iteration timeline

POST /api/content/:id/export
  → JSON/CSV export

GET /health
  → Status check (reuse from Ethics Comparator)
```

**Key task**: Lock in where files will be stored. Recommend `results/{contentId}/cycle-{n}.json` to match Ethics Comparator pattern.

---

### Phase 2: Focus Group Simulator (Week 2 | 20-24 hours)

**Critical**: This is where most reliability issues live.

**What to build:**

1. **Persona Definitions** (`focusGroupPersonas.json`)
   ```json
   [
     {
       "id": "target_market_1",
       "type": "target_market",
       "persona": "Sarah, 35, marketing manager, cares about clarity and ROI",
       "systemPrompt": "You are Sarah, a marketing manager evaluating content for clarity and business impact..."
     },
     {
       "id": "random_1",
       "type": "random",
       "persona": "General reader with no domain expertise",
       "systemPrompt": "You are evaluating this content as a general reader with no special expertise..."
     }
   ]
   ```

2. **Feedback Extraction** (critical)
   - Force output format via system prompt
   - Validate response contains rating (1-10) and structured feedback
   - Retry on parse failure
   - Flag incomplete responses with ⚠️ warning

3. **Parallel Execution**
   - Use Promise.all() to call all 5 participants simultaneously
   - Implement concurrency limiting (reuse Ethics Comparator's 3-request limit)
   - Add retry logic with exponential backoff

4. **Feedback Aggregation**
   - Compute average rating
   - Extract likes/dislikes (tokenize and count frequency)
   - Detect contradictions (one person loves what another hates)
   - Calculate "convergence score" (0-1, higher = more agreement)

**Known limitation**: LLM personas will be inconsistent. Same prompt run twice yields different feedback. Mitigate by:
- Using `seed` parameter if model supports it
- Accepting inconsistency as "diversity of opinion"
- Running each persona twice per cycle if budget allows (doubles cost)

**Model selection**: Use Gemini 2.0 Flash for focus group (faster, cheaper). Reserve Claude 3.5 Sonnet for editor.

---

### Phase 3: Editor Agent (Week 2 | 16-20 hours)

**What to build:**

Single smart LLM call that receives:
- Original input
- Aggregated focus group feedback
- Explicit refinement instructions

**System prompt structure:**
```
You are an expert editor tasked with improving content based on focus group feedback.

Original content:
[ORIGINAL]

Focus group feedback summary:
- Average rating: 7.2/10
- Top likes: [...]
- Top dislikes: [...]
- Specific suggestions: [...]

Your task:
1. Identify the 2-3 most critical issues from feedback
2. Rewrite to address those issues while preserving strengths
3. Aim to increase clarity and conciseness
4. Do NOT make dramatic changes; iterate within the spirit of the original

Output JSON:
{
  "revisedContent": "...",
  "changesSummary": "...",
  "reasoning": "..."
}
```

**Critical**: Test this prompt extensively. Editor quality determines if iteration loops actually improve content. Bad editor prompts = garbage in/garbage out.

**Model selection**: Claude 3.5 Sonnet or better (you need reasoning quality here).

---

### Phase 4: User Edit & Cycle Management (Week 3 | 16-20 hours)

**UI Requirements:**

1. **Review Page** (post-focus-group, pre-editor)
   - Show aggregated feedback
   - Display rating progression chart
   - List top themes (likes/dislikes)
   - Button: "Run Editor"

2. **Editor Review Page** (post-editor, pre-resubmit)
   - Side-by-side diff (original version → editor version)
   - Highlight changes
   - User options:
     - "Approve & Continue to Next Cycle"
     - "Approve & Stop"
     - "Edit Manually" (opens text editor)
     - "Discard & Use Original"

3. **Cycle Control**
   - Show current cycle (1/5)
   - Max cycle limit enforced
   - Early stop if convergence threshold reached (default 0.85)
   - Cost tracker (running total)

**Endpoint logic:**
```javascript
POST /api/content/:id/user-review
{
  "approved": true,  // false = reject editor changes
  "userEdits": "...", // optional manual text edits
  "continueToNextCycle": true,
  "notes": "..."
}
```

If user makes edits, store them and run next cycle with edited version (not editor output).

---

### Phase 5: Results Dashboard (Week 3 | 12-16 hours)

Adapt the Ethics Comparator results dashboard:

**Tabs:**
- **Progress**: Rating chart (X-axis: cycle, Y-axis: rating), convergence trend, cost tracker
- **Feedback Timeline**: All feedback across cycles, filterable by theme
- **Content Evolution**: Side-by-side comparison of original → final version with all intermediate steps
- **Details**: Full iteration data, raw responses, export options

**Visualizations:**
- Line chart: rating progression across cycles
- Heatmap: feedback themes by cycle (frequency × sentiment)
- Diff view: unified diff format for content changes

**Export options:**
- JSON: Complete iteration history
- CSV: Cycle-by-cycle summary (cycle #, rating, changes, themes)
- Markdown: Formatted report for sharing

---

## Technology Stack & Decisions

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Runtime** | Node.js 18+ | Match Ethics Comparator |
| **Web Framework** | Express.js | Proven, minimal overhead |
| **LLM Provider** | OpenRouter | Multi-model support, no vendor lock-in |
| **Focus Group Models** | Gemini 2.0 Flash | Fast, cheap, good for parallel calls |
| **Editor Model** | Claude 3.5 Sonnet | Best reasoning for iterative refinement |
| **Data Persistence** | JSON files (`results/`) | Simple, no DB overhead, matches Ethics Comparator |
| **Frontend** | Vanilla JS + HTML/CSS | No framework bloat, matches Ethics Comparator |
| **Charting** | Chart.js | Lightweight, already in Ethics Comparator |
| **Input Validation** | Zod | Type-safe, good error messages |
| **Security** | Helmet + DOMPurify | Reuse from Ethics Comparator |
| **Rate Limiting** | OpenRouter backoff logic | Reuse existing implementation |
| **Concurrency** | 3 parallel requests | Prevent rate limits, reuse from Ethics Comparator |

---

## Critical Challenges & Mitigation

### Challenge 1: Feedback Quality Degrades Over Iterations

**The Problem**: After cycle 3-4, LLM feedback becomes generic, repetitive, or contradictory. You reach diminishing returns.

**Why It Happens**: The LLM is pattern-matching against its training data. Once main issues are addressed, it struggles to find novel problems.

**Mitigation Strategies:**
- **Cap iterations at 4-5** by default; make 5+ opt-in
- **Track convergence**: If average rating plateaus for 2 consecutive cycles, auto-stop
- **Flag contradictions**: If cycle N says "too long" and cycle N+1 says "too short," warn user
- **Novelty prompting**: Later cycles get explicit instruction: "Find *new* issues not mentioned in prior feedback"
- **Manual intervention**: After cycle 3, show user: "Quality improvements are slowing. Recommend stopping here."

### Challenge 2: Cost Scaling

**The Problem**: 5 focus group calls + 1 editor call = 6 LLM calls per cycle. 3 cycles = 18 calls.

**Cost estimate:**
- Gemini 2.0 Flash (5 calls): $0.01 per cycle
- Claude 3.5 Sonnet (1 call): $0.05-0.10 per cycle
- **Total: ~$0.06-0.11 per cycle × 3-5 cycles = $0.18-0.55 per content item**

**Mitigation:**
- Show cost estimate upfront: "This will cost ~$0.25 for 3-cycle iteration"
- Use cheaper models where possible (Gemini for focus group is intentional)
- Implement optional caching: same input + same prompt = reuse results
- Add budget limit: "Stop if cost exceeds $X"

### Challenge 3: LLM Persona Inconsistency

**The Problem**: "Target market participant A" won't behave consistently. Same content evaluated twice yields different feedback.

**Why**: LLM temperature defaults (usually 0.7-1.0) introduce randomness intentionally.

**Mitigation:**
- Use `seed` parameter in OpenRouter (if underlying model supports)
- Document that persona variation is "realistic diversity," not a bug
- Optional: Run each persona twice per cycle, average results (costs 2x)
- Show persona-specific feedback separately so user understands individual vs. aggregate

### Challenge 4: No Guarantee of Improvement

**The Problem**: Ratings might not increase. Editor might misinterpret feedback and make content worse.

**Why**: LLMs hallucinate. Feedback can be contradictory. Editor prompt might miss nuance.

**Mitigation:**
- This is **not a bug**. This is how AI-assisted iteration works.
- **Track rating progression explicitly**. If it dips below starting point, surface that prominently.
- **Manual quality gate**: User must approve editor output before resubmission (don't auto-loop).
- **Be honest in UI**: "This is AI-assisted refinement, not guaranteed improvement"
- **Provide rollback**: User can revert to any previous cycle at any time

### Challenge 5: Focus Group Personas Are Shallow

**The Problem**: A 5-persona focus group (even simulated) is tiny. May miss important perspectives.

**Why**: LLM personas are templates, not real people with lived experience.

**Mitigation:**
- Market this as "quick iteration feedback," not "real user research"
- Plan for actual user testing after AI refinement cycles complete
- Explicitly tell users: "Use this for rapid prototyping, validate with real users later"
- Option to add custom personas: User supplies domain-specific persona descriptions

---

## Implementation Timeline

| Week | Phase | Effort | Deliverable |
|------|-------|--------|-------------|
| 1 | Foundation & API | 16-20h | Data schema, endpoints skeleton, file persistence |
| 2A | Focus Group Simulator | 12-16h | Personas, parallel execution, feedback aggregation |
| 2B | Editor Agent | 12-16h | Refinement logic, prompt tuning, validation |
| 3A | User Edit & Cycle Mgmt | 12-16h | Review UI, edit forms, cycle control |
| 3B | Results Dashboard | 12-16h | Charts, timeline view, export options |
| 4 | Testing & Refinement | 16-20h | Prompt tuning, edge cases, documentation |

**Total: 80-120 hours (2-3 weeks full-time, or 1 month part-time)**

---

## What You Cannot Reuse (New Build Required)

- Multi-user support (Ethics Comparator is single-user)
- User authentication/authorization
- Cloud database integration (would require significant refactor)
- Real-time collaboration features
- Mobile app

If any of these are requirements, scope grows significantly (add 2-4 weeks).

---

## Testing Strategy

### Unit Tests
- Feedback aggregation logic (average, theme detection)
- Diff generation (content comparison)
- Convergence calculation
- Cost estimation

### Integration Tests
- Full cycle: input → focus group → editor → user review → next cycle
- Error handling: API failures, rate limiting, malformed LLM responses
- Edge cases: empty input, max iterations reached, cost limit exceeded

### Prompt Testing
- Focus group: Does feedback align with input quality?
- Editor: Does refined version address feedback themes?
- Manual smoke tests with 3-5 real content examples before launch

### Performance Tests
- Parallel API calls don't exceed rate limits
- Results file I/O scales to 100+ cycles
- UI doesn't lag with large feedback datasets

---

## Deployment Considerations

- **Environment Variables**: `OPENROUTER_API_KEY`, `APP_BASE_URL`, max iterations, cost limits
- **Monitoring**: Log all API calls (cost, latency, errors). Alert on failures.
- **Backups**: Regularly backup `results/` directory to cloud storage
- **Cleanup**: Implement optional `DELETE /api/content/:id` to free disk space
- **Rate Limiting**: Implement per-user API rate limits if multi-user

---

## Success Metrics

1. **System Reliability**: 99% successful cycle completion (focus group → editor → user review)
2. **Content Improvement**: Average rating increases by 15%+ after 2-3 cycles on sample content
3. **User Experience**: User completes at least 2 cycles without abandoning
4. **Cost Accuracy**: Actual cost within ±10% of estimate
5. **Feedback Quality**: Users report feedback is "actionable" (5/10 or higher on usability survey)

---

## Known Unknowns (Test Early)

1. **Does the editor actually improve content?** Build a working editor → test on 10 real content examples → iterate prompt
2. **What's the optimal cycle cap?** Run test cycles, track where convergence plateaus
3. **How often do personas contradict?** Log contradictions in early cycles, adjust personas if >20% contradiction rate
4. **Do users actually do 3+ cycles?** Monitor usage; if drop-off after cycle 1, investigate UX friction

---

## Recommended Next Steps

1. **Lock in the data schema** with your team (this document proposes one; adjust as needed)
2. **Build Phase 1 (Foundation)** first; get basic CRUD working before touching LLM logic
3. **Build a "dumb" focus group** (hardcoded 5 responses) to test the rest of the pipeline
4. **Build the editor pass** and test it manually on 3 sample content pieces
5. **Integrate real LLM calls** once pipeline is solid
6. **Iterate prompt engineering** (80% of the work quality will be here)

---

## Questions for Clarification Before Starting

- Is this single-user or multi-user?
- What content types will it handle? (product descriptions, marketing copy, technical writing, etc.)
- Should the user be able to customize the personas? (affects complexity)
- What's the max acceptable cost per cycle run?
- Do you want to track user satisfaction with refinements? (affects data model)

