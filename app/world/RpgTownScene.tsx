"use client";

import { memo, type RefObject } from "react";
import type { Vector3 } from "three";
import type { RpgBusRuntime } from "./RpgBusRuntime";
import type { SceneQualityLevel } from "./SceneQuality";

export interface RpgTownSceneProps {
  /** Retained for caller compatibility; the approved image owns time-of-day color. */
  nightProgress?: number;
  reducedMotion?: boolean;
  /** Retained for caller compatibility; legacy environment rendering is disabled. */
  includeEnvironment?: boolean;
  showLandmarkFireworks?: boolean;
  busRuntime?: RpgBusRuntime;
  qualityLevel?: SceneQualityLevel;
  playerPosition?: RefObject<Vector3 | null>;
}

export interface RpgTownSceneRenderContract {
  readonly approvedBackdropOwner: "RpgWorldBackdrop";
  readonly canonicalDepthForegroundOwner: "FlatWorldCanvas";
  readonly background: false;
  readonly fog: false;
  readonly lighting: false;
  readonly horizon: false;
  readonly ground: false;
  readonly buildings: false;
  readonly landmarkDuplicates: false;
  readonly npcCrowd: false;
}

export const RPG_TOWN_SCENE_RENDER_CONTRACT: RpgTownSceneRenderContract = {
  approvedBackdropOwner: "RpgWorldBackdrop",
  canonicalDepthForegroundOwner: "FlatWorldCanvas",
  background: false,
  fog: false,
  lighting: false,
  horizon: false,
  ground: false,
  buildings: false,
  landmarkDuplicates: false,
  npcCrowd: false
};

export function resolveRpgTownSceneRenderContract() {
  return RPG_TOWN_SCENE_RENDER_CONTRACT;
}

/**
 * The approved image owns the visible town. Player, guide, and canonical
 * depth-foreground objects remain in `FlatWorldCanvas`, outside this component.
 */
export const RpgTownScene = memo(function RpgTownScene(
  props: RpgTownSceneProps
) {
  void props;
  return null;
});
