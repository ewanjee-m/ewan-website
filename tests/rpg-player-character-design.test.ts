import { describe, expect, it } from "vitest";
import {
  RPG_PLAYER_CHARACTER_DESIGNS,
  getRpgPlayerCharacterDesign
} from "../app/world/RpgPlayerCharacterDesign";

describe("RPG rigged toon player character design", () => {
  it.each(["male", "female"] as const)(
    "defines %s as a local +Z-forward single-primitive GLB",
    (character) => {
      const design = getRpgPlayerCharacterDesign(character);

      expect(design.renderer).toBe("rigged-toon-glb");
      expect(design.forwardAxis).toBe("+z");
      expect(design.surfaceTechnique).toBe("smooth-vertex-color-toon");
      expect(design.modelAsset).toBe(
        `/assets/models/characters/player-${character}.glb`
      );
      expect(design.referenceAssets).toEqual({
        front: `/assets/characters/player-${character}.png`,
        back: `/assets/characters/player-${character}-back.png`
      });
      expect(design.rigId).toBe("ewan-humanoid-v1");
      expect(design.maxPrimitives).toBe(1);
      expect(design.height).toBe(character === "male" ? 2.58 : 2.62);
      expect(design.nativeHeight).toBeGreaterThan(design.height * 0.85);
      expect(design.nativeHeight).toBeLessThan(design.height * 1.15);
      expect(design.minimumDepth).toBeGreaterThanOrEqual(0.45);
      expect(design.articulatedJoints).toEqual(
        expect.arrayContaining([
          "pelvis",
          "chest",
          "leftHip",
          "rightHip",
          "leftKnee",
          "rightKnee",
          "leftShoulder",
          "rightShoulder",
          "leftElbow",
          "rightElbow"
        ])
      );
    }
  );

  it("preserves the approved male navy happi identity without angular body geometry", () => {
    const design = RPG_PLAYER_CHARACTER_DESIGNS.male;

    expect(design.garment).toBe("navy-happi");
    expect(design.hairStyle).toBe("short-layered");
    expect(design.palette.outerwear).toBe("#18385e");
    expect(design.palette.sash).toBe("#c94d38");
    expect(design.accessories).toContain("gold-omamori");
  });

  it("preserves the approved female long-hair pink-kimono identity", () => {
    const design = RPG_PLAYER_CHARACTER_DESIGNS.female;

    expect(design.garment).toBe("pink-kimono");
    expect(design.hairStyle).toBe("long-flowing");
    expect(design.palette.outerwear).toBe("#e97898");
    expect(design.palette.sash).toBe("#92264e");
    expect(design.accessories).toEqual(
      expect.arrayContaining(["sakura-hair-ornament", "gold-omamori"])
    );
  });

  it("matches both selectable players to the adult NPC height band", () => {
    expect(RPG_PLAYER_CHARACTER_DESIGNS.male.height).toBe(2.58);
    expect(RPG_PLAYER_CHARACTER_DESIGNS.female.height).toBe(2.62);
  });
});
