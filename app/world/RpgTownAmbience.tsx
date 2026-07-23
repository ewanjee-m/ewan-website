"use client";

import type { SceneQualityLevel } from "./SceneQuality";

export interface RpgTownAmbienceProps {
  readonly qualityLevel: SceneQualityLevel;
  readonly worldRotationY?: number;
}

export const RPG_TOWN_AMBIENCE_RENDER_CONTRACT = {
  transparent: true,
  background: null,
  fog: null,
  lights: 0,
  colorOverlay: null,
  particles: 0
} as const;

export function resolveRpgTownAmbienceRenderContract() {
  return RPG_TOWN_AMBIENCE_RENDER_CONTRACT;
}

/** The approved image must reach the display without scene color replacement. */
export function RpgTownAmbience(props: RpgTownAmbienceProps) {
  void props;
  return null;
}
