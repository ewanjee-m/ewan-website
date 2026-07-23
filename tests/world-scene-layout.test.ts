import { describe, expect, it } from "vitest";
import {
  ARRIVAL_FACADE_LAYOUT,
  SKY_GRADIENT_PROFILE,
  TOKYO_BUILDING_LAYOUT,
  calculateSkyUpperBlend
} from "../app/world/WorldSceneLayout";
import { SAFE_CORRIDOR_HALF_WIDTH } from "../app/world/WorldSafety";

describe("world scene layout", () => {
  it("uses small arrival facades instead of full-screen placeholder walls", () => {
    expect(ARRIVAL_FACADE_LAYOUT).toHaveLength(2);
    expect(
      Math.max(...ARRIVAL_FACADE_LAYOUT.map((facade) => facade.height))
    ).toBeLessThanOrEqual(2.25);

    for (const facade of ARRIVAL_FACADE_LAYOUT) {
      const innerEdge = Math.abs(facade.x) - facade.width / 2;
      expect(innerEdge).toBeGreaterThan(SAFE_CORRIDOR_HALF_WIDTH + 1.4);
    }
  });

  it("keeps Tokyo buildings readable without turning adjacent zones into walls", () => {
    expect(TOKYO_BUILDING_LAYOUT).toHaveLength(4);
    expect(
      Math.max(...TOKYO_BUILDING_LAYOUT.map((building) => building.height))
    ).toBeLessThanOrEqual(3.6);

    for (const building of TOKYO_BUILDING_LAYOUT) {
      const innerEdge = Math.abs(building.x) - building.width / 2;
      expect(innerEdge).toBeGreaterThan(SAFE_CORRIDOR_HALF_WIDTH + 0.6);
    }
  });

  it("brings the upper sky color into the top of a landscape camera view", () => {
    expect(SKY_GRADIENT_PROFILE.upperEnd).toBeLessThanOrEqual(0.42);
    expect(calculateSkyUpperBlend(0.2)).toBeGreaterThan(0.75);
    expect(calculateSkyUpperBlend(-0.2)).toBe(0);
  });
});
