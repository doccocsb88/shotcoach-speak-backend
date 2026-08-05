import { getEnv, isGptImageModel } from "@/lib/config";
import { decodeBase64Image, toUint8Array } from "@/lib/images";
import { jsonError, jsonOk } from "@/lib/http";
import { getOpenAIClient } from "@/lib/openai";
import {
  buildConservativeImageEditPrompt,
  getImageEditQualityForTool,
  shouldWrapWithConservativePrompt
} from "@/lib/prompt-mapping";
import { buildQualityEvaluationPrompt } from "@/lib/prompt-mapping";
import { withProtectedRoute } from "@/lib/protected-route";
import { extractResponseText, parseJsonFromResponseText } from "@/lib/response-parser";
import type { QualityEvaluationResult } from "@/lib/types";
import { imageEditBodySchema } from "@/lib/validation";
import { ZodError } from "zod";

export async function POST(request: Request) {
  return withProtectedRoute(request, "images-edit", async () => {
    try {
      const env = getEnv();
      const body = imageEditBodySchema.parse(await request.json());
      const imageBytes = await decodeBase64Image(body.imageBase64);
      const extension = body.mimeType === "image/png" ? "png" : body.mimeType === "image/webp" ? "webp" : "jpg";
      const imageFile = new File([toUint8Array(imageBytes)], `edit-input.${extension}`, {
        type: body.mimeType
      });
      const effectivePrompt = shouldWrapWithConservativePrompt(body.toolId, body.prompt)
        ? buildConservativeImageEditPrompt(body.prompt)
        : body.prompt;

      const imageEditParams = {
        model: env.OPENAI_IMAGE_MODEL,
        image: imageFile,
        prompt: effectivePrompt,
        size: env.OPENAI_IMAGE_SIZE,
        quality: getImageEditQualityForTool(body.toolId)
      } as const;

      const result = await getOpenAIClient().images.edit(
        isGptImageModel(env.OPENAI_IMAGE_MODEL)
          ? imageEditParams
          : {
              ...imageEditParams,
              response_format: "b64_json"
            }
      );
      const generatedImageBase64 = result.data?.[0]?.b64_json ?? null;

      let qualityEvaluation: QualityEvaluationResult | null = null;
      if (body.evaluateQuality && body.originalImageBase64 && body.selectedDirection && generatedImageBase64) {
        const evaluationPrompt = buildQualityEvaluationPrompt(JSON.stringify(body.selectedDirection));
        const evalResponse = await getOpenAIClient().responses.create({
          model: env.OPENAI_MODEL,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: evaluationPrompt.system }]
            },
            {
              role: "user",
              content: [
                { type: "input_text", text: evaluationPrompt.user },
                {
                  type: "input_image",
                  image_url: `data:${body.mimeType};base64,${body.originalImageBase64}`,
                  detail: "auto"
                },
                {
                  type: "input_image",
                  image_url: `data:image/png;base64,${generatedImageBase64}`,
                  detail: "auto"
                }
              ]
            }
          ]
        });

        qualityEvaluation = parseJsonFromResponseText<QualityEvaluationResult>(
          extractResponseText(evalResponse)
        );
      }

      return jsonOk({
        generatedImageBase64,
        model: env.OPENAI_IMAGE_MODEL,
        size: env.OPENAI_IMAGE_SIZE,
        toolId: body.toolId,
        promptUsed: effectivePrompt,
        qualityEvaluation
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonError(400, "Invalid request body", error.flatten());
      }

      return jsonError(500, "Image edit request failed", error instanceof Error ? error.message : error);
    }
  });
}
