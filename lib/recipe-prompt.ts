import type { PhotoRecipePayload } from "@/lib/types";

function translateRecipeParameters(parameters: NonNullable<PhotoRecipePayload["recipeParameters"]>) {
  return {
    highlightIntent: translateHighlight(parameters.highlight),
    shadowIntent: translateShadow(parameters.shadow),
    colorIntent: translateColor(parameters.color),
    sharpnessIntent: translateSharpness(parameters.sharpness),
    clarityIntent: translateClarity(parameters.clarity)
  };
}

function translateHighlight(value: number) {
  if (value <= -2) return "Recover bright area details, reduce highlight clipping, and preserve sky texture.";
  if (value === -1) return "Use slightly softer highlights while maintaining cloud and bright-area detail.";
  if (value === 1) return "Use gently brighter highlights without clipping.";
  if (value >= 2) return "Create luminous bright areas while preserving realistic highlight detail.";
  return "Keep neutral highlight rendering.";
}

function translateShadow(value: number) {
  if (value <= -2) return "Use deeper shadows and stronger contrast while preserving important detail.";
  if (value === -1) return "Use slightly deeper shadows with natural depth.";
  if (value === 1) return "Lift dark regions slightly while maintaining depth.";
  if (value >= 2) return "Reveal shadow detail while maintaining depth and realism.";
  return "Keep neutral shadow rendering.";
}

function translateColor(value: number) {
  if (value <= -2) return "Use muted colors and film-like desaturation.";
  if (value === -1) return "Use a subtle restrained color palette.";
  if (value === 1) return "Use slightly richer colors with natural saturation.";
  if (value >= 2) return "Use vibrant but realistic colors without oversaturation.";
  return "Keep natural color rendering.";
}

function translateSharpness(value: number) {
  if (value <= -2) return "Use soft image rendering without losing important detail.";
  if (value >= 2) return "Enhance edge definition naturally and avoid oversharpening.";
  return "Keep natural sharpness.";
}

function translateClarity(value: number) {
  if (value <= -2) return "Use soft atmospheric rendering with gentle local contrast.";
  if (value === -1) return "Use slightly softened local contrast for a smoother film feel.";
  if (value === 1) return "Use mild texture separation and balanced local contrast.";
  if (value >= 2) return "Use enhanced texture separation while avoiding harsh HDR effects.";
  return "Keep balanced local contrast.";
}

function getFilmSimulationTranslation(simulation: string): string[] {
  const lower = simulation.toLowerCase();
  if (lower.includes("classic chrome")) {
    return [
      "Slightly muted colors",
      "Documentary film rendering",
      "Natural skin tones",
      "Controlled reds",
      "Calm blues",
      "Slightly subdued greens"
    ];
  }
  if (lower.includes("classic neg")) {
    return [
      "High contrast and deep shadows",
      "Nostalgic color reproduction",
      "Hard tones with distinct colors",
      "Rich cinematic feel"
    ];
  }
  if (lower.includes("nostalgic neg")) {
    return [
      "Soft and amber-tinted highlights",
      "Rich shadow detail",
      "Retro pop color look",
      "Warm and gentle nostalgic feel"
    ];
  }
  if (lower.includes("astia")) {
    return ["Soft colors with smooth skin tones", "Gentle contrast", "Vibrant but not overpowering"];
  }
  if (lower.includes("velvia")) {
    return ["High saturation and high contrast", "Vivid landscape colors", "Deep blues and rich greens"];
  }
  return ["Replicate the requested film simulation color science"];
}

function getWBTranslation(wb: NonNullable<PhotoRecipePayload["whiteBalance"]> | undefined): string[] {
  if (!wb) return ["Neutral color balance"];

  const translations: string[] = [];
  if (wb.redShift > 0 && wb.blueShift < 0) {
    translations.push("Warm and golden color balance");
  } else if (wb.redShift < 0 && wb.blueShift > 0) {
    translations.push("Cooler and cleaner color balance");
  } else if (wb.redShift < 0 && wb.blueShift < 0) {
    translations.push("Slightly cyan/green shifted balance");
  } else {
    translations.push("Neutral color balance adjustment");
  }

  if (wb.mode.toLowerCase().includes("fluorescent")) {
    translations.push("Compensate for artificial lighting or add creative vintage cast");
  }

  return translations;
}

function getColorChromeTranslation(strength?: string): string[] {
  const s = (strength || "Off").toLowerCase();
  if (s === "strong") return ["Rich color depth", "Strong separation between similar colors", "No HDR appearance"];
  if (s === "weak") return ["Slightly richer color depth", "Better separation between similar colors", "No HDR appearance"];
  return ["Natural color depth"];
}

function getColorChromeFXBlueTranslation(strength?: string): string[] {
  const s = (strength || "Off").toLowerCase();
  if (s === "strong") return ["Deep blue tones", "Strongly controlled ocean and sky rendering", "No artificial saturation"];
  if (s === "weak") return ["Slightly deeper blue tones", "Controlled ocean and sky rendering", "No artificial saturation"];
  return ["Natural sky and water rendering"];
}

