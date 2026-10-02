import type { TranscriptTurn } from "../../modules/calls/call.schema";

export const PROMPT_VERSION = "v1.2";

interface AgentContext {
  name: string;
  useCase?: string | null;
  persona?: string | null;
  goal?: string | null;
  openingLine?: string | null;
  guidelines: string[];
  knowledge?: string[];
  scoringNotes?: string[];
  language?: string | null;
  evaluationTarget?: string | null;
}

interface CriterionContext {
  id: string;
  name: string;
  weight?: number;
  description: string;
  goodLooksLike?: string | null;
  badLooksLike?: string | null;
}

interface HardRuleContext {
  type: string;
  criterionId?: string | null;
  threshold?: number | null;
  tags?: string[] | null;
  description?: string | null;
}

export interface EvaluatorPromptInput {
  agent: AgentContext;
  criteria: CriterionContext[];
  transcript: TranscriptTurn[];
  hardRules?: HardRuleContext[];
}

/**
 * Builds the evaluator system prompt.
 * This prompt is generic — it works with any agent configuration and rubric.
 */
export function buildSystemPrompt(): string {
  return `You are an expert call quality evaluator. Your task is to evaluate a call transcript against a set of quality criteria for a voice agent.

## Core Rules
1. Judge ONLY the evaluated speaker's behavior based on the criteria provided.
2. Use ONLY evidence present in the transcript. Never invent or assume evidence.
3. Cite specific transcript turn indices that support each assessment.
4. Never award credit for actions that did not happen in the transcript.
5. Distinguish the evaluated speaker from the other speaker.
6. Use NOT_ASSESSABLE only when evidence is genuinely insufficient to evaluate a criterion.
7. Be consistent in scoring across criteria.

## Scoring Guide
- 1: Very poor — clear violation of the criterion
- 2: Below expectations — notable issues present
- 3: Meets basic expectations — acceptable performance
- 4: Good performance — minor room for improvement
- 5: Excellent — exemplary performance for this criterion

## Output Requirements
For each criterion, provide:
- score: An integer 1-5, or the string "NOT_ASSESSABLE"
- reasoning: Detailed explanation referencing specific transcript evidence
- evidenceTurnIndices: Array of turn indices supporting the assessment
- failureTags: Optional array of short failure category tags

Also identify any unusual or noteworthy things observed in the conversation.

Return valid JSON matching the specified output format.`;
}

/**
 * Builds the evaluator user prompt from agent config, rubric, and transcript.
 */
export function buildUserPrompt(input: EvaluatorPromptInput): string {
  const { agent, criteria, transcript, hardRules = [] } = input;

  // Which transcript speaker label ("agent" or "user") is actually being scored. For
  // roleplay/training agents (evaluationTarget "user"), the AGENT speaker plays a
  // character (e.g. a skeptical customer) and is never the one being assessed — that
  // needs to be unambiguous, not just implied, or the model can end up scoring the
  // roleplay character's behavior instead of the real person's.
  const isUserEvaluated = agent.evaluationTarget === "user";
  const evaluatedLabel = isUserEvaluated ? "USER" : "AGENT";
  const otherLabel = isUserEvaluated ? "AGENT" : "USER";

  const agentSection = [
    `## Call Context`,
    `Configuration name: ${agent.name}`,
    agent.useCase ? `Use Case: ${agent.useCase}` : null,
    agent.language ? `Language / Dialect: ${agent.language}` : null,
    agent.persona
      ? isUserEvaluated
        ? `The transcript speaker labeled AGENT plays a roleplay/system character (not the person being evaluated) described here: ${agent.persona}`
        : `Persona: ${agent.persona}`
      : null,
    agent.goal ? `Goal: ${agent.goal}` : null,
    agent.openingLine ? `Opening Line: ${agent.openingLine}` : null,
    `\n>>> WHO YOU ARE SCORING: the transcript speaker labeled ${evaluatedLabel}. Every criterion below judges only the ${evaluatedLabel} speaker's turns — never the ${otherLabel} speaker's, even if the ${otherLabel} speaker's persona is described above. <<<`,
    agent.guidelines.length > 0
      ? `\nGuidelines:\n${agent.guidelines.map((g, i) => `${i + 1}. ${g}`).join("\n")}`
      : null,
    agent.knowledge && agent.knowledge.length > 0
      ? `\nKnowledge & Policies:\n${agent.knowledge.map((k, i) => `${i + 1}. ${k}`).join("\n")}`
      : null,
    agent.scoringNotes && agent.scoringNotes.length > 0
      ? `\nScoring Notes:\n${agent.scoringNotes.map((n) => `• ${n}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const criteriaSection = criteria
    .map((c) => {
      const parts = [
        `### Criterion: ${c.name} (ID: ${c.id})`,
        `Description: ${c.description}`,
        c.goodLooksLike ? `Good looks like: ${c.goodLooksLike}` : null,
        c.badLooksLike ? `Bad looks like: ${c.badLooksLike}` : null,
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n\n");

  const transcriptSection = transcript
    .map((t) => `[Turn ${t.index}] ${t.speaker.toUpperCase()}: ${t.text}`)
    .join("\n");

  const tagRules = hardRules.filter(
    (r) => r.type === "failure_tag_any" && r.tags && r.tags.length > 0
  );
  const hardRuleSection =
    tagRules.length > 0
      ? `\n## Behavioral Hard-Fail Watch List\nThese are automatic-fail behaviors regardless of numeric score. If you observe one, add the exact matching tag below to that criterion's failureTags — do not invent your own wording for these:\n${tagRules
          .map(
            (r) =>
              `- ${r.description ?? "Automatic fail behavior"} → use tag(s): ${(r.tags ?? [])
                .map((t) => `"${t}"`)
                .join(", ")}`
          )
          .join("\n")}`
      : "";

  return `${agentSection}

## Evaluation Criteria
${criteriaSection}
${hardRuleSection}

## Transcript (score only the ${evaluatedLabel} speaker's turns)
${transcriptSection}

## Task
Evaluate the transcript against each criterion listed above. Return your evaluation as JSON with the following structure:
{
  "criteriaEvaluations": [
    {
      "criterionId": "<criterion ID>",
      "score": <1-5 or "NOT_ASSESSABLE">,
      "reasoning": "<detailed reasoning>",
      "evidenceTurnIndices": [<turn indices>],
      "failureTags": ["<optional tags>"]
    }
  ],
  "unusualThings": ["<any unusual observations>"]
}`;
}
