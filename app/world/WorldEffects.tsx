"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  LineBasicMaterial,
  MeshBasicMaterial,
  Object3D,
  PointsMaterial,
  Quaternion,
  ShaderMaterial,
  Texture,
  Vector3
} from "three";
import { getSceneQuality, type SceneQualityLevel } from "./SceneQuality";
import { isZoneDetailed } from "./ZoneDetail";
import {
  createWorldTimeline,
  createWorldTimelineSnapshot,
  type WorldTimelineSnapshot
} from "./WorldTimeline";
import { SKY_GRADIENT_PROFILE } from "./WorldSceneLayout";

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function subscribeToReducedMotion(onChange: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function readReducedMotion() {
  return typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

interface Palette {
  skyFrom: string;
  skyTo: string;
  fogFrom: string;
  fogTo: string;
  skyLightFrom: string;
  skyLightTo: string;
  groundLightFrom: string;
  groundLightTo: string;
  lightFrom: number;
  lightTo: number;
}

const PALETTES: Record<WorldTimelineSnapshot["phase"], Palette> = {
  lateAfternoon: {
        skyFrom: "#83b8cf",
        skyTo: "#e5a06f",
        fogFrom: "#91b8bd",
        fogTo: "#b88078",
        skyLightFrom: "#b9ddff",
        skyLightTo: "#ffd6aa",
        groundLightFrom: "#5f6f67",
        groundLightTo: "#6f4c58",
        lightFrom: 2.2,
        lightTo: 1.9
      },
  sunset: {
        skyFrom: "#e5a06f",
        skyTo: "#9d536e",
        fogFrom: "#b88078",
        fogTo: "#635173",
        skyLightFrom: "#ffd6aa",
        skyLightTo: "#a8a6dd",
        groundLightFrom: "#6f4c58",
        groundLightTo: "#3e3854",
        lightFrom: 1.9,
        lightTo: 1.55
      },
  blueEvening: {
        skyFrom: "#9d536e",
        skyTo: "#273d70",
        fogFrom: "#635173",
        fogTo: "#1a3152",
        skyLightFrom: "#a8a6dd",
        skyLightTo: "#779bc8",
        groundLightFrom: "#3e3854",
        groundLightTo: "#24243c",
        lightFrom: 1.55,
        lightTo: 1.25
      },
  night: {
        skyFrom: "#273d70",
        skyTo: "#07152e",
        fogFrom: "#1a3152",
        fogTo: "#0b1d37",
        skyLightFrom: "#779bc8",
        skyLightTo: "#536eaa",
        groundLightFrom: "#24243c",
        groundLightTo: "#261a37",
        lightFrom: 1.25,
        lightTo: 0.9
      }
};

interface SkyGradientStops {
  topFrom: string;
  topTo: string;
  horizonFrom: string;
  horizonTo: string;
  lowerFrom: string;
  lowerTo: string;
}

const SKY_GRADIENTS: Record<
  WorldTimelineSnapshot["phase"],
  SkyGradientStops
> = {
  lateAfternoon: {
    topFrom: "#72acd1",
    topTo: "#788bb8",
    horizonFrom: "#f7dfbd",
    horizonTo: "#e9aa8d",
    lowerFrom: "#9fc4c0",
    lowerTo: "#9b7783"
  },
  sunset: {
    topFrom: "#788bb8",
    topTo: "#536994",
    horizonFrom: "#e9aa8d",
    horizonTo: "#c77c91",
    lowerFrom: "#9b7783",
    lowerTo: "#59516f"
  },
  blueEvening: {
    topFrom: "#3b4d82",
    topTo: "#173160",
    horizonFrom: "#ca637c",
    horizonTo: "#596b99",
    lowerFrom: "#59516f",
    lowerTo: "#273859"
  },
  night: {
    topFrom: "#173160",
    topTo: "#041128",
    horizonFrom: "#596b99",
    horizonTo: "#152c53",
    lowerFrom: "#273859",
    lowerTo: "#09172e"
  }
};

const SKY_VERTEX_SHADER = `
  varying vec3 worldDirection;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    worldDirection = normalize(worldPosition.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 lowerColor;
  uniform vec3 upDirection;
  varying vec3 worldDirection;

  void main() {
    float height = dot(normalize(worldDirection), normalize(upDirection));
    float lowerBlend = smoothstep(${SKY_GRADIENT_PROFILE.lowerStart}, ${SKY_GRADIENT_PROFILE.lowerEnd}, height);
    float upperBlend = smoothstep(${SKY_GRADIENT_PROFILE.upperStart}, ${SKY_GRADIENT_PROFILE.upperEnd}, height);
    vec3 lowerGradient = mix(lowerColor, horizonColor, lowerBlend);
    vec3 sky = mix(lowerGradient, topColor, upperBlend);
    gl_FragColor = vec4(sky, 1.0);
  }
`;

function getPalette(snapshot: WorldTimelineSnapshot): Palette {
  return PALETTES[snapshot.phase];
}

const colorCache = new Map<string, Color>();

function getCachedColor(value: string) {
  let color = colorCache.get(value);
  if (!color) {
    color = new Color(value);
    colorCache.set(value, color);
  }
  return color;
}

function lerpColor(target: Color, from: string, to: string, progress: number) {
  target.lerpColors(getCachedColor(from), getCachedColor(to), progress);
}

const HANABI_CYCLE_SECONDS = 5;
const HANABI_BURSTS = [
  {
    id: "gold-crown-left",
    position: [-3.45, 6.45, -0.8] as const,
    color: "#f6bd55",
    delay: 0,
    size: 1.18
  },
  {
    id: "coral-peony-right",
    position: [3.35, 5.65, 0.3] as const,
    color: "#ff786d",
    delay: 0.08,
    size: 1.02
  },
  {
    id: "sakura-chrysanthemum-high",
    position: [0.2, 7.85, -0.5] as const,
    color: "#f39abc",
    delay: 0.16,
    size: 1.28
  },
  {
    id: "blue-ring-left",
    position: [-3.9, 4.85, 0.8] as const,
    color: "#9dd9ff",
    delay: 0.75,
    size: 0.86
  },
  {
    id: "gold-willow-right",
    position: [3.8, 6.85, -1] as const,
    color: "#ffe088",
    delay: 0.83,
    size: 1.08
  },
  {
    id: "coral-bloom-low",
    position: [-2.5, 5.05, 1.1] as const,
    color: "#ff9a78",
    delay: 0.91,
    size: 0.78
  },
  {
    id: "sakura-bloom-right",
    position: [2.55, 6.15, 0.7] as const,
    color: "#f7b0d0",
    delay: 2.15,
    size: 0.92
  },
  {
    id: "gold-crown-center",
    position: [0, 8.55, -1.4] as const,
    color: "#ffe088",
    delay: 2.23,
    size: 1.34
  },
  {
    id: "blue-ring-high",
    position: [-2.65, 7.45, -0.2] as const,
    color: "#b9e2ff",
    delay: 3.55,
    size: 0.82
  },
  {
    id: "coral-finale-right",
    position: [2.95, 7.75, 0.6] as const,
    color: "#ff8c86",
    delay: 3.63,
    size: 1.12
  }
] as const;

const HANABI_REFLECTIONS = [
  {
    id: "gold-river-left",
    burstIndex: 0,
    color: "#f6bd55",
    position: [4.72, -0.055, -2.35] as const,
    scale: [0.34, 1.55, 1] as const
  },
  {
    id: "coral-river-right",
    burstIndex: 1,
    color: "#ff786d",
    position: [5.32, -0.052, -0.82] as const,
    scale: [0.42, 1.85, 1] as const
  },
  {
    id: "sakura-river-center",
    burstIndex: 2,
    color: "#f39abc",
    position: [4.88, -0.049, 0.92] as const,
    scale: [0.38, 1.7, 1] as const
  },
  {
    id: "blue-river-high",
    burstIndex: 3,
    color: "#9dd9ff",
    position: [5.45, -0.046, 2.38] as const,
    scale: [0.3, 1.38, 1] as const
  }
] as const;

interface HanabiFrameInput {
  elapsedSeconds: number;
  intensity: number;
  trailSeconds: number;
  reducedMotion: boolean;
}

export interface HanabiBurstFrame {
  id: string;
  opacity: number;
  scale: number;
}

export interface HanabiReflectionFrame {
  id: string;
  color: string;
  opacity: number;
}

export function calculateHanabiReflectionFrameInto(
  bursts: readonly HanabiBurstFrame[],
  output: HanabiReflectionFrame[]
): HanabiReflectionFrame[] {
  for (let index = 0; index < HANABI_REFLECTIONS.length; index += 1) {
    const reflection = HANABI_REFLECTIONS[index];
    const burstOpacity = bursts[reflection.burstIndex]?.opacity ?? 0;
    const frame = output[index] ?? {
      id: reflection.id,
      color: reflection.color,
      opacity: 0
    };
    frame.id = reflection.id;
    frame.color = reflection.color;
    frame.opacity = Math.min(0.32, burstOpacity * 0.44);
    output[index] = frame;
  }
  output.length = HANABI_REFLECTIONS.length;
  return output;
}

export function calculateHanabiFrameInto(
  {
    elapsedSeconds,
    intensity,
    trailSeconds,
    reducedMotion
  }: HanabiFrameInput,
  output: HanabiBurstFrame[]
): HanabiBurstFrame[] {
  const availableIntensity = Math.min(1, Math.max(0, intensity));
  if (availableIntensity === 0) {
    output.length = 0;
    return output;
  }
  let combinedEnvelope = 0;
  for (let index = 0; index < HANABI_BURSTS.length; index += 1) {
    const burst = HANABI_BURSTS[index];
    const localTime =
      ((elapsedSeconds - burst.delay) % HANABI_CYCLE_SECONDS +
        HANABI_CYCLE_SECONDS) %
      HANABI_CYCLE_SECONDS;
    const expansion = Math.min(1, Math.max(0, localTime / 1.15));
    const fadeStart = Math.max(0.28, trailSeconds);
    const fade = Math.max(
      0,
      1 - Math.max(0, localTime - fadeStart) / 1.35
    );
    const pulse = 0.92 + Math.sin(localTime * 2) * 0.04;
    const fadeIn = reducedMotion
      ? Math.min(1, Math.max(0, localTime / 0.45))
      : expansion > 0
        ? 1
        : 0;

    const opacityEnvelope = fade * fadeIn;
    const frame = output[index] ?? {
      id: burst.id,
      opacity: 0,
      scale: 0
    };
    frame.id = burst.id;
    frame.opacity = opacityEnvelope;
    frame.scale = reducedMotion
      ? 1.18 * pulse * burst.size
      : (0.04 + expansion * 1.22) * burst.size;
    output[index] = frame;
    combinedEnvelope += opacityEnvelope;
  }
  output.length = HANABI_BURSTS.length;
  const opacityScale =
    combinedEnvelope > 0 ? Math.min(0.72, 3.6 / combinedEnvelope) : 0;
  for (const frame of output) {
    frame.opacity *= availableIntensity * opacityScale;
  }
  return output;
}

export function calculateHanabiFrame(
  input: HanabiFrameInput
): HanabiBurstFrame[] {
  return calculateHanabiFrameInto(input, []);
}

const FIREWORK_TRAIL_POINTS = 3;

export function createFireworkParticlePositions(
  particles: number,
  seed: number
) {
  const values = new Float32Array(Math.max(0, particles) * 3);
  if (particles <= 0) {
    return values;
  }
  const random = seededRandom(seed);
  const rayCount = Math.max(1, Math.floor(particles / FIREWORK_TRAIL_POINTS));
  const rotation = random() * 0.08;
  for (let ray = 0; ray < rayCount; ray += 1) {
    const angle = (ray / rayCount) * Math.PI * 2 + rotation;
    const stretch = 0.94 + random() * 0.14;
    const directionX = Math.cos(angle) * stretch;
    const directionY = Math.sin(angle) * stretch;
    const directionZ = (random() - 0.5) * 0.12;

    for (let trail = 0; trail < FIREWORK_TRAIL_POINTS; trail += 1) {
      const index = ray * FIREWORK_TRAIL_POINTS + trail;
      if (index >= particles) {
        break;
      }
      const distance = 0.14 + trail * 0.41;
      values[index * 3] = directionX * distance;
      values[index * 3 + 1] = directionY * distance;
      values[index * 3 + 2] = directionZ * distance;
    }
  }
  return values;
}

export function createFireworkRaySegmentPositions(
  particlePositions: Float32Array
) {
  const rayCount = Math.floor(
    particlePositions.length / (FIREWORK_TRAIL_POINTS * 3)
  );
  const values = new Float32Array(rayCount * 6);
  for (let ray = 0; ray < rayCount; ray += 1) {
    const particleOffset = ray * FIREWORK_TRAIL_POINTS * 3;
    const segmentOffset = ray * 6;
    values.set(
      particlePositions.subarray(particleOffset, particleOffset + 3),
      segmentOffset
    );
    values.set(
      particlePositions.subarray(particleOffset + 6, particleOffset + 9),
      segmentOffset + 3
    );
  }
  return values;
}

function FireworkBurst({
  position,
  color,
  delay,
  particles,
  texture,
  groupRef,
  materialRef,
  lineMaterialRef,
  coreMaterialRef
}: {
  position: [number, number, number];
  color: string;
  delay: number;
  particles: number;
  texture: Texture;
  groupRef: (group: Group | null) => void;
  materialRef: (material: PointsMaterial | null) => void;
  lineMaterialRef: (material: LineBasicMaterial | null) => void;
  coreMaterialRef: (material: MeshBasicMaterial | null) => void;
}) {
  const positions = useMemo(
    () =>
      createFireworkParticlePositions(
        particles,
        1701 + Math.round(delay * 100)
      ),
    [delay, particles]
  );
  const raySegments = useMemo(
    () => createFireworkRaySegmentPositions(positions),
    [positions]
  );

  return (
    <group ref={groupRef} position={position} visible={false}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[raySegments, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          ref={lineMaterialRef}
          color={color}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </lineSegments>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={materialRef}
          color={color}
          map={texture}
          alphaTest={0.015}
          size={0.16}
          sizeAttenuation
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>
      <mesh>
        <circleGeometry args={[0.024, 14]} />
        <meshBasicMaterial
          ref={coreMaterialRef}
          color={color}
          map={texture}
          alphaTest={0.015}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function Hanabi({
  intensity,
  quality,
  reducedMotion,
  playerPosition,
  qualityLevel
}: {
  intensity: React.RefObject<number>;
  quality: ReturnType<typeof getSceneQuality>;
  reducedMotion: boolean;
  playerPosition: React.RefObject<Vector3>;
  qualityLevel: SceneQualityLevel;
}) {
  const glowTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.16, "rgba(255,255,255,0.98)");
      gradient.addColorStop(0.5, "rgba(255,255,255,0.42)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 64, 64);
    }
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => glowTexture.dispose(), [glowTexture]);
  const burstGroups = useRef<Array<Group | null>>([]);
  const burstMaterials = useRef<Array<PointsMaterial | null>>([]);
  const rayMaterials = useRef<Array<LineBasicMaterial | null>>([]);
  const coreMaterials = useRef<Array<MeshBasicMaterial | null>>([]);
  const reflectionMaterials = useRef<Array<MeshBasicMaterial | null>>([]);
  const frameBuffer = useRef<HanabiBurstFrame[]>([]);
  const reflectionFrameBuffer = useRef<HanabiReflectionFrame[]>([]);
  const hadVisibleBurst = useRef(false);
  const frameInput = useRef<HanabiFrameInput>({
    elapsedSeconds: 0,
    intensity: 0,
    trailSeconds: quality.fireworks.trailSeconds,
    reducedMotion
  });
  const surface = useMemo(() => new Vector3(0, -0.5, 0.866).normalize(), []);
  const position = useMemo(() => surface.clone().multiplyScalar(12.2), [surface]);
  const quaternion = useMemo(
    () => new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), surface),
    [surface]
  );
  const parentQuaternionInverse = useMemo(
    () => quaternion.clone().invert(),
    [quaternion]
  );
  const billboardQuaternion = useMemo(() => new Quaternion(), []);

  useFrame(({ camera, clock }) => {
    const player = playerPosition.current;
    const active =
      !player ||
      isZoneDetailed(player, (Math.PI * 4) / 3, qualityLevel);
    const availableIntensity = active ? intensity.current ?? 0 : 0;
    const input = frameInput.current;
    input.elapsedSeconds = clock.elapsedTime;
    input.intensity = availableIntensity;
    input.trailSeconds = quality.fireworks.trailSeconds;
    input.reducedMotion = reducedMotion;
    const frame = calculateHanabiFrameInto(
      input,
      frameBuffer.current
    );
    const reflections = calculateHanabiReflectionFrameInto(
      frame,
      reflectionFrameBuffer.current
    );

    if (frame.length === 0) {
      for (let index = 0; index < burstGroups.current.length; index += 1) {
        const rayMaterial = rayMaterials.current[index];
        const coreMaterial = coreMaterials.current[index];
        if (rayMaterial) {
          rayMaterial.opacity = 0;
        }
        if (coreMaterial) {
          coreMaterial.opacity = 0;
        }
      }
      for (let index = 0; index < reflections.length; index += 1) {
        const reflectionMaterial = reflectionMaterials.current[index];
        if (reflectionMaterial) {
          reflectionMaterial.opacity = 0;
        }
      }
      if (hadVisibleBurst.current) {
        for (let index = 0; index < burstGroups.current.length; index += 1) {
          const group = burstGroups.current[index];
          if (group) {
            group.visible = false;
          }
        }
        hadVisibleBurst.current = false;
      }
      return;
    }

    let anyVisible = false;
    billboardQuaternion
      .copy(parentQuaternionInverse)
      .multiply(camera.quaternion);
    for (let index = 0; index < frame.length; index += 1) {
      const group = burstGroups.current[index];
      if (group) {
        group.visible = frame[index].opacity > 0;
        anyVisible ||= group.visible;
        group.scale.setScalar(frame[index].scale);
        group.quaternion.copy(billboardQuaternion);
      }
      const material = burstMaterials.current[index];
      if (material) {
        material.opacity = frame[index].opacity * 0.58;
      }
      const rayMaterial = rayMaterials.current[index];
      if (rayMaterial) {
        rayMaterial.opacity = frame[index].opacity * 0.78;
      }
      const coreMaterial = coreMaterials.current[index];
      if (coreMaterial) {
        coreMaterial.opacity = Math.min(0.42, frame[index].opacity * 0.6);
      }
    }
    for (let index = 0; index < reflections.length; index += 1) {
      const reflectionMaterial = reflectionMaterials.current[index];
      if (reflectionMaterial) {
        reflectionMaterial.opacity = reflections[index].opacity;
      }
    }
    hadVisibleBurst.current = anyVisible;
  });

  return (
    <group position={position} quaternion={quaternion}>
      {HANABI_BURSTS.map((burst, index) => (
        <FireworkBurst
          key={burst.id}
          position={[
            burst.position[0] * 0.78,
            Math.min(burst.position[1], 7.35),
            burst.position[2]
          ]}
          color={burst.color}
          delay={burst.delay}
          particles={quality.fireworks.particlesPerBurst}
          texture={glowTexture}
          groupRef={(group) => {
            burstGroups.current[index] = group;
          }}
          materialRef={(material) => {
            burstMaterials.current[index] = material;
          }}
          lineMaterialRef={(material) => {
            rayMaterials.current[index] = material;
          }}
          coreMaterialRef={(material) => {
            coreMaterials.current[index] = material;
          }}
        />
      ))}
      {HANABI_REFLECTIONS.map((reflection, index) => (
        <mesh
          key={reflection.id}
          position={[...reflection.position]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[...reflection.scale]}
        >
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial
            ref={(material) => {
              reflectionMaterials.current[index] = material;
            }}
            color={reflection.color}
            transparent
            opacity={0}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}
    </group>
  );
}

export function SakuraPetals({
  count,
  reducedMotion,
  playerPosition,
  qualityLevel,
  position = [0, 12.15, 0],
  quaternion
}: {
  count: number;
  reducedMotion: boolean;
  playerPosition: React.RefObject<Vector3>;
  qualityLevel: SceneQualityLevel;
  position?: [number, number, number];
  quaternion?: Quaternion;
}) {
  const instances = useRef<InstancedMesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const petals = useMemo(() => {
    const random = seededRandom(4268 + count);
    return Array.from({ length: count }, () => ({
      x: (random() - 0.5) * 13,
      y: random() * 7 + 0.4,
      z: (random() - 0.5) * 11,
      speed: reducedMotion ? 0.14 + random() * 0.08 : 0.35 + random() * 0.5,
      phase: random() * Math.PI * 2,
      scale: 0.045 + random() * 0.075
    }));
  }, [count, reducedMotion]);

  useFrame(({ clock }) => {
    const mesh = instances.current;
    if (!mesh) {
      return;
    }
    const player = playerPosition.current;
    const active = !player || isZoneDetailed(player, Math.PI, qualityLevel);
    mesh.visible = active;
    if (!active) {
      return;
    }
    for (let index = 0; index < petals.length; index += 1) {
      const petal = petals[index];
      const fall = (clock.elapsedTime * petal.speed + petal.phase) % 7;
      dummy.position.set(
        petal.x + Math.sin(clock.elapsedTime * 0.55 + petal.phase) * 0.45,
        petal.y - fall + 1,
        petal.z + Math.cos(clock.elapsedTime * 0.35 + petal.phase) * 0.28
      );
      dummy.rotation.set(
        reducedMotion ? 0 : clock.elapsedTime * 0.7 + petal.phase,
        petal.phase,
        reducedMotion ? 0 : clock.elapsedTime + petal.phase
      );
      dummy.scale.set(petal.scale * 1.4, petal.scale, petal.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (material.current) {
      material.current.opacity = reducedMotion ? 0.68 : 0.82;
    }
  });

  return (
    <group position={position} quaternion={quaternion}>
      <instancedMesh ref={instances} args={[undefined, undefined, count]}>
        <planeGeometry args={[1, 0.7]} />
        <meshBasicMaterial
          ref={material}
          color="#f3a6bd"
          side={DoubleSide}
          transparent
          opacity={0.82}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  );
}

export function WorldAmbience({
  qualityLevel,
  playerPosition
}: {
  qualityLevel: SceneQualityLevel;
  playerPosition: React.RefObject<Vector3>;
}) {
  const background = useRef<Color>(null);
  const fog = useRef<Fog>(null);
  const hemisphere = useRef<HemisphereLight>(null);
  const skyGradient = useRef<ShaderMaterial>(null);
  const timeline = useRef(createWorldTimeline());
  const timelineSnapshot = useRef(createWorldTimelineSnapshot());
  const fireworksIntensity = useRef(0);
  const reducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    readReducedMotion,
    () => false
  );
  const quality = useMemo(
    () => getSceneQuality({ level: qualityLevel, reducedMotion }),
    [qualityLevel, reducedMotion]
  );
  const skyColor = useMemo(() => new Color(), []);
  const fogColor = useMemo(() => new Color(), []);
  const skyLight = useMemo(() => new Color(), []);
  const groundLight = useMemo(() => new Color(), []);
  const gradientTop = useMemo(() => new Color("#4f9fca"), []);
  const gradientHorizon = useMemo(() => new Color("#ffdda8"), []);
  const gradientLower = useMemo(() => new Color("#a4c3bd"), []);
  const gradientUp = useMemo(() => new Vector3(0, 1, 0), []);
  const gradientUniforms = useMemo(
    () => ({
      topColor: { value: gradientTop },
      horizonColor: { value: gradientHorizon },
      lowerColor: { value: gradientLower },
      upDirection: { value: gradientUp }
    }),
    [gradientHorizon, gradientLower, gradientTop, gradientUp]
  );

  useFrame((_, delta) => {
    if (typeof document === "undefined" || !document.hidden) {
      timeline.current.advance(Math.min(delta, 0.1));
    }
    const snapshot = timeline.current.readSnapshot(timelineSnapshot.current);
    const palette = getPalette(snapshot);
    const gradient = SKY_GRADIENTS[snapshot.phase];
    lerpColor(skyColor, palette.skyFrom, palette.skyTo, snapshot.progress);
    lerpColor(fogColor, palette.fogFrom, palette.fogTo, snapshot.progress);
    lerpColor(
      skyLight,
      palette.skyLightFrom,
      palette.skyLightTo,
      snapshot.progress
    );
    lerpColor(
      groundLight,
      palette.groundLightFrom,
      palette.groundLightTo,
      snapshot.progress
    );
    lerpColor(
      gradientTop,
      gradient.topFrom,
      gradient.topTo,
      snapshot.progress
    );
    lerpColor(
      gradientHorizon,
      gradient.horizonFrom,
      gradient.horizonTo,
      snapshot.progress
    );
    lerpColor(
      gradientLower,
      gradient.lowerFrom,
      gradient.lowerTo,
      snapshot.progress
    );
    if (playerPosition.current) {
      gradientUp.copy(playerPosition.current).normalize();
    }
    if (skyGradient.current) {
      skyGradient.current.uniformsNeedUpdate = true;
    }
    background.current?.copy(skyColor);
    fog.current?.color.copy(fogColor);
    if (hemisphere.current) {
      hemisphere.current.color.copy(skyLight);
      hemisphere.current.groundColor.copy(groundLight);
      hemisphere.current.intensity =
        palette.lightFrom +
        (palette.lightTo - palette.lightFrom) * snapshot.progress;
    }
    fireworksIntensity.current = snapshot.fireworksIntensity;
  });

  const petalCount =
    quality.petals.near + quality.petals.middle + quality.petals.far;
  const sakuraSurface = useMemo(
    () => new Vector3(0, -1, 0),
    []
  );
  const sakuraPosition = useMemo(
    () => sakuraSurface.clone().multiplyScalar(12.15),
    [sakuraSurface]
  );
  const sakuraQuaternion = useMemo(
    () =>
      new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        sakuraSurface
      ),
    [sakuraSurface]
  );

  return (
    <>
      <color ref={background} attach="background" args={["#83b8cf"]} />
      <mesh renderOrder={-1000} frustumCulled={false}>
        <sphereGeometry args={[60, 32, 20]} />
        <shaderMaterial
          ref={skyGradient}
          uniforms={gradientUniforms}
          vertexShader={SKY_VERTEX_SHADER}
          fragmentShader={SKY_FRAGMENT_SHADER}
          side={BackSide}
          depthWrite={false}
          fog={false}
        />
      </mesh>
      <fog ref={fog} attach="fog" args={["#91b8bd", 18, 46]} />
      <hemisphereLight
        ref={hemisphere}
        args={["#b9ddff", "#5f6f67", 2.2]}
      />
      <ambientLight intensity={0.62} color="#a9b8d8" />
      <directionalLight
        position={[8, 18, 6]}
        intensity={2.1}
        color="#ffd49b"
      />
      <SakuraPetals
        count={petalCount}
        reducedMotion={reducedMotion}
        playerPosition={playerPosition}
        qualityLevel={qualityLevel}
        position={sakuraPosition.toArray() as [number, number, number]}
        quaternion={sakuraQuaternion}
      />
      <Hanabi
        intensity={fireworksIntensity}
        quality={quality}
        reducedMotion={reducedMotion}
        playerPosition={playerPosition}
        qualityLevel={qualityLevel}
      />
    </>
  );
}
