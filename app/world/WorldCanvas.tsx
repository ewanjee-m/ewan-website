"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from "react";
import {
  Group,
  Matrix4,
  PerspectiveCamera,
  Quaternion,
  Vector3
} from "three";
import { createWorldSession, createWorldSnapshot } from "./WorldSession";
import { WorldAmbience } from "./WorldEffects";
import {
  calculateCameraPlacementInto,
  createCameraPlacementBuffer
} from "./CameraPlacement";
import { WorldLandmarks } from "./WorldLandmarks";
import { AirportBusVisual } from "./AirportBusVisual";
import {
  detectBrowserSceneQualityLevel,
  getSceneCanvasDpr,
  type SceneQualityLevel
} from "./SceneQuality";
import {
  AIRPORT_CROSSWALK_HALF_LENGTH,
  AIRPORT_CROSSWALK_TRACK_ANGLE,
  BUS_LANE_CENTER_OFFSET,
  SAFE_CORRIDOR_HALF_WIDTH,
  WORLD_RADIUS
} from "./WorldSafety";
import { createAdaptiveQuality } from "./AdaptiveQuality";
import {
  ARRIVAL_FACADE_LAYOUT,
  type ArrivalFacadeLayout
} from "./WorldSceneLayout";
import type { DestinationId } from "../guide/GuideContract";
import type { PlayerNavigationState } from "../guide/GuidePanel";
import {
  calculateGuideDirection,
  getCurrentZoneId,
  getDestinationPosition,
  type GuideDirection
} from "../guide/WorldNavigation";
import type {
  CameraRigController,
  PlayerCharacter
} from "./WorldView";
import type { InputController } from "./InputController";
import type { WorldMovementIntent } from "./WorldInput";

interface WorldCanvasProps {
  character: PlayerCharacter;
  input: InputController;
  cameraRig: CameraRigController;
  onContextLost: () => void;
  activeDestinationId: DestinationId | null;
  onNavigationChange: (navigation: PlayerNavigationState) => void;
}

const GUIDE_NEEDLE_ROTATION: Record<GuideDirection, number> = {
  straight: 0,
  left: Math.PI / 2,
  right: -Math.PI / 2,
  turnAround: Math.PI
};

type PlayerControllerProps = Omit<WorldCanvasProps, "onContextLost"> & {
  playerPosition: RefObject<Vector3>;
};

function Lantern({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 1.6, 6]} />
        <meshStandardMaterial color="#44271f" />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.42, 10]} />
        <meshStandardMaterial color="#ff8b55" emissive="#ff6b3d" emissiveIntensity={1.8} />
      </mesh>
    </group>
  );
}

function ArrivalFacade({ facade }: { facade: ArrivalFacadeLayout }) {
  const doorX = facade.mirrored ? facade.width * 0.23 : -facade.width * 0.23;
  const windowX = -doorX;
  const frontZ = facade.depth / 2 + 0.045;

  return (
    <group position={[facade.x, 0, facade.z]}>
      <mesh position={[0, facade.height / 2, 0]}>
        <boxGeometry args={[facade.width, facade.height, facade.depth]} />
        <meshStandardMaterial color={facade.body} roughness={0.96} flatShading />
      </mesh>
      <mesh position={[0, facade.height + 0.08, 0]} rotation={[0, 0, -0.035]}>
        <boxGeometry args={[facade.width * 1.18, 0.17, facade.depth * 1.18]} />
        <meshStandardMaterial color={facade.roof} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, facade.height * 0.7, frontZ]}>
        <boxGeometry args={[facade.width * 0.8, 0.22, 0.08]} />
        <meshStandardMaterial
          color={facade.accent}
          emissive={facade.accent}
          emissiveIntensity={0.32}
          roughness={0.84}
        />
      </mesh>
      <mesh position={[doorX, facade.height * 0.28, frontZ]}>
        <boxGeometry args={[facade.width * 0.27, facade.height * 0.56, 0.08]} />
        <meshStandardMaterial color="#312c32" roughness={0.98} flatShading />
      </mesh>
      <mesh position={[windowX, facade.height * 0.39, frontZ + 0.01]}>
        <boxGeometry args={[facade.width * 0.3, facade.height * 0.34, 0.09]} />
        <meshStandardMaterial
          color="#ffd69a"
          emissive="#e98450"
          emissiveIntensity={0.68}
          roughness={0.72}
        />
      </mesh>
      <mesh position={[windowX, facade.height * 0.39, frontZ + 0.065]}>
        <boxGeometry args={[0.045, facade.height * 0.34, 0.025]} />
        <meshStandardMaterial color={facade.roof} roughness={1} />
      </mesh>
      <mesh position={[windowX, facade.height * 0.39, frontZ + 0.066]}>
        <boxGeometry args={[facade.width * 0.3, 0.04, 0.026]} />
        <meshStandardMaterial color={facade.roof} roughness={1} />
      </mesh>
    </group>
  );
}

