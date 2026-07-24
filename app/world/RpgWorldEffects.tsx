"use client";

import { useFrame } from "@react-three/fiber";
import { memo, type RefObject, useMemo, useRef } from "react";
import type { Group, PointsMaterial } from "three";
import {
  createRpgHanabiShell,
  getRpgHanabiRenderBudget
} from "./RpgHanabiLayout";
import type { RpgRegionPresentationState } from "./RpgRegionPresentation";
import { getSceneQuality, type SceneQualityLevel } from "./SceneQuality";

function createPetalPositions(count: number) {
  const values = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = index * 2.399963;
    values[index * 3] = 9 + Math.cos(angle) * (2 + (index % 9) * 0.34);
    values[index * 3 + 1] = 1.2 + (index % 13) * 0.24;
    values[index * 3 + 2] = -24 + Math.sin(angle) * (2 + (index % 7) * 0.42);
  }
  return values;
}

export const RpgWorldEffects = memo(function RpgWorldEffects({
  qualityLevel,
  presentation
}: {
  qualityLevel: SceneQualityLevel;
  presentation: RefObject<RpgRegionPresentationState>;
}) {
  const quality = getSceneQuality({ level: qualityLevel, reducedMotion: false });
  const petalCount = quality.petals.near + quality.petals.middle + quality.petals.far;
  const petalPositions = useMemo(() => createPetalPositions(petalCount), [petalCount]);
  const hanabiBudget = getRpgHanabiRenderBudget(qualityLevel);
  const shells = useMemo(
    () =>
      hanabiBudget.bursts.map((burst, index) => ({
        burst,
        shell: createRpgHanabiShell(hanabiBudget.particlesPerBurst, index + 1)
      })),
    [hanabiBudget]
  );
  const petalMaterial = useRef<PointsMaterial>(null);
  const petalGroup = useRef<Group>(null);
  const fireworkMaterials = useRef<Array<PointsMaterial | null>>([]);

  useFrame(({ clock }, delta) => {
    const state = presentation.current;
    const sakuraIntensity =
      state.zoneWeights.sakura * state.effectIntensity * (petalCount / 156);
    const hanabiIntensity =
      state.zoneWeights.hanabi *
      state.effectIntensity *
      (hanabiBudget.particlesPerBurst / 220);
    if (petalMaterial.current) {
      petalMaterial.current.opacity = Math.min(1, sakuraIntensity);
    }
    if (petalGroup.current) {
      petalGroup.current.rotation.y += delta * 0.08;
      petalGroup.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.18;
    }
    for (const material of fireworkMaterials.current) {
      if (material) material.opacity = Math.min(1, hanabiIntensity);
    }
  }, -1);

  return (
    <group name="rpg-world-effects">
      <group ref={petalGroup}>
        <points userData={{ effectOwner: "sakura-petals" }}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[petalPositions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            ref={petalMaterial}
            color="#f4a8c4"
            size={0.16}
            transparent
            depthWrite={false}
          />
        </points>
      </group>
      {shells.map(({ burst, shell }, index) => (
        <points
          key={burst.id}
          position={burst.position}
          scale={burst.radius}
          userData={{ effectOwner: "RpgHanabiLayout", burstId: burst.id }}
        >
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[shell.positions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            ref={(material) => {
              fireworkMaterials.current[index] = material;
            }}
            color={burst.color}
            size={0.18}
            transparent
            depthWrite={false}
            blending={2}
          />
        </points>
      ))}
    </group>
  );
});
