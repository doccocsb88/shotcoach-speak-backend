import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

interface Fixture {
  id: string;
  file: string;
  target_defects: string[];
}

interface CaseSummary {
  id: string;
  targetDefects: string[];
  success: boolean;
  shotType: string | null;
  zoom: string | null;
  primaryChange: string | null;
  initialScore: number | null;
  initialPassed: boolean | null;
  finalScore: number | null;
  finalPassed: boolean | null;
  retryCount: number;
  coachLatencyMs: number | null;
  imageEditLatencyMs: number | null;
  validationErrors: string[];
  validationWarnings: string[];
  visualQcError: string | null;
  imageEditError: string | null;
  largestMismatch: string | null;
  outputPath: string;
  reportPath: string;
}

const workspace = resolve(import.meta.dirname, "..");
const fixtureDir = resolve(workspace, process.argv[2] ?? "qc-fixtures/synthetic-bad-10");
const concurrency = Math.max(1, Math.min(3, Number(process.argv[3] ?? 2)));
const packName = basename(fixtureDir);
const manifestPath = resolve(fixtureDir, "manifest.json");
const singleOutputDir = resolve(workspace, "qc-output/live-single");
const batchOutputDir = resolve(workspace, `qc-output/${packName}`);

if (!existsSync(manifestPath)) {
  throw new Error(`Fixture manifest not found: ${manifestPath}`);
}

mkdirSync(batchOutputDir, { recursive: true });
const fixtures = JSON.parse(readFileSync(manifestPath, "utf8")) as Fixture[];

function runCase(fixture: Fixture) {
  return new Promise<CaseSummary>((resolveCase) => {
    const imagePath = resolve(fixtureDir, fixture.file);
    const label = `${packName}-${fixture.id}`;
    const prefix = `${label}__comprehensive`;
    const reportPath = resolve(singleOutputDir, `${prefix}__report.json`);
    const outputPath = resolve(singleOutputDir, `${prefix}__output.png`);
    const child = spawn(
      process.execPath,
      ["--import", "tsx", resolve(workspace, "scripts/qc-coach-single.ts"), imagePath, "comprehensive", label],
      {
        cwd: workspace,
        env: {
          ...process.env,
          OPENAI_COACH_VISUAL_QC_ENABLED: "true",
          OPENAI_COACH_VISUAL_QC_MAX_RETRIES: "1"
        },
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      console.log(`[${fixture.id}] exit=${code}\n${output.trim()}`);
      if (!existsSync(reportPath)) {
        resolveCase({
          id: fixture.id,
          targetDefects: fixture.target_defects,
          success: false,
          shotType: null,
          zoom: null,
          primaryChange: null,
          initialScore: null,
          initialPassed: null,
          finalScore: null,
          finalPassed: null,
          retryCount: 0,
          coachLatencyMs: null,
          imageEditLatencyMs: null,
          validationErrors: [],
          validationWarnings: [],
          visualQcError: null,
          imageEditError: `Process exited ${code}; report was not created`,
          largestMismatch: null,
          outputPath,
          reportPath
        });
        return;
      }

      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      resolveCase({
        id: fixture.id,
        targetDefects: fixture.target_defects,
        success: code === 0 && !report.imageEditError && existsSync(outputPath),
        shotType: report.shotType ?? null,
        zoom: report.coachResult?.shot_plan?.zoom ?? null,
        primaryChange: report.coachResult?.capture_plan?.primary_change ?? null,
        initialScore: report.visualQcInitial?.total_score ?? null,
        initialPassed: report.visualQcInitial?.passed ?? null,
        finalScore: report.visualQcFinal?.total_score ?? null,
        finalPassed: report.visualQcFinal?.passed ?? null,
        retryCount: report.visualQcRetryCount ?? 0,
        coachLatencyMs: report.coachLatencyMs ?? null,
        imageEditLatencyMs: report.imageEditLatencyMs ?? null,
        validationErrors: report.validation?.errors ?? [],
        validationWarnings: report.validation?.warnings ?? [],
        visualQcError: report.visualQcError ?? null,
        imageEditError: report.imageEditError ?? null,
        largestMismatch: report.visualQcFinal?.largest_mismatch ?? null,
        outputPath,
        reportPath
      });
    });
  });
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}

function average(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => value !== null);
  return numbers.length > 0 ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : null;
}

const startedAt = Date.now();
const cases = await mapWithConcurrency(fixtures, concurrency, runCase);
const aggregate = {
  total: cases.length,
  successfulRenders: cases.filter((item) => item.success).length,
  initialPasses: cases.filter((item) => item.initialPassed === true).length,
  finalPasses: cases.filter((item) => item.finalPassed === true).length,
  retries: cases.reduce((sum, item) => sum + item.retryCount, 0),
  validationErrorCases: cases.filter((item) => item.validationErrors.length > 0).length,
  visualQcErrorCases: cases.filter((item) => item.visualQcError).length,
  averageInitialScore: average(cases.map((item) => item.initialScore)),
  averageFinalScore: average(cases.map((item) => item.finalScore)),
  averageCoachLatencyMs: average(cases.map((item) => item.coachLatencyMs)),
  averageImageEditLatencyMs: average(cases.map((item) => item.imageEditLatencyMs)),
  wallClockMs: Date.now() - startedAt,
  concurrency
};

const summary = { generatedAt: new Date().toISOString(), aggregate, cases };
writeFileSync(resolve(batchOutputDir, "summary.json"), JSON.stringify(summary, null, 2));

const markdown = [
  "# ShotCoach synthetic bad-example QC",
  "",
  `- Cases: ${aggregate.total}`,
  `- Successful renders: ${aggregate.successfulRenders}/${aggregate.total}`,
  `- Initial pass: ${aggregate.initialPasses}/${aggregate.total}`,
  `- Final pass: ${aggregate.finalPasses}/${aggregate.total}`,
  `- Retries: ${aggregate.retries}`,
  `- Average score: ${aggregate.averageInitialScore ?? "n/a"} -> ${aggregate.averageFinalScore ?? "n/a"}`,
  `- Average coach latency: ${aggregate.averageCoachLatencyMs ?? "n/a"} ms`,
  `- Average render/QC latency: ${aggregate.averageImageEditLatencyMs ?? "n/a"} ms`,
  "",
  "| Case | Shot | Zoom | Initial | Final | Retry | Status | Largest residual mismatch |",
  "|---|---|---:|---:|---:|---:|---|---|",
  ...cases.map((item) =>
    `| ${item.id} | ${item.shotType ?? "n/a"} | ${item.zoom ?? "n/a"} | ${item.initialScore ?? "n/a"} | ${item.finalScore ?? "n/a"} | ${item.retryCount} | ${item.finalPassed ? "PASS" : "FAIL"} | ${(item.largestMismatch ?? "").replace(/\|/g, "\\|")} |`
  )
].join("\n");
writeFileSync(resolve(batchOutputDir, "summary.md"), markdown);

console.log(JSON.stringify(aggregate, null, 2));
if (aggregate.successfulRenders !== aggregate.total) {
  process.exitCode = 1;
}
