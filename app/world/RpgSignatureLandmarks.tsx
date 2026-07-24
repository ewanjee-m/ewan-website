"use client";

import { Instance, Instances } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, type RefObject, useRef } from "react";
import type { MeshStandardMaterial } from "three";
import type { RpgRegionPresentationState } from "./RpgRegionPresentation";
import {
  type RpgLandmark
} from "./RpgTownSceneLayout";
import { RPG_RENDERED_RICH_LANDMARKS } from "./RpgTownRenderStats";
import type { SceneQualityLevel } from "./SceneQuality";

const richLanterns = RPG_RENDERED_RICH_LANDMARKS.filter(
  ({ kind }) => kind === "lantern"
);
const richToriis = RPG_RENDERED_RICH_LANDMARKS.filter(
  ({ kind }) => kind === "torii"
);

export interface RpgRepeatedLandmarkInstance {
  readonly landmarkId: string;
  readonly part: "pole" | "light" | "post" | "beam";
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: readonly [number, number, number];
  readonly color: string;
}

function rotateLandmarkOffset(
  landmark: RpgLandmark,
  localX: number,
  localY: number,
  localZ: number
): readonly [number, number, number] {
  const rotationY = landmark.rotationY ?? 0;
  const cosine = Math.cos(rotationY);
  const sine = Math.sin(rotationY);
  return [
    landmark.position[0] + cosine * localX + sine * localZ,
    landmark.position[1] + localY,
    landmark.position[2] - sine * localX + cosine * localZ
  ];
}

export function createRpgRepeatedLandmarkInstances(
  landmarks: readonly RpgLandmark[]
): readonly RpgRepeatedLandmarkInstance[] {
  return landmarks.flatMap<RpgRepeatedLandmarkInstance>((landmark) => {
    const rotation = [0, landmark.rotationY ?? 0, 0] as const;
    const [width, height, depth] = landmark.size;
    if (landmark.kind === "lantern") {
      return [
        {
          landmarkId: landmark.id,
          part: "pole" as const,
          position: rotateLandmarkOffset(landmark, 0, -height * 0.18, 0),
          rotation,
          scale: [width / 3, height * 0.64, width / 3] as const,
          color: landmark.color
        },
        {
          landmarkId: landmark.id,
          part: "light" as const,
          position: rotateLandmarkOffset(landmark, 0, height * 0.24, 0),
          rotation,
          scale: [width * 4 / 3, height * 0.28, width * 4 / 3] as const,
          color: landmark.accent
        }
      ];
    }
    if (landmark.kind === "torii") {
      return [
        ...[-1, 1].map((side) => ({
          landmarkId: landmark.id,
          part: "post" as const,
          position: rotateLandmarkOffset(
            landmark,
            side * width * 0.34,
            0,
            0
          ),
          rotation,
          scale: [width * 0.1, height, depth * 0.25] as const,
          color: landmark.color
        })),
        ...[0.28, 0.45].map((ratio) => ({
          landmarkId: landmark.id,
          part: "beam" as const,
          position: rotateLandmarkOffset(landmark, 0, height * ratio, 0),
          rotation,
          scale: [width, height * 0.1, depth * 0.32] as const,
          color: landmark.accent
        }))
      ];
    }
    return [];
  });
}

const richLanternInstances = createRpgRepeatedLandmarkInstances(richLanterns);
const richToriiInstances = createRpgRepeatedLandmarkInstances(richToriis);

