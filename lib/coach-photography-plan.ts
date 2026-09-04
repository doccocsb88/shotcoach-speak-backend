import { z } from "zod";

import {
  buildCoachCorrectionMessage,
  validateCoachPhotographyResult,
  type CoachPhotographyValidationResult
} from "@/lib/coach-photography-validation";
import {
  composeCoachGenerationPrompt,
  composeCoachSafeRenderPrompt,
  composeCoachText2ImagePrompt
} from "@/lib/coach-capture-plan";
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

const capturePlanSchema = z.object({
  schema_version: z.literal("1.0"),
  primary_change: z.string().min(1),
  why: z.string().min(1),
  subject_description: z.string().min(1),
  scene_description: z.string().min(1),
  lighting: z.string().min(1),
  camera: z.object({
    zoom: phoneZoomSchema,
    move: z.string().min(1),
    height: z.string().min(1),
    viewpoint: z.string().min(1)
  }),
  frame: z.object({
    body_crop: z.string().min(1),
    subject_position: z.string().min(1),
    gaze_space: z.string().min(1),
    background_anchor: z.string().min(1),
    edge_cleanup: z.string().min(1)
  }),
  subject_action: z.string().min(1),
  capture_cue: z.string().min(1),
  scene_affordances: z.array(z.string().min(1)).min(1),
  preserve: z.array(z.string().min(1)).min(1),
  avoid: z.array(z.string().min(1)).min(1),
  feasibility_confidence: z.enum(["low", "medium", "high"])
});

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
  capture_plan: capturePlanSchema,
  user_tips: z.array(z.string().min(1)).length(3)
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

