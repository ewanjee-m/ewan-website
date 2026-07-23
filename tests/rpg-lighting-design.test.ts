import { describe, expect, it } from "vitest";
import {
  RPG_AMBIENT_LIGHT_INTENSITY,
  RPG_HEMISPHERE_LIGHT_BASE_INTENSITY,
  RPG_HEMISPHERE_NIGHT_REDUCTION,
  RPG_SKY_PALETTES,
  RPG_TONE_MAPPING_EXPOSURE
} from "../app/world/RpgLightingDesign";

function lightness(color: string) {
  const value = Number.parseInt(color.slice(1), 16);
  const channels = [
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff
  ].map((channel) => channel / 255);
  return (Math.max(...channels) + Math.min(...channels)) / 2;
}

describe("RPG bright lighting design", () => {
  it("keeps the full-night sky, horizon, fog, and character fill readable", () => {
    const night = RPG_SKY_PALETTES.night;

    expect(lightness(night.topTo)).toBeGreaterThanOrEqual(0.38);
    expect(lightness(night.horizonTo)).toBeGreaterThanOrEqual(0.5);
    expect(lightness(night.fogTo)).toBeGreaterThanOrEqual(0.4);
    expect(lightness(night.skyLightTo)).toBeGreaterThanOrEqual(0.72);
    expect(night.sunIntensityTo).toBeGreaterThanOrEqual(0.9);
    expect(
      RPG_HEMISPHERE_LIGHT_BASE_INTENSITY -
        RPG_HEMISPHERE_NIGHT_REDUCTION
    ).toBeGreaterThanOrEqual(1.68);
    expect(RPG_AMBIENT_LIGHT_INTENSITY).toBeGreaterThanOrEqual(0.84);
    expect(RPG_TONE_MAPPING_EXPOSURE).toBeGreaterThanOrEqual(1.16);
  });

  it("keeps every time phase in a warm or clear bright palette", () => {
    for (const [phase, palette] of Object.entries(RPG_SKY_PALETTES)) {
      expect(lightness(palette.horizonFrom), phase).toBeGreaterThanOrEqual(
        0.36
      );
      expect(lightness(palette.horizonTo), phase).toBeGreaterThanOrEqual(0.28);
      expect(lightness(palette.skyLightFrom), phase).toBeGreaterThanOrEqual(
        0.55
      );
      expect(lightness(palette.skyLightTo), phase).toBeGreaterThanOrEqual(0.55);
    }
  });
});
