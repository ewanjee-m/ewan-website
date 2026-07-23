import { describe, expect, it, vi } from "vitest";
import {
  getPlayerCharacterAsset,
  getPlayerCharacterSprite,
  getPlayerRunSprite,
  getPlayerRunSpriteFootOffset,
  getPlayerRuntimeRunSprite,
  getPlayerRuntimeSprite,
  getPlayerSpriteFootOffset,
  getSelectedPlayerRuntimeManifest,
  selectPlayerRuntimeFrame,
  type PlayerCharacterId,
  type PlayerSpriteDirection
} from "../app/world/CharacterAssets";

const expectedFootOffsets = {
  male: {
    idle: { front: 259, back: 258, side: 272 },
    run: { front: [305, 306], back: [202, 190], side: [272, 234] }
  },
  female: {
    idle: { front: 134, back: 135, side: 207 },
    run: { front: [191, 194], back: [143, 144], side: [207, 274] }
  }
} as const;

const expectedRuntimeBasenames = (character: PlayerCharacterId) => [
  `player-${character}.webp`,
  `player-${character}-back.webp`,
  `player-${character}-run-front-a.webp`,
  `player-${character}-run-front-b.webp`,
  `player-${character}-run-back-a.webp`,
  `player-${character}-run-back-b.webp`,
  `player-${character}-run-right.webp`,
  `player-${character}-run-right-b.webp`
];

describe("approved player character assets", () => {
  it.each(["male", "female"] as const)(
    "preserves the approved %s selection PNG and archived PNG APIs",
    (character) => {
      expect(getPlayerCharacterAsset(character)).toBe(
        `/assets/characters/player-${character}.png`
      );
      expect(getPlayerCharacterSprite(character, "front")).toBe(
        getPlayerCharacterAsset(character)
      );
      expect(getPlayerCharacterSprite(character, "back")).toBe(
        `/assets/characters/player-${character}-back.png`
      );
      expect(getPlayerCharacterSprite(character, "side")).toBe(
        `/assets/characters/player-${character}-run-right.png`
      );
      expect(getPlayerRunSprite(character, "front", 0)).toContain(
        `player-${character}-run-front-a.png`
      );
      expect(getPlayerRuntimeSprite(character, "back")).toContain(
        `player-${character}-back.webp`
      );
      expect(getPlayerRuntimeRunSprite(character, "side", 1)).toContain(
        `player-${character}-run-right-b.webp`
      );
    }
  );

  it.each(["male", "female"] as const)(
    "exposes exactly eight frozen %s runtime frames with native metadata",
    (character) => {
      const manifest = getSelectedPlayerRuntimeManifest(character);
      const basenames = manifest.frames.map((frame) => frame.asset.split("/").at(-1));

      expect(manifest.character).toBe(character);
      expect(basenames).toEqual(expectedRuntimeBasenames(character));
      expect(new Set(basenames)).toHaveLength(8);
      expect(Object.isFrozen(manifest)).toBe(true);
      expect(Object.isFrozen(manifest.frames)).toBe(true);
      expect(Object.isFrozen(manifest.idle)).toBe(true);
      expect(Object.isFrozen(manifest.run)).toBe(true);
      expect(Object.isFrozen(manifest.run.front)).toBe(true);

      for (const frame of manifest.frames) {
        expect(frame.character).toBe(character);
        expect(frame.asset).not.toMatch(
          character === "male" ? /player-female(?:[.-])/ : /player-male(?:[.-])/
        );
        expect(frame.nativeWidth).toBe(768);
        expect(frame.nativeHeight).toBe(1152);
        expect(frame.aspectRatio).toBe(2 / 3);
        expect(frame.footOffset).toBeGreaterThan(0);
        expect(frame.footOffset).toBeLessThan(0.25);
        expect(Object.isFrozen(frame)).toBe(true);
      }
    }
  );

  it.each(["male", "female"] as const)(
    "records every approved per-frame %s foot offset exactly",
    (character) => {
      const expected = expectedFootOffsets[character];
      const manifest = getSelectedPlayerRuntimeManifest(character);

      for (const direction of ["front", "back", "side"] as const) {
        expect(getPlayerSpriteFootOffset(character, direction)).toBe(
          expected.idle[direction] / 1536
        );
        expect(manifest.idle[direction].footOffset).toBe(
          expected.idle[direction] / 1536
        );
        for (const frame of [0, 1] as const) {
          expect(getPlayerRunSpriteFootOffset(character, direction, frame)).toBe(
            expected.run[direction][frame] / 1536
          );
          expect(manifest.run[direction][frame].footOffset).toBe(
            expected.run[direction][frame] / 1536
          );
        }
      }
    }
  );

  it("uses side frame A for idle and selects only the requested movement frame", () => {
    const manifest = getSelectedPlayerRuntimeManifest("female");

    expect(selectPlayerRuntimeFrame(manifest, "side", false, 1)).toBe(
      manifest.run.side[0]
    );
    expect(selectPlayerRuntimeFrame(manifest, "side", true, 1)).toBe(
      manifest.run.side[1]
    );
    expect(manifest.idle.side.locomotion).toBe("idle-run");
    expect(manifest.run.side[0]).toBe(manifest.idle.side);
  });

  it("does not preload, import, fetch, or iterate the unselected identity", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.resetModules();
    const assets = await import("../app/world/CharacterAssets");
    const selected = assets.getSelectedPlayerRuntimeManifest("male");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(selected.frames).toHaveLength(8);
    expect(selected.frames.every((frame) => frame.character === "male")).toBe(true);
    expect(selected.frames.some((frame) => frame.asset.includes("female"))).toBe(false);
    fetchSpy.mockRestore();
  });

  it("keeps direction metadata aligned with each runtime lookup", () => {
    const manifest = getSelectedPlayerRuntimeManifest("male");
    for (const direction of ["front", "back", "side"] as readonly PlayerSpriteDirection[]) {
      expect(manifest.idle[direction].direction).toBe(direction);
      expect(manifest.run[direction].map((frame) => frame.direction)).toEqual([
        direction,
        direction
      ]);
    }
  });
});
