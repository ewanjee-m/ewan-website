import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RPG_DISTRICT_ARCHITECTURE } from "../app/world/RpgTownArchitectureLayout";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";
import { getRpgLandmarkRenderTier } from "../app/world/RpgTownRenderTier";
import {
  createRpgRepeatedLandmarkInstances
} from "../app/world/RpgSignatureLandmarks";

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), `app/world/${name}`), "utf8");

describe("RPG town scene static ownership", () => {
  it("attaches sky and fog ambience directly to the scene before the town group", () => {
    const source = read("RpgTownScene.tsx");

    expect(source).toMatch(
      /return \(\s*<>\s*<RpgTownAmbience[\s\S]*?\/>\s*<group name="seamless-rpg-town">/
    );
  });

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

  it("gives every primary destination landmark a distinct readable signature", () => {
    const source = read("RpgSignatureLandmarks.tsx");
    const landmark = (id: string) =>
      RPG_LANDMARKS.find((candidate) => candidate.id === id);

    expect(landmark("tokyo-blue-tower")).toMatchObject({
      color: "#2879aa",
      accent: "#67edf0"
    });
    expect(landmark("gyukatsu-main-machiya")).toMatchObject({
      color: "#8c5846",
      accent: "#ffc86a"
    });
    expect(landmark("sakura-tree-01")).toMatchObject({
      color: "#5d3b35",
      accent: "#ffd1e1"
    });
    expect(landmark("sakura-bridge")).toMatchObject({
      color: "#d84c43",
      accent: "#ffd166"
    });
    expect(landmark("hanabi-apple-stall")).toMatchObject({
      color: "#b93642",
      accent: "#ffd166"
    });
    expect(landmark("hanabi-street-torii")).toMatchObject({
      color: "#d45242",
      accent: "#472129"
    });

    for (const signatureName of [
      "tokyo-blue-tower-signature",
      "gyukatsu-main-machiya-signature",
      "hanabi-apple-stall-signature"
    ]) {
      expect(source).toContain(`name="${signatureName}"`);
    }
    expect(source).toMatch(
      /function SakuraLandmark[\s\S]*?color=\{landmark\.accent\}[\s\S]*?function CanalDetails/
    );
    expect(source).toMatch(
      /function RepeatedLandmarkBatches[\s\S]*?emissive="#681611"[\s\S]*?richToriiInstances/
    );
  });

  it("puts landmark ownership and rotation-correct transforms on every rendered lantern and torii instance", () => {
    const repeatedLandmarks = RPG_LANDMARKS.filter(
      ({ kind }) => kind === "lantern" || kind === "torii"
    ).map((landmark, index) => ({
      ...landmark,
      rotationY: index % 2 === 0 ? Math.PI / 3 : -Math.PI / 4
    }));
    const instances = createRpgRepeatedLandmarkInstances(repeatedLandmarks);
    const source = read("RpgSignatureLandmarks.tsx");

    expect(source).toContain("userData={{ landmarkId: instance.landmarkId }}");
    for (const landmark of repeatedLandmarks) {
      const owned = instances.filter(
        ({ landmarkId }) => landmarkId === landmark.id
      );
      expect(owned, landmark.id).toHaveLength(
        landmark.kind === "lantern" ? 2 : 4
      );
      expect(
        owned.every(({ rotation }) => rotation[1] === landmark.rotationY),
        `${landmark.id}:rotation`
      ).toBe(true);
      if (landmark.kind === "torii") {
        const [firstPost, secondPost] = owned.filter(
          ({ part }) => part === "post"
        );
        const expectedOffset = landmark.size[0] * 0.34;
        expect(firstPost.position[0] - landmark.position[0]).toBeCloseTo(
          -expectedOffset * Math.cos(landmark.rotationY!)
        );
        expect(firstPost.position[2] - landmark.position[2]).toBeCloseTo(
          expectedOffset * Math.sin(landmark.rotationY!)
        );
        expect(secondPost.position[0] - landmark.position[0]).toBeCloseTo(
          expectedOffset * Math.cos(landmark.rotationY!)
        );
        expect(secondPost.position[2] - landmark.position[2]).toBeCloseTo(
          -expectedOffset * Math.sin(landmark.rotationY!)
        );
      }
    }
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

  it("owns the moving bus and NPC crowd only in their dynamic actor modules", () => {
    const scene = read("RpgTownScene.tsx");
    const landmarks = read("RpgSignatureLandmarks.tsx");
    const busActor = read("RpgAirportBusActor.tsx");
    const npcCrowd = read("RpgNpcCrowd.tsx");

    expect(scene).toContain("<RpgAirportBusActor");
    expect(scene).toContain("<RpgNpcCrowd");
    expect(busActor).toContain("<AirportBusModel");
    expect(busActor).toContain('name="rpg-airport-bus"');
    expect(npcCrowd).toContain("<RpgNpcCharacter3d");
    expect(landmarks).toMatch(/case "bus":\s+return null;/);
    expect(landmarks).toMatch(/case "npc":\s+return null;/);
    expect(landmarks).not.toContain("<AirportBusModel");
    expect(landmarks).not.toContain("<RpgNpcCharacter3d");
  });
});
