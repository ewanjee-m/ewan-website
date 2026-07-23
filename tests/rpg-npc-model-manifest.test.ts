import { describe, expect, it } from "vitest";
import {
  NPC_CHARACTER_MODEL_BUDGET,
  NPC_CHARACTER_MODELS
} from "../app/world/NpcCharacterModels";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";

describe("NPC character model manifest", () => {
  it("maps every town NPC to four reusable local role models", () => {
    const townNpcIds = RPG_LANDMARKS.filter(({ kind }) => kind === "npc")
      .map(({ id }) => id)
      .sort();
    const manifestNpcIds = Object.keys(NPC_CHARACTER_MODELS).sort();
    const modelAssets = [
      ...new Set(
        Object.values(NPC_CHARACTER_MODELS).map(({ modelAsset }) => modelAsset)
      )
    ].sort();
    const roles = [
      ...new Set(Object.values(NPC_CHARACTER_MODELS).map(({ role }) => role))
    ].sort();

    expect(manifestNpcIds).toEqual(townNpcIds);
    expect(modelAssets).toEqual([
      "/assets/models/characters/npc-airport-traveler.glb",
      "/assets/models/characters/npc-gyukatsu-chef.glb",
      "/assets/models/characters/npc-hanabi-yukata.glb",
      "/assets/models/characters/npc-sakura-visitor.glb"
    ]);
    expect(roles).toEqual([
      "airport-traveler",
      "gyukatsu-chef",
      "hanabi-yukata",
      "sakura-visitor"
    ]);
    expect(
      Object.values(NPC_CHARACTER_MODELS).every(
        ({ modelAsset }) =>
          modelAsset.startsWith("/assets/models/characters/npc-") &&
          modelAsset.endsWith(".glb") &&
          !modelAsset.includes("://")
      )
    ).toBe(true);

    expect(NPC_CHARACTER_MODELS["npc-hanabi-child"].modelAsset).toBe(
      NPC_CHARACTER_MODELS["npc-airport-traveler"].modelAsset
    );
    expect(NPC_CHARACTER_MODELS["npc-hanabi-child"].role).toBe(
      NPC_CHARACTER_MODELS["npc-airport-traveler"].role
    );
    expect(NPC_CHARACTER_MODELS["npc-tokyo-worker"].modelAsset).toBe(
      NPC_CHARACTER_MODELS["npc-sakura-visitor"].modelAsset
    );
    expect(NPC_CHARACTER_MODELS["npc-tokyo-worker"].role).toBe(
      NPC_CHARACTER_MODELS["npc-sakura-visitor"].role
    );
    expect(NPC_CHARACTER_MODELS["npc-hanabi-vendor"].modelAsset).toBe(
      NPC_CHARACTER_MODELS["npc-gyukatsu-chef"].modelAsset
    );
    expect(NPC_CHARACTER_MODELS["npc-hanabi-vendor"].role).toBe(
      NPC_CHARACTER_MODELS["npc-gyukatsu-chef"].role
    );
  });

  it("scales one native-height rig to the adult and child visible heights", () => {
    for (const [npcId, model] of Object.entries(NPC_CHARACTER_MODELS)) {
      expect(model.nativeHeight, npcId).toBeGreaterThan(2.2);
      expect(model.nativeHeight, npcId).toBeLessThan(2.8);
      expect(model.visibleHeight, npcId).toBe(
        npcId === "npc-hanabi-child" ? 2.2 : 2.525
      );
      expect(model.visibleHeight / model.nativeHeight, npcId).toBeGreaterThan(
        0
      );
    }
  });

  it("publishes one strict primitive and two-level triangle budget", () => {
    expect(NPC_CHARACTER_MODEL_BUDGET.maxPrimitives).toBe(1);
    expect(NPC_CHARACTER_MODEL_BUDGET.lods).toEqual([
      { level: 0, maximumDistance: 14, maxTriangles: 8_000 },
      { level: 1, maximumDistance: null, maxTriangles: 2_500 }
    ]);
    expect(
      NPC_CHARACTER_MODEL_BUDGET.lods[0].maxTriangles
    ).toBeGreaterThan(NPC_CHARACTER_MODEL_BUDGET.lods[1].maxTriangles);

    for (const model of Object.values(NPC_CHARACTER_MODELS)) {
      expect(model.renderBudget).toBe(NPC_CHARACTER_MODEL_BUDGET);
    }
  });
});
