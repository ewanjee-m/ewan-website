"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Vector3
} from "three";
import type { PlayerCharacterId } from "./CharacterAssets";
import {
  RpgAssetAvailabilityGate,
  RpgAssetBoundary
} from "./RpgAssetBoundary";
import { RpgFallbackCharacter3d } from "./RpgFallbackCharacter3d";
import {
  createRpgCharacterMotion3dPose,
  createRpgCharacterMotion3dState,
  evaluateRpgCharacterMotion3dInto
} from "./RpgCharacterMotion3d";
import {
  RpgPlayerCharacter3d,
  type RpgPlayerCharacter3dHandle
} from "./RpgPlayerCharacter3d";
import { getRpgPlayerCharacterDesign } from "./RpgPlayerCharacterDesign";
import type { SceneQualitySettings } from "./SceneQuality";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";
import { WORLD_RUN_SPEED, WORLD_WALK_SPEED } from "./WorldRuntime";

export function RpgPlayerActor({
  character,
  navigation,
  playerPosition,
  qualitySettings,
  reducedMotion,
  telemetry
}: {
  character: PlayerCharacterId;
  navigation: RefObject<WorldNavigationSnapshot>;
  playerPosition: RefObject<Vector3>;
  qualitySettings: SceneQualitySettings;
  reducedMotion: boolean;
  telemetry: RefObject<HTMLDivElement | null>;
}) {
  const root = useRef<Group>(null);
  const contactShadow = useRef<Mesh>(null);
  const contactShadowMaterial = useRef<MeshBasicMaterial>(null);
  const characterHandle = useRef<RpgPlayerCharacter3dHandle>(null);
  const motion = useRef(createRpgCharacterMotion3dState());
  const pose = useRef(createRpgCharacterMotion3dPose());
  const handleAssetError = () => {
    telemetry.current?.setAttribute("data-character-fallback", "true");
  };
  const fallback = (
    <RpgFallbackCharacter3d
      ref={characterHandle}
      character={character}
    />
  );

  useFrame((_, delta) => {
    const snapshot = navigation.current;
    if (!root.current || !snapshot) return;
    root.current.position.set(
      snapshot.position[0],
      snapshot.surfaceHeight,
      snapshot.position[2]
    );
    playerPosition.current.fromArray(snapshot.position);
    evaluateRpgCharacterMotion3dInto(
      motion.current,
      {
        deltaSeconds: delta,
        headingX: snapshot.heading[0],
        headingZ: snapshot.heading[2],
        moving: snapshot.moving,
        grounded: snapshot.grounded,
        jumpHeight: snapshot.jumpOffset,
        movementSpeedRatio:
          snapshot.locomotion === "run"
            ? WORLD_RUN_SPEED / WORLD_WALK_SPEED
            : 1,
        reducedMotion
      },
      pose.current
    );
    characterHandle.current?.applyPose(pose.current);
    if (contactShadow.current) {
      contactShadow.current.scale.set(
        pose.current.shadowScale,
        pose.current.shadowScale * 0.38,
        1
      );
    }
    if (contactShadowMaterial.current) {
      contactShadowMaterial.current.opacity =
        pose.current.shadowOpacity * 0.72;
    }
  });

  return (
    <group ref={root} name="rpg-player-actor">
      <mesh
        ref={contactShadow}
        name="rpg-player-contact-shadow"
        position={[0, 0.025, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
      >
        <circleGeometry args={[0.72, 32]} />
        <meshBasicMaterial
          ref={contactShadowMaterial}
          color="#07101d"
          depthWrite={false}
          opacity={0.35}
          toneMapped={false}
          transparent
        />
      </mesh>
      <RpgAssetAvailabilityGate
        assetId={`player-${character}`}
        src={getRpgPlayerCharacterDesign(character).modelAsset}
        fallback={fallback}
        onError={handleAssetError}
      >
        <RpgAssetBoundary
          assetId={`player-${character}`}
          fallback={fallback}
          onError={handleAssetError}
        >
          <RpgPlayerCharacter3d
            ref={characterHandle}
            character={character}
            guideActive={false}
            qualityLevel={qualitySettings.level}
          />
        </RpgAssetBoundary>
      </RpgAssetAvailabilityGate>
    </group>
  );
}
