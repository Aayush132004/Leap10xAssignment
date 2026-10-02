import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { NotFoundError } from "../agents/agent.service";
import type { CreateCallInput, BulkCreateCallsInput } from "./call.schema";

export class CallService {
  async list(filters?: { agentId?: string; source?: string }) {
    const where: Record<string, unknown> = {};
    if (filters?.agentId) where.agentId = filters.agentId;
    if (filters?.source) where.source = filters.source;

    return prisma.call.findMany({
      where,
      include: {
        agent: { select: { id: true, name: true } },
        _count: { select: { evaluations: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(idOrExternalId: string) {
    const includeQuery = {
      agent: { select: { id: true, name: true } },
      evaluations: {
        include: {
          criterionEvaluations: {
            include: {
              criterion: { select: { id: true, name: true, weight: true, description: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" as const },
      },
    };

    let call = await prisma.call.findUnique({
      where: { id: idOrExternalId },
      include: includeQuery,
    }).catch(() => null);

    if (!call) {
      call = await prisma.call.findFirst({
        where: { externalId: idOrExternalId },
        include: includeQuery,
        orderBy: { createdAt: "desc" },
      });
    }

    if (!call) {
      throw new NotFoundError(`Call not found: ${idOrExternalId}`);
    }

    return call;
  }

  async create(data: CreateCallInput) {
    // Verify agent exists
    const agent = await prisma.agent.findUnique({ where: { id: data.agentId } });
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${data.agentId}`);
    }

    return prisma.call.create({
      data: {
        agentId: data.agentId,
        source: data.source,
        externalId: data.externalId,
        language: data.language,
        durationSeconds: data.durationSeconds,
        transcript: data.transcript as unknown as Prisma.InputJsonValue,
      },
      include: {
        agent: { select: { id: true, name: true } },
      },
    });
  }

  async bulkCreate(data: BulkCreateCallsInput) {
    // Verify agent exists
    const agent = await prisma.agent.findUnique({ where: { id: data.agentId } });
    if (!agent) {
      throw new NotFoundError(`Agent not found: ${data.agentId}`);
    }

    const results = await prisma.$transaction(
      data.calls.map((call) =>
        prisma.call.create({
          data: {
            agentId: data.agentId,
            source: call.source,
            externalId: call.externalId,
            language: call.language,
            durationSeconds: call.durationSeconds,
            transcript: call.transcript as unknown as Prisma.InputJsonValue,
          },
        })
      )
    );

    return results;
  }

  async delete(id: string) {
    await this.getById(id);
    await prisma.call.delete({ where: { id } });
  }
}
