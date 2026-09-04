import type { CoachPhotographyCoachResult } from "@/lib/types";

export interface CoachPhotographyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const MOVEMENT_SIGNALS = [
  "walk",
  "step",
  "wind",
  "wave",
  "fabric",
  "hair",
  "motion",
  "movement",
  "flowing"
];

const LOW_IMPACT_TIP_TERMS = ["horizon", "straighten", "level horizon", "tilt"];

const TEXT2IMAGE_SOURCE_DEPENDENT_TERMS = [
  "source image",
  "original photo",
  "same person",
  "preserve identity",
  "from the reference",
  "uploaded photo",
  "uploaded image",
  "reference image",
  "match the face",
  "recognizable person",
  "same face",
  "same woman",
  "same man"
];

const TEXT2IMAGE_SUBJECT_TERMS = ["woman", "man", "person", "subject", "adult"];
const TEXT2IMAGE_ENVIRONMENT_TERMS = [
  "beach",
  "street",
  "room",
  "garden",
  "shore",
  "ocean",
  "city",
  "park",
  "temple",
  "cafe",
  "interior",
  "outdoor",
  "landscape",
  "background",
  "location",
  "scene"
];
const TEXT2IMAGE_LIGHTING_TERMS = ["light", "lighting", "daylight", "sun", "overcast", "shade", "golden"];
const TEXT2IMAGE_ACTION_TERMS = [
  "standing",
  "walking",
  "step",
  "pose",
  "moment",
  "posture",
  "turn",
  "look",
  "gaze"
];

