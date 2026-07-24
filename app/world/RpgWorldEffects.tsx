"use client";

import { useFrame } from "@react-three/fiber";
import { memo, type RefObject, useMemo, useRef } from "react";
import type { Group, PointsMaterial } from "three";
import {
  createRpgHanabiShell,
  getRpgHanabiRenderBudget,
  type RpgHanabiBurst
} from "./RpgHanabiLayout";
import type { RpgRegionPresentationState } from "./RpgRegionPresentation";
import type { SceneQualitySettings } from "./SceneQuality";

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

export function calculateActiveRpgFireworkFrame({
  elapsedSeconds,
  burst,
  intensity,
  trailSeconds
}: {
  elapsedSeconds: number;
  burst: RpgHanabiBurst;
  intensity: number;
  trailSeconds: number;
}) {
  const elapsed = elapsedSeconds - burst.delay;
  if (elapsed < 0 || intensity <= 0) {
    return { visible: false, opacity: 0 } as const;
  }
  const localTime = elapsed % burst.cycle;
  const lifetime = Math.min(burst.cycle * 0.9, 0.3 + trailSeconds);
  if (localTime >= lifetime) {
    return { visible: false, opacity: 0 } as const;
  }
  const fade = Math.max(0, 1 - localTime / lifetime);
  const opacity = Math.min(1, Math.max(0, intensity) * fade);
  return { visible: opacity > 0.01, opacity } as const;
}

export const RpgWorldEffects = memo(function RpgWorldEffects({
  qualitySettings,
  presentation
}: {
  qualitySettings: SceneQualitySettings;
  presentation: RefObject<RpgRegionPresentationState>;
}) {
  const petalCount =
    qualitySettings.petals.near +
    qualitySettings.petals.middle +
    qualitySettings.petals.far;
  const petalPositions = useMemo(() => createPetalPositions(petalCount), [petalCount]);
  const hanabiBudget = getRpgHanabiRenderBudget(qualitySettings.level);
  const shells = useMemo(
    () =>
      hanabiBudget.bursts.map((burst, index) => ({
        burst,
        shell: createRpgHanabiShell(
          qualitySettings.fireworks.particlesPerBurst,
          index + 1
        )
      })),
    [hanabiBudget, qualitySettings.fireworks.particlesPerBurst]
  );
  const petalMaterial = useRef<PointsMaterial>(null);
  const petalGroup = useRef<Group>(null);
  const fireworkGroups = useRef<Array<{ visible: boolean } | null>>([]);
  const fireworkMaterials = useRef<Array<PointsMaterial | null>>([]);

  useFrame(({ clock }, delta) => {
    const state = presentation.current;
    const sakuraIntensity =
      state.zoneWeights.sakura * state.effectIntensity * (petalCount / 156);
    const hanabiIntensity =
      state.zoneWeights.hanabi *
      state.effectIntensity *
      (qualitySettings.fireworks.particlesPerBurst /
        getRpgHanabiRenderBudget("high").particlesPerBurst);
    if (petalMaterial.current) {
      petalMaterial.current.opacity = Math.min(1, sakuraIntensity);
    }
    if (petalGroup.current) {
      petalGroup.current.rotation.y += delta * 0.08;
      petalGroup.current.position.y = Math.sin(clock.elapsedTime * 0.5) * 0.18;
    }
    for (let index = 0; index < shells.length; index += 1) {
      const frame = calculateActiveRpgFireworkFrame({
        elapsedSeconds: clock.elapsedTime,
        burst: shells[index].burst,
        intensity: hanabiIntensity,
        trailSeconds: qualitySettings.fireworks.trailSeconds
      });
      const group = fireworkGroups.current[index];
      const material = fireworkMaterials.current[index];
      if (group) group.visible = frame.visible;
      if (material) material.opacity = frame.opacity;
    }
  }, -1);

  return (
    <group
      name="rpg-world-effects"
      userData={{
        fireworkTrailSeconds: qualitySettings.fireworks.trailSeconds
      }}
    >
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
          ref={(group) => {
            fireworkGroups.current[index] = group;
          }}
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
