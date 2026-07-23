import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RPG_PLAYER_CHARACTER_DESIGNS } from "../app/world/RpgPlayerCharacterDesign";

describe("rigged toon GLB player renderer", () => {
  it.each(["male", "female"] as const)(
    "maps %s to a local single-primitive GLB and keeps the approved identity reference",
    (character) => {
      const design = RPG_PLAYER_CHARACTER_DESIGNS[character];

      expect(design.renderer).toBe("rigged-toon-glb");
      expect(design.surfaceTechnique).toBe("smooth-vertex-color-toon");
      expect(design.modelAsset).toBe(
        `/assets/models/characters/player-${character}.glb`
      );
      expect(design.modelAsset).not.toMatch(/^https?:/);
      expect(design.referenceAssets.front).toBe(
        `/assets/characters/player-${character}.png`
      );
      expect(design.referenceAssets.back).toBe(
        `/assets/characters/player-${character}-back.png`
      );
      expect(design.rigId).toBe("ewan-humanoid-v1");
      expect(design.maxPrimitives).toBe(1);
      expect(design.nativeHeight).toBeGreaterThan(2.5);
    }
  );

  it("loads and skeleton-clones a skinned model instead of building or projecting primitives", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/world/RpgPlayerCharacter3d.tsx"),
      "utf8"
    );

    expect(source).toContain("useGLTF");
    expect(source).toContain("cloneSkeleton");
    expect(source).toContain("createRpgCharacterRigAdapter");
    expect(source).toContain("resolveRpgCharacterToonMaterial");
    expect(source).toContain("<primitive object={model}");
    expect(source).not.toContain("ApprovedCharacterMaterial");
    expect(source).not.toContain("ApprovedCharacterTextureProvider");
    expect(source).not.toMatch(/<\w+Geometry/);
  });
});
