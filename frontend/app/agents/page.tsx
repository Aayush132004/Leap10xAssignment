"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { agentApi } from "@/lib/api";
import { AgentCard } from "@/components/agents/AgentCard";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Agent } from "@/lib/types";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = () => {
    setLoading(true);
    agentApi
      .list()
      .then(setAgents)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadAgents(); }, []);

  const handleDelete = async (id: string) => {
    // Let failures propagate — DeleteConfirmButton shows them inline in the dialog.
    await agentApi.delete(id);
    setAgents((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink-700">Agents</h1>
          <p className="text-sm text-ink-300 mt-1">Configure voice agents and their evaluation rubrics</p>
        </div>
        <Button asChild>
          <Link href="/agents/new">+ New Agent</Link>
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/30 mb-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm text-ink-300">Loading agents…</p>
        </div>
      ) : agents.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-ink-400 mb-2">No agents configured yet</p>
          <p className="text-sm text-ink-300 mb-4">Create your first agent to start evaluating calls.</p>
          <Button asChild>
            <Link href="/agents/new">Create Agent</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
