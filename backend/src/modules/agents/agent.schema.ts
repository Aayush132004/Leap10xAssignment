import { z } from "zod";

export const criterionSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Criterion name is required"),
  weight: z.number().positive("Weight must be greater than 0").max(10).default(1.0),
  description: z.string().min(1, "Criterion description is required"),
  goodLooksLike: z.string().optional().nullable(),
  badLooksLike: z.string().optional().nullable(),
});

export const hardRuleSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["criterion_below", "any_below", "not_assessable_fail", "failure_tag_any"]),
  criterionId: z.string().optional().nullable(),
  threshold: z.number().int().min(1).max(5).optional().nullable(),
  tags: z.array(z.string()).default([]),
  description: z.string().optional().nullable(),
});

export const createAgentSchema = z.object({
  name: z.string().min(1, "Agent name is required"),
  useCase: z.string().optional().nullable(),
  persona: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),
  openingLine: z.string().optional().nullable(),
  guidelines: z.array(z.string()).default([]),
  knowledge: z.array(z.string()).default([]),
  scoringNotes: z.array(z.string()).default([]),
  language: z.string().default("en"),
  evaluationTarget: z.string().optional().nullable(),
  passThreshold: z.number().min(1).max(5).default(3.0),
  criteria: z.array(criterionSchema).default([]),
  hardRules: z.array(hardRuleSchema).default([]),
});

export const updateAgentSchema = createAgentSchema.partial();

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type CriterionInput = z.infer<typeof criterionSchema>;
export type HardRuleInput = z.infer<typeof hardRuleSchema>;
