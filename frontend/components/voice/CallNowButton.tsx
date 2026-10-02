"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { voiceApi, callApi, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Call } from "@/lib/types";

interface CallNowButtonProps {
  agentId: string;
}

interface LiveTurn {
  speaker: "agent" | "user";
  text: string;
}

type CallPhase = "idle" | "connecting" | "in-call" | "saving" | "done" | "error";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;

/**
 * Places a real call entirely in the browser via Vapi's Web SDK — no phone number,
 * no Twilio, no backend webhook. Needs only NEXT_PUBLIC_VAPI_PUBLIC_KEY (frontend env)
 * and microphone access. The live transcript is assembled from the SDK's own 'message'
 * events (genuinely real-time, not simulated) and posted to the normal /api/calls
 * endpoint when the call ends, so it flows through the exact same evaluation pipeline
 * as an uploaded or dataset transcript.
 */
export function CallNowButton({ agentId }: CallNowButtonProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<CallPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [savedCall, setSavedCall] = useState<Call | null>(null);
  const vapiRef = useRef<import("@vapi-ai/web").default | null>(null);
  const startedAtRef = useRef<number>(0);
  const turnsRef = useRef<LiveTurn[]>([]);

  useEffect(() => {
    return () => {
      vapiRef.current?.stop();
    };
  }, []);

  const reset = () => {
    vapiRef.current?.stop();
    setOpen(false);
    setPhase("idle");
    setError(null);
    setTurns([]);
    turnsRef.current = [];
    setSavedCall(null);
  };

  const saveTranscript = async () => {
    if (turnsRef.current.length === 0) {
      setError("Call ended with no captured speech — nothing to save.");
      setPhase("error");
      return;
    }
    setPhase("saving");
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
    try {
      const call = await callApi.create({
        agentId,
        source: "vapi",
        durationSeconds,
        transcript: turnsRef.current.map((t, i) => ({
          index: i,
          speaker: t.speaker,
          text: t.text,
          startTime: null,
          endTime: null,
        })),
      });
      setSavedCall(call);
      setPhase("done");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save the call transcript.");
      setPhase("error");
    }
  };

  const handleStart = async () => {
    if (!PUBLIC_KEY) {
      setError(
        "NEXT_PUBLIC_VAPI_PUBLIC_KEY is not set in frontend/.env.local. Get it from your Vapi dashboard's API keys page."
      );
      setPhase("error");
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        "Browser blocked microphone: Browsers disable microphone on plain HTTP IP addresses (only HTTPS or localhost are allowed). To test on this IP in Chrome: open chrome://flags/#unsafely-treat-insecure-origin-as-secure, enable it, add http://161.118.185.230, and relaunch."
      );
      setPhase("error");
      return;
    }

    setError(null);
    setPhase("connecting");
    setTurns([]);
    turnsRef.current = [];

    try {
      const assistant = await voiceApi.getAssistantConfig(agentId);
      const { default: Vapi } = await import("@vapi-ai/web");
      const vapi = new Vapi(PUBLIC_KEY);
      vapiRef.current = vapi;

      vapi.on("call-start", () => {
        startedAtRef.current = Date.now();
        setPhase("in-call");
      });

      vapi.on("message", (message: any) => {
        if (message?.type !== "transcript") return;
        if (message.transcriptType && message.transcriptType !== "final") return;
        const speaker: "agent" | "user" = message.role === "user" ? "user" : "agent";
        const text = String(message.transcript ?? "").trim();
        if (!text) return;
        turnsRef.current = [...turnsRef.current, { speaker, text }];
        setTurns(turnsRef.current);
      });

      vapi.on("call-end", () => {
        saveTranscript();
      });

      vapi.on("error", (err: any) => {
        console.error("Vapi call error:", err);
        const msg =
          err?.error?.message ||
          err?.message ||
          (typeof err === "string" ? err : null);
        if (msg) {
          setError(msg);
        } else if (typeof window !== "undefined" && !window.isSecureContext) {
          setError("Microphone access failed: browsers block microphone on plain HTTP IP addresses. Access via HTTPS or enable the Chrome insecure origin flag.");
        } else {
          setError("The call ended unexpectedly.");
        }
        setPhase("error");
      });

      // vapi.start() accepts an inline assistant config object, not just an assistant ID.
      await vapi.start(assistant as any);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to start the call. Check microphone permissions.");
      setPhase("error");
    }
  };

  const handleEndCall = () => {
    vapiRef.current?.stop();
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Call Now
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : reset())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Call this agent now</DialogTitle>
          </DialogHeader>

          {phase === "idle" && (
            <>
              <p className="text-xs text-ink-300 mb-4">
                Places a real voice call in your browser via Vapi (microphone required) and
                evaluates the resulting transcript through the same pipeline as any other
                call. No phone number needed.
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={reset}>
                  Cancel
                </Button>
                <Button onClick={handleStart}>Start Call</Button>
              </div>
            </>
          )}

          {(phase === "connecting" || phase === "in-call") && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className={`h-2 w-2 rounded-full ${
                    phase === "in-call" ? "bg-accent-green animate-pulse" : "bg-primary"
                  }`}
                />
                <p className="text-sm font-medium text-ink-600">
                  {phase === "connecting" ? "Connecting…" : "Call in progress"}
                </p>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2 mb-4 bg-paper-100 rounded-sm p-3">
                {turns.length === 0 ? (
                  <p className="text-xs text-ink-300">Waiting for the conversation to start…</p>
                ) : (
                  turns.map((t, i) => (
                    <div key={i} className="text-xs">
                      <span className={`font-medium ${t.speaker === "agent" ? "text-primary" : "text-ink-500"}`}>
                        {t.speaker === "agent" ? "Agent" : "You"}:
                      </span>{" "}
                      <span className="text-ink-500">{t.text}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="destructive" onClick={handleEndCall}>
                  End Call
                </Button>
              </div>
            </div>
          )}

          {phase === "saving" && <p className="text-sm text-primary">Saving transcript…</p>}

          {phase === "done" && savedCall && (
            <div>
              <p className="text-sm text-accent-green mb-4">Call saved ({turns.length} turns).</p>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={reset}>
                  Close
                </Button>
                <Button asChild>
                  <Link href={`/calls/${savedCall.id}`}>View call</Link>
                </Button>
              </div>
            </div>
          )}

          {phase === "error" && (
            <div>
              <p className="text-xs text-destructive mb-4">{error}</p>
              <div className="flex justify-end">
                <Button variant="secondary" onClick={reset}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
