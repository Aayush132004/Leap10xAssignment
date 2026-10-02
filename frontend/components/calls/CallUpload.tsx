"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { callApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Agent } from "@/lib/types";

interface CallUploadProps {
  agents: Agent[];
  onUploadSuccess?: () => void;
}

interface NormalizedTurn {
  index: number;
  speaker: "agent" | "user";
  text: string;
  startTime: number | null;
  endTime: number | null;
}

interface ParsedCallItem {
  externalId: string | null;
  language: string | null;
  durationSeconds: number | null;
  transcript: NormalizedTurn[];
}

function normalizeSpeaker(speaker: unknown): "agent" | "user" {
  if (typeof speaker !== "string") return "user";
  const s = speaker.toLowerCase().trim();
  const agentTerms = ["agent", "assistant", "bot", "ai", "system", "rep", "representative", "support"];
  if (agentTerms.includes(s)) return "agent";
  return "user";
}

function parseTurnString(line: string, index: number): NormalizedTurn {
  const match = line.match(
    /^(?:\d+[\.\)]\s*)?(?:\[?\s*(?:Turn\s+\d+\s*\]?\s*)?)(agent|user|assistant|bot|customer|human|caller|client|rep|system):\s*(.+)/i
  );
  if (match) {
    return {
      index,
      speaker: normalizeSpeaker(match[1]),
      text: match[2].trim(),
      startTime: null,
      endTime: null,
    };
  }
  return {
    index,
    speaker: "user",
    text: line.trim(),
    startTime: null,
    endTime: null,
  };
}

function normalizeTranscriptTurns(raw: unknown): NormalizedTurn[] {
  if (!raw) return [];

  // Plain multiline string transcript
  if (typeof raw === "string") {
    const lines = raw.split("\n").filter((l) => l.trim().length > 0);
    return lines.map((l, i) => parseTurnString(l, i));
  }

  // Array of turns or strings
  if (Array.isArray(raw)) {
    const turns: NormalizedTurn[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (typeof item === "string") {
        turns.push(parseTurnString(item, i));
      } else if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const rawSpeaker =
          obj.speaker ?? obj.role ?? obj.from ?? obj.speaker_id ?? (i % 2 === 0 ? "agent" : "user");
        const rawText =
          obj.text ?? obj.message ?? obj.content ?? obj.utterance ?? obj.body ?? "";
        const startTime =
          typeof obj.startTime === "number"
            ? obj.startTime
            : typeof obj.start_time === "number"
            ? obj.start_time
            : null;
        const endTime =
          typeof obj.endTime === "number"
            ? obj.endTime
            : typeof obj.end_time === "number"
            ? obj.end_time
            : null;

        const text = String(rawText).trim();
        if (text) {
          turns.push({
            index: typeof obj.index === "number" ? obj.index : turns.length,
            speaker: normalizeSpeaker(rawSpeaker),
            text,
            startTime,
            endTime,
          });
        }
      }
    }
    return turns;
  }

  return [];
}

/**
 * Parses raw parsed JSON into a standardized list of calls
 */
function extractCallsFromJson(parsed: unknown): ParsedCallItem[] {
  if (!parsed) throw new Error("JSON file is empty");

  // Check if it's wrapped in { calls: [...] } or { data: [...] } or { records: [...] }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const arrayCandidate = obj.calls || obj.data || obj.records || obj.dataset || obj.conversations;
    if (Array.isArray(arrayCandidate)) {
      return extractCallsFromJson(arrayCandidate);
    }

    // It's a single call object
    const rawTranscript =
      obj.transcript || obj.turns || obj.messages || obj.conversation || obj.dialogue || obj.utterances;

    if (!rawTranscript) {
      throw new Error(
        "Could not find transcript turns in the JSON object. Please provide an object with a 'transcript' or 'messages' array, or an array of turns."
      );
    }

    const turns = normalizeTranscriptTurns(rawTranscript);
    if (turns.length === 0) {
      throw new Error("The call transcript contains no valid turns with text.");
    }

    const dur =
      typeof obj.durationSeconds === "number"
        ? Math.round(obj.durationSeconds)
        : typeof obj.duration === "number"
        ? Math.round(obj.duration)
        : null;

    return [
      {
        externalId: (obj.id as string) || (obj.externalId as string) || null,
        language: (obj.language as string) || (obj.lang as string) || null,
        durationSeconds: dur && dur > 0 ? dur : null,
        transcript: turns,
      },
    ];
  }

  // It's an array
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) throw new Error("Uploaded array is empty");

    // Check if the array contains transcript turns directly
    const first = parsed[0];
    const isDirectTurn =
      typeof first === "string" ||
      (first &&
        typeof first === "object" &&
        ("speaker" in first || "role" in first || "text" in first || "content" in first || "message" in first) &&
        !("transcript" in first) &&
        !("messages" in first) &&
        !("turns" in first));

    if (isDirectTurn) {
      // The whole array is a single call's transcript
      const turns = normalizeTranscriptTurns(parsed);
      if (turns.length === 0) {
        throw new Error("The uploaded transcript contains no valid turns.");
      }
      return [
        {
          externalId: null,
          language: null,
          durationSeconds: null,
          transcript: turns,
        },
      ];
    }

    // It is an array of call objects
    return parsed.map((item, idx) => {
      const obj = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const rawTranscript =
        obj.transcript || obj.turns || obj.messages || obj.conversation || obj.dialogue || obj.utterances;

      const turns = normalizeTranscriptTurns(rawTranscript);
      const dur =
        typeof obj.durationSeconds === "number"
          ? Math.round(obj.durationSeconds)
          : typeof obj.duration === "number"
          ? Math.round(obj.duration)
          : null;

      return {
        externalId: (obj.id as string) || (obj.externalId as string) || `call-${idx + 1}`,
        language: (obj.language as string) || (obj.lang as string) || null,
        durationSeconds: dur && dur > 0 ? dur : null,
        transcript: turns,
      };
    }).filter(c => c.transcript.length > 0);
  }

  throw new Error("Unsupported JSON format for calls upload.");
}

