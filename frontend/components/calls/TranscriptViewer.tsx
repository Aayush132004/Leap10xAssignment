"use client";

import type { TranscriptTurn } from "@/lib/types";

interface TranscriptViewerProps {
  transcript: TranscriptTurn[];
  highlightedTurns?: number[];
  onTurnClick?: (index: number) => void;
}

export function TranscriptViewer({
  transcript,
  highlightedTurns = [],
  onTurnClick,
}: TranscriptViewerProps) {
  const highlightSet = new Set(highlightedTurns);

  return (
    <div className="space-y-2">
      {transcript.map((turn) => {
        const isHighlighted = highlightSet.has(turn.index);
        const isAgent = turn.speaker === "agent";

        return (
          <div
            key={turn.index}
            className={`flex gap-3 p-2.5 rounded-sm transition-colors cursor-default ${
              isHighlighted
                ? "bg-accent-yellow-light border border-accent-yellow/40"
                : "hover:bg-paper-100"
            }`}
            style={{ borderRadius: "2px 3px 2px 4px" }}
            onClick={() => onTurnClick?.(turn.index)}
          >
            {/* Turn index */}
            <span className="font-sketch text-xs text-ink-200 w-6 shrink-0 pt-0.5 text-right">
              {turn.index}
            </span>

            {/* Speaker badge */}
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded-sm shrink-0 ${
                isAgent
                  ? "bg-accent-blue-light text-accent-blue"
                  : "bg-paper-200 text-ink-400"
              }`}
              style={{ borderRadius: "2px 3px 2px 3px" }}
            >
              {isAgent ? "Agent" : "User"}
            </span>

            {/* Text */}
            <p className="text-sm text-ink-600 flex-1 leading-relaxed">
              {turn.text}
            </p>

            {/* Evidence indicator */}
            {isHighlighted && (
              <span className="text-xs text-accent-yellow font-sketch shrink-0 pt-0.5">
                evidence
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
