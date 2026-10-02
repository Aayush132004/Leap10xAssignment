import { prisma } from "../../db/prisma";
import {
  compareEvaluations,
  exportComparisonToCsv,
  type HumanCallLabel,
  type AiCallEvaluationData,
  type ComparisonMetrics,
} from "../../ai/comparison.engine";

export class ValidationService {
  /**
   * Compares human labels against existing AI evaluations in the database.
   */
  async compareWithLabels(labels: HumanCallLabel[]): Promise<{
    metrics: ComparisonMetrics;
    csv: string;
  }> {
    const rawCallIds = labels.map((l) => l.callId);

    // Fetch calls by either ID or externalId
    const calls = await prisma.call.findMany({
      where: {
        OR: [
          { id: { in: rawCallIds } },
          { externalId: { in: rawCallIds } },
        ],
      },
      include: {
        evaluations: {
          include: {
            criterionEvaluations: {
              include: {
                criterion: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const aiData: AiCallEvaluationData[] = [];

    for (const call of calls) {
      let latestEval = call.evaluations[0];

      // If call is not evaluated yet, we can evaluate it automatically
      if (!latestEval) {
        try {
          const { EvaluationService } = await import("../evaluations/evaluation.service");
          const evalService = new EvaluationService();
          latestEval = (await evalService.evaluateCall(call.id)) as any;
        } catch (evalErr) {
          console.error(`Failed to auto-evaluate call ${call.id}:`, evalErr);
          continue;
        }
      }

      if (latestEval) {
        aiData.push({
          callId: call.id,
          externalId: call.externalId ?? undefined,
          result: latestEval.result as "PASS" | "FAIL",
          criteria: latestEval.criterionEvaluations.map((ce) => ({
            criterionId: ce.criterionId,
            criterionName: ce.criterion?.name || "",
            score: ce.score,
            reasoning: ce.reasoning,
            evidenceTurns: ce.evidenceTurns,
            failureTags: ce.failureTags,
          })),
        });
      }
    }

    const metrics = compareEvaluations(labels, aiData);
    const csv = exportComparisonToCsv(metrics.mismatches);

    return { metrics, csv };
  }
}
