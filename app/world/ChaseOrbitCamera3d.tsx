"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import {
  InstancedMesh,
  Matrix4,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector3,
  type Intersection
} from "three";
import {
  advanceChaseOrbitCamera,
  getChaseOrbitCameraDiagnostic,
  shortestCameraYawError
} from "./ChaseOrbitCamera";
import type { InputController } from "./InputController";
import {
  RPG_CAMERA_MINIMUM_BOOM_DISTANCE,
  resolveRpgCameraOrbitCollisionInto,
  type RpgCameraDynamicObstacle
} from "./RpgCameraCollision";
import {
  advanceRpgCameraOcclusion,
  createRpgCameraOcclusionState
} from "./RpgCameraOcclusion";
import {
  advanceRpgCameraSafetyOffset,
  advanceRpgCameraSafetyViolation,
  calculateRpgCameraSafetyCorrection,
  getRpgCameraSafeArea
} from "./RpgCameraSafety";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";
import type { WorldCameraDragIntent } from "./WorldInput";
import type { WorldRuntime } from "./WorldRuntime";
import { projectRpgReferenceMapPoint } from "./RpgMiniMapProjection";

interface MaterialAppearance {
  transparent: boolean;
  opacity: number;
}

const RPG_CAMERA_LOOK_HALFLIFE_SECONDS = 0.08;

export function getRpgCameraLookSlerpAlpha(deltaSeconds: number) {
  return 1 -
    Math.pow(
      0.5,
      Math.max(0, deltaSeconds) /
        RPG_CAMERA_LOOK_HALFLIFE_SECONDS
    );
}

export function resolveRpgCameraLookQuaternionInto(
  position: Vector3,
  focus: Vector3,
  up: Vector3,
  target: Quaternion,
  matrix: Matrix4
) {
  matrix.lookAt(position, focus, up);
  return target.setFromRotationMatrix(matrix);
}

export interface ChaseOrbitCamera3dProps {
  runtime: WorldRuntime;
  input: InputController;
  navigation: RefObject<WorldNavigationSnapshot>;
  playerPosition: RefObject<Vector3>;
  playerVisibleHeight: number;
  dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  telemetry: RefObject<HTMLDivElement | null>;
}

export function collectRpgCameraDynamicObstacles(
  source: ReadonlyMap<string, RpgCameraDynamicObstacle>,
  target: RpgCameraDynamicObstacle[]
) {
  target.length = 0;
  for (const obstacle of source.values()) {
    if (obstacle.cameraCollision === "occlusion-only") continue;
    target.push(obstacle);
  }
  return target;
}

export function collectRpgCameraOcclusionRoots(
  scene: Object3D,
  target: Object3D[]
) {
  target.length = 0;
  scene.traverse((object) => {
    if (
      object.userData.cameraOccluder === true &&
      object.userData.landmarkId !== "airport-bus"
    ) {
      target.push(object);
    }
  });
  return target;
}

function findCameraOccluder(object: Object3D) {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.cameraOccluder === true) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function forEachMaterial(
  object: Object3D,
  visit: (material: Material) => void
) {
  object.traverse((child) => {
    if (!(child instanceof Mesh) || child instanceof InstancedMesh) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) visit(material);
  });
}

