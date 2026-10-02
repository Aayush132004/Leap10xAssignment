import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { EvaluationService } from "../src/modules/evaluations/evaluation.service";
import {
  compareEvaluations,
  exportComparisonToCsv,
  computeConsistencyMetrics,
  type HumanCallLabel,
  type AiCallEvaluationData,
} from "../src/ai/comparison.engine";

const prisma = new PrismaClient();
const evaluationService = new EvaluationService();

const CONSISTENCY_RUNS = 3;

/** Minimal quoted-CSV line parser (matches the pattern used in upload.adapter.ts). */
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

/** Parses datasets/labels/dev-labels.csv into HumanCallLabel[] (grouped by call_id). */
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

    if (rawScore === "NA" || rawScore === "") continue; // human also marked not-assessable; skip from score comparison
    const humanScore = parseInt(rawScore, 10);
    if (Number.isNaN(humanScore)) continue;

    entry.criteria.push({ callId, criterionId: criterion, humanScore });
  }

  return Array.from(byCall.values());
}

async function main() {
  const outDir = path.resolve(__dirname, "../../notes/results");
  fs.mkdirSync(outDir, { recursive: true });

  const calls = await prisma.call.findMany({ orderBy: { externalId: "asc" } });
  console.log(`Evaluating all ${calls.length} seeded calls once...`);

  const aiData: AiCallEvaluationData[] = [];
  const overallScoreByCallId = new Map<string, number>();
  for (const call of calls) {
    const evalResult = await evaluationService.evaluateCall(call.id);
    overallScoreByCallId.set(call.id, evalResult.overallScore);
    aiData.push({
      callId: call.id,
      externalId: call.externalId ?? undefined,
      result: evalResult.result as "PASS" | "FAIL",
      criteria: evalResult.criterionEvaluations.map((ce) => ({
        criterionId: ce.criterionId,
        criterionName: ce.criterion?.name,
        score: ce.score,
        reasoning: ce.reasoning,
        evidenceTurns: ce.evidenceTurns,
        failureTags: ce.failureTags,
      })),
    });
    console.log(`  ${call.externalId ?? call.id}: ${evalResult.result} (${evalResult.overallScore})`);
  }

  const labelsPath = path.resolve(__dirname, "../../datasets/labels/dev-labels.csv");
  const humanLabels = parseDevLabels(labelsPath);
  console.log(`\nLoaded ${humanLabels.length} human-labeled calls from dev-labels.csv`);

  const metrics = compareEvaluations(humanLabels, aiData);
  const mismatchCsv = exportComparisonToCsv(metrics.mismatches);

  console.log("\n=== Accuracy vs human labels ===");
  console.log(`Exact agreement: ${metrics.exactAgreementPct}% (${metrics.exactMatches}/${metrics.totalPairs})`);
  console.log(`Within +/-1: ${metrics.withinOneAgreementPct}% (${metrics.withinOneMatches}/${metrics.totalPairs})`);
  console.log(`MAE: ${metrics.mae}`);
  console.log(
    `PASS/FAIL agreement: ${metrics.passFailAgreementPct}% (${metrics.passFailAgreements}/${metrics.passFailEvaluated})`
  );

  // --- Consistency: re-run each of the 8 labeled calls a further (CONSISTENCY_RUNS - 1) times ---
  console.log(`\nRunning consistency check (${CONSISTENCY_RUNS} runs each) on labeled calls...`);
  const labeledCallIds = new Set(humanLabels.map((l) => l.callId));
  const consistencyResults: Record<string, ReturnType<typeof computeConsistencyMetrics>> = {};

  for (const call of calls) {
    if (!call.externalId || !labeledCallIds.has(call.externalId)) continue;

    const firstRun = aiData.find((a) => a.callId === call.id)!;
    const runs = [
      {
        overallScore: overallScoreByCallId.get(call.id)!,
        result: firstRun.result,
        criteria: firstRun.criteria,
      },
    ];
    for (let i = 1; i < CONSISTENCY_RUNS; i++) {
      const evalResult = await evaluationService.evaluateCall(call.id);
      runs.push({
        overallScore: evalResult.overallScore,
        result: evalResult.result as "PASS" | "FAIL",
        criteria: evalResult.criterionEvaluations.map((ce) => ({
          criterionId: ce.criterionId,
          criterionName: ce.criterion?.name,
          score: ce.score,
        })),
      });
    }

    const consistency = computeConsistencyMetrics(runs);
    consistencyResults[call.externalId] = consistency;
    console.log(
      `  ${call.externalId}: results=[${consistency.results.join(", ")}] stable=${consistency.resultIsStable}`
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    accuracy: metrics,
    consistency: consistencyResults,
  };

  fs.writeFileSync(path.join(outDir, "benchmark.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outDir, "mismatches.csv"), mismatchCsv);

  console.log(`\nWrote notes/results/benchmark.json and notes/results/mismatches.csv`);
}

main()
  .catch((e) => {
    console.error("Benchmark failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
