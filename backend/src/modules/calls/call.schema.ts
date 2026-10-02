import { z } from "zod";

export const transcriptTurnSchema = z.object({
  index: z.number().int().min(0),
  speaker: z.preprocess((val) => {
    if (typeof val !== "string") return "user";
    const lower = val.toLowerCase().trim();
    if (
      ["agent", "assistant", "bot", "ai", "system", "rep", "representative", "support"].includes(
        lower
      )
    ) {
      return "agent";
    }
    return "user";
  }, z.enum(["agent", "user"])),
  text: z.string().min(1),
  startTime: z.number().optional().nullable(),
  endTime: z.number().optional().nullable(),
});

const durationSchema = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null) return null;
    const num = typeof v === "string" ? parseFloat(v) : v;
    return isNaN(num) || num <= 0 ? null : Math.round(num);
  });

export const createCallSchema = z.object({
  agentId: z.string().uuid("Valid agent ID is required"),
  source: z.enum(["dataset", "upload", "vapi"]),
  externalId: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  durationSeconds: durationSchema,
  transcript: z.array(transcriptTurnSchema).min(1, "Transcript must have at least one turn"),
});

export const bulkCreateCallsSchema = z.object({
  agentId: z.string().uuid("Valid agent ID is required"),
  calls: z
    .array(
      z.object({
        source: z.enum(["dataset", "upload", "vapi"]).default("dataset"),
        externalId: z.string().optional().nullable(),
        language: z.string().optional().nullable(),
        durationSeconds: durationSchema,
        transcript: z.array(transcriptTurnSchema).min(1),
      })
    )
    .min(1, "At least one call is required"),
});

export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;
export type CreateCallInput = z.infer<typeof createCallSchema>;
export type BulkCreateCallsInput = z.infer<typeof bulkCreateCallsSchema>;
