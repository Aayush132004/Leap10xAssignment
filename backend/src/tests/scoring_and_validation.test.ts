import { describe, it } from "node:test";
import assert from "node:assert";
import { calculateScore, validateEvidenceTurns } from "../ai/scoring.engine";
import { createAgentSchema, criterionSchema } from "../modules/agents/agent.schema";
import { parseTextTranscript, parseCsvTranscript } from "../adapters/upload.adapter";
import { normalizeDatasetCalls } from "../adapters/dataset.adapter";
import {
  compareEvaluations,
  exportComparisonToCsv,
  computeConsistencyMetrics,
  type HumanCallLabel,
  type AiCallEvaluationData,
} from "../ai/comparison.engine";

describe("Deterministic Scoring Engine & Evaluation Logic", () => {
  describe("Agent & Rubric Configuration Validation", () => {
    it("should accept valid agent configuration with rubric and hard rules", () => {
      const valid = {
        name: "Customer Support Agent",
        persona: "Helpful and polite support assistant",
        goal: "Resolve customer inquiries efficiently",
        openingLine: "Hello, how can I help you today?",
        guidelines: ["Be polite", "Verify account details"],
        passThreshold: 3.5,
        rubric: {
          criteria: [
            {
              name: "Politeness & Tone",
              weight: 1.5,
              description: "Agent maintained professional and empathetic tone",
            },
            {
              name: "Accuracy",
              weight: 2.0,
              description: "Information provided was factual and correct",
            },
          ],
          hardRules: [
            {
              type: "criterion_below",
              criterionId: "crit-1",
              threshold: 2,
              description: "Must score at least 2 on Politeness",
            },
          ],
        },
      };

      const result = createAgentSchema.safeParse(valid);
      assert.strictEqual(result.success, true);
    });

    it("should reject agent configuration with missing name or invalid threshold", () => {
      const invalid = {
        name: "",
        passThreshold: 6.0, // max is 5.0
      };

      const result = createAgentSchema.safeParse(invalid);
      assert.strictEqual(result.success, false);
      if (!result.success) {
        assert.ok(result.error.errors.some((e) => e.path.includes("name")));
        assert.ok(result.error.errors.some((e) => e.path.includes("passThreshold")));
      }
    });

    it("should reject criterion with negative or zero weight", () => {
      const invalidCriteria = {
        name: "Invalid Criterion",
        weight: 0,
        description: "Weight cannot be 0",
      };

      const result = criterionSchema.safeParse(invalidCriteria);
      assert.strictEqual(result.success, false);
    });
  });

  describe("Weighted-Score Calculation", () => {
    it("should accurately calculate weighted average of scored criteria", () => {
      const criterionScores = new Map([
        ["c1", { score: 4, weight: 2.0 }], // 8
        ["c2", { score: 2, weight: 1.0 }], // 2
        ["c3", { score: 5, weight: 1.0 }], // 5
      ]);
      // (8 + 2 + 5) / (2 + 1 + 1) = 15 / 4 = 3.75

      const result = calculateScore({
        criterionScores,
        hardRules: [],
        passThreshold: 3.0,
      });

      assert.strictEqual(result.overallScore, 3.75);
      assert.strictEqual(result.result, "PASS");
      assert.strictEqual(result.hardRuleViolations.length, 0);
    });

    it("should return FAIL when weighted average is below passThreshold", () => {
      const criterionScores = new Map([
        ["c1", { score: 2, weight: 1.0 }],
        ["c2", { score: 2, weight: 1.0 }],
      ]);

      const result = calculateScore({
        criterionScores,
        hardRules: [],
        passThreshold: 3.0,
      });

      assert.strictEqual(result.overallScore, 2.0);
      assert.strictEqual(result.result, "FAIL");
    });
  });

  describe("NOT_ASSESSABLE Policy", () => {
    it("should exclude NOT_ASSESSABLE criteria from denominator", () => {
      const criterionScores = new Map([
        ["c1", { score: 4, weight: 1.0 }],
        ["c2", { score: null, weight: 2.0 }], // NOT_ASSESSABLE
      ]);
      // Total weight used: 1.0, weighted sum: 4. Overall score = 4.0

      const result = calculateScore({
        criterionScores,
        hardRules: [],
        passThreshold: 3.0,
      });

      assert.strictEqual(result.overallScore, 4.0);
      assert.strictEqual(result.result, "PASS");
    });

    it("should score 0 and FAIL if ALL criteria are NOT_ASSESSABLE", () => {
      const criterionScores = new Map([
        ["c1", { score: null, weight: 1.0 }],
        ["c2", { score: null, weight: 2.0 }],
      ]);

      const result = calculateScore({
        criterionScores,
        hardRules: [],
        passThreshold: 3.0,
      });

      assert.strictEqual(result.overallScore, 0);
      assert.strictEqual(result.result, "FAIL");
    });
  });

  describe("Hard Rules Behavior", () => {
    it("criterion_below: should fail when a specific criterion falls below threshold even if overall score is high", () => {
      const criterionScores = new Map([
        ["crit-compliance", { score: 1, weight: 1.0 }], // 1
        ["crit-tone", { score: 5, weight: 10.0 }],       // 50
      ]);
      // Overall score: 51 / 11 = 4.64, well above passThreshold 3.0

      const result = calculateScore({
        criterionScores,
        hardRules: [
          {
            type: "criterion_below",
            criterionId: "crit-compliance",
            threshold: 2,
          },
        ],
        passThreshold: 3.0,
      });

      assert.strictEqual(result.overallScore, 4.64);
      assert.strictEqual(result.result, "FAIL");
      assert.strictEqual(result.hardRuleViolations.length, 1);
      assert.ok(result.hardRuleViolations[0].includes("crit-compliance"));
    });

    it("any_below: should fail if ANY criterion falls below minimum threshold", () => {
      const criterionScores = new Map([
        ["c1", { score: 5, weight: 1.0 }],
        ["c2", { score: 1, weight: 1.0 }],
      ]);

      const result = calculateScore({
        criterionScores,
        hardRules: [
          {
            type: "any_below",
            threshold: 2,
          },
        ],
        passThreshold: 3.0,
      });

      assert.strictEqual(result.result, "FAIL");
      assert.ok(result.hardRuleViolations[0].includes("c2"));
    });

    it("failure_tag_any: should fail if any criterion's failureTags intersects the rule's tag list, even with a high overall score", () => {
      const criterionScores = new Map([
        ["crit-value", { score: 5, weight: 1.0, failureTags: ["invented_feature"] }],
        ["crit-discovery", { score: 5, weight: 1.0, failureTags: [] }],
      ]);
      // Overall score: 5.0, well above passThreshold 3.0

      const result = calculateScore({
        criterionScores,
        hardRules: [
          {
            type: "failure_tag_any",
            tags: ["invented_feature", "guaranteed_result", "unauthorized_discount"],
          },
        ],
        passThreshold: 3.0,
      });

      assert.strictEqual(result.overallScore, 5.0);
      assert.strictEqual(result.result, "FAIL");
      assert.strictEqual(result.hardRuleViolations.length, 1);
      assert.ok(result.hardRuleViolations[0].includes("invented_feature"));
    });

    it("failure_tag_any: should not fail when no criterion carries a matching tag", () => {
      const criterionScores = new Map([
        ["crit-value", { score: 5, weight: 1.0, failureTags: ["minor_delay"] }],
      ]);

      const result = calculateScore({
        criterionScores,
        hardRules: [
          { type: "failure_tag_any", tags: ["invented_feature"] },
        ],
        passThreshold: 3.0,
      });

      assert.strictEqual(result.result, "PASS");
      assert.strictEqual(result.hardRuleViolations.length, 0);
    });

    it("not_assessable_fail: should fail if required criterion is NOT_ASSESSABLE", () => {
      const criterionScores = new Map([
        ["crit-critical", { score: null, weight: 1.0 }],
        ["crit-other", { score: 5, weight: 1.0 }],
      ]);

      const result = calculateScore({
        criterionScores,
        hardRules: [
          {
            type: "not_assessable_fail",
            criterionId: "crit-critical",
          },
        ],
        passThreshold: 3.0,
      });

      assert.strictEqual(result.result, "FAIL");
      assert.ok(result.hardRuleViolations[0].includes("NOT_ASSESSABLE"));
    });
  });

  describe("Evidence Turn Validation", () => {
    const transcript = [
      { index: 0, speaker: "agent" as const, text: "Hello" },
      { index: 1, speaker: "user" as const, text: "Hi there" },
      { index: 2, speaker: "agent" as const, text: "How can I help you today?" },
    ];

    it("should correctly identify existing turn indices and flag invalid ones", () => {
      const citedTurns = [0, 2, 5, 99];
      const result = validateEvidenceTurns(citedTurns, transcript);

      assert.deepStrictEqual(result.valid, [0, 2]);
      assert.deepStrictEqual(result.invalid, [5, 99]);
    });
  });

  describe("Transcript Normalization Adapters", () => {
    it("should parse text format transcripts with speaker prefixes", () => {
      const text = `
Agent: Welcome to Support.
Customer: I need help with my account.
Agent: I can assist with that. Could you share your email?
      `.trim();

      const turns = parseTextTranscript(text);
      assert.strictEqual(turns.length, 3);
      assert.strictEqual(turns[0].speaker, "agent");
      assert.strictEqual(turns[0].text, "Welcome to Support.");
      assert.strictEqual(turns[1].speaker, "user");
      assert.strictEqual(turns[1].text, "I need help with my account.");
      assert.strictEqual(turns[2].speaker, "agent");
    });

    it("should parse CSV format transcripts with speaker and text columns", () => {
      const csv = `speaker,text\nagent,"Hello there"\nuser,"I need a refund"`;
      const turns = parseCsvTranscript(csv);
      assert.strictEqual(turns.length, 2);
      assert.strictEqual(turns[0].speaker, "agent");
      assert.strictEqual(turns[0].text, "Hello there");
      assert.strictEqual(turns[1].speaker, "user");
      assert.strictEqual(turns[1].text, "I need a refund");
    });

    it("should normalize dataset calls and map speaker terms consistently", () => {
      const raw = [
        {
          id: "raw-call-1",
          transcript: [
            { speaker: "assistant", text: "How can I help?" },
            { speaker: "client", text: "I have a question." },
          ],
        },
      ];

      const [normalized] = normalizeDatasetCalls(raw);
      assert.strictEqual(normalized.externalId, "raw-call-1");
      assert.strictEqual(normalized.transcript.length, 2);
      assert.strictEqual(normalized.transcript[0].speaker, "agent");
      assert.strictEqual(normalized.transcript[0].text, "How can I help?");
      assert.strictEqual(normalized.transcript[1].speaker, "user");
      assert.strictEqual(normalized.transcript[1].text, "I have a question.");
    });

    it("should normalize the real assignment dataset shape (call_id/agent_id/turns/idx/start_sec/end_sec)", () => {
      const raw = [
        {
          call_id: "sup-01",
          agent_id: "support-nimbus-broadband",
          duration_sec: 149.9,
          language: "en-IN",
          turns: [
            { idx: 0, speaker: "agent", start_sec: 0.3, end_sec: 5.1, text: "Hi there." },
            { idx: 1, speaker: "user", start_sec: 5.5, end_sec: 7.6, text: "Hello." },
          ],
        },
      ];

      const [normalized] = normalizeDatasetCalls(raw);
      assert.strictEqual(normalized.externalId, "sup-01");
      assert.strictEqual(normalized.agentExternalId, "support-nimbus-broadband");
      assert.strictEqual(normalized.durationSeconds, 150);
      assert.strictEqual(normalized.transcript.length, 2);
      assert.strictEqual(normalized.transcript[0].index, 0);
      assert.strictEqual(normalized.transcript[0].startTime, 0.3);
      assert.strictEqual(normalized.transcript[0].endTime, 5.1);
      assert.strictEqual(normalized.transcript[1].speaker, "user");
    });
  });

  describe("Human-vs-AI Comparison Engine", () => {
    it("should calculate exact agreement, agreement within +/-1, MAE, and PASS/FAIL agreement", () => {
      const humanLabels: HumanCallLabel[] = [
        {
          callId: "call-1",
          humanResult: "PASS",
          criteria: [
            { callId: "call-1", criterionId: "c1", humanScore: 4 },
            { callId: "call-1", criterionId: "c2", humanScore: 3 },
          ],
        },
        {
          callId: "call-2",
          humanResult: "FAIL",
          criteria: [
            { callId: "call-2", criterionId: "c1", humanScore: 2 },
            { callId: "call-2", criterionId: "c2", humanScore: 5 },
          ],
        },
      ];

      const aiEvaluations: AiCallEvaluationData[] = [
        {
          callId: "call-1",
          result: "PASS",
          criteria: [
            { criterionId: "c1", criterionName: "Tone", score: 4, reasoning: "Good tone" }, // exact
            { criterionId: "c2", criterionName: "Accuracy", score: 4, reasoning: "Minor slip", failureTags: ["slight_delay"] }, // delta 1 (within 1)
          ],
        },
        {
          callId: "call-2",
          result: "FAIL",
          criteria: [
            { criterionId: "c1", criterionName: "Tone", score: 2, reasoning: "Flat tone" }, // exact
            { criterionId: "c2", criterionName: "Accuracy", score: 2, reasoning: "Wrong info", failureTags: ["wrong_details"] }, // delta 3 (mismatch)
          ],
        },
      ];

      const comparison = compareEvaluations(humanLabels, aiEvaluations);

      // Total criterion pairs = 4
      assert.strictEqual(comparison.totalPairs, 4);
      // Exact matches: c1 on call-1, c1 on call-2 = 2 matches (50%)
      assert.strictEqual(comparison.exactMatches, 2);
      assert.strictEqual(comparison.exactAgreementPct, 50.0);
      // Within +/-1: call-1 c1 (0), call-1 c2 (1), call-2 c1 (0) = 3 matches (75%)
      assert.strictEqual(comparison.withinOneMatches, 3);
      assert.strictEqual(comparison.withinOneAgreementPct, 75.0);
      // MAE: (0 + 1 + 0 + 3) / 4 = 4 / 4 = 1.0
      assert.strictEqual(comparison.mae, 1.0);
      // PASS/FAIL agreement: both calls agree (2/2 = 100%)
      assert.strictEqual(comparison.passFailAgreements, 2);
      assert.strictEqual(comparison.passFailAgreementPct, 100.0);

      // Mismatches should contain the 2 non-exact items
      assert.strictEqual(comparison.mismatches.length, 2);

      // Failure patterns should count tags
      assert.ok(comparison.failurePatterns.length >= 2);
    });

    it("should flag an unstable PASS/FAIL result and compute per-criterion spread across repeated runs", () => {
      const runs = [
        {
          overallScore: 3.6,
          result: "PASS" as const,
          criteria: [
            { criterionId: "c1", criterionName: "Diagnosis", score: 4 },
            { criterionId: "c2", criterionName: "Compliance", score: 3 },
          ],
        },
        {
          overallScore: 3.4,
          result: "FAIL" as const,
          criteria: [
            { criterionId: "c1", criterionName: "Diagnosis", score: 3 },
            { criterionId: "c2", criterionName: "Compliance", score: 3 },
          ],
        },
        {
          overallScore: 3.5,
          result: "PASS" as const,
          criteria: [
            { criterionId: "c1", criterionName: "Diagnosis", score: 4 },
            { criterionId: "c2", criterionName: "Compliance", score: 3 },
          ],
        },
      ];

      const metrics = computeConsistencyMetrics(runs);

      assert.strictEqual(metrics.runs, 3);
      assert.strictEqual(metrics.resultIsStable, false); // PASS, FAIL, PASS
      assert.strictEqual(metrics.overallScoreRange, 0.2);

      const c1 = metrics.criteria.find((c) => c.criterionId === "c1")!;
      assert.strictEqual(c1.range, 1); // scores 4,3,4
      assert.ok(c1.stdev! > 0);

      const c2 = metrics.criteria.find((c) => c.criterionId === "c2")!;
      assert.strictEqual(c2.range, 0); // always 3
      assert.strictEqual(c2.stdev, 0);
    });

    it("should mark a criterion as not fully assessable if any run returned NOT_ASSESSABLE", () => {
      const runs = [
        { overallScore: 4.0, result: "PASS" as const, criteria: [{ criterionId: "c1", score: 4 }] },
        { overallScore: 4.0, result: "PASS" as const, criteria: [{ criterionId: "c1", score: null }] },
      ];
      const metrics = computeConsistencyMetrics(runs);
      assert.strictEqual(metrics.criteria[0].allAssessable, false);
      assert.strictEqual(metrics.resultIsStable, true);
    });

    it("should export comparison rows to valid CSV format", () => {
      const comparisons = [
        {
          callId: "call-1",
          criterionId: "c1",
          criterionName: "Tone",
          humanScore: 5,
          aiScore: 4,
          delta: 1,
          isExactMatch: false,
          isWithinOne: true,
          aiReasoning: "Polite, but slight delay",
          aiEvidenceTurns: [1, 2],
          aiFailureTags: ["delay"],
        },
      ];

      const csv = exportComparisonToCsv(comparisons);
      assert.ok(csv.startsWith("Call ID,Criterion ID"));
      assert.ok(csv.includes("call-1"));
      assert.ok(csv.includes("Tone"));
      assert.ok(csv.includes('"Polite, but slight delay"'));
    });
  });
});
