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
  getRegionCameraProfile,
  shortestCameraYawError
} from "./ChaseOrbitCamera";
import type { InputController } from "./InputController";
import {
  RPG_CAMERA_MINIMUM_BOOM_DISTANCE,
  RPG_CAMERA_MINIMUM_BOOM_NUMERICAL_MARGIN,
  resolveRpgCameraOrbitCollisionInto,
  selectRpgCameraCollisionSafeCandidateInto,
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
import type {
  WorldCameraDragIntent,
  WorldMovementIntent
} from "./WorldInput";
import type { WorldRuntime } from "./WorldRuntime";
import { projectRpgMapWorldPoint } from "./RpgMiniMapProjection";

interface MaterialAppearance {
  transparent: boolean;
  opacity: number;
}

const RPG_CAMERA_LOOK_HALFLIFE_SECONDS = 0.08;
const RPG_CAMERA_ESCAPE_LOOK_HALFLIFE_SECONDS = 0.025;
const RPG_CAMERA_MANUAL_LOOK_ACCELERATION_SECONDS = 0.32;

export function getRpgCameraLookSlerpAlpha(
  deltaSeconds: number,
  accelerated = false
) {
  return 1 -
    Math.pow(
      0.5,
      Math.max(0, deltaSeconds) /
        (accelerated
          ? RPG_CAMERA_ESCAPE_LOOK_HALFLIFE_SECONDS
          : RPG_CAMERA_LOOK_HALFLIFE_SECONDS)
    );
}

export function shouldAccelerateRpgCameraLook({
  elapsedSeconds,
  lastManualInputSeconds,
  lateralCollisionEscape
}: {
  elapsedSeconds: number;
  lastManualInputSeconds: number;
  lateralCollisionEscape: boolean;
}) {
  if (lateralCollisionEscape) return true;
  const manualInputAge = elapsedSeconds - lastManualInputSeconds;
  return (
    Number.isFinite(manualInputAge) &&
    manualInputAge >= 0 &&
    manualInputAge <= RPG_CAMERA_MANUAL_LOOK_ACCELERATION_SECONDS
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

/** The tagged occluder a ray hit belongs to, or null when it belongs to none. */
export function findRpgCameraOccluderRoot(object: Object3D) {
  let current: Object3D | null = object;
  while (current) {
    if (current.userData.cameraOccluder === true) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

export type RpgCameraOcclusionHitDisposition =
  | "fade"
  | "batched-occlusion"
  | "ignore";

function isInstancedMeshObject(object: Object3D) {
  return (
    object instanceof InstancedMesh ||
    (object as InstancedMesh).isInstancedMesh === true
  );
}

/**
 * What the fade can do about one blocked boom, decided by the tagged occluder
 * the ray landed under rather than by the mesh it happened to hit.
 *
 * Fading works on materials, so it always fades the whole tagged occluder. That
 * is right for a landmark — a stall owns the instanced props nested inside it,
 * and fading the group fades exactly that stall. It is wrong for a batch shared
 * across the town, where one canopy in the way would fade every canopy, so a
 * batch has to opt in with `cameraOcclusionFadeBatch` before it may fade.
 *
 * Deciding on the hit mesh instead was the defect behind the hanabi report: an
 * apple inside `hanabi-apple-stall` is an instanced hit, so the stall — a plain
 * group — was refused a fade and sat opaque in front of the visitor.
 */
export function getRpgCameraOcclusionHitDisposition(
  candidate: Object3D | null
): RpgCameraOcclusionHitDisposition {
  if (!candidate || candidate.userData.landmarkId === "airport-bus") {
    return "ignore";
  }
  return isInstancedMeshObject(candidate) &&
    candidate.userData.cameraOcclusionFadeBatch !== true
    ? "batched-occlusion"
    : "fade";
}

export function forEachRpgCameraOccluderMaterial(
  object: Object3D,
  visit: (material: Material) => void
) {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
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
  // Read, never consumed: the scene runtime owns the movement intent. The
  // camera only needs to know whether the walk is straight enough to follow,
  // because following a sideways walk turns it into a circle.
  const cameraMovement = useRef<WorldMovementIntent>({
    x: 0,
    y: 0,
    runRequested: false
  });
  const focus = useRef(new Vector3());
  const desired = useRef(new Vector3());
  const safePosition = useRef(new Vector3().copy(camera.position));
  const basePosition = useRef(new Vector3().copy(camera.position));
  const resolved = useRef<[number, number, number]>([0, 0, 0]);
  const collisionPlayer = useRef<[number, number, number]>([0, 0, 0]);
  const collisionDesired = useRef<[number, number, number]>([0, 0, 0]);
  const collisionTransition = useRef<[number, number, number]>([0, 0, 0]);
  const collisionFinal = useRef<[number, number, number]>([0, 0, 0]);
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
  const usedTransitionCollisionFallback = useRef(false);
  const usedFinalCollisionFallback = useRef(false);
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
      movementIntent: input.readMovement(cameraMovement.current),
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

    const targetFov = getRegionCameraProfile(
      snapshot.navigationRegion,
      mobile.current ? "mobile" : "desktop"
    ).fovDegrees;
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
    const currentCollisionObstacles =
      collectRpgCameraDynamicObstacles(
        dynamicObstaclesRef.current,
        collisionObstacles.current
      );
    const usedLateralCollisionEscape = resolveRpgCameraOrbitCollisionInto(
      {
        player: collisionPlayer.current,
        desiredCamera: collisionDesired.current,
        dynamicObstacles: currentCollisionObstacles
      },
      resolved.current
    );
    const collisionAdjustment = Math.hypot(
      resolved.current[0] - collisionDesired.current[0],
      resolved.current[1] - collisionDesired.current[1],
      resolved.current[2] - collisionDesired.current[2]
    );
    const accelerateLook = shouldAccelerateRpgCameraLook({
      elapsedSeconds: clock.elapsedTime,
      lastManualInputSeconds: state.lastManualInputSeconds,
      lateralCollisionEscape: usedLateralCollisionEscape
    });

    collisionIsFinite.current = resolved.current.every(Number.isFinite);
    const initializePlacement =
      collisionIsFinite.current && !placementInitialized.current;
    if (collisionIsFinite.current) {
      safePosition.current.fromArray(resolved.current);
    } else {
      resolved.current[0] = safePosition.current.x;
      resolved.current[1] = safePosition.current.y;
      resolved.current[2] = safePosition.current.z;
    }
    if (initializePlacement) {
      basePosition.current.copy(safePosition.current);
      usedTransitionCollisionFallback.current = false;
      placementInitialized.current = true;
    } else {
      basePosition.current.lerp(
        safePosition.current,
        1 - Math.pow(0.5, delta / 0.12)
      );
      collisionDesired.current[0] = basePosition.current.x;
      collisionDesired.current[1] = basePosition.current.y;
      collisionDesired.current[2] = basePosition.current.z;
      usedTransitionCollisionFallback.current =
        selectRpgCameraCollisionSafeCandidateInto(
          {
            player: collisionPlayer.current,
            candidateCamera: collisionDesired.current,
            fallbackCamera: resolved.current,
            dynamicObstacles: currentCollisionObstacles
          },
          collisionTransition.current
        );
      basePosition.current.fromArray(collisionTransition.current);
    }
    collisionTransition.current[0] = basePosition.current.x;
    collisionTransition.current[1] = basePosition.current.y;
    collisionTransition.current[2] = basePosition.current.z;
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
        getRpgCameraLookSlerpAlpha(delta, accelerateLook)
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
      boomDirection.current.setLength(
        RPG_CAMERA_MINIMUM_BOOM_DISTANCE +
          RPG_CAMERA_MINIMUM_BOOM_NUMERICAL_MARGIN
      );
      activeCamera.position
        .copy(focus.current)
        .add(boomDirection.current);
    }
    collisionDesired.current[0] = activeCamera.position.x;
    collisionDesired.current[1] = activeCamera.position.y;
    collisionDesired.current[2] = activeCamera.position.z;
    usedFinalCollisionFallback.current =
      selectRpgCameraCollisionSafeCandidateInto(
        {
          player: collisionPlayer.current,
          candidateCamera: collisionDesired.current,
          fallbackCamera: collisionTransition.current,
          dynamicObstacles: currentCollisionObstacles
        },
        collisionFinal.current
      );
    activeCamera.position.fromArray(collisionFinal.current);
    if (usedFinalCollisionFallback.current) {
      safetyOffset.current.set(0, 0, 0);
      safetyTarget.current.set(0, 0, 0);
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
        getRpgCameraLookSlerpAlpha(delta, accelerateLook)
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
    const remainingSafetyCorrection =
      calculateRpgCameraSafetyCorrection(
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
        getRpgCameraSafeArea(
          mobile.current ? "mobile" : "desktop",
          {
            x: 0,
            y: 0,
            width: size.width,
            height: size.height
          }
        )
      );
    safetyViolationSeconds.current =
      advanceRpgCameraSafetyViolation(
        safetyViolationSeconds.current,
        remainingSafetyCorrection,
        delta
      );

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
      const candidate = findRpgCameraOccluderRoot(hit.object);
      const disposition = getRpgCameraOcclusionHitDisposition(candidate);
      if (disposition === "ignore") continue;
      if (disposition === "batched-occlusion") {
        batchedOcclusion = true;
        break;
      }
      nextOccluder = candidate;
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
      forEachRpgCameraOccluderMaterial(occluder.current, (material) => {
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
      telemetryNode.dataset.cameraTransitionCollisionFallback = String(
        usedTransitionCollisionFallback.current
      );
      telemetryNode.dataset.cameraFinalCollisionFallback = String(
        usedFinalCollisionFallback.current
      );
      telemetryNode.dataset.playerHeading = snapshot.heading.join(",");
      // Published through the very function the marker is drawn with, rounding
      // included. Reaching for a different projection that happens to share the
      // coordinate system left the two disagreeing in the sixth decimal, and
      // every watcher comparing them called it a mismatch.
      const mapAnchor = projectRpgMapWorldPoint(snapshot.position);
      telemetryNode.dataset.mapAnchorReference = `${mapAnchor.x},${mapAnchor.y}`;
      telemetryNode.dataset.cameraSafeViolationMs = String(
        Math.round(safetyViolationSeconds.current * 1000)
      );
      telemetryNode.dataset.cameraSafetyCorrection =
        `${remainingSafetyCorrection.x},${remainingSafetyCorrection.y}`;
      telemetryNode.dataset.cameraSafetyOffset =
        `${safetyOffset.current.x},${safetyOffset.current.y},${safetyOffset.current.z}`;
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
