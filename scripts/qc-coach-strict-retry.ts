import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import OpenAI from "openai";

import { runTargetedCoachImageEdit } from "../lib/coach-image-render";
import { runCoachReferenceVisualQc } from "../lib/coach-reference-qc";
import { getEnv, isGptImageModel } from "../lib/config";
import type { CoachPhotographyCoachResult, CoachReferenceVisualQcResult } from "../lib/types";

function loadEnvFile(envPath: string) {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] ??= value;
  }
}

interface ExistingCase {
  id: string;
  targetDefects: string[];
  outputPath: string;
  reportPath: string;
}

interface StrictCaseResult {
  id: string;
  initialScore: number;
  initialAdherence: number;
  initialPassedUnderStrictRule: boolean;
  retried: boolean;
  retryScore: number | null;
  retryAdherence: number | null;
  finalScore: number;
  finalAdherence: number;
  finalPassed: boolean;
  selected: "initial" | "retry";
  initialMismatch: string | null;
  finalMismatch: string | null;
  outputPath: string;
  error: string | null;
}

const workspace = resolve(import.meta.dirname, "..");
loadEnvFile(resolve(workspace, ".env"));
process.env.OPENAI_COACH_VISUAL_QC_ENABLED = "true";
const env = getEnv();
const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
const fixtureDir = resolve(workspace, "qc-fixtures/synthetic-bad-10");
const outputDir = resolve(workspace, "qc-output/synthetic-bad-10");
const existingSummary = JSON.parse(
  readFileSync(resolve(outputDir, "summary.json"), "utf8")
) as { cases: ExistingCase[] };
const concurrency = 2;

