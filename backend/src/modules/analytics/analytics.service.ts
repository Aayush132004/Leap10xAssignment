import { prisma } from "../../db/prisma";
import { NotFoundError } from "../agents/agent.service";

export class AnalyticsService {
  /**
   * Get per-agent analytics derived from stored evaluations.
   * No fresh LLM calls — all computed from existing data.
   */
  async getAgentAnalytics(agentId: string) {
    // Verify agent exists
    const agent = await prisma.agent.findUnique({
      where: { id: agentId },
      select: { id: true, name: true, passThreshold: true },
    });
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${agentId}`);
    }

    // Get all evaluations for this agent
    const evaluations = await prisma.evaluation.findMany({
      where: { agentId },
      include: {
        criterionEvaluations: {
          include: {
            criterion: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalEvaluations = evaluations.length;
    if (totalEvaluations === 0) {
      return {
        agent,
        totalEvaluations: 0,
        totalCalls: 0,
        passRate: 0,
        averageScore: 0,
        criterionStats: [],
        commonFailureTags: [],
        recentEvaluations: [],
      };
    }

    // Pass rate
    const passCount = evaluations.filter((e) => e.result === "PASS").length;
    const passRate = passCount / totalEvaluations;

    // Average score
    const averageScore =
      evaluations.reduce((sum, e) => sum + e.overallScore, 0) / totalEvaluations;

    // Criterion stats
    const criterionMap = new Map<
      string,
      { name: string; scores: number[]; notAssessable: number }
    >();
    for (const ev of evaluations) {
      for (const ce of ev.criterionEvaluations) {
        const key = ce.criterionId;
        if (!criterionMap.has(key)) {
          criterionMap.set(key, {
            name: ce.criterion.name,
            scores: [],
            notAssessable: 0,
          });
        }
        const entry = criterionMap.get(key)!;
        if (ce.score !== null) {
          entry.scores.push(ce.score);
        } else {
          entry.notAssessable++;
        }
      }
    }

    const criterionStats = Array.from(criterionMap.entries()).map(
      ([id, data]) => ({
        criterionId: id,
        criterionName: data.name,
        averageScore:
          data.scores.length > 0
            ? Math.round(
                (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) *
                  100
              ) / 100
            : null,
        minScore: data.scores.length > 0 ? Math.min(...data.scores) : null,
        maxScore: data.scores.length > 0 ? Math.max(...data.scores) : null,
        totalEvaluated: data.scores.length,
        notAssessableCount: data.notAssessable,
      })
    );

    // Common failure tags
    const tagCounts = new Map<string, number>();
    for (const ev of evaluations) {
      for (const ce of ev.criterionEvaluations) {
        for (const tag of ce.failureTags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    }
    const commonFailureTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));

    // Unique calls evaluated
    const uniqueCallIds = new Set(evaluations.map((e) => e.callId));

    // Recent evaluations (last 10)
    const recentEvaluations = evaluations.slice(0, 10).map((e) => ({
      id: e.id,
      callId: e.callId,
      overallScore: e.overallScore,
      result: e.result,
      createdAt: e.createdAt,
    }));

    return {
      agent,
      totalEvaluations,
      totalCalls: uniqueCallIds.size,
      passRate: Math.round(passRate * 100) / 100,
      averageScore: Math.round(averageScore * 100) / 100,
      criterionStats,
      commonFailureTags,
      recentEvaluations,
    };
  }

  /**
   * Get summary analytics across all agents.
   */
  async getDashboardSummary() {
    const [agentCount, callCount, evaluationCount] = await Promise.all([
      prisma.agent.count(),
      prisma.call.count(),
      prisma.evaluation.count(),
    ]);

    const recentEvaluations = await prisma.evaluation.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        call: { select: { id: true } },
        agent: { select: { id: true, name: true } },
      },
    });

    const passCount = await prisma.evaluation.count({
      where: { result: "PASS" },
    });

    return {
      agentCount,
      callCount,
      evaluationCount,
      overallPassRate:
        evaluationCount > 0
          ? Math.round((passCount / evaluationCount) * 100) / 100
          : 0,
      recentEvaluations: recentEvaluations.map((e) => ({
        id: e.id,
        agentName: e.agent.name,
        agentId: e.agentId,
        callId: e.callId,
        overallScore: e.overallScore,
        result: e.result,
        createdAt: e.createdAt,
      })),
    };
  }
}
