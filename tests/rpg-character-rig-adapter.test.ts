import { Bone, Group } from "three";
import { describe, expect, it } from "vitest";
import {
  createRpgCharacterMotion3dPose,
  type RpgCharacterMotion3dPose
} from "../app/world/RpgCharacterMotion3d";
import {
  REQUIRED_RPG_CHARACTER_BONES,
  createRpgCharacterRigAdapter
} from "../app/world/RpgCharacterRigAdapter";

function createRig() {
  const model = new Group();
  for (const name of REQUIRED_RPG_CHARACTER_BONES) {
    const bone = new Bone();
    bone.name = name;
    bone.position.y = name === "leftUpperLeg" || name === "rightUpperLeg" ? 1 : 0;
    model.add(bone);
  }
  return model;
}

function changedPose(): RpgCharacterMotion3dPose {
  return {
    ...createRpgCharacterMotion3dPose(),
    pelvisPitch: 0.11,
    pelvisYaw: -0.12,
    chestPitch: -0.13,
    chestYaw: 0.14,
    leftHipPitch: 0.31,
    rightHipPitch: -0.32,
    leftKneePitch: 0.41,
    rightKneePitch: 0.42,
    leftAnklePitch: -0.21,
    rightAnklePitch: -0.22,
    leftShoulderPitch: -0.51,
    rightShoulderPitch: 0.52,
    leftElbowPitch: 0.23,
    rightElbowPitch: 0.24,
    leftFootLift: 0.16,
    rightFootLift: 0.08,
    hairPitch: -0.06,
    hairYaw: 0.07,
    leftSleevePitch: -0.33,
    rightSleevePitch: 0.34,
    hemPitch: 0.05,
    hemYaw: -0.08
  };
}

describe("RPG GLB humanoid rig adapter", () => {
  it("rejects a model that cannot animate the full shared rig", () => {
    expect(() => createRpgCharacterRigAdapter(new Group())).toThrow(
      /missing bones/i
    );
  });

  it("maps the existing locomotion pose to GLB bones without changing scale", () => {
    const model = createRig();
    const adapter = createRpgCharacterRigAdapter(model);
    const pose = changedPose();

    adapter.applyPose(pose);

    expect(model.getObjectByName("hips")?.rotation.x).toBeCloseTo(0.11);
    expect(model.getObjectByName("hips")?.rotation.y).toBeCloseTo(-0.12);
    expect(model.getObjectByName("chest")?.rotation.x).toBeCloseTo(-0.13);
    expect(model.getObjectByName("chest")?.rotation.y).toBeCloseTo(0.14);
    expect(model.getObjectByName("leftUpperLeg")?.rotation.x).toBeCloseTo(0.31);
    expect(model.getObjectByName("rightUpperLeg")?.rotation.x).toBeCloseTo(-0.32);
    expect(model.getObjectByName("leftLowerLeg")?.rotation.x).toBeCloseTo(0.41);
    expect(model.getObjectByName("rightLowerLeg")?.rotation.x).toBeCloseTo(0.42);
    expect(model.getObjectByName("leftFoot")?.rotation.x).toBeCloseTo(-0.21);
    expect(model.getObjectByName("rightFoot")?.rotation.x).toBeCloseTo(-0.22);
    expect(model.getObjectByName("leftUpperArm")?.rotation.x).toBeCloseTo(-0.51);
    expect(model.getObjectByName("rightUpperArm")?.rotation.x).toBeCloseTo(0.52);
    expect(model.getObjectByName("leftLowerArm")?.rotation.x).toBeCloseTo(0.23);
    expect(model.getObjectByName("rightLowerArm")?.rotation.x).toBeCloseTo(0.24);
    expect(model.getObjectByName("hair")?.rotation.x).toBeCloseTo(-0.06);
    expect(model.getObjectByName("hair")?.rotation.y).toBeCloseTo(0.07);
    expect(model.getObjectByName("leftSleeve")?.rotation.x).toBeCloseTo(-0.33);
    expect(model.getObjectByName("rightSleeve")?.rotation.x).toBeCloseTo(0.34);
    expect(model.getObjectByName("hem")?.rotation.x).toBeCloseTo(0.05);
    expect(model.getObjectByName("hem")?.rotation.y).toBeCloseTo(-0.08);
    expect(model.getObjectByName("leftUpperLeg")?.position.y).toBeCloseTo(
      1 + 0.16 * 0.28
    );
    expect(model.getObjectByName("rightUpperLeg")?.position.y).toBeCloseTo(
      1 + 0.08 * 0.28
    );
    for (const name of REQUIRED_RPG_CHARACTER_BONES) {
      const scale = model.getObjectByName(name)?.scale;
      expect(scale?.x, name).toBe(1);
      expect(scale?.y, name).toBe(1);
      expect(scale?.z, name).toBe(1);
    }
  });

  it("restores the exact rest transform when the pose returns to idle", () => {
    const model = createRig();
    const hair = model.getObjectByName("hair");
    if (!hair) throw new Error("test hair bone missing");
    hair.rotation.z = 0.09;
    const adapter = createRpgCharacterRigAdapter(model);

    adapter.applyPose(changedPose());
    adapter.applyPose(createRpgCharacterMotion3dPose());

    expect(hair.rotation.x).toBeCloseTo(0);
    expect(hair.rotation.y).toBeCloseTo(0);
    expect(hair.rotation.z).toBeCloseTo(0.09);
    expect(model.getObjectByName("leftUpperLeg")?.position.y).toBeCloseTo(1);
    expect(model.getObjectByName("rightUpperLeg")?.position.y).toBeCloseTo(1);
  });
});
