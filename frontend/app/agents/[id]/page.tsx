"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { agentApi } from "@/lib/api";
import { CallNowButton } from "@/components/voice/CallNowButton";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmButton } from "@/components/shared/DeleteConfirmButton";
import type { Agent } from "@/lib/types";

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    agentApi
      .get(id)
      .then(setAgent)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-ink-300">Loading agent…</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <Card className="border-destructive/30">
        <p className="text-destructive text-sm">{error || "Agent not found"}</p>
        <Button asChild variant="secondary" className="mt-3">
          <Link href="/agents">← Back to Agents</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/agents" className="text-xs text-ink-300 hover:text-ink-500">
            ← Agents
          </Link>
          <h1 className="text-2xl font-semibold text-ink-700 mt-1">{agent.name}</h1>
          {agent.useCase && (
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="outline" className="font-medium">
                Use Case
              </Badge>
              <span className="text-xs text-ink-400">{agent.useCase}</span>
            </div>
          )}
          {agent.persona && <p className="text-sm text-ink-400 mt-1">{agent.persona}</p>}
        </div>
        <div className="flex items-center gap-2">
          <CallNowButton agentId={id} />
          <Button asChild variant="secondary">
            <Link href={`/analytics?agentId=${id}`}>Analytics</Link>
          </Button>
          <Button asChild>
            <Link href={`/agents/${id}/edit`}>Edit Agent</Link>
          </Button>
          <DeleteConfirmButton
            title={`Delete "${agent.name}"?`}
            description={
              agent._count && (agent._count.calls > 0 || agent._count.evaluations > 0)
                ? `This also permanently deletes its ${agent._count.calls} call(s) and ${agent._count.evaluations} evaluation(s). This cannot be undone.`
                : "This cannot be undone."
            }
            onConfirm={async () => {
              await agentApi.delete(id);
              router.push("/agents");
            }}
          />
        </div>
      </div>

      {/* Config summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <p className="text-xs text-ink-300 uppercase tracking-wide">Language</p>
          <p className="text-sm text-ink-600 mt-1 font-medium">{agent.language}</p>
        </Card>
        <Card>
          <p className="text-xs text-ink-300 uppercase tracking-wide">Pass Threshold</p>
          <p className="font-sketch text-2xl text-ink-600 mt-1">{agent.passThreshold}</p>
        </Card>
        <Card>
          <p className="text-xs text-ink-300 uppercase tracking-wide">Evaluate</p>
          <p className="text-sm text-ink-600 mt-1">{agent.evaluationTarget || "Agent"}</p>
        </Card>
      </div>

      {/* Goal */}
      {agent.goal && (
        <Card className="mb-4">
          <h2 className="text-sm font-medium text-ink-500 mb-2">Goal</h2>
          <p className="text-sm text-ink-500">{agent.goal}</p>
        </Card>
      )}

      {/* Guidelines */}
      {agent.guidelines.length > 0 && (
        <Card className="mb-4">
          <h2 className="text-sm font-medium text-ink-500 mb-2">Conversation Guidelines</h2>
          <ul className="space-y-1.5">
            {agent.guidelines.map((g, i) => (
              <li key={i} className="text-sm text-ink-500 flex items-start gap-2">
                <span className="text-ink-200 mt-0.5">•</span>
                {g}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Knowledge & Policies */}
      {agent.knowledge.length > 0 && (
        <Card className="mb-4">
          <h2 className="text-sm font-medium text-ink-500 mb-2">Knowledge & Policies</h2>
          <ul className="space-y-1.5">
            {agent.knowledge.map((k, i) => (
              <li key={i} className="text-sm text-ink-500 flex items-start gap-2">
                <span className="text-primary mt-0.5">§</span>
                {k}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Scoring Notes */}
      {agent.scoringNotes.length > 0 && (
        <Card className="mb-4">
          <h2 className="text-sm font-medium text-ink-500 mb-2">Rubric Scoring Notes</h2>
          <ul className="space-y-1.5">
            {agent.scoringNotes.map((n, i) => (
              <li key={i} className="text-xs text-ink-500 font-mono flex items-start gap-2">
                <span className="text-amber-600 mt-0.5">ℹ</span>
                {n}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Criteria */}
      <Card className="mb-4">
        <h2 className="text-sm font-medium text-ink-500 mb-3">
          Evaluation Criteria ({agent.criteria.length})
        </h2>
        {agent.criteria.length === 0 ? (
          <p className="text-sm text-ink-300">
            No criteria defined.{" "}
            <Link href={`/agents/${id}/edit`} className="text-primary hover:underline">
              Add criteria
            </Link>
          </p>
        ) : (
          <div className="space-y-3">
            {agent.criteria.map((c) => (
              <div key={c.id} className="border border-ink-100/50 rounded-[2px_4px_3px_5px] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink-600">{c.name}</span>
                  <Badge>weight: {c.weight}</Badge>
                </div>
                <p className="text-xs text-ink-400 mt-1">{c.description}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Hard Rules */}
      {agent.hardRules.length > 0 && (
        <Card>
          <h2 className="text-sm font-medium text-ink-500 mb-3">Hard Rules ({agent.hardRules.length})</h2>
          <div className="space-y-2">
            {agent.hardRules.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 text-sm text-ink-500 bg-accent-red-light/30 px-3 py-2 rounded-sm"
              >
                <span className="text-destructive text-xs font-medium">FAIL IF</span>
                <span>
                  {r.type === "any_below" && `Any criterion scores below ${r.threshold}`}
                  {r.type === "criterion_below" && `Criterion scores below ${r.threshold}`}
                  {r.type === "not_assessable_fail" && `Criterion is NOT_ASSESSABLE`}
                  {r.type === "failure_tag_any" &&
                    `Behavior tagged: ${r.tags.join(", ") || "(no tags configured)"}`}
                </span>
                {r.description && <span className="text-ink-300 ml-auto text-xs">{r.description}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
