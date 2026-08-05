import { getEnv } from "@/lib/config";
import { decodeBase64Image, toUint8Array } from "@/lib/images";
import { jsonError, jsonOk } from "@/lib/http";
import { getOpenAIClient } from "@/lib/openai";
import { buildDirectCoachPrompt, getImageEditQualityForTool } from "@/lib/prompt-mapping";
import { withProtectedRoute } from "@/lib/protected-route";
import { directEditBodySchema } from "@/lib/validation";
import { ZodError } from "zod";

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
      const prompt = buildDirectCoachPrompt(body.coachMode, body.coachPreferences);

      const imageEditParams = {
        model: env.OPENAI_IMAGE_MODEL,
        image: imageFile,
        prompt,
        size: env.OPENAI_IMAGE_SIZE,
        quality: getImageEditQualityForTool("ai_coach")
      } as const;

      const result = await getOpenAIClient().images.edit(
        env.OPENAI_IMAGE_MODEL === "gpt-image-1"
          ? imageEditParams
          : {
              ...imageEditParams,
              response_format: "b64_json"
            }
      );
      const generatedImageBase64 = result.data?.[0]?.b64_json ?? null;

      return jsonOk({
        generatedImageBase64,
        promptUsed: prompt,
        model: env.OPENAI_IMAGE_MODEL,
        size: env.OPENAI_IMAGE_SIZE
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return jsonError(400, "Invalid request body", error.flatten());
      }

      return jsonError(500, "Direct edit request failed", error instanceof Error ? error.message : error);
    }
  });
}
