import OpenAI from "openai";

import {
  runCoachReferenceImageEdit,
  runTargetedCoachImageEdit,
  type CoachReferenceRenderResult
} from "@/lib/coach-image-render";
import { runCoachReferenceVisualQc } from "@/lib/coach-reference-qc";
import { getEnv } from "@/lib/config";
import type {
  CoachPhotographyCoachResult,
  CoachReferenceVisualQcResult
} from "@/lib/types";

export interface CoachReferenceFlowResult extends CoachReferenceRenderResult {
  initialPromptUsed: string;
  visualQcInitial: CoachReferenceVisualQcResult | null;
  visualQcFinal: CoachReferenceVisualQcResult | null;
  visualQcRetryCount: number;
  visualQcError: string | null;
}

export async function runCoachReferenceFlow(params: {
  client: OpenAI;
  sourceImage: Buffer;
  sourceMimeType: string;
  imageFile: File;
  coachResult: CoachPhotographyCoachResult;
  model: string;
  size: string;
  quality: "low" | "medium" | "high";
  isGptImage: boolean;
}): Promise<CoachReferenceFlowResult> {
  const env = getEnv();
  const initial = await runCoachReferenceImageEdit(params);
  const baseResult: CoachReferenceFlowResult = {
    ...initial,
    initialPromptUsed: initial.promptUsed,
    visualQcInitial: null,
    visualQcFinal: null,
    visualQcRetryCount: 0,
    visualQcError: null
  };

  if (!env.OPENAI_COACH_VISUAL_QC_ENABLED || !initial.generatedImageBase64) {
    return baseResult;
  }

  try {
    const initialQc = await runCoachReferenceVisualQc({
      client: params.client,
      sourceImage: params.sourceImage,
      sourceMimeType: params.sourceMimeType,
      generatedImageBase64: initial.generatedImageBase64,
      coachResult: params.coachResult
    });
    baseResult.visualQcInitial = initialQc;
    baseResult.visualQcFinal = initialQc;

    if (
      initialQc.passed ||
      initial.renderMode !== "image_edit" ||
      env.OPENAI_COACH_VISUAL_QC_MAX_RETRIES === 0 ||
      !initialQc.retry_instruction
    ) {
      return baseResult;
    }

    const retry = await runTargetedCoachImageEdit({
      client: params.client,
      sourceImageFile: params.imageFile,
      generatedImageBase64: initial.generatedImageBase64,
      retryInstruction: initialQc.retry_instruction,
      model: params.model,
      size: params.size,
      quality: params.quality,
      isGptImage: params.isGptImage
    });
    baseResult.visualQcRetryCount = 1;

    if (!retry.generatedImageBase64) {
      return baseResult;
    }

    const retryQc = await runCoachReferenceVisualQc({
      client: params.client,
      sourceImage: params.sourceImage,
      sourceMimeType: params.sourceMimeType,
      generatedImageBase64: retry.generatedImageBase64,
      coachResult: params.coachResult
    });

    if (retryQc.passed || retryQc.total_score > initialQc.total_score) {
      return {
        ...baseResult,
        generatedImageBase64: retry.generatedImageBase64,
        promptUsed: retry.prompt,
        visualQcFinal: retryQc
      };
    }

    return baseResult;
  } catch (error) {
    return {
      ...baseResult,
      visualQcError: error instanceof Error ? error.message : String(error)
    };
  }
}
