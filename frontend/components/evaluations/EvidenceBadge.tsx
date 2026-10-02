"use client";

interface EvidenceBadgeProps {
  turnIndices: number[];
  onTurnClick?: (index: number) => void;
}

export function EvidenceBadge({ turnIndices, onTurnClick }: EvidenceBadgeProps) {
  if (turnIndices.length === 0) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs text-ink-300">Evidence:</span>
      {turnIndices.map((idx) => (
        <button
          key={idx}
          onClick={() => onTurnClick?.(idx)}
          className="inline-flex items-center px-1.5 py-0.5 text-xs font-sketch
                     bg-accent-yellow-light text-accent-yellow border border-accent-yellow/30
                     rounded-sm hover:bg-accent-yellow/20 transition-colors cursor-pointer"
          style={{ borderRadius: "2px 3px 2px 3px" }}
        >
          Turn {idx}
        </button>
      ))}
    </div>
  );
}
