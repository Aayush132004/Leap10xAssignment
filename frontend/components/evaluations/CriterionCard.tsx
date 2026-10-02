"use client";

import { EvidenceBadge } from "./EvidenceBadge";
import { Badge } from "@/components/ui/badge";
import type { CriterionEvaluation } from "@/lib/types";

interface CriterionCardProps {
  criterionEval: CriterionEvaluation;
  onEvidenceClick?: (turnIndex: number) => void;
}

export function CriterionCard({ criterionEval, onEvidenceClick }: CriterionCardProps) {
  const isNotAssessable = criterionEval.status === "NOT_ASSESSABLE";
  const score = criterionEval.score;

  const scoreColor = isNotAssessable
    ? "text-ink-300"
    : score !== null && score >= 4
      ? "text-accent-green"
      : score !== null && score >= 3
        ? "text-accent-yellow"
        : "text-destructive";

  const criterionName = criterionEval.criterion?.name || "Criterion";
  const criterionDescription = criterionEval.criterion?.description || "";
  const criterionWeight = criterionEval.criterion?.weight;

  return (
    <div className="border border-ink-100/70 rounded-[2px_4px_3px_5px] p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="text-sm font-medium text-ink-600">{criterionName}</h4>
          {criterionDescription && <p className="text-xs text-ink-300 mt-0.5">{criterionDescription}</p>}
        </div>
        <div className="text-right shrink-0 ml-4">
          {isNotAssessable ? (
            <Badge className="text-xs">N/A</Badge>
          ) : (
            <span className={`font-sketch text-2xl ${scoreColor}`}>
              {score}
              <span className="text-xs text-ink-300">/5</span>
            </span>
          )}
          {criterionWeight != null && <p className="text-xs text-ink-200 mt-0.5">weight: {criterionWeight}</p>}
        </div>
      </div>

      {/* Reasoning */}
      <div className="mt-3 pt-3 border-t border-ink-100/30">
        <p className="text-xs text-ink-500 leading-relaxed">{criterionEval.reasoning}</p>
      </div>

      {/* Evidence + Failure tags */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <EvidenceBadge turnIndices={criterionEval.evidenceTurns} onTurnClick={onEvidenceClick} />
        {criterionEval.failureTags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {criterionEval.failureTags.map((tag) => (
              <Badge key={tag} className="bg-accent-red-light/50 text-destructive text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
