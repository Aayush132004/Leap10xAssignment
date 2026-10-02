import type { TranscriptTurn } from "../modules/calls/call.schema";
import { normalizeSpeaker } from "./speaker";

/**
 * A single raw turn as it may appear across dataset sources. Only `text` is required;
 * everything else has a documented fallback so the adapter tolerates varying field names.
 */
interface RawDatasetTurn {
  speaker: string;
  text: string;
  // camelCase (generic upload shape)
  startTime?: number;
  endTime?: number;
  // snake_case + `idx` (the assignment's real transcript shape, see datasets/README.md)
  idx?: number;
  start_sec?: number;
  end_sec?: number;
}

interface RawDatasetCall {
  // Generic shape uses `id` + `transcript`; the assignment's real shape uses
  // `call_id` + `turns` (see datasets/README.md). Both are accepted.
  id?: string;
  call_id?: string;
  agent_id?: string;
  transcript?: RawDatasetTurn[];
  turns?: RawDatasetTurn[];
  language?: string;
  duration?: number;
  durationSeconds?: number;
  duration_sec?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Normalizes calls from dataset JSON format into the internal NormalizedCall format.
 * Datasets may have varying structures — this adapter handles common patterns,
 * including the assignment's real `{ call_id, agent_id, turns: [{ idx, start_sec, end_sec }] }`
 * shape and the generic `{ id, transcript: [{ startTime, endTime }] }` shape.
 */
export function normalizeDatasetCalls(
  rawCalls: RawDatasetCall[]
): Array<{
  externalId: string | null;
  agentExternalId: string | null;
  language: string | null;
  durationSeconds: number | null;
  transcript: TranscriptTurn[];
}> {
  return rawCalls.map((raw, callIndex) => {
    const rawTurns = raw.turns ?? raw.transcript ?? [];
    const transcript: TranscriptTurn[] = rawTurns.map((turn, turnIndex) => ({
      index: typeof turn.idx === "number" ? turn.idx : turnIndex,
      speaker: normalizeSpeaker(turn.speaker),
      text: turn.text,
      startTime: turn.startTime ?? turn.start_sec ?? null,
      endTime: turn.endTime ?? turn.end_sec ?? null,
    }));

    const duration =
      raw.durationSeconds ?? raw.duration ?? raw.duration_sec ?? null;

    return {
      externalId: raw.call_id ?? raw.id ?? `dataset-${callIndex}`,
      agentExternalId: raw.agent_id ?? null,
      language: raw.language ?? null,
      durationSeconds: duration !== null ? Math.round(duration) : null,
      transcript,
    };
  });
}
