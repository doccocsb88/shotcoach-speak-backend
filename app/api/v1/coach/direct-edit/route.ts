import { getEnv } from "@/lib/config";
import { decodeBase64Image, toUint8Array } from "@/lib/images";
import { jsonError, jsonOk } from "@/lib/http";
import { getOpenAIClient } from "@/lib/openai";
import { buildDirectCoachPrompt, getImageEditQualityForTool } from "@/lib/prompt-mapping";
import { directEditBodySchema } from "@/lib/validation";
import { ZodError } from "zod";

export async function POST(request: Request) {
  try {
    const env = getEnv();
    const body = directEditBodySchema.parse(await request.json());
    const imageBytes = await decodeBase64Image(body.imageBase64);
    const extension = body.mimeType === "image/png" ? "png" : body.mimeType === "image/webp" ? "webp" : "jpg";
    const imageFile = new File([toUint8Array(imageBytes)], `coach-input.${extension}`, {
      type: body.mimeType
    });
    const prompt = buildDirectCoachPrompt(body.coachMode, body.coachPreferences);

    const result = await getOpenAIClient().images.edit({
      model: env.OPENAI_IMAGE_MODEL,
      image: imageFile,
      prompt,
      size: env.OPENAI_IMAGE_SIZE,
      quality: getImageEditQualityForTool("ai_coach"),
      response_format: "b64_json"
    });
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
}