export function CallUpload({ agents, onUploadSuccess }: CallUploadProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedAgent, setSelectedAgent] = useState(agents.length === 1 ? agents[0].id : "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [mode, setMode] = useState<"json" | "text">("json");
  const [textInput, setTextInput] = useState("");

  const handleFileUpload = async (file: File) => {
    if (!selectedAgent) {
      setError("Please select an agent first.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const content = await file.text();
      let callsToCreate: ParsedCallItem[] = [];

      try {
        const parsed = JSON.parse(content);
        callsToCreate = extractCallsFromJson(parsed);
      } catch (jsonErr) {
        // Fallback: If not valid JSON, try parsing as line-based text
        const turns = normalizeTranscriptTurns(content);
        if (turns.length > 0) {
          callsToCreate = [
            {
              externalId: file.name.replace(/\.[^/.]+$/, ""),
              language: null,
              durationSeconds: null,
              transcript: turns,
            },
          ];
        } else {
          throw new Error(
            jsonErr instanceof Error
              ? `Invalid file: ${jsonErr.message}`
              : "Failed to parse file format."
          );
        }
      }

      if (callsToCreate.length === 0) {
        throw new Error("No valid calls or transcript turns found in the file.");
      }

      if (callsToCreate.length === 1) {
        const call = callsToCreate[0];
        await callApi.create({
          agentId: selectedAgent,
          source: "upload",
          transcript: call.transcript,
          externalId: call.externalId ?? undefined,
          language: call.language ?? undefined,
          durationSeconds: call.durationSeconds ?? undefined,
        });
        setSuccessMsg("Call transcript uploaded successfully.");
      } else {
        await callApi.bulkCreate({
          agentId: selectedAgent,
          calls: callsToCreate.map((call) => ({
            source: "dataset" as const,
            externalId: call.externalId,
            language: call.language,
            durationSeconds: call.durationSeconds,
            transcript: call.transcript,
          })),
        });
        setSuccessMsg(`Successfully uploaded ${callsToCreate.length} calls.`);
      }

      if (onUploadSuccess) {
        onUploadSuccess();
      } else {
        router.push("/calls");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload. Check file format.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleTextSubmit = async () => {
    if (!selectedAgent || !textInput.trim()) {
      setError("Please select an agent and enter a transcript.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const turns = normalizeTranscriptTurns(textInput);
      if (turns.length === 0) {
        throw new Error("No readable turns found. Use format 'Agent: ...' and 'User: ...'");
      }

      await callApi.create({
        agentId: selectedAgent,
        source: "upload",
        transcript: turns,
      });

      setSuccessMsg("Call created successfully.");
      setTextInput("");

      if (onUploadSuccess) {
        onUploadSuccess();
      } else {
        router.push("/calls");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create call.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-medium text-ink-500 mb-4">Upload Transcript</h2>

      {error && (
        <div className="text-sm text-destructive bg-accent-red-light/30 px-3 py-2 rounded-sm mb-4">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="text-sm text-accent-green bg-accent-green-light/30 px-3 py-2 rounded-sm mb-4">
          {successMsg}
        </div>
      )}

      <div className="mb-4">
        <Label>Agent</Label>
        <Select value={selectedAgent || undefined} onValueChange={setSelectedAgent}>
          <SelectTrigger>
            <SelectValue placeholder="Select an agent…" />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={mode} onValueChange={(v) => { setMode(v as "json" | "text"); setError(null); }}>
        <TabsList>
          <TabsTrigger value="json">JSON / Dataset File</TabsTrigger>
          <TabsTrigger value="text">Paste Text</TabsTrigger>
        </TabsList>

        <TabsContent value="json">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !selectedAgent}
            className="w-full py-6 border-dashed"
          >
            {uploading ? "Processing upload…" : "Drop or click to upload JSON transcript"}
          </Button>
          <p className="text-xs text-ink-300 mt-2">
            Accepts single call, turn array, or bulk dataset with transcript turns.
          </p>
        </TabsContent>

        <TabsContent value="text">
          <Textarea
            className="min-h-[200px] font-mono text-xs"
            placeholder={`Paste transcript turns:\nAgent: Hello, this is Nimbus Broadband support. Am I speaking with the account holder?\nUser: Yes, I am having trouble with my internet.\nAgent: Could you please confirm the last 4 digits of your registered mobile number?`}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
          />
          <Button
            type="button"
            onClick={handleTextSubmit}
            disabled={uploading || !selectedAgent || !textInput.trim()}
            className="mt-3"
          >
            {uploading ? "Creating…" : "Create Call"}
          </Button>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
