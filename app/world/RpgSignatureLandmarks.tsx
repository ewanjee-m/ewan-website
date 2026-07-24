"use client";

import { useFrame } from "@react-three/fiber";
import { memo, type RefObject, useRef } from "react";
import type { MeshStandardMaterial } from "three";
import type { RpgRegionPresentationState } from "./RpgRegionPresentation";
import {
  RPG_LANDMARKS,
  type RpgLandmark
} from "./RpgTownSceneLayout";
import { getRpgLandmarkRenderTier } from "./RpgTownRenderTier";
import type { RpgProceduralBatchStat } from "./RpgWorldSurfaces";
import type { SceneQualityLevel } from "./SceneQuality";

const richLandmarks = RPG_LANDMARKS.filter(
  (landmark) => getRpgLandmarkRenderTier(landmark) === "rich"
);

export const RPG_SIGNATURE_LANDMARK_BATCH_STATS: readonly RpgProceduralBatchStat[] =
  richLandmarks
    .filter(({ kind }) => !["bus", "npc", "hanabi"].includes(kind))
    .map((landmark) => ({
      id: landmark.id,
      drawUnits:
        landmark.kind === "sakuraTree" ? 6 :
        landmark.kind === "bridge" ? 5 :
        landmark.kind === "canal" ? 3 : 4,
      triangleCount:
        landmark.kind === "sakuraTree" ? 960 :
        landmark.kind === "bridge" ? 180 :
        landmark.kind === "canal" ? 72 : 420
    }));

interface LandmarkProps {
  landmark: RpgLandmark;
  qualityLevel: SceneQualityLevel;
  presentation: RefObject<RpgRegionPresentationState>;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled RPG landmark kind: ${String(value)}`);
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
  const canopyMaterials = useRef<Array<MeshStandardMaterial | null>>([]);
  useFrame(() => {
    const visibility =
      presentation.current.zoneWeights.sakura *
      presentation.current.vegetationDensity;
    for (const material of canopyMaterials.current) {
      if (!material) continue;
      material.opacity = Math.max(0.08, visibility);
      material.transparent = visibility < 0.999;
    }
  }, -2);
  const [width, height] = landmark.size;
  const crownCount = qualityLevel === "low" ? 3 : 5;
  return (
    <>
      <mesh castShadow position={[0, -height * 0.27, 0]}>
        <cylinderGeometry args={[width * 0.08, width * 0.12, height * 0.54, 10]} />
        <meshStandardMaterial color="#6f4c43" roughness={0.94} />
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
                canopyMaterials.current[index] = material;
              }}
              color={landmark.color}
              roughness={0.9}
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
    <>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * width * 0.72, 0.08, 0]}>
          <boxGeometry args={[0.22, 0.16, depth]} />
          <meshStandardMaterial color={landmark.accent} roughness={0.86} />
        </mesh>
      ))}
    </>
  );
}

function BridgeDetails({ landmark }: { landmark: RpgLandmark }) {
  const [width, , depth] = landmark.size;
  return (
    <>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0.46, side * depth * 0.44]}>
          <mesh>
            <boxGeometry args={[width, 0.11, 0.1]} />
            <meshStandardMaterial color={landmark.accent} roughness={0.82} />
          </mesh>
          {[-0.42, 0, 0.42].map((offset) => (
            <mesh key={offset} position={[offset * width, -0.22, 0]}>
              <boxGeometry args={[0.1, 0.55, 0.1]} />
              <meshStandardMaterial color={landmark.accent} roughness={0.82} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function LanternLandmark({ landmark }: { landmark: RpgLandmark }) {
  const [, height] = landmark.size;
  return (
    <>
      <mesh position={[0, -height * 0.18, 0]}>
        <cylinderGeometry args={[0.06, 0.08, height * 0.64, 8]} />
        <meshStandardMaterial color={landmark.color} roughness={0.78} />
      </mesh>
      <mesh position={[0, height * 0.24, 0]}>
        <cylinderGeometry args={[0.24, 0.24, height * 0.28, 12]} />
        <meshStandardMaterial color={landmark.accent} emissive={landmark.accent} emissiveIntensity={1.4} />
      </mesh>
    </>
  );
}

function ToriiLandmark({ landmark }: { landmark: RpgLandmark }) {
  const [width, height, depth] = landmark.size;
  return (
    <>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * width * 0.34, 0, 0]}>
          <boxGeometry args={[width * 0.1, height, depth * 0.25]} />
          <meshStandardMaterial color={landmark.color} roughness={0.84} />
        </mesh>
      ))}
      {[0.28, 0.45].map((ratio) => (
        <mesh key={ratio} position={[0, height * ratio, 0]}>
          <boxGeometry args={[width, height * 0.1, depth * 0.32]} />
          <meshStandardMaterial color={landmark.accent} roughness={0.84} />
        </mesh>
      ))}
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
      content = <LanternLandmark landmark={landmark} />;
      break;
    case "torii":
      content = <ToriiLandmark landmark={landmark} />;
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
      {RPG_LANDMARKS
        .filter((landmark) => getRpgLandmarkRenderTier(landmark) === "rich")
        .filter((landmark) => landmark.kind !== "npc")
        .map((landmark) => (
          <Landmark
            key={landmark.id}
            landmark={landmark}
            qualityLevel={qualityLevel}
            presentation={presentation}
          />
        ))}
    </group>
  );
});
