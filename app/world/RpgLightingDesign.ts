import type { WorldTimePhase } from "./WorldTimeline";

export interface RpgSkyPalette {
  topFrom: string;
  topTo: string;
  horizonFrom: string;
  horizonTo: string;
  fogFrom: string;
  fogTo: string;
  skyLightFrom: string;
  skyLightTo: string;
  groundLightFrom: string;
  groundLightTo: string;
  sunFrom: string;
  sunTo: string;
  sunIntensityFrom: number;
  sunIntensityTo: number;
}

export const RPG_SKY_PALETTES: Record<WorldTimePhase, RpgSkyPalette> = {
  lateAfternoon: {
    topFrom: "#85c7eb",
    topTo: "#929fce",
    horizonFrom: "#fff0c8",
    horizonTo: "#ffc0a8",
    fogFrom: "#b7d7d1",
    fogTo: "#dda6a7",
    skyLightFrom: "#d9efff",
    skyLightTo: "#ffe1bf",
    groundLightFrom: "#9b9f82",
    groundLightTo: "#896d75",
    sunFrom: "#fff6d8",
    sunTo: "#ffbd84",
    sunIntensityFrom: 2.65,
    sunIntensityTo: 2.15
  },
  sunset: {
    topFrom: "#929fce",
    topTo: "#7184b7",
    horizonFrom: "#ffc0a8",
    horizonTo: "#df8fa6",
    fogFrom: "#dda6a7",
    fogTo: "#8d7893",
    skyLightFrom: "#ffe1bf",
    skyLightTo: "#c9c9ed",
    groundLightFrom: "#896d75",
    groundLightTo: "#62576a",
    sunFrom: "#ffbd84",
    sunTo: "#dba1c1",
    sunIntensityFrom: 2.15,
    sunIntensityTo: 1.65
  },
  blueEvening: {
    topFrom: "#7184b7",
    topTo: "#3e6597",
    horizonFrom: "#df8fa6",
    horizonTo: "#7185b1",
    fogFrom: "#8d7893",
    fogTo: "#395777",
    skyLightFrom: "#c9c9ed",
    skyLightTo: "#9fbbdf",
    groundLightFrom: "#62576a",
    groundLightTo: "#44405a",
    sunFrom: "#dba1c1",
    sunTo: "#8fa8cf",
    sunIntensityFrom: 1.65,
    sunIntensityTo: 1
  },
  night: {
    topFrom: "#3e6597",
    topTo: "#315f99",
    horizonFrom: "#7185b1",
    horizonTo: "#6b92bf",
    fogFrom: "#395777",
    fogTo: "#52799e",
    skyLightFrom: "#9fbbdf",
    skyLightTo: "#b7d3f2",
    groundLightFrom: "#44405a",
    groundLightTo: "#666985",
    sunFrom: "#8fa8cf",
    sunTo: "#b8cef0",
    sunIntensityFrom: 1,
    sunIntensityTo: 0.95
  }
};

export const RPG_HEMISPHERE_LIGHT_BASE_INTENSITY = 1.9;
export const RPG_HEMISPHERE_NIGHT_REDUCTION = 0.2;
export const RPG_AMBIENT_LIGHT_INTENSITY = 0.85;
export const RPG_TONE_MAPPING_EXPOSURE = 1.18;
