import type {
  CoachPhotographyCapturePlan,
  CoachPhotographyCoachResult,
  CoachPreferences
} from "@/lib/types";

type PromptSource = Pick<
  CoachPhotographyCoachResult,
  "capture_plan" | "opportunity" | "mode"
>;

const SOURCE_DEPENDENT_PATTERN =
  /\b(source image|original (?:image|photo)|uploaded (?:image|photo)|same person|same (?:woman|man)|preserve identity|from the reference|match the face|recognizable person)\b/gi;

function list(items: string[], fallback: string) {
  const cleaned = items.map(cleanClause).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join("; ") : fallback;
}

function avoidList(items: string[], fallback: string) {
  return list(
    items.map((item) => item.replace(/^avoid\s*:?[\s]+/i, "")),
    fallback
  );
}

function cleanClause(value: string) {
  return value.replace(/\s+/g, " ").replace(/[\s.;,]+$/g, "").trim();
}

function paragraph(...clauses: string[]) {
  const cleaned = clauses.map(cleanClause).filter(Boolean);
  return cleaned.length > 0 ? `${cleaned.join(". ")}.` : "";
}

function standaloneText(value: string) {
  return value
    .replace(SOURCE_DEPENDENT_PATTERN, "the subject")
    .replace(/\s+/g, " ")
    .trim();
}

function intensityLine(preferences?: CoachPreferences) {
  switch (preferences?.editIntensity) {
    case "safe":
      return "Keep the improvement conservative and very easy to reproduce.";
    case "aggressive":
      return "Make the primary improvement unmistakable while keeping it physically reproducible.";
    default:
      return "Make the primary improvement clear, realistic, and easy to reproduce.";
  }
}

export function composeCoachSafeRenderPrompt(
  source: PromptSource,
  preferences?: CoachPreferences
) {
  const plan = source.capture_plan;

  return [
    "PURPOSE",
    "Create a photorealistic smartphone retake reference that a real user can reproduce at this same location. This is a shooting guide, not a polished AI makeover.",
    "",
    "PRIMARY CHANGE",
    paragraph(plan.primary_change, intensityLine(preferences)),
    "",
    "CAMERA ACTION",
    paragraph(
      `Use ${plan.camera.zoom} zoom`,
      plan.camera.move,
      plan.camera.height,
      plan.camera.viewpoint,
      "Treat these as visible framing goals rather than an exact optical simulation"
    ),
    "",
    "FRAME",
    paragraph(
      plan.frame.body_crop,
      plan.frame.subject_position,
      plan.frame.gaze_space,
      plan.frame.background_anchor,
      plan.frame.edge_cleanup
    ),
    "",
    "SUBJECT ACTION",
    plan.subject_action,
    "",
    "CAPTURE MOMENT",
    plan.capture_cue,
    "",
    "PRESERVE",
    `Preserve: ${list(plan.preserve, "identity; outfit; location; weather; existing light")}.`,
    "",
    "AVOID",
    `Avoid: ${avoidList(plan.avoid.slice(0, 5), "identity drift; extra people; changed location; changed lighting; glam retouching")}. No watermark or text.`
  ].join("\n");
}

export function composeCoachGenerationPrompt(
  source: PromptSource,
  preferences?: CoachPreferences
) {
  return composeCoachSafeRenderPrompt(source, preferences);
}

export function composeCoachText2ImagePrompt(
  source: PromptSource,
  preferences?: CoachPreferences
) {
  const plan = source.capture_plan;
  const avoid = plan.avoid
    .map(standaloneText)
    .filter((item) => item && !/identity|likeness|face match/i.test(item))
    .slice(0, 5);

  return [
    "PURPOSE",
    "Create a photorealistic smartphone portrait reference that could be captured by a real photographer.",
    "",
    "SCENE AND SUBJECT",
    paragraph(standaloneText(plan.subject_description), standaloneText(plan.scene_description)),
    "",
    "PRIMARY CHANGE",
    paragraph(standaloneText(plan.primary_change), intensityLine(preferences)),
    "",
    "CAMERA AND FRAME",
    paragraph(
      `Use ${plan.camera.zoom} zoom`,
      standaloneText(plan.camera.move),
      standaloneText(plan.camera.height),
      standaloneText(plan.camera.viewpoint),
      standaloneText(plan.frame.body_crop),
      standaloneText(plan.frame.subject_position),
      standaloneText(plan.frame.gaze_space),
      standaloneText(plan.frame.background_anchor)
    ),
    "",
    "ACTION AND MOMENT",
    paragraph(standaloneText(plan.subject_action), standaloneText(plan.capture_cue)),
    "",
    "LIGHTING",
    paragraph(standaloneText(plan.lighting)),
    "",
    "AVOID",
    `Avoid: ${avoidList(avoid, "extra people; fantasy elements; glam retouching; editorial styling")}. No watermark or text.`
  ].join("\n");
}

export function buildTargetedCoachRetryPrompt(retryInstruction: string) {
  return [
    "Image 1 is the source photo and identity/location ground truth. Image 2 is the generated retake-reference draft to correct.",
    "Keep every successful aspect of Image 2 unchanged and use Image 1 only to restore preserved source details when needed.",
    `Correct only this mismatch: ${retryInstruction.trim()}`,
    "Preserve identity, outfit, location, weather, lighting character, and all composition details not named in the correction.",
    "Keep the result photorealistic, physically plausible, and reproducible with a smartphone. No watermark or text."
  ].join("\n");
}

export function hasSourceDependentText(prompt: string) {
  SOURCE_DEPENDENT_PATTERN.lastIndex = 0;
  return SOURCE_DEPENDENT_PATTERN.test(prompt);
}

export function capturePlanSummary(plan: CoachPhotographyCapturePlan) {
  return {
    primary_change: plan.primary_change,
    camera: plan.camera,
    frame: plan.frame,
    subject_action: plan.subject_action,
    capture_cue: plan.capture_cue,
    preserve: plan.preserve,
    avoid: plan.avoid
  };
}
