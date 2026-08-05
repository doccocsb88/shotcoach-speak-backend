import { getEnv } from "@/lib/config";
import { decodeBase64Image, toUint8Array } from "@/lib/images";
import { jsonError, jsonOk } from "@/lib/http";
import { getOpenAIClient } from "@/lib/openai";
import { withProtectedRoute } from "@/lib/protected-route";
import { buildPhotoRecipePrompt } from "@/lib/recipe-prompt";
import { extractResponseText, parseJsonFromResponseText } from "@/lib/response-parser";
import type { QualityEvaluationResult } from "@/lib/types";
import { recipeApplyBodySchema } from "@/lib/validation";
import { ZodError } from "zod";

export async function POST(request: Request) {
  return withProtectedRoute(request, "recipes-apply", async () => {
    try {
      const env = getEnv();
      const body = recipeApplyBodySchema.parse(await request.json());
      const imageBytes = await decodeBase64Image(body.imageBase64);
      const extension = body.mimeType === "image/png" ? "png" : body.mimeType === "image/webp" ? "webp" : "jpg";
      const imageFile = new File([toUint8Array(imageBytes)], `recipe-input.${extension}`, { type: body.mimeType });
      const prompt = buildPhotoRecipePrompt(body.recipe);

      const imageEditParams = {
        model: env.OPENAI_IMAGE_MODEL,
        image: imageFile,
        prompt,
        size: env.OPENAI_IMAGE_SIZE,
        quality: "medium" as const
      } as const;

      const result = await getOpenAIClient().images.edit(
        env.OPENAI_IMAGE_MODEL === "gpt-image-1"
          ? imageEditParams
          : { ...imageEditParams, response_format: "b64_json" }
      );

      const generatedImageBase64 = result.data?.[0]?.b64_json ?? null;
      let qualityEvaluation: QualityEvaluationResult | null = null;
      if (body.evaluateQuality && body.originalImageBase64 && body.selectedDirection && generatedImageBase64) {
        const evalResponse = await getOpenAIClient().responses.create({
          model: env.OPENAI_MODEL,
          input: [
            { role: "system", content: [{ type: "input_text", text: "You evaluate whether an image edit preserved identity, realism, and followed the selected direction. Return JSON only." }] },
            {
              role: "user",
              content: [
                { type: "input_text", text: `Evaluate the generated edit against the original photo and selected direction:
${JSON.stringify(body.selectedDirection)}` },
                { type: "input_image", image_url: `data:${body.mimeType};base64,${body.originalImageBase64}`, detail: "auto" },
                { type: "input_image", image_url: `data:image/png;base64,${generatedImageBase64}`, detail: "auto" }
              ]
            }
          ]
        });
        qualityEvaluation = parseJsonFromResponseText<QualityEvaluationResult>(extractResponseText(evalResponse));
      }

      return jsonOk({
        generatedImageBase64,
        model: env.OPENAI_IMAGE_MODEL,
        size: env.OPENAI_IMAGE_SIZE,
        toolId: "photo_recipe",
        promptUsed: prompt,
        qualityEvaluation
      });
    } catch (error) {
      if (error instanceof ZodError) return jsonError(400, "Invalid request body", error.flatten());
      return jsonError(500, "Recipe apply request failed", error instanceof Error ? error.message : error);
    }
  });
}
