import { z } from "zod";

export const imageSizeSchema = z.enum(["1024x1024", "1024x1536", "1536x1024", "auto"]);

export const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
  OPENAI_IMAGE_SIZE: imageSizeSchema.default("1024x1536"),
  OPENAI_IMAGE_EDIT_QUALITY: z.enum(["low", "medium", "high"]).default("medium"),
  AI_COACH_FLOW: z.string().default("v2"),
  ANALYSIS_PROVIDER: z.string().default("openai")
});

export function getEnv() {
  return envSchema.parse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL,
    OPENAI_IMAGE_SIZE: process.env.OPENAI_IMAGE_SIZE,
    OPENAI_IMAGE_EDIT_QUALITY: process.env.OPENAI_IMAGE_EDIT_QUALITY,
    AI_COACH_FLOW: process.env.AI_COACH_FLOW,
    ANALYSIS_PROVIDER: process.env.ANALYSIS_PROVIDER
  });
}
