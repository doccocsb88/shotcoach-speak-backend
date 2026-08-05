export type CoachMode = "composition" | "frame" | "angle" | "pose" | "comprehensive";

export type EditIntensity = "safe" | "balanced" | "aggressive";

export type ToolId =
  | "ai_coach"
  | "enhance_photo"
  | "better_composition"
  | "light_color"
  | "restore_color"
  | "upscale"
  | "background_boost"
  | "expand_frame"
  | "replace_background"
  | "remove_object"
  | "smooth_skin"
  | "photo_recipe"
  | (string & {});

export interface CoachPreferences {
  gender?: "female" | "male" | "non_binary";
  ageRange?: "under_18" | "18_24" | "25_34" | "35_44" | "45_plus";
  sceneContext?:
    | "travel"
    | "street"
    | "cafe"
    | "beach"
    | "nature"
    | "urban_night"
    | "indoor"
    | "restaurant"
    | "landmark";
  editIntensity?: EditIntensity;
}

export interface CoachDirectionV2 {
  id: string;
  title: string;
  summary: string;
  composition_change: string;
  camera_distance_change: string;
  subject_placement_change: string;
  pose_refinement: string;
  lighting_preservation: string;
  edit_strength: "low" | "medium" | "high";
  identity_risk: "low" | "medium" | "high";
  prompt_builder_notes: string[];
}

export interface CoachPhotoAnalysisV2 {
  schema_version: "2.0";
  photo_id: string;
  scene: {
    photo_type: string;
    environment: string;
    background_description: string;
    weather_or_time_of_day: string;
    scene_mood: string;
  };
  subject: {
    subject_count: number;
    pose_description: string;
    expression_description: string;
    outfit_description: string;
    identity_risk_level: "low" | "medium" | "high";
    identity_risk_notes: string;
  };
  composition: {
    quality_score: number;
    notes: string;
    safe_improvements: string[];
    avoid_changes: string[];
  };
  lighting: {
    quality_score: number;
    lighting_type: string;
    notes: string;
    preserve_rules: string[];
  };
  pose: {
    quality_score: number;
    notes: string;
    safe_pose_refinements: string[];
    unsafe_pose_changes: string[];
  };
  aesthetic: {
    overall_score: number;
    notes: string;
    style_preservation: string[];
  };
  scores: {
    composition_score: number;
    lighting_score: number;
    pose_score: number;
    subject_separation_score: number;
    naturalness_score: number;
    social_media_score: number;
    overall_aesthetic_score: number;
  };
  overall_assessment: string;
}

export interface ProductionPhotoAnalysis {
  schema_version: "1.0";
  photo_id: string;
  analysis_id: string;
  scene: {
    photo_type: string;
    environment: string;
    visible_subjects: string;
  };
  composition: {
    quality_score: number;
    notes: string;
  };
  lighting: {
    quality_score: number;
    notes: string;
  };
  pose: {
    quality_score: number;
    notes: string;
  };
  aesthetic: {
    overall_score: number;
    notes: string;
  };
  scores: {
    composition_score: number;
    lighting_score: number;
    pose_score: number;
    naturalness_score: number;
    social_media_score: number;
    overall_aesthetic_score: number;
  };
  overall_assessment: string;
}

export interface CreativeDirection {
  title: string;
  concept: string;
  composition: string;
  camera_angle: string;
  changes: {
    pose: string[];
    lighting: string[];
    composition: string[];
    style: string[];
  };
}

export interface GenerationRecipe {
  direction_title: string;
  model: {
    provider: "openai";
    name: "gpt-image";
  };
  image_prompt: {
    positive_prompt: string;
    negative_prompt: string;
  };
  evaluation_targets: {
    identity_preservation: number;
    naturalness: number;
    anatomy_score: number;
    overall_score: number;
  };
}

export interface RecipeParametersPayload {
  filmSimulation: string;
  highlight: number;
  shadow: number;
  color: number;
  sharpness: number;
  clarity: number;
  grain: string;
  dynamicRange: string;
  whiteBalance: string;
}

export interface PromptPresetPayload {
  mood: string;
  colorPalette: string;
  lighting: string;
  contrast: string;
  saturation: string;
  grainDescription: string;
  negativePrompt: string;
}

export interface WhiteBalancePayload {
  mode: string;
  redShift: number;
  blueShift: number;
}

export interface GrainPayload {
  enabled: boolean;
  size: string;
  strength: string;
}

export interface PhotoRecipePayload {
  id: string;
  name?: string;
  title?: string;
  subtitle?: string;
  category?: string;
  tags?: string[];
  description?: string;
  recipeParameters?: RecipeParametersPayload;
  promptPreset?: PromptPresetPayload;
  filmSimulation?: string;
  whiteBalance?: WhiteBalancePayload;
  dynamicRange?: string;
  grain?: GrainPayload;
  colorChromeEffect?: string;
  colorChromeFXBlue?: string;
  highlight?: number;
  shadow?: number;
  color?: number;
  sharpness?: number;
  noiseReduction?: number;
  clarity?: number;
  exposureCompensation?: string;
  mood?: string;
  recommendedFor?: string[];
}

export interface Suggestion {
  title: string;
  concept: string;
  composition?: string;
  camera_angle?: string;
  changes: string[];
  image_prompt: string;
}

export interface SuggestionGenerationEntry {
  suggestionTitle: string;
  generatedImageBase64?: string | null;
  qualityEvaluation?: QualityEvaluationResult | null;
}

export interface QualityEvaluationResult {
  identity_preservation: number;
  naturalness: number;
  anatomy_score: number;
  overall_score: number;
  retry_required: boolean;
  retry_reason: string;
  recommended_action: string;
}

export interface AnalysisResult {
  analysisId: string;
  flowType: "aiCoach" | "photoRecipe" | "editingTool";
  overallAssessment: string;
  suggestions: Suggestion[];
  coachAnalysisV2?: CoachPhotoAnalysisV2;
  coachDirectionsV2?: CoachDirectionV2[];
  productionAnalysis?: ProductionPhotoAnalysis;
  creativeDirections?: CreativeDirection[];
  generationRecipes?: GenerationRecipe[];
  originalImageUri: string;
  originalImageMimeType?: string;
  suggestionGenerations?: SuggestionGenerationEntry[];
  createdAt: string;
}
