"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { agentApi } from "@/lib/api";
import { AgentForm } from "@/components/agents/AgentForm";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Agent } from "@/lib/types";

export default function EditAgentPage() {
  const params = useParams();
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
      <div className="mb-6">
        <Link href={`/agents/${id}`} className="text-xs text-ink-300 hover:text-ink-500">
          ← Back to {agent.name}
        </Link>
        <h1 className="text-2xl font-semibold text-ink-700 mt-1">
          Edit {agent.name}
        </h1>
      </div>
      <AgentForm agent={agent} />
    </div>
  );
}
