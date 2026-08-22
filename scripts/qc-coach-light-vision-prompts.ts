import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { normalizeLightVisionBriefForQc } from "./qc-coach-light-vision-normalize";
import { buildDirectCoachPrompt } from "../lib/prompt-mapping";
import type { CoachLightVisionBrief, CoachMode } from "../lib/types";

const COACH_MODES: CoachMode[] = ["frame", "composition", "angle", "pose"];

const mockVisionBriefs: Record<string, Partial<Record<CoachMode, CoachLightVisionBrief>>> = {
  "A-window-portrait": {
    frame: {
      schema_version: "1.1",
      mode: "frame",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Head-and-shoulders portrait with off-camera gaze to the right.",
        framing: "Tight close-up with limited shoulder visibility.",
        camera_view: "Slightly above eye level, three-quarter orientation.",
        scene_anchor: "Beige wall with turquoise wooden beam structure.",
        lighting: "Soft natural window light."
      },
      recommendation: {
        target_change:
          "Extend the canvas by approximately 10% on the top and gaze-side right to add breathing room above the hair and in the gaze direction while keeping the turquoise beams intact.",
        frame_strategy: "add_breathing_room",
        preserve: ["Face identity", "Turquoise beam geometry", "Off-camera gaze", "Soft window light"],
        avoid: ["Tightening further", "Centering the gaze", "Pose change", "Background replacement"],
        outpaint: {
          allowed: true,
          edges: ["top", "right"],
          extension_ratio_percent: 10,
          expected_content: "Continue the beige wall and turquoise beam structure consistently."
        }
      },
      confidence: "high"
    },
    composition: {
      schema_version: "1.1",
      mode: "composition",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Head-and-shoulders portrait with off-camera gaze to the right.",
        framing: "Tight close-up with limited shoulder visibility.",
        camera_view: "Slightly above eye level, three-quarter orientation.",
        scene_anchor: "Beige wall with turquoise wooden beam structure.",
        lighting: "Soft natural window light."
      },
      recommendation: {
        target_change:
          "Crop approximately 4 to 6 percent from the left and 2 to 3 percent from the top, shifting the face subtly left while preserving all currently visible hair. Keep sufficient negative space on the gaze-side right; reduce the left crop if any hair would be cut.",
        composition_technique: "subtle off-center placement with gaze-side space",
        preserve: ["Face identity", "Beam geometry", "Gaze direction", "Window light"],
        avoid: ["Recentering the face", "Outpainting", "Pose change", "Background replacement"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "high"
    },
    angle: {
      schema_version: "1.1",
      mode: "angle",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Head-and-shoulders portrait with off-camera gaze to the right.",
        framing: "Tight close-up with limited shoulder visibility.",
        camera_view: "Slightly above eye level, three-quarter orientation.",
        scene_anchor: "Beige wall with turquoise wooden beam structure.",
        lighting: "Soft natural window light."
      },
      recommendation: {
        target_change:
          "Show the same portrait from a slightly lower eye-level three-quarter angle toward camera-left.",
        preserve: ["Face identity", "Beam geometry", "Out-camera gaze", "Window-light direction"],
        avoid: ["Extreme dutch angle", "Pose change", "New location", "Relighting"],
        outpaint: {
          allowed: true,
          edges: ["bottom", "left"],
          extension_ratio_percent: 12,
          expected_content: "Continue the beige wall and turquoise beam structure consistently."
        }
      },
      confidence: "medium"
    },
    pose: {
      schema_version: "1.1",
      mode: "pose",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Head-and-shoulders portrait with off-camera gaze to the right.",
        framing: "Tight close-up with limited shoulder visibility.",
        camera_view: "Slightly above eye level, three-quarter orientation.",
        scene_anchor: "Beige wall with turquoise wooden beam structure.",
        lighting: "Soft natural window light."
      },
      recommendation: {
        target_change:
          "Turn the shoulders 25 degrees toward camera-left, drop the near shoulder, and create a stronger neck line while keeping the off-camera gaze.",
        pose_change_magnitude: "moderate",
        preserve: ["Face identity", "Auburn hair", "White tee logo", "Turquoise beams"],
        avoid: ["Front-facing gaze", "Inventing full arms", "Relighting", "Background change"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "medium"
    }
  },
  "B-street-laugh": {
    frame: {
      schema_version: "1.1",
      mode: "frame",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Front-facing laugh with shoulders slightly angled.",
        framing: "Centered chest-up portrait with generous headroom.",
        camera_view: "Eye-level frontal view.",
        scene_anchor: "Blurred urban walkway background.",
        lighting: "Soft golden outdoor daylight."
      },
      recommendation: {
        target_change: "Crop to chest-up with about 6% headroom and trim excess empty space above the hair.",
        frame_strategy: "tighten",
        preserve: ["Laugh expression", "Red turtleneck", "Urban bokeh", "Golden light"],
        avoid: ["Cutting the chin", "Outpainting", "Pose change", "Background replacement"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "high"
    },
    composition: {
      schema_version: "1.1",
      mode: "composition",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Front-facing laugh with shoulders slightly angled.",
        framing: "Centered chest-up portrait with generous headroom.",
        camera_view: "Eye-level frontal view.",
        scene_anchor: "Blurred urban walkway background.",
        lighting: "Soft golden outdoor daylight."
      },
      recommendation: {
        target_change:
          "Keep centered symmetry because direct eye contact is the anchor; trim only excess headroom and balance the background openings evenly.",
        composition_technique: "centered symmetry",
        preserve: ["Eye contact", "Laugh expression", "Red shirt color", "Golden bokeh"],
        avoid: ["Rule-of-thirds offset", "Outpainting", "Pose change", "Background replacement"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "high"
    },
    angle: {
      schema_version: "1.1",
      mode: "angle",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Front-facing laugh with shoulders slightly angled.",
        framing: "Centered chest-up portrait with generous headroom.",
        camera_view: "Eye-level frontal view.",
        scene_anchor: "Blurred urban walkway background.",
        lighting: "Soft golden outdoor daylight."
      },
      recommendation: {
        target_change: "Show the same laugh from a modest low three-quarter angle while preserving direct eye contact.",
        preserve: ["Laugh expression", "Teeth shape", "Red turtleneck", "Urban bokeh"],
        avoid: ["Profile-only view", "Pose redesign", "Background replacement", "Smile change"],
        outpaint: {
          allowed: true,
          edges: ["bottom"],
          extension_ratio_percent: 10,
          expected_content: "Extend the blurred walkway and lower torso area naturally."
        }
      },
      confidence: "high"
    },
    pose: {
      schema_version: "1.1",
      mode: "pose",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Front-facing laugh with shoulders slightly angled.",
        framing: "Centered chest-up portrait with generous headroom.",
        camera_view: "Eye-level frontal view.",
        scene_anchor: "Blurred urban walkway background.",
        lighting: "Soft golden outdoor daylight."
      },
      recommendation: {
        target_change:
          "Turn the visible upper torso 20 degrees toward camera-left, bring the near shoulder forward, lower the far shoulder, and add a subtle head tilt while keeping both hands outside the existing frame.",
        pose_change_magnitude: "moderate",
        preserve: ["Laugh expression", "Red turtleneck", "Urban bokeh", "Golden light"],
        avoid: ["Neutral expression", "Inventing both full arms off-frame", "Leg or weight-shift changes", "Background replacement"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "high"
    }
  },
  "C-floral-portrait": {
    frame: {
      schema_version: "1.1",
      mode: "frame",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Front-facing calm portrait with squared shoulders.",
        framing: "Close-up with soft blossom foreground on the left.",
        camera_view: "Eye-level near-frontal view.",
        scene_anchor: "Cherry blossom branches and pale floral bokeh.",
        lighting: "Soft diffused natural light."
      },
      recommendation: {
        target_change:
          "Retain the current crop and preserve the left-side blossom foreground as an intentional frame; avoid tightening further.",
        frame_strategy: "retain",
        preserve: ["Foreground blossom blur", "Embroidery details", "Direct eye contact", "Soft pastel palette"],
        avoid: ["Removing blossoms", "Tight crop on the face", "Outpainting", "Pose change"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "high"
    },
    composition: {
      schema_version: "1.1",
      mode: "composition",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Front-facing calm portrait with squared shoulders.",
        framing: "Close-up with soft blossom foreground on the left.",
        camera_view: "Eye-level near-frontal view.",
        scene_anchor: "Cherry blossom branches and pale floral bokeh.",
        lighting: "Soft diffused natural light."
      },
      recommendation: {
        target_change:
          "Keep the current horizontal placement and crop vertically so the eyes sit on the upper third while retaining the complete left blossom cluster.",
        composition_technique: "upper-third eye placement with preserved foreground framing",
        preserve: ["Left blossom blur", "Embroidery", "Eye contact", "Soft light"],
        avoid: ["Centering blossoms behind the face", "Sharpening flowers", "Outpainting", "Profile turn"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "high"
    },
    angle: {
      schema_version: "1.1",
      mode: "angle",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Front-facing calm portrait with squared shoulders.",
        framing: "Close-up with soft blossom foreground on the left.",
        camera_view: "Eye-level near-frontal view.",
        scene_anchor: "Cherry blossom branches and pale floral bokeh.",
        lighting: "Soft diffused natural light."
      },
      recommendation: {
        target_change: "Show the same portrait from a gentle three-quarter angle with slightly lower camera height.",
        preserve: ["Facial proportions", "Left blossom framing", "Embroidery", "Soft light"],
        avoid: ["Full profile", "Removing blossoms", "Studio relight", "Pose redesign"],
        outpaint: {
          allowed: true,
          edges: ["right", "bottom"],
          extension_ratio_percent: 12,
          expected_content: "Extend soft blossom bokeh and upper torso consistently."
        }
      },
      confidence: "medium"
    },
    pose: {
      schema_version: "1.1",
      mode: "pose",
      source: {
        subject_count: 1,
        subject_visibility: "upper_body",
        pose: "Front-facing calm portrait with squared shoulders.",
        framing: "Close-up with soft blossom foreground on the left.",
        camera_view: "Eye-level near-frontal view.",
        scene_anchor: "Cherry blossom branches and pale floral bokeh.",
        lighting: "Soft diffused natural light."
      },
      recommendation: {
        target_change:
          "Turn the upper torso 25 degrees toward camera-right, bring the near shoulder forward, lengthen the neck, and tilt the head 8 degrees toward the lowered far shoulder while maintaining direct eye contact.",
        pose_change_magnitude: "moderate",
        preserve: ["Embroidery", "Blossom foreground", "Eye contact", "Soft palette"],
        avoid: ["Full profile", "Inventing full arms", "Removing blossoms", "Face beautification"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "medium"
    }
  },
  "D-lakeside-profile": {
    frame: {
      schema_version: "1.1",
      mode: "frame",
      source: {
        subject_count: 1,
        subject_visibility: "near_full_body",
        pose: "Profile stance with one hand in pocket and lowered head.",
        framing: "Near-full-body profile; legs are visible and both boots are cropped by the bottom edge.",
        camera_view: "Slightly low eye-level side view.",
        scene_anchor: "Rocky shore, lake, and green mountains.",
        lighting: "Diffused overcast natural light."
      },
      recommendation: {
        target_change:
          "Extend the bottom by up to 10 percent, naturally continuing the existing boots and rocky foreground; extend the right edge with shoreline and lake only.",
        frame_strategy: "add_breathing_room",
        preserve: ["Visible boot portions", "Lake horizon", "Chevron sweater", "Overcast light"],
        avoid: ["Cropping boots further", "Pose change", "Horizon shift", "Background replacement"],
        outpaint: {
          allowed: true,
          edges: ["bottom", "right"],
          extension_ratio_percent: 10,
          expected_content:
            "Naturally continue the existing boot shafts and rocky foreground without inventing footwear details beyond what is needed for continuity."
        }
      },
      confidence: "high"
    },
    composition: {
      schema_version: "1.1",
      mode: "composition",
      source: {
        subject_count: 1,
        subject_visibility: "near_full_body",
        pose: "Profile stance with one hand in pocket and lowered head.",
        framing: "Near-full-body profile; legs are visible and both boots are cropped by the bottom edge.",
        camera_view: "Slightly low eye-level side view.",
        scene_anchor: "Rocky shore, lake, and green mountains.",
        lighting: "Diffused overcast natural light."
      },
      recommendation: {
        target_change:
          "Trim approximately 8 to 12 percent from the right edge, only if every currently visible part of both boots remains inside the frame. Shift the subject modestly toward the left side while retaining ample directional negative space in front of the profile; do not require exact left-third placement if the crop cannot achieve it safely.",
        composition_technique: "rule of thirds with directional negative space",
        preserve: ["Profile identity", "Visible boot portions", "Horizon line", "Overcast palette"],
        avoid: ["Centering the subject", "Replacing mountains", "Pose change", "Outpainting"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "high"
    },
    angle: {
      schema_version: "1.1",
      mode: "angle",
      source: {
        subject_count: 1,
        subject_visibility: "near_full_body",
        pose: "Profile stance with one hand in pocket and lowered head.",
        framing: "Near-full-body profile; legs are visible and both boots are cropped by the bottom edge.",
        camera_view: "Slightly low eye-level side view.",
        scene_anchor: "Rocky shore, lake, and green mountains.",
        lighting: "Diffused overcast natural light."
      },
      recommendation: {
        target_change:
          "Move the camera 10 to 12 degrees toward the subject's front at waist-to-chest camera height, creating a low three-quarter profile while preserving the pose.",
        preserve: ["Profile identity", "Sweater chevrons", "Visible boot portions", "Lake geometry"],
        avoid: ["Front-facing face", "New scenery", "Pose redesign", "Sunny relight"],
        outpaint: {
          allowed: true,
          edges: ["bottom", "right"],
          extension_ratio_percent: 10,
          expected_content: "Extend rocky foreground and shoreline consistently."
        }
      },
      confidence: "high"
    },
    pose: {
      schema_version: "1.1",
      mode: "pose",
      source: {
        subject_count: 1,
        subject_visibility: "near_full_body",
        pose: "Profile stance with one hand in pocket and lowered head.",
        framing: "Near-full-body profile; legs are visible and both boots are cropped by the bottom edge.",
        camera_view: "Slightly low eye-level side view.",
        scene_anchor: "Rocky shore, lake, and green mountains.",
        lighting: "Diffused overcast natural light."
      },
      recommendation: {
        target_change:
          "Make a moderate change primarily to the visible upper body: straighten the spine, lift the chin slightly, remove the hand from the pocket, and rest it on the near thigh. Keep both visible legs and cropped boot portions unchanged.",
        pose_change_magnitude: "moderate",
        preserve: ["Profile identity", "Chevron sweater", "Visible boot portions", "Lake layout"],
        avoid: ["Front-facing face", "Torso rotation toward camera", "Landscape replacement", "Editorial posing"],
        outpaint: { allowed: false, edges: [], extension_ratio_percent: 0, expected_content: "" }
      },
      confidence: "high"
    }
  }
};

const outputDir = resolve(import.meta.dirname, "../qc-output/light-vision-prompt-dump-v2");
mkdirSync(outputDir, { recursive: true });

const report: Array<Record<string, unknown>> = [];

for (const [imageId, modeBriefs] of Object.entries(mockVisionBriefs)) {
  for (const mode of COACH_MODES) {
    const rawBrief = modeBriefs[mode];
    if (!rawBrief) {
      continue;
    }
    const visionBrief = normalizeLightVisionBriefForQc(rawBrief, mode);
    const staticPrompt = buildDirectCoachPrompt(mode);
    const visionPrompt = buildDirectCoachPrompt(mode, undefined, visionBrief);

    writeFileSync(join(outputDir, `${imageId}__${mode}__static.txt`), staticPrompt);
    writeFileSync(join(outputDir, `${imageId}__${mode}__vision-brief.json`), JSON.stringify(visionBrief, null, 2));
    writeFileSync(join(outputDir, `${imageId}__${mode}__vision-composed.txt`), visionPrompt);

    report.push({
      imageId,
      mode,
      staticLength: staticPrompt.length,
      visionLength: visionPrompt.length,
      compositionTechnique: visionBrief.recommendation.composition_technique ?? null,
      frameStrategy: visionBrief.recommendation.frame_strategy ?? null,
      poseChangeMagnitude: visionBrief.recommendation.pose_change_magnitude ?? null,
      extensionRatio: visionBrief.recommendation.outpaint.extension_ratio_percent
    });
  }
}

writeFileSync(join(outputDir, "report.json"), JSON.stringify(report, null, 2));
console.log(`Wrote v2 light-vision prompt dump to ${outputDir}`);
