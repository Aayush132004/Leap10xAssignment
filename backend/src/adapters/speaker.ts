/**
 * Normalizes a raw speaker label from any transcript source into "agent" | "user".
 * Shared by every adapter (dataset, upload) so the recognized synonyms never drift
 * between sources. Unrecognized labels default to "user" — a mislabeled/unknown speaker
 * is safer treated as the person being served than as the agent being evaluated.
 */
export function normalizeSpeaker(speaker: string): "agent" | "user" {
  const lower = speaker.toLowerCase().trim();
  const agentTerms = ["agent", "assistant", "bot", "ai", "system"];
  if (agentTerms.includes(lower)) return "agent";
  return "user";
}
