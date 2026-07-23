import { Bone, Group } from "three";
import { describe, expect, it } from "vitest";
import { createNpcPatrolPose } from "../app/world/NpcPatrolMotion";
import {
  REQUIRED_RPG_NPC_BONES,
  createRpgNpcRigAdapter
} from "../app/world/RpgNpcRigAdapter";

function createRig() {
  const model = new Group();
  for (const name of REQUIRED_RPG_NPC_BONES) {
    const bone = new Bone();
    bone.name = name;
    model.add(bone);
  }
  return model;
}

describe("RPG NPC skinned rig adapter", () => {
  it("alternates real hip, knee, shoulder, and sleeve bones while walking", () => {
    const model = createRig();
    const adapter = createRpgNpcRigAdapter(model);

    adapter.applyPose({
      ...createNpcPatrolPose(),
      animationKind: "walk",
      moving: true,
      stride: Math.PI / 2,
      phase: 0.25
    });

    expect(model.getObjectByName("leftUpperLeg")?.rotation.x).toBeGreaterThan(
      0.5
    );
    expect(model.getObjectByName("rightUpperLeg")?.rotation.x).toBeLessThan(
      -0.5
    );
    expect(model.getObjectByName("leftLowerLeg")?.rotation.x).toBeGreaterThan(
      0
    );
    expect(model.getObjectByName("leftUpperArm")?.rotation.x).toBeLessThan(0);
    expect(model.getObjectByName("rightUpperArm")?.rotation.x).toBeGreaterThan(
      0
    );
    expect(model.getObjectByName("leftSleeve")?.rotation.x).not.toBe(
      model.getObjectByName("rightSleeve")?.rotation.x
    );
  });

  it.each([
    ["wave", "rightUpperArm", "z"],
    ["talk", "jaw", "x"],
    ["nod", "head", "x"],
    ["look-around", "head", "y"]
  ] as const)("maps %s to a visible %s bone gesture", (kind, boneName, axis) => {
    const model = createRig();
    const adapter = createRpgNpcRigAdapter(model);

    adapter.applyPose({
      ...createNpcPatrolPose(),
      animationKind: kind,
      phase: kind === "look-around" ? 0.25 : 0.5
    });

    expect(Math.abs(model.getObjectByName(boneName)?.rotation[axis] ?? 0)).toBeGreaterThan(
      0.08
    );
  });

  it("blinks with eye bones and restores every facial scale at idle", () => {
    const model = createRig();
    const adapter = createRpgNpcRigAdapter(model);

    adapter.applyPose({
      ...createNpcPatrolPose(),
      animationKind: "pause",
      phase: 0.55
    });
    expect(model.getObjectByName("leftEye")?.scale.y).toBeLessThan(0.3);
    expect(model.getObjectByName("rightEye")?.scale.y).toBeLessThan(0.3);

    adapter.applyPose(createNpcPatrolPose());
    expect(model.getObjectByName("leftEye")?.scale.y).toBeCloseTo(1);
    expect(model.getObjectByName("rightEye")?.scale.y).toBeCloseTo(1);
    expect(model.getObjectByName("jaw")?.rotation.x).toBeCloseTo(0);
  });
});
