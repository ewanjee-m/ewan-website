import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NPC_CHARACTER_MODELS } from "../app/world/NpcCharacterModels";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";

describe("smooth smiling rigged NPC characters", () => {
  const rendererSource = readFileSync(
    resolve(process.cwd(), "app/world/RpgNpcCharacter3d.tsx"),
    "utf8"
  );

  it("keeps adult and child models at the authored visible heights", () => {
    for (const npc of RPG_LANDMARKS.filter(({ kind }) => kind === "npc")) {
      const definition =
        NPC_CHARACTER_MODELS[npc.id as keyof typeof NPC_CHARACTER_MODELS];
      expect(definition.visibleHeight, npc.id).toBe(
        npc.id === "npc-hanabi-child" ? 2.2 : 2.525
      );
    }
  });

  it("renders role-specific skinned GLBs instead of camera-facing or merged capsules", () => {
    expect(rendererSource).toContain("NPC_CHARACTER_MODELS[npcId]");
    expect(rendererSource).toContain("createRpgNpcRigAdapter(model)");
    expect(rendererSource).toContain("cloneSkeleton(source)");
    expect(rendererSource).toContain("root.current");
    expect(rendererSource).not.toContain("<sprite");
    expect(rendererSource).not.toContain("mergeGeometries");
    expect(rendererSource).not.toContain("CapsuleGeometry");
    expect(rendererSource).not.toContain("ShaderMaterial");
  });

  it("keeps the camera from entering a nearby NPC model", () => {
    expect(rendererSource).toContain("shouldRenderRpgCharacter(");
    expect(rendererSource).toContain("NPC_CHARACTER_CAMERA_HIDE_DISTANCE");
  });
});
