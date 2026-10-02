import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { NotFoundError } from "../agents/agent.service";
import { AgentService } from "../agents/agent.service";
import { CallService } from "../calls/call.service";
import { evaluateCall } from "../../ai/evaluator.chain";
import { computeConsistencyMetrics, type ConsistencyMetrics } from "../../ai/comparison.engine";
import type { TranscriptTurn } from "../calls/call.schema";

const agentService = new AgentService();
const callService = new CallService();

export class EvaluationService {
  async getByCallId(callId: string) {
    const evaluations = await prisma.evaluation.findMany({
      where: { callId },
      include: {
        criterionEvaluations: {
          include: {
            criterion: { select: { id: true, name: true, weight: true, description: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return evaluations;
  }

  async getById(id: string) {
    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: {
        call: {
          include: { agent: { select: { id: true, name: true } } },
        },
        criterionEvaluations: {
          include: {
            criterion: { select: { id: true, name: true, weight: true, description: true } },
          },
        },
      },
    });

    if (!evaluation) {
      throw new NotFoundError(`Evaluation not found: ${id}`);
    }

    return evaluation;
  }

  /**
   * Evaluate a call against its agent's rubric.
   * This is the core evaluation flow:
   * 1. Load agent config with criteria and hard rules
   * 2. Load call transcript
   * 3. Call the AI evaluator
   * 4. Store evaluation results with agent config snapshot
   */
  async evaluateCall(callId: string) {
    // Load the call
    const call = await callService.getById(callId);
    const transcript = call.transcript as unknown as TranscriptTurn[];

    // Load the agent with full config
    const agent = await agentService.getById(call.agentId);

    if (agent.criteria.length === 0) {
      throw new Error("Agent has no evaluation criteria. Add criteria to the rubric before evaluating.");
    }

    // Get agent config snapshot for provenance
    const agentConfigSnapshot = await agentService.getConfigSnapshot(agent.id);

    // Run AI evaluation
    const result = await evaluateCall({
      agent: {
        name: agent.name,
        useCase: agent.useCase,
        language: agent.language,
        persona: agent.persona,
        goal: agent.goal,
        openingLine: agent.openingLine,
        guidelines: agent.guidelines,
        knowledge: agent.knowledge,
        scoringNotes: agent.scoringNotes,
        evaluationTarget: agent.evaluationTarget,
      },
      criteria: agent.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        weight: c.weight,
        description: c.description,
        goodLooksLike: c.goodLooksLike,
        badLooksLike: c.badLooksLike,
      })),
      hardRules: agent.hardRules.map((r) => ({
        type: r.type,
        criterionId: r.criterionId,
        threshold: r.threshold,
        tags: r.tags,
        description: r.description,
      })),
      passThreshold: agent.passThreshold,
      transcript,
    });

    // Store evaluation
    const evaluation = await prisma.evaluation.create({
      data: {
        callId,
        agentId: agent.id,
        overallScore: result.scoring.overallScore,
        result: result.scoring.result,
        unusualThings: result.llmOutput.unusualThings ?? [],
        model: result.model,
        promptVersion: result.promptVersion,
        agentConfigSnapshot: agentConfigSnapshot as unknown as Prisma.InputJsonValue,
        criterionEvaluations: {
          create: result.llmOutput.criteriaEvaluations.map((ce) => {
            const validation = result.evidenceValidation.get(ce.criterionId);
            return {
              criterionId: ce.criterionId,
              score: ce.score === "NOT_ASSESSABLE" ? null : ce.score,
              status: ce.score === "NOT_ASSESSABLE" ? "NOT_ASSESSABLE" : "SCORED",
              reasoning: ce.reasoning,
              evidenceTurns: validation?.valid ?? ce.evidenceTurnIndices,
              failureTags: ce.failureTags ?? [],
            };
          }),
        },
      },
      include: {
        criterionEvaluations: {
          include: {
            criterion: { select: { id: true, name: true, weight: true, description: true } },
          },
        },
      },
    });

    return evaluation;
  }

  /**
   * Runs `runs` fresh evaluations of the same call (each persisted as its own Evaluation,
   * consistent with a call being evaluatable multiple times) and measures how much the
   * evaluator's scores and PASS/FAIL result vary run-to-run.
   */
  async checkConsistency(callId: string, runs = 3): Promise<{
    evaluations: Awaited<ReturnType<EvaluationService["evaluateCall"]>>[];
    metrics: ConsistencyMetrics;
  }> {
    const evaluations: Awaited<ReturnType<EvaluationService["evaluateCall"]>>[] = [];
    for (let i = 0; i < runs; i++) {
      evaluations.push(await this.evaluateCall(callId));
    }

    const metrics = computeConsistencyMetrics(
      evaluations.map((ev) => ({
        overallScore: ev.overallScore,
        result: ev.result as "PASS" | "FAIL",
        criteria: ev.criterionEvaluations.map((ce) => ({
          criterionId: ce.criterionId,
          criterionName: ce.criterion?.name,
          score: ce.score,
        })),
      }))
    );

    return { evaluations, metrics };
  }
}
