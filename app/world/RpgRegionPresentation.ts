import { Color } from "three";
import type { DestinationId } from "../guide/GuideContract";
import type { NavigationRegion } from "./RpgWorldGeometry";

/**
 * One look per zone, ordered as a journey from morning into night: airport is
 * bright morning, tokyo midday, gyukatsu late afternoon, sakura dusk, hanabi
 * night. The runtime lerps between neighbouring profiles across a transition
 * region, so walking the route reads as time passing.
 *
 * `sky` is the horizon colour AND the fog colour — distance has to dissolve
 * into the sky, not into a mismatched grey band. `skyTop` is the zenith of the
 * gradient dome. `bounce` is the hemisphere ground colour, i.e. light coming
 * back up off the local terrain.
 */
export const RPG_REGION_PRESENTATION_PROFILES = {
  airport: {
    sky: "#bfe2f2", skyTop: "#6cabdd", fog: "#bfe2f2", bounce: "#7d8a63",
    key: "#fff4dd", fill: "#cfe6f6", ambient: "#93b6cf", rim: "#d6ecff",
    keyIntensity: 2, fillIntensity: 1.05,
    sunElevationDegrees: 36, sunAzimuthDegrees: 108,
    fogNear: 16, fogFar: 88,
    decorationDensity: 0.55, vegetationDensity: 0.15,
    effectIntensity: 0.05, ambienceVolume: 0.18
  },
  tokyo: {
    sky: "#a9d0e6", skyTop: "#5e9ed2", fog: "#a9d0e6", bounce: "#6f7068",
    key: "#fff9ec", fill: "#bcd8e8", ambient: "#8fb2c9", rim: "#dceeff",
    keyIntensity: 2.2, fillIntensity: 1.05,
    sunElevationDegrees: 42, sunAzimuthDegrees: 152,
    fogNear: 18, fogFar: 92,
    decorationDensity: 1, vegetationDensity: 0.25,
    effectIntensity: 0.12, ambienceVolume: 0.24
  },
  gyukatsu: {
    sky: "#e5b982", skyTop: "#7fa8cf", fog: "#e5b982", bounce: "#8a7a60",
    key: "#ffc97f", fill: "#b7c0cb", ambient: "#9c9088", rim: "#ffd9b0",
    keyIntensity: 1.95, fillIntensity: 1,
    sunElevationDegrees: 27, sunAzimuthDegrees: 232,
    fogNear: 14, fogFar: 80,
    decorationDensity: 0.92, vegetationDensity: 0.18,
    effectIntensity: 0.2, ambienceVolume: 0.28
  },
  sakura: {
    sky: "#e8a9be", skyTop: "#6d6aa8", fog: "#e8a9be", bounce: "#7d6470",
    key: "#ffd3bb", fill: "#c9a8c8", ambient: "#8d8aa8", rim: "#ffc2da",
    keyIntensity: 1.7, fillIntensity: 1.15,
    sunElevationDegrees: 19, sunAzimuthDegrees: 258,
    fogNear: 12, fogFar: 74,
    decorationDensity: 0.78, vegetationDensity: 1,
    effectIntensity: 0.72, ambienceVolume: 0.22
  },
  hanabi: {
    sky: "#2c3f78", skyTop: "#131f4c", fog: "#2c3f78", bounce: "#3b3348",
    key: "#ffd080", fill: "#7f92c8", ambient: "#3f4d7d", rim: "#93a9ff",
    keyIntensity: 1.3, fillIntensity: 0.9,
    sunElevationDegrees: 24, sunAzimuthDegrees: 302,
    fogNear: 11, fogFar: 70,
    decorationDensity: 1, vegetationDensity: 0.32,
    effectIntensity: 1, ambienceVolume: 0.3
  }
} as const;

const PRESENTATION_COLOR_CHANNELS = [
  "sky",
  "skyTop",
  "fog",
  "bounce",
  "key",
  "fill",
  "ambient",
  "rim"
] as const;

const PRESENTATION_SCALAR_CHANNELS = [
  "keyIntensity",
  "fillIntensity",
  "sunElevationDegrees",
  "sunAzimuthDegrees",
  "fogNear",
  "fogFar",
  "decorationDensity",
  "vegetationDensity",
  "effectIntensity",
  "ambienceVolume"
] as const;

type PresentationColorChannel = (typeof PRESENTATION_COLOR_CHANNELS)[number];
type PresentationScalarChannel = (typeof PRESENTATION_SCALAR_CHANNELS)[number];

const ZONE_IDS = Object.keys(
  RPG_REGION_PRESENTATION_PROFILES
) as DestinationId[];

function createProfileColors(zoneId: DestinationId) {
  const profile = RPG_REGION_PRESENTATION_PROFILES[zoneId];
  return Object.fromEntries(
    PRESENTATION_COLOR_CHANNELS.map((channel) => [
      channel,
      new Color(profile[channel])
    ])
  ) as Record<PresentationColorChannel, Color>;
}

export const RPG_REGION_PRESENTATION_COLORS = Object.fromEntries(
  ZONE_IDS.map((zoneId) => [zoneId, createProfileColors(zoneId)])
) as Readonly<Record<DestinationId, Record<PresentationColorChannel, Color>>>;

type ZoneScalars = Record<DestinationId, number>;

export type RpgRegionPresentationState = {
  readonly [Channel in PresentationColorChannel]: Color;
} & {
  -readonly [Channel in PresentationScalarChannel]: number;
} & {
  readonly zoneWeights: ZoneScalars;
  readonly audioGains: ZoneScalars;
};

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
  const state = {
    zoneWeights: { ...emptyZoneScalars(), airport: 1 },
    audioGains: { ...emptyZoneScalars(), airport: profile.ambienceVolume }
  } as RpgRegionPresentationState;
  const writable = state as unknown as Record<string, Color | number>;
  for (const channel of PRESENTATION_COLOR_CHANNELS) {
    writable[channel] = colors[channel].clone();
  }
  for (const channel of PRESENTATION_SCALAR_CHANNELS) {
    writable[channel] = profile[channel];
  }
  return state;
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
  for (const channel of PRESENTATION_COLOR_CHANNELS) {
    target[channel].copy(fromColors[channel]).lerp(toColors[channel], amount);
  }
  for (const channel of PRESENTATION_SCALAR_CHANNELS) {
    target[channel] = from[channel] + (to[channel] - from[channel]) * amount;
  }
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
