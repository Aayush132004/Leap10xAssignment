import { ChatGroq } from "@langchain/groq";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { config } from "../config";
import { evaluationOutputSchema, type EvaluationOutput } from "./schemas/evaluation.schema";
import {
  buildSystemPrompt,
  buildUserPrompt,
  PROMPT_VERSION,
  type EvaluatorPromptInput,
} from "./prompts/evaluator.prompt";
import { calculateScore, validateEvidenceTurns, type ScoringResult } from "./scoring.engine";
import type { TranscriptTurn } from "../modules/calls/call.schema";

interface EvaluatorInput {
  agent: EvaluatorPromptInput["agent"];
  criteria: EvaluatorPromptInput["criteria"] & { weight: number }[];
  hardRules: {
    type: string;
    criterionId?: string | null;
    threshold?: number | null;
    tags?: string[] | null;
  }[];
  passThreshold: number;
  transcript: TranscriptTurn[];
}

export interface EvaluatorResult {
  llmOutput: EvaluationOutput;
  scoring: ScoringResult;
  model: string;
  promptVersion: string;
  evidenceValidation: Map<string, { valid: number[]; invalid: number[] }>;
}

/**
 * Provider-abstracted evaluator chain.
 * Uses LangChain + Groq for LLM calls.
 * Validates output with Zod, verifies evidence, and applies deterministic scoring.
 */
export async function evaluateCall(input: EvaluatorInput): Promise<EvaluatorResult> {
  const { agent, criteria, hardRules, passThreshold, transcript } = input;

  if (!config.groq.apiKey) {
    throw new Error("GROQ_API_KEY is not configured. Cannot run evaluation.");
  }

  // Build the LLM
  const llm = new ChatGroq({
    apiKey: config.groq.apiKey,
    model: config.groq.model,
    temperature: 0.1,
    maxTokens: 4096,
  });

  // Build prompts
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt({ agent, criteria, transcript, hardRules });

  // Call the LLM
  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userPrompt),
  ]);

  // Parse the LLM response as JSON
  const content = typeof response.content === "string" ? response.content : "";

  let parsed: unknown;
  try {
    // Try to extract JSON from the response (handle markdown code blocks)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    const jsonStr = jsonMatch[1]?.trim() || content.trim();
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON. Raw content: ${content.substring(0, 500)}`);
  }

  // Validate with Zod
  const llmOutput = evaluationOutputSchema.parse(parsed);

  // Validate evidence turn IDs
  const evidenceValidation = new Map<string, { valid: number[]; invalid: number[] }>();
  for (const ce of llmOutput.criteriaEvaluations) {
    const validation = validateEvidenceTurns(ce.evidenceTurnIndices, transcript);
    evidenceValidation.set(ce.criterionId, validation);

    if (validation.invalid.length > 0) {
      console.warn(
        `Criterion ${ce.criterionId}: LLM cited invalid turn indices: ${validation.invalid.join(", ")}`
      );
    }
  }

  // Build scoring input
  const criterionScores = new Map<
    string,
    { score: number | null; weight: number; failureTags: string[] }
  >();
  for (const ce of llmOutput.criteriaEvaluations) {
    const criterion = criteria.find((c) => c.id === ce.criterionId);
    const weight = criterion?.weight ?? 1.0;
    const score = ce.score === "NOT_ASSESSABLE" ? null : ce.score;
    criterionScores.set(ce.criterionId, { score, weight, failureTags: ce.failureTags ?? [] });
  }

  // Deterministic scoring
  const scoring = calculateScore({
    criterionScores,
    hardRules,
    passThreshold,
  });

  return {
    llmOutput,
    scoring,
    model: config.groq.model,
    promptVersion: PROMPT_VERSION,
    evidenceValidation,
  };
}
