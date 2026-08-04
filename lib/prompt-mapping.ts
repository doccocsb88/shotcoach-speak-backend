import type {
  CoachDirectionV2,
  CoachMode,
  CoachPhotoAnalysisV2,
  CoachPreferences,
  CreativeDirection,
  GenerationRecipe,
  ProductionPhotoAnalysis,
  QualityEvaluationResult,
  ToolId
} from "@/lib/types";

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
    "- Do not change facial structure, face shape, eye shape, nose shape, lips, jawline, cheeks, forehead, chin, age appearance, skin tone identity, hairstyle, hair color, body shape, or gender presentation.",
    "- Preserve the original expression identity.",
    "- Preserve the original clothing and accessories.",
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

export function buildDirectCoachPrompt(mode: CoachMode, preferences?: CoachPreferences) {
  const contextPrefix = buildDirectModeContext(preferences);
  const basePrefix =
    "Keep the person, identity, clothing, background, and lighting completely identical to the original image.";
  const intensityInstruction = directIntensityInstructions[mode][formatIntensity(preferences?.editIntensity)];

  const promptByMode: Record<CoachMode, string> = {
    composition: [
      `${contextPrefix}${basePrefix} Improve only the composition of this shot.`,
      "Pick one realistic composition improvement such as rule of thirds, centered composition, leading lines, symmetry, framing, negative space, fill the frame, diagonal lines, golden ratio, triangular composition, balance, depth, layering, S-curve, asymmetry, patterns, repetition, minimalism, or visual weight.",
      "Adjust crop and subject placement within the same scene.",
      intensityInstruction,
      "Do not change pose, outfit, face, background location, lighting, camera angle, or shot distance unless a small crop shift is needed.",
      `Composition reference: ${compositionReference}`
    ].join(" "),
    frame: [
      `${contextPrefix}${basePrefix} Adjust the zoom level, camera distance, and crop to show the ideal framing for this shot.`,
      intensityInstruction,
      "Keep the same person, pose, scene, and lighting."
    ].join(" "),
    angle: [
      `${contextPrefix}${basePrefix} Change only the camera angle and perspective to show the best angle for this shot.`,
      "Pick one realistic angle improvement such as eye level, high angle, low angle, bird's eye view, worm's eye view, ground level, 3/4 profile, side angle, back view, over-the-shoulder, dutch angle, tilt up, or tilt down.",
      intensityInstruction,
      "Do not change pose, outfit, face, background, lighting, or framing distance unless the angle change requires a tiny perspective shift.",
      `Angle reference: ${cameraAngleReference}`
    ].join(" "),
    pose: [
      `${contextPrefix}${basePrefix} Improve the subject's body posture and pose to be more aesthetically pleasing, natural, and confident, without changing their face or clothes.`,
      intensityInstruction,
      "Make the pose look professional."
    ].join(" "),
    comprehensive: [
      `${contextPrefix}${basePrefix} This is COMPREHENSIVE MODE.`,
      "Improve the photo by combining pose, composition, camera angle, and framing into one stronger result.",
      "Keep the same person, identity, face, hairstyle, clothing, background, location, and lighting.",
      "You may adjust the subject pose, camera viewpoint, subject placement in the frame, crop, and camera distance as needed to create a more flattering and intentional photo.",
      intensityInstruction,
      "Choose realistic improvements only.",
      "The result should feel like the same person in the same moment, just shot from a better position with a better pose and better framing."
    ].join(" ")
  };

  return promptByMode[mode];
}

function buildDirectModeContext(preferences?: CoachPreferences) {
  if (!preferences?.sceneContext && !preferences?.editIntensity) {
    return "";
  }

  return [
    `User context (shooting context: ${formatSceneContext(preferences?.sceneContext)}).`,
    "Tailor framing and composition for this type of shot within the same visible scene.",
    `Comprehensive intensity preference: ${formatIntensity(preferences?.editIntensity)}.`
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
    return "low" as const;
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
