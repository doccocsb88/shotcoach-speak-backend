import { z } from "zod";

export const coachPreferencesSchema = z
  .object({
    gender: z.enum(["female", "male", "non_binary"]).optional(),
    ageRange: z
      .enum(["under_18", "18_24", "25_34", "35_44", "45_plus"])
      .optional(),
    sceneContext: z
      .enum([
        "travel",
        "street",
        "cafe",
        "beach",
        "nature",
        "urban_night",
        "indoor",
        "restaurant",
        "landmark"
      ])
      .optional(),
    editIntensity: z.enum(["safe", "balanced", "aggressive"]).optional()
  })
  .partial();

export const analyzeBodySchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  toolId: z.string().default("ai_coach"),
  coachMode: z
    .enum(["composition", "frame", "angle", "pose", "comprehensive"])
    .default("comprehensive"),
  coachPreferences: coachPreferencesSchema.default({}),
  flowVersion: z.enum(["v1", "v2"]).default("v2"),
  originalImageUri: z.string().default("source_photo"),
  originalImageMimeType: z.string().optional()
});

export const directEditBodySchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  coachMode: z
    .enum(["composition", "frame", "angle", "pose", "comprehensive"])
    .default("composition"),
  coachPreferences: coachPreferencesSchema.default({})
});

export const imageEditBodySchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  prompt: z.string().min(1),
  toolId: z.string().default("ai_coach"),
  evaluateQuality: z.boolean().default(false),
  selectedDirection: z.unknown().optional(),
  originalImageBase64: z.string().optional()
});


const editingToolIdSchema = z.enum([
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

const whiteBalancePayloadSchema = z.object({
  mode: z.string(),
  redShift: z.number(),
  blueShift: z.number()
});

const grainPayloadSchema = z.object({
  enabled: z.boolean(),
  size: z.string(),
  strength: z.string()
});

const recipeParametersPayloadSchema = z.object({
  filmSimulation: z.string(),
  highlight: z.number(),
  shadow: z.number(),
  color: z.number(),
  sharpness: z.number(),
  clarity: z.number(),
  grain: z.string(),
  dynamicRange: z.string(),
  whiteBalance: z.string()
});

const promptPresetPayloadSchema = z.object({
  mood: z.string(),
  colorPalette: z.string(),
  lighting: z.string(),
  contrast: z.string(),
  saturation: z.string(),
  grainDescription: z.string(),
  negativePrompt: z.string()
});

export const photoRecipePayloadSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  recipeParameters: recipeParametersPayloadSchema.optional(),
  promptPreset: promptPresetPayloadSchema.optional(),
  filmSimulation: z.string().optional(),
  whiteBalance: whiteBalancePayloadSchema.optional(),
  dynamicRange: z.string().optional(),
  grain: grainPayloadSchema.optional(),
  colorChromeEffect: z.string().optional(),
  colorChromeFXBlue: z.string().optional(),
  highlight: z.number().optional(),
  shadow: z.number().optional(),
  color: z.number().optional(),
  sharpness: z.number().optional(),
  noiseReduction: z.number().optional(),
  clarity: z.number().optional(),
  exposureCompensation: z.string().optional(),
  mood: z.string().optional(),
  recommendedFor: z.array(z.string()).optional()
});

export const toolEditBodySchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  toolId: editingToolIdSchema,
  instruction: z.string().optional(),
  evaluateQuality: z.boolean().default(false),
  selectedDirection: z.unknown().optional(),
  originalImageBase64: z.string().optional()
});

export const recipeApplyBodySchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/jpeg"),
  recipe: photoRecipePayloadSchema,
  evaluateQuality: z.boolean().default(false),
  selectedDirection: z.unknown().optional(),
  originalImageBase64: z.string().optional()
});
