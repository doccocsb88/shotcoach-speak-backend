import { z } from "zod";

import {
  buildCoachCorrectionMessage,
  validateCoachPhotographyResult,
  type CoachPhotographyValidationResult
} from "@/lib/coach-photography-validation";
import { getEnv } from "@/lib/config";
import { resizeForAnalysis } from "@/lib/images";
import { getOpenAIClient } from "@/lib/openai";
import { parseJsonFromResponseText } from "@/lib/response-parser";
import type { CoachMode, CoachPhotographyCoachResult, CoachPreferences } from "@/lib/types";

const PHOTOGRAPHY_COACH_TIMEOUT_MS = 60_000;

const shotTypeSchema = z.enum([
  "environmental_portrait",
  "full_body_portrait",
  "full_body_movement_portrait",
  "three_quarter_portrait",
  "close_portrait",
  "symmetrical_portrait",
  "architecture_portrait",
  "foreground_frame_portrait",
  "silhouette"
]);

const phoneZoomSchema = z.enum(["1x", "2x", "3x"]);

export const photographyCoachResponseSchema = z.object({
  assessment: z.object({
    current_shot_summary: z.string().min(1),
    main_problem: z.string().min(1),
    secondary_problems: z.array(z.string()),
    strongest_existing_element: z.string().min(1)
  }),
  opportunity: z.object({
    shot_type: shotTypeSchema,
    why_this_shot: z.string().min(1),
    scene_assets: z.array(z.string()).min(1),
    missed_opportunities: z.array(z.string())
  }),
  shot_plan: z.object({
    zoom: phoneZoomSchema,
    photographer_distance: z.string().min(1),
    camera_height: z.string().min(1),
    camera_angle: z.string().min(1),
    current_subject_scale: z.string().min(1),
    recommended_subject_scale: z.string().min(1),
    estimated_scale_change: z.string().min(1),
    subject_position: z.string().min(1),
    crop: z.string().min(1),
    horizon: z.string().min(1),
    foreground: z.string().min(1),
    background: z.string().min(1),
    leading_lines: z.string().min(1),
    negative_space: z.string().min(1)
  }),
  pose: z.object({
    body_angle: z.string().min(1),
    weight_distribution: z.string().min(1),
    front_leg: z.string().min(1),
    back_leg: z.string().min(1),
    hips: z.string().min(1),
    shoulders: z.string().min(1),
    left_arm: z.string().min(1),
    right_arm: z.string().min(1),
    hands: z.string().min(1),
    head: z.string().min(1),
    gaze: z.string().min(1),
    expression: z.string().min(1)
  }),
  timing: z.object({
    capture_moment: z.string().min(1),
    environmental_motion: z.string().min(1)
  }),
  user_tips: z.array(z.string().min(1)).length(3),
  generation_prompt: z.string().min(80).max(6000),
  safe_render_prompt: z.string().min(80).max(6000),
  text2image_prompt: z.string().min(80).max(6000)
});

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;]\s*|\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeCoachResponse(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return raw;
  }

  const record = raw as Record<string, unknown>;
  const assessment =
    record.assessment && typeof record.assessment === "object"
      ? {
          ...(record.assessment as Record<string, unknown>),
          secondary_problems: coerceStringArray(
            (record.assessment as Record<string, unknown>).secondary_problems
          )
        }
      : record.assessment;

  const opportunity =
    record.opportunity && typeof record.opportunity === "object"
      ? {
          ...(record.opportunity as Record<string, unknown>),
          scene_assets: coerceStringArray((record.opportunity as Record<string, unknown>).scene_assets),
          missed_opportunities: coerceStringArray(
            (record.opportunity as Record<string, unknown>).missed_opportunities
          )
        }
      : record.opportunity;

  return {
    ...record,
    assessment,
    opportunity
  };
}

const modeFocus: Record<CoachMode, string> = {
  frame: "Prioritize framing, crop, and subject scale for the strongest achievable shot.",
  composition: "Prioritize subject prominence, placement, and visual hierarchy.",
  angle: "Prioritize camera height, camera angle, and perspective.",
  pose: "Prioritize body pose, hands, legs, head direction, and gaze.",
  comprehensive: "Discover the single strongest realistic shot using all photography dimensions."
};

