import { describe, expect, it } from "vitest";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";
import {
  getNpcDisplayHeight,
  getNpcRuntimeAsset,
  getNpcSourceAsset,
  getNpcSpriteFootOffset
} from "../app/world/NpcAssets";

describe("high-resolution RPG town NPC assets", () => {
  it("maps every town NPC to a project-local high-resolution sprite", () => {
    const npcIds = RPG_LANDMARKS.filter(({ kind }) => kind === "npc").map(
      ({ id }) => id
    );

    expect(npcIds).toHaveLength(7);
    for (const npcId of npcIds) {
      expect(getNpcSourceAsset(npcId)).toMatch(
        /^\/assets\/npcs\/npc-[a-z-]+\.png$/
      );
      expect(getNpcRuntimeAsset(npcId)).toMatch(
        /^\/assets\/npcs\/runtime\/npc-[a-z-]+\.webp$/
      );
    }
    expect(new Set(npcIds.map(getNpcSourceAsset)).size).toBeGreaterThanOrEqual(
      4
    );
  });

  it("provides a measured foot offset so every sprite stands on the ground", () => {
    for (const npcId of RPG_LANDMARKS.filter(
      ({ kind }) => kind === "npc"
    ).map(({ id }) => id)) {
      expect(getNpcSpriteFootOffset(npcId)).toBeGreaterThan(0.04);
      expect(getNpcSpriteFootOffset(npcId)).toBeLessThan(0.1);
    }
  });

  it("matches every adult NPC's visible height to the player and keeps the festival child shorter", () => {
    const adultNpcs = RPG_LANDMARKS.filter(
      ({ kind, id }) => kind === "npc" && id !== "npc-hanabi-child"
    );
    const adultVisibleHeights = adultNpcs.map(
      ({ id, variant }) =>
        getNpcDisplayHeight(id, variant ?? 0) *
        (1 - getNpcSpriteFootOffset(id))
    );
    expect(
      adultVisibleHeights.every(
        (height) => Math.abs(height - 2.525) <= 0.001
      )
    ).toBe(true);
    expect(
      getNpcDisplayHeight("npc-hanabi-child", 4) *
        (1 - getNpcSpriteFootOffset("npc-hanabi-child"))
    ).toBeCloseTo(2.2, 3);
  });
});
