import OpenAI from "openai";

import type {
  CoachPhotographyCoachResult,
  CoachReferenceFallbackReason,
  CoachReferenceRenderMode,
  CoachReferenceRenderPromptType
} from "@/lib/types";
import { wrapReferenceGenerationPrompt } from "@/lib/prompt-mapping";

export interface CoachReferenceRenderResult {
  generatedImageBase64: string | null;
  promptUsed: string;
  renderPromptType: CoachReferenceRenderPromptType;
  renderMode: CoachReferenceRenderMode;
  fallbackReason: CoachReferenceFallbackReason | null;
  moderationRetryCount: number;
}

export function resolveStep2RenderPrompt(coachResult?: CoachPhotographyCoachResult) {
  if (!coachResult?.safe_render_prompt?.trim()) {
    return null;
  }

  return wrapReferenceGenerationPrompt(coachResult.safe_render_prompt);
}

function resolveStep2Text2ImagePrompt(coachResult?: CoachPhotographyCoachResult) {
  return coachResult?.text2image_prompt?.trim() || null;
}

function isModerationError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: string }).code ?? "").toLowerCase()
      : "";

  return (
    code === "moderation_blocked" ||
    code === "content_policy_violation" ||
    message.includes("safety") ||
    message.includes("moderation") ||
    message.includes("content_policy")
  );
}

async function runImageEdit(params: {
  client: OpenAI;
  imageFile: File;
  prompt: string;
  model: string;
  size: string;
  quality: "low" | "medium" | "high";
  isGptImage: boolean;
}) {
  return params.client.images.edit(
    params.isGptImage
      ? {
          model: params.model,
          image: params.imageFile,
          prompt: params.prompt,
          size: params.size as "1024x1024" | "1024x1536" | "1536x1024" | "auto",
          quality: params.quality
        }
      : {
          model: params.model,
          image: params.imageFile,
          prompt: params.prompt,
          size: params.size as "1024x1024" | "1024x1536" | "1536x1024" | "auto",
          quality: params.quality,
          response_format: "b64_json" as const
        }
  );
}

async function runTextToImage(params: {
  client: OpenAI;
  prompt: string;
  model: string;
  size: string;
  quality: "low" | "medium" | "high";
  isGptImage: boolean;
}) {
  return params.client.images.generate(
    params.isGptImage
      ? {
          model: params.model,
          prompt: params.prompt,
          size: params.size as "1024x1024" | "1024x1536" | "1536x1024" | "auto",
          quality: params.quality
        }
      : {
          model: params.model,
          prompt: params.prompt,
          size: params.size as "1024x1024" | "1024x1536" | "1536x1024" | "auto",
          quality: params.quality,
          response_format: "b64_json" as const
        }
  );
}

export async function runLegacyCoachDirectImageEdit(params: {
  client: OpenAI;
  imageFile: File;
  prompt: string;
  model: string;
  size: string;
  quality: "low" | "medium" | "high";
  isGptImage: boolean;
}): Promise<CoachReferenceRenderResult> {
  const result = await runImageEdit({
    client: params.client,
    imageFile: params.imageFile,
    prompt: params.prompt,
    model: params.model,
    size: params.size,
    quality: params.quality,
    isGptImage: params.isGptImage
  });

  return {
    generatedImageBase64: result.data?.[0]?.b64_json ?? null,
    promptUsed: params.prompt,
    renderPromptType: "fallback_prompt",
    renderMode: "image_edit",
    fallbackReason: null,
    moderationRetryCount: 0
  };
}

export async function runCoachReferenceImageEdit(params: {
  client: OpenAI;
  imageFile: File;
  coachResult?: CoachPhotographyCoachResult;
  model: string;
  size: string;
  quality: "low" | "medium" | "high";
  isGptImage: boolean;
}): Promise<CoachReferenceRenderResult> {
  const editPrompt = resolveStep2RenderPrompt(params.coachResult);
  if (!editPrompt) {
    throw new Error("No safe_render_prompt available for Step 2.");
  }

  try {
    const result = await runImageEdit({
      client: params.client,
      imageFile: params.imageFile,
      prompt: editPrompt,
      model: params.model,
      size: params.size,
      quality: params.quality,
      isGptImage: params.isGptImage
    });

    return {
      generatedImageBase64: result.data?.[0]?.b64_json ?? null,
      promptUsed: editPrompt,
      renderPromptType: "safe_render_prompt",
      renderMode: "image_edit",
      fallbackReason: null,
      moderationRetryCount: 0
    };
  } catch (error) {
    if (!isModerationError(error)) {
      throw error;
    }

    const text2imagePrompt = resolveStep2Text2ImagePrompt(params.coachResult);
    if (!text2imagePrompt) {
      throw error;
    }

    console.warn("[coach-reference-render][text-to-image-fallback]", {
      render_mode: "text_to_image_fallback",
      fallback_reason: "image_edit_safety_rejection"
    });

    const fallbackResult = await runTextToImage({
      client: params.client,
      prompt: text2imagePrompt,
      model: params.model,
      size: params.size,
      quality: params.quality,
      isGptImage: params.isGptImage
    });

    return {
      generatedImageBase64: fallbackResult.data?.[0]?.b64_json ?? null,
      promptUsed: text2imagePrompt,
      renderPromptType: "text2image_prompt",
      renderMode: "text_to_image",
      fallbackReason: "image_edit_safety_rejection",
      moderationRetryCount: 1
    };
  }
}
