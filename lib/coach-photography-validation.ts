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

const VAGUE_DISTANCE_TERMS = ["moderate distance", "close", "far", "medium distance"];
const VAGUE_SCALE_TERMS = ["dominant", "bigger", "more prominent", "larger subject"];
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
  const { shot_plan, opportunity, timing } = result;

  if (!shot_plan.zoom) {
    errors.push("HARD_VALIDATION: shot_plan.zoom missing");
  }

  if (!shot_plan.camera_height?.trim()) {
    errors.push("HARD_VALIDATION: camera_height missing");
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

    if (shot_plan.zoom && !includesAny(text2imagePrompt, [shot_plan.zoom])) {
      warnings.push("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT: zoom missing from text2image_prompt");
    }

    if (!includesAny(text2imagePrompt, [shot_plan.camera_height])) {
      warnings.push("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT: camera_height missing from text2image_prompt");
    }
  }

  if (result.user_tips.length !== 3) {
    errors.push("HARD_VALIDATION: user_tips must contain exactly 3 items");
  }

  if (shot_plan.zoom && !includesAny(generationPrompt, [shot_plan.zoom])) {
    errors.push("HARD_VALIDATION: zoom not represented in generation_prompt");
  }

  const recommendedScale = shot_plan.recommended_subject_scale.toLowerCase();
  if (recommendedScale.includes("larger") && !includesAny(generationPrompt, ["larger", "bigger", "%", "scale"])) {
    errors.push("HARD_VALIDATION: recommended_subject_scale contradicts generation_prompt");
  }

  if (shot_plan.zoom && !includesAny(safePrompt, [shot_plan.zoom])) {
    warnings.push("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT: zoom missing from safe_render_prompt");
  }

  if (!includesAny(safePrompt, [shot_plan.camera_height])) {
    warnings.push("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT: camera_height missing from safe_render_prompt");
  }

  if (shot_plan.estimated_scale_change.trim()) {
    const scaleSignals = ["larger", "smaller", "scale", "percent", "%", shot_plan.estimated_scale_change];
    if (!includesAny(generationPrompt, scaleSignals)) {
      warnings.push("SHOT_PLAN_NOT_FULLY_TRANSFERRED_TO_PROMPT: estimated_scale_change not in generation_prompt");
    }
  }

  if (isMeaningful(timing.capture_moment)) {
    const timingSignals = ["wave", "wind", "moment", "timing", "step", "movement", "capture"];
    if (!includesAny(generationPrompt, timingSignals)) {
      warnings.push("ENVIRONMENTAL_TIMING_NOT_USED: capture_moment not in generation_prompt");
    }
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

  const distance = shot_plan.photographer_distance.toLowerCase();
  if (VAGUE_DISTANCE_TERMS.some((term) => distance.includes(term))) {
    warnings.push("VAGUE_CAMERA_DISTANCE");
  }

  const recommended = shot_plan.recommended_subject_scale.toLowerCase();
  if (
    VAGUE_SCALE_TERMS.some((term) => recommended.includes(term)) &&
    !shot_plan.estimated_scale_change.includes("%")
  ) {
    warnings.push("VAGUE_SUBJECT_SCALE");
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
    "Use specific geometry (e.g. 4-6 meters, waist height, 25-30% larger) in shot_plan and all three prompts.",
    "Ensure safe_render_prompt faithfully implements the shot plan using photography-action wording.",
    "Ensure text2image_prompt is a standalone scene description with no source-image dependency and no identity preservation.",
    "Keep the same JSON schema.",
    "Return corrected JSON only."
  ].join("\n");
}
