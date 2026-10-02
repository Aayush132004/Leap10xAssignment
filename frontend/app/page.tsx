"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { analyticsApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DashboardSummary } from "@/lib/types";

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyticsApi
      .dashboard()
      .then(setSummary)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-ink-300 text-sm">Loading dashboard…</p>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/30">
        <p className="text-destructive text-sm">{error}</p>
        <p className="text-ink-300 text-xs mt-1">Make sure the backend is running on port 3001.</p>
      </Card>
    );
  }

  const stats = [
    { label: "Agents", value: summary?.agentCount ?? 0, href: "/agents" },
    { label: "Calls", value: summary?.callCount ?? 0, href: "/calls" },
    { label: "Evaluations", value: summary?.evaluationCount ?? 0, href: "/calls" },
    { label: "Pass Rate", value: `${Math.round((summary?.overallPassRate ?? 0) * 100)}%`, href: "/analytics" },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-ink-700">Dashboard</h1>
        <p className="text-sm text-ink-300 mt-1">Overview of your voice agent evaluations</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="group">
              <p className="text-xs text-ink-300 uppercase tracking-wide">{stat.label}</p>
              <p className="font-sketch text-4xl font-bold text-ink-600 mt-1 group-hover:text-primary transition-colors">
                {stat.value}
              </p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent evaluations */}
      <Card>
        <h2 className="text-sm font-medium text-ink-500 mb-4">Recent Evaluations</h2>
        {summary?.recentEvaluations && summary.recentEvaluations.length > 0 ? (
          <div className="space-y-3">
            {summary.recentEvaluations.map((ev) => (
              <Link
                key={ev.id}
                href={`/calls/${ev.callId}`}
                className="flex items-center justify-between py-2 px-3 rounded-sm hover:bg-paper-100 transition-colors"
              >
                <div>
                  <span className="text-sm text-ink-600">{ev.agentName}</span>
                  <span className="text-xs text-ink-300 ml-2">
                    {new Date(ev.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-sketch text-lg text-ink-500">{ev.overallScore.toFixed(1)}</span>
                  <Badge variant={ev.result === "PASS" ? "pass" : "fail"}>{ev.result}</Badge>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-sm text-ink-300">No evaluations yet</p>
            <Button asChild className="mt-3">
              <Link href="/agents">Create an Agent</Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
