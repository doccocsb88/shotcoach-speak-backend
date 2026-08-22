import type {
  CoachDirectionV2,
  CoachLightVisionBrief,
  CoachLightVisionResult,
  CoachMode,
  CoachPhotographyCoachResult,
  CoachPrimaryAdjustment,
  CoachPhotoAnalysisV2,
  CoachPreferences,
  CreativeDirection,
  GenerationRecipe,
  ProductionPhotoAnalysis,
  QualityEvaluationResult,
  ToolId
} from "@/lib/types";
import {
  describeFrameStrategy,
  describePoseChangeMagnitude
} from "@/lib/coach-light-vision";

const compositionReference = [
  "rule of thirds",
  "golden ratio",
  "leading lines",
  "S-curve",
  "symmetry",
  "negative space",
  "framing",
  "depth and layering",
  "minimalism"
].join(", ");

const cameraAngleReference = [
  "eye level",
  "high angle",
  "low angle",
  "bird's eye",
  "worm's eye",
  "ground level",
  "3/4 profile",
  "over-the-shoulder",
  "dutch angle"
].join(", ");

const modeFocusInstructions: Record<CoachMode, string> = {
  composition: [
    "- subject placement (rule of thirds, centered, golden ratio)",
    "- leading lines, diagonal lines, and S-curves",
    "- symmetry, asymmetry, balance, and visual weight",
    "- negative space vs fill the frame",
    "- framing, depth, layering, and background distractions"
  ].join("\n"),
  frame: [
    "- framing",
    "- camera distance",
    "- crop ratio",
    "- headroom",
    "- perspective"
  ].join("\n"),
  angle: [
    "- vertical camera height (eye level, high angle, low angle, bird's eye, worm's eye, ground level)",
    "- horizontal camera position (front, 3/4 profile, side, back, over-the-shoulder)",
    "- camera tilt (level, dutch angle, tilt up, tilt down)",
    "- perspective and power dynamics",
    "- angle-to-mood match"
  ].join("\n"),
  pose: [
    "- pose readability",
    "- body language",
    "- hand and limb placement",
    "- posture",
    "- expression",
    "- naturalness"
  ].join("\n"),
  comprehensive: [
    "- composition",
    "- framing",
    "- camera distance",
    "- subject placement",
    "- pose readability",
    "- lighting quality",
    "- subject separation",
    "- background distractions",
    "- realism",
    "- social media usefulness"
  ].join("\n")
};

const modePriorityBlocks: Record<CoachMode, string> = {
  composition: [
    "1. Subject placement and visual balance.",
    "2. Framing, crop, and negative space.",
    "3. Background distraction reduction.",
    "4. Minimal safe pose refinement only if needed."
  ].join("\n"),
  frame: [
    "1. Camera distance and crop framing.",
    "2. Headroom and edge cleanup.",
    "3. Subject placement within the frame.",
    "4. Minimal safe pose refinement only if needed."
  ].join("\n"),
  angle: [
    "1. Camera height and horizontal angle.",
    "2. Perspective and mood fit.",
    "3. Small framing alignment changes required by the angle shift.",
    "4. Minimal safe pose refinement only if needed."
  ].join("\n"),
  pose: [
    "1. Posture and pose readability.",
    "2. Hand placement and body language.",
    "3. Expression naturalness.",
    "4. Minor framing support if required."
  ].join("\n"),
  comprehensive: [
    "1. Framing and subject placement.",
    "2. Camera distance and angle.",
    "3. Pose readability and subject separation.",
    "4. Preserve lighting and realism."
  ].join("\n")
};

const directIntensityInstructions: Record<CoachMode, Record<string, string>> = {
  composition: {
    safe: "Use the smallest believable composition improvement only.",
    balanced: "Make a clear but realistic composition improvement.",
    aggressive: "Push composition noticeably while keeping the result believable."
  },
  frame: {
    safe: "Use a small framing correction only.",
    balanced: "Use a clear framing improvement while keeping the same moment.",
    aggressive: "Use a stronger framing change that still feels like the same capture."
  },
  angle: {
    safe: "Use the smallest believable angle adjustment only.",
    balanced: "Use a clear but realistic angle improvement.",
    aggressive: "Use a stronger angle shift while preserving realism."
  },
  pose: {
    safe: "Make only minimal pose corrections.",
    balanced: "Make clear but natural pose refinements.",
    aggressive: "Make stronger pose improvements while preserving identity and realism."
  },
  comprehensive: {
    safe: "Use minimal cross-category improvements only.",
    balanced: "Use clear but realistic improvements across pose, frame, and angle.",
    aggressive: "Push the overall shot quality strongly while keeping it believable."
  }
};