interface LandmarkProps {
  landmark: RpgLandmark;
  qualityLevel: SceneQualityLevel;
  presentation: RefObject<RpgRegionPresentationState>;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled RPG landmark kind: ${String(value)}`);
}

export function applyRpgSakuraVisibility(
  materials: readonly (MeshStandardMaterial | null)[],
  presentation: RpgRegionPresentationState
) {
  const visibility =
    presentation.zoneWeights.sakura * presentation.vegetationDensity;
  for (const material of materials) {
    if (!material) continue;
    material.opacity = visibility;
    material.transparent = visibility < 1;
  }
}

function BuildingLandmark({ landmark }: { landmark: RpgLandmark }) {
  const [width, height, depth] = landmark.size;
  return (
    <>
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={landmark.color} roughness={0.82} />
      </mesh>
      <mesh castShadow position={[0, height / 2 + 0.22, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[Math.max(width, depth) * 0.72, 0.56, 4]} />
        <meshStandardMaterial color={landmark.accent} roughness={0.88} />
      </mesh>
      {[-0.22, 0.22].map((x) => (
        <mesh key={x} position={[x * width, 0.08 * height, depth / 2 + 0.015]}>
          <boxGeometry args={[width * 0.23, height * 0.3, 0.04]} />
          <meshStandardMaterial color="#bfe2e5" emissive={landmark.accent} emissiveIntensity={0.15} />
        </mesh>
      ))}
      <mesh position={[0, -height * 0.28, depth / 2 + 0.04]}>
        <boxGeometry args={[width * 0.58, height * 0.18, 0.08]} />
        <meshStandardMaterial color={landmark.accent} />
      </mesh>
    </>
  );
}

function SakuraLandmark({
  landmark,
  qualityLevel,
  presentation
}: LandmarkProps) {
  const materials = useRef<Array<MeshStandardMaterial | null>>([]);
  useFrame(() => {
    applyRpgSakuraVisibility(materials.current, presentation.current);
  }, -2);
  const [width, height] = landmark.size;
  const crownCount = qualityLevel === "low" ? 3 : 5;
  const initialVisibility =
    presentation.current.zoneWeights.sakura *
    presentation.current.vegetationDensity;
  return (
    <>
      <mesh castShadow position={[0, -height * 0.27, 0]}>
        <cylinderGeometry args={[width * 0.08, width * 0.12, height * 0.54, 10]} />
        <meshStandardMaterial
          ref={(material) => {
            materials.current[0] = material;
          }}
          color="#6f4c43"
          roughness={0.94}
          opacity={initialVisibility}
          transparent={initialVisibility < 1}
        />
      </mesh>
      {Array.from({ length: crownCount }, (_, index) => {
        const angle = (index / crownCount) * Math.PI * 2;
        return (
          <mesh
            key={index}
            castShadow
            position={[
              Math.cos(angle) * width * 0.2,
              height * (0.16 + (index % 2) * 0.08),
              Math.sin(angle) * width * 0.2
            ]}
          >
            <sphereGeometry args={[width * 0.3, 12, 8]} />
            <meshStandardMaterial
              ref={(material) => {
                materials.current[index + 1] = material;
              }}
              color={landmark.color}
              roughness={0.9}
              opacity={initialVisibility}
              transparent={initialVisibility < 1}
            />
          </mesh>
        );
      })}
    </>
  );
}

function CanalDetails({ landmark }: { landmark: RpgLandmark }) {
  const [width, , depth] = landmark.size;
  return (
    <Instances limit={2} frames={1}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={landmark.accent} roughness={0.86} />
      {[-1, 1].map((side) => (
        <Instance
          key={side}
          position={[side * width * 0.72, 0.08, 0]}
          scale={[0.22, 0.16, depth]}
        />
      ))}
    </Instances>
  );
}

function BridgeDetails({ landmark }: { landmark: RpgLandmark }) {
  const [width, , depth] = landmark.size;
  return (
    <>
      <Instances limit={2} frames={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={landmark.accent} roughness={0.82} />
        {[-1, 1].map((side) => (
          <Instance
            key={side}
            position={[0, 0.46, side * depth * 0.44]}
            scale={[width, 0.11, 0.1]}
          />
        ))}
      </Instances>
      <Instances limit={6} frames={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={landmark.accent} roughness={0.82} />
        {[-1, 1].flatMap((side) =>
          [-0.42, 0, 0.42].map((offset) => (
            <Instance
              key={`${side}-${offset}`}
              position={[offset * width, 0.24, side * depth * 0.44]}
              scale={[0.1, 0.55, 0.1]}
            />
          ))
        )}
      </Instances>
    </>
  );
}

function RepeatedLandmarkBatches() {
  return (
    <>
      <Instances limit={richLanterns.length} frames={1}>
        <cylinderGeometry args={[1, 1, 1, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.78} />
        {richLanternInstances.filter(({ part }) => part === "pole").map((instance) => (
          <Instance
            key={`${instance.landmarkId}-pole`}
            position={instance.position}
            rotation={instance.rotation}
            scale={instance.scale}
            color={instance.color}
            userData={{ landmarkId: instance.landmarkId }}
          />
        ))}
      </Instances>
      <Instances limit={richLanterns.length} frames={1}>
        <cylinderGeometry args={[1, 1, 1, 12]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#ffb14e"
          emissiveIntensity={1.4}
        />
        {richLanternInstances.filter(({ part }) => part === "light").map((instance) => (
          <Instance
            key={`${instance.landmarkId}-light`}
            position={instance.position}
            rotation={instance.rotation}
            scale={instance.scale}
            color={instance.color}
            userData={{ landmarkId: instance.landmarkId }}
          />
        ))}
      </Instances>
      <Instances limit={richToriis.length * 4} frames={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ffffff" roughness={0.84} />
        {richToriiInstances.map((instance, index) => (
          <Instance
            key={`${instance.landmarkId}-${instance.part}-${index}`}
            position={instance.position}
            rotation={instance.rotation}
            scale={instance.scale}
            color={instance.color}
            userData={{ landmarkId: instance.landmarkId }}
          />
        ))}
      </Instances>
    </>
  );
}

function Landmark(props: LandmarkProps) {
  const { landmark } = props;
  let content;
  switch (landmark.kind) {
    case "terminal":
    case "tower":
    case "machiya":
    case "stall":
      content = <BuildingLandmark landmark={landmark} />;
      break;
    case "sakuraTree":
      content = <SakuraLandmark {...props} />;
      break;
    case "canal":
      content = <CanalDetails landmark={landmark} />;
      break;
    case "bridge":
      content = <BridgeDetails landmark={landmark} />;
      break;
    case "lantern":
      content = null;
      break;
    case "torii":
      content = null;
      break;
    case "bus":
      return null;
    case "hanabi":
      return null;
    case "npc":
      return null;
    default:
      return assertNever(landmark.kind);
  }
  const cameraOccluder =
    landmark.blocksMovement &&
    ["terminal", "tower", "machiya", "stall", "sakuraTree"].includes(
      landmark.kind
    );
  return (
    <group
      position={landmark.position}
      rotation={[0, landmark.rotationY ?? 0, 0]}
      userData={{
        landmarkId: landmark.id,
        ...(cameraOccluder ? { cameraOccluder: true } : {})
      }}
    >
      {content}
    </group>
  );
}

export const RpgSignatureLandmarks = memo(function RpgSignatureLandmarks({
  qualityLevel,
  presentation
}: {
  qualityLevel: SceneQualityLevel;
  presentation: RefObject<RpgRegionPresentationState>;
}) {
  return (
    <group name="rpg-signature-landmarks">
      {RPG_RENDERED_RICH_LANDMARKS
        .filter(
          (landmark) =>
            landmark.kind !== "npc" &&
            landmark.kind !== "lantern" &&
            landmark.kind !== "torii"
        )
        .map((landmark) => (
          <Landmark
            key={landmark.id}
            landmark={landmark}
            qualityLevel={qualityLevel}
            presentation={presentation}
          />
        ))}
      <RepeatedLandmarkBatches />
    </group>
  );
});
