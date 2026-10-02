# Dataset guide

Everything in this folder is synthetic. The companies, people and numbers are made up.

```
agents/        3 agent descriptions, written the way a customer would describe them
transcripts/   20 call transcripts (JSON), across those 3 agents
labels/        human scores for 8 of those calls (dev-labels.csv)
```

## Agents

Each file in `agents/` is a plain-text description: persona, goal, opening line,
guidelines, any facts or policy, and an assessment rubric with weights and a pass
threshold. Your product should let someone set up each of these **through your
configuration, without code changes**. How you model the configuration is up to you.

## Transcript format

```json
{
  "call_id": "sup-01",
  "agent_id": "support-nimbus-broadband",
  "started_at": "2026-09-08T10:12:04+05:30",
  "duration_sec": 149.9,
  "end_reason": "completed",
  "language": "en-IN",
  "turns": [
    { "idx": 0, "speaker": "agent", "start_sec": 0.3, "end_sec": 5.1, "text": "..." },
    { "idx": 1, "speaker": "user",  "start_sec": 5.5, "end_sec": 7.6, "text": "..." }
  ]
}
```

- `speaker` is `agent` (the voice agent) or `user` (whoever is on the other end of the line).
- `end_reason` is one of `completed`, `transferred`, `dropped`, `caller_hung_up`, `no_response`.
- `language` is `en-IN` or `hi-en` (Hinglish).
- `[inaudible]` marks speech the transcription could not make out. Gaps between
  `end_sec` and the next `start_sec` are silence.
- These are real-world-style calls. Some are messy.

## Labels

`labels/dev-labels.csv` has one row per call and criterion, plus an `OVERALL` row:

| Column | Meaning |
|---|---|
| `score` | Criterion rows: 1–5, or `NA` where the call gives too little evidence to judge. `OVERALL` rows: `pass`, `fail` or `NA` |
| `evidence_turns` | `idx` values of the turns the score is based on, separated by `;` |
| `notes` | why this score was given. `OVERALL` notes include the weighted total and any hard rule that fired |

Use them to check how closely your scoring matches a human. **We will test your system on
calls you have not seen**, so don't tune it to these 8 alone.