const toolPromptBuilders: Record<string, (instruction?: string) => string> = {
  enhance_photo: (instruction) =>
    [
      "Enhance the uploaded photo while preserving the same subject, identity, clothing, scene, lighting, and realism.",
      "Improve clarity, exposure balance, tonal separation, and overall photographic polish without changing the captured moment.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n"),
  better_composition: (instruction) =>
    [
      "Improve composition only.",
      "Preserve the same person, pose, clothing, background, and lighting.",
      "Use crop, framing, subject placement, and visual balance improvements only.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n"),
  light_color: (instruction) =>
    [
      "Improve light and color fidelity only.",
      "Preserve identity, background, time of day, and realism.",
      "Keep corrections natural and avoid cinematic recoloring.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n"),
  restore_color: (instruction) =>
    [
      "Restore natural color in the uploaded photo.",
      "Preserve the original scene mood and lighting condition.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n"),
  upscale: (instruction) =>
    [
      "Upscale the photo for higher resolution output.",
      "Preserve identity, textures, anatomy, and scene realism.",
      "Avoid hallucinated detail or artificial sharpening artifacts.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n"),
  background_boost: (instruction) =>
    [
      "Improve background clarity and separation while preserving the original location and lighting.",
      "Do not replace the background or invent new scenery.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n"),
  expand_frame: (instruction) =>
    [
      "Expand the frame naturally from the existing scene.",
      "Preserve identity, outfit, lighting direction, perspective, and environmental consistency.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n"),
  replace_background: (instruction) =>
    [
      "Replace the background while preserving the original subject identity, outfit, perspective, and believable lighting match.",
      "Avoid cutout artifacts or compositing mismatches.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n"),
  remove_object: (instruction) =>
    [
      "Remove the unwanted object cleanly from the photo.",
      "Preserve the same subject, scene integrity, perspective, and lighting.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n"),
  smooth_skin: (instruction) =>
    [
      "Refine skin gently while preserving natural texture, pores, and identity.",
      "Do not create a beauty filter look.",
      optionalInstruction(instruction)
    ]
      .filter(Boolean)
      .join("\n")
};

function optionalInstruction(instruction?: string) {
  return instruction ? `Extra instruction: ${instruction}` : "";
}

function formatSceneContext(sceneContext?: CoachPreferences["sceneContext"]) {
  if (!sceneContext) {
    return "unknown";
  }

  return sceneContext.replace(/_/g, " ");
}

function formatAgeRange(ageRange?: CoachPreferences["ageRange"]) {
  if (!ageRange) {
    return "unknown";
  }

  return ageRange.replace(/_/g, " ");
}

function formatGender(gender?: CoachPreferences["gender"]) {
  return gender?.replace(/_/g, " ") ?? "unknown";
}

function formatIntensity(intensity?: CoachPreferences["editIntensity"]) {
  return intensity ?? "balanced";
}

export function buildCoachPersonalizationBlock(preferences?: CoachPreferences) {
  if (!preferences || Object.keys(preferences).length === 0) {
    return "";
  }

  return [
    "=== COACH MODE — SHOOTING CONTEXT ===",
    "SUBORDINATE TO ALL SAFETY RULES ABOVE.",
    `The user is trying to take a ${formatSceneContext(preferences.sceneContext)}-style photo.`,
    "Use this context ONLY to tailor pose, framing, and composition suggestions within the visible scene.",
    "Do NOT change location, background, lighting, outfit, or identity.",
    `- Gender presentation: ${formatGender(preferences.gender)}`,
    `- Age range: ${formatAgeRange(preferences.ageRange)}`,
    `- Intended shooting context: ${formatSceneContext(preferences.sceneContext)}`,
    `- Comprehensive intensity: ${formatIntensity(preferences.editIntensity)}`,
    "Tailoring rules:",
    "- Scene context informs what to suggest, not where the photo takes place.",
    "- If the visible scene does not match the selected context, prioritize the actual photo.",
    "- Use gender and age only for pose comfort and framing appropriateness. Avoid stereotypes."
  ].join("\n");
}

export function buildCoachVisionAnalysisPromptV2(mode: CoachMode, preferences?: CoachPreferences) {
  return {
    system: [
      "You are ShotCoach, a professional photography coach.",
      "",
      "Analyze the uploaded photo and return structured JSON only.",
      "",
      "Product goal:",
      "ShotCoach helps users create a realistic photography coaching reference for retaking a better version of the same photo.",
      "",
      `Focus strictly on the selected coaching mode: ${mode}`,
      modeFocusInstructions[mode],
      mode === "angle" ? `Angle vocabulary reference: ${cameraAngleReference}` : "",
      mode === "composition" ? `Composition vocabulary reference: ${compositionReference}` : "",
      "",
      "Safety rules:",
      "- Do not suggest changing identity, face, body shape, outfit, hairstyle, background, location, weather, time of day, or lighting style.",
      "- Do not suggest cinematic relighting, heavy color grading, beauty retouching, fantasy styling, or editorial redesign.",
      "- Prefer safer improvements through framing, crop, camera distance, subject placement, composition, and subject separation.",
      "- Pose suggestions must be minimal and must preserve the original expression, face angle, hand position, and body structure whenever possible.",
      "- Only describe visible elements. If uncertain, use \"unknown\".",
      "",
      buildCoachPersonalizationBlock(preferences),
      "",
      "Return STRICT JSON only:",
      JSON.stringify(coachPhotoAnalysisSchemaExample, null, 2)
    ]
      .filter(Boolean)
      .join("\n"),
    user: "Analyze this uploaded photo for ShotCoach AI Coach. Create a safe structured analysis for improving the same photo, not redesigning the person or scene. Return the PhotoAnalysis JSON only."
  };
}

export function buildVisionAnalysisPromptV1() {
  return {
    system: [
      "You are a professional photography director and visual analysis engine.",
      "",
      "Analyze the uploaded photo for:",
      "- composition",
      "- camera angle",
      "- lighting",
      "- pose",
      "- expression",
      "- naturalness",
      "- social media quality",
      "",
      "Anti-hallucination rules:",
      "1. Only describe visible elements.",
      "2. If uncertain, use \"unknown\".",
      "3. Do not invent objects or people.",
      "4. Preserve identity.",
      "5. Keep realism.",
      "6. Follow the schema strictly.",
      "",
      "Return STRICT JSON only:",
      JSON.stringify(productionPhotoAnalysisSchemaExample, null, 2)
    ].join("\n"),
    user: "Analyze this photo and return the PhotoAnalysis JSON only."
  };
}

