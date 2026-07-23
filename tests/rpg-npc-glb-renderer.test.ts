import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("rigged toon GLB NPC renderer", () => {
  const rendererSource = readFileSync(
    resolve(process.cwd(), "app/world/RpgNpcCharacter3d.tsx"),
    "utf8"
  );
  const sceneSource = readFileSync(
    resolve(process.cwd(), "app/world/RpgTownScene.tsx"),
    "utf8"
  );

  it("loads role GLBs from the local manifest and clones an independent skeleton", () => {
    expect(rendererSource).toContain("NPC_CHARACTER_MODELS[npcId]");
    expect(rendererSource).toContain(
      "useGLTF(modelDefinition.modelAsset, false, false)"
    );
    expect(rendererSource).toContain("cloneSkeleton(source)");
    expect(rendererSource).toContain("createRpgNpcRigAdapter(model)");
    expect(rendererSource).toContain("<primitive object={model}");
  });

  it("uses a one-pass vertex-color toon material without the PNG projection shader", () => {
    expect(rendererSource).toContain(
      'resolveRpgCharacterToonMaterial(object.material, "npc")'
    );
    expect(rendererSource).not.toContain("ShaderMaterial");
    expect(rendererSource).not.toContain("frontMap");
    expect(rendererSource).not.toContain("projectedUv");
    expect(rendererSource).not.toContain("mergeGeometries");
    expect(rendererSource).not.toContain("CapsuleGeometry");
  });

  it("removes NPC texture loading from the town crowd and publishes the new renderer", () => {
    expect(sceneSource).not.toContain("RPG_NPC_RUNTIME_ASSETS");
    expect(sceneSource).not.toContain("getNpcRuntimeAsset");
    expect(sceneSource).not.toContain("getNpcSpriteFootOffset");
    expect(sceneSource).not.toContain("texture={texture}");
    expect(sceneSource).not.toContain("footOffset={renderState.footOffset}");
    expect(sceneSource).toContain('dataset.npcRenderer = "rigged-toon-glb"');
  });
});
