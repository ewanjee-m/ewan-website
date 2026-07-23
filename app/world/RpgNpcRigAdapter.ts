import type { Euler, Object3D, Vector3 } from "three";
import type { NpcPatrolPose } from "./NpcPatrolMotion";
import { REQUIRED_RPG_CHARACTER_BONES } from "./RpgCharacterRigAdapter";

export const REQUIRED_RPG_NPC_BONES = [
  ...REQUIRED_RPG_CHARACTER_BONES,
  "leftEye",
  "rightEye",
  "jaw"
] as const;

type RpgNpcBoneName = (typeof REQUIRED_RPG_NPC_BONES)[number];

interface RestTransform {
  position: Vector3;
  rotation: Euler;
  scale: Vector3;
}

export interface RpgNpcRigAdapter {
  applyPose: (pose: Readonly<NpcPatrolPose>) => void;
}

function safePhase(value: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function createRpgNpcRigAdapter(model: Object3D): RpgNpcRigAdapter {
  const bones = {} as Record<RpgNpcBoneName, Object3D>;
  const missing: string[] = [];
  for (const name of REQUIRED_RPG_NPC_BONES) {
    const bone = model.getObjectByName(name);
    if (!bone) missing.push(name);
    else bones[name] = bone;
  }
  if (missing.length > 0) {
    throw new Error(`RPG NPC model is missing bones: ${missing.join(", ")}`);
  }

  const rest = Object.fromEntries(
    REQUIRED_RPG_NPC_BONES.map((name) => [
      name,
      {
        position: bones[name].position.clone(),
        rotation: bones[name].rotation.clone(),
        scale: bones[name].scale.clone()
      }
    ])
  ) as Record<RpgNpcBoneName, RestTransform>;

  function resetBone(name: RpgNpcBoneName) {
    bones[name].position.copy(rest[name].position);
    bones[name].rotation.copy(rest[name].rotation);
    bones[name].scale.copy(rest[name].scale);
  }

  return {
    applyPose(pose) {
      for (const name of REQUIRED_RPG_NPC_BONES) resetBone(name);

      const phase = safePhase(pose.phase);
      const stride =
        pose.animationKind === "walk" && Number.isFinite(pose.stride)
          ? Math.sin(pose.stride)
          : 0;
      const gesture = Math.sin(phase * Math.PI);

      if (pose.animationKind === "walk") {
        bones.leftUpperLeg.rotation.x += stride * 0.62;
        bones.rightUpperLeg.rotation.x -= stride * 0.62;
        bones.leftLowerLeg.rotation.x += Math.max(0, stride) * 0.68 + 0.06;
        bones.rightLowerLeg.rotation.x += Math.max(0, -stride) * 0.68 + 0.06;
        bones.leftFoot.rotation.x -= stride * 0.14;
        bones.rightFoot.rotation.x += stride * 0.14;
        bones.leftUpperArm.rotation.x -= stride * 0.42;
        bones.rightUpperArm.rotation.x += stride * 0.42;
        bones.leftLowerArm.rotation.x += Math.max(0, -stride) * 0.18;
        bones.rightLowerArm.rotation.x += Math.max(0, stride) * 0.18;
        bones.leftSleeve.rotation.x -= stride * 0.31;
        bones.rightSleeve.rotation.x += stride * 0.31;
        bones.hips.rotation.y += stride * 0.045;
        bones.chest.rotation.y -= stride * 0.04;
        bones.hair.rotation.x -= Math.abs(stride) * 0.035;
        bones.hem.rotation.x += Math.abs(stride) * 0.026;
      } else if (pose.animationKind === "wave") {
        bones.rightUpperArm.rotation.z += gesture * 2.1;
        bones.rightUpperArm.rotation.x -= gesture * 0.18;
        bones.rightLowerArm.rotation.z +=
          gesture * (0.32 + Math.sin(phase * Math.PI * 6) * 0.18);
        bones.rightSleeve.rotation.z += gesture * 1.3;
        bones.head.rotation.y -= gesture * 0.08;
      } else if (pose.animationKind === "talk") {
        bones.leftLowerArm.rotation.x += gesture * 0.32;
        bones.rightLowerArm.rotation.x += gesture * 0.28;
        bones.chest.rotation.y += Math.sin(phase * Math.PI * 2) * 0.045;
        bones.jaw.rotation.x += gesture * 0.18;
      } else if (pose.animationKind === "nod") {
        bones.head.rotation.x += gesture * 0.24;
        bones.chest.rotation.x += gesture * 0.035;
      } else if (pose.animationKind === "look-around") {
        bones.head.rotation.y += Math.sin(phase * Math.PI * 2) * 0.32;
        bones.hair.rotation.y -= Math.sin(phase * Math.PI * 2) * 0.1;
      } else if (pose.animationKind === "pause") {
        bones.chest.rotation.x += Math.sin(phase * Math.PI * 2) * 0.012;
      }

      if (pose.animationKind === "pause" || pose.animationKind === "idle") {
        const blinkDistance = (phase - 0.55) / 0.055;
        const blink = Math.exp(-(blinkDistance * blinkDistance));
        const eyeScale = 1 - blink * 0.86;
        bones.leftEye.scale.y = rest.leftEye.scale.y * eyeScale;
        bones.rightEye.scale.y = rest.rightEye.scale.y * eyeScale;
      }
    }
  };
}
