import type { Euler, Object3D, Vector3 } from "three";
import type { RpgCharacterMotion3dPose } from "./RpgCharacterMotion3d";

export const REQUIRED_RPG_CHARACTER_BONES = [
  "root",
  "hips",
  "chest",
  "head",
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
] as const;

type RpgCharacterBoneName = (typeof REQUIRED_RPG_CHARACTER_BONES)[number];

interface RestTransform {
  position: Vector3;
  rotation: Euler;
}

export interface RpgCharacterRigAdapter {
  applyPose: (pose: Readonly<RpgCharacterMotion3dPose>) => void;
}

function writeRotation(
  bone: Object3D,
  rest: Readonly<RestTransform>,
  pitch: number,
  yaw = 0
) {
  bone.rotation.set(
    rest.rotation.x + pitch,
    rest.rotation.y + yaw,
    rest.rotation.z,
    rest.rotation.order
  );
}

export function createRpgCharacterRigAdapter(
  model: Object3D
): RpgCharacterRigAdapter {
  const bones = {} as Record<RpgCharacterBoneName, Object3D>;
  const missing: string[] = [];

  for (const name of REQUIRED_RPG_CHARACTER_BONES) {
    const bone = model.getObjectByName(name);
    if (!bone) {
      missing.push(name);
    } else {
      bones[name] = bone;
    }
  }
  if (missing.length > 0) {
    throw new Error(`RPG character model is missing bones: ${missing.join(", ")}`);
  }

  const rest = Object.fromEntries(
    REQUIRED_RPG_CHARACTER_BONES.map((name) => [
      name,
      {
        position: bones[name].position.clone(),
        rotation: bones[name].rotation.clone()
      }
    ])
  ) as Record<RpgCharacterBoneName, RestTransform>;

  return {
    applyPose(pose) {
      writeRotation(bones.hips, rest.hips, pose.pelvisPitch, pose.pelvisYaw);
      writeRotation(bones.chest, rest.chest, pose.chestPitch, pose.chestYaw);
      writeRotation(bones.leftUpperLeg, rest.leftUpperLeg, pose.leftHipPitch);
      writeRotation(bones.rightUpperLeg, rest.rightUpperLeg, pose.rightHipPitch);
      writeRotation(bones.leftLowerLeg, rest.leftLowerLeg, pose.leftKneePitch);
      writeRotation(bones.rightLowerLeg, rest.rightLowerLeg, pose.rightKneePitch);
      writeRotation(bones.leftFoot, rest.leftFoot, pose.leftAnklePitch);
      writeRotation(bones.rightFoot, rest.rightFoot, pose.rightAnklePitch);
      writeRotation(
        bones.leftUpperArm,
        rest.leftUpperArm,
        pose.leftShoulderPitch
      );
      writeRotation(
        bones.rightUpperArm,
        rest.rightUpperArm,
        pose.rightShoulderPitch
      );
      writeRotation(
        bones.leftLowerArm,
        rest.leftLowerArm,
        pose.leftElbowPitch
      );
      writeRotation(
        bones.rightLowerArm,
        rest.rightLowerArm,
        pose.rightElbowPitch
      );
      writeRotation(bones.hair, rest.hair, pose.hairPitch, pose.hairYaw);
      writeRotation(
        bones.leftSleeve,
        rest.leftSleeve,
        pose.leftSleevePitch
      );
      writeRotation(
        bones.rightSleeve,
        rest.rightSleeve,
        pose.rightSleevePitch
      );
      writeRotation(bones.hem, rest.hem, pose.hemPitch, pose.hemYaw);

      bones.leftUpperLeg.position.copy(rest.leftUpperLeg.position);
      bones.leftUpperLeg.position.y += pose.leftFootLift * 0.28;
      bones.rightUpperLeg.position.copy(rest.rightUpperLeg.position);
      bones.rightUpperLeg.position.y += pose.rightFootLift * 0.28;
    }
  };
}
