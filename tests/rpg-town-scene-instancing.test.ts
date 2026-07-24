import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RPG_DISTRICT_ARCHITECTURE } from "../app/world/RpgTownArchitectureLayout";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";
import { getRpgLandmarkRenderTier } from "../app/world/RpgTownRenderTier";

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), `app/world/${name}`), "utf8");

describe("RPG town scene static ownership", () => {
  it("owns surfaces and rich landmarks in dedicated modules", () => {
    expect(read("RpgWorldSurfaces.tsx")).toContain("RPG_RENDERED_SURFACE_GROUPS");
    expect(read("RpgWorldSurfaces.tsx")).toContain("createRpgBridgeDeckSegments");
    expect(read("RpgSignatureLandmarks.tsx")).toContain(
      "RPG_RENDERED_RICH_LANDMARKS"
    );
    expect(read("RpgTownRenderStats.ts")).toContain("RPG_TOWN_SURFACES");
    expect(read("RpgTownRenderStats.ts")).toContain(
      'getRpgLandmarkRenderTier(landmark) === "rich"'
    );
  });

  it("keeps repeated architecture and details in shared instance groups", () => {
    expect(read("RpgTownArchitecture.tsx")).toContain("<InstanceBatch");
    expect(read("RpgTownDetails.tsx")).toContain("<Instances");
    expect(read("RpgWorldSurfaces.tsx").match(/<Instances\b/g)).toHaveLength(5);
    expect(read("RpgSignatureLandmarks.tsx")).toContain(
      "RepeatedLandmarkBatches"
    );
  });

  it("never renders a rich landmark through batched architecture", () => {
    const richIds = new Set(
      RPG_LANDMARKS.filter(
        (landmark) => getRpgLandmarkRenderTier(landmark) === "rich"
      ).map(({ id }) => id)
    );
    const batchedIds = RPG_DISTRICT_ARCHITECTURE.map(({ id }) => id);
    expect(batchedIds.filter((id) => richIds.has(id))).toEqual([]);
  });

  it("exhaustively names all twelve landmark kinds and defers actors/effects", () => {
    const source = read("RpgSignatureLandmarks.tsx");
    for (const kind of [
      "terminal", "bus", "tower", "machiya", "sakuraTree", "canal",
      "bridge", "stall", "lantern", "torii", "hanabi", "npc"
    ]) {
      expect(source).toContain(`case "${kind}"`);
    }
    expect(source).toContain("assertNever");
    expect(source).toContain('case "bus":');
    expect(source).toContain('case "npc":');
    expect(source).toContain('case "hanabi":');
  });
});
