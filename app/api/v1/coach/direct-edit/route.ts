import { getEnv, isGptImageModel } from "@/lib/config";
import { runCoachReferenceImageEdit, runLegacyCoachDirectImageEdit } from "@/lib/coach-image-render";
import { runCoachPhotographyCoach } from "@/lib/coach-photography-plan";
import { decodeBase64Image, toUint8Array } from "@/lib/images";
import { jsonError, jsonOk } from "@/lib/http";
import { getOpenAIClient } from "@/lib/openai";
import { getImageEditQualityForTool, resolveCoachEditPrompt } from "@/lib/prompt-mapping";
import { withProtectedRoute } from "@/lib/protected-route";
import { directEditBodySchema } from "@/lib/validation";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  return withProtectedRoute(request, "coach-direct-edit", async () => {
    try {
      const env = getEnv();
      const body = directEditBodySchema.parse(await request.json());
      const imageBytes = await decodeBase64Image(body.imageBase64);
      const extension = body.mimeType === "image/png" ? "png" : body.mimeType === "image/webp" ? "webp" : "jpg";
      const imageFile = new File([toUint8Array(imageBytes)], `coach-input.${extension}`, {
        type: body.mimeType
      });

      let coachUsed = false;
      let coachLatencyMs = 0;
      let coachResult;
      let validation;

      const coachStartedAt = Date.now();
      try {
        const coachResponse = await runCoachPhotographyCoach({
          image: imageBytes,
          mode: body.coachMode,
          preferences: body.coachPreferences
        });
        const { validation: coachValidation, ...coachPayload } = coachResponse;
        coachResult = coachPayload;
        validation = coachValidation;
        coachUsed = true;
        coachLatencyMs = Date.now() - coachStartedAt;
      } catch (coachError) {
        coachLatencyMs = Date.now() - coachStartedAt;
        console.warn("[coach-direct-edit][photography-coach-fallback]", {
          coachMode: body.coachMode,
          coachLatencyMs,
          error: coachError instanceof Error ? coachError.message : coachError
        });
      }

      const imageEditStartedAt = Date.now();
      let generatedImageBase64: string | null = null;
      let promptUsed = resolveCoachEditPrompt(body.coachMode, body.coachPreferences, coachResult);
      let renderPromptType = coachResult?.safe_render_prompt ? "safe_render_prompt" : "fallback_prompt";
      let moderationRetryCount = 0;
      let imageEditError: string | null = null;

      if (coachResult) {
        try {
          const renderResult = await runCoachReferenceImageEdit({
            client: getOpenAIClient(),
            imageFile,
            coachResult,
            model: env.OPENAI_IMAGE_MODEL,
            size: env.OPENAI_IMAGE_SIZE,
            quality: getImageEditQualityForTool("ai_coach"),
            isGptImage: isGptImageModel(env.OPENAI_IMAGE_MODEL)
          });
          generatedImageBase64 = renderResult.generatedImageBase64;
          promptUsed = renderResult.promptUsed;
          renderPromptType = renderResult.renderPromptType;
          moderationRetryCount = renderResult.moderationRetryCount;

          if (renderResult.fallbackReason) {
            console.info("[coach-direct-edit][render-fallback]", {
              render_mode: renderResult.renderMode === "text_to_image" ? "text_to_image_fallback" : renderResult.renderMode,
              fallback_reason: renderResult.fallbackReason,
              render_prompt_type: renderResult.renderPromptType
            });
          }
        } catch (error) {
          imageEditError = error instanceof Error ? error.message : String(error);
        }
      }

      if (!generatedImageBase64) {
        try {
          const legacyResult = await runLegacyCoachDirectImageEdit({
            client: getOpenAIClient(),
            imageFile,
            prompt: promptUsed,
            model: env.OPENAI_IMAGE_MODEL,
            size: env.OPENAI_IMAGE_SIZE,
            quality: getImageEditQualityForTool("ai_coach"),
            isGptImage: isGptImageModel(env.OPENAI_IMAGE_MODEL)
          });
          generatedImageBase64 = legacyResult.generatedImageBase64;
          promptUsed = legacyResult.promptUsed;
          renderPromptType = legacyResult.renderPromptType;
          moderationRetryCount = legacyResult.moderationRetryCount;

          if (!coachUsed) {
            console.info("[coach-direct-edit][legacy-direct-edit-fallback]", {
              coachMode: body.coachMode,
              render_prompt_type: renderPromptType
            });
          }
        } catch (error) {
          imageEditError = error instanceof Error ? error.message : String(error);
        }
      }

      const imageEditLatencyMs = Date.now() - imageEditStartedAt;

      return jsonOk({
        generatedImageBase64,
        promptUsed,
        renderPromptType,
        moderationRetryCount,
        imageEditError,
        model: env.OPENAI_IMAGE_MODEL,
        size: env.OPENAI_IMAGE_SIZE,
        coachUsed,
        coachLatencyMs,
        imageEditLatencyMs,
        coachResult: coachResult ?? null,
        validation: validation ?? null,
        shotType: coachResult?.opportunity.shot_type ?? null,
        userTips: coachResult?.user_tips ?? [],
        assessment: coachResult?.assessment ?? null,
        opportunity: coachResult?.opportunity ?? null,
        shotPlan: coachResult?.shot_plan ?? null,
        generationPrompt: coachResult?.generation_prompt ?? null,
        safeRenderPrompt: coachResult?.safe_render_prompt ?? null,
        text2imagePrompt: coachResult?.text2image_prompt ?? null,
        visionUsed: coachUsed,
        visionLatencyMs: coachLatencyMs,
        photographyPlan: coachResult ?? null,
        visionBrief: coachResult ?? null
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonError(400, "Invalid request body", error.flatten());
      }

      return jsonError(500, "Direct edit request failed", error instanceof Error ? error.message : error);
    }
  });
}
