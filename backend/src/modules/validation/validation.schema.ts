import { z } from "zod";

export const humanCriterionLabelSchema = z.object({
  callId: z.string(),
  criterionId: z.string(),
  humanScore: z.coerce.number().min(1).max(5),
  notes: z.string().optional().nullable(),
});

export const humanCallLabelSchema = z.object({
  callId: z.string(),
  humanResult: z.enum(["PASS", "FAIL"]).optional().nullable(),
  criteria: z.array(humanCriterionLabelSchema),
});

export const validateBatchSchema = z.object({
  labels: z.array(humanCallLabelSchema),
});

export type ValidateBatchInput = z.infer<typeof validateBatchSchema>;
