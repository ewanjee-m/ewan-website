import { Bone } from "three";

export const RIG_ID = "ewan-humanoid-v1";

export const REQUIRED_BONES = [
  "root",
  "hips",
  "chest",
  "head",
  "leftEye",
  "rightEye",
  "jaw",
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
  "leftUpperLeg",
  "leftLowerLeg",
  "rightUpperLeg",
  "rightLowerLeg",
  "leftFoot",
  "rightFoot",
  "hair",
  "leftSleeve",
  "rightSleeve",
  "hem"
];

function addBone(parent, name, position) {
  const bone = new Bone();
  bone.name = name;
  bone.position.set(...position);
  parent?.add(bone);
  return bone;
}

export function createHumanoidRig(height) {
  const bones = {};
  bones.root = addBone(null, "root", [0, 0, 0]);
  bones.hips = addBone(bones.root, "hips", [0, height * 0.51, 0]);
  bones.chest = addBone(bones.hips, "chest", [0, height * 0.2, 0]);
  bones.head = addBone(bones.chest, "head", [0, height * 0.175, 0]);
  bones.leftEye = addBone(bones.head, "leftEye", [
    -height * 0.041,
    height * 0.012,
    height * 0.087
  ]);
  bones.rightEye = addBone(bones.head, "rightEye", [
    height * 0.041,
    height * 0.012,
    height * 0.087
  ]);
  bones.jaw = addBone(bones.head, "jaw", [0, -height * 0.045, height * 0.093]);
  bones.hair = addBone(bones.head, "hair", [0, 0, -height * 0.025]);

  for (const side of [-1, 1]) {
    const sideName = side < 0 ? "left" : "right";
    const upperArmName = `${sideName}UpperArm`;
    const lowerArmName = `${sideName}LowerArm`;
    const sleeveName = `${sideName}Sleeve`;
    const upperLegName = `${sideName}UpperLeg`;
    const lowerLegName = `${sideName}LowerLeg`;
    const footName = `${sideName}Foot`;

    bones[upperArmName] = addBone(bones.chest, upperArmName, [
      side * height * 0.125,
      height * 0.035,
      0
    ]);
    bones[lowerArmName] = addBone(bones[upperArmName], lowerArmName, [
      0,
      -height * 0.18,
      0
    ]);
    bones[sleeveName] = addBone(bones[upperArmName], sleeveName, [0, 0, 0]);
    bones[upperLegName] = addBone(bones.hips, upperLegName, [
      side * height * 0.061,
      -height * 0.01,
      0
    ]);
    bones[lowerLegName] = addBone(bones[upperLegName], lowerLegName, [
      0,
      -height * 0.215,
      0
    ]);
    bones[footName] = addBone(bones[lowerLegName], footName, [
      0,
      -height * 0.22,
      height * 0.028
    ]);
  }

  bones.hem = addBone(bones.hips, "hem", [0, 0, 0]);
  const orderedBones = REQUIRED_BONES.map((name) => bones[name]);
  const boneIndices = new Map(
    orderedBones.map((bone, index) => [bone.name, index])
  );
  return { root: bones.root, bones: orderedBones, boneIndices, named: bones };
}
