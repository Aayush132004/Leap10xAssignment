export interface HumanCriterionLabel {
  callId: string;
  criterionId: string;
  humanScore: number; // 1 to 5
  notes?: string | null;
}

export interface HumanCallLabel {
  callId: string;
  humanResult?: "PASS" | "FAIL" | null;
  criteria: HumanCriterionLabel[];
}

export interface CriterionComparison {
  callId: string;
  criterionId: string;
  criterionName?: string;
  humanScore: number;
  aiScore: number | null; // null if NOT_ASSESSABLE
  delta: number | null;
  isExactMatch: boolean;
  isWithinOne: boolean;
  aiReasoning?: string;
  aiEvidenceTurns?: number[];
  aiFailureTags?: string[];
}

export interface CriterionAccuracyBreakdown {
  criterionId: string;
  criterionName?: string;
  totalPairs: number;
  exactMatches: number;
  exactAgreementPct: number;
  mae: number;
}

export interface ComparisonMetrics {
  totalPairs: number;
  exactMatches: number;
  exactAgreementPct: number;
  withinOneMatches: number;
  withinOneAgreementPct: number;
  mae: number;
  passFailEvaluated: number;
  passFailAgreements: number;
  passFailAgreementPct: number;
  mismatches: CriterionComparison[];
  failurePatterns: { tag: string; count: number }[];
  /** Human-labeled call IDs with no matching call found in the database — silently
   * excluded from every metric above, so this is what makes that exclusion visible
   * instead of leaving a confusing "6 of 8" with no explanation. */
  unmatchedCallIds: string[];
  /** Per-criterion accuracy, aggregated across all matched calls — powers the
   * per-criterion accuracy chart on the Validation page. */
  criterionBreakdown: CriterionAccuracyBreakdown[];
}

export interface AiCallEvaluationData {
  callId: string;
  externalId?: string;
  result: "PASS" | "FAIL";
  criteria: Array<{
    criterionId: string;
    criterionName?: string;
    score: number | null;
    reasoning?: string;
    evidenceTurns?: number[];
    failureTags?: string[];
  }>;
}

/**
 * Compares human ground-truth labels against AI evaluations.
 * Completely deterministic and unit testable.
 * Supports matching calls by ID or externalId, and criteria by ID or Name.
 */