function PlayerModel({
  character,
  guideActive
}: {
  character: PlayerCharacter;
  guideActive: boolean;
}) {
  const female = character === "female";
  const skin = "#efb38e";
  const hair = "#171925";
  const eye = "#38251d";
  const ivory = "#f6edda";
  const navy = "#18385e";
  const charcoal = "#252b35";
  const coral = "#c94d38";
  const pink = "#e97898";
  const raspberry = "#92264e";

  return (
    <group>
      <mesh position={[-0.22, 0.13, 0.04]}>
        <boxGeometry args={[0.34, 0.22, 0.52]} />
        <meshStandardMaterial color={ivory} flatShading />
      </mesh>
      <mesh position={[0.22, 0.13, 0.04]}>
        <boxGeometry args={[0.34, 0.22, 0.52]} />
        <meshStandardMaterial color={ivory} flatShading />
      </mesh>
      {female ? (
        <>
          <mesh position={[0, 0.75, 0]}>
            <cylinderGeometry args={[0.47, 0.56, 1.18, 8]} />
            <meshStandardMaterial color={pink} flatShading />
          </mesh>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[0.82, 0.72, 0.42]} />
            <meshStandardMaterial color={pink} flatShading />
          </mesh>
          <mesh position={[-0.54, 1.43, 0]} rotation={[0, 0, -0.08]}>
            <boxGeometry args={[0.34, 0.72, 0.4]} />
            <meshStandardMaterial color="#ef8ba5" flatShading />
          </mesh>
          <mesh position={[0.54, 1.43, 0]} rotation={[0, 0, 0.08]}>
            <boxGeometry args={[0.34, 0.72, 0.4]} />
            <meshStandardMaterial color="#ef8ba5" flatShading />
          </mesh>
          <mesh position={[-0.56, 1.01, 0]} scale={[0.16, 0.24, 0.15]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color={skin} flatShading />
          </mesh>
          <mesh position={[0.56, 1.01, 0]} scale={[0.16, 0.24, 0.15]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color={skin} flatShading />
          </mesh>
          <mesh position={[-0.16, 1.65, 0.235]} rotation={[0, 0, -0.6]}>
            <boxGeometry args={[0.17, 0.56, 0.045]} />
            <meshStandardMaterial color={ivory} flatShading />
          </mesh>
          <mesh position={[0.16, 1.65, 0.24]} rotation={[0, 0, 0.6]}>
            <boxGeometry args={[0.17, 0.56, 0.05]} />
            <meshStandardMaterial color={ivory} flatShading />
          </mesh>
          <mesh position={[0, 1.23, 0.255]}>
            <boxGeometry args={[0.91, 0.29, 0.16]} />
            <meshStandardMaterial color={raspberry} flatShading />
          </mesh>
          <mesh position={[0, 1.23, -0.3]} scale={[0.2, 0.18, 0.12]}>
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#7d183f" flatShading />
          </mesh>
          <mesh position={[-0.22, 1.23, -0.35]} rotation={[0, 0, -0.28]} scale={[0.3, 0.22, 0.12]}>
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={raspberry} flatShading />
          </mesh>
          <mesh position={[0.22, 1.23, -0.35]} rotation={[0, 0, 0.28]} scale={[0.3, 0.22, 0.12]}>
            <octahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={raspberry} flatShading />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[-0.23, 0.69, 0]}>
            <boxGeometry args={[0.38, 0.94, 0.44]} />
            <meshStandardMaterial color={charcoal} flatShading />
          </mesh>
          <mesh position={[0.23, 0.69, 0]}>
            <boxGeometry args={[0.38, 0.94, 0.44]} />
            <meshStandardMaterial color={charcoal} flatShading />
          </mesh>
          <mesh position={[0, 1.48, 0]}>
            <boxGeometry args={[0.66, 0.76, 0.38]} />
            <meshStandardMaterial color={ivory} flatShading />
          </mesh>
          <mesh position={[-0.35, 1.46, 0.03]}>
            <boxGeometry args={[0.31, 0.86, 0.45]} />
            <meshStandardMaterial color={navy} flatShading />
          </mesh>
          <mesh position={[0.35, 1.46, 0.03]}>
            <boxGeometry args={[0.31, 0.86, 0.45]} />
            <meshStandardMaterial color={navy} flatShading />
          </mesh>
          <mesh position={[-0.58, 1.49, 0]} rotation={[0, 0, -0.1]}>
            <boxGeometry args={[0.38, 0.61, 0.44]} />
            <meshStandardMaterial color="#214a75" flatShading />
          </mesh>
          <mesh position={[0.58, 1.49, 0]} rotation={[0, 0, 0.1]}>
            <boxGeometry args={[0.38, 0.61, 0.44]} />
            <meshStandardMaterial color="#214a75" flatShading />
          </mesh>
          <mesh position={[-0.61, 1.08, 0]} scale={[0.16, 0.24, 0.15]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color={skin} flatShading />
          </mesh>
          <mesh position={[0.61, 1.08, 0]} scale={[0.16, 0.24, 0.15]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color={skin} flatShading />
          </mesh>
          <mesh position={[-0.15, 1.62, 0.245]} rotation={[0, 0, -0.56]}>
            <boxGeometry args={[0.15, 0.5, 0.05]} />
            <meshStandardMaterial color={ivory} flatShading />
          </mesh>
          <mesh position={[0.15, 1.62, 0.25]} rotation={[0, 0, 0.56]}>
            <boxGeometry args={[0.15, 0.5, 0.055]} />
            <meshStandardMaterial color={ivory} flatShading />
          </mesh>
          <mesh position={[0, 1.17, 0.255]}>
            <boxGeometry args={[0.92, 0.2, 0.16]} />
            <meshStandardMaterial color={coral} flatShading />
          </mesh>
        </>
      )}

      {female ? (
        <>
          <mesh position={[0, 1.92, -0.35]} scale={[0.52, 0.95, 0.29]}>
            <sphereGeometry args={[0.6, 10, 8]} />
            <meshStandardMaterial color={hair} flatShading />
          </mesh>
          <mesh position={[-0.3, 1.83, -0.27]} scale={[0.33, 0.92, 0.24]} rotation={[0, 0, -0.08]}>
            <sphereGeometry args={[0.6, 9, 7]} />
            <meshStandardMaterial color="#202231" flatShading />
          </mesh>
          <mesh position={[0.3, 1.83, -0.27]} scale={[0.33, 0.92, 0.24]} rotation={[0, 0, 0.08]}>
            <sphereGeometry args={[0.6, 9, 7]} />
            <meshStandardMaterial color="#202231" flatShading />
          </mesh>
        </>
      ) : null}

      <mesh position={[-0.42, 2.24, 0]} scale={[0.14, 0.18, 0.12]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={skin} flatShading />
      </mesh>
      <mesh position={[0.42, 2.24, 0]} scale={[0.14, 0.18, 0.12]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={skin} flatShading />
      </mesh>
      <mesh position={[0, 2.24, 0]} scale={[1, 1.04, 0.92]}>
        <sphereGeometry args={[0.46, 12, 9]} />
        <meshStandardMaterial color={skin} flatShading />
      </mesh>
      <mesh position={[0, 2.5, -0.08]} scale={[1.06, 0.68, 0.84]}>
        <sphereGeometry args={[0.47, 10, 7]} />
        <meshStandardMaterial color={hair} flatShading />
      </mesh>

      <mesh
        position={[-0.2, 2.29, 0.425]}
        scale={[female ? 0.073 : 0.063, female ? 0.092 : 0.082, 0.035]}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={female ? "#4a2b20" : eye} flatShading />
      </mesh>
      <mesh
        position={[0.2, 2.29, 0.425]}
        scale={[female ? 0.073 : 0.063, female ? 0.092 : 0.082, 0.035]}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={female ? "#4a2b20" : eye} flatShading />
      </mesh>
      <mesh position={[-0.2, 2.3, 0.463]} scale={[0.034, 0.05, 0.012]}>
        <sphereGeometry args={[1, 7, 5]} />
        <meshStandardMaterial color={female ? "#d88a24" : "#6a3b27"} flatShading />
      </mesh>
      <mesh position={[0.2, 2.3, 0.463]} scale={[0.034, 0.05, 0.012]}>
        <sphereGeometry args={[1, 7, 5]} />
        <meshStandardMaterial color={female ? "#d88a24" : "#6a3b27"} flatShading />
      </mesh>
      <mesh position={[-0.185, 2.33, 0.478]} scale={[0.012, 0.016, 0.006]}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial color="#fff8e8" />
      </mesh>
      <mesh position={[0.215, 2.33, 0.478]} scale={[0.012, 0.016, 0.006]}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial color="#fff8e8" />
      </mesh>
      <mesh position={[-0.2, 2.42, 0.415]} rotation={[0, 0, -0.08]}>
        <boxGeometry args={[0.17, 0.028, 0.035]} />
        <meshStandardMaterial color={hair} flatShading />
      </mesh>
      <mesh position={[0.2, 2.42, 0.415]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[0.17, 0.028, 0.035]} />
        <meshStandardMaterial color={hair} flatShading />
      </mesh>
      <mesh position={[0, 2.08, 0.43]}>
        <boxGeometry args={[0.16, 0.025, 0.028]} />
        <meshStandardMaterial color="#9c4f4b" flatShading />
      </mesh>

      {female ? (
        <>
          <mesh position={[-0.29, 2.15, 0.435]} scale={[0.06, 0.025, 1]}>
            <circleGeometry args={[1, 10]} />
            <meshBasicMaterial color="#e98f92" />
          </mesh>
          <mesh position={[0.29, 2.15, 0.435]} scale={[0.06, 0.025, 1]}>
            <circleGeometry args={[1, 10]} />
            <meshBasicMaterial color="#e98f92" />
          </mesh>
        </>
      ) : null}

      {female ? (
        <>
          <mesh position={[-0.34, 2.17, 0.2]} scale={[0.18, 0.72, 0.17]} rotation={[0, 0, -0.08]}>
            <sphereGeometry args={[0.5, 8, 6]} />
            <meshStandardMaterial color={hair} flatShading />
          </mesh>
          <mesh position={[0.34, 2.17, 0.2]} scale={[0.18, 0.72, 0.17]} rotation={[0, 0, 0.08]}>
            <sphereGeometry args={[0.5, 8, 6]} />
            <meshStandardMaterial color={hair} flatShading />
          </mesh>
          {[
            [0.33, 2.7, 0.22, 0],
            [0.27, 2.64, 0.25, Math.PI / 2],
            [0.35, 2.58, 0.26, Math.PI],
            [0.42, 2.63, 0.23, -Math.PI / 2],
            [0.41, 2.69, 0.21, -0.3]
          ].map(([x, y, z, rotation], index) => (
            <mesh
              key={`hair-flower-petal-${index}`}
              position={[x, y, z]}
              rotation={[0, 0, rotation]}
              scale={[0.08, 0.13, 0.045]}
            >
              <sphereGeometry args={[1, 7, 5]} />
              <meshStandardMaterial color="#ff9cae" flatShading />
            </mesh>
          ))}
          <mesh position={[0.35, 2.64, 0.29]} scale={[0.055, 0.055, 0.035]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#f6bd55" flatShading />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[-0.23, 2.5, 0.32]} rotation={[0, 0, -0.15]} scale={[0.23, 0.15, 0.1]}>
            <tetrahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={hair} flatShading />
          </mesh>
          <mesh position={[0.04, 2.52, 0.33]} rotation={[0, 0, 0.16]} scale={[0.23, 0.16, 0.1]}>
            <tetrahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={hair} flatShading />
          </mesh>
          <mesh position={[0.28, 2.49, 0.31]} rotation={[0, 0, 0.28]} scale={[0.21, 0.14, 0.09]}>
            <tetrahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color={hair} flatShading />
          </mesh>
        </>
      )}

      <mesh position={[0.58, 1.18, -0.25]}>
        <boxGeometry args={[0.22, 0.34, 0.12]} />
        <meshStandardMaterial
          color="#a53b45"
          emissive="#e0a22e"
          emissiveIntensity={guideActive ? 1.35 : 0.35}
        />
      </mesh>
      <mesh position={[0.58, 1.18, -0.32]}>
        <circleGeometry args={[0.075, 12]} />
        <meshStandardMaterial
          color="#f6bd55"
          emissive="#f6bd55"
          emissiveIntensity={guideActive ? 2.2 : 0.65}
        />
      </mesh>
    </group>
  );
}

function PlayerController({
  character,
  input,
  cameraRig,
  playerPosition,
  activeDestinationId,
  onNavigationChange
}: PlayerControllerProps) {
  const player = useRef<Group>(null);
  const visual = useRef<Group>(null);
  const session = useRef(
    createWorldSession({
      radius: WORLD_RADIUS,
      moveSpeed: 3,
      corridorHalfWidth: SAFE_CORRIDOR_HALF_WIDTH,
      crosswalk: {
        trackAngle: AIRPORT_CROSSWALK_TRACK_ANGLE,
        halfLength: AIRPORT_CROSSWALK_HALF_LENGTH,
        minimumOffset: -BUS_LANE_CENTER_OFFSET,
        maximumOffset: SAFE_CORRIDOR_HALF_WIDTH
      }
    })
  );
  const { camera: sceneCamera } = useThree();
  const camera = useRef(sceneCamera);
  const orientationMatrix = useRef(new Matrix4());
  const orientation = useRef(new Quaternion());
  const normal = useRef(new Vector3());
  const heading = useRef(new Vector3());
  const right = useRef(new Vector3());
  const backward = useRef(new Vector3());
  const snapshot = useRef(createWorldSnapshot());
  const guideDirectionInput = useRef<
    Parameters<typeof calculateGuideDirection>[0]
  >({
    position: [0, 0, 0],
    surfaceNormal: [0, 1, 0],
    heading: [0, 0, -1],
    destinationId: "airport" as DestinationId
  });
  const movement = useRef<WorldMovementIntent>({
    x: 0,
    y: 0,
    runRequested: false
  });
  const orbitSnapshot = useRef({ yaw: 0, pitch: -8 });
  const cameraPlacement = useRef(createCameraPlacementBuffer());
  const cameraPlacementInput = useRef({
    player: new Vector3(),
    surfaceNormal: new Vector3(0, 1, 0),
    heading: new Vector3(0, 0, -1),
    yaw: 0,
    pitch: -8
  });
  const guideNeedle = useRef<Group>(null);
  const lastNavigationUpdate = useRef(-1);

  useFrame(({ clock }, delta) => {
    const currentPlayer = player.current;
    if (!currentPlayer) {
      return;
    }

    if (input.consumeReset()) {
      session.current.reset();
    }
    session.current.setMovement(input.readMovement(movement.current));
    if (input.consumeJump()) {
      session.current.jump();
    }
    session.current.advance(Math.min(delta, 0.05));
    const currentSnapshot = session.current.readSnapshot(snapshot.current);

    if (clock.elapsedTime - lastNavigationUpdate.current >= 0.2) {
      lastNavigationUpdate.current = clock.elapsedTime;
      onNavigationChange({
        position: [
          currentSnapshot.position[0],
          currentSnapshot.position[1],
          currentSnapshot.position[2]
        ],
        surfaceNormal: [
          currentSnapshot.surfaceNormal[0],
          currentSnapshot.surfaceNormal[1],
          currentSnapshot.surfaceNormal[2]
        ],
        heading: [
          currentSnapshot.heading[0],
          currentSnapshot.heading[1],
          currentSnapshot.heading[2]
        ],
        currentZoneId: getCurrentZoneId(currentSnapshot.position)
      });
    }

    if (guideNeedle.current && activeDestinationId) {
      const directionInput = guideDirectionInput.current;
      directionInput.position = currentSnapshot.position;
      directionInput.surfaceNormal = currentSnapshot.surfaceNormal;
      directionInput.heading = currentSnapshot.heading;
      directionInput.destinationId = activeDestinationId;
      const direction = calculateGuideDirection(directionInput);
      guideNeedle.current.rotation.z = GUIDE_NEEDLE_ROTATION[direction];
    }

    normal.current.fromArray(currentSnapshot.surfaceNormal);
    heading.current.fromArray(currentSnapshot.heading);
    right.current.crossVectors(heading.current, normal.current).normalize();
    orientationMatrix.current.makeBasis(
      right.current,
      normal.current,
      backward.current.copy(heading.current).negate()
    );
    orientation.current.setFromRotationMatrix(orientationMatrix.current);

    currentPlayer.position.fromArray(currentSnapshot.position);
    playerPosition.current?.copy(currentPlayer.position);
    currentPlayer.quaternion.copy(orientation.current);
    if (visual.current) {
      visual.current.position.y = currentSnapshot.moving
        ? Math.abs(Math.sin(clock.elapsedTime * 9)) * 0.07
        : 0;
    }

    const orbit = cameraRig.readSnapshot(orbitSnapshot.current);
    const placementInput = cameraPlacementInput.current;
    placementInput.player = currentPlayer.position;
    placementInput.surfaceNormal = normal.current;
    placementInput.heading = heading.current;
    placementInput.yaw = orbit.yaw;
    placementInput.pitch = orbit.pitch;
    const placement = calculateCameraPlacementInto(
      placementInput,
      cameraPlacement.current
    );

    const activeCamera = camera.current;
    activeCamera.position.lerp(
      placement.position,
      1 - Math.exp(-delta * 10)
    );
    activeCamera.up.copy(placement.up);
    activeCamera.lookAt(placement.target);
    if (activeCamera instanceof PerspectiveCamera) {
      const nextFov =
        activeCamera.fov +
        (placement.fov - activeCamera.fov) *
          (1 - Math.exp(-delta * 12));
      if (Math.abs(nextFov - activeCamera.fov) > 0.001) {
        activeCamera.fov = nextFov;
        activeCamera.updateProjectionMatrix();
      }
    }
  });

  return (
    <group ref={player}>
      <pointLight
        position={[0, 3.8, 2.8]}
        intensity={9}
        distance={11}
        color="#ffd4ad"
      />
      <group ref={visual}>
        <PlayerModel
          character={character}
          guideActive={Boolean(activeDestinationId)}
        />
        {activeDestinationId ? (
          <group ref={guideNeedle} position={[0.58, 1.18, -0.4]}>
            <mesh position={[0, 0.08, 0]}>
              <boxGeometry args={[0.035, 0.16, 0.025]} />
              <meshStandardMaterial
                color="#fff1aa"
                emissive="#f6bd55"
                emissiveIntensity={2.4}
              />
            </mesh>
          </group>
        ) : null}
      </group>
    </group>
  );
}

function GuideDestinationMarker({
  destinationId
}: {
  destinationId: DestinationId;
}) {
  const marker = useRef<Group>(null);
  const transform = useMemo(() => {
    const positionTuple = getDestinationPosition(destinationId, 15.15);
    const position = new Vector3(...positionTuple);
    const normal = position.clone().normalize();
    return {
      position,
      quaternion: new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        normal
      )
    };
  }, [destinationId]);

  useFrame(({ clock }) => {
    if (marker.current) {
      marker.current.position.y = Math.sin(clock.elapsedTime * 2.4) * 0.16;
      marker.current.rotation.y = clock.elapsedTime * 0.7;
    }
  });

  return (
    <group position={transform.position} quaternion={transform.quaternion}>
      <group ref={marker}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[0.34, 0]} />
          <meshStandardMaterial
            color="#f6bd55"
            emissive="#f6bd55"
            emissiveIntensity={2.2}
          />
        </mesh>
        <mesh position={[0, 0, 0.3]}>
          <sphereGeometry args={[0.11, 10, 8]} />
          <meshStandardMaterial
            color="#e25f55"
            emissive="#e25f55"
            emissiveIntensity={1.8}
          />
        </mesh>
        <pointLight color="#f6bd55" intensity={2.5} distance={3.5} />
      </group>
    </group>
  );
}

function ContextLossListener({ onContextLost }: { onContextLost: () => void }) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onContextLost();
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);
    return () =>
      canvas.removeEventListener("webglcontextlost", handleContextLost);
  }, [gl, onContextLost]);

  return null;
}