export function ChaseOrbitCamera3d({
  runtime,
  input,
  navigation: navigationRef,
  playerPosition: playerPositionRef,
  playerVisibleHeight,
  dynamicObstacles: dynamicObstaclesRef,
  telemetry: telemetryRef
}: ChaseOrbitCamera3dProps) {
  const { camera, scene, size } = useThree();
  const cameraRef = useRef(camera);
  const drag = useRef<WorldCameraDragIntent>({
    deltaX: 0,
    deltaY: 0,
    pointerKind: "mouse"
  });
  const focus = useRef(new Vector3());
  const desired = useRef(new Vector3());
  const safePosition = useRef(new Vector3().copy(camera.position));
  const basePosition = useRef(new Vector3().copy(camera.position));
  const resolved = useRef<[number, number, number]>([0, 0, 0]);
  const collisionPlayer = useRef<[number, number, number]>([0, 0, 0]);
  const collisionDesired = useRef<[number, number, number]>([0, 0, 0]);
  const collisionObstacles = useRef<RpgCameraDynamicObstacle[]>([]);
  const lookMatrix = useRef(new Matrix4());
  const lookQuaternion = useRef(new Quaternion());
  const foot = useRef(new Vector3());
  const head = useRef(new Vector3());
  const cameraRight = useRef(new Vector3());
  const cameraUp = useRef(new Vector3());
  const safetyOffset = useRef(new Vector3());
  const safetyTarget = useRef(new Vector3());
  const boomDirection = useRef(new Vector3());
  const raycaster = useRef(new Raycaster());
  const rayDirection = useRef(new Vector3());
  const rayHits = useRef<Intersection[]>([]);
  const occlusionRoots = useRef<Object3D[]>([]);
  const occlusion = useRef(createRpgCameraOcclusionState());
  const occluder = useRef<Object3D | null>(null);
  const materialAppearances = useRef(new Map<Material, MaterialAppearance>());
  const safetyViolationSeconds = useRef(0);
  const batchedOcclusionSeconds = useRef(0);
  const collisionIsFinite = useRef(true);
  const placementInitialized = useRef(false);
  const mobile = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(pointer: coarse)").matches
  );

  const restoreMaterials = () => {
    for (const [material, appearance] of materialAppearances.current) {
      material.transparent = appearance.transparent;
      material.opacity = appearance.opacity;
      material.needsUpdate = true;
    }
    materialAppearances.current.clear();
  };

  useEffect(() => restoreMaterials, []);

  useFrame(({ clock }, delta) => {
    const snapshot = navigationRef.current;
    const headingYaw = Math.atan2(snapshot.heading[0], snapshot.heading[2]);
    advanceChaseOrbitCamera(runtime.getCameraState(), {
      deltaSeconds: delta,
      elapsedSeconds: clock.elapsedTime,
      drag: input.consumeCameraDrag(drag.current),
      moving: snapshot.moving,
      headingYaw,
      navigationRegion: snapshot.navigationRegion,
      viewport: mobile.current ? "mobile" : "desktop"
    });
  }, -2);

  useFrame(({ clock }, delta) => {
    const snapshot = navigationRef.current;
    const state = runtime.getCameraState();
    const activeCamera =
      cameraRef.current instanceof PerspectiveCamera
        ? cameraRef.current
        : null;
    if (!activeCamera) return;

    const targetFov = mobile.current ? 52 : 45;
    if (activeCamera.fov !== targetFov) {
      activeCamera.fov = targetFov;
      activeCamera.updateProjectionMatrix();
    }

    focus.current.set(
      playerPositionRef.current.x,
      playerPositionRef.current.y + 1.15,
      playerPositionRef.current.z
    );
    const horizontal = Math.cos(state.pitch) * state.distance;
    desired.current.set(
      focus.current.x - Math.sin(state.yaw) * horizontal,
      focus.current.y + Math.sin(state.pitch) * state.distance,
      focus.current.z - Math.cos(state.yaw) * horizontal
    );
    collisionPlayer.current[0] = focus.current.x;
    collisionPlayer.current[1] = focus.current.y;
    collisionPlayer.current[2] = focus.current.z;
    collisionDesired.current[0] = desired.current.x;
    collisionDesired.current[1] = desired.current.y;
    collisionDesired.current[2] = desired.current.z;
    const usedLateralCollisionEscape = resolveRpgCameraOrbitCollisionInto(
      {
        player: collisionPlayer.current,
        desiredCamera: collisionDesired.current,
        dynamicObstacles: collectRpgCameraDynamicObstacles(
          dynamicObstaclesRef.current,
          collisionObstacles.current
        )
      },
      resolved.current
    );
    const collisionAdjustment = Math.hypot(
      resolved.current[0] - collisionDesired.current[0],
      resolved.current[1] - collisionDesired.current[1],
      resolved.current[2] - collisionDesired.current[2]
    );

    collisionIsFinite.current = resolved.current.every(Number.isFinite);
    const initializePlacement =
      collisionIsFinite.current && !placementInitialized.current;
    if (collisionIsFinite.current) {
      safePosition.current.fromArray(resolved.current);
    }
    if (initializePlacement) {
      basePosition.current.copy(safePosition.current);
      placementInitialized.current = true;
    } else {
      basePosition.current.lerp(
        safePosition.current,
        1 - Math.pow(0.5, delta / 0.12)
      );
    }
    activeCamera.position
      .copy(basePosition.current)
      .add(safetyOffset.current);
    resolveRpgCameraLookQuaternionInto(
      activeCamera.position,
      focus.current,
      activeCamera.up,
      lookQuaternion.current,
      lookMatrix.current
    );
    if (initializePlacement) {
      activeCamera.quaternion.copy(lookQuaternion.current);
    } else {
      activeCamera.quaternion.slerp(
        lookQuaternion.current,
        getRpgCameraLookSlerpAlpha(delta)
      );
    }
    activeCamera.updateMatrixWorld();

    foot.current
      .set(
        playerPositionRef.current.x,
        snapshot.surfaceHeight,
        playerPositionRef.current.z
      )
      .project(activeCamera);
    head.current
      .set(
        playerPositionRef.current.x,
        snapshot.surfaceHeight + playerVisibleHeight,
        playerPositionRef.current.z
      )
      .project(activeCamera);
    const toScreenX = (value: number) => ((value + 1) * size.width) / 2;
    const toScreenY = (value: number) => ((1 - value) * size.height) / 2;
    const correction = calculateRpgCameraSafetyCorrection(
      {
        minimumX: Math.min(
          toScreenX(foot.current.x),
          toScreenX(head.current.x)
        ),
        maximumX: Math.max(
          toScreenX(foot.current.x),
          toScreenX(head.current.x)
        ),
        minimumY: Math.min(
          toScreenY(foot.current.y),
          toScreenY(head.current.y)
        ),
        maximumY: Math.max(
          toScreenY(foot.current.y),
          toScreenY(head.current.y)
        )
      },
      getRpgCameraSafeArea(mobile.current ? "mobile" : "desktop", {
        x: 0,
        y: 0,
        width: size.width,
        height: size.height
      })
    );
    safetyViolationSeconds.current = advanceRpgCameraSafetyViolation(
      safetyViolationSeconds.current,
      correction,
      delta
    );
    cameraRight.current
      .set(1, 0, 0)
      .applyQuaternion(activeCamera.quaternion);
    cameraUp.current
      .set(0, 1, 0)
      .applyQuaternion(activeCamera.quaternion);
    advanceRpgCameraSafetyOffset({
      distance: state.distance,
      correction,
      cameraRight: cameraRight.current,
      cameraUp: cameraUp.current,
      currentOffset: safetyOffset.current,
      targetOffset: safetyTarget.current,
      deltaSeconds: delta
    });
    activeCamera.position
      .copy(basePosition.current)
      .add(safetyOffset.current);
    boomDirection.current
      .copy(activeCamera.position)
      .sub(focus.current);
    if (
      boomDirection.current.length() < RPG_CAMERA_MINIMUM_BOOM_DISTANCE
    ) {
      if (boomDirection.current.lengthSq() < 1e-8) {
        boomDirection.current.set(0, 0, 1);
      }
      boomDirection.current.setLength(RPG_CAMERA_MINIMUM_BOOM_DISTANCE);
      activeCamera.position
        .copy(focus.current)
        .add(boomDirection.current);
    }
    resolveRpgCameraLookQuaternionInto(
      activeCamera.position,
      focus.current,
      activeCamera.up,
      lookQuaternion.current,
      lookMatrix.current
    );
    if (initializePlacement) {
      activeCamera.quaternion.copy(lookQuaternion.current);
    } else {
      activeCamera.quaternion.slerp(
        lookQuaternion.current,
        getRpgCameraLookSlerpAlpha(delta)
      );
    }
    activeCamera.updateMatrixWorld();

    rayDirection.current
      .copy(activeCamera.position)
      .sub(focus.current);
    const rayDistance = rayDirection.current.length();
    raycaster.current.set(
      focus.current,
      rayDirection.current.normalize()
    );
    raycaster.current.far = rayDistance;
    rayHits.current.length = 0;
    raycaster.current.intersectObjects(
      collectRpgCameraOcclusionRoots(
        scene,
        occlusionRoots.current
      ),
      true,
      rayHits.current
    );

    let nextOccluder: Object3D | null = null;
    let batchedOcclusion = false;
    for (const hit of rayHits.current) {
      const candidate = findCameraOccluder(hit.object);
      if (!candidate) continue;
      if (hit.object instanceof InstancedMesh) {
        batchedOcclusion = true;
        break;
      }
      if (candidate.userData.landmarkId !== "airport-bus") {
        nextOccluder = candidate;
      }
      break;
    }
    batchedOcclusionSeconds.current = batchedOcclusion
      ? batchedOcclusionSeconds.current + Math.max(0, delta)
      : 0;

    if (nextOccluder && nextOccluder !== occluder.current) {
      restoreMaterials();
      occluder.current = nextOccluder;
    }
    if (occluder.current) {
      const blocked = nextOccluder === occluder.current;
      advanceRpgCameraOcclusion(
        occlusion.current,
        blocked,
        delta,
        occluder.current.uuid
      );
      forEachMaterial(occluder.current, (material) => {
        if (!materialAppearances.current.has(material)) {
          materialAppearances.current.set(material, {
            transparent: material.transparent,
            opacity: material.opacity
          });
        }
        material.transparent = true;
        material.opacity =
          materialAppearances.current.get(material)!.opacity *
          occlusion.current.opacity;
        material.needsUpdate = true;
      });
      if (!blocked && occlusion.current.opacity >= 1) {
        restoreMaterials();
        occluder.current = null;
      }
    }

    const headingYaw = Math.atan2(snapshot.heading[0], snapshot.heading[2]);
    const boom = activeCamera.position.distanceTo(focus.current);
    const cameraFacingDot = -cameraRight.current
      .set(0, 0, -1)
      .applyQuaternion(activeCamera.quaternion)
      .dot(rayDirection.current);
    const telemetryNode = telemetryRef.current;
    if (telemetryNode) {
      telemetryNode.dataset.cameraYaw = String(state.yaw);
      telemetryNode.dataset.cameraPitch = String(state.pitch);
      telemetryNode.dataset.cameraBoom = String(boom);
      telemetryNode.dataset.cameraFacingDot = String(cameraFacingDot);
      telemetryNode.dataset.cameraCollisionAdjusted = String(
        collisionAdjustment > 0.001
      );
      telemetryNode.dataset.cameraCollisionAdjustment = String(
        collisionAdjustment
      );
      telemetryNode.dataset.cameraLateralCollisionEscape = String(
        usedLateralCollisionEscape
      );
      telemetryNode.dataset.playerHeading = snapshot.heading.join(",");
      const mapAnchor = projectRpgReferenceMapPoint(snapshot.position);
      telemetryNode.dataset.mapAnchorReference = `${mapAnchor.x},${mapAnchor.y}`;
      telemetryNode.dataset.cameraSafeViolationMs = String(
        Math.round(safetyViolationSeconds.current * 1000)
      );
      telemetryNode.dataset.cameraSafe = String(
        safetyViolationSeconds.current <= 0.25
      );
      telemetryNode.dataset.cameraRecentering = String(
        snapshot.moving &&
          clock.elapsedTime - state.lastManualInputSeconds >= 0.8 &&
          Math.abs(shortestCameraYawError(state.yaw, headingYaw)) >
            (5 * Math.PI) / 180
      );
      telemetryNode.dataset.cameraDiagnostic = getChaseOrbitCameraDiagnostic({
        collisionIsFinite: collisionIsFinite.current,
        batchedOcclusionSeconds: batchedOcclusionSeconds.current
      });
    }
  }, 0);

  return null;
}
