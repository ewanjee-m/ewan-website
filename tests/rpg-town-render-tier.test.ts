import { describe, expect, it } from "vitest";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";
import { getRpgLandmarkRenderTier } from "../app/world/RpgTownRenderTier";

function landmark(id: string) {
  const result = RPG_LANDMARKS.find((entry) => entry.id === id);
  if (!result) throw new Error(`Missing authored landmark: ${id}`);
  return result;
}

describe("RPG town landmark render tiers", () => {
  it("keeps one detailed signature landmark per district and batches repeated secondary volumes", () => {
    for (const id of [
      "tokyo-blue-tower",
      "gyukatsu-main-machiya",
      "sakura-tree-01",
      "hanabi-apple-stall"
    ]) {
      expect(getRpgLandmarkRenderTier(landmark(id)), id).toBe("rich");
    }

    for (const id of [
      "tokyo-violet-tower",
      "tokyo-sunset-tower",
      "gyukatsu-teahouse-machiya",
      "sakura-tree-02",
      "sakura-tree-06",
      "hanabi-mask-stall",
      "hanabi-goldfish-stall",
      "district-volume-tokyo-market-tower"
    ]) {
      expect(getRpgLandmarkRenderTier(landmark(id)), id).toBe("batched");
    }
  });

  it("never batches moving, interactive, or one-off infrastructure", () => {
    for (const id of [
      "airport-limousine-bus",
      "sakura-canal",
      "sakura-bridge",
      "hanabi-torii",
      "npc-airport-traveler"
    ]) {
      expect(getRpgLandmarkRenderTier(landmark(id)), id).toBe("rich");
    }
  });
});
