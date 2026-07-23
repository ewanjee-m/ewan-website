import type { RpgLandmark } from "./RpgTownSceneLayout";

export type RpgLandmarkRenderTier = "rich" | "batched";

const RPG_SIGNATURE_LANDMARK_IDS = new Set([
  "tokyo-blue-tower",
  "gyukatsu-main-machiya",
  "sakura-tree-01",
  "hanabi-apple-stall"
]);

const REPEATED_VOLUME_KINDS = new Set<RpgLandmark["kind"]>([
  "tower",
  "machiya",
  "sakuraTree",
  "stall"
]);

export function getRpgLandmarkRenderTier(
  landmark: Readonly<RpgLandmark>
): RpgLandmarkRenderTier {
  if (landmark.id.startsWith("district-volume-")) {
    return "batched";
  }
  if (!REPEATED_VOLUME_KINDS.has(landmark.kind)) {
    return "rich";
  }
  return RPG_SIGNATURE_LANDMARK_IDS.has(landmark.id) ? "rich" : "batched";
}
