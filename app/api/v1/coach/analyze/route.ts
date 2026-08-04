import { runAnalyzeFlow } from "@/lib/analysis";
import { jsonError, jsonOk } from "@/lib/http";
import { analyzeBodySchema } from "@/lib/validation";
import { ZodError } from "zod";

export async function POST(request: Request) {
  try {
    const body = analyzeBodySchema.parse(await request.json());
    const result = await runAnalyzeFlow({
      imageBase64: body.imageBase64,
      coachMode: body.coachMode,
      coachPreferences: body.coachPreferences,
      flowVersion: body.flowVersion,
      originalImageUri: body.originalImageUri,
      originalImageMimeType: body.originalImageMimeType
    });

    return jsonOk(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(400, "Invalid request body", error.flatten());
    }

    return jsonError(500, "Analyze request failed", error instanceof Error ? error.message : error);
  }
}