export function normalizeCoachPhoneZoom(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  const match = value.toLowerCase().match(/(?:^|\b)([123])\s*x(?:\b|$)/);
  return match ? `${match[1]}x` : value;
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

  const shotPlan =
    record.shot_plan && typeof record.shot_plan === "object"
      ? {
          ...(record.shot_plan as Record<string, unknown>),
          zoom: normalizeCoachPhoneZoom((record.shot_plan as Record<string, unknown>).zoom)
        }
      : record.shot_plan;

  const capturePlan =
    record.capture_plan && typeof record.capture_plan === "object"
      ? {
          ...(record.capture_plan as Record<string, unknown>),
          camera:
            (record.capture_plan as Record<string, unknown>).camera &&
            typeof (record.capture_plan as Record<string, unknown>).camera === "object"
              ? {
                  ...((record.capture_plan as Record<string, unknown>).camera as Record<string, unknown>),
                  zoom: normalizeCoachPhoneZoom(
                    ((record.capture_plan as Record<string, unknown>).camera as Record<string, unknown>).zoom
                  )
                }
              : (record.capture_plan as Record<string, unknown>).camera,
          scene_affordances: coerceStringArray(
            (record.capture_plan as Record<string, unknown>).scene_affordances
          ),
          preserve: coerceStringArray((record.capture_plan as Record<string, unknown>).preserve),
          avoid: coerceStringArray((record.capture_plan as Record<string, unknown>).avoid)
        }
      : record.capture_plan;

  return {
    ...record,
    assessment,
    opportunity,
    shot_plan: shotPlan,
    capture_plan: capturePlan,
    user_tips: coerceStringArray(record.user_tips)
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

Specify photographer movement as a relative action tied to a visible framing target, plus camera height (knee/hip/waist/lower chest/chest/eye level) and camera angle.

---

## PHASE 6 — SUBJECT SCALE

Return current_subject_scale, recommended_subject_scale, and estimated_scale_change. Describe the visible change relatively (for example, "from small to clearly dominant") instead of inventing a percentage.

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

## CAPTURE PLAN

Return one capture_plan that a real user can reproduce with a smartphone.

- Choose exactly one primary_change. All other choices must support it.
- Compare at least two plausible shot concepts internally, then return only the strongest feasible winner.
- Treat composition rules as tools for visual intent, not a checklist.
- Use visible framing targets and relative photographer actions. Prefer "step back until the frame runs from mid-thigh to head" over pseudo-exact claims such as meters, degrees, or percentage scale changes.
- Phone zoom must be exactly one of: 1x, 2x, 3x.
- subject_action must be one concise sequence of observable actions, not a list of anatomy fields.
- scene_affordances must identify usable positions, surfaces, leading structures, clean background directions, blockers, or safe environmental motion that are actually visible.
- Preserve the existing lighting character. Do not invent equipment or light that the user does not have.
- feasibility_confidence must reflect whether the recommendation is physically supported by the visible scene.
- subject_description and scene_description must be standalone descriptions. Do not use "same person", "source image", "uploaded photo", or other source-dependent wording in those two fields.

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
  "capture_plan": {
    "schema_version": "1.0",
    "primary_change": "",
    "why": "",
    "subject_description": "",
    "scene_description": "",
    "lighting": "",
    "camera": { "zoom": "1x|2x|3x", "move": "", "height": "", "viewpoint": "" },
    "frame": { "body_crop": "", "subject_position": "", "gaze_space": "", "background_anchor": "", "edge_cleanup": "" },
    "subject_action": "",
    "capture_cue": "",
    "scene_affordances": [""],
    "preserve": [""],
    "avoid": [""],
    "feasibility_confidence": "low|medium|high"
  },
  "user_tips": ["", "", ""]
}`;

function buildPreferencesPrompt(preferences?: CoachPreferences) {
  if (!preferences || Object.keys(preferences).length === 0) {
    return "No optional user preferences were provided. Use balanced intensity.";
  }

  return [
    `Edit intensity: ${preferences.editIntensity ?? "balanced"}.`,
    preferences.sceneContext
      ? `Intended context: ${preferences.sceneContext.replace(/_/g, " ")}; use only when consistent with visible evidence.`
      : "",
    preferences.gender ? `Gender presentation: ${preferences.gender.replace(/_/g, " ")}.` : "",
    preferences.ageRange ? `Age range: ${preferences.ageRange.replace(/_/g, " ")}.` : "",
    "Preferences may tune pose comfort and change magnitude, but must never override the visible person, scene, safety, or realism."
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSystemPrompt(mode: CoachMode, preferences?: CoachPreferences) {
  return `${SHOTCOACH_SYSTEM_PROMPT_V6}\n\n[Internal] Coaching focus: ${mode}. ${modeFocus[mode]}\n\n[Internal] User preferences:\n${buildPreferencesPrompt(preferences)}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Photography coach timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

async function requestCoachJson(params: {
  dataUrl: string;
  mode: CoachMode;
  preferences?: CoachPreferences;
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
        "Analyze this photo and return the V7.2 JSON with assessment, opportunity, shot_plan, pose, timing, capture_plan, and user_tips. Do not write image-generation prompts; the backend composes them deterministically."
    },
    { type: "image_url", image_url: { url: params.dataUrl } }
  ];

  const response = await withTimeout(
    getOpenAIClient().chat.completions.create({
      model: env.OPENAI_PHOTOGRAPHY_COACH_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(params.mode, params.preferences) },
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

function toCoachResult(
  mode: CoachMode,
  parsed: z.infer<typeof photographyCoachResponseSchema>,
  preferences?: CoachPreferences
): CoachPhotographyCoachResult {
  const core = {
    schema_version: "7.2",
    mode,
    assessment: parsed.assessment,
    opportunity: parsed.opportunity,
    shot_plan: parsed.shot_plan,
    pose: parsed.pose,
    timing: parsed.timing,
    capture_plan: parsed.capture_plan,
    user_tips: parsed.user_tips
  } as const;

  return {
    ...core,
    generation_prompt: composeCoachGenerationPrompt(core, preferences),
    safe_render_prompt: composeCoachSafeRenderPrompt(core, preferences),
    text2image_prompt: composeCoachText2ImagePrompt(core, preferences)
  };
}

export async function runCoachPhotographyCoach(params: {
  image: Buffer;
  mode: CoachMode;
  preferences?: CoachPreferences;
}): Promise<CoachPhotographyCoachResult & { validation: CoachPhotographyValidationResult }> {
  const resizedImage = await resizeForAnalysis(params.image);
  const dataUrl = `data:image/jpeg;base64,${resizedImage.toString("base64")}`;

  let parsed: z.infer<typeof photographyCoachResponseSchema>;
  try {
    parsed = await requestCoachJson({
      dataUrl,
      mode: params.mode,
      preferences: params.preferences
    });
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      throw error;
    }
    parsed = await requestCoachJson({
      dataUrl,
      mode: params.mode,
      preferences: params.preferences,
      correctionMessage:
        `Your previous JSON did not match the required schema. Correct these exact issues:\n${error.issues
          .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
          .join("\n")}\nReturn the complete JSON again. zoom values must be exactly 1x, 2x, or 3x. Array fields must be JSON arrays. Include capture_plan and do not include generated prompt prose.`
    });
  }
  let result = toCoachResult(params.mode, parsed, params.preferences);
  let validation = validateCoachPhotographyResult(result);

  if (shouldRetryValidation(validation)) {
    const correctionMessage = buildCoachCorrectionMessage(validation);
    parsed = await requestCoachJson({
      dataUrl,
      mode: params.mode,
      preferences: params.preferences,
      correctionMessage
    });
    result = toCoachResult(params.mode, parsed, params.preferences);
    validation = validateCoachPhotographyResult(result);
  }

  return { ...result, validation };
}

/** @deprecated Use runCoachPhotographyCoach */
export const runCoachPhotographyPlan = runCoachPhotographyCoach;