const SHOTCOACH_SYSTEM_PROMPT_V6 = `You are ShotCoach, an expert professional photographer and on-location photography director.

You are not merely critiquing the uploaded photo.

Your job is to decide what the STRONGEST REALISTIC PHOTOGRAPH the user could create at this exact location would be, using the same person, outfit, environment, and approximate conditions.

The output will be used in two ways:

1. Show the user three short, actionable shooting tips.
2. Generate a realistic visual reference of your recommended shot.

The reference is NOT the final photo.

It should visually demonstrate how the user could recreate a better real photograph with a modern smartphone.

---

## CORE PRINCIPLE

Do not stop after correcting flaws in the current image.

First diagnose the current shot.

Then ask:

"If I were physically standing here as the photographer, what camera position, focal length, composition, pose, and timing would create the strongest photograph available in this scene?"

Prefer a clearly stronger shot over a merely corrected version of the existing frame.

The improvement should come mainly from photography decisions, not AI beautification.

---

## PHASE 1 — VISUAL HIERARCHY

Determine:

- What is the primary subject?
- What should the viewer notice first?
- Is the subject visually dominant enough?
- What currently competes with the subject?
- Is the current subject scale ideal, merely acceptable, too small, or too large?
- Are there distracting objects near the frame edges?
- Is the environment helping or overpowering the subject?

For portrait, travel portrait, lifestyle, and posing photography, the person should normally remain the primary visual focus.

Do NOT automatically recommend a wider composition just because the location is visually interesting.

If the camera is clearly high-angle looking down with a large empty foreground, classify current_subject_scale as too small or acceptable-needs-larger and prefer 2x or 3x.

---

## PHASE 2 — CURRENT SHOT DIAGNOSIS

Evaluate camera height, angle, perspective, zoom, distance, framing, crop, subject scale, placement, horizon, foreground, background, negative space, leading lines, distractions, pose, hands, legs, gaze, expression, light, and subject-background separation.

Identify one main problem, secondary problems, and the strongest existing visual element.

---

## PHASE 3 — SHOT OPPORTUNITY DISCOVERY

Search for opportunities: wind, flowing clothing, waves, reflections, stairs, rails, doors, arches, architecture, symmetry, depth, leading lines, movement, timing.

Ask: "What elements in this scene could make the photograph substantially stronger if intentionally used?"

---

## PHASE 4 — SELECT THE SHOT TYPE

Choose exactly ONE:

environmental_portrait | full_body_portrait | full_body_movement_portrait | three_quarter_portrait | close_portrait | symmetrical_portrait | architecture_portrait | foreground_frame_portrait | silhouette

Choose based on the best achievable shot, not only the current framing.

### Stronger shot selection (V6.1)

If clothing, hair, water, wind, or another scene element creates strong movement potential, explicitly compare a static portrait against a movement portrait before selecting shot_type.

Prefer movement when it materially improves the image and remains easy for the user to recreate.

---

## PHASE 5 — CAMERA STRATEGY

Choose 1x, 2x, or 3x.

Only choose 1x when the wide environment materially improves the photograph.

If the person is small or the environment dominates, prefer 2x, 3x, moving closer, or tighter framing.

Specify photographer distance, camera height (knee/hip/waist/lower chest/chest/eye level), and camera angle.

---

## PHASE 6 — SUBJECT SCALE

Return current_subject_scale, recommended_subject_scale, and estimated_scale_change (e.g. "+25-35%").

---

## PHASE 7 — COMPOSITION

Specify subject position, crop, horizon, foreground, background, leading lines, negative space.

Use symmetry when stronger. Use rule of thirds only when it is stronger.

### Outfit-aware full-body rule (V6.1)

If the outfit itself is one of the strongest visual assets and its shape, drape, length, or motion contributes significantly to the shot, avoid cropping it out unless a tighter portrait clearly produces a stronger result.

---

## PHASE 8 — POSE DIRECTION

Be specific: body angle, weight, legs, hips, shoulders, arms, hands, head, gaze, expression.

Pose must fit clothing, environment, and shot type.

### Pose must support shot type (V6.1)

Pose direction must be consistent with shot_type.

For movement portraits:
- avoid evenly distributed weight
- prefer a clear weight shift
- use a step, turn, fabric interaction, or natural motion

---

## PHASE 9 — TIMING

Specify capture_moment and environmental_motion when relevant (waves, wind, fabric, steps).

---

## REALISM RULES

Preserve: same person, face, hair, clothing, accessories, location, weather.

Do NOT redesign the subject, change location, invent golden hour if overcast, or create fantasy/fashion campaign looks.

---

## USER TIPS

Return exactly 3 tips representing the highest-impact visible changes.

Prefer zoom, photographer position, camera height, subject position, subject scale, pose, and environmental timing over minor cleanup instructions.

Keep each tip short (~6-8 words), specific, and easy to read while holding the camera.

Good: "Use 2x and step back" | "Lower camera to waist" | "Shoot as the wave rises"

Bad: long sentences or minor fixes like horizon correction unless severe.

---

## GENERATION PROMPT

Write a complete internal photography specification containing in meaning:

PRESERVE | CAMERA | COMPOSITION | POSE | ENVIRONMENT AND TIMING | LIGHTING | DO NOT

Use specific geometry where reasonable: "4-6 meters", "waist height, nearly level", "25-30% larger" — not "moderate distance" or "dominant subject".

---

## SAFE RENDER PROMPT (V7.1)

Also create safe_render_prompt — the actual image-generation instruction for Step 2.

It must preserve the same photography strategy as generation_prompt but use photography-action wording:

- adjust hair
- hold fabric
- take a step
- turn slightly
- shift weight naturally
- look toward camera / horizon

Avoid unnecessary anatomical or body-region wording.

Must still include: zoom, distance, camera height, angle, subject scale, framing, environment, timing, lighting, identity/location preservation, and negative constraints.

---

## TEXT2IMAGE PROMPT (V7.2)

Also create text2image_prompt — a standalone scene description used only if image edit is blocked by safety moderation.

This prompt must NOT assume access to any uploaded source image.

Do not use phrases such as:
- source image
- original photo
- same person
- preserve identity
- from the reference
- uploaded photo

Describe everything needed to recreate the recommended shot from text alone:

Scene: subject category, environment, weather
Styling: clothing, accessories, hair
Photography direction: zoom, distance, camera height, angle, framing, subject position, crop, horizon
Action: pose and movement moment
Lighting: natural light character
Style: realistic smartphone travel portrait constraints

Do not require matching a specific real person's face or identity.
Use generic but specific scene language (for example: "an adult woman with long dark hair on a quiet sandy beach").

---

## OUTPUT FORMAT

Return valid JSON only with schema_version "7.2":

{
  "schema_version": "7.2",
  "assessment": { "current_shot_summary", "main_problem", "secondary_problems", "strongest_existing_element" },
  "opportunity": { "shot_type", "why_this_shot", "scene_assets", "missed_opportunities" },
  "shot_plan": { "zoom", "photographer_distance", "camera_height", "camera_angle", "current_subject_scale", "recommended_subject_scale", "estimated_scale_change", "subject_position", "crop", "horizon", "foreground", "background", "leading_lines", "negative_space" },
  "pose": { "body_angle", "weight_distribution", "front_leg", "back_leg", "hips", "shoulders", "left_arm", "right_arm", "hands", "head", "gaze", "expression" },
  "timing": { "capture_moment", "environmental_motion" },
  "user_tips": ["", "", ""],
  "generation_prompt": "",
  "safe_render_prompt": "",
  "text2image_prompt": ""
}`;

