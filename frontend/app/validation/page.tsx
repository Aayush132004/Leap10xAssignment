"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { validationApi } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ValidationComparisonResponse, HumanCallLabel } from "@/lib/types";

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "," || char === "\t") && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function groupFlatLabels(
  items: Array<{
    callId: string;
    criterionId: string;
    humanScore: number;
    notes?: string;
  }>,
  overallResults?: Map<string, "PASS" | "FAIL">
): HumanCallLabel[] {
  const map = new Map<
    string,
    Array<{ callId: string; criterionId: string; humanScore: number; notes?: string }>
  >();

  for (const item of items) {
    const list = map.get(item.callId) || [];
    list.push(item);
    map.set(item.callId, list);
  }

  const result: HumanCallLabel[] = [];
  for (const [callId, criteria] of map.entries()) {
    result.push({
      callId,
      humanResult: overallResults?.get(callId),
      criteria,
    });
  }
  return result;
}

function parseHumanLabelsFromInput(raw: string): HumanCallLabel[] {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Please enter or upload human labels (CSV or JSON).");

  // If it starts with [ or {, try JSON first
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed)
        ? parsed
        : parsed.labels || parsed.calls || parsed.data;

      if (Array.isArray(list) && list.length > 0) {
        // If it's a flat array of criterion labels: [{ callId, criterionId, humanScore, ... }]
        if ("criterionId" in list[0] && !("criteria" in list[0])) {
          return groupFlatLabels(list);
        }
        return list;
      }
    } catch {
      // If JSON parse fails, fall through to CSV parsing
    }
  }

  // Parse as CSV / TSV
  const lines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) throw new Error("Input is empty.");

  const firstLineCols = parseCsvLine(lines[0]);
  let startIndex = 0;

  // Check if first line is a header
  const isHeader = firstLineCols.some((col) =>
    [
      "call",
      "call_id",
      "callid",
      "agent",
      "agent_id",
      "criterion",
      "weight",
      "score",
      "human_score",
    ].includes(col.toLowerCase())
  );
  if (isHeader) {
    startIndex = 1;
  }

  const flatItems: Array<{
    callId: string;
    criterionId: string;
    humanScore: number;
    notes?: string;
  }> = [];

  const overallResults = new Map<string, "PASS" | "FAIL">();

  for (let i = startIndex; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 2) continue;

    const callId = cols[0];
    const fullLineLower = lines[i].toLowerCase();

    // Check for OVERALL (pass/fail) row
    if (fullLineLower.includes("overall") || fullLineLower.includes("pass/fail")) {
      const isPass = cols.some((c) => c.toLowerCase() === "pass");
      const isFail = cols.some((c) => c.toLowerCase() === "fail");
      if (isPass) overallResults.set(callId, "PASS");
      else if (isFail) overallResults.set(callId, "FAIL");
      continue;
    }

    if (cols.length < 3) continue;

    // Standard benchmark format:
    // sup-01,support-nimbus-broadband,Diagnosis,25,5,2;3;6;7;8,"Verified the caller..."
    // Col 0: callId (sup-01)
    // Col 1: agentId or criterionName
    // Col 2: criterionName or weight
    let criterionId = "";
    let score = NaN;
    let notes = "";

    if (cols.length >= 5 && !isNaN(Number(cols[4]))) {
      // Format: callId, agentId, criterionName, weight, score, [evidence], [notes]
      criterionId = cols[2];
      score = parseFloat(cols[4]);
      notes = cols[6] || cols[5] || "";
    } else if (!isNaN(Number(cols[2]))) {
      // Format: callId, criterionId, score, [notes]
      criterionId = cols[1];
      score = parseFloat(cols[2]);
      notes = cols[3] || "";
    } else if (!isNaN(Number(cols[3]))) {
      // Format: callId, agentId, criterionId, score, [notes]
      criterionId = cols[2];
      score = parseFloat(cols[3]);
      notes = cols[4] || "";
    }

    if (callId && criterionId && !isNaN(score) && score >= 1 && score <= 5) {
      flatItems.push({
        callId,
        criterionId,
        humanScore: Math.round(score),
        notes: notes || undefined,
      });
    }
  }

  if (flatItems.length === 0) {
    throw new Error(
      "Could not parse valid labels from input. Expected CSV format: callId, agentId, criterionName, weight, score, evidence, notes"
    );
  }

  return groupFlatLabels(flatItems, overallResults);
}

