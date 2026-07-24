import type { DestinationId } from "../../app/guide/GuideContract";

export interface RpgVisualCameraFixture {
  readonly focusLandmarkIds: readonly string[];
  readonly focusWorldXZ: readonly [number, number];
  readonly screenOffsetDegrees: number;
  readonly pitchDegrees: number;
  readonly desktopDistance: number;
  readonly mobileDistance: number;
  readonly capturePosition?: readonly [number, number];
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
    screenOffsetDegrees: 8,
    pitchDegrees: 22,
    desktopDistance: 7.8,
    mobileDistance: 7.02,
    capturePosition: [-9, 19.75]
  },
  gyukatsu: {
    focusLandmarkIds: ["gyukatsu-main-machiya"],
    focusWorldXZ: [-1, 8],
    screenOffsetDegrees: 8,
    pitchDegrees: 26,
    desktopDistance: 7,
    mobileDistance: 6.3
  },
  sakura: {
    focusLandmarkIds: ["sakura-tree-01", "sakura-bridge"],
    focusWorldXZ: [14.65, -24.8],
    screenOffsetDegrees: 9.622,
    pitchDegrees: 22,
    desktopDistance: 8,
    mobileDistance: 7.2,
    capturePosition: [8.5, -35.5]
  },
  hanabi: {
    focusLandmarkIds: ["hanabi-apple-stall", "hanabi-street-torii"],
    focusWorldXZ: [22, -14.3],
    screenOffsetDegrees: 0,
    pitchDegrees: 18,
    desktopDistance: 9.2,
    mobileDistance: 8.28,
    capturePosition: [27, -22]
  }
};

export function resolveRpgVisualCameraYaw(
  fixture: RpgVisualCameraFixture,
  playerPosition: readonly [number, number, number],
  liveFocusWorldXZ: readonly [number, number] = fixture.focusWorldXZ
) {
  return (
    Math.atan2(
      liveFocusWorldXZ[0] - playerPosition[0],
      liveFocusWorldXZ[1] - playerPosition[2]
    ) +
    fixture.screenOffsetDegrees * Math.PI / 180
  );
}
