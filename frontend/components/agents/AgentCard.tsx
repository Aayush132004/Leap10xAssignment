"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmButton } from "@/components/shared/DeleteConfirmButton";
import type { Agent } from "@/lib/types";

interface AgentCardProps {
  agent: Agent;
  onDelete?: (id: string) => Promise<void>;
}

export function AgentCard({ agent, onDelete }: AgentCardProps) {
  return (
    <Card className="group">
      <div className="flex items-start justify-between">
        <Link href={`/agents/${agent.id}`} className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-medium text-ink-600 group-hover:text-primary transition-colors">
              {agent.name}
            </h3>
            {agent.language && <Badge className="text-[10px]">{agent.language}</Badge>}
          </div>
          {agent.useCase && (
            <p className="text-xs text-ink-400 mt-0.5 line-clamp-1 italic">{agent.useCase}</p>
          )}
          {agent.persona && <p className="text-sm text-ink-300 mt-1 line-clamp-2">{agent.persona}</p>}
        </Link>
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-ink-100/50">
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-300">Criteria:</span>
          <span className="font-sketch text-sm text-ink-500">{agent.criteria.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-300">Calls:</span>
          <span className="font-sketch text-sm text-ink-500">{agent._count?.calls ?? 0}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-300">Evals:</span>
          <span className="font-sketch text-sm text-ink-500">{agent._count?.evaluations ?? 0}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-300">Pass ≥</span>
          <span className="font-sketch text-sm text-ink-500">{agent.passThreshold}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/agents/${agent.id}/edit`}>Edit</Link>
        </Button>
        <Button asChild variant="secondary" size="sm">
          <Link href={`/agents/${agent.id}`}>View</Link>
        </Button>
        {onDelete && (
          <DeleteConfirmButton
            triggerClassName="ml-auto"
            title={`Delete "${agent.name}"?`}
            description={
              agent._count && (agent._count.calls > 0 || agent._count.evaluations > 0)
                ? `This also permanently deletes its ${agent._count.calls} call(s) and ${agent._count.evaluations} evaluation(s). This cannot be undone.`
                : "This cannot be undone."
            }
            onConfirm={() => onDelete(agent.id)}
            stopPropagation
          />
        )}
      </div>
    </Card>
  );
}
