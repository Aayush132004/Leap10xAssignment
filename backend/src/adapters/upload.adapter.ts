import type { TranscriptTurn } from "../modules/calls/call.schema";
import { normalizeSpeaker } from "./speaker";

/**
 * Parses a plain text transcript into structured TranscriptTurns.
 * Supports formats like:
 *   Agent: Hello, how can I help?
 *   User: I need help with my order.
 *
 * Also supports numbered formats:
 *   1. Agent: Hello
 *   2. User: Hi there
 */
export function parseTextTranscript(text: string): TranscriptTurn[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const turns: TranscriptTurn[] = [];

  for (const line of lines) {
    // Match patterns like "Agent: text", "User: text", "1. Agent: text"
    const match = line.match(
      /^(?:\d+\.\s*)?(?:\[?\s*(?:Turn\s+\d+\s*\]?\s*)?)(agent|user|assistant|bot|customer|human|caller|ai):\s*(.+)/i
    );

    if (match) {
      const speaker = normalizeSpeaker(match[1]);
      const text = match[2].trim();

      turns.push({
        index: turns.length,
        speaker,
        text,
        startTime: null,
        endTime: null,
      });
    }
  }

  return turns;
}

/**
 * Parses a CSV transcript where each row is a turn.
 * Expected columns: speaker, text (and optionally: start_time, end_time)
 */
export function parseCsvTranscript(csvContent: string): TranscriptTurn[] {
  const lines = csvContent.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return []; // Need at least header + one row

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const speakerIdx = header.findIndex((h) =>
    ["speaker", "role", "from"].includes(h)
  );
  const textIdx = header.findIndex((h) =>
    ["text", "message", "content", "utterance"].includes(h)
  );

  if (speakerIdx === -1 || textIdx === -1) {
    throw new Error(
      'CSV must have "speaker" and "text" columns (or equivalent: role/from, message/content/utterance)'
    );
  }

  const turns: TranscriptTurn[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length <= Math.max(speakerIdx, textIdx)) continue;

    const speaker = normalizeSpeaker(cols[speakerIdx]);
    const text = cols[textIdx].trim();
    if (!text) continue;

    turns.push({
      index: turns.length,
      speaker,
      text,
      startTime: null,
      endTime: null,
    });
  }

  return turns;
}

/** Simple CSV line parser that handles quoted fields */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}