export function compareEvaluations(
  humanLabels: HumanCallLabel[],
  aiEvaluations: AiCallEvaluationData[]
): ComparisonMetrics {
  const aiEvalMap = new Map<string, AiCallEvaluationData>();
  for (const ai of aiEvaluations) {
    aiEvalMap.set(ai.callId, ai);
    aiEvalMap.set(ai.callId.toLowerCase(), ai);
    if (ai.externalId) {
      aiEvalMap.set(ai.externalId, ai);
      aiEvalMap.set(ai.externalId.toLowerCase(), ai);
    }
  }

  const comparisons: CriterionComparison[] = [];
  let exactCount = 0;
  let withinOneCount = 0;
  let totalDiff = 0;
  let validScoreDiffCount = 0;

  let passFailEvaluated = 0;
  let passFailAgreements = 0;
  const failureTagCounts = new Map<string, number>();
  const unmatchedCallIds: string[] = [];
  const criterionStats = new Map<
    string,
    { name?: string; total: number; exact: number; diffSum: number; diffCount: number }
  >();

  for (const hl of humanLabels) {
    const aiEval =
      aiEvalMap.get(hl.callId) ||
      aiEvalMap.get(hl.callId.toLowerCase().trim());
    if (!aiEval) {
      unmatchedCallIds.push(hl.callId);
      continue;
    }

    if (hl.humanResult) {
      passFailEvaluated++;
      if (hl.humanResult === aiEval.result) {
        passFailAgreements++;
      }
    }

    const aiCritMap = new Map<string, (typeof aiEval.criteria)[0]>();
    for (const c of aiEval.criteria) {
      aiCritMap.set(c.criterionId, c);
      aiCritMap.set(c.criterionId.toLowerCase(), c);
      if (c.criterionName) {
        aiCritMap.set(c.criterionName, c);
        aiCritMap.set(c.criterionName.toLowerCase().trim(), c);
      }
    }

    for (const hc of hl.criteria) {
      const aiCrit =
        aiCritMap.get(hc.criterionId) ||
        aiCritMap.get(hc.criterionId.toLowerCase().trim());
      if (!aiCrit) continue;

      const aiScore = aiCrit.score;
      const isExact = aiScore === hc.humanScore;
      const delta = aiScore !== null ? Math.abs(aiScore - hc.humanScore) : null;
      const isWithinOne = delta !== null ? delta <= 1 : false;

      if (isExact) exactCount++;
      if (isWithinOne) withinOneCount++;

      if (delta !== null) {
        totalDiff += delta;
        validScoreDiffCount++;
      }

      const critKey = hc.criterionId;
      const critStat = criterionStats.get(critKey) ?? {
        name: aiCrit.criterionName,
        total: 0,
        exact: 0,
        diffSum: 0,
        diffCount: 0,
      };
      critStat.total++;
      if (isExact) critStat.exact++;
      if (delta !== null) {
        critStat.diffSum += delta;
        critStat.diffCount++;
      }
      criterionStats.set(critKey, critStat);

      if (aiCrit.failureTags) {
        for (const tag of aiCrit.failureTags) {
          failureTagCounts.set(tag, (failureTagCounts.get(tag) || 0) + 1);
        }
      }

      comparisons.push({
        callId: hl.callId,
        criterionId: hc.criterionId,
        criterionName: aiCrit.criterionName,
        humanScore: hc.humanScore,
        aiScore,
        delta,
        isExactMatch: isExact,
        isWithinOne,
        aiReasoning: aiCrit.reasoning,
        aiEvidenceTurns: aiCrit.evidenceTurns,
        aiFailureTags: aiCrit.failureTags,
      });
    }
  }

  const totalPairs = comparisons.length;
  const exactAgreementPct = totalPairs > 0 ? (exactCount / totalPairs) * 100 : 0;
  const withinOneAgreementPct = totalPairs > 0 ? (withinOneCount / totalPairs) * 100 : 0;
  const mae = validScoreDiffCount > 0 ? totalDiff / validScoreDiffCount : 0;
  const passFailAgreementPct =
    passFailEvaluated > 0 ? (passFailAgreements / passFailEvaluated) * 100 : 0;

  const mismatches = comparisons.filter((c) => !c.isExactMatch);

  const failurePatterns = Array.from(failureTagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const criterionBreakdown: CriterionAccuracyBreakdown[] = Array.from(
    criterionStats.entries()
  )
    .map(([criterionId, s]) => ({
      criterionId,
      criterionName: s.name,
      totalPairs: s.total,
      exactMatches: s.exact,
      exactAgreementPct: s.total > 0 ? Math.round((s.exact / s.total) * 1000) / 10 : 0,
      mae: s.diffCount > 0 ? Math.round((s.diffSum / s.diffCount) * 100) / 100 : 0,
    }))
    .sort((a, b) => a.exactAgreementPct - b.exactAgreementPct);

  return {
    totalPairs,
    exactMatches: exactCount,
    exactAgreementPct: Math.round(exactAgreementPct * 10) / 10,
    withinOneMatches: withinOneCount,
    withinOneAgreementPct: Math.round(withinOneAgreementPct * 10) / 10,
    mae: Math.round(mae * 100) / 100,
    passFailEvaluated,
    passFailAgreements,
    passFailAgreementPct: Math.round(passFailAgreementPct * 10) / 10,
    mismatches,
    failurePatterns,
    unmatchedCallIds,
    criterionBreakdown,
  };
}

export interface ConsistencyCriterionStat {
  criterionId: string;
  criterionName?: string;
  scores: (number | null)[]; // one entry per run, null = NOT_ASSESSABLE that run
  range: number | null; // max - min among scored (non-null) runs
  stdev: number | null; // population stdev among scored runs
  allAssessable: boolean; // false if any run returned NOT_ASSESSABLE
}

export interface ConsistencyMetrics {
  runs: number;
  overallScores: number[];
  results: ("PASS" | "FAIL")[];
  resultIsStable: boolean; // true if every run agreed on PASS/FAIL
  overallScoreRange: number; // max - min overall score across runs
  criteria: ConsistencyCriterionStat[];
}

/**
 * Measures how consistent the evaluator is when the same call is scored more than once.
 * Pure function over N evaluation runs of the same call — no LLM calls here, just stats,
 * so it is unit-testable independent of the model.
 */
export function computeConsistencyMetrics(
  runs: Array<{
    overallScore: number;
    result: "PASS" | "FAIL";
    criteria: Array<{ criterionId: string; criterionName?: string; score: number | null }>;
  }>
): ConsistencyMetrics {
  const overallScores = runs.map((r) => r.overallScore);
  const results = runs.map((r) => r.result);
  const resultIsStable = new Set(results).size <= 1;
  const overallScoreRange =
    overallScores.length > 0 ? Math.max(...overallScores) - Math.min(...overallScores) : 0;

  const criterionIds = new Set<string>();
  const nameById = new Map<string, string | undefined>();
  for (const run of runs) {
    for (const c of run.criteria) {
      criterionIds.add(c.criterionId);
      if (!nameById.has(c.criterionId)) nameById.set(c.criterionId, c.criterionName);
    }
  }

  const criteria: ConsistencyCriterionStat[] = Array.from(criterionIds).map((criterionId) => {
    const scores = runs.map(
      (r) => r.criteria.find((c) => c.criterionId === criterionId)?.score ?? null
    );
    const scored = scores.filter((s): s is number => s !== null);
    const allAssessable = scored.length === scores.length;

    let range: number | null = null;
    let stdev: number | null = null;
    if (scored.length > 0) {
      range = Math.max(...scored) - Math.min(...scored);
      const mean = scored.reduce((a, b) => a + b, 0) / scored.length;
      stdev = Math.sqrt(
        scored.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scored.length
      );
    }

    return {
      criterionId,
      criterionName: nameById.get(criterionId),
      scores,
      range,
      stdev: stdev !== null ? Math.round(stdev * 1000) / 1000 : null,
      allAssessable,
    };
  });

  return {
    runs: runs.length,
    overallScores,
    results,
    resultIsStable,
    overallScoreRange: Math.round(overallScoreRange * 100) / 100,
    criteria,
  };
}

/**
 * Exports comparison rows into a standard CSV string.
 */
export function exportComparisonToCsv(comparisons: CriterionComparison[]): string {
  const headers = [
    "Call ID",
    "Criterion ID",
    "Criterion Name",
    "Human Score",
    "AI Score",
    "Delta",
    "Exact Match",
    "Within +/-1",
    "AI Reasoning",
    "Evidence Turns",
    "Failure Tags",
  ];

  const escapeCsv = (val: string | number | boolean | null | undefined): string => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = comparisons.map((c) => [
    escapeCsv(c.callId),
    escapeCsv(c.criterionId),
    escapeCsv(c.criterionName ?? ""),
    escapeCsv(c.humanScore),
    escapeCsv(c.aiScore !== null ? c.aiScore : "NOT_ASSESSABLE"),
    escapeCsv(c.delta !== null ? c.delta : ""),
    escapeCsv(c.isExactMatch ? "YES" : "NO"),
    escapeCsv(c.isWithinOne ? "YES" : "NO"),
    escapeCsv(c.aiReasoning ?? ""),
    escapeCsv(c.aiEvidenceTurns?.join(";") ?? ""),
    escapeCsv(c.aiFailureTags?.join(";") ?? ""),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
