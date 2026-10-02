"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { callApi, agentApi } from "@/lib/api";
import { CallUpload } from "@/components/calls/CallUpload";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmButton } from "@/components/shared/DeleteConfirmButton";
import type { Call, Agent } from "@/lib/types";

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const fetchCalls = () => {
    setLoading(true);
    Promise.all([callApi.list(), agentApi.list()])
      .then(([c, a]) => {
        setCalls(c);
        setAgents(a);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCalls(); }, []);

  const handleDelete = async (id: string) => {
    await callApi.delete(id);
    setCalls((prev) => prev.filter((c) => c.id !== id));
  };

  // Grouped by agent (in the same order agents were created), not a flat list — makes
  // it easy to see each agent's calls together instead of hunting through a filter.
  const callsByAgent = new Map<string, Call[]>();
  for (const call of calls) {
    const list = callsByAgent.get(call.agentId) ?? [];
    list.push(call);
    callsByAgent.set(call.agentId, list);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink-700">Calls</h1>
          <p className="text-sm text-ink-300 mt-1">Browse and evaluate call transcripts, grouped by agent</p>
        </div>
        <Button onClick={() => setShowUpload(!showUpload)}>
          {showUpload ? "Hide Upload" : "+ Upload Transcript"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/30 mb-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {showUpload && (
        <div className="mb-6">
          <CallUpload
            agents={agents}
            onUploadSuccess={() => {
              setShowUpload(false);
              fetchCalls();
            }}
          />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm text-ink-300">Loading calls…</p>
        </div>
      ) : calls.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-ink-400 mb-2">No calls found</p>
          <p className="text-sm text-ink-300 mb-4">Upload a transcript to get started.</p>
          <Button onClick={() => setShowUpload(true)}>Upload Transcript</Button>
        </Card>
      ) : agents.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-ink-400">No agents configured yet</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {agents.map((agent) => {
            const agentCalls = callsByAgent.get(agent.id) ?? [];
            return (
              <div key={agent.id}>
                <div className="flex items-center gap-2 mb-2">
                  <Link
                    href={`/agents/${agent.id}`}
                    className="text-sm font-medium text-ink-600 hover:text-primary transition-colors"
                  >
                    {agent.name}
                  </Link>
                  <Badge>{agentCalls.length} call{agentCalls.length === 1 ? "" : "s"}</Badge>
                </div>

                {agentCalls.length === 0 ? (
                  <Card className="text-xs text-ink-300 py-4 text-center">
                    No calls for this agent yet.
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {agentCalls.map((call) => (
                      <Link key={call.id} href={`/calls/${call.id}`}>
                        <Card className="flex items-center justify-between group">
                          <p className="text-xs text-ink-300">
                            {call.source} · {(call.transcript as unknown[]).length} turns
                            {call.durationSeconds && ` · ${call.durationSeconds}s`}
                          </p>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-ink-200">
                              {new Date(call.createdAt).toLocaleDateString()}
                            </span>
                            <Badge>{call._count?.evaluations ?? 0} evals</Badge>
                            <DeleteConfirmButton
                              triggerVariant="ghost"
                              triggerLabel="×"
                              triggerClassName="h-6 w-6 p-0 text-ink-200 hover:text-destructive hover:bg-transparent"
                              title="Delete this call?"
                              description="Deletes the transcript and every evaluation run on it. This cannot be undone."
                              onConfirm={() => handleDelete(call.id)}
                              stopPropagation
                            />
                          </div>
                        </Card>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
