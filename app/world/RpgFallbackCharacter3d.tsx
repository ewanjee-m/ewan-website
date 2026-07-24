"use client";

import {
  forwardRef,
  useImperativeHandle,
  useRef
} from "react";
import type { Group } from "three";
import type { PlayerCharacterId } from "./CharacterAssets";
import type { RpgCharacterMotion3dPose } from "./RpgCharacterMotion3d";
import { getRpgPlayerCharacterDesign } from "./RpgPlayerCharacterDesign";
import type { RpgPlayerCharacter3dHandle } from "./RpgPlayerCharacter3d";

export const RpgFallbackCharacter3d = forwardRef<
  RpgPlayerCharacter3dHandle,
  { character: PlayerCharacterId }
>(function RpgFallbackCharacter3d({ character }, forwardedRef) {
  const root = useRef<Group>(null);
  const design = getRpgPlayerCharacterDesign(character);
  const bodyHeight = design.height * 0.58;
  const bodyRadius = design.height * 0.16;
  const headRadius = design.height * 0.13;

  useImperativeHandle(forwardedRef, () => ({
    applyPose(pose: Readonly<RpgCharacterMotion3dPose>) {
      if (!root.current) return;
      root.current.position.y = pose.rootY;
      root.current.rotation.set(
        pose.rootLean,
        pose.rootYaw,
        pose.rootRoll
      );
      root.current.scale.set(
        pose.rootScaleX,
        pose.rootScaleY,
        pose.rootScaleZ
      );
    }
  }));

  return (
    <group ref={root} name="rpg-player-fallback-character">
      <mesh position={[0, bodyHeight / 2 + bodyRadius, 0]} castShadow>
        <capsuleGeometry
          args={[bodyRadius, bodyHeight, 6, 12]}
        />
        <meshStandardMaterial color="#d85b61" roughness={0.74} />
      </mesh>
      <mesh
        position={[
          0,
          bodyHeight + bodyRadius * 2 + headRadius,
          0
        ]}
        castShadow
      >
        <sphereGeometry args={[headRadius, 14, 10]} />
        <meshStandardMaterial color="#f2c7a4" roughness={0.8} />
      </mesh>
      <mesh
        position={[0, bodyHeight * 0.66, bodyRadius * 1.45]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <coneGeometry args={[bodyRadius * 0.45, bodyRadius, 3]} />
        <meshStandardMaterial color="#f6d365" roughness={0.72} />
      </mesh>
    </group>
  );
});
