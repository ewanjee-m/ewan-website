import type { DestinationId } from "../../app/guide/GuideContract";

export interface RpgVisualCameraFixture {
  readonly focusLandmarkIds: readonly string[];
  readonly focusWorldXZ: readonly [number, number];
  readonly screenOffsetDegrees: number;
  readonly pitchDegrees: number;
  readonly desktopDistance: number;
  readonly mobileDistance: number;
  readonly capturePosition?: readonly [number, number];
  readonly captureRoute?: readonly (readonly [number, number])[];
  readonly mobileCapturePosition?: readonly [number, number];
  readonly mobileCaptureRoute?: readonly (readonly [number, number])[];
  readonly mobileScreenOffsetDegrees?: number;
}

export const RPG_VISUAL_CAMERA_FIXTURES: Readonly<
  Record<DestinationId, RpgVisualCameraFixture>
> = {
  airport: {
    focusLandmarkIds: ["airport-limousine-bus"],
    // The visual is a moving coach whose route stays around x=-31. The live
    // capture overrides this fallback with telemetry from the rendered bus.
    focusWorldXZ: [-31, 8],
    screenOffsetDegrees: 0,
    pitchDegrees: 22,
    desktopDistance: 8.4,
    mobileDistance: 7.56
  },
  tokyo: {
    focusLandmarkIds: ["tokyo-blue-tower"],
    focusWorldXZ: [-17, 29],
    screenOffsetDegrees: 0,
    pitchDegrees: 18,
    desktopDistance: 7.8,
    mobileDistance: 7.02,
    capturePosition: [-8, 12],
    captureRoute: [
      [-7, 20],
      [-7, 12],
      [-8, 12]
    ]
  },
  gyukatsu: {
    focusLandmarkIds: ["gyukatsu-main-machiya"],
    focusWorldXZ: [-1, 8],
    screenOffsetDegrees: 0,
    pitchDegrees: 26,
    desktopDistance: 7,
    mobileDistance: 6.3,
    capturePosition: [4, 2]
  },
  sakura: {
    focusLandmarkIds: ["sakura-tree-01", "sakura-bridge"],
    focusWorldXZ: [14.65, -24.8],
    screenOffsetDegrees: 3.877,
    pitchDegrees: 20,
    desktopDistance: 8,
    mobileDistance: 7.2,
    capturePosition: [-4, -30],
    captureRoute: [
      [10, -18],
      [8, -20],
      [0, -20],
      [0, -24],
      [-4, -24],
      [-4, -30]
    ],
    mobileCapturePosition: [8, -36],
    mobileCaptureRoute: [
      [10, -18],
      [8, -20],
      [8, -30],
      [2, -30],
      [2, -36],
      [8, -36]
    ],
    mobileScreenOffsetDegrees: 8.536
  },
  hanabi: {
    focusLandmarkIds: ["hanabi-apple-stall", "hanabi-street-torii"],
    focusWorldXZ: [22, -14.3],
    screenOffsetDegrees: -6,
    pitchDegrees: 12,
    desktopDistance: 9.2,
    mobileDistance: 8.28,
    capturePosition: [22, 0],
    captureRoute: [
      [18, -18],
      [18, -12],
      [18, -8],
      [18, -4],
      [18, 0],
      [21.979, 0.199],
      [22, 0]
    ],
    mobileScreenOffsetDegrees: -4
  }
};

export function resolveRpgVisualCameraYaw(
  fixture: RpgVisualCameraFixture,
  playerPosition: readonly [number, number, number],
  liveFocusWorldXZ: readonly [number, number] = fixture.focusWorldXZ,
  screenOffsetDegrees = fixture.screenOffsetDegrees
) {
  return (
    Math.atan2(
      liveFocusWorldXZ[0] - playerPosition[0],
      liveFocusWorldXZ[1] - playerPosition[2]
    ) +
    screenOffsetDegrees * Math.PI / 180
  );
}
