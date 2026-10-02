"use client";

import { CriterionCard } from "./CriterionCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Evaluation } from "@/lib/types";

interface ScoreCardProps {
  evaluation: Evaluation;
  onEvidenceClick?: (turnIndex: number) => void;
}

export function ScoreCard({ evaluation, onEvidenceClick }: ScoreCardProps) {
  const isPassing = evaluation.result === "PASS";

  return (
    <div className="space-y-4">
      {/* Overall result */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-ink-300 uppercase tracking-wide">Overall Score</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`font-sketch text-4xl ${isPassing ? "text-accent-green" : "text-destructive"}`}>
                {evaluation.overallScore.toFixed(1)}
              </span>
              <span className="text-sm text-ink-300">/5</span>
            </div>
          </div>
          <div className="text-right">
            <Badge variant={isPassing ? "pass" : "fail"} className="text-lg px-3 py-1">
              {evaluation.result}
            </Badge>
            <p className="text-xs text-ink-300 mt-2">
              {evaluation.model} · {evaluation.promptVersion}
            </p>
            <p className="text-xs text-ink-200">{new Date(evaluation.createdAt).toLocaleString()}</p>
          </div>
        </div>
      </Card>

      {/* Unusual things */}
      {evaluation.unusualThings.length > 0 && (
        <Card className="border-accent-yellow/30">
          <h3 className="text-sm font-medium text-ink-500 mb-2">Unusual Observations</h3>
          <ul className="space-y-1">
            {evaluation.unusualThings.map((thing, i) => (
              <li key={i} className="text-xs text-ink-500 flex items-start gap-2">
                <span className="text-accent-yellow">•</span>
                {thing}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Per-criterion evaluations */}
      <div>
        <h3 className="text-sm font-medium text-ink-500 mb-3">
          Criterion Evaluations ({evaluation.criterionEvaluations.length})
        </h3>
        <div className="space-y-3">
          {evaluation.criterionEvaluations.map((ce) => (
            <CriterionCard key={ce.id} criterionEval={ce} onEvidenceClick={onEvidenceClick} />
          ))}
        </div>
      </div>
    </div>
  );
}
