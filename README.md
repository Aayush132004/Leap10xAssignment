# Voice Agent Studio

A configuration-first platform for creating voice agents, evaluating call transcripts, and analyzing agent performance with evidence-backed scoring. Not a voice-calling app — the core product is **Agent Configuration + Call Evaluation + Analytics**; a real browser-based call (via Vapi) is one optional way to produce a transcript to evaluate, not the point of the app.

## What's implemented right now

Everything below is real, working, and covered by the test suite or a real benchmark run — nothing here is a stub or a "planned" feature.

- **Agent configuration**, no code required: persona, goal, opening line, guidelines, knowledge/policy facts, language, an `evaluationTarget` (which speaker in the transcript actually gets graded), a pass threshold, and a weighted rubric — all created/edited through the UI (Agents → New Agent / Edit).
- **Rubric editor**: weighted criteria with good/bad examples, plus 4 kinds of hard rule (`criterion_below`, `any_below`, `not_assessable_fail`, `failure_tag_any` — a purely behavioral rule, e.g. "inventing a price is an automatic fail", expressed generically rather than hardcoded to one agent).
- **Call ingestion**: paste/upload a transcript (JSON, CSV, or plain text with `Speaker: text` lines), bulk-import a dataset, or place a real browser call via Vapi — all three converge into the same internal shape before evaluation ever sees them.
- **AI evaluation**: LangChain + Groq judges each criterion semantically (score, reasoning, cited evidence turns); a separate, deterministic, unit-tested scoring engine in plain TypeScript computes the actual weighted score and applies hard rules — the LLM never computes the final number or PASS/FAIL.
- **Evidence-backed scorecards**: every criterion score links to the specific transcript turns that justify it, verified against the real transcript (not just trusted from the LLM).
- **Analytics**: per-agent pass rate, criterion score distributions, common failure tags — always computed from already-stored evaluations, never a fresh LLM call.
- **Human validation & trust**: paste/upload human-labeled ground truth and get exact-agreement / within-±1 / MAE / PASS-FAIL-agreement metrics, a per-criterion accuracy chart, an agreement-breakdown chart, mismatch inspection with AI reasoning, and CSV export — plus explicit reporting of any labels that couldn't be matched to a call, instead of silently dropping them.
- **Consistency checking**: re-run the same call's evaluation N times and see per-criterion score spread and PASS/FAIL stability — a real measured trust signal, not just accuracy-vs-human.
- **Real voice calls (Vapi, optional)**: a live browser-based call over WebRTC using only a public key — no phone number, no Twilio, no backend credential — with a real-time transcript, evaluated through the exact same pipeline as any other call afterward.
- **Delete confirmations everywhere** a delete exists (agents, calls), with cascading-delete impact shown up front for agents.
- **Dark theme** (the only theme).

## Architecture

```
backend/   → Express + TypeScript + Prisma + LangChain/Groq
frontend/  → Next.js + TypeScript + Tailwind CSS
```

```
Agent Configuration + Normalized Call (from dataset / upload / Vapi — same shape either way)
        ↓
  LangChain + Groq        → semantic judgment only (score, reasoning, evidence) per criterion
        ↓
  Zod-validated output    → rejects malformed LLM responses outright
        ↓
  Deterministic scoring   → weighted average + hard rules, plain TypeScript, unit-tested,
                             no LLM involved in this step at all
        ↓
  Evaluation (stored)     → snapshots the exact agent config used, for reproducibility
        ↓
  Analytics               → reads stored evaluations only, never a fresh LLM call
```