function AdaptiveQualityMonitor({
  initialLevel,
  onLevelChange
}: {
  initialLevel: SceneQualityLevel;
  onLevelChange: (level: SceneQualityLevel) => void;
}) {
  const quality = useRef(createAdaptiveQuality({ initialLevel }));
  const lastLevel = useRef(initialLevel);

  useFrame((_, delta) => {
    const nextLevel = quality.current.recordFrame(delta);
    if (nextLevel !== lastLevel.current) {
      lastLevel.current = nextLevel;
      onLevelChange(nextLevel);
    }
  });

  return null;
}

function Scene({
  character,
  input,
  cameraRig,
  onContextLost,
  activeDestinationId,
  onNavigationChange,
  qualityLevel
}: WorldCanvasProps & { qualityLevel: SceneQualityLevel }) {
  const playerPosition = useRef(new Vector3(0, WORLD_RADIUS, 0));

  return (
    <>
      <ContextLossListener onContextLost={onContextLost} />
      <WorldAmbience
        qualityLevel={qualityLevel}
        playerPosition={playerPosition}
      />

      <mesh>
        <icosahedronGeometry args={[12, 5]} />
        <meshStandardMaterial color="#253b3a" roughness={0.96} flatShading />
      </mesh>

      <mesh position={[0, 12.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.3, 28]} />
        <meshStandardMaterial color="#51485b" roughness={1} />
      </mesh>

      <group position={[0, 12.02, 0]}>
        <Lantern position={[-2.4, 0, -1.8]} />
        <Lantern position={[2.4, 0, -1.8]} />
        <Lantern position={[-2.4, 0, 1.8]} />
        <Lantern position={[2.4, 0, 1.8]} />
        {ARRIVAL_FACADE_LAYOUT.map((facade) => (
          <ArrivalFacade key={facade.id} facade={facade} />
        ))}
      </group>

      <WorldLandmarks
        playerPosition={playerPosition}
        qualityLevel={qualityLevel}
      />
      <AirportBusVisual playerPosition={playerPosition} />
      {activeDestinationId ? (
        <GuideDestinationMarker destinationId={activeDestinationId} />
      ) : null}

      <PlayerController
        character={character}
        input={input}
        cameraRig={cameraRig}
        playerPosition={playerPosition}
        activeDestinationId={activeDestinationId}
        onNavigationChange={onNavigationChange}
      />
    </>
  );
}

function WorldCanvas(props: WorldCanvasProps) {
  const initialQualityLevel = useMemo(
    () => detectBrowserSceneQualityLevel(),
    []
  );
  const [qualityLevel, setQualityLevel] = useState(initialQualityLevel);
  const updateQualityLevel = useCallback(
    (nextLevel: SceneQualityLevel) => setQualityLevel(nextLevel),
    []
  );
  const dpr = useMemo(() => getSceneCanvasDpr(qualityLevel), [qualityLevel]);

  return (
    <Canvas
      className="world-canvas"
      camera={{ position: [0, 16, 7], fov: 48, near: 0.1, far: 90 }}
      dpr={dpr}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance"
      }}
    >
      <AdaptiveQualityMonitor
        initialLevel={initialQualityLevel}
        onLevelChange={updateQualityLevel}
      />
      <Scene {...props} qualityLevel={qualityLevel} />
    </Canvas>
  );
}

export default memo(WorldCanvas);
