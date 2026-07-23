import { describe, expect, it } from "vitest";
import { HANABI_RIVER_LAYOUT } from "../app/world/WorldLandmarks";
import { SAFE_CORRIDOR_HALF_WIDTH } from "../app/world/WorldSafety";

describe("hanabi riverside layout", () => {
  it("keeps a broad water edge and its safety rail outside the movement corridor", () => {
    const waterEdge =
      HANABI_RIVER_LAYOUT.waterCenterX - HANABI_RIVER_LAYOUT.waterWidth / 2;

    expect(HANABI_RIVER_LAYOUT.waterLength).toBeGreaterThanOrEqual(7);
    expect(waterEdge).toBeGreaterThan(SAFE_CORRIDOR_HALF_WIDTH + 2);
    expect(HANABI_RIVER_LAYOUT.railCenterX).toBeLessThan(waterEdge);
    expect(HANABI_RIVER_LAYOUT.railLength).toBeGreaterThanOrEqual(
      HANABI_RIVER_LAYOUT.waterLength
    );
  });
});
