import { prisma } from "../../db/prisma";
import type { CreateAgentInput, UpdateAgentInput } from "./agent.schema";

export class AgentService {
  async list() {
    return prisma.agent.findMany({
      include: {
        criteria: true,
        hardRules: true,
        _count: { select: { calls: true, evaluations: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id: string) {
    const agent = await prisma.agent.findUnique({
      where: { id },
      include: {
        criteria: true,
        hardRules: true,
        _count: { select: { calls: true, evaluations: true } },
      },
    });

    if (!agent) {
      throw new NotFoundError(`Agent not found: ${id}`);
    }

    return agent;
  }

  async create(data: CreateAgentInput) {
    const { criteria, hardRules, ...agentData } = data;

    return prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          ...agentData,
          criteria: {
            create: criteria.map(({ id: _id, ...c }) => c),
          },
        },
        include: { criteria: true },
      });

      if (hardRules.length > 0) {
        const resolvedRules = hardRules.map(({ id: _id, ...r }) => {
          let resolvedCritId = r.criterionId;
          if (r.criterionId) {
            const matched = agent.criteria.find(
              (c) =>
                c.id === r.criterionId ||
                c.name.toLowerCase().trim() === r.criterionId?.toLowerCase().trim()
            );
            if (matched) {
              resolvedCritId = matched.id;
            }
          }
          return {
            type: r.type,
            threshold: r.threshold ?? null,
            tags: r.tags ?? [],
            description: r.description ?? null,
            criterionId: resolvedCritId || null,
            agentId: agent.id,
          };
        });

        await tx.hardRule.createMany({
          data: resolvedRules,
        });
      }

      const result = await tx.agent.findUnique({
        where: { id: agent.id },
        include: { criteria: true, hardRules: true },
      });

      if (!result) throw new Error("Failed to create agent");
      return result;
    });
  }

  async update(id: string, data: UpdateAgentInput) {
    await this.getById(id);

    const { criteria, hardRules, ...agentData } = data;

    return prisma.$transaction(async (tx) => {
      // Update the agent scalar fields
      await tx.agent.update({
        where: { id },
        data: agentData,
      });

      // Replace criteria if provided
      if (criteria !== undefined) {
        await tx.criterion.deleteMany({ where: { agentId: id } });
        if (criteria.length > 0) {
          await tx.criterion.createMany({
            data: criteria.map(({ id: _id, ...c }) => ({
              ...c,
              agentId: id,
            })),
          });
        }
      }

      // Replace hard rules if provided
      if (hardRules !== undefined) {
        await tx.hardRule.deleteMany({ where: { agentId: id } });
        if (hardRules.length > 0) {
          const currentCriteria = await tx.criterion.findMany({ where: { agentId: id } });
          await tx.hardRule.createMany({
            data: hardRules.map(({ id: _id, ...r }) => {
              let resolvedCritId = r.criterionId;
              if (r.criterionId) {
                const matched = currentCriteria.find(
                  (c) =>
                    c.id === r.criterionId ||
                    c.name.toLowerCase().trim() === r.criterionId?.toLowerCase().trim()
                );
                if (matched) {
                  resolvedCritId = matched.id;
                }
              }
              return {
                type: r.type,
                threshold: r.threshold ?? null,
                tags: r.tags ?? [],
                description: r.description ?? null,
                criterionId: resolvedCritId || null,
                agentId: id,
              };
            }),
          });
        }
      }

      const result = await tx.agent.findUnique({
        where: { id },
        include: { criteria: true, hardRules: true },
      });

      if (!result) throw new Error("Failed to update agent");
      return result;
    });
  }

  async delete(id: string) {
    await this.getById(id);
    await prisma.agent.delete({ where: { id } });
  }

  /**
   * Returns a snapshot of the agent configuration for evaluation storage.
   * This snapshot preserves the exact rubric used at evaluation time.
   */
  async getConfigSnapshot(id: string) {
    const agent = await this.getById(id);
    return {
      id: agent.id,
      name: agent.name,
      persona: agent.persona,
      goal: agent.goal,
      openingLine: agent.openingLine,
      guidelines: agent.guidelines,
      knowledge: agent.knowledge,
      language: agent.language,
      evaluationTarget: agent.evaluationTarget,
      passThreshold: agent.passThreshold,
      criteria: agent.criteria.map((c) => ({
        id: c.id,
        name: c.name,
        weight: c.weight,
        description: c.description,
        goodLooksLike: c.goodLooksLike,
        badLooksLike: c.badLooksLike,
      })),
      hardRules: agent.hardRules.map((r) => ({
        id: r.id,
        type: r.type,
        criterionId: r.criterionId,
        threshold: r.threshold,
        tags: r.tags,
        description: r.description,
      })),
    };
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}