function getDRTranslation(dr?: string): string[] {
  const s = (dr || "DR100").toUpperCase();
  if (s.includes("400")) return ["Strong highlight protection", "Preserve bright sky detail", "Preserve water texture", "Maintain wide tonal range"];
  if (s.includes("200")) return ["Moderate highlight protection", "Preserve bright areas"];
  if (s.includes("AUTO")) return ["Balanced dynamic range for the scene"];
  return ["Standard dynamic range", "Natural highlight clipping"];
}

function getValueTranslation(
  label: string,
  value: number | undefined,
  negative: string[],
  positive: string[],
  neutral: string[]
): string {
  if (value === undefined) return "";
  const lines = value < 0 ? negative : value > 0 ? positive : neutral;
  const prefix = `${label} ${value > 0 ? "+" : ""}${value}:`;
  return [prefix, ...lines.map((line) => `- ${line}`), ""].join("\n");
}

function buildParameterTranslation(recipe: PhotoRecipePayload): string {
  let output = "";
  const sim = recipe.filmSimulation || "Standard";
  output += `${sim}:\n${getFilmSimulationTranslation(sim).map((t) => `- ${t}`).join("\n")}\n\n`;

  if (recipe.whiteBalance) {
    output += `WB Shift Red ${recipe.whiteBalance.redShift} Blue ${recipe.whiteBalance.blueShift}:\n${getWBTranslation(recipe.whiteBalance)
      .map((t) => `- ${t}`)
      .join("\n")}\n\n`;
  }

  if (recipe.colorChromeEffect) {
    output += `Color Chrome Effect ${recipe.colorChromeEffect}:\n${getColorChromeTranslation(recipe.colorChromeEffect)
      .map((t) => `- ${t}`)
      .join("\n")}\n\n`;
  }

  if (recipe.colorChromeFXBlue) {
    output += `Color Chrome FX Blue ${recipe.colorChromeFXBlue}:\n${getColorChromeFXBlueTranslation(recipe.colorChromeFXBlue)
      .map((t) => `- ${t}`)
      .join("\n")}\n\n`;
  }

  if (recipe.dynamicRange) {
    output += `${recipe.dynamicRange}:\n${getDRTranslation(recipe.dynamicRange).map((t) => `- ${t}`).join("\n")}\n\n`;
  }

  output += getValueTranslation(
    "Highlight",
    recipe.highlight,
    ["Softer highlight rolloff", "Reduced clipping", "More film-like bright areas"],
    ["Harder highlights", "More punch in bright areas"],
    ["Standard highlight rendering"]
  );
  output += getValueTranslation(
    "Shadow",
    recipe.shadow,
    ["Open shadows slightly", "Preserve detail in dark regions", "Avoid crushed blacks"],
    ["Deeper shadows", "Higher contrast in dark areas", "More dramatic film look"],
    ["Standard shadow rendering"]
  );
  output += getValueTranslation(
    "Color",
    recipe.color,
    ["Desaturated, muted colors", "Vintage faded look"],
    ["Slightly richer colors", "Still realistic", "No digital oversaturation"],
    ["Standard color saturation"]
  );
  output += getValueTranslation(
    "Sharpness",
    recipe.sharpness,
    ["Softer details", "More organic vintage feel", "Reduced digital sharpness"],
    ["Mild natural detail enhancement", "No oversharpening"],
    ["Natural lens sharpness"]
  );
  output += getValueTranslation(
    "High ISO Noise Reduction",
    recipe.noiseReduction,
    ["Preserve natural texture", "Avoid digital smoothing"],
    ["Smoother images", "Reduced noise"],
    ["Standard noise rendering"]
  );
  output += getValueTranslation(
    "Clarity",
    recipe.clarity,
    ["Softened micro-contrast", "Dreamy bloom-like effect in highlights"],
    ["Enhanced micro-contrast", "Punchy textures"],
    ["Keep original lens rendering", "Avoid excessive micro-contrast"]
  );

  if (recipe.grain) {
    const grainLabel = !recipe.grain.enabled ? "Off" : `${recipe.grain.strength} ${recipe.grain.size}`;
    const grainLines = !recipe.grain.enabled
      ? ["Clean digital output"]
      : [`Add ${recipe.grain.size.toLowerCase()}, ${recipe.grain.strength.toLowerCase()} film grain`, "Organic texture"];
    output += `Grain ${grainLabel}:\n${grainLines.map((line) => `- ${line}`).join("\n")}\n\n`;
  }

  return output.trim();
}