function includesAny(haystack: string, needles: string[]) {
  const normalized = haystack.toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function isMeaningful(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 && !["none", "n/a", "not applicable", "no timing needed"].includes(trimmed);
}

function hasMovementOpportunity(result: CoachPhotographyCoachResult) {
  const haystack = [
    result.timing.capture_moment,
    result.timing.environmental_motion,
    ...result.opportunity.scene_assets,
    ...result.opportunity.missed_opportunities,
    result.generation_prompt,
    result.pose.front_leg,
    result.pose.hands
  ]
    .join(" ")
    .toLowerCase();

  return MOVEMENT_SIGNALS.some((signal) => haystack.includes(signal));
}

export function validateCoachPhotographyResult(result: CoachPhotographyCoachResult): CoachPhotographyValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const generationPrompt = result.generation_prompt.toLowerCase();
  const safePrompt = result.safe_render_prompt.toLowerCase();
  const text2imagePrompt = result.text2image_prompt.toLowerCase();
  const { shot_plan, opportunity, timing, capture_plan } = result;

  if (!shot_plan.zoom) {
    errors.push("HARD_VALIDATION: shot_plan.zoom missing");
  }

  if (!shot_plan.camera_height?.trim()) {
    errors.push("HARD_VALIDATION: camera_height missing");
  }

  if (!capture_plan.primary_change?.trim()) {
    errors.push("HARD_VALIDATION: capture_plan.primary_change missing");
  }

  if (capture_plan.camera.zoom !== shot_plan.zoom) {
    errors.push("HARD_VALIDATION: capture_plan camera zoom contradicts shot_plan.zoom");
  }

  if (!result.generation_prompt?.trim()) {
    errors.push("HARD_VALIDATION: generation_prompt missing");
  }

  if (!result.safe_render_prompt?.trim()) {
    errors.push("HARD_VALIDATION: safe_render_prompt missing");
  }

  if (!result.text2image_prompt?.trim()) {
    errors.push("HARD_VALIDATION: text2image_prompt missing");
  }

  if (TEXT2IMAGE_SOURCE_DEPENDENT_TERMS.some((term) => text2imagePrompt.includes(term))) {
    errors.push("HARD_VALIDATION: text2image_prompt must not assume access to source image");
  }

  if (result.text2image_prompt?.trim()) {
    if (!includesAny(text2imagePrompt, TEXT2IMAGE_SUBJECT_TERMS)) {
      errors.push("HARD_VALIDATION: text2image_prompt must describe the subject category");
    }

    if (!includesAny(text2imagePrompt, TEXT2IMAGE_ENVIRONMENT_TERMS)) {
      errors.push("HARD_VALIDATION: text2image_prompt must describe the location or scene");
    }

    if (!includesAny(text2imagePrompt, TEXT2IMAGE_LIGHTING_TERMS)) {
      errors.push("HARD_VALIDATION: text2image_prompt must describe lighting");
    }

    if (!includesAny(text2imagePrompt, TEXT2IMAGE_ACTION_TERMS)) {
      errors.push("HARD_VALIDATION: text2image_prompt must describe action or pose");
    }

    if (!includesAny(text2imagePrompt, [capture_plan.camera.zoom])) {
      warnings.push("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT: zoom missing from text2image_prompt");
    }

    if (!includesAny(text2imagePrompt, [capture_plan.camera.height])) {
      warnings.push("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT: camera_height missing from text2image_prompt");
    }
  }

  if (result.user_tips.length !== 3) {
    errors.push("HARD_VALIDATION: user_tips must contain exactly 3 items");
  }

  if (!includesAny(generationPrompt, [capture_plan.camera.zoom])) {
    errors.push("HARD_VALIDATION: zoom not represented in generation_prompt");
  }

  if (!includesAny(generationPrompt, [capture_plan.camera.height])) {
    errors.push("HARD_VALIDATION: capture-plan camera height missing from generation_prompt");
  }

  if (!includesAny(safePrompt, [capture_plan.camera.zoom])) {
    warnings.push("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT: zoom missing from safe_render_prompt");
  }

  if (!includesAny(safePrompt, [capture_plan.camera.height])) {
    warnings.push("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT: camera_height missing from safe_render_prompt");
  }

  if (!includesAny(generationPrompt, [capture_plan.primary_change])) {
    errors.push("HARD_VALIDATION: primary_change not represented in generation_prompt");
  }

  if (!includesAny(generationPrompt, [capture_plan.capture_cue])) {
    warnings.push("ENVIRONMENTAL_TIMING_NOT_USED: capture cue missing from generation_prompt");
  }

  if (hasMovementOpportunity(result) && opportunity.shot_type === "full_body_portrait") {
    warnings.push("MOVEMENT_OPPORTUNITY_BUT_STATIC_SHOT_TYPE");
  }

  if (opportunity.shot_type === "full_body_movement_portrait") {
    if (!isMeaningful(timing.environmental_motion)) {
      warnings.push("ENVIRONMENTAL_TIMING_NOT_USED: movement shot without environmental_motion");
    }
    const weight = result.pose.weight_distribution.toLowerCase();
    if (weight.includes("even") || weight.includes("balanced evenly")) {
      warnings.push("STATIC_POSE_FOR_MOVEMENT_SHOT");
    }
  }

  const lowImpactTips = result.user_tips.filter((tip) =>
    LOW_IMPACT_TIP_TERMS.some((term) => tip.toLowerCase().includes(term))
  );
  if (lowImpactTips.length >= 2) {
    warnings.push("LOW_IMPACT_USER_TIP");
  }

  const crop = shot_plan.crop.toLowerCase();
  const outfitSignals = ["dress", "wrap", "fabric", "skirt", "coat", "train", "flowing"];
  const outfitImportant = outfitSignals.some((signal) =>
    includesAny(
      [
        result.assessment.strongest_existing_element,
        ...result.opportunity.scene_assets,
        result.generation_prompt
      ].join(" "),
      [signal]
    )
  );
  if (outfitImportant && (crop.includes("tight") || crop.includes("close") || crop.includes("three quarter"))) {
    warnings.push("OUTFIT_ASSET_CROPPED_OUT");
  }

  const currentScale = shot_plan.current_subject_scale.toLowerCase();
  const widenSignals = ["wider", "more environment", "include more scenery", "widen the scene"];
  if (
    (currentScale.includes("too small") || currentScale.includes("small")) &&
    shot_plan.zoom === "1x" &&
    includesAny(generationPrompt, widenSignals)
  ) {
    warnings.push("COACH_WRONG_ZOOM: subject too small but plan widens scene with 1x");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function buildCoachCorrectionMessage(validation: CoachPhotographyValidationResult) {
  const issues = [...validation.errors, ...validation.warnings].join("\n- ");

  return [
    "Review your recommendation for internal consistency.",
    "",
    "The following issues were detected:",
    `- ${issues}`,
    "",
    "If the scene relies on stepping, waves, wind, or flowing fabric, re-evaluate whether full_body_movement_portrait is stronger than a static portrait.",
    "Ensure user_tips are short, high-impact, and camera-action oriented.",
    "Use relative, visible actions and framing targets that a phone photographer can reproduce; do not invent false precision.",
    "Keep exactly one primary_change and make capture_plan internally consistent with shot_plan.",
    "The backend composes all render prompts deterministically from capture_plan, so correct capture_plan rather than writing prompts.",
    "Ensure subject_description and scene_description are standalone and do not depend on hidden source-image context.",
    "Keep the same JSON schema.",
    "Return corrected JSON only."
  ].join("\n");
}
