"use client";

import { useFrame } from "@react-three/fiber";
import { memo, type RefObject, useMemo, useRef } from "react";
import type { Group, PointsMaterial } from "three";
import {
  calculateRpgFireworkFrameInto,
  createRpgHanabiShell,
  getRpgHanabiRenderBudget,
  type RpgFireworkFrame,
  type RpgFireworkFrameInput,
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

export function calculateActiveRpgFireworkFrameInto(
  input: RpgFireworkFrameInput,
  target: RpgFireworkFrame
) {
  return calculateRpgFireworkFrameInto(input, target);
}

export function calculateActiveRpgFireworkFrame(
  input: RpgFireworkFrameInput
) {
  return calculateActiveRpgFireworkFrameInto(input, createFireworkFrame());
}

export function calculateActiveRpgFireworkTrailFrame({
  base,
  burst,
  trailSeconds
}: {
  base: Readonly<RpgFireworkFrame>;
  burst: RpgHanabiBurst;
  trailSeconds: number;
}) {
  const safeTrailSeconds = Number.isFinite(trailSeconds)
    ? Math.max(0, trailSeconds)
    : 0;
  const safeCycle = Number.isFinite(burst.cycle)
    ? Math.max(0.1, burst.cycle)
    : 4;
  const localSeconds = base.progress * safeCycle;
  if (!base.visible || localSeconds >= safeTrailSeconds) {
    return { visible: false, opacity: 0 } as const;
  }
  const fade = 1 - localSeconds / safeTrailSeconds;
  const opacity = base.opacity * 0.32 * fade;
  return { visible: opacity > 0.01, opacity } as const;
}

function createFireworkFrame(): RpgFireworkFrame {
  return {
    visible: false,
    progress: 0,
    expansion: 0,
    droop: 0,
    sizeEnvelope: 0,
    twinkle: 0,
    opacity: 0
  };
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
  const trailGroups = useRef<Array<{ visible: boolean } | null>>([]);
  const trailMaterials = useRef<Array<PointsMaterial | null>>([]);
  const fireworkFrames = useRef<RpgFireworkFrame[]>([]);

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
      const burst = shells[index].burst;
      const frame = calculateActiveRpgFireworkFrameInto(
        {
          elapsedSeconds: clock.elapsedTime,
          burst,
          intensity: hanabiIntensity,
          reducedMotion: qualitySettings.fireworks.softPulseOnly
        },
        fireworkFrames.current[index] ??= createFireworkFrame()
      );
      const trail = calculateActiveRpgFireworkTrailFrame({
        base: frame,
        burst,
        trailSeconds: qualitySettings.fireworks.trailSeconds
      });
      const group = fireworkGroups.current[index];
      const material = fireworkMaterials.current[index];
      const trailGroup = trailGroups.current[index];
      const trailMaterial = trailMaterials.current[index];
      if (group) group.visible = frame.visible;
      if (material) material.opacity = frame.opacity;
      if (trailGroup) trailGroup.visible = trail.visible;
      if (trailMaterial) trailMaterial.opacity = trail.opacity;
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
        <group
          key={burst.id}
          position={burst.position}
          scale={burst.radius}
        >
          <points
            ref={(group) => {
              fireworkGroups.current[index] = group;
            }}
            userData={{
              effectOwner: "RpgHanabiLayout",
              burstId: burst.id,
              layer: "base"
            }}
          >
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                args={[shell.positions, 3]}
              />
            </bufferGeometry>
            <pointsMaterial
              ref={(material) => {
                fireworkMaterials.current[index] = material;
              }}
              color={burst.color}
              size={qualitySettings.fireworks.pointSize}
              transparent
              depthWrite={false}
              blending={2}
            />
          </points>
          {hanabiBudget.shellLayers > 1 ? (
            <points
              ref={(group) => {
                trailGroups.current[index] = group;
              }}
              scale={0.92}
              userData={{
                effectOwner: "RpgHanabiLayout",
                burstId: burst.id,
                layer: "trail"
              }}
            >
              <bufferGeometry>
                <bufferAttribute
                  attach="attributes-position"
                  args={[shell.positions, 3]}
                />
              </bufferGeometry>
              <pointsMaterial
                ref={(material) => {
                  trailMaterials.current[index] = material;
                }}
                color={burst.color}
                size={0.13}
                transparent
                opacity={0}
                depthWrite={false}
                blending={2}
              />
            </points>
          ) : null}
        </group>
      ))}
    </group>
  );
});