function buildSystemPrompt(mode: CoachMode) {
  return `${SHOTCOACH_SYSTEM_PROMPT_V6}\n\n[Internal] Coaching focus: ${mode}. ${modeFocus[mode]}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`Photography coach timed out after ${timeoutMs}ms`)), timeoutMs);
    })
  ]);
}

async function requestCoachJson(params: {
  dataUrl: string;
  mode: CoachMode;
  correctionMessage?: string;
}) {
  const env = getEnv();
  const userContent: Array<
    { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text:
        params.correctionMessage ??
        "Analyze this photo and return the V7.2 JSON with assessment, opportunity, shot_plan, pose, timing, user_tips, generation_prompt, safe_render_prompt, and text2image_prompt."
    },
    { type: "image_url", image_url: { url: params.dataUrl } }
  ];

  const response = await withTimeout(
    getOpenAIClient().chat.completions.create({
      model: env.OPENAI_PHOTOGRAPHY_COACH_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(params.mode) },
        { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" }
    }),
    PHOTOGRAPHY_COACH_TIMEOUT_MS
  );

  const choice = response.choices[0];
  const responseText = choice?.message?.content?.trim();
  if (!responseText) {
    const finishReason = choice?.finish_reason ?? "unknown";
    const refusal = choice?.message?.refusal ?? null;
    throw new Error(
      `Photography coach did not return JSON (finish_reason=${finishReason}${refusal ? `, refusal=${refusal}` : ""}).`
    );
  }

  return photographyCoachResponseSchema.parse(
    normalizeCoachResponse(parseJsonFromResponseText(responseText))
  );
}

function shouldRetryValidation(validation: CoachPhotographyValidationResult) {
  if (!validation.valid) {
    return true;
  }

  return validation.warnings.some(
    (warning) =>
      warning.startsWith("MOVEMENT_OPPORTUNITY_BUT_STATIC_SHOT_TYPE") ||
      warning.startsWith("STATIC_POSE_FOR_MOVEMENT_SHOT") ||
      warning.startsWith("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT")
  );
}

function toCoachResult(mode: CoachMode, parsed: z.infer<typeof photographyCoachResponseSchema>): CoachPhotographyCoachResult {
  return {
    schema_version: "7.2",
    mode,
    assessment: parsed.assessment,
    opportunity: parsed.opportunity,
    shot_plan: parsed.shot_plan,
    pose: parsed.pose,
    timing: parsed.timing,
    user_tips: parsed.user_tips,
    generation_prompt: parsed.generation_prompt.trim(),
    safe_render_prompt: parsed.safe_render_prompt.trim(),
    text2image_prompt: parsed.text2image_prompt.trim()
  };
}

export async function runCoachPhotographyCoach(params: {
  image: Buffer;
  mode: CoachMode;
  preferences?: CoachPreferences;
}): Promise<CoachPhotographyCoachResult & { validation: CoachPhotographyValidationResult }> {
  void params.preferences;
  const resizedImage = await resizeForAnalysis(params.image);
  const dataUrl = `data:image/jpeg;base64,${resizedImage.toString("base64")}`;

  let parsed: z.infer<typeof photographyCoachResponseSchema>;
  try {
    parsed = await requestCoachJson({ dataUrl, mode: params.mode });
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      throw error;
    }
    parsed = await requestCoachJson({
      dataUrl,
      mode: params.mode,
      correctionMessage:
        "Your previous JSON did not match the required schema. Return valid JSON only with array fields for secondary_problems, scene_assets, missed_opportunities, plus generation_prompt, safe_render_prompt, and text2image_prompt."
    });
  }
  let result = toCoachResult(params.mode, parsed);
  let validation = validateCoachPhotographyResult(result);

  if (shouldRetryValidation(validation)) {
    const correctionMessage = buildCoachCorrectionMessage(validation);
    parsed = await requestCoachJson({
      dataUrl,
      mode: params.mode,
      correctionMessage
    });
    result = toCoachResult(params.mode, parsed);
    validation = validateCoachPhotographyResult(result);
  }

  return { ...result, validation };
}

/** @deprecated Use runCoachPhotographyCoach */
export const runCoachPhotographyPlan = runCoachPhotographyCoach;