async function runCase(item: ExistingCase): Promise<StrictCaseResult> {
  const report = JSON.parse(readFileSync(item.reportPath, "utf8"));
  const initialQc = report.visualQcInitial as CoachReferenceVisualQcResult;
  const initialAdherence = initialQc.scores.capture_plan_adherence;
  const initialPassedUnderStrictRule =
    initialQc.hard_failures.length === 0 &&
    initialQc.total_score >= env.OPENAI_COACH_VISUAL_QC_THRESHOLD &&
    initialAdherence >= 22;

  if (initialPassedUnderStrictRule) {
    return {
      id: item.id,
      initialScore: initialQc.total_score,
      initialAdherence,
      initialPassedUnderStrictRule,
      retried: false,
      retryScore: null,
      retryAdherence: null,
      finalScore: initialQc.total_score,
      finalAdherence: initialAdherence,
      finalPassed: true,
      selected: "initial",
      initialMismatch: initialQc.largest_mismatch,
      finalMismatch: initialQc.largest_mismatch,
      outputPath: item.outputPath,
      error: null
    };
  }

  const sourcePath = resolve(fixtureDir, `${item.id}.jpg`);
  const strictOutputPath = resolve(outputDir, `${item.id}__strict-output.png`);
  try {
    const sourceBytes = readFileSync(sourcePath);
    const sourceFile = new File([sourceBytes], basename(sourcePath), { type: "image/jpeg" });
    const retry = await runTargetedCoachImageEdit({
      client,
      sourceImageFile: sourceFile,
      generatedImageBase64: readFileSync(item.outputPath).toString("base64"),
      retryInstruction: initialQc.retry_instruction ?? initialQc.largest_mismatch ?? "Match the capture plan more precisely",
      model: env.OPENAI_IMAGE_MODEL,
      size: env.OPENAI_IMAGE_SIZE,
      quality: "medium",
      isGptImage: isGptImageModel(env.OPENAI_IMAGE_MODEL)
    });
    if (!retry.generatedImageBase64) throw new Error("Strict retry returned no image");

    const retryQc = await runCoachReferenceVisualQc({
      client,
      sourceImage: sourceBytes,
      sourceMimeType: "image/jpeg",
      generatedImageBase64: retry.generatedImageBase64,
      coachResult: report.coachResult as CoachPhotographyCoachResult
    });
    writeFileSync(strictOutputPath, Buffer.from(retry.generatedImageBase64, "base64"));
    writeFileSync(
      resolve(outputDir, `${item.id}__strict-qc.json`),
      JSON.stringify(retryQc, null, 2)
    );

    const selectRetry = retryQc.passed || retryQc.total_score > initialQc.total_score;
    const selected = selectRetry ? retryQc : initialQc;
    return {
      id: item.id,
      initialScore: initialQc.total_score,
      initialAdherence,
      initialPassedUnderStrictRule,
      retried: true,
      retryScore: retryQc.total_score,
      retryAdherence: retryQc.scores.capture_plan_adherence,
      finalScore: selected.total_score,
      finalAdherence: selected.scores.capture_plan_adherence,
      finalPassed: selectRetry ? retryQc.passed : initialPassedUnderStrictRule,
      selected: selectRetry ? "retry" : "initial",
      initialMismatch: initialQc.largest_mismatch,
      finalMismatch: selected.largest_mismatch,
      outputPath: selectRetry ? strictOutputPath : item.outputPath,
      error: null
    };
  } catch (error) {
    return {
      id: item.id,
      initialScore: initialQc.total_score,
      initialAdherence,
      initialPassedUnderStrictRule,
      retried: true,
      retryScore: null,
      retryAdherence: null,
      finalScore: initialQc.total_score,
      finalAdherence: initialAdherence,
      finalPassed: false,
      selected: "initial",
      initialMismatch: initialQc.largest_mismatch,
      finalMismatch: initialQc.largest_mismatch,
      outputPath: item.outputPath,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function consume() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
      console.log(`[strict] completed ${index + 1}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

const cases = await mapWithConcurrency(existingSummary.cases, concurrency, runCase);
const aggregate = {
  total: cases.length,
  strictInitialPasses: cases.filter((item) => item.initialPassedUnderStrictRule).length,
  retried: cases.filter((item) => item.retried).length,
  finalPasses: cases.filter((item) => item.finalPassed).length,
  retrySelected: cases.filter((item) => item.selected === "retry").length,
  errors: cases.filter((item) => item.error).length,
  averageInitialScore: Math.round(cases.reduce((sum, item) => sum + item.initialScore, 0) / cases.length),
  averageFinalScore: Math.round(cases.reduce((sum, item) => sum + item.finalScore, 0) / cases.length),
  averageInitialAdherence: Math.round(cases.reduce((sum, item) => sum + item.initialAdherence, 0) / cases.length),
  averageFinalAdherence: Math.round(cases.reduce((sum, item) => sum + item.finalAdherence, 0) / cases.length)
};
writeFileSync(resolve(outputDir, "summary-strict.json"), JSON.stringify({ aggregate, cases }, null, 2));
const markdown = [
  "# Strict visual-QC retry summary",
  "",
  `- Initial pass at adherence >=22: ${aggregate.strictInitialPasses}/${aggregate.total}`,
  `- Retried: ${aggregate.retried}`,
  `- Final pass: ${aggregate.finalPasses}/${aggregate.total}`,
  `- Retry selected: ${aggregate.retrySelected}`,
  `- Average total: ${aggregate.averageInitialScore} -> ${aggregate.averageFinalScore}`,
  `- Average adherence: ${aggregate.averageInitialAdherence} -> ${aggregate.averageFinalAdherence}`,
  "",
  "| Case | Initial | Retry | Final adherence | Selected | Pass | Residual |",
  "|---|---:|---:|---:|---|---|---|",
  ...cases.map((item) => `| ${item.id} | ${item.initialScore} | ${item.retryScore ?? "n/a"} | ${item.finalAdherence} | ${item.selected} | ${item.finalPassed ? "PASS" : "FAIL"} | ${(item.finalMismatch ?? "").replace(/\|/g, "\\|")} |`)
].join("\n");
writeFileSync(resolve(outputDir, "summary-strict.md"), markdown);
console.log(JSON.stringify(aggregate, null, 2));