export default function ValidationPage() {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ValidationComparisonResponse | null>(null);
  const [filterMismatchOnly, setFilterMismatchOnly] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setInputText(content);
      setError(null);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCompare = async () => {
    try {
      setLoading(true);
      setError(null);
      const labels = parseHumanLabelsFromInput(inputText);

      const res = await validationApi.compare(labels);
      setResult(res);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to run comparison");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!result?.csv) return;
    const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `validation-comparison-${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const metrics = result?.metrics;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-700">Human Validation & Trust</h1>
          <p className="text-sm text-ink-300 mt-1">
            Validate AI evaluator accuracy against human-labeled ground truth datasets
          </p>
        </div>
        {result && (
          <Button variant="secondary" size="sm" onClick={handleDownloadCsv}>
            Export Mismatches CSV
          </Button>
        )}
      </div>

      {/* Input section */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wider">
              Ground Truth Human Labels (CSV / JSON)
            </h2>
            <span className="text-[11px] text-ink-300">Paste CSV or JSON, or upload a file</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt,.json,.tsv"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-xs text-ink-500 hover:text-primary underline"
            >
              Upload CSV/JSON File
            </button>
          </div>
        </div>

        <Textarea
          rows={7}
          className="font-mono text-xs mb-3"
          placeholder={`Paste CSV lines (e.g. sup-01,support-nimbus-broadband,Diagnosis,25,5,2;3;6;7;8,"Verified...") or JSON.`}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />

        {error && (
          <div className="p-3 mb-3 bg-accent-red-light border border-destructive/30 text-destructive text-xs rounded-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={handleCompare} disabled={loading || !inputText.trim()}>
            {loading ? "Comparing with AI Evaluations…" : "Run Validation Comparison"}
          </Button>
        </div>
      </Card>

      {/* Results View */}
      {metrics && (
        <div className="space-y-6">
          {/* Unmatched labels — explicit instead of a silent "6 of 8" with no explanation */}
          {metrics.unmatchedCallIds.length > 0 && (
            <Card className="border-amber-600/30 bg-amber-600/5">
              <div className="flex items-start gap-2">
                <span className="text-amber-600 text-sm">⚠</span>
                <div>
                  <p className="text-sm font-medium text-ink-600">
                    {metrics.unmatchedCallIds.length} label{metrics.unmatchedCallIds.length === 1 ? "" : "s"} in your
                    input {metrics.unmatchedCallIds.length === 1 ? "wasn't" : "weren't"} compared
                  </p>
                  <p className="text-xs text-ink-300 mt-1">
                    No call with a matching ID or externalId exists in the database yet, so
                    these were left out of every stat below rather than silently counted as
                    matches or failures. Create/import these calls first if you want them
                    included:
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {metrics.unmatchedCallIds.map((id) => (
                      <Badge key={id} variant="outline" className="font-mono text-[11px]">
                        {id}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="text-center">
              <span className="text-xs font-medium text-ink-300 uppercase tracking-wider block mb-1">
                Exact Agreement
              </span>
              <span className="font-sketch text-3xl font-bold text-primary">
                {metrics.exactAgreementPct}%
              </span>
              <span className="text-xs text-ink-300 block mt-1">
                {metrics.exactMatches} of {metrics.totalPairs} pairs
              </span>
              <p className="text-[10px] text-ink-300 mt-2 leading-snug">
                % of criterion scores where the AI's score matched the human's score exactly.
              </p>
            </Card>

            <Card className="text-center">
              <span className="text-xs font-medium text-ink-300 uppercase tracking-wider block mb-1">
                Within ±1 Score
              </span>
              <span className="font-sketch text-3xl font-bold text-accent-green">
                {metrics.withinOneAgreementPct}%
              </span>
              <span className="text-xs text-ink-300 block mt-1">
                {metrics.withinOneMatches} of {metrics.totalPairs} pairs
              </span>
              <p className="text-[10px] text-ink-300 mt-2 leading-snug">
                % within 1 point of the human score — a softer bar than exact agreement.
              </p>
            </Card>

            <Card className="text-center">
              <span className="text-xs font-medium text-ink-300 uppercase tracking-wider block mb-1">
                Mean Abs Error (MAE)
              </span>
              <span className="font-sketch text-3xl font-bold text-ink-700">
                {metrics.mae.toFixed(2)}
              </span>
              <span className="text-xs text-ink-300 block mt-1">Average score deviation</span>
              <p className="text-[10px] text-ink-300 mt-2 leading-snug">
                Average size of the disagreement, in score points. 0 = perfect, lower is better.
              </p>
            </Card>

            <Card className="text-center">
              <span className="text-xs font-medium text-ink-300 uppercase tracking-wider block mb-1">
                Pass/Fail Agreement
              </span>
              <span
                className={`font-sketch text-3xl font-bold ${
                  metrics.passFailAgreementPct >= 80 ? "text-accent-green" : "text-amber-600"
                }`}
              >
                {metrics.passFailAgreementPct}%
              </span>
              <span className="text-xs text-ink-300 block mt-1">
                {metrics.passFailAgreements} of {metrics.passFailEvaluated} calls
              </span>
              <p className="text-[10px] text-ink-300 mt-2 leading-snug">
                % of calls where the AI's overall PASS/FAIL matched the human's verdict — the
                metric that matters most in production.
              </p>
            </Card>
          </div>

          {/* Overall agreement breakdown — a single visual instead of four separate numbers */}
          {metrics.totalPairs > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wider mb-1">
                Agreement Breakdown
              </h2>
              <p className="text-xs text-ink-300 mb-3">
                Every criterion score pair, split by how close the AI landed to the human score.
              </p>
              {(() => {
                const exact = metrics.exactMatches;
                const withinOneNotExact = metrics.withinOneMatches - metrics.exactMatches;
                const off = metrics.totalPairs - metrics.withinOneMatches;
                const pct = (n: number) => (n / metrics.totalPairs) * 100;
                const segments = [
                  { label: "Exact match", value: exact, color: "bg-accent-green" },
                  { label: "Within ±1", value: withinOneNotExact, color: "bg-primary" },
                  { label: "Off by 2+", value: off, color: "bg-destructive" },
                ].filter((s) => s.value > 0);
                return (
                  <>
                    <div className="flex h-6 w-full rounded-sm overflow-hidden border border-ink-100">
                      {segments.map((s) => (
                        <div
                          key={s.label}
                          className={s.color}
                          style={{ width: `${pct(s.value)}%` }}
                          title={`${s.label}: ${s.value} (${pct(s.value).toFixed(1)}%)`}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
                      {segments.map((s) => (
                        <div key={s.label} className="flex items-center gap-1.5 text-xs text-ink-400">
                          <span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} />
                          {s.label} — {s.value} ({pct(s.value).toFixed(1)}%)
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
            </Card>
          )}

          {/* Per-criterion accuracy — which criteria the AI struggles with most */}
          {metrics.criterionBreakdown.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wider mb-1">
                Accuracy by Criterion
              </h2>
              <p className="text-xs text-ink-300 mb-3">
                Exact-agreement rate per criterion, lowest first — where to look first if
                accuracy needs improving.
              </p>
              <div className="space-y-2.5">
                {metrics.criterionBreakdown.map((c) => (
                  <div key={c.criterionId}>
                    <div className="flex items-baseline justify-between text-xs mb-1">
                      <span className="text-ink-500 font-medium">
                        {c.criterionName || c.criterionId}
                      </span>
                      <span className="text-ink-300">
                        {c.exactAgreementPct}% ({c.exactMatches}/{c.totalPairs}) · MAE {c.mae.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-2.5 w-full bg-paper-200 rounded-sm overflow-hidden">
                      <div
                        className={`h-full ${
                          c.exactAgreementPct >= 80
                            ? "bg-accent-green"
                            : c.exactAgreementPct >= 50
                            ? "bg-primary"
                            : "bg-destructive"
                        }`}
                        style={{ width: `${c.exactAgreementPct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Failure Patterns */}
          {metrics.failurePatterns.length > 0 && (
            <Card>
              <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wider mb-1">
                Frequent Disagreement & Failure Patterns
              </h2>
              <p className="text-xs text-ink-300 mb-3">
                Behavior tags the AI flagged on calls (e.g. hard-rule violations), grouped by
                how often each one occurred across all matched calls.
              </p>
              <div className="flex flex-wrap gap-2">
                {metrics.failurePatterns.map((p) => (
                  <Badge key={p.tag} variant="outline" className="gap-1.5 px-2.5 py-1">
                    <span>{p.tag}</span>
                    <span className="font-sketch font-semibold text-primary">{p.count}</span>
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Mismatch Inspection Table */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-ink-600 uppercase tracking-wider">
                  Criterion Mismatch Inspection
                </h2>
                <p className="text-xs text-ink-300 mt-0.5">
                  Inspect discrepancy between human judgment and AI reasoning
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-400 cursor-pointer">
                <Checkbox
                  checked={filterMismatchOnly}
                  onCheckedChange={(checked) => setFilterMismatchOnly(checked === true)}
                />
                Show Mismatches Only ({metrics.mismatches.length})
              </label>
            </div>

            {metrics.mismatches.length === 0 ? (
              <p className="text-sm text-accent-green py-4 text-center">
                ✨ Perfect match! All evaluated criteria match ground-truth scores exactly.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Call</TableHead>
                    <TableHead>Criterion</TableHead>
                    <TableHead>Human</TableHead>
                    <TableHead>AI</TableHead>
                    <TableHead>Delta</TableHead>
                    <TableHead>Evidence Turns</TableHead>
                    <TableHead>AI Reasoning</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.mismatches.map((m, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono">
                        <Link href={`/calls/${m.callId}`} className="text-primary hover:underline">
                          {m.callId.slice(0, 8)}…
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium text-ink-600">
                        {m.criterionName || m.criterionId.slice(0, 8)}
                      </TableCell>
                      <TableCell>
                        <span className="font-sketch font-bold text-ink-700 bg-paper-200 px-2 py-0.5 rounded">
                          {m.humanScore}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="font-sketch font-bold text-primary bg-accent-blue-light px-2 py-0.5 rounded">
                          {m.aiScore ?? "N/A"}
                        </span>
                      </TableCell>
                      <TableCell className="font-sketch font-semibold text-amber-600">
                        {m.delta !== null ? `±${m.delta}` : "—"}
                      </TableCell>
                      <TableCell>
                        {m.aiEvidenceTurns && m.aiEvidenceTurns.length > 0 ? (
                          <div className="flex gap-1 flex-wrap">
                            {m.aiEvidenceTurns.map((t) => (
                              <Badge key={t} className="text-[10px]">
                                T{t}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-ink-200">none</span>
                        )}
                      </TableCell>
                      <TableCell className="text-ink-400 max-w-xs truncate" title={m.aiReasoning}>
                        {m.aiReasoning || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
