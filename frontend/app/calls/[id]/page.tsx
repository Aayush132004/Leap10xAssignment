"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { callApi } from "@/lib/api";
import { TranscriptViewer } from "@/components/calls/TranscriptViewer";
import { ScoreCard } from "@/components/evaluations/ScoreCard";
import { ConsistencyPanel } from "@/components/evaluations/ConsistencyPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DeleteConfirmButton } from "@/components/shared/DeleteConfirmButton";
import type { Call, ConsistencyMetrics, TranscriptTurn } from "@/lib/types";

export default function CallDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [call, setCall] = useState<Call | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [highlightedTurns, setHighlightedTurns] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<"transcript" | "scorecard">("transcript");
  const [checkingConsistency, setCheckingConsistency] = useState(false);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [consistency, setConsistency] = useState<ConsistencyMetrics | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadCall = useCallback(() => {
    callApi
      .get(id)
      .then(setCall)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadCall(); }, [loadCall]);

  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    };
  }, []);

  const handleEvaluate = async () => {
    setEvaluating(true);
    setEvalError(null);
    setConsistency(null);
    const startedAt = Date.now();
    setElapsedMs(0);
    elapsedTimerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    try {
      await callApi.evaluate(id);
      loadCall();
      setActiveTab("scorecard");
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    }
  };

  const handleCheckConsistency = async () => {
    setCheckingConsistency(true);
    setConsistencyError(null);
    try {
      const result = await callApi.checkConsistency(id, 3);
      setConsistency(result.metrics);
      loadCall();
    } catch (err) {
      setConsistencyError(err instanceof Error ? err.message : "Consistency check failed");
    } finally {
      setCheckingConsistency(false);
    }
  };

  const handleEvidenceClick = (turnIndex: number) => {
    setHighlightedTurns([turnIndex]);
    setActiveTab("transcript");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-ink-300">Loading call…</p>
      </div>
    );
  }

  if (error || !call) {
    return (
      <Card className="border-destructive/30">
        <p className="text-destructive text-sm">{error || "Call not found"}</p>
        <Button asChild variant="secondary" className="mt-3">
          <Link href="/calls">← Back to Calls</Link>
        </Button>
      </Card>
    );
  }

  const transcript = call.transcript as unknown as TranscriptTurn[];
  const latestEvaluation = call.evaluations?.[0] || null;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/calls" className="text-xs text-ink-300 hover:text-ink-500">
            ← Calls
          </Link>
          <h1 className="text-2xl font-semibold text-ink-700 mt-1">Call Detail</h1>
          <p className="text-sm text-ink-300 mt-0.5">
            {call.agent.name} · {call.source} · {transcript.length} turns
            {call.durationSeconds && ` · ${call.durationSeconds}s`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {latestEvaluation && (
            <div className="text-right mr-4">
              <span
                className={`font-sketch text-2xl ${
                  latestEvaluation.result === "PASS" ? "text-accent-green" : "text-destructive"
                }`}
              >
                {latestEvaluation.overallScore.toFixed(1)}
              </span>
              <Badge variant={latestEvaluation.result === "PASS" ? "pass" : "fail"} className="ml-2">
                {latestEvaluation.result}
              </Badge>
            </div>
          )}
          <Button onClick={handleEvaluate} disabled={evaluating}>
            {evaluating ? "Evaluating…" : latestEvaluation ? "Re-evaluate" : "Evaluate"}
          </Button>
          <DeleteConfirmButton
            title="Delete this call?"
            description="Deletes the transcript and every evaluation run on it. This cannot be undone."
            onConfirm={async () => {
              await callApi.delete(id);
              router.push("/calls");
            }}
          />
        </div>
      </div>

      {evalError && (
        <Card className="border-destructive/30 mb-4">
          <p className="text-sm text-destructive">{evalError}</p>
        </Card>
      )}

      {evaluating && (
        <Card className="border-primary/30 mb-4">
          <p className="text-sm text-primary">
            Calling {call.agent.name.split(" ")[0]}&rsquo;s evaluator model… {(elapsedMs / 1000).toFixed(1)}s
          </p>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "transcript" | "scorecard")}>
        <TabsList>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="scorecard">
            Scorecard
            {latestEvaluation && (
              <span className="ml-1.5 text-xs">({call.evaluations?.length ?? 0})</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transcript">
          <Card>
            <TranscriptViewer
              transcript={transcript}
              highlightedTurns={highlightedTurns}
              onTurnClick={(idx) =>
                setHighlightedTurns((prev) =>
                  prev.includes(idx) ? prev.filter((t) => t !== idx) : [...prev, idx]
                )
              }
            />
          </Card>
        </TabsContent>

        <TabsContent value="scorecard">
          {latestEvaluation ? (
            <div className="space-y-4">
              <ScoreCard evaluation={latestEvaluation} onEvidenceClick={handleEvidenceClick} />

              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-ink-500">Repeatability</h3>
                    <p className="text-xs text-ink-300 mt-0.5">
                      Re-runs this evaluation 3 times to measure how consistent the scores are.
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleCheckConsistency} disabled={checkingConsistency}>
                    {checkingConsistency ? "Running 3 evaluations…" : "Run consistency check (3×)"}
                  </Button>
                </div>
                {consistencyError && <p className="text-xs text-destructive mt-2">{consistencyError}</p>}
              </Card>

              {consistency && <ConsistencyPanel metrics={consistency} />}
            </div>
          ) : (
            <Card className="text-center py-12">
              <p className="text-ink-400 mb-2">No evaluation yet</p>
              <p className="text-sm text-ink-300 mb-4">Run an evaluation to see the scorecard.</p>
              <Button onClick={handleEvaluate} disabled={evaluating}>
                Evaluate Now
              </Button>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
