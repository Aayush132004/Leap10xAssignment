import type { TranscriptTurn } from "../modules/calls/call.schema";

interface CriterionScore {
  score: number | null; // null = NOT_ASSESSABLE
  weight: number;
  failureTags?: string[];
}

interface HardRuleConfig {
  type: string;
  criterionId?: string | null;
  threshold?: number | null;
  tags?: string[] | null;
}

interface ScoringInput {
  criterionScores: Map<string, CriterionScore>;
  hardRules: HardRuleConfig[];
  passThreshold: number;
}

export interface ScoringResult {
  overallScore: number;
  result: "PASS" | "FAIL";
  hardRuleViolations: string[];
}

/**
 * Deterministic scoring engine.
 * The LLM provides per-criterion semantic scores.
 * This engine calculates the weighted average and applies hard rules.
 *
 * NOT_ASSESSABLE policy: exclude that criterion's weight from the
 * weighted-score denominator. If ALL criteria are NOT_ASSESSABLE,
 * the overall score defaults to 0 and result is FAIL.
 */
export function calculateScore(input: ScoringInput): ScoringResult {
  const { criterionScores, hardRules, passThreshold } = input;

  // Calculate weighted average, excluding NOT_ASSESSABLE
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [, cs] of criterionScores) {
    if (cs.score !== null) {
      weightedSum += cs.score * cs.weight;
      totalWeight += cs.weight;
    }
  }

  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Apply hard rules
  const hardRuleViolations: string[] = [];

  for (const rule of hardRules) {
    switch (rule.type) {
      case "criterion_below": {
        if (rule.criterionId && rule.threshold != null) {
          const cs = criterionScores.get(rule.criterionId);
          if (cs && cs.score !== null && cs.score < rule.threshold) {
            hardRuleViolations.push(
              `Criterion "${rule.criterionId}" scored ${cs.score}, below threshold ${rule.threshold}`
            );
          }
        }
        break;
      }
      case "any_below": {
        if (rule.threshold != null) {
          for (const [criterionId, cs] of criterionScores) {
            if (cs.score !== null && cs.score < rule.threshold) {
              hardRuleViolations.push(
                `Criterion "${criterionId}" scored ${cs.score}, below minimum threshold ${rule.threshold}`
              );
            }
          }
        }
        break;
      }
      case "not_assessable_fail": {
        if (rule.criterionId) {
          const cs = criterionScores.get(rule.criterionId);
          if (cs && cs.score === null) {
            hardRuleViolations.push(
              `Criterion "${rule.criterionId}" was NOT_ASSESSABLE, which triggers a hard failure`
            );
          }
        } else {
          // Any NOT_ASSESSABLE fails
          for (const [criterionId, cs] of criterionScores) {
            if (cs.score === null) {
              hardRuleViolations.push(
                `Criterion "${criterionId}" was NOT_ASSESSABLE, which triggers a hard failure`
              );
            }
          }
        }
        break;
      }
      case "failure_tag_any": {
        // Fails if any criterion's failureTags intersects the rule's configured tag list.
        // Lets a rubric express a behavioral hard rule (e.g. "inventing a feature is an
        // automatic fail") generically, without hardcoding to a specific criterion or score.
        if (rule.tags && rule.tags.length > 0) {
          const ruleTags = new Set(rule.tags.map((t) => t.toLowerCase().trim()));
          for (const [criterionId, cs] of criterionScores) {
            const hit = (cs.failureTags ?? []).find((t) =>
              ruleTags.has(t.toLowerCase().trim())
            );
            if (hit) {
              hardRuleViolations.push(
                `Criterion "${criterionId}" was flagged with failure tag "${hit}", which triggers a hard failure`
              );
            }
          }
        }
        break;
      }
    }
  }

  // Determine PASS/FAIL
  const passedThreshold = overallScore >= passThreshold;
  const passedHardRules = hardRuleViolations.length === 0;
  const result: "PASS" | "FAIL" = passedThreshold && passedHardRules ? "PASS" : "FAIL";

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    result,
    hardRuleViolations,
  };
}

/**
 * Validates that all evidence turn indices reference actual turns in the transcript.
 */
export function validateEvidenceTurns(
  evidenceTurnIndices: number[],
  transcript: TranscriptTurn[]
): { valid: number[]; invalid: number[] } {
  const validIndices = new Set(transcript.map((t) => t.index));
  const valid: number[] = [];
  const invalid: number[] = [];

  for (const idx of evidenceTurnIndices) {
    if (validIndices.has(idx)) {
      valid.push(idx);
    } else {
      invalid.push(idx);
    }
  }

  return { valid, invalid };
}
