import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readPngSize(assetPath: string) {
  const file = readFileSync(resolve(process.cwd(), "public", assetPath));
  expect(file.subarray(1, 4).toString("ascii")).toBe("PNG");
  return {
    width: file.readUInt32BE(16),
    height: file.readUInt32BE(20),
    colorType: file[25]
  };
}

function readWebpCanvasSize(assetPath: string) {
  const file = readFileSync(resolve(process.cwd(), "public", assetPath));
  expect(file.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(file.subarray(8, 12).toString("ascii")).toBe("WEBP");
  expect(file.subarray(12, 16).toString("ascii")).toBe("VP8X");
  return {
    width: file.readUIntLE(24, 3) + 1,
    height: file.readUIntLE(27, 3) + 1
  };
}

describe("selection, archived player, and in-world NPC texture quality", () => {
  it.each([
    "assets/characters/player-male.png",
    "assets/characters/player-female.png",
    "assets/npcs/npc-airport-traveler.png",
    "assets/npcs/npc-gyukatsu-chef.png",
    "assets/npcs/npc-sakura-visitor.png",
    "assets/npcs/npc-hanabi-yukata.png"
  ])("keeps the 1024 by 1536 RGBA source for %s", (assetPath) => {
    expect(readPngSize(assetPath)).toEqual({
      width: 1024,
      height: 1536,
      colorType: 6
    });
  });

  it.each([
    "assets/characters/runtime/player-male.webp",
    "assets/characters/runtime/player-female.webp",
    "assets/npcs/runtime/npc-airport-traveler.webp",
    "assets/npcs/runtime/npc-gyukatsu-chef.webp",
    "assets/npcs/runtime/npc-sakura-visitor.webp",
    "assets/npcs/runtime/npc-hanabi-yukata.webp"
  ])("serves a sharp 768 by 1152 runtime texture for %s", (assetPath) => {
    expect(readWebpCanvasSize(assetPath)).toEqual({
      width: 768,
      height: 1152
    });
  });
});
