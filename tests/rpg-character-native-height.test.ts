import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NPC_CHARACTER_MODELS } from "../app/world/NpcCharacterModels";
import { RPG_PLAYER_CHARACTER_DESIGNS } from "../app/world/RpgPlayerCharacterDesign";

function readModelHeight(modelAsset: string) {
  const file = readFileSync(resolve(process.cwd(), "public", modelAsset.slice(1)));
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.toString("utf8", 20, 20 + jsonLength).trimEnd()) as {
    accessors: Array<{ min: number[]; max: number[] }>;
    meshes: Array<{ primitives: Array<{ attributes: { POSITION: number } }> }>;
  };
  const position = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  return position.max[1] - position.min[1];
}

describe("rigged character native height matches the shipped mesh", () => {
  it.each(Object.entries(RPG_PLAYER_CHARACTER_DESIGNS))(
    "player %s declares the real GLB height so the render scale is exact",
    (character, design) => {
      const actual = readModelHeight(design.modelAsset);
      expect(design.nativeHeight, character).toBeCloseTo(actual, 2);
      const renderedHeight = actual * (design.height / design.nativeHeight);
      expect(renderedHeight, character).toBeCloseTo(design.height, 2);
    }
  );

  it.each(Object.entries(NPC_CHARACTER_MODELS))(
    "npc %s declares the real GLB height so the render scale is exact",
    (npcId, model) => {
      const actual = readModelHeight(model.modelAsset);
      expect(model.nativeHeight, npcId).toBeCloseTo(actual, 2);
      const renderedHeight = actual * (model.visibleHeight / model.nativeHeight);
      expect(renderedHeight, npcId).toBeCloseTo(model.visibleHeight, 2);
    }
  );
});
