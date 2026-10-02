"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ConsistencyMetrics } from "@/lib/types";

interface ConsistencyPanelProps {
  metrics: ConsistencyMetrics;
}

/**
 * Shows how much the evaluator's scores and PASS/FAIL result vary when the same
 * call is scored more than once — directly answers "how consistent is your system".
 */
export function ConsistencyPanel({ metrics }: ConsistencyPanelProps) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-ink-500">Consistency across {metrics.runs} runs</h3>
        <Badge variant={metrics.resultIsStable ? "pass" : "warning"}>
          {metrics.resultIsStable ? "Stable PASS/FAIL" : "PASS/FAIL flipped between runs"}
        </Badge>
      </div>

      <p className="text-xs text-ink-300 mb-3">
        Results: {metrics.results.join(" → ")} · overall score range: ±
        {(metrics.overallScoreRange / 2).toFixed(2)}
      </p>

      <div className="space-y-2">
        {metrics.criteria.map((c) => (
          <div
            key={c.criterionId}
            className="flex items-center justify-between text-xs border-t border-ink-100/50 pt-2"
          >
            <span className="text-ink-500">{c.criterionName || c.criterionId}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-ink-400">
                [{c.scores.map((s) => (s === null ? "NA" : s)).join(", ")}]
              </span>
              {!c.allAssessable ? (
                <Badge>not always assessable</Badge>
              ) : c.range === 0 ? (
                <Badge variant="pass">no spread</Badge>
              ) : (
                <Badge variant="warning">spread ±{c.range}</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
