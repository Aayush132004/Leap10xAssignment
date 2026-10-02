# Voice Agent Studio — Project Instructions

This is the single instruction file for AI coding agents working on this repo (Claude
Code or otherwise). It merges the original product spec with how the codebase actually
implements it today, so a fresh agent with no prior context can get oriented from this
file alone. `notes/` has the deeper "why" behind specific decisions; this file is "what
the product is and the rules for changing it."

## 1. What this product is

Voice Agent Studio is a **configuration-first platform for creating voice agents and
evaluating their conversations**. It is **not a voice-calling app** — the core product is
Agent Configuration + Call Evaluation + Analytics. Voice providers (Vapi) are an optional
call-source integration and must never be tightly coupled to evaluation.

Goals: configure reusable voice agents without code · ingest transcripts from datasets,
uploads, and Vapi · evaluate calls against each agent's configurable rubric · produce
evidence-backed criterion scores and an overall PASS/FAIL · give useful per-call and
per-agent analytics · validate evaluator quality against human-labeled data · support a
brand-new agent/rubric with zero code changes.

Favor a smaller, reliable, explainable implementation over unnecessary features.

## 2. Tech stack

- Frontend: Next.js (App Router) + TypeScript + Tailwind CSS — `frontend/`
- Backend: Node.js + Express + TypeScript + REST — `backend/`
- Data: PostgreSQL + Prisma — `backend/prisma/schema.prisma`
- AI: LangChain + Groq, Zod for structured-output validation — `backend/src/ai/`
- Optional: Vapi Web SDK for real browser-based calls (no Twilio/phone number)

Do not introduce infrastructure unless it solves a demonstrated product need (see §17).

## 3. Core architecture — the one invariant that must never break

```
Agent Configuration + Normalized Call
              ↓
        Assessment Engine        (backend/src/modules/evaluations/evaluation.service.ts)
              ↓
        LangChain + Groq         (backend/src/ai/evaluator.chain.ts)
              ↓
     Structured Evaluation       (backend/src/ai/schemas/evaluation.schema.ts — Zod)
              ↓
    Deterministic Scoring Engine (backend/src/ai/scoring.engine.ts — plain TS, unit-tested)
              ↓
       Weighted Score + Rules
              ↓
          Evaluation (stored)
              ↓
           Analytics (reads stored evaluations only — never a fresh LLM call)
```

All transcript sources converge into the same internal representation before reaching the
assessment engine:

```
Dataset ──────┐
Manual Upload ├→ Adapter/Normalize → NormalizedCall (TranscriptTurn[])
Vapi ─────────┘
```

- The assessment engine must never branch on `Call.source` ("dataset" | "upload" | "vapi").
- **The LLM never computes the final weighted score or PASS/FAIL.** It returns per-criterion
  semantic judgment only; `scoring.engine.ts#calculateScore` computes the weighted average
  and applies hard rules in plain TypeScript, so it's reproducible and unit-testable
  without any LLM call.
- Evidence turn indices the LLM cites are checked against the real transcript
  (`scoring.engine.ts#validateEvidenceTurns`) before being trusted.
- `NOT_ASSESSABLE` is **excluded from the weighted-score denominator**, not scored as 0. If
  every criterion on a call is `NOT_ASSESSABLE`, the overall score is 0 and the result is
  FAIL (documented assumption — no real basis to default to PASS with zero evidence).
- An `Evaluation` snapshots the exact `AgentConfig` used (`agentConfigSnapshot` column) —
  never mutate that snapshot when a rubric is edited later; historical evaluations must
  stay reproducible/interpretable.
- A `Call` can be evaluated more than once (different prompt version, or a repeat run for
  a consistency check) — each run is its own `Evaluation` row.

## 4. Agent configuration

Agents are data, not hardcoded application logic:

```ts
AgentConfig {
  id, name, useCase, persona, goal, openingLine,
  guidelines[], knowledge[], scoringNotes[], language,
  evaluationTarget,        // "agent" | "user" — see below
  passThreshold,
  criteria: Criterion[],
  hardRules: HardRule[],
}

Criterion { id, name, weight, description, goodLooksLike, badLooksLike }

HardRule {
  id, type,                       // "criterion_below" | "any_below" | "not_assessable_fail" | "failure_tag_any"
  criterionId?, threshold?,       // used by criterion_below / not_assessable_fail
  tags?: string[],                // used by failure_tag_any (see below)
  description,
}
```