export function buildPhotoRecipePrompt(recipe: PhotoRecipePayload): string {
  if (recipe.recipeParameters && recipe.promptPreset) {
    const visualIntent = translateRecipeParameters(recipe.recipeParameters);
    const recipeTitle = recipe.title || recipe.name || "Photo Recipe";

    return `Selected flow: Photo Recipes.

Edit the uploaded photo using the selected Photo Recipe: ${recipeTitle}.

The uploaded image is the source of truth.

Task:
Apply a non-destructive realistic photo color grade only.
Do not reconstruct, repaint, regenerate, retouch, or reinterpret the image content.

Preservation priority:
1. Preserve the exact same person, identity, face, age appearance, skin tone identity, body shape, pose, hairstyle, clothing, and accessories.
2. Preserve the exact same camera angle, perspective, crop, framing, and composition.
3. Preserve the exact same background layout, objects, location, weather, time of day, and scene geometry.
4. Apply only the selected recipe look through color, tone, contrast, grain, and mood.

Recipe:
- Name: ${recipeTitle}
- Film simulation reference: ${recipe.recipeParameters.filmSimulation}
- Mood: ${recipe.promptPreset.mood}
- Palette: ${recipe.promptPreset.colorPalette}
- Lighting: ${recipe.promptPreset.lighting}
- Contrast: ${recipe.promptPreset.contrast}
- Saturation: ${recipe.promptPreset.saturation}
- Grain: ${recipe.promptPreset.grainDescription}
- White balance: ${recipe.recipeParameters.whiteBalance}
- Dynamic range: ${recipe.recipeParameters.dynamicRange}

Recipe strength:
Subtle to medium, around 35–45%.
Skin tone protection: high.
Geometry preservation: absolute.

Allowed:
- ${visualIntent.highlightIntent}
- ${visualIntent.shadowIntent}
- ${visualIntent.colorIntent}
- ${visualIntent.sharpnessIntent}
- ${visualIntent.clarityIntent}
- Realistic color palette shift based on the recipe
- Fine film-like grain if requested

Not allowed:
- Do not change identity, face, body, pose, outfit, hairstyle, accessories, background, objects, crop, perspective, weather, or time of day.
- Do not add new water, sky, clouds, objects, people, sunlight, or fantasy elements.
- Do not apply beauty retouching, makeup, plastic skin, HDR, heavy teal grading, fake tropical colors, over-saturation, cyberpunk colors, anime, illustration, painting, or CGI.
- ${recipe.promptPreset.negativePrompt}

Output:
Return the same original photo with only a realistic ${recipeTitle} recipe color grade applied.`.trim();
  }

  const recipeName = recipe.name || recipe.title || "Unknown Recipe";
  const translation = buildParameterTranslation(recipe);

  return `Selected flow: Photo Recipes.

Edit the uploaded photo using the selected Photo Recipe: ${recipeName}.

The uploaded image is the source of truth.

Task:
Apply a realistic Fujifilm-style color grade only.
Treat this edit as if the image had originally been captured using the following Fujifilm recipe settings.
Do not reconstruct, repaint, regenerate, retouch, or reinterpret image content.
Preserve the original photograph completely.

Preservation Priority:
1. Preserve identity.
2. Preserve clothing.
3. Preserve hairstyle and accessories.
4. Preserve body shape and facial features.
5. Preserve pose.
6. Preserve camera angle and perspective.
7. Preserve environment and composition.
8. Apply only the recipe rendering.

Fujifilm Recipe:

Film Simulation:
${recipe.filmSimulation || "Standard"}

White Balance:
${recipe.whiteBalance ? recipe.whiteBalance.mode : "Auto"}

WB Shift:
Red ${recipe.whiteBalance ? recipe.whiteBalance.redShift : 0}
Blue ${recipe.whiteBalance ? recipe.whiteBalance.blueShift : 0}

Color Chrome Effect:
${recipe.colorChromeEffect || "Off"}

Color Chrome FX Blue:
${recipe.colorChromeFXBlue || "Off"}

Dynamic Range:
${recipe.dynamicRange || "DR100"}

Highlight:
${recipe.highlight ?? 0}

Shadow:
${recipe.shadow ?? 0}

Color:
${(recipe.color ?? 0) > 0 ? "+" : ""}${recipe.color ?? 0}

Sharpness:
${(recipe.sharpness ?? 0) > 0 ? "+" : ""}${recipe.sharpness ?? 0}

High ISO Noise Reduction:
${recipe.noiseReduction ?? 0}

Clarity:
${recipe.clarity ?? 0}

Grain:
${recipe.grain && recipe.grain.enabled ? recipe.grain.strength + " " + recipe.grain.size : "Off"}

Parameter Translation:

${translation}

Allowed:
- Color grading
- Tonal adjustment
- Highlight recovery
- Shadow balancing
- Color separation
- Dynamic range adjustment
- Mild sharpness tuning

Not Allowed:
- Change identity
- Change face
- Change body shape
- Change clothing
- Change hairstyle
- Change pose
- Change crop
- Change framing
- Change perspective
- Change environment
- Add or remove objects
- Change weather
- Change time of day
- Beauty retouching
- Skin smoothing
- Makeup effects
- HDR effects
- Cinematic relighting
- Artificial sun rays
- Anime
- Illustration
- CGI

Recipe-specific Restrictions:

Do not create:
- Teal-orange grading
- Travel influencer look
- HDR landscape look
- Modern digital color science
- Vibrant tropical colors
- Heavy blue enhancement

Output:
Return the exact same photograph rendered as if it had originally been captured using the ${recipeName} Fujifilm recipe settings above.`.trim();
}
