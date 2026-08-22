import { getEnv } from "@/lib/config";
import { decodeBase64Image, resizeForAnalysis } from "@/lib/images";
import { getOpenAIClient } from "@/lib/openai";
import {
  buildAICoachImageEditPrompt,
  buildCoachDirectionPromptV2,
  buildCoachVisionAnalysisPromptV2,
  buildCreativeDirectionPromptV1,
  buildPromptComposerPromptV1,
  buildVisionAnalysisPromptV1
} from "@/lib/prompt-mapping";
import { extractResponseText, parseJsonFromResponseText } from "@/lib/response-parser";
import type {
  AnalysisResult,
  CoachDirectionV2,
  CoachPhotoAnalysisV2,
  CoachPreferences,
  CoachMode,
  CreativeDirection,
  GenerationRecipe,
  ProductionPhotoAnalysis,
  Suggestion
} from "@/lib/types";

async function createResponseWithImage(system: string, user: string, dataUrl: string) {
  const env = getEnv();
  return getOpenAIClient().responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }]
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: user },
          { type: "input_image", image_url: dataUrl, detail: "auto" }
        ]
      }
    ]
  });
}

async function createResponseWithoutImage(system: string, user: string) {
  const env = getEnv();
  return getOpenAIClient().responses.create({
    model: env.OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: user }]
      }
    ]
  });
}

function buildCoachV2Suggestions(
  analysis: CoachPhotoAnalysisV2,
  directions: CoachDirectionV2[],
  preferences?: CoachPreferences
) {
  return directions.map<Suggestion>((direction) => ({
    title: direction.title,
    concept: direction.summary,
    composition: direction.composition_change,
    camera_angle: direction.camera_distance_change,
    changes: [
      direction.subject_placement_change,
      direction.pose_refinement,
      direction.lighting_preservation
    ],
    image_prompt: buildAICoachImageEditPrompt(analysis, direction, undefined, preferences)
  }));
}

function buildProductionSuggestions(
  directions: CreativeDirection[],
  recipes: GenerationRecipe[]
) {
  const recipeByTitle = new Map(recipes.map((recipe) => [recipe.direction_title, recipe]));

  return directions.map<Suggestion>((direction) => ({
    title: direction.title,
    concept: direction.concept,
    composition: direction.composition,
    camera_angle: direction.camera_angle,
    changes: [
      ...direction.changes.pose,
      ...direction.changes.lighting,
      ...direction.changes.composition,
      ...direction.changes.style
    ],
    image_prompt: recipeByTitle.get(direction.title)?.image_prompt.positive_prompt ?? ""
  }));
}

export async function runAnalyzeFlow(params: {
  imageBase64: string;
  coachMode: CoachMode;
  coachPreferences?: CoachPreferences;
  flowVersion: "v1" | "v2";
  originalImageUri: string;
  originalImageMimeType?: string;
}) {
  const originalImage = await decodeBase64Image(params.imageBase64);
  const resizedImage = await resizeForAnalysis(originalImage);
  const dataUrl = `data:image/jpeg;base64,${resizedImage.toString("base64")}`;
  const now = new Date().toISOString();

  if (params.flowVersion === "v1") {
    const visionPrompt = buildVisionAnalysisPromptV1();
    const visionResponse = await createResponseWithImage(visionPrompt.system, visionPrompt.user, dataUrl);
    const productionAnalysis = parseJsonFromResponseText<ProductionPhotoAnalysis>(
      extractResponseText(visionResponse)
    );

    const creativePrompt = buildCreativeDirectionPromptV1();
    const creativeResponse = await createResponseWithoutImage(
      creativePrompt.system,
      `${creativePrompt.userPrefix}${JSON.stringify(productionAnalysis)}`
    );
    const creativeDirections = parseJsonFromResponseText<{ directions: CreativeDirection[] }>(
      extractResponseText(creativeResponse)
    ).directions;

    const composerPrompt = buildPromptComposerPromptV1();
    const recipeResponse = await createResponseWithoutImage(
      composerPrompt.system,
      composerPrompt.userBuilder(JSON.stringify(productionAnalysis), JSON.stringify(creativeDirections))
    );
    const generationRecipes = parseJsonFromResponseText<{ recipes: GenerationRecipe[] }>(
      extractResponseText(recipeResponse)
    ).recipes;

    const result: AnalysisResult = {
      analysisId: `production-v1:${Date.now()}`,
      flowType: "aiCoach",
      overallAssessment: productionAnalysis.overall_assessment,
      suggestions: buildProductionSuggestions(creativeDirections, generationRecipes),
      productionAnalysis,
      creativeDirections,
      generationRecipes,
      originalImageUri: params.originalImageUri,
      originalImageMimeType: params.originalImageMimeType,
      createdAt: now
    };

    return result;
  }

  const analysisPrompt = buildCoachVisionAnalysisPromptV2(params.coachMode, params.coachPreferences);
  const analysisResponse = await createResponseWithImage(analysisPrompt.system, analysisPrompt.user, dataUrl);
  const coachAnalysisV2 = parseJsonFromResponseText<CoachPhotoAnalysisV2>(
    extractResponseText(analysisResponse)
  );

  const directionPrompt = buildCoachDirectionPromptV2(params.coachMode, params.coachPreferences);
  const directionResponse = await createResponseWithoutImage(
    directionPrompt.system,
    `${directionPrompt.userPrefix}${JSON.stringify(coachAnalysisV2)}`
  );
  const coachDirectionsV2 = parseJsonFromResponseText<{ directions: CoachDirectionV2[] }>(
    extractResponseText(directionResponse)
  ).directions;

  const result: AnalysisResult = {
    analysisId: `coach-v2:${Date.now()}`,
    flowType: "aiCoach",
    overallAssessment: coachAnalysisV2.overall_assessment,
    suggestions: buildCoachV2Suggestions(coachAnalysisV2, coachDirectionsV2, params.coachPreferences),
    coachAnalysisV2,
    coachDirectionsV2,
    originalImageUri: params.originalImageUri,
    originalImageMimeType: params.originalImageMimeType,
    createdAt: now
  };

  return result;
}