See `CLAUDE.md` §3–§9 for the full architectural rationale, and `REPORT.md` for the
"why" behind the biggest design decisions.

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL (any provider — developed against a hosted [Neon](https://neon.tech) instance)
- A [Groq](https://console.groq.com) API key (free tier is enough to run this)

### 1. Setup Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL and GROQ_API_KEY

npm install
npx prisma db push
npm test         # Runs deterministic scoring, hard-rule, adapter and comparison unit tests
npm run dev
```

Agents and calls are created manually through the app (Agents → New Agent, Calls → Upload
Transcript) — there is no seed script. See `datasets/agents/*.md` for the 3 real agent
specs and `datasets/transcripts/` for real transcripts if you want to recreate them by
hand.

### 2. Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

### 3. Open
Navigate to `http://localhost:3000`

### 4. Measure accuracy & consistency against the human labels

```bash
cd backend
npm run db:benchmark
```

Evaluates every call currently in your database once, re-runs whichever of those calls
match `datasets/labels/dev-labels.csv` 3× each to measure consistency, and writes real
(not fabricated) results to `notes/results/`. See `notes/REPORT.md` for the write-up. You
can also paste or upload `datasets/labels/dev-labels.csv` directly on the **Validation**
page in the app for the same comparison, interactively. Requires calls to already exist
(created manually — see step 1) and, for the consistency phase, calls whose `externalId`
matches a `call_id` in the labels CSV.

This makes real Groq calls proportional to however many calls are in your DB — on a
free-tier daily token cap it can hit a 429 partway through (see
`notes/known-limitations.md`). If it does, whatever accuracy results already persisted to
the DB before the failure, so `npm run db:recompute-report` recomputes accuracy (and
whatever partial consistency data exists) from the database with **zero** additional API
calls.

### 5. Real calls via Vapi (optional, P2 bonus)

Real calls run entirely in the browser via Vapi's Web SDK — no phone number, no Twilio,
no webhook, no tunnel. Get your **Public Key** from
[dashboard.vapi.ai/org/api-keys](https://dashboard.vapi.ai/org/api-keys) and add it to
`frontend/.env.local` (create the file if it doesn't exist):

```bash
# frontend/.env.local
NEXT_PUBLIC_VAPI_PUBLIC_KEY="..."
```

Then open any agent's detail page and click **Call Now** — it uses your microphone to hold
a live conversation with the agent, then saves the transcript through the same pipeline as
any other call (`source: "vapi"`). Optional backend env vars
(`VAPI_MODEL_PROVIDER`/`VAPI_VOICE_PROVIDER`/etc. in `backend/.env.example`) pick which of
Vapi's providers to use — the backend needs no Vapi credential at all, since it only builds
the assistant config from the agent's own persona/guidelines/knowledge. See
`notes/known-limitations.md` for what's been verified vs. not.

## Docs

- **`REPORT.pdf`** (project root) — the assignment report, formatted: how configuration and assessment work and why, accuracy vs. human labels, consistency, where it fails, what's next, and how AI was used to build this. Source is `notes/REPORT.md`.
- `CLAUDE.md` — the full instruction file given to AI coding tools while building this (architecture rules, do-not-build list, code-quality standards)
- `notes/codebase-guide.md` — what every file does, known flaws & how to fix them, benefits & use cases
- `notes/architecture.md` — how configuration → evaluation → scoring actually works
- `notes/decisions.md` — non-obvious design decisions and assumptions
- `notes/known-limitations.md` — honest gaps, including a real prompt bug found and fixed during development
- `notes/results/` — real benchmark output (not fabricated) backing the report

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/agents` | Create agent |
| GET | `/api/agents/:id` | Get agent detail |
| PATCH | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |
| GET | `/api/calls` | List calls |
| POST | `/api/calls` | Create call |
| POST | `/api/calls/bulk` | Bulk import calls |
| POST | `/api/calls/:id/evaluate` | Run evaluation |
| GET | `/api/calls/:id/evaluation` | Get evaluations |
| POST | `/api/calls/:id/consistency-check` | Re-evaluate a call N times (default 3) and return score/PASS-FAIL variance |
| GET | `/api/analytics/dashboard` | Dashboard summary |
| GET | `/api/analytics/agents/:id` | Agent analytics |
| POST | `/api/validation/compare` | Compare human labels against AI evaluations |
| GET | `/api/voice/assistant-config/:agentId` | Vapi assistant config built from the agent, for the Web SDK |