**`evaluationTarget`** decides which transcript speaker is actually being judged. Two of
the three real agents are roleplay/training calls where a **human** is assessed (the sales
trainee, the field-sales learner) and the voice agent plays a character (a skeptical
customer, a training coach) — those have `evaluationTarget: "user"`. The support agent has
`evaluationTarget: "agent"`. The evaluator prompt (`evaluator.prompt.ts`) makes this
explicit with a `WHO YOU ARE SCORING: the transcript speaker labeled X` callout — **this
exists because a real bug was found and fixed here**: an earlier prompt version scored the
roleplay persona's behavior instead of the trainee's, because its section header
(`## Agent Being Evaluated`) contradicted the "Evaluate the: user" instruction a few lines
later. See `notes/known-limitations.md` for the full story. If a new roleplay-style agent
starts scoring the wrong side of a conversation, this is the first thing to check.

**`failure_tag_any` hard rule**: for rules that are behavioral, not a score threshold (e.g.
ClinicDesk's "inventing a feature or price, guaranteeing a result, or offering a discount
is an automatic fail"). The rule names a tag vocabulary (`tags: string[]`); that vocabulary
is injected back into the evaluator prompt as an explicit "use this exact tag when you see
this behavior" instruction (`evaluator.prompt.ts`'s "Behavioral Hard-Fail Watch List"), and
`scoring.engine.ts` fails the call if any criterion's `failureTags` intersects the list —
regardless of numeric score. **Never hardcode a rule to one agent's name or wording** — if
a new agent needs a behavioral hard rule, use this mechanism.

Hard rules must stay generic/configurable — never hardcode example-specific rules into
evaluation logic itself.

The same `AgentConfig` drives two consumers: evaluation (`evaluator.prompt.ts` reads
persona/goal/guidelines/knowledge/scoringNotes to build the judge's prompt) and live voice
behavior (`voice.service.ts#getAssistantConfig` reads the *same* fields to build a Vapi
assistant's system prompt/opening line) — editing an agent's config in the Rubric Editor
changes both, with zero code changes.

Support the supplied agents through the product UI, not agent-specific code paths.

## 5. Call model

```ts
NormalizedCall { id, agentId, source: "dataset" | "upload" | "vapi", externalId?, language?, durationSeconds?, transcript: TranscriptTurn[] }
TranscriptTurn { index, speaker: "agent" | "user", text, startTime?, endTime? }
```

Calls and evaluations are separate tables on purpose — see §3.

## 6. Evaluation rules

The LLM performs semantic interpretation, not final business calculations. For every
criterion it returns: `score` (1–5 or `NOT_ASSESSABLE`), `reasoning`, `evidenceTurnIndices`,
optional `failureTags`. It must judge only the evaluated speaker (§4), use only evidence
present in the transcript, never invent evidence, never award credit for actions that
didn't happen, and use `NOT_ASSESSABLE` only when evidence is genuinely insufficient.

The backend must (and does): validate output with Zod (`evaluation.schema.ts`), verify
evidence turn IDs exist in the transcript, calculate weighted scores deterministically,
apply hard rules deterministically, derive PASS/FAIL from threshold + hard rules. **Never
ask the LLM for the final weighted score or PASS/FAIL.**

## 7. Evaluation output

```ts
Evaluation { id, callId, agentId, overallScore, result: "PASS" | "FAIL", unusualThings[], model, promptVersion, createdAt, agentConfigSnapshot, criteria: CriterionEvaluation[] }
CriterionEvaluation { criterionId, score/status, reasoning, evidenceTurns[], failureTags[] }
```

## 8. Human validation / trust

Human-labeled dev data (`datasets/labels/dev-labels.csv`) is ground truth for **validating
the evaluator**, never runtime input. `backend/src/ai/comparison.engine.ts` computes exact
agreement, ±1 agreement, MAE, and PASS/FAIL agreement (`compareEvaluations`) and repeat-run
consistency (`computeConsistencyMetrics`) — both pure, unit-tested functions. The
Validation page shows matching calls/criteria, human vs. AI scores, AI evidence for
mismatches, failure patterns, and supports CSV export of mismatches. Use validation results
to inspect *why* disagreements happen, not just to chase the aggregate metric — see
`notes/REPORT.md` and `notes/known-limitations.md` for a worked example (the
`evaluationTarget` bug above was found exactly this way).

`backend/prisma/run-benchmark.ts` runs the full real benchmark (costs real Groq calls);
`backend/prisma/recompute-report.ts` recomputes metrics from whatever's already in the
database with **zero** additional API calls — useful since Groq's free-tier daily token
cap is easy to hit (~50 evaluations at this rubric size); see `notes/known-limitations.md`.

## 9. Vapi integration

Vapi is an optional source of real calls and stays a thin adapter around the core system —
**never a separate Vapi evaluation engine**; a Vapi-sourced call goes through the exact
same `/api/calls` + `/api/calls/:id/evaluate` path as a dataset or uploaded call.

**Implementation: Vapi's Web SDK (`@vapi-ai/web`), not phone/Twilio.** A real phone call
needs a phone number (Twilio or similar — not free, awkward for Indian numbers). The Web
SDK runs a call entirely in the browser over WebRTC using only a **public** key (safe
client-side) plus an inline assistant config — no phone number, no webhook, no backend Vapi
credential. Flow:
1. `GET /api/voice/assistant-config/:agentId` (`voice.service.ts`) builds the Vapi assistant
   JSON from the agent's own config — no Vapi API key needed for this.
2. `frontend/components/voice/CallNowButton.tsx` calls `vapi.start(assistantConfig)`
   client-side with `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, shows a live transcript as `message`
   events arrive (real-time, not simulated), and on `call-end` assembles the transcript and
   POSTs it to `/api/calls` (`source: "vapi"`) — same `CallService.create` every other
   source uses.

There is intentionally no `VoiceSession` model, no webhook route, and no phone-call
adapter — an earlier version had all three (built without live Vapi doc access) and was
replaced once the simpler, fully-documented web-call path was confirmed. See
`notes/decisions.md` for the full history and `notes/known-limitations.md` for what's
verified vs. not (mainly: whether the default `VAPI_MODEL_PROVIDER`/`VAPI_MODEL_NAME` are
enabled on a given Vapi account — adjust the env vars if a live call won't connect).

## 10. Backend structure

```
backend/src/
  modules/
    agents/        agent CRUD + rubric (agent.service.ts, agent.schema.ts, agent.router.ts)
    calls/          call CRUD + bulk import
    evaluations/    evaluate + consistency-check
    analytics/      dashboard + per-agent stats (reads stored evals only)
    validation/     human-vs-AI comparison
    voice/          Vapi assistant-config builder
  ai/
    prompts/evaluator.prompt.ts   versioned (PROMPT_VERSION) — currently v1.2
    schemas/evaluation.schema.ts  Zod validation of LLM output
    evaluator.chain.ts            LangChain + Groq call, orchestrates the pipeline
    scoring.engine.ts             deterministic weighted score + hard rules (pure, tested)
    comparison.engine.ts          human-vs-AI comparison + consistency metrics (pure, tested)
  adapters/
    dataset.adapter.ts   normalizes datasets/transcripts/*.json (turns/idx/start_sec/end_sec)
    upload.adapter.ts    normalizes manual JSON/CSV/text uploads (tolerant of varying shapes)
  db/prisma.ts
prisma/
  schema.prisma
  run-benchmark.ts      full real benchmark against Groq (costs API calls)
  recompute-report.ts   recomputes metrics from the DB, zero API calls
```

No seed script — agents and calls are created manually through the app (Agents → New
Agent; Calls → Upload Transcript). `datasets/agents/*.md` and `datasets/transcripts/*.json`
are the reference specs/real transcripts for the 3 assignment agents if you want to
recreate them by hand, but nothing in the codebase auto-populates the database. Do not add
a seed script back without being asked — the user manages their own data on purpose.

API surface: `GET/POST/PATCH/DELETE /api/agents[/:id]` · `GET/POST /api/calls`,
`POST /api/calls/bulk` · `POST /api/calls/:id/evaluate` ·
`POST /api/calls/:id/consistency-check` · `GET /api/calls/:id/evaluation` ·
`GET /api/analytics/dashboard`, `/api/analytics/agents/:id` ·
`POST /api/validation/compare` · `GET /api/voice/assistant-config/:agentId`.

Keep business logic out of route handlers — routes stay thin, logic lives in `*.service.ts`.

## 11. Frontend structure

```
frontend/app/{agents,calls,analytics,validation}/
frontend/components/
  agents/       AgentForm, RubricEditor, AgentCard
  calls/        CallUpload, TranscriptViewer
  evaluations/  ScoreCard, CriterionCard, EvidenceBadge, ConsistencyPanel
  voice/        CallNowButton (Vapi Web SDK)
  layout/       Sidebar
```

Primary UX: Agents (create/edit/delete + rubric) · Calls (browse + evaluate) · Call detail
(scorecard + transcript with evidence linking/highlighting + consistency check) ·
Analytics (per-agent performance + failure patterns) · Validation (AI vs. human labels).

Do not create pages or controls merely because they're technically possible.

## 12. UI / visual direction

Notebook-paper / light parchment surfaces, muted soft blues/grays/yellows, vibrant accents
only for important metrics and primary actions, subtle sketch-like borders, handwritten
type (`font-sketch`, Caveat) only on selected numeric/stat elements — normal UI text stays
highly readable. Card-based layout with subtle intentional irregularity (see the
`border-radius: 2px 4px 3px 5px`-style asymmetric corners in `globals.css`).

**Critical constraint**: minimal, professional, calm, functional. No excessive animation,
no decorative illustrations, no floating elements, no fake loading/drawing effects, no
gradients, no clutter. Every visual element must have a product purpose. Progress UI must
reflect **real** backend/SDK state — e.g. the evaluate-call elapsed-time counter, or the
Vapi Web SDK's actual `call-start`/`message`/`call-end` events — never a fake staged
animation timed to guess how long something takes.

## 13. Product UX principles

One clear primary action per context · avoid unnecessary navigation · progressive
disclosure · show evidence next to scores · make score/PASS-FAIL immediately understandable
· keep configuration generic · preserve context between call/scorecard/transcript ·
loading states communicate real processing · errors explain what failed and what the user
can do · empty states guide the next useful action · confirm only destructive/high-risk
actions · never add a feature solely to make the UI look complete.

## 14. Analytics

Per-agent: pass rate, criterion score distribution, average scores, common failure
tags, number of evaluated calls, recent activity. Per-call: overall score, PASS/FAIL,
criterion scores, evidence, unusual things, transcript. **Always derived from stored
evaluations — never a fresh LLM call** (`analytics.service.ts`).

## 15. AI / prompt engineering

Provider abstraction around Groq (LangChain) so another provider could be substituted.
Prompts are versioned (`PROMPT_VERSION` in `evaluator.prompt.ts`) — bump it whenever the
prompt's meaning changes, so historical evaluations stay attributable to the prompt that
produced them. Evaluator prompt emphasizes: evidence-first scoring, generic rubric
interpretation, speaker awareness (§4), no hallucinated evidence, consistent 1–5 scoring,
conservative `NOT_ASSESSABLE` use, clear reasoning, strict structured output. Never commit
secrets — env vars for Groq/database/Vapi credentials (`.env`, gitignored).

## 16. Development priorities

P0 (must work, and does): agent CRUD/configuration, generic rubric editor, dataset/
transcript ingestion, normalized call model, Groq+LangChain evaluator, structured/Zod
output, evidence turn IDs, deterministic weighted scoring, hard rules, call scorecard,
transcript viewer, basic analytics. P1 (trust, and does): human-label comparison,
validation metrics, mismatch inspection, CSV export, prompt versioning. P2 (bonus, done):
Vapi real calls via the Web SDK. Do not sacrifice P0 reliability for P2 features.

## 17. Do not build

Unless a real requirement appears: real-time collaboration, custom WebRTC infra, custom
telephony infra, RAG/vector databases, Kafka, Kubernetes, complex microservices/event
buses, real-time analytics, large design systems, excessive animation, AI-generated UI
copy everywhere. The assessment rewards a coherent working product, not infrastructure
complexity.

## 18. Code quality

Strict TypeScript · small composable modules · explicit domain types · validate external
input (Zod at every route boundary) · all LLM output behind schemas · deterministic and
testable scoring · avoid duplicated business logic · provider integrations behind adapters
· never hardcode a supplied agent/criterion name into evaluation logic · handle failure
states explicitly, don't silently swallow evaluation errors · secrets out of source
control and logs.

## 19. Testing

`backend/src/tests/scoring_and_validation.test.ts` covers (run with `npm test`, no LLM
needed — the scoring/comparison engines are pure functions): agent/rubric config
validation, weighted-score calculation, all 4 hard-rule types, `NOT_ASSESSABLE` behavior,
evidence-turn validation, transcript normalization (both the real dataset shape and the
generic upload shape), human-vs-AI comparison calculations, consistency metrics. The
deterministic scoring engine must stay unit-testable without an LLM — don't add a test that
requires a real Groq call to `npm test`.

## 20. Definition of done

A feature solves a real product requirement · has a clear user flow · handles success and
failure states · doesn't introduce unnecessary UI complexity · uses the generic domain
model rather than special-casing examples · fits the provider-independent evaluation
architecture · has appropriate validation/tests. Prefer the simple reliable implementation
over the clever one.

## Before calling something done

```
cd backend && npm test && npx tsc --noEmit
cd frontend && npm run build
```

If you touched the evaluator prompt or scoring engine, re-run `npm run db:benchmark` (or
the zero-cost `npm run db:recompute-report` if quota's tight) and check
`notes/results/` before claiming an accuracy improvement — don't eyeball it. See
`notes/` for architecture rationale, design decisions, and known limitations before
assuming something is a bug rather than a documented tradeoff.
