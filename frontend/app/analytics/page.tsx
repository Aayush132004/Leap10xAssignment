"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { analyticsApi, agentApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import type { Agent, AgentAnalytics } from "@/lib/types";

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const preselectedAgent = searchParams.get("agentId") || "";

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState(preselectedAgent);
  const [analytics, setAnalytics] = useState<AgentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    agentApi.list().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedAgent) {
      setAnalytics(null);
      return;
    }
    setLoading(true);
    setError(null);
    analyticsApi
      .agent(selectedAgent)
      .then(setAnalytics)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedAgent]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink-700">Analytics</h1>
        <p className="text-sm text-ink-300 mt-1">Performance metrics and failure patterns per agent</p>
      </div>

      {/* Agent selector */}
      <div className="mb-6">
        <Select value={selectedAgent || undefined} onValueChange={setSelectedAgent}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select an agent…" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && (
        <Card className="border-destructive/30 mb-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {!selectedAgent && (
        <Card className="text-center py-12">
          <p className="text-ink-400">Select an agent to view analytics</p>
        </Card>
      )}

      {loading && (
        <div className="flex items-center justify-center h-40">
          <p className="text-sm text-ink-300">Loading analytics…</p>
        </div>
      )}

      {analytics && !loading && (
        <div className="space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <p className="text-xs text-ink-300 uppercase tracking-wide">Pass Rate</p>
              <p
                className={`font-sketch text-4xl font-bold mt-1 ${
                  analytics.passRate >= 0.7
                    ? "text-accent-green"
                    : analytics.passRate >= 0.5
                      ? "text-accent-yellow"
                      : "text-destructive"
                }`}
              >
                {Math.round(analytics.passRate * 100)}%
              </p>
            </Card>
            <Card>
              <p className="text-xs text-ink-300 uppercase tracking-wide">Avg Score</p>
              <p className="font-sketch text-4xl font-bold text-ink-600 mt-1">{analytics.averageScore.toFixed(1)}</p>
            </Card>
            <Card>
              <p className="text-xs text-ink-300 uppercase tracking-wide">Evaluations</p>
              <p className="font-sketch text-4xl font-bold text-ink-600 mt-1">{analytics.totalEvaluations}</p>
            </Card>
            <Card>
              <p className="text-xs text-ink-300 uppercase tracking-wide">Calls</p>
              <p className="font-sketch text-4xl font-bold text-ink-600 mt-1">{analytics.totalCalls}</p>
            </Card>
          </div>

          {/* Criterion breakdown */}
          {analytics.criterionStats.length > 0 && (
            <Card>
              <h2 className="text-sm font-medium text-ink-500 mb-4">Criterion Scores</h2>
              <div className="space-y-3">
                {analytics.criterionStats.map((cs) => (
                  <div key={cs.criterionId} className="flex items-center gap-4">
                    <span className="text-sm text-ink-600 w-40 shrink-0 truncate">{cs.criterionName}</span>
                    <div className="flex-1 h-2 bg-paper-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          (cs.averageScore ?? 0) >= 4
                            ? "bg-accent-green"
                            : (cs.averageScore ?? 0) >= 3
                              ? "bg-accent-yellow"
                              : "bg-destructive"
                        }`}
                        style={{ width: `${((cs.averageScore ?? 0) / 5) * 100}%` }}
                      />
                    </div>
                    <span className="font-sketch text-lg text-ink-500 w-10 text-right">
                      {cs.averageScore?.toFixed(1) ?? "N/A"}
                    </span>
                    <span className="text-xs text-ink-300 w-16">{cs.totalEvaluated} rated</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Common failure tags */}
          {analytics.commonFailureTags.length > 0 && (
            <Card>
              <h2 className="text-sm font-medium text-ink-500 mb-3">Common Failure Tags</h2>
              <div className="flex flex-wrap gap-2">
                {analytics.commonFailureTags.map(({ tag, count }) => (
                  <Badge key={tag} className="bg-accent-red-light/50 text-destructive">
                    {tag} ({count})
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Recent evaluations */}
          {analytics.recentEvaluations.length > 0 && (
            <Card>
              <h2 className="text-sm font-medium text-ink-500 mb-3">Recent Evaluations</h2>
              <div className="space-y-2">
                {analytics.recentEvaluations.map((ev) => (
                  <Link
                    key={ev.id}
                    href={`/calls/${ev.callId}`}
                    className="flex items-center justify-between py-2 px-3 rounded-sm hover:bg-paper-100 transition-colors"
                  >
                    <span className="text-xs text-ink-300">{new Date(ev.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-sketch text-sm text-ink-500">{ev.overallScore.toFixed(1)}</span>
                      <Badge variant={ev.result === "PASS" ? "pass" : "fail"}>{ev.result}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {analytics.totalEvaluations === 0 && (
            <Card className="text-center py-8">
              <p className="text-ink-400 mb-2">No evaluations yet</p>
              <p className="text-sm text-ink-300">Evaluate some calls to see analytics.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<div className="text-ink-400">Loading analytics…</div>}>
      <AnalyticsContent />
    </Suspense>
  );
}
