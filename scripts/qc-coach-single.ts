import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import OpenAI from "openai";

import { runCoachReferenceFlow } from "../lib/coach-reference-flow";
import { runCoachPhotographyCoach } from "../lib/coach-photography-plan";
import { getEnv, isGptImageModel } from "../lib/config";
import { resolveCoachEditPrompt } from "../lib/prompt-mapping";
import type { CoachMode } from "../lib/types";

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

async function main() {
  const imageArg = process.argv[2];
  const mode = (process.argv[3] ?? "composition") as CoachMode;
  const label = process.argv[4] ?? basename(imageArg, ".jpg");

  if (!imageArg) {
    console.error("Usage: tsx scripts/qc-coach-single.ts <image-path> [mode] [label]");
    process.exit(1);
  }

  loadEnvFile(resolve(import.meta.dirname, "../.env"));
  process.env.OPENAI_COACH_VISUAL_QC_ENABLED ??= "true";
  const env = getEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const imagePath = resolve(process.cwd(), imageArg);
  const imageBytes = readFileSync(imagePath);
  const mimeType = imagePath.endsWith(".png") ? "image/png" : "image/jpeg";
  const sourceExt = mimeType === "image/png" ? "png" : "jpg";
  const outputDir = resolve(import.meta.dirname, "../qc-output/live-single");
  mkdirSync(outputDir, { recursive: true });

  const prefix = `${label}__${mode}`;
  writeFileSync(join(outputDir, `${prefix}__source.${sourceExt}`), imageBytes);

  console.log("step 1 photography coach", mode, env.OPENAI_PHOTOGRAPHY_COACH_MODEL);
  const coachStartedAt = Date.now();
  const coachResult = await runCoachPhotographyCoach({ image: imageBytes, mode });
  const coachLatencyMs = Date.now() - coachStartedAt;
  const { validation, ...coachPayload } = coachResult;
  writeFileSync(join(outputDir, `${prefix}__coach-result.json`), JSON.stringify(coachPayload, null, 2));
  writeFileSync(join(outputDir, `${prefix}__validation.json`), JSON.stringify(validation, null, 2));
  writeFileSync(join(outputDir, `${prefix}__user-tips.json`), JSON.stringify(coachPayload.user_tips, null, 2));
  writeFileSync(join(outputDir, `${prefix}__step1-generation-prompt.txt`), coachPayload.generation_prompt);
  writeFileSync(join(outputDir, `${prefix}__safe-render-prompt.txt`), coachPayload.safe_render_prompt);
  writeFileSync(join(outputDir, `${prefix}__text2image-prompt.txt`), coachPayload.text2image_prompt);

  const prompt = resolveCoachEditPrompt(mode, undefined, coachPayload);
  writeFileSync(join(outputDir, `${prefix}__reference-prompt.txt`), prompt);
  writeFileSync(join(outputDir, `${prefix}__prompt.txt`), prompt);

  console.log("step 2 reference image", env.OPENAI_IMAGE_MODEL);
  const imageFile = new File([imageBytes], basename(imagePath), { type: mimeType });

  const editStartedAt = Date.now();
  let imageEditLatencyMs = 0;
  let imageEditError: string | null = null;
  let outputPath: string | null = null;
  let renderPromptType = "safe_render_prompt";
  let renderMode: "image_edit" | "text_to_image" = "image_edit";
  let fallbackReason: string | null = null;
  let moderationRetryCount = 0;
  let promptUsed = prompt;
  let initialPromptUsed = prompt;
  let visualQcInitial = null;
  let visualQcFinal = null;
  let visualQcRetryCount = 0;
  let visualQcError: string | null = null;

  try {
    const renderResult = await runCoachReferenceFlow({
      client,
      sourceImage: imageBytes,
      sourceMimeType: mimeType,
      imageFile,
      coachResult: coachPayload,
      model: env.OPENAI_IMAGE_MODEL,
      size: env.OPENAI_IMAGE_SIZE,
      quality: "medium",
      isGptImage: isGptImageModel(env.OPENAI_IMAGE_MODEL)
    });
    imageEditLatencyMs = Date.now() - editStartedAt;
    promptUsed = renderResult.promptUsed;
    renderPromptType = renderResult.renderPromptType;
    renderMode = renderResult.renderMode;
    fallbackReason = renderResult.fallbackReason;
    moderationRetryCount = renderResult.moderationRetryCount;
    initialPromptUsed = renderResult.initialPromptUsed;
    visualQcInitial = renderResult.visualQcInitial;
    visualQcFinal = renderResult.visualQcFinal;
    visualQcRetryCount = renderResult.visualQcRetryCount;
    visualQcError = renderResult.visualQcError;

    const generatedImageBase64 = renderResult.generatedImageBase64;
    if (!generatedImageBase64) {
      throw new Error("No image returned from images.edit");
    }

    outputPath = join(outputDir, `${prefix}__output.png`);
    writeFileSync(outputPath, Buffer.from(generatedImageBase64, "base64"));
  } catch (error) {
    imageEditLatencyMs = Date.now() - editStartedAt;
    imageEditError = error instanceof Error ? error.message : String(error);
    console.warn("step 2 failed:", imageEditError);
  }

  writeFileSync(join(outputDir, `${prefix}__reference-prompt.txt`), promptUsed);
  writeFileSync(join(outputDir, `${prefix}__prompt.txt`), promptUsed);
  if (visualQcInitial) {
    writeFileSync(join(outputDir, `${prefix}__visual-qc-initial.json`), JSON.stringify(visualQcInitial, null, 2));
  }
  if (visualQcFinal) {
    writeFileSync(join(outputDir, `${prefix}__visual-qc-final.json`), JSON.stringify(visualQcFinal, null, 2));
  }

  writeFileSync(
    join(outputDir, `${prefix}__report.json`),
    JSON.stringify(
      {
        mode,
        coachLatencyMs,
        imageEditLatencyMs,
        imageEditError,
        renderPromptType,
        renderMode,
        fallbackReason,
        moderationRetryCount,
        initialPromptUsed,
        visualQcInitial,
        visualQcFinal,
        visualQcRetryCount,
        visualQcError,
        promptUsed,
        coachResult: coachPayload,
        validation,
        shotType: coachPayload.opportunity.shot_type,
        userTips: coachPayload.user_tips,
        assessment: coachPayload.assessment,
        coachModel: env.OPENAI_PHOTOGRAPHY_COACH_MODEL,
        imageModel: env.OPENAI_IMAGE_MODEL
      },
      null,
      2
    )
  );

  if (outputPath) {
    console.log("saved", outputPath);
  }
  console.log("shot_type", coachPayload.opportunity.shot_type, "zoom", coachPayload.shot_plan.zoom);
  console.log("user_tips", coachPayload.user_tips.join(" | "));
  if (validation.errors.length > 0) {
    console.warn("validation_errors", validation.errors.join(" | "));
  }
  if (validation.warnings.length > 0) {
    console.warn("validation_warnings", validation.warnings.join(" | "));
  }
  console.log("coachMs", coachLatencyMs, "editMs", imageEditLatencyMs);
  if (visualQcFinal) {
    console.log(
      "visualQc",
      visualQcFinal.total_score,
      visualQcFinal.passed ? "passed" : "failed",
      "retries",
      visualQcRetryCount
    );
  }
  if (visualQcError) {
    console.warn("visual_qc_error", visualQcError);
  }

  if (imageEditError) {
    process.exit(1);
  }
}

void main();
