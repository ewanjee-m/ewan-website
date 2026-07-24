import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";

describe("rigged toon GLB NPC renderer", () => {
  const rendererSource = readFileSync(
    resolve(process.cwd(), "app/world/RpgNpcCharacter3d.tsx"),
    "utf8"
  );
  const crowdSource = readFileSync(
    resolve(process.cwd(), "app/world/RpgNpcCrowd.tsx"),
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

  it("renders every authored NPC through RpgNpcCharacter3d", () => {
    const npcIds = RPG_LANDMARKS
      .filter(({ kind }) => kind === "npc")
      .map(({ id }) => id);

    expect(npcIds).toHaveLength(7);
    expect(crowdSource).toContain("<RpgNpcCharacter3d");
  });

  it("removes a failed NPC asset obstacle without re-registering it from passive effects", () => {
    expect(crowdSource).toContain("componentDidCatch");
    expect(crowdSource).toContain("removeObstacle");
    expect(crowdSource).toContain("delete(landmark.id)");
    expect(crowdSource).not.toContain("assetFailed");
  });
});
