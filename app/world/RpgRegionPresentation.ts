import { Color } from "three";
import type { DestinationId } from "../guide/GuideContract";
import type { NavigationRegion } from "./RpgWorldGeometry";

export const RPG_REGION_PRESENTATION_PROFILES = {
  airport: {
    sky: "#b9dff0", fog: "#d7e3e5", key: "#fff6df", fill: "#b5dcf0",
    keyIntensity: 1.25, fillIntensity: 0.8,
    decorationDensity: 0.55, vegetationDensity: 0.15,
    effectIntensity: 0.05, ambienceVolume: 0.18
  },
  tokyo: {
    sky: "#9fbfd0", fog: "#b8c4ca", key: "#ffe7c4", fill: "#92b8c9",
    keyIntensity: 1.15, fillIntensity: 0.72,
    decorationDensity: 1, vegetationDensity: 0.25,
    effectIntensity: 0.12, ambienceVolume: 0.24
  },
  gyukatsu: {
    sky: "#c99b78", fog: "#8f6655", key: "#ffb667", fill: "#9a6e62",
    keyIntensity: 1.05, fillIntensity: 0.62,
    decorationDensity: 0.92, vegetationDensity: 0.18,
    effectIntensity: 0.2, ambienceVolume: 0.28
  },
  sakura: {
    sky: "#f1c5d6", fog: "#e7b9c8", key: "#fff1dc", fill: "#d9a8c5",
    keyIntensity: 1.3, fillIntensity: 0.86,
    decorationDensity: 0.78, vegetationDensity: 1,
    effectIntensity: 0.72, ambienceVolume: 0.22
  },
  hanabi: {
    sky: "#111a3a", fog: "#241d3e", key: "#ffbf69", fill: "#485c91",
    keyIntensity: 0.82, fillIntensity: 0.55,
    decorationDensity: 1, vegetationDensity: 0.32,
    effectIntensity: 1, ambienceVolume: 0.3
  }
} as const;

const ZONE_IDS = Object.keys(
  RPG_REGION_PRESENTATION_PROFILES
) as DestinationId[];

type ZoneScalars = Record<DestinationId, number>;

export interface RpgRegionPresentationState {
  readonly sky: Color;
  readonly fog: Color;
  readonly key: Color;
  readonly fill: Color;
  keyIntensity: number;
  fillIntensity: number;
  decorationDensity: number;
  vegetationDensity: number;
  effectIntensity: number;
  ambienceVolume: number;
  readonly zoneWeights: ZoneScalars;
  readonly audioGains: ZoneScalars;
}

const emptyZoneScalars = (): ZoneScalars => ({
  airport: 0,
  tokyo: 0,
  gyukatsu: 0,
  sakura: 0,
  hanabi: 0
});

export function createRpgRegionPresentation(): RpgRegionPresentationState {
  const profile = RPG_REGION_PRESENTATION_PROFILES.airport;
  return {
    sky: new Color(profile.sky),
    fog: new Color(profile.fog),
    key: new Color(profile.key),
    fill: new Color(profile.fill),
    keyIntensity: profile.keyIntensity,
    fillIntensity: profile.fillIntensity,
    decorationDensity: profile.decorationDensity,
    vegetationDensity: profile.vegetationDensity,
    effectIntensity: profile.effectIntensity,
    ambienceVolume: profile.ambienceVolume,
    zoneWeights: { ...emptyZoneScalars(), airport: 1 },
    audioGains: { ...emptyZoneScalars(), airport: profile.ambienceVolume }
  };
}

function applyProfile(
  target: RpgRegionPresentationState,
  fromId: DestinationId,
  toId: DestinationId,
  amount: number
) {
  const from = RPG_REGION_PRESENTATION_PROFILES[fromId];
  const to = RPG_REGION_PRESENTATION_PROFILES[toId];
  target.sky.set(from.sky).lerp(new Color(to.sky), amount);
  target.fog.set(from.fog).lerp(new Color(to.fog), amount);
  target.key.set(from.key).lerp(new Color(to.key), amount);
  target.fill.set(from.fill).lerp(new Color(to.fill), amount);
  target.keyIntensity = from.keyIntensity + (to.keyIntensity - from.keyIntensity) * amount;
  target.fillIntensity = from.fillIntensity + (to.fillIntensity - from.fillIntensity) * amount;
  target.decorationDensity = from.decorationDensity + (to.decorationDensity - from.decorationDensity) * amount;
  target.vegetationDensity = from.vegetationDensity + (to.vegetationDensity - from.vegetationDensity) * amount;
  target.effectIntensity = from.effectIntensity + (to.effectIntensity - from.effectIntensity) * amount;
  target.ambienceVolume = from.ambienceVolume + (to.ambienceVolume - from.ambienceVolume) * amount;
}

export function resolveRpgRegionPresentation(
  region: NavigationRegion,
  target: RpgRegionPresentationState
): RpgRegionPresentationState {
  for (const id of ZONE_IDS) {
    target.zoneWeights[id] = 0;
    target.audioGains[id] = 0;
  }

  if (region.kind === "zone") {
    applyProfile(target, region.displayZoneId, region.displayZoneId, 0);
    target.zoneWeights[region.displayZoneId] = 1;
  } else {
    const progress = Math.min(1, Math.max(0, region.progress));
    const t = progress * progress * (3 - 2 * progress);
    applyProfile(target, region.fromZoneId, region.toZoneId, t);
    target.zoneWeights[region.fromZoneId] = 1 - t;
    target.zoneWeights[region.toZoneId] = t;
  }

  for (const id of ZONE_IDS) {
    target.audioGains[id] =
      target.zoneWeights[id] *
      RPG_REGION_PRESENTATION_PROFILES[id].ambienceVolume;
  }
  return target;
}
