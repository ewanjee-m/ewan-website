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
import type {
  SceneQualityLevel,
  SceneQualitySettings
} from "./SceneQuality";

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
  const usesSignatureFacade = [
    "tokyo-blue-tower",
    "gyukatsu-main-machiya",
    "hanabi-apple-stall"
  ].includes(landmark.id);
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
      {!usesSignatureFacade && (
        <>
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
      )}
      {landmark.id === "tokyo-blue-tower" && (
        <TokyoBlueTowerDetails
          width={width}
          height={height}
          depth={depth}
          accent={landmark.accent}
        />
      )}
      {landmark.id === "gyukatsu-main-machiya" && (
        <GyukatsuMachiyaDetails
          width={width}
          height={height}
          depth={depth}
          accent={landmark.accent}
        />
      )}
      {landmark.id === "hanabi-apple-stall" && (
        <HanabiAppleStallDetails
          width={width}
          height={height}
          depth={depth}
          accent={landmark.accent}
        />
      )}
    </>
  );
}

interface BuildingDetailProps {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  readonly accent: string;
}

function TokyoBlueTowerDetails({
  width,
  height,
  depth,
  accent
}: BuildingDetailProps) {
  return (
    <group name="tokyo-blue-tower-signature">
      <Instances limit={3} frames={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.72}
          roughness={0.34}
        />
        {[-0.32, 0, 0.32].map((offset) => (
          <Instance
            key={offset}
            position={[offset * width, -height * 0.02, -depth / 2 - 0.035]}
            scale={[width * 0.065, height * 0.78, 0.055]}
          />
        ))}
      </Instances>
      <mesh castShadow position={[0, height / 2 + 0.86, 0]}>
        <cylinderGeometry args={[0.07, 0.18, 1.2, 8]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.82}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, height / 2 + 1.5, 0]}>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshStandardMaterial
          color="#d9ffff"
          emissive={accent}
          emissiveIntensity={1.15}
          roughness={0.24}
        />
      </mesh>
    </group>
  );
}

function GyukatsuMachiyaDetails({
  width,
  height,
  depth,
  accent
}: BuildingDetailProps) {
  const facadeZ = -depth / 2 - 0.055;
  return (
    <group name="gyukatsu-main-machiya-signature">
      <Instances limit={4} frames={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3b241d" roughness={0.9} />
        {[-0.42, 0.42].map((offset) => (
          <Instance
            key={`post-${offset}`}
            position={[offset * width, 0, facadeZ]}
            scale={[width * 0.075, height * 0.92, 0.08]}
          />
        ))}
        {[-0.32, 0.34].map((offset) => (
          <Instance
            key={`beam-${offset}`}
            position={[0, offset * height, facadeZ - 0.005]}
            scale={[width * 0.92, height * 0.065, 0.085]}
          />
        ))}
      </Instances>
      <Instances limit={3} frames={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.2}
          roughness={0.76}
        />
        {[-0.22, 0, 0.22].map((offset) => (
          <Instance
            key={offset}
            position={[offset * width, -height * 0.1, facadeZ - 0.07]}
            scale={[width * 0.18, height * 0.34, 0.045]}
          />
        ))}
      </Instances>
      <mesh position={[0, height * 0.3, facadeZ - 0.08]}>
        <boxGeometry args={[width * 0.48, height * 0.16, 0.08]} />
        <meshStandardMaterial
          color="#5b3024"
          emissive={accent}
          emissiveIntensity={0.32}
          roughness={0.78}
        />
      </mesh>
    </group>
  );
}

function HanabiAppleStallDetails({
  width,
  height,
  depth,
  accent
}: BuildingDetailProps) {
  const facadeZ = -depth / 2;
  const appleRows = [
    [-0.3, -0.08],
    [-0.1, -0.08],
    [0.1, -0.08],
    [0.3, -0.08],
    [-0.2, 0.08],
    [0, 0.08],
    [0.2, 0.08]
  ] as const;
  return (
    <group name="hanabi-apple-stall-signature">
      <Instances limit={2} frames={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={0.28}
          roughness={0.74}
        />
        <Instance
          position={[0, height * 0.2, facadeZ - 0.24]}
          scale={[width * 1.02, height * 0.17, 0.48]}
        />
        <Instance
          position={[0, height * 0.39, facadeZ - 0.08]}
          scale={[width * 0.62, height * 0.16, 0.08]}
        />
      </Instances>
      <Instances limit={6} frames={1}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#bc3341"
          emissive="#6d111b"
          emissiveIntensity={0.28}
          roughness={0.8}
        />
        {[-0.4, -0.2, 0, 0.2, 0.4].map((offset) => (
          <Instance
            key={offset}
            position={[offset * width, height * 0.2, facadeZ - 0.49]}
            scale={[width * 0.105, height * 0.18, 0.035]}
          />
        ))}
        <Instance
          position={[0, -height * 0.19, facadeZ - 0.31]}
          scale={[width * 0.88, height * 0.18, 0.58]}
        />
      </Instances>
      <Instances limit={appleRows.length + 1} frames={1}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial
          color="#dc3043"
          emissive="#791320"
          emissiveIntensity={0.24}
          roughness={0.58}
        />
        {appleRows.map(([offsetX, offsetZ], index) => (
          <Instance
            key={`${offsetX}-${offsetZ}`}
            position={[
              offsetX * width,
              -height * 0.06 + (index >= 4 ? 0.13 : 0),
              facadeZ - 0.36 - offsetZ
            ]}
            scale={[0.14, 0.14, 0.14]}
          />
        ))}
        <Instance
          position={[0, height * 0.39, facadeZ - 0.15]}
          scale={[width * 0.09, width * 0.09, width * 0.045]}
        />
      </Instances>
    </group>
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
  const isPrimarySakura = landmark.id === "sakura-tree-01";
  const crownRadius = width * (isPrimarySakura ? 0.38 : 0.3);
  const crownOffset = width * (isPrimarySakura ? 0.16 : 0.2);
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
          color={landmark.color}
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
              Math.cos(angle) * crownOffset,
              height * (0.16 + (index % 2) * 0.08),
              Math.sin(angle) * crownOffset
            ]}
          >
            <sphereGeometry args={[crownRadius, 12, 8]} />
            <meshStandardMaterial
              ref={(material) => {
                materials.current[index + 1] = material;
              }}
              color={landmark.accent}
              emissive={isPrimarySakura ? "#d95e8d" : landmark.accent}
              emissiveIntensity={isPrimarySakura ? 0.22 : 0.05}
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
        <meshStandardMaterial
          color={landmark.color}
          emissive="#7a1714"
          emissiveIntensity={0.24}
          roughness={0.78}
        />
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
        <meshStandardMaterial
          color={landmark.accent}
          emissive={landmark.accent}
          emissiveIntensity={0.16}
          roughness={0.72}
        />
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
        <meshStandardMaterial
          color="#ffffff"
          emissive="#681611"
          emissiveIntensity={0.28}
          roughness={0.78}
        />
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
  qualitySettings,
  presentation
}: {
  qualitySettings: SceneQualitySettings;
  presentation: RefObject<RpgRegionPresentationState>;
}) {
  return (
    <group
      name="rpg-signature-landmarks"
      userData={{
        farDecorationDistance: qualitySettings.farDecorationDistance
      }}
    >
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
            qualityLevel={qualitySettings.level}
            presentation={presentation}
          />
        ))}
      <RepeatedLandmarkBatches />
    </group>
  );
});
