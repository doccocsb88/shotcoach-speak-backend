import type { CoachLightVisionBrief, CoachMode } from "../lib/types";

/** Legacy v1.1 QC helper — passthrough after light vision v2 migration. */
export function normalizeLightVisionBriefForQc(brief: CoachLightVisionBrief, _mode: CoachMode) {
  return brief;
}
