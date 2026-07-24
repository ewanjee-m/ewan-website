"use client";

import { useFrame } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import { Group, Vector3 } from "three";
import { NPC_CHARACTER_MODELS } from "./NpcCharacterModels";
import {
  RpgAssetAvailabilityGate,
  RpgAssetBoundary
} from "./RpgAssetBoundary";
import type { NpcSpriteId } from "./NpcAssets";
import {
  createNpcPatrolPose,
  deriveNpcPatrolRoute,
  evaluateNpcPatrolMotionInto
} from "./NpcPatrolMotion";
import {
  RPG_NPC_CAMERA_CLEARANCE,
  type RpgCameraDynamicObstacle
} from "./RpgCameraCollision";
import {
  RpgNpcCharacter3d,
  type RpgNpcCharacter3dHandle
} from "./RpgNpcCharacter3d";
import {
  RPG_LANDMARKS,
  type RpgLandmark
} from "./RpgTownSceneLayout";
import { getSurfaceHeight } from "./RpgWorldGeometry";
import type { WorldRuntime } from "./WorldRuntime";

type NpcLandmark = RpgLandmark & {
  kind: "npc";
  id: NpcSpriteId;
};

function isNpcLandmark(landmark: RpgLandmark): landmark is NpcLandmark {
  return landmark.kind === "npc" && landmark.id in NPC_CHARACTER_MODELS;
}

const NPC_LANDMARKS = RPG_LANDMARKS.filter(isNpcLandmark);

class RpgNpcAssetBoundary extends RpgAssetBoundary {
  override componentDidCatch(error: Error) {
    super.componentDidCatch(error);
  }
}

function RpgNpcActor({
  landmark,
  playerPosition,
  dynamicObstacles,
  reducedMotion,
  npcSecondaryMotion,
  runtime,
  telemetry
}: {
  landmark: NpcLandmark;
  playerPosition: RefObject<Vector3>;
  dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  reducedMotion: boolean;
  npcSecondaryMotion: boolean;
  runtime?: WorldRuntime;
  telemetry?: RefObject<HTMLDivElement | null>;
}) {
  const root = useRef<Group>(null);
  const character = useRef<RpgNpcCharacter3dHandle>(null);
  const route = useMemo(
    () => deriveNpcPatrolRoute(landmark.id, landmark.variant ?? 0),
    [landmark.id, landmark.variant]
  );
  const pose = useRef(createNpcPatrolPose());
  const model = NPC_CHARACTER_MODELS[landmark.id];
  const obstacle = useRef<RpgCameraDynamicObstacle>({
    position: [0, 0, 0],
    size: [0.56, model.visibleHeight, 0.56],
    yaw: 0,
    clearance: RPG_NPC_CAMERA_CLEARANCE
  });
  const [assetAvailable, setAssetAvailable] = useState(false);
  const assetFailed = useRef(false);
  const removeObstacle = () => {
    dynamicObstacles.current.delete(landmark.id);
  };
  const handleAssetError = () => {
    assetFailed.current = true;
    setAssetAvailable(false);
    removeObstacle();
    runtime?.setInteractionTargetAvailable(landmark.id, false);
    const failedIds = new Set(
      (telemetry?.current?.dataset.unavailableNpcIds ?? "")
        .split(",")
        .filter(Boolean)
    );
    failedIds.add(landmark.id);
    telemetry?.current?.setAttribute(
      "data-unavailable-npc-ids",
      [...failedIds].sort().join(",")
    );
  };
  const handleAssetAvailable = () => {
    setAssetAvailable(true);
  };

  useEffect(() => {
    const obstacles = dynamicObstacles.current;
    if (!assetAvailable || assetFailed.current) {
      obstacles.delete(landmark.id);
      return;
    }
    obstacles.set(landmark.id, obstacle.current);
    return () => {
      obstacles.delete(landmark.id);
    };
  }, [assetAvailable, dynamicObstacles, landmark.id]);

  useFrame(({ clock }) => {
    if (!assetAvailable || assetFailed.current) return;
    evaluateNpcPatrolMotionInto(
      route,
      clock.elapsedTime,
      reducedMotion,
      pose.current
    );
    if (!npcSecondaryMotion) {
      pose.current.stride = 0;
      pose.current.bob = 0;
      pose.current.rotation = 0;
      if (!pose.current.moving) {
        pose.current.animationKind = "idle";
      }
    }
    const surfaceHeight = getSurfaceHeight([pose.current.x, pose.current.z]);
    root.current?.position.set(
      pose.current.x,
      surfaceHeight + pose.current.bob,
      pose.current.z
    );
    const obstaclePosition = obstacle.current.position as [
      number,
      number,
      number
    ];
    obstaclePosition[0] = pose.current.x;
    obstaclePosition[1] = surfaceHeight + model.visibleHeight / 2;
    obstaclePosition[2] = pose.current.z;
    obstacle.current.yaw = pose.current.yaw;
    character.current?.applyPose(pose.current);
  });

  return (
    <group ref={root}>
      <RpgAssetAvailabilityGate
        assetId={landmark.id}
        src={model.modelAsset}
        fallback={null}
        onAvailable={handleAssetAvailable}
        onError={handleAssetError}
      >
        <RpgNpcAssetBoundary
          assetId={landmark.id}
          fallback={null}
          onError={handleAssetError}
        >
          <RpgNpcCharacter3d
            ref={character}
            npcId={landmark.id}
            variant={landmark.variant ?? 0}
            playerPosition={playerPosition}
          />
        </RpgNpcAssetBoundary>
      </RpgAssetAvailabilityGate>
    </group>
  );
}

export function RpgNpcCrowd({
  playerPosition,
  dynamicObstacles,
  reducedMotion,
  npcSecondaryMotion = true,
  runtime,
  telemetry
}: {
  playerPosition: RefObject<Vector3>;
  dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  reducedMotion: boolean;
  npcSecondaryMotion?: boolean;
  runtime?: WorldRuntime;
  telemetry?: RefObject<HTMLDivElement | null>;
}) {
  return (
    <group name="rpg-npc-crowd">
      {NPC_LANDMARKS.map((landmark) => (
        <RpgNpcActor
          key={landmark.id}
          landmark={landmark}
          playerPosition={playerPosition}
          dynamicObstacles={dynamicObstacles}
          reducedMotion={reducedMotion}
          npcSecondaryMotion={npcSecondaryMotion}
          runtime={runtime}
          telemetry={telemetry}
        />
      ))}
    </group>
  );
}
