import { z } from "zod";

import { getEnv } from "@/lib/config";
import { resizeForAnalysis } from "@/lib/images";
import { getOpenAIClient } from "@/lib/openai";
import { parseJsonFromResponseText } from "@/lib/response-parser";
import type { CoachFrameStrategy, CoachLightVisionResult, CoachMode, CoachPoseChangeMagnitude, CoachPreferences, CoachSubjectVisibility } from "@/lib/types";

const lightVisionResponseSchema = z.object({
  image_generation_prompt: z.string().min(40).max(3500)
});

const LIGHT_VISION_TIMEOUT_MS = 45_000;

const modeActionFocus: Record<CoachMode, string> = {
  frame: "Describe the ideal crop, subject scale, and foreground/background balance using framing terminology.",
  composition: "Describe ideal subject placement, rule of thirds, visual weight, and leading lines.",
  angle: "Describe the ideal camera angle and lens choice (e.g. low angle wide shot, eye-level, telephoto compression).",
  pose: "Describe the ideal model pose and action — graceful, relaxed, directed gaze — appropriate for retake coaching.",
  comprehensive: "Combine the single best composition, framing, angle, and pose improvements into one ideal reference shot."
};

function buildLightVisionActionPrompt(mode: CoachMode, preferences?: CoachPreferences) {
  const sceneContext = preferences?.sceneContext
    ? `[Internal] Scene context (only if visible in photo): ${preferences.sceneContext.replace(/_/g, " ")}.`
    : "";

  return [
    'You are a professional "Prompt Engineer" and Photography Director for AI image generation models. Your task is to receive a subpar photograph and write the most optimal Action Prompt in English to ask AI (gpt-image-2) to generate a flawless "Reference Photo". This reference photo will be shown to a real photographer and model so they can physically retake the shot.',
    "",
    "STRICTLY FOLLOW these rules:",
    "1. DO NOT describe the original image in detail. DO NOT score it. ONLY focus on the specific photographic actions needed to improve it.",
    '2. OUTPUT: Only return a JSON: {"image_generation_prompt": "..."}',
    "3. DO NOT copy/paste these instructions into image_generation_prompt — write a natural, complete generation prompt tailored to THIS photo.",
    "",
    "MANDATORY STRATEGY:",
    "- **CRUCIAL RULE FOR REAL-LIFE RETAKE:** Strictly maintain the exact lighting conditions, time of day, and weather (cloudy, overcast, or natural midday sun) present in the source image. Do NOT invent artificial Golden Hour, sunset, or dramatic sun rays if the source is overcast.",
    '- The generated prompt MUST clearly specify **Camera Angle & Position** (e.g., "Eye-level shot", "Low angle shot aiming up at the subject from waist height", "Wide-angle lens to capture more foreground", "Moving closer to the subject").',
    '- The generated prompt MUST clearly specify **Pose & Action** (e.g., "Sitting with legs crossed and extended to the side", "Leaning slightly back on hands", "Hands resting naturally on knees", "Head turned slightly to look directly into the lens", "Smiling naturally").',
    "- Use precise photography terminology to describe the IDEAL OUTCOME. Focus on composition, framing, and the physical instructions needed for a human to replicate the shot.",
    "- The prompt must state that the foreground must be completely clean (no hats, trash, or weeds).",
    "- Do not request to \"edit\" the original image; request to generate a beautiful, idealized version of the scene using the exact lighting of the input photo.",
    "",
    `[Internal — do not include in output] Coaching mode: ${mode}. ${modeActionFocus[mode]}`,
    sceneContext,
    "",
    "Write image_generation_prompt for THIS specific photo. Keep the same recognizable subject, outfit, and location. Match the source lighting exactly — never upgrade to golden hour unless the source already has warm directional sun.",
    "End with: photorealistic, no watermark, no extra elements."
  ]
    .filter(Boolean)
    .join("\n");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Light vision timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

export async function runCoachLightVision(params: {
  image: Buffer;
  mode: CoachMode;
  preferences?: CoachPreferences;
}): Promise<CoachLightVisionResult> {
  const env = getEnv();
  const resizedImage = await resizeForAnalysis(params.image);
  const dataUrl = `data:image/jpeg;base64,${resizedImage.toString("base64")}`;
  const visionPrompt = buildLightVisionActionPrompt(params.mode, params.preferences);

  const response = await withTimeout(
    getOpenAIClient().chat.completions.create({
      model: env.OPENAI_LIGHT_VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: visionPrompt },
            { type: "image_url", image_url: { url: dataUrl } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    }),
    LIGHT_VISION_TIMEOUT_MS
  );

  const choice = response.choices[0];
  const responseText = choice?.message?.content?.trim();
  if (!responseText) {
    const finishReason = choice?.finish_reason ?? "unknown";
    const refusal = choice?.message?.refusal ?? null;
    throw new Error(
      `Light vision did not return a JSON response (finish_reason=${finishReason}${refusal ? `, refusal=${refusal}` : ""}).`
    );
  }

  const parsed = lightVisionResponseSchema.parse(
    parseJsonFromResponseText<{ image_generation_prompt: string }>(responseText)
  );

  return {
    schema_version: "2.2",
    mode: params.mode,
    image_generation_prompt: parsed.image_generation_prompt.trim()
  };
}

/** @deprecated v2.0 schema — use lightVisionResponseSchema shape instead. */
export const coachLightVisionResultSchema = lightVisionResponseSchema;

/** Used by buildDirectCoachPrompt fallback path. */
export function describeFrameStrategy(strategy: CoachFrameStrategy) {
  const descriptions: Record<CoachFrameStrategy, string> = {
    retain: "Keep the current crop because the framing is already strong.",
    tighten:
      "Tighten the crop to reduce dead space while preserving all important facial features, outfit details, and scene anchors.",
    offset_crop:
      "Use an asymmetric crop to add intentional negative space on the gaze side or to align the subject with a stronger compositional anchor.",
    add_breathing_room:
      "Loosen the crop slightly to add breathing room around the head, shoulders, or key scene geometry without changing pose or camera angle."
  };

  return descriptions[strategy];
}

/** Used by buildDirectCoachPrompt fallback path. */
export function describePoseChangeMagnitude(magnitude: CoachPoseChangeMagnitude, visibility: CoachSubjectVisibility) {
  if (magnitude === "complete") {
    return "The new pose must be clearly different across torso orientation, limb placement, weight distribution, and stance.";
  }

  if (visibility === "near_full_body") {
    return "Make a moderate but clearly visible pose change focused on the torso, arms, and head; keep visible legs and cropped boot portions unchanged unless the selected pose change explicitly mentions them.";
  }

  if (visibility === "head_only") {
    return "Change the visible upper-body pose as much as the frame allows through shoulder angle, neck line, collarbone orientation, and head direction without inventing unseen arms or legs.";
  }

  return "Make a moderate but clearly visible pose change using every body region that is currently visible.";
}