export function buildCreativeDirectionPromptV1() {
  return {
    system: [
      "You are a realistic photography reference director.",
      "",
      "Create exactly 3 visually different improvement directions from the provided PhotoAnalysis JSON.",
      "",
      "Selected tool: AI Coach.",
      "Use the default conservative ShotCoach flow.",
      "",
      "Focus on:",
      "- composition",
      "- pose",
      "- camera angle",
      "- existing lighting preservation",
      "- realism",
      "",
      "Rules:",
      "- Do not relocate the subject to a new place.",
      "- Do not replace face, body shape, hairstyle, clothing, accessories, or outfit colors.",
      "- Do not change time of day, weather, color temperature, scene mood, or background.",
      "- Do not propose cinematic relighting, fantasy atmosphere, beauty retouching, orange/teal grading, or golden hour conversion.",
      "- Every direction must be a conservative edit of the uploaded photo.",
      "- Return STRICT JSON only.",
      "",
      "Return this schema:",
      JSON.stringify({ directions: [creativeDirectionSchemaExample] }, null, 2)
    ].join("\n"),
    userPrefix: "Create creative directions for this PhotoAnalysis JSON:\n"
  };
}

export function buildCoachDirectionPromptV2(mode: CoachMode, preferences?: CoachPreferences) {
  return {
    system: [
      "You are ShotCoach, a professional photography coach giving direct, highly actionable physical instructions to the user.",
      "",
      "Create exactly 1 safe creative direction from the provided PhotoAnalysis JSON.",
      `The advice must focus primarily on the selected coaching mode: ${mode}.`,
      "",
      "CRITICAL: Your \"summary\" field must be highly specific, actionable advice spoken directly to the user.",
      "Be extremely precise, step-by-step, and physical.",
      "",
      "Prioritize improvements in this order based on the mode:",
      modePriorityBlocks[mode],
      "",
      "Do not suggest:",
      "- new background",
      "- new location",
      "- new outfit",
      "- new face",
      "- new identity",
      "- new time of day",
      "- new weather",
      "- cinematic relighting",
      "- heavy color grading",
      "- beauty retouch",
      "- fantasy or editorial styling",
      "- major pose changes",
      "- opening closed eyes",
      "- moving hands to a completely different position",
      "- changing face angle dramatically",
      "",
      "Each direction must include:",
      "- title",
      "- user-facing summary",
      "- composition change",
      "- camera distance change",
      "- subject placement change",
      "- pose refinement",
      "- lighting preservation",
      "- edit strength",
      "- identity risk",
      "- implementation notes for prompt builder",
      "",
      buildCoachPersonalizationBlock(preferences),
      "",
      "Return STRICT JSON only:",
      JSON.stringify({ directions: [coachDirectionSchemaExample] }, null, 2)
    ]
      .filter(Boolean)
      .join("\n"),
    userPrefix: [
      "Create 3 safe ShotCoach AI Coach directions from this PhotoAnalysis JSON:\n",
      "\n\nDirections should be practical, realistic, and suitable for generating reference images. Use conservative changes that preserve identity, lighting, background, outfit, and scene mood."
    ].join("")
  };
}

export function buildPromptComposerPromptV1() {
  return {
    system: [
      "You are an expert image generation prompt engineer.",
      "",
      "Convert each creative direction into a production-ready Reference Mode image-edit prompt.",
      "",
      "Selected tool: AI Coach.",
      "Use the default conservative ShotCoach flow.",
      "",
      "Include:",
      "- pose",
      "- original lighting preservation",
      "- framing",
      "- depth",
      "- color fidelity",
      "- realism constraints",
      "",
      "Priority order:",
      "1. Preserve identity.",
      "2. Preserve original environment, lighting, time of day, weather, color temperature, and scene mood.",
      "3. Improve pose, framing, composition, camera angle, and subject separation.",
      "4. Apply only subtle photographic cleanup that does not redesign the image.",
      "",
      "Rules:",
      "- The prompt must explicitly preserve the original person's exact identity and environment.",
      "- The prompt must explicitly preserve same lighting condition, time of day, weather, white balance, color temperature, and scene mood.",
      "- The prompt must not ask for a new scene, new person, new outfit, or new background unless the selected tool is Replace Background or Expand Frame.",
      "- The prompt must not use luxury, cinematic, editorial, dramatic, beauty, perfect skin, influencer, fantasy, golden hour, orange/teal, or heavy color grading language unless it says to avoid those changes.",
      "- Return STRICT JSON only.",
      "",
      "Return this schema:",
      JSON.stringify({ recipes: [generationRecipeSchemaExample] }, null, 2)
    ].join("\n"),
    userBuilder: (analysisJson: string, directionJson: string) =>
      `PhotoAnalysis JSON:\n${analysisJson}\n\nCreativeDirection JSON:\n${directionJson}`
  };
}

