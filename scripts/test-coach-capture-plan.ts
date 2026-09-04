import assert from "node:assert/strict";

import {
  buildTargetedCoachRetryPrompt,
  composeCoachSafeRenderPrompt,
  composeCoachText2ImagePrompt,
  hasSourceDependentText
} from "../lib/coach-capture-plan";
import { normalizeCoachPhoneZoom } from "../lib/coach-photography-plan";
import { coachReferenceVisualQcPassed } from "../lib/coach-reference-qc";
import type { CoachPhotographyCapturePlan, CoachPhotographyOpportunity } from "../lib/types";

const capturePlan: CoachPhotographyCapturePlan = {
  schema_version: "1.0",
  primary_change: "Move closer so the person is clearly dominant while the shoreline remains visible",
  why: "The person is currently lost in unused foreground",
  subject_description: "An adult woman in a light summer dress standing barefoot on a beach",
  scene_description: "A quiet sandy beach with a diagonal shoreline and soft ocean waves",
  lighting: "Soft late-afternoon side light with natural skin tone and gentle shadows",
  camera: {
    zoom: "2x",
    move: "Step closer until the subject fills about half of the frame height",
    height: "waist height",
    viewpoint: "slightly low"
  },
  frame: {
    body_crop: "Keep the full body including both feet",
    subject_position: "on the left third",
    gaze_space: "Leave visible breathing room toward her gaze",
    background_anchor: "the diagonal shoreline behind her",
    edge_cleanup: "Keep the horizon away from her neck and clear clutter from frame edges"
  },
  subject_action: "Shift weight to the back leg, soften the front knee, and turn the shoulders slightly toward camera",
  capture_cue: "Press the shutter as the front foot settles and the dress moves in the breeze",
  scene_affordances: ["diagonal shoreline", "moving dress fabric", "open gaze space"],
  preserve: ["identity", "dress", "beach location", "natural side light"],
  avoid: ["same woman from the source image", "extra people", "changed weather", "beauty retouching"],
  feasibility_confidence: "high"
};

const source = {
  mode: "comprehensive" as const,
  capture_plan: capturePlan,
  opportunity: {
    shot_type: "full_body_movement_portrait",
    why_this_shot: "The beach offers motion and clean negative space",
    scene_assets: ["shoreline", "breeze"],
    missed_opportunities: ["subject scale"]
  } satisfies CoachPhotographyOpportunity
};

const safePrompt = composeCoachSafeRenderPrompt(source, { editIntensity: "safe" });
assert.match(safePrompt, /PRIMARY CHANGE/);
assert.match(safePrompt, /Use 2x zoom/);
assert.match(safePrompt, /waist height/);
assert.match(safePrompt, /Keep the improvement conservative/);
assert.match(safePrompt, /CAPTURE MOMENT/);
assert.doesNotMatch(safePrompt, /\.\./);
assert.doesNotMatch(safePrompt, /Hold the phone at Hold/i);
assert.doesNotMatch(safePrompt, /Avoid:\s*Avoid/i);

const standalonePrompt = composeCoachText2ImagePrompt(source);
assert.equal(hasSourceDependentText(standalonePrompt), false);
assert.match(standalonePrompt, /quiet sandy beach/i);
assert.match(standalonePrompt, /late-afternoon side light/i);
assert.match(standalonePrompt, /adult woman/i);

assert.equal(normalizeCoachPhoneZoom("2x smartphone telephoto"), "2x");
assert.equal(normalizeCoachPhoneZoom("Use the 3 X lens"), "3x");
assert.equal(normalizeCoachPhoneZoom("1x"), "1x");

const retryPrompt = buildTargetedCoachRetryPrompt("Make the subject visibly larger in frame");
assert.match(retryPrompt, /Correct only this mismatch/);
assert.match(retryPrompt, /source photo.*ground truth/i);
assert.match(retryPrompt, /successful aspect.*unchanged/i);

const baseScores = {
  retake_feasibility: 22,
  capture_plan_adherence: 20,
  preservation: 18,
  photographic_improvement: 17,
  anatomy_and_artifacts: 9
};
assert.equal(coachReferenceVisualQcPassed(baseScores, [], 85), true);
assert.equal(coachReferenceVisualQcPassed(baseScores, [], 87), false);
assert.equal(
  coachReferenceVisualQcPassed({ ...baseScores, capture_plan_adherence: 19 }, [], 85),
  false
);
assert.equal(coachReferenceVisualQcPassed(baseScores, ["identity drift"], 85), false);

console.log("coach capture-plan tests passed");
