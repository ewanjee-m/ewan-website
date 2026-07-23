import { Vector3 } from "three";

const SKY_VIEW_START_PITCH = 15;
const MAX_INPUT_PITCH = 70;
const MAX_SKY_VIEW_PITCH = 32;
const MAX_SKY_VIEW_FOV = 82;

interface CameraPlacementInput {
  player: Vector3;
  surfaceNormal: Vector3;
  heading: Vector3;
  yaw: number;
  pitch: number;
}

export interface CameraPlacement {
  position: Vector3;
  target: Vector3;
  up: Vector3;
  fov: number;
}

export interface CameraPlacementBuffer {
  placement: CameraPlacement;
  orbitForward: Vector3;
  viewDirection: Vector3;
}

export function createCameraPlacementBuffer(): CameraPlacementBuffer {
  return {
    placement: {
      position: new Vector3(),
      target: new Vector3(),
      up: new Vector3(),
      fov: 48
    },
    orbitForward: new Vector3(),
    viewDirection: new Vector3()
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateCameraPlacementInto(
  {
    player,
    surfaceNormal,
    heading,
    yaw,
    pitch
  }: CameraPlacementInput,
  buffer: CameraPlacementBuffer
): CameraPlacement {
  const { placement, orbitForward, viewDirection } = buffer;
  const up = placement.up.copy(surfaceNormal).normalize();
  orbitForward
    .copy(heading)
    .addScaledVector(up, -heading.dot(up))
    .normalize()
    .applyAxisAngle(up, (yaw * Math.PI) / 180);
  const pitchProgress = clamp((pitch + 20) / 90, 0, 1);
  const cameraDistance = 6.2 - pitchProgress * pitchProgress;
  const cameraHeight = 2.4 - 1.9 * pitchProgress * pitchProgress;
  const skyViewProgress = clamp(
    (pitch - SKY_VIEW_START_PITCH) /
      (MAX_INPUT_PITCH - SKY_VIEW_START_PITCH),
    0,
    1
  );
  const viewPitch =
    pitch -
    skyViewProgress * (MAX_INPUT_PITCH - MAX_SKY_VIEW_PITCH);
  const pitchRadians = (viewPitch * Math.PI) / 180;
  viewDirection
    .copy(orbitForward)
    .multiplyScalar(Math.cos(pitchRadians))
    .addScaledVector(up, Math.sin(pitchRadians))
    .normalize();
  placement.position
    .copy(player)
    .addScaledVector(orbitForward, -cameraDistance)
    .addScaledVector(up, cameraHeight);
  placement.target.copy(placement.position).addScaledVector(viewDirection, 10);
  placement.fov = 48 + skyViewProgress * (MAX_SKY_VIEW_FOV - 48);
  return placement;
}

export function calculateCameraPlacement(
  input: CameraPlacementInput
): CameraPlacement {
  return calculateCameraPlacementInto(input, createCameraPlacementBuffer());
}
