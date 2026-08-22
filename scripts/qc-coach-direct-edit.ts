import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import OpenAI from "openai";

import { getEnv, isGptImageModel } from "../lib/config";
import { buildDirectCoachPrompt, getImageEditQualityForTool } from "../lib/prompt-mapping";
import type { CoachMode } from "../lib/types";

const COACH_MODES: CoachMode[] = ["frame", "composition", "angle", "pose"];

const TEST_IMAGES = [
  {
    id: "A-window-portrait",
    path: "../../mobile/assets/pose-collection/raw/009-window-light-soft-smile.jpg"
  },
  {
    id: "B-street-laugh",
    path: "../../mobile/assets/pose-collection/raw/002-crosswalk-pause.jpg"
  },
  {
    id: "C-floral-portrait",
    path: "../../mobile/assets/pose-collection/raw/010-mirror-selfie-minimal.jpg"
  },
  {
    id: "D-lakeside-profile",
    path: "../../mobile/assets/pose-collection/raw/016-rooftop-skyline-back.jpg"
  }
] as const;

function loadEnvFile(envPath: string) {
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureApiKey() {
  const backendEnv = resolve(import.meta.dirname, "../.env");
  const repoEnv = resolve(import.meta.dirname, "../../.env");
  loadEnvFile(backendEnv);
  loadEnvFile(repoEnv);

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not found.");
    console.error("Create backend/.env from backend/.env.example and set OPENAI_API_KEY=sk-...");
    process.exit(1);
  }
}

async function runDirectEdit(
  client: OpenAI,
  imagePath: string,
  mode: CoachMode
) {
  const env = getEnv();
  const prompt = buildDirectCoachPrompt(mode);
  const imageBytes = readFileSync(imagePath);
  const imageFile = new File([imageBytes], basename(imagePath), {
    type: "image/jpeg"
  });

  const imageEditParams = {
    model: env.OPENAI_IMAGE_MODEL,
    image: imageFile,
    prompt,
    size: env.OPENAI_IMAGE_SIZE,
    quality: getImageEditQualityForTool("ai_coach")
  } as const;

  const startedAt = Date.now();
  const result = await client.images.edit(
    isGptImageModel(env.OPENAI_IMAGE_MODEL)
      ? imageEditParams
      : {
          ...imageEditParams,
          response_format: "b64_json"
        }
  );
  const durationMs = Date.now() - startedAt;
  const generatedImageBase64 = result.data?.[0]?.b64_json ?? null;

  return {
    prompt,
    durationMs,
    generatedImageBase64,
    model: env.OPENAI_IMAGE_MODEL,
    size: env.OPENAI_IMAGE_SIZE
  };
}

async function main() {
  ensureApiKey();
  const env = getEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const outputDir = resolve(
    import.meta.dirname,
    "../qc-output/coach-direct-edit",
    new Date().toISOString().replace(/[:.]/g, "-")
  );
  mkdirSync(outputDir, { recursive: true });

  const report: Array<Record<string, unknown>> = [];

  console.log(`QC ShotCoach direct-edit → ${outputDir}`);
  console.log(`Modes: ${COACH_MODES.join(", ")}`);
  console.log(`Images: ${TEST_IMAGES.length}`);

  for (const image of TEST_IMAGES) {
    const imagePath = resolve(import.meta.dirname, image.path);
    if (!existsSync(imagePath)) {
      throw new Error(`Missing test image: ${imagePath}`);
    }

    writeFileSync(
      join(outputDir, `${image.id}__source.jpg`),
      readFileSync(imagePath)
    );

    for (const mode of COACH_MODES) {
      const label = `${image.id}__${mode}`;
      process.stdout.write(`→ ${label} ... `);

      try {
        const result = await runDirectEdit(client, imagePath, mode);
        writeFileSync(join(outputDir, `${label}__prompt.txt`), result.prompt);

        if (!result.generatedImageBase64) {
          console.log("no image returned");
          report.push({ image: image.id, mode, status: "empty_response", durationMs: result.durationMs });
          continue;
        }

        writeFileSync(
          join(outputDir, `${label}__output.png`),
          Buffer.from(result.generatedImageBase64, "base64")
        );
        console.log(`ok (${result.durationMs}ms)`);
        report.push({
          image: image.id,
          mode,
          status: "ok",
          durationMs: result.durationMs,
          promptLength: result.prompt.length,
          outputFile: `${label}__output.png`
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`fail: ${message}`);
        report.push({ image: image.id, mode, status: "error", error: message });
      }
    }
  }

  writeFileSync(join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`\nDone. Report: ${join(outputDir, "report.json")}`);
}

void main();