export function buildQualityEvaluationPrompt(directionJson: string) {
  return {
    system: [
      "You are a production image quality evaluator for AI photo edits.",
      "",
      "Compare the original source photo with the generated edit.",
      "",
      "Evaluate:",
      "- identity preservation",
      "- lighting and color consistency with the original",
      "- environment/background preservation",
      "- naturalness",
      "- anatomy",
      "- realism",
      "- whether the edit followed the selected creative direction",
      "",
      "Retry conditions:",
      "- identity_preservation < 8.5",
      "- naturalness < 8",
      "- anatomy_score < 8",
      "- overall_score < 8",
      "- face shape, eye shape, nose shape, jawline, skin tone identity, hairstyle, clothing, or age appearance changed",
      "- original lighting, time of day, weather, color temperature, or scene mood changed",
      "- output looks over-beautified, cinematic, fantasy, or heavily recolored",
      "",
      "Return STRICT JSON only:",
      JSON.stringify(qualityEvaluationSchemaExample, null, 2)
    ].join("\n"),
    user: `Evaluate the generated edit against the original photo and selected direction:\n${directionJson}`
  };
}

export function buildAICoachImageEditPrompt(
  analysis: CoachPhotoAnalysisV2,
  direction: CoachDirectionV2,
  userInstruction?: string,
  preferences?: CoachPreferences
) {
  const analysisNotes = [
    ...analysis.composition.avoid_changes,
    ...analysis.lighting.preserve_rules,
    ...analysis.pose.unsafe_pose_changes,
    ...analysis.aesthetic.style_preservation,
    ...direction.prompt_builder_notes
  ]
    .filter(Boolean)
    .map((item) => `- ${item}`)
    .join("\n");

  return [
    "Edit the uploaded photo as a realistic ShotCoach AI photography coaching reference.",
    "",
    "The uploaded image is the source of truth.",
    "",
    "Product goal:",
    "Create a realistic reference image that shows a better way to photograph the same person in the same scene.",
    "This is not a beauty edit, not a full redesign, and not a new photoshoot.",
    "",
    "Priority order:",
    "1. Preserve the person's identity.",
    "2. Preserve the original environment, lighting, time of day, weather, white balance, color temperature, and scene mood.",
    "3. Improve the photo mainly through framing, crop, camera distance, subject placement, composition, and subject separation.",
    "4. Apply only minimal pose refinement when it is safe and consistent with the original pose.",
    "5. Keep the result realistic and close to the original captured moment.",
    "",
    "Strict subject preservation rules:",
    "- Preserve the exact same person and identity.",
    "- Do not change facial structure, face shape, eye shape, nose shape, lips, jawline, cheeks, forehead, chin, age appearance, or skin tone identity.",
    "- If glasses are visible, keep the identical frame shape, color, lens appearance, fit, and position.",
    "- Keep the exact hairstyle, hairline, length, texture, color, parting, and any visible facial hair.",
    "- Keep every visible necklace, earring, bracelet, ring, bag, hat, and accessory identical in design, material, color, size, placement, and count.",
    "- Preserve the original expression identity.",
    "- Preserve the original clothing.",
    "- Preserve realistic anatomy, hands, eyes, facial details, hair detail, and natural skin texture.",
    "",
    "Scene and lighting preservation rules:",
    "- Preserve the original location and background.",
    "- Preserve the original lighting condition, time of day, weather, white balance, color temperature, contrast level, and scene mood.",
    "- Do not relight, recolor, or apply cinematic grading.",
    "- Preserve realistic depth, lens feel, perspective, grain, texture, and photographic realism.",
    "",
    "Selected direction:",
    `Title: ${direction.title}`,
    `Summary: ${direction.summary}`,
    "",
    "Composition change:",
    direction.composition_change,
    "",
    "Camera distance change:",
    direction.camera_distance_change,
    "",
    "Subject placement change:",
    direction.subject_placement_change,
    "",
    "Pose refinement:",
    direction.pose_refinement,
    "",
    "Lighting preservation:",
    direction.lighting_preservation,
    "",
    buildCoachPersonalizationBlock(preferences),
    "",
    "Source-specific safety notes:",
    analysisNotes,
    "",
    "Allowed changes:",
    "- Improve framing and crop while keeping the same scene.",
    "- Improve subject placement and visual balance.",
    "- Improve subject separation using natural depth and local clarity, without changing the background.",
    "- Apply only very subtle pose refinement if it remains consistent with the original body position.",
    "- Apply only minor exposure or shadow recovery if needed, while keeping the same lighting source and color temperature.",
    "- Keep skin texture natural and realistic.",
    "",
    "Not allowed:",
    "- Do not create a different person.",
    "- Do not beautify or redesign the face.",
    "- Do not create an influencer-style AI face.",
    "- Do not significantly change the pose, hand position, face angle, or eye direction.",
    "- Do not replace the background.",
    "- Do not apply cinematic relighting, dramatic shadows, orange/teal grading, golden hour conversion, fantasy atmosphere, editorial fashion styling, makeup, perfect skin, or beauty filter effects.",
    "- Do not add text, logos, watermarks, UI elements, stickers, extra people, or new distracting objects.",
    "",
    `User instruction: ${userInstruction ?? "No extra instruction. Apply the selected coaching direction naturally and conservatively."}`,
    "",
    "Output requirement:",
    "Produce a realistic high-quality photo edit from the provided source image.",
    "The final output must look like a realistic photography coaching reference for retaking the same photo in the same location.",
    "It should feel like the same captured moment with improved photographic choices, not a new generated scene or a new photoshoot."
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildConservativeImageEditPrompt(userPrompt: string) {
  return [
    "Edit the uploaded photo as a realistic photography reference. The uploaded image is the source of truth.",
    "",
    "Priority order:",
    "1. Preserve the person's identity.",
    "2. Preserve the original environment, lighting, time of day, weather, white balance, color temperature, and scene mood.",
    "3. Improve only pose, framing, composition, camera angle, and subject separation.",
    "4. Apply only subtle photographic cleanup that keeps the image realistic.",
    "",
    "Preservation requirements:",
    "- Preserve the exact same person and identity.",
    "- Preserve the original clothing and accessories.",
    "- Preserve the original location and background.",
    "- Preserve the original lighting condition, time of day, weather, white balance, color temperature, and scene mood.",
    "- Preserve realistic human anatomy, hands, eyes, and facial details.",
    "",
    "Allowed edits:",
    "- Improve pose, framing, crop, camera angle feel, subject placement, subject separation, local sharpness, and natural depth of field.",
    "- Apply only minor exposure correction or shadow recovery if needed, while keeping the same lighting source and color temperature.",
    "- Keep skin texture natural. Do not smooth skin into a synthetic beauty look.",
    "",
    "Not allowed:",
    "- Do not beautify or redesign the face.",
    "- Do not create an influencer-style AI face.",
    "- Do not apply cinematic relighting, dramatic shadows, orange/teal grading, golden hour conversion, fantasy atmosphere, or editorial fashion styling.",
    "- Do not change weather, time of day, background, outfit, body shape, hairstyle, or accessories.",
    "",
    "Requested direction:",
    userPrompt,
    "",
    "Final output must look like the same captured moment with improved photographic choices, not a new photo shoot or a new generated scene."
    ].join("\n");
}

function buildIdentityLockBlock() {
  return [
    "This is a coaching reference generation edit: regenerating pose, framing, composition, camera angle, and scene layout is allowed.",
    "Identity lock is mandatory: preserve the exact same recognizable person throughout the edit.",
    "Face lock: keep the same facial structure, eye shape, nose, mouth, jawline, cheek shape, skin tone identity, expression character, and natural facial proportions.",
    "Glasses lock: if glasses are visible in the source, keep the identical frame shape, color, lens appearance, fit, and position; do not remove, replace, or restyle them.",
    "Hair lock: keep the exact hairstyle, hairline, length, texture, color, parting, and any visible facial hair.",
    "Jewelry and accessories lock: keep every visible necklace, earring, bracelet, ring, bag, hat, and accessory identical in design, material, color, size, placement, and count; do not add or remove accessories.",
    "Do not beautify, age-shift, de-age, gender-shift, retouch, or reinterpret the face or appearance."
  ].join(" ");
}

function buildLightVisionEditLead(vision: CoachLightVisionBrief) {
  return `Execute this light vision recommendation as the primary edit: ${vision.recommendation.target_change}`;
}

function buildOutpaintInstruction(vision: CoachLightVisionBrief, purpose: string) {
  if (!vision.recommendation.outpaint.allowed) {
    return "";
  }

  return `Limited canvas extension up to ${vision.recommendation.outpaint.extension_ratio_percent}% is allowed on ${vision.recommendation.outpaint.edges.join(", ") || "required edges"} ${purpose}. ${vision.recommendation.outpaint.expected_content}`;
}

function buildComprehensiveAdjustmentConstraints(
  primaryAdjustment: CoachPrimaryAdjustment,
  vision: CoachLightVisionBrief,
  frameCompositionInvariants: string,
  cameraAngleReference: string,
  compositionReference: string
) {
  const constraintsByAdjustment: Record<CoachPrimaryAdjustment, string[]> = {
    frame: [
      vision.recommendation.frame_strategy
        ? `Frame strategy: ${vision.recommendation.frame_strategy}. ${describeFrameStrategy(vision.recommendation.frame_strategy)}`
        : "",
      "Regenerate with a clearly visible framing improvement.",
      frameCompositionInvariants,
      "Do not invent missing body parts or replace the scene."
    ],
    composition: [
      vision.recommendation.composition_technique
        ? `Composition technique: ${vision.recommendation.composition_technique}.`
        : "",
      "Regenerate to improve only composition while preserving pose, camera angle, and scene.",
      frameCompositionInvariants,
      `Composition reference: ${compositionReference}.`
    ],
    angle: [
      "Create the same person, outfit, and moment from the recommended new camera viewpoint.",
      "A meaningful perspective change is allowed.",
      "Keep the camera move physically plausible. Do not replace the location or change the subject's pose.",
      `Angle reference: ${cameraAngleReference}.`
    ],
    pose: [
      vision.recommendation.pose_change_magnitude
        ? describePoseChangeMagnitude(
            vision.recommendation.pose_change_magnitude,
            vision.source.subject_visibility
          )
        : "",
      "Change only visible body regions. Do not change legs, feet, or weight distribution unless clearly visible.",
      "Adapt clothing folds and shadows naturally to the new pose.",
      "Do not change camera viewpoint, location, or lighting style."
    ]
  };

  return constraintsByAdjustment[primaryAdjustment].filter(Boolean).join(" ");
}

function buildComprehensiveDirectPrompt(
  contextPrefix: string,
  scenePreservationBlock: string,
  identityLockBlock: string,
  intensityInstruction: string,
  regeneratePreservationBlock: string,
  vision: CoachLightVisionBrief,
  visionContext: string
) {
  const primaryAdjustment = vision.recommendation.primary_adjustment ?? "composition";
  const frameCompositionInvariants =
    "Do not change pose, camera viewpoint, or perspective. Do not invent prominent new objects or replace the location.";

  return [
    `${contextPrefix}${scenePreservationBlock} ${identityLockBlock} This is COMPREHENSIVE MODE.`,
    buildLightVisionEditLead(vision),
    `Primary adjustment type: ${primaryAdjustment}. Apply ONLY this single adjustment type. Do not make unrelated framing, composition, pose, or angle changes outside the recommendation.`,
    buildComprehensiveAdjustmentConstraints(
      primaryAdjustment,
      vision,
      frameCompositionInvariants,
      cameraAngleReference,
      compositionReference
    ),
    regeneratePreservationBlock,
    buildOutpaintInstruction(vision, "to realize the recommendation"),
    intensityInstruction,
    "The result should feel like the same person in the same moment with one intentional improvement.",
    visionContext
  ]
    .filter(Boolean)
    .join(" ");
}

export function wrapReferenceGenerationPrompt(generationPrompt: string) {
  const direction = generationPrompt.trim();
  return [
    "Follow the photography direction below as strictly as possible.",
    "",
    "The original image is the source of truth for identity, clothing, location, and environment.",
    "",
    "Generate a realistic visual shooting reference, not a final AI-edited photo.",
    "",
    direction
  ].join("\n");
}

export function resolveCoachEditPrompt(
  mode: CoachMode,
  preferences?: CoachPreferences,
  coachResult?: CoachPhotographyCoachResult | CoachLightVisionResult
) {
  if (coachResult && "safe_render_prompt" in coachResult && coachResult.safe_render_prompt?.trim()) {
    return wrapReferenceGenerationPrompt(coachResult.safe_render_prompt);
  }

  if (coachResult && "generation_prompt" in coachResult && coachResult.generation_prompt?.trim()) {
    return wrapReferenceGenerationPrompt(coachResult.generation_prompt);
  }

  if (coachResult && "image_generation_prompt" in coachResult && coachResult.image_generation_prompt?.trim()) {
    return wrapReferenceGenerationPrompt(coachResult.image_generation_prompt);
  }

  return buildDirectCoachPrompt(mode, preferences);
}

export function buildDirectCoachPrompt(
  mode: CoachMode,
  preferences?: CoachPreferences,
  vision?: CoachLightVisionBrief
) {
  const contextPrefix = buildDirectModeContext(preferences);
  const identityLockBlock = buildIdentityLockBlock();
  const scenePreservationBlock =
    "Preserve the same person, clothing, accessories, location, scene identity, lighting direction, time of day, weather, and color temperature.";
  const intensityInstruction = directIntensityInstructions[mode][formatIntensity(preferences?.editIntensity)];
  const regeneratePreservationBlock =
    "Regenerate the coaching reference as needed to realize the intended improvement. Preserve locked identity, the same recognizable environment, perspective, lighting, and captured moment.";
  const frameCompositionInvariants =
    "Do not change pose, camera viewpoint, or perspective. Do not invent prominent new objects or replace the location.";
  const visionContext = buildLightVisionContext(vision);

  const promptByMode: Record<CoachMode, string> = {
    composition: [
      `${contextPrefix}${scenePreservationBlock} ${identityLockBlock}`,
      "Regenerate the image to improve only composition while preserving the subject's exact identity, pose, camera angle, and scene.",
      "Make the intended subject placement and compositional change clearly visible; adjust framing, spacing, and scene layout as needed.",
      vision?.recommendation.composition_technique
        ? `Selected composition technique: ${vision.recommendation.composition_technique}.`
        : "",
      vision?.recommendation.target_change
        ? buildLightVisionEditLead(vision)
        : "Pick one realistic composition improvement such as rule of thirds, centered composition, leading lines, symmetry, framing, negative space, fill the frame, diagonal lines, golden ratio, triangular composition, balance, depth, layering, S-curve, asymmetry, patterns, repetition, minimalism, or visual weight.",
      regeneratePreservationBlock,
      vision?.recommendation.outpaint.allowed
        ? `Limited canvas extension up to ${vision.recommendation.outpaint.extension_ratio_percent}% is allowed on ${vision.recommendation.outpaint.edges.join(", ") || "required edges"} to realize the composition. ${vision.recommendation.outpaint.expected_content}`
        : "",
      frameCompositionInvariants,
      intensityInstruction,
      `Composition reference: ${compositionReference}`,
      visionContext
    ]
      .filter(Boolean)
      .join(" "),
    frame: [
      `${contextPrefix}${scenePreservationBlock} ${identityLockBlock}`,
      vision?.recommendation.frame_strategy === "retain"
        ? "The current framing is already strong. Regenerate faithfully with no meaningful framing change."
        : "Regenerate the image with a clearly visible framing improvement while preserving the exact identity, pose, camera angle, and scene.",
      vision?.recommendation.frame_strategy
        ? `Selected frame strategy: ${vision.recommendation.frame_strategy}. ${describeFrameStrategy(vision.recommendation.frame_strategy)}`
        : "",
      vision?.recommendation.target_change
        ? buildLightVisionEditLead(vision)
        : "Adjust the framing to show clearer subject emphasis and better edge balance.",
      regeneratePreservationBlock,
      vision?.recommendation.outpaint.allowed
        ? `Limited canvas extension up to ${vision.recommendation.outpaint.extension_ratio_percent}% is allowed on ${vision.recommendation.outpaint.edges.join(", ") || "required edges"} to improve framing. ${vision.recommendation.outpaint.expected_content}`
        : "",
      frameCompositionInvariants,
      "Do not invent missing body parts or replace the scene.",
      intensityInstruction,
      "Keep the same person, exact pose, camera angle, perspective, scene identity, and lighting.",
      visionContext
    ]
      .filter(Boolean)
      .join(" "),
    angle: [
      `${contextPrefix}${scenePreservationBlock} ${identityLockBlock}`,
      "Create a reference showing the same person, outfit, and moment from the recommended new camera viewpoint.",
      vision?.recommendation.target_change
        ? buildLightVisionEditLead(vision)
        : "Pick one realistic angle improvement such as eye level, high angle, low angle, 3/4 profile, side angle, over-the-shoulder, dutch angle, tilt up, or tilt down.",
      "A meaningful perspective change is allowed.",
      "You may reconstruct newly visible parts of the existing environment and extend the canvas where required by the new viewpoint.",
      vision?.recommendation.outpaint.allowed
        ? `Canvas extension is allowed on these edges: ${vision.recommendation.outpaint.edges.join(", ") || "as needed"}. Extend by approximately ${vision.recommendation.outpaint.extension_ratio_percent}% of the canvas in those directions. ${vision.recommendation.outpaint.expected_content}`
        : "Extend the canvas only where needed to show the new viewpoint, using a continuous extension of the visible location, materials, lighting, weather, and time of day.",
      intensityInstruction,
      "Keep the camera move physically plausible and limit the viewpoint shift to a modest change. Do not replace the location, invent prominent new objects, or change the subject's pose.",
      `Angle reference: ${cameraAngleReference}`,
      visionContext
    ].join(" "),
    pose: [
      `${contextPrefix}${scenePreservationBlock} ${identityLockBlock}`,
      vision?.recommendation.pose_change_magnitude === "complete"
        ? "Create a clearly different, complete pose reference for the same person."
        : "Create a clearly different pose reference for the same person using only visible body regions.",
      vision?.recommendation.pose_change_magnitude
        ? describePoseChangeMagnitude(
            vision.recommendation.pose_change_magnitude,
            vision.source.subject_visibility
          )
        : "The result must demonstrate a genuinely new pose, not a subtle posture correction.",
      vision?.recommendation.target_change
        ? buildLightVisionEditLead(vision)
        : "Recommend a genuinely new pose with different torso orientation, limb placement, weight distribution, and stance.",
      "You may reposition every body region that is visible or partially visible in the source image.",
      "Do not change legs, feet, or weight distribution unless they are clearly visible in the source image.",
      "Adapt clothing folds and shadows naturally to the new pose.",
      "Preserve plausible anatomy, joint limits, balance, hand structure, and contact with the ground or nearby objects.",
      vision?.recommendation.outpaint.allowed
        ? `A small canvas extension up to ${vision.recommendation.outpaint.extension_ratio_percent}% is allowed on ${vision.recommendation.outpaint.edges.join(", ") || "required edges"} only to reveal missing limbs needed for the pose reference. ${vision.recommendation.outpaint.expected_content}`
        : "Do not extend the canvas unless absolutely required to show a missing visible limb.",
      intensityInstruction,
      "Do not change body shape, outfit design, location, lighting style, or camera viewpoint.",
      visionContext
    ].join(" "),
    comprehensive: vision
      ? buildComprehensiveDirectPrompt(
          contextPrefix,
          scenePreservationBlock,
          identityLockBlock,
          intensityInstruction,
          regeneratePreservationBlock,
          vision,
          visionContext
        )
      : [
          `${contextPrefix}${scenePreservationBlock} ${identityLockBlock} This is COMPREHENSIVE MODE.`,
          "Improve the photo with one realistic high-impact change.",
          intensityInstruction,
          "The result should feel like the same person in the same moment with one intentional improvement.",
          visionContext
        ].join(" ")
  };

  return promptByMode[mode];
}

function buildLightVisionContext(vision?: CoachLightVisionBrief) {
  if (!vision) {
    return "";
  }

  return [
    "Observed source:",
    `Subject visibility: ${vision.source.subject_visibility}.`,
    `Current pose: ${vision.source.pose}.`,
    `Current framing: ${vision.source.framing}.`,
    `Current camera view: ${vision.source.camera_view}.`,
    `Scene anchor: ${vision.source.scene_anchor}.`,
    `Lighting: ${vision.source.lighting}.`,
    vision.coaching_analysis?.critical_errors.length
      ? `Critical errors to fix: ${vision.coaching_analysis.critical_errors.join("; ")}.`
      : "",
    vision.coaching_analysis?.camera_composition_actions.length
      ? `Camera and composition actions: ${vision.coaching_analysis.camera_composition_actions.join("; ")}.`
      : "",
    vision.recommendation.primary_adjustment
      ? `Primary adjustment: ${vision.recommendation.primary_adjustment}.`
      : "",
    vision.recommendation.composition_technique
      ? `Composition technique: ${vision.recommendation.composition_technique}.`
      : "",
    vision.recommendation.frame_strategy ? `Frame strategy: ${vision.recommendation.frame_strategy}.` : "",
    vision.recommendation.pose_change_magnitude
      ? `Pose change magnitude: ${vision.recommendation.pose_change_magnitude}.`
      : "",
    `Preserve: ${vision.recommendation.preserve.join("; ")}.`,
    `Avoid: ${vision.recommendation.avoid.join("; ")}.`
  ]
    .filter(Boolean)
    .join(" ");
}

function buildDirectModeContext(preferences?: CoachPreferences) {
  if (!preferences?.sceneContext && !preferences?.editIntensity) {
    return "";
  }

  return [
    `User context (shooting context: ${formatSceneContext(preferences?.sceneContext)}).`,
    "Tailor framing and composition for this type of shot within the same visible scene.",
    `Edit intensity preference: ${formatIntensity(preferences?.editIntensity)}.`
  ].join(" ");
}

export function buildEditingToolPrompt(toolId: ToolId, instruction?: string) {
  const builder = toolPromptBuilders[toolId];
  if (builder) {
    return builder(instruction);
  }

  return [
    "Apply the requested edit while preserving identity, scene continuity, lighting consistency, and realism.",
    optionalInstruction(instruction)
  ]
    .filter(Boolean)
    .join("\n");
}

export function getImageEditQualityForTool(toolId: ToolId) {
  if (toolId === "ai_coach") {
    return "medium" as const;
  }

  if (toolId === "enhance_photo" || toolId === "upscale") {
    return "high" as const;
  }

  return "medium" as const;
}

export function shouldWrapWithConservativePrompt(toolId: ToolId, prompt: string) {
  const whitelist = new Set([
    "ai_coach",
    "enhance_photo",
    "better_composition",
    "light_color",
    "restore_color",
    "upscale",
    "background_boost",
    "expand_frame",
    "replace_background",
    "remove_object",
    "smooth_skin"
  ]);

  return !prompt.includes("Selected flow: Photo Recipes.") && !whitelist.has(toolId);
}

export const coachPhotoAnalysisSchemaExample: CoachPhotoAnalysisV2 = {
  schema_version: "2.0",
  photo_id: "source_photo",
  scene: {
    photo_type: "portrait",
    environment: "visible environment or unknown",
    background_description: "visible background only",
    weather_or_time_of_day: "visible condition or unknown",
    scene_mood: "natural mood or unknown"
  },
  subject: {
    subject_count: 1,
    pose_description: "visible pose only",
    expression_description: "visible expression only",
    outfit_description: "visible outfit only",
    identity_risk_level: "low",
    identity_risk_notes: "short notes"
  },
  composition: {
    quality_score: 0,
    notes: "specific composition assessment",
    safe_improvements: ["safe framing/crop/placement ideas"],
    avoid_changes: ["unsafe composition changes"]
  },
  lighting: {
    quality_score: 0,
    lighting_type: "visible light type or unknown",
    notes: "specific lighting assessment",
    preserve_rules: ["preserve existing light characteristics"]
  },
  pose: {
    quality_score: 0,
    notes: "specific pose assessment",
    safe_pose_refinements: ["minimal safe refinements"],
    unsafe_pose_changes: ["changes that should not be attempted"]
  },
  aesthetic: {
    overall_score: 0,
    notes: "short expert review",
    style_preservation: ["style/mood rules to preserve"]
  },
  scores: {
    composition_score: 0,
    lighting_score: 0,
    pose_score: 0,
    subject_separation_score: 0,
    naturalness_score: 0,
    social_media_score: 0,
    overall_aesthetic_score: 0
  },
  overall_assessment: "short expert review"
};

export const productionPhotoAnalysisSchemaExample: ProductionPhotoAnalysis = {
  schema_version: "1.0",
  photo_id: "source_photo",
  analysis_id: "uuid-or-short-id",
  scene: {
    photo_type: "portrait",
    environment: "visible environment or unknown",
    visible_subjects: "short visible subject description"
  },
  composition: {
    quality_score: 0,
    notes: "specific composition assessment"
  },
  lighting: {
    quality_score: 0,
    notes: "specific lighting assessment"
  },
  pose: {
    quality_score: 0,
    notes: "specific pose/expression assessment"
  },
  aesthetic: {
    overall_score: 0,
    notes: "short expert review"
  },
  scores: {
    composition_score: 0,
    lighting_score: 0,
    pose_score: 0,
    naturalness_score: 0,
    social_media_score: 0,
    overall_aesthetic_score: 0
  },
  overall_assessment: "short expert review of the current photo"
};

export const creativeDirectionSchemaExample: CreativeDirection = {
  title: "Clean Reference Portrait",
  concept: "Realistic reshoot-style improvement with identity and lighting preserved",
  composition: "specific crop/framing strategy",
  camera_angle: "specific camera/lens feel",
  changes: {
    pose: ["pose refinement"],
    lighting: ["minor lighting preservation/refinement"],
    composition: ["composition refinement"],
    style: ["natural color fidelity/depth refinement"]
  }
};

export const coachDirectionSchemaExample: CoachDirectionV2 = {
  id: "actionable_guidance",
  title: "Actionable Guidance",
  summary: "Take a step back, hold the camera at chest level, and keep your shoulders relaxed while turning slightly toward the light.",
  composition_change: "Shift the framing slightly wider and place the subject on the left third.",
  camera_distance_change: "Move half a step farther back for a more balanced medium shot.",
  subject_placement_change: "Keep a little negative space above the head and more room on the gaze side.",
  pose_refinement: "Straighten posture, relax the shoulders, and soften the elbows without changing hand position dramatically.",
  lighting_preservation: "Preserve the same light direction and color temperature.",
  edit_strength: "low",
  identity_risk: "low",
  prompt_builder_notes: ["avoid changing facial structure", "avoid changing expression"]
};

export const generationRecipeSchemaExample: GenerationRecipe = {
  direction_title: "Clean Reference Portrait",
  model: {
    provider: "openai",
    name: "gpt-image"
  },
  image_prompt: {
    positive_prompt: "production image-edit prompt",
    negative_prompt: "negative constraints"
  },
  evaluation_targets: {
    identity_preservation: 9,
    naturalness: 8,
    anatomy_score: 8,
    overall_score: 8
  }
};

export const qualityEvaluationSchemaExample: QualityEvaluationResult = {
  identity_preservation: 0,
  naturalness: 0,
  anatomy_score: 0,
  overall_score: 0,
  retry_required: false,
  retry_reason: "",
  recommended_action: "accept"
};
