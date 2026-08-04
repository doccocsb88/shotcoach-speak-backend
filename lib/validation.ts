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
