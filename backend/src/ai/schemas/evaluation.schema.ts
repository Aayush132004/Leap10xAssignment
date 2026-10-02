import { z } from "zod";

/**
 * Schema for a single criterion evaluation returned by the LLM.
 * The LLM provides semantic assessment; the backend calculates final scores.
 */
export const criterionEvaluationOutputSchema = z.object({
  criterionId: z.string().describe("The ID of the criterion being evaluated"),
  score: z
    .union([z.number().int().min(1).max(5), z.literal("NOT_ASSESSABLE")])
    .describe("Score from 1-5, or NOT_ASSESSABLE if evidence is genuinely insufficient"),
  reasoning: z
    .string()
    .min(1)
    .describe("Detailed reasoning explaining the score, referencing specific transcript evidence"),
  evidenceTurnIndices: z
    .array(z.number().int().min(0))
    .describe("Transcript turn indices that support this assessment"),
  failureTags: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Optional tags categorizing failure modes"),
});

/**
 * Full evaluation output schema from the LLM.
 */
export const evaluationOutputSchema = z.object({
  criteriaEvaluations: z
    .array(criterionEvaluationOutputSchema)
    .min(1)
    .describe("Per-criterion evaluations"),
  unusualThings: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Any unusual or noteworthy observations about the conversation"),
});

export type CriterionEvaluationOutput = z.infer<typeof criterionEvaluationOutputSchema>;
export type EvaluationOutput = z.infer<typeof evaluationOutputSchema>;
