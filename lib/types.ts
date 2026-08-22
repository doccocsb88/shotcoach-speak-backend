export type CoachMode = "composition" | "frame" | "angle" | "pose" | "comprehensive";

export type CoachLightVisionConfidence = "low" | "medium" | "high";

export type CoachLightVisionOutpaintEdge = "top" | "right" | "bottom" | "left";

export type CoachSubjectVisibility = "head_only" | "upper_body" | "near_full_body" | "full_body";

export type CoachFrameStrategy = "retain" | "tighten" | "offset_crop" | "add_breathing_room";

export type CoachPoseChangeMagnitude = "subtle" | "moderate" | "complete";

export type CoachPrimaryAdjustment = "frame" | "composition" | "angle" | "pose";

export interface CoachLightVisionResult {
  schema_version: "2.2";
  mode: CoachMode;
  image_generation_prompt: string;
}

/** @deprecated Use PhotographyPlan (v3.0) — kept for legacy pass-through paths. */
export type CoachLightVisionResultLegacy = CoachLightVisionResult;

/** @deprecated v3.0 — use CoachPhotographyCoachResult (v3.1). */
export interface PhotographyPlanChangeStrength {
  camera: number;
  composition: number;
  pose: number;
  lighting: number;
  appearance: number;
  environment: number;
}

export interface PhotographyPlanPhotoAssessment {
  overall_score: number;
  main_problem: string;
  secondary_problems: string[];
  strongest_existing_element: string;
}

export interface PhotographyPlanShotPlan {
  intent: string;
  orientation: "portrait" | "landscape" | "square";
  zoom: string;
  photographer_distance_m: string;
  camera_height: string;
  camera_angle: string;
  subject_distance_from_background: string;
  subject_position: string;
  subject_scale_change: string;
  horizon_position: string;
  foreground: string;
  background: string;
}

export interface PhotographyPlanPose {
  body_angle: string;
  weight_distribution: string;
  front_leg: string;
  back_leg: string;
  hips: string;
  shoulders: string;
  left_arm: string;
  right_arm: string;
  hands: string;
  head: string;
  gaze: string;
  expression: string;
}

export interface PhotographyPlanTiming {
  moment_to_capture: string;
  environmental_motion: string;
}

export interface PhotographyPlanLighting {
  subject_orientation: string;
  exposure_guidance: string;
  look: string;
}

export interface PhotographyPlanComposition {
  rule: string;
  negative_space: string;
  leading_lines: string;
  crop_guidance: string;
}

export interface PhotographyPlanReferenceGeneration {
  must_preserve: string[];
  must_change: string[];
  visual_priority: string;
  target_style: string;
}

/** @deprecated v3.0 — use CoachPhotographyCoachResult (v3.1). */
export interface PhotographyPlan {
  schema_version: "3.0";
  mode: CoachMode;
  photo_assessment: PhotographyPlanPhotoAssessment;
  shot_plan: PhotographyPlanShotPlan;
  pose: PhotographyPlanPose;
  timing: PhotographyPlanTiming;
  lighting: PhotographyPlanLighting;
  composition: PhotographyPlanComposition;
  reference_generation: PhotographyPlanReferenceGeneration;
  change_strength: PhotographyPlanChangeStrength;
  user_tips: string[];
}

export type CoachPhotographyShotType =
  | "environmental_portrait"
  | "full_body_portrait"
  | "full_body_movement_portrait"
  | "three_quarter_portrait"
  | "close_portrait"
  | "symmetrical_portrait"
  | "architecture_portrait"
  | "foreground_frame_portrait"
  | "silhouette";

export type CoachPhoneZoom = "1x" | "2x" | "3x";

export interface CoachPhotographyCoachAssessment {
  current_shot_summary: string;
  main_problem: string;
  secondary_problems: string[];
  strongest_existing_element: string;
}

export interface CoachPhotographyOpportunity {
  shot_type: CoachPhotographyShotType;
  why_this_shot: string;
  scene_assets: string[];
  missed_opportunities: string[];
}

export interface CoachPhotographyShotPlan {
  zoom: CoachPhoneZoom;
  photographer_distance: string;
  camera_height: string;
  camera_angle: string;
  current_subject_scale: string;
  recommended_subject_scale: string;
  estimated_scale_change: string;
  subject_position: string;
  crop: string;
  horizon: string;
  foreground: string;
  background: string;
  leading_lines: string;
  negative_space: string;
}

export interface CoachPhotographyPose {
  body_angle: string;
  weight_distribution: string;
  front_leg: string;
  back_leg: string;
  hips: string;
  shoulders: string;
  left_arm: string;
  right_arm: string;
  hands: string;
  head: string;
  gaze: string;
  expression: string;
}

export interface CoachPhotographyTiming {
  capture_moment: string;
  environmental_motion: string;
}

export type CoachReferenceRenderMode = "image_edit" | "text_to_image";

export type CoachReferenceRenderPromptType = "safe_render_prompt" | "text2image_prompt";

export type CoachReferenceFallbackReason = "image_edit_safety_rejection";

export interface CoachPhotographyCoachResult {
  schema_version: "7.2";
  mode: CoachMode;
  assessment: CoachPhotographyCoachAssessment;
  opportunity: CoachPhotographyOpportunity;
  shot_plan: CoachPhotographyShotPlan;
  pose: CoachPhotographyPose;
  timing: CoachPhotographyTiming;
  user_tips: string[];
  generation_prompt: string;
  safe_render_prompt: string;
  text2image_prompt: string;
}

/** @deprecated v1.1 brief — kept for legacy QC fixtures only. */
export interface CoachOnSiteCoachingAnalysis {
  critical_errors: string[];
  camera_composition_actions: string[];
  light_color_actions: string[];
  pose_outfit_actions: string[];
  post_processing_actions: string[];
}

export interface CoachLightVisionBrief {
  schema_version: "1.1";
  mode: CoachMode;
  source: {
    subject_count: number;
    subject_visibility: CoachSubjectVisibility;
    pose: string;
    framing: string;
    camera_view: string;
    scene_anchor: string;
    lighting: string;
  };
  coaching_analysis?: CoachOnSiteCoachingAnalysis;
  recommendation: {
    target_change: string;
    composition_technique?: string;
    frame_strategy?: CoachFrameStrategy;
    pose_change_magnitude?: CoachPoseChangeMagnitude;
    primary_adjustment?: CoachPrimaryAdjustment;
    preserve: string[];
    avoid: string[];
    outpaint: {
      allowed: boolean;
      edges: CoachLightVisionOutpaintEdge[];
      extension_ratio_percent: number;
      expected_content: string;
    };
  };
  confidence: CoachLightVisionConfidence;
}

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
