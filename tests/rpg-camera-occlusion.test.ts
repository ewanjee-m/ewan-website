import { describe, expect, it } from "vitest";
import {
  advanceRpgCameraOcclusion,
  createRpgCameraOcclusionState
} from "../app/world/RpgCameraOcclusion";

describe("RPG camera occlusion", () => {
  it("waits 250ms, fades within 100ms, and restores within 200ms", () => {
    const state = createRpgCameraOcclusionState();
    advanceRpgCameraOcclusion(state, true, 0.249);
    expect(state.fading).toBe(false);
    advanceRpgCameraOcclusion(state, true, 0.001);
    expect(state.fading).toBe(true);
    advanceRpgCameraOcclusion(state, true, 0.1);
    expect(state.opacity).toBeLessThanOrEqual(0.2);
    advanceRpgCameraOcclusion(state, false, 0.2);
    expect(state.opacity).toBeCloseTo(1, 2);
  });

  it("does not carry one object fade into another UUID", () => {
    const state = createRpgCameraOcclusionState("landmark-a");
    advanceRpgCameraOcclusion(state, true, 0.35, "landmark-a");
    expect(state.opacity).toBeCloseTo(0.15);

    advanceRpgCameraOcclusion(state, true, 0.01, "landmark-b");
    expect(state.objectUuid).toBe("landmark-b");
    expect(state.fading).toBe(false);
    expect(state.opacity).toBe(1);
  });
});
