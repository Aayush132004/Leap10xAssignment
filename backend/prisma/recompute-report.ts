import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  compareEvaluations,
  exportComparisonToCsv,
  computeConsistencyMetrics,
  type HumanCallLabel,
  type AiCallEvaluationData,
} from "../src/ai/comparison.engine";

/**
 * Recomputes accuracy metrics from evaluations ALREADY IN THE DATABASE, with zero new
 * Groq calls. Used after run-benchmark.ts crashed partway through the consistency phase
 * (Groq free-tier daily token cap) — the first accuracy pass over all 20 calls had
 * already completed and persisted before the crash, so this just reads it back.
 */
const prisma = new PrismaClient();

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
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((s) => s.trim());
}

function parseDevLabels(csvPath: string): HumanCallLabel[] {
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = {
    callId: header.indexOf("call_id"),
    criterion: header.indexOf("criterion"),
    score: header.indexOf("score"),
  };
  const byCall = new Map<string, HumanCallLabel>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const callId = cols[idx.callId];
    const criterion = cols[idx.criterion];
    const rawScore = cols[idx.score];
    if (!callId || !criterion) continue;
    if (!byCall.has(callId)) byCall.set(callId, { callId, criteria: [] });
    const entry = byCall.get(callId)!;
    if (criterion.toUpperCase().startsWith("OVERALL")) {
      if (rawScore === "pass") entry.humanResult = "PASS";
      else if (rawScore === "fail") entry.humanResult = "FAIL";
      continue;
    }
    if (rawScore === "NA" || rawScore === "") continue;
    const humanScore = parseInt(rawScore, 10);
    if (Number.isNaN(humanScore)) continue;
    entry.criteria.push({ callId, criterionId: criterion, humanScore });
  }
  return Array.from(byCall.values());
}

async function main() {
  const outDir = path.resolve(__dirname, "../../notes/results");
  fs.mkdirSync(outDir, { recursive: true });

  const calls = await prisma.call.findMany({
    include: {
      evaluations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { criterionEvaluations: { include: { criterion: true } } },
      },
    },
  });

  const aiData: AiCallEvaluationData[] = [];
  const promptVersions = new Set<string>();

  for (const call of calls) {
    const latest = call.evaluations[0];
    if (!latest) continue;
    promptVersions.add(latest.promptVersion);
    aiData.push({
      callId: call.id,
      externalId: call.externalId ?? undefined,
      result: latest.result as "PASS" | "FAIL",
      criteria: latest.criterionEvaluations.map((ce) => ({
        criterionId: ce.criterionId,
        criterionName: ce.criterion?.name,
        score: ce.score,
        reasoning: ce.reasoning,
        evidenceTurns: ce.evidenceTurns,
        failureTags: ce.failureTags,
      })),
    });
  }

  console.log(`Using latest evaluation per call. Prompt versions present: ${[...promptVersions].join(", ")}`);

  const labelsPath = path.resolve(__dirname, "../../datasets/labels/dev-labels.csv");
  const humanLabels = parseDevLabels(labelsPath);
  const metrics = compareEvaluations(humanLabels, aiData);
  const mismatchCsv = exportComparisonToCsv(metrics.mismatches);

  console.log("\n=== Accuracy vs human labels (recomputed from DB, latest eval per call) ===");
  console.log(`Exact agreement: ${metrics.exactAgreementPct}% (${metrics.exactMatches}/${metrics.totalPairs})`);
  console.log(`Within +/-1: ${metrics.withinOneAgreementPct}% (${metrics.withinOneMatches}/${metrics.totalPairs})`);
  console.log(`MAE: ${metrics.mae}`);
  console.log(`PASS/FAIL agreement: ${metrics.passFailAgreementPct}% (${metrics.passFailAgreements}/${metrics.passFailEvaluated})`);
  console.log(`Mismatches: ${metrics.mismatches.length}`);
  for (const m of metrics.mismatches) {
    console.log(`  ${m.callId} / ${m.criterionName}: human=${m.humanScore} ai=${m.aiScore} delta=${m.delta}`);
  }

  // --- Consistency: recompute from whatever v1.2 repeat-evaluations already exist in
  // the DB (no new Groq calls). Some labeled calls only have 1 v1.2 evaluation (the
  // benchmark script's consistency phase crashed on the Groq free-tier daily token cap
  // before reaching them) — those are reported as "insufficient runs" rather than faked.
  const labeledExternalIds = humanLabels.map((l) => l.callId);
  const labeledCalls = await prisma.call.findMany({
    where: { externalId: { in: labeledExternalIds } },
    include: {
      evaluations: {
        where: { promptVersion: "v1.2" },
        orderBy: { createdAt: "asc" },
        include: { criterionEvaluations: { include: { criterion: true } } },
      },
    },
  });

  const consistency: Record<string, unknown> = {};
  for (const call of labeledCalls) {
    if (!call.externalId) continue;
    if (call.evaluations.length < 2) {
      consistency[call.externalId] = {
        runs: call.evaluations.length,
        note: "Insufficient v1.2 runs for a consistency measurement (benchmark script hit the Groq daily token cap before reaching this call) — re-run npm run db:benchmark once quota resets.",
      };
      continue;
    }
    consistency[call.externalId] = computeConsistencyMetrics(
      call.evaluations.map((ev) => ({
        overallScore: ev.overallScore,
        result: ev.result as "PASS" | "FAIL",
        criteria: ev.criterionEvaluations.map((ce) => ({
          criterionId: ce.criterionId,
          criterionName: ce.criterion?.name,
          score: ce.score,
        })),
      }))
    );
  }

  console.log("\n=== Consistency (from whatever v1.2 repeat-runs exist) ===");
  for (const [callId, c] of Object.entries(consistency)) {
    console.log(`  ${callId}:`, JSON.stringify(c).slice(0, 200));
  }

  fs.writeFileSync(
    path.join(outDir, "benchmark-v1.2-accuracy.json"),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), promptVersions: [...promptVersions], accuracy: metrics, consistency },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(outDir, "mismatches-v1.2.csv"), mismatchCsv);
  console.log("\nWrote notes/results/benchmark-v1.2-accuracy.json and mismatches-v1.2.csv");
}

main()
  .catch((e) => {
    console.error("Recompute failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
