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
    sky: "#d1a47e", fog: "#9f7462", key: "#ffc477", fill: "#b98a78",
    keyIntensity: 1.24, fillIntensity: 0.78,
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
    sky: "#18295a", fog: "#342b52", key: "#ffd080", fill: "#7083bd",
    keyIntensity: 1.08, fillIntensity: 0.78,
    decorationDensity: 1, vegetationDensity: 0.32,
    effectIntensity: 1, ambienceVolume: 0.3
  }
} as const;

export const RPG_REGION_PRESENTATION_COLORS = {
  airport: {
    sky: new Color(RPG_REGION_PRESENTATION_PROFILES.airport.sky),
    fog: new Color(RPG_REGION_PRESENTATION_PROFILES.airport.fog),
    key: new Color(RPG_REGION_PRESENTATION_PROFILES.airport.key),
    fill: new Color(RPG_REGION_PRESENTATION_PROFILES.airport.fill)
  },
  tokyo: {
    sky: new Color(RPG_REGION_PRESENTATION_PROFILES.tokyo.sky),
    fog: new Color(RPG_REGION_PRESENTATION_PROFILES.tokyo.fog),
    key: new Color(RPG_REGION_PRESENTATION_PROFILES.tokyo.key),
    fill: new Color(RPG_REGION_PRESENTATION_PROFILES.tokyo.fill)
  },
  gyukatsu: {
    sky: new Color(RPG_REGION_PRESENTATION_PROFILES.gyukatsu.sky),
    fog: new Color(RPG_REGION_PRESENTATION_PROFILES.gyukatsu.fog),
    key: new Color(RPG_REGION_PRESENTATION_PROFILES.gyukatsu.key),
    fill: new Color(RPG_REGION_PRESENTATION_PROFILES.gyukatsu.fill)
  },
  sakura: {
    sky: new Color(RPG_REGION_PRESENTATION_PROFILES.sakura.sky),
    fog: new Color(RPG_REGION_PRESENTATION_PROFILES.sakura.fog),
    key: new Color(RPG_REGION_PRESENTATION_PROFILES.sakura.key),
    fill: new Color(RPG_REGION_PRESENTATION_PROFILES.sakura.fill)
  },
  hanabi: {
    sky: new Color(RPG_REGION_PRESENTATION_PROFILES.hanabi.sky),
    fog: new Color(RPG_REGION_PRESENTATION_PROFILES.hanabi.fog),
    key: new Color(RPG_REGION_PRESENTATION_PROFILES.hanabi.key),
    fill: new Color(RPG_REGION_PRESENTATION_PROFILES.hanabi.fill)
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
  const colors = RPG_REGION_PRESENTATION_COLORS.airport;
  return {
    sky: colors.sky.clone(),
    fog: colors.fog.clone(),
    key: colors.key.clone(),
    fill: colors.fill.clone(),
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
  const fromColors = RPG_REGION_PRESENTATION_COLORS[fromId];
  const toColors = RPG_REGION_PRESENTATION_COLORS[toId];
  target.sky.copy(fromColors.sky).lerp(toColors.sky, amount);
  target.fog.copy(fromColors.fog).lerp(toColors.fog, amount);
  target.key.copy(fromColors.key).lerp(toColors.key, amount);
  target.fill.copy(fromColors.fill).lerp(toColors.fill, amount);
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
