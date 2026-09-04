import { z } from "zod";
import OpenAI from "openai";

import { capturePlanSummary } from "@/lib/coach-capture-plan";
import { getEnv } from "@/lib/config";
import { parseJsonFromResponseText } from "@/lib/response-parser";
import type {
  CoachPhotographyCoachResult,
  CoachReferenceVisualQcScores,
  CoachReferenceVisualQcResult
} from "@/lib/types";

const QC_TIMEOUT_MS = 45_000;
export const COACH_MIN_CAPTURE_PLAN_ADHERENCE = 20;

const visualQcResponseSchema = z.object({
  scores: z.object({
    retake_feasibility: z.number(),
    capture_plan_adherence: z.number(),
    preservation: z.number(),
    photographic_improvement: z.number(),
    anatomy_and_artifacts: z.number()
  }),
  hard_failures: z.array(z.string()).default([]),
  largest_mismatch: z.string().nullable().default(null),
  retry_instruction: z.string().nullable().default(null),
  notes: z.array(z.string()).default([])
});

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

export function coachReferenceVisualQcPassed(
  scores: CoachReferenceVisualQcScores,
  hardFailures: string[],
  totalThreshold: number
) {
  const totalScore = Object.values(scores).reduce((total, score) => total + score, 0);
  return (
    hardFailures.length === 0 &&
    scores.capture_plan_adherence >= COACH_MIN_CAPTURE_PLAN_ADHERENCE &&
    totalScore >= totalThreshold
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Coach visual QC timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

export async function runCoachReferenceVisualQc(params: {
  client: OpenAI;
  sourceImage: Buffer;
  sourceMimeType: string;
  generatedImageBase64: string;
  coachResult: CoachPhotographyCoachResult;
}): Promise<CoachReferenceVisualQcResult> {
  const env = getEnv();
  const sourceDataUrl = `data:${params.sourceMimeType};base64,${params.sourceImage.toString("base64")}`;
  const generatedDataUrl = `data:image/png;base64,${params.generatedImageBase64}`;

  const response = await withTimeout(
    params.client.chat.completions.create({
      model: env.OPENAI_COACH_VISUAL_QC_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "You are a strict photography-reference QC judge.",
            "The generated image is a visual guide for a real user to retake a photo with a smartphone; it is not judged as a final AI artwork.",
            "Compare the source, capture plan, and generated reference. Do not reward beauty when it violates the plan or becomes difficult to reproduce.",
            "Score retake_feasibility 0-25, capture_plan_adherence 0-25, preservation 0-20, photographic_improvement 0-20, anatomy_and_artifacts 0-10.",
            `A production-ready reference needs capture_plan_adherence of at least ${COACH_MIN_CAPTURE_PLAN_ADHERENCE}/25. A visibly wrong crop, viewpoint, subject direction, or placement is not a minor issue when the capture plan explicitly requested it.`,
            "Hard failures: changed location or lighting character, clear identity drift, impossible pose/contact, or failure to demonstrate the primary change.",
            "If correction is needed, retry_instruction must name only the single largest visible mismatch and tell an image editor what to correct while keeping everything else unchanged.",
            'Return JSON only: {"scores": {...}, "hard_failures": [], "largest_mismatch": null|string, "retry_instruction": null|string, "notes": []}.'
          ].join("\n")
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Capture plan:\n${JSON.stringify(capturePlanSummary(params.coachResult.capture_plan))}\n\nImage 1 is the source photo.`
            },
            { type: "image_url", image_url: { url: sourceDataUrl } },
            { type: "text", text: "Image 2 is the generated retake reference." },
            { type: "image_url", image_url: { url: generatedDataUrl } }
          ]
        }
      ],
      response_format: { type: "json_object" }
    }),
    QC_TIMEOUT_MS
  );

  const responseText = response.choices[0]?.message?.content?.trim();
  if (!responseText) {
    throw new Error("Coach visual QC did not return JSON.");
  }

  const parsed = visualQcResponseSchema.parse(parseJsonFromResponseText(responseText));
  const scores = {
    retake_feasibility: clamp(parsed.scores.retake_feasibility, 25),
    capture_plan_adherence: clamp(parsed.scores.capture_plan_adherence, 25),
    preservation: clamp(parsed.scores.preservation, 20),
    photographic_improvement: clamp(parsed.scores.photographic_improvement, 20),
    anatomy_and_artifacts: clamp(parsed.scores.anatomy_and_artifacts, 10)
  };
  const totalScore = Object.values(scores).reduce((total, score) => total + score, 0);
  const passed = coachReferenceVisualQcPassed(
    scores,
    parsed.hard_failures,
    env.OPENAI_COACH_VISUAL_QC_THRESHOLD
  );

  return {
    schema_version: "1.0",
    passed,
    total_score: totalScore,
    scores,
    hard_failures: parsed.hard_failures,
    largest_mismatch: parsed.largest_mismatch?.trim() || null,
    retry_instruction:
      passed
        ? null
        : parsed.retry_instruction?.trim() || parsed.largest_mismatch?.trim() || null,
    notes: parsed.notes
  };
}
