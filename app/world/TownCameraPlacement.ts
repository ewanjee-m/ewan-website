import { Vector3 } from "three";
import type { CameraSnapshot } from "./CameraRig";

export type TownVector = readonly [number, number, number];

export interface TownCameraPlacementInput {
  player: TownVector;
  heading: TownVector;
  camera: Readonly<CameraSnapshot>;
}

export interface TownCameraPlacement {
  position: Vector3;
  target: Vector3;
  fov: number;
}

export interface TownCameraPlacementBuffer {
  placement: TownCameraPlacement;
  forward: Vector3;
}

const MIN_PITCH = -20;
const MAX_PITCH = 70;
const SKY_VIEW_START_PITCH = 15;
const MAX_SKY_VIEW_PITCH = 32;
const MAX_SKY_VIEW_FOV = 82;
const TARGET_DISTANCE = 10;
const WORLD_UP = new Vector3(0, 1, 0);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function createTownCameraPlacementBuffer(): TownCameraPlacementBuffer {
  return {
    placement: {
      position: new Vector3(),
      target: new Vector3(),
      fov: 48
    },
    forward: new Vector3(0, 0, -1)
  };
}

export function calculateTownCameraPlacementInto(
  { player, heading, camera }: TownCameraPlacementInput,
  buffer: TownCameraPlacementBuffer
): TownCameraPlacement {
  const { placement, forward } = buffer;
  const yaw = Number.isFinite(camera.yaw) ? camera.yaw : 0;
  const pitch = Number.isNaN(camera.pitch)
    ? -8
    : clamp(camera.pitch, MIN_PITCH, MAX_PITCH);
  forward.set(heading[0], 0, heading[2]);
  if (forward.lengthSq() < 1e-8) {
    forward.set(0, 0, -1);
  } else {
    forward.normalize();
  }
  forward.applyAxisAngle(WORLD_UP, (yaw * Math.PI) / 180);
  const pitchProgress = (pitch - MIN_PITCH) / (MAX_PITCH - MIN_PITCH);
  const cameraDistance = 6.2 - pitchProgress * pitchProgress;
  const cameraHeight = 2.4 - pitchProgress * pitchProgress * 1.9;
  const skyViewProgress = clamp(
    (pitch - SKY_VIEW_START_PITCH) /
      (MAX_PITCH - SKY_VIEW_START_PITCH),
    0,
    1
  );
  const viewPitch =
    pitch - skyViewProgress * (MAX_PITCH - MAX_SKY_VIEW_PITCH);
  const viewPitchRadians = (viewPitch * Math.PI) / 180;
  placement.position
    .set(player[0], player[1], player[2])
    .addScaledVector(forward, -cameraDistance)
    .addScaledVector(WORLD_UP, cameraHeight);
  placement.target
    .copy(placement.position)
    .addScaledVector(
      forward,
      Math.cos(viewPitchRadians) * TARGET_DISTANCE
    )
    .addScaledVector(
      WORLD_UP,
      Math.sin(viewPitchRadians) * TARGET_DISTANCE
    );

  placement.fov = 48 + skyViewProgress * (MAX_SKY_VIEW_FOV - 48);
  return placement;
}

export function calculateTownCameraPlacement(
  input: TownCameraPlacementInput
): TownCameraPlacement {
  return calculateTownCameraPlacementInto(
    input,
    createTownCameraPlacementBuffer()
  );
}
