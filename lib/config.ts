import { z } from "zod";

export const imageSizeSchema = z.enum(["1024x1024", "1024x1536", "1536x1024", "auto"]);

const booleanEnvSchema = z.preprocess((value) => {
  if (typeof value === "string") {
    return value.trim().toLowerCase() === "true";
  }
  return value;
}, z.boolean());

export const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_LIGHT_VISION_MODEL: z.string().default("gpt-4o"),
  OPENAI_PHOTOGRAPHY_COACH_MODEL: z.string().default("gpt-5.6-luna"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-2"),
  OPENAI_IMAGE_SIZE: imageSizeSchema.default("1024x1536"),
  OPENAI_IMAGE_EDIT_QUALITY: z.enum(["low", "medium", "high"]).default("medium"),
  OPENAI_COACH_VISUAL_QC_ENABLED: booleanEnvSchema.default(false),
  OPENAI_COACH_VISUAL_QC_MODEL: z.string().default("gpt-5.6-luna"),
  OPENAI_COACH_VISUAL_QC_THRESHOLD: z.coerce.number().int().min(0).max(100).default(85),
  OPENAI_COACH_VISUAL_QC_MAX_RETRIES: z.coerce.number().int().min(0).max(1).default(1),
  AI_COACH_FLOW: z.string().default("v2"),
  ANALYSIS_PROVIDER: z.string().default("openai"),
  FIREBASE_PROJECT_ID: z.string().min(1).optional(),
  FIREBASE_CLIENT_EMAIL: z.string().min(1).optional(),
  FIREBASE_PRIVATE_KEY: z.string().min(1).optional(),
  FIREBASE_AUTH_ENFORCED: z.coerce.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(20)
});

export function isGptImageModel(model: string) {
  return model.startsWith("gpt-image-");
}

export function getEnv() {
  return envSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_LIGHT_VISION_MODEL: process.env.OPENAI_LIGHT_VISION_MODEL,
    OPENAI_PHOTOGRAPHY_COACH_MODEL:
      process.env.OPENAI_PHOTOGRAPHY_COACH_MODEL ?? process.env.OPENAI_LIGHT_VISION_MODEL,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    OPENAI_IMAGE_SIZE: process.env.OPENAI_IMAGE_SIZE,
    OPENAI_IMAGE_EDIT_QUALITY: process.env.OPENAI_IMAGE_EDIT_QUALITY,
    OPENAI_COACH_VISUAL_QC_ENABLED: process.env.OPENAI_COACH_VISUAL_QC_ENABLED,
    OPENAI_COACH_VISUAL_QC_MODEL:
      process.env.OPENAI_COACH_VISUAL_QC_MODEL ?? process.env.OPENAI_PHOTOGRAPHY_COACH_MODEL,
    OPENAI_COACH_VISUAL_QC_THRESHOLD: process.env.OPENAI_COACH_VISUAL_QC_THRESHOLD,
    OPENAI_COACH_VISUAL_QC_MAX_RETRIES: process.env.OPENAI_COACH_VISUAL_QC_MAX_RETRIES,
    AI_COACH_FLOW: process.env.AI_COACH_FLOW,
    ANALYSIS_PROVIDER: process.env.ANALYSIS_PROVIDER,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    FIREBASE_AUTH_ENFORCED: process.env.FIREBASE_AUTH_ENFORCED,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS
  });
}
