"use client";

import { useFrame } from "@react-three/fiber";
import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject
} from "react";
import { Group, Vector3 } from "three";
import { NPC_CHARACTER_MODELS } from "./NpcCharacterModels";
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

type NpcLandmark = RpgLandmark & {
  kind: "npc";
  id: NpcSpriteId;
};

function isNpcLandmark(landmark: RpgLandmark): landmark is NpcLandmark {
  return landmark.kind === "npc" && landmark.id in NPC_CHARACTER_MODELS;
}

const NPC_LANDMARKS = RPG_LANDMARKS.filter(isNpcLandmark);

class RpgNpcAssetBoundary extends Component<
  { children: ReactNode; onAssetError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onAssetError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function RpgNpcActor({
  landmark,
  playerPosition,
  dynamicObstacles,
  reducedMotion
}: {
  landmark: NpcLandmark;
  playerPosition: RefObject<Vector3>;
  dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  reducedMotion: boolean;
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
  const removeObstacle = useRef<() => void>(() => undefined);
  const handleAssetError = useCallback(() => {
    removeObstacle.current();
  }, []);

  useEffect(() => {
    const obstacles = dynamicObstacles.current;
    const remove = () => {
      obstacles.delete(landmark.id);
    };
    removeObstacle.current = remove;
    obstacles.set(landmark.id, obstacle.current);
    return remove;
  }, [dynamicObstacles, landmark.id]);

  useFrame(({ clock }) => {
    evaluateNpcPatrolMotionInto(
      route,
      clock.elapsedTime,
      reducedMotion,
      pose.current
    );
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
      <RpgNpcAssetBoundary onAssetError={handleAssetError}>
        <RpgNpcCharacter3d
          ref={character}
          npcId={landmark.id}
          variant={landmark.variant ?? 0}
          playerPosition={playerPosition}
        />
      </RpgNpcAssetBoundary>
    </group>
  );
}

export function RpgNpcCrowd({
  playerPosition,
  dynamicObstacles,
  reducedMotion
}: {
  playerPosition: RefObject<Vector3>;
  dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  reducedMotion: boolean;
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
        />
      ))}
    </group>
  );
}
