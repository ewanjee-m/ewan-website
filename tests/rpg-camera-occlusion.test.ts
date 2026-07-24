import { describe, expect, it } from "vitest";
import { MeshBasicMaterial } from "three";
import {
  applyRpgCameraOcclusionMaterials,
  advanceRpgCameraOcclusion,
  createRpgCameraOcclusionOwnedMaterial,
  createRpgCameraOcclusionMaterialBindings,
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

  it("fades owned visual materials and restores them gradually over 200ms", () => {
    const shared = new MeshBasicMaterial({
      opacity: 0.8,
      transparent: false
    });
    const owned = createRpgCameraOcclusionOwnedMaterial(shared);
    const bindings = createRpgCameraOcclusionMaterialBindings([owned]);
    const state = createRpgCameraOcclusionState("npc-airport-traveler");

    advanceRpgCameraOcclusion(
      state,
      true,
      0.25,
      "npc-airport-traveler"
    );
    applyRpgCameraOcclusionMaterials(bindings, state.opacity);
    expect(owned).not.toBe(shared);
    expect(owned.opacity).toBe(0.8);

    advanceRpgCameraOcclusion(
      state,
      true,
      0.1,
      "npc-airport-traveler"
    );
    applyRpgCameraOcclusionMaterials(bindings, state.opacity);
    expect(owned.opacity).toBeCloseTo(0.12);
    expect(owned.transparent).toBe(true);
    expect(shared.opacity).toBe(0.8);
    expect(shared.transparent).toBe(false);

    advanceRpgCameraOcclusion(
      state,
      false,
      0.1,
      "npc-airport-traveler"
    );
    applyRpgCameraOcclusionMaterials(bindings, state.opacity);
    expect(owned.opacity).toBeGreaterThan(0.12);
    expect(owned.opacity).toBeLessThan(0.8);

    advanceRpgCameraOcclusion(
      state,
      false,
      0.1,
      "npc-airport-traveler"
    );
    applyRpgCameraOcclusionMaterials(bindings, state.opacity);
    expect(owned.opacity).toBe(0.8);
    expect(owned.transparent).toBe(false);
  });
});
