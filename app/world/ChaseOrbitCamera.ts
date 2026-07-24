import type { DestinationId } from "../guide/GuideContract";
import type { NavigationRegion } from "./RpgWorldGeometry";
import type { WorldCameraDragIntent } from "./WorldInput";

const PROFILE = {
  airport: {
    distance: 8.4,
    pitchDegrees: 22,
    desktopFovDegrees: 45,
    mobileFovDegrees: 52
  },
  tokyo: {
    distance: 7.8,
    pitchDegrees: 18,
    desktopFovDegrees: 45,
    mobileFovDegrees: 52
  },
  gyukatsu: {
    distance: 7,
    pitchDegrees: 26,
    desktopFovDegrees: 45,
    mobileFovDegrees: 52
  },
  sakura: {
    distance: 8,
    pitchDegrees: 20,
    desktopFovDegrees: 45,
    mobileFovDegrees: 70
  },
  hanabi: {
    distance: 9.2,
    pitchDegrees: 12,
    desktopFovDegrees: 60,
    mobileFovDegrees: 75
  }
} as const;

const MINIMUM_CAMERA_PITCH_DEGREES = 0;

export interface ChaseOrbitCameraState {
  yaw: number;
  pitch: number;
  distance: number;
  lastManualInputSeconds: number;
}

export type ChaseOrbitCameraDiagnostic =
  | "ok"
  | "non-finite-collision"
  | "batched-occlusion";

export function getChaseOrbitCameraDiagnostic({
  collisionIsFinite,
  batchedOcclusionSeconds
}: {
  collisionIsFinite: boolean;
  batchedOcclusionSeconds: number;
}): ChaseOrbitCameraDiagnostic {
  return !collisionIsFinite
    ? "non-finite-collision"
    : batchedOcclusionSeconds >= 0.25
      ? "batched-occlusion"
      : "ok";
}

export function getRegionCameraProfile(
  region: DestinationId | NavigationRegion,
  viewport: "desktop" | "mobile"
) {
  const mix = (from: number, to: number, progress: number) =>
    from + (to - from) * progress;
  const profile =
    typeof region === "string" || region.kind === "zone"
      ? PROFILE[typeof region === "string" ? region : region.displayZoneId]
      : (() => {
          const linear = Math.min(1, Math.max(0, region.progress));
          const progress = linear * linear * (3 - 2 * linear);
          const from = PROFILE[region.fromZoneId];
          const to = PROFILE[region.toZoneId];
          return {
            distance: mix(from.distance, to.distance, progress),
            pitchDegrees: mix(
              from.pitchDegrees,
              to.pitchDegrees,
              progress
            ),
            desktopFovDegrees: mix(
              from.desktopFovDegrees,
              to.desktopFovDegrees,
              progress
            ),
            mobileFovDegrees: mix(
              from.mobileFovDegrees,
              to.mobileFovDegrees,
              progress
            )
          };
        })();

  return {
    distance: profile.distance * (viewport === "mobile" ? 0.9 : 1),
    pitchDegrees: profile.pitchDegrees,
    fovDegrees:
      viewport === "mobile"
        ? profile.mobileFovDegrees
        : profile.desktopFovDegrees
  };
}

export function createChaseOrbitCameraState(): ChaseOrbitCameraState {
  return {
    yaw: 0,
    pitch: (22 * Math.PI) / 180,
    distance: 8.4,
    lastManualInputSeconds: Number.NEGATIVE_INFINITY
  };
}

function damp(value: number, target: number, halflife: number, delta: number) {
  return target + (value - target) * Math.pow(0.5, delta / halflife);
}

export function shortestCameraYawError(value: number, target: number) {
  return Math.atan2(Math.sin(target - value), Math.cos(target - value));
}

export function advanceChaseOrbitCamera(
  state: ChaseOrbitCameraState,
  input: {
    deltaSeconds: number;
    elapsedSeconds: number;
    drag: Readonly<WorldCameraDragIntent>;
    moving: boolean;
    headingYaw: number;
    navigationRegion: NavigationRegion;
    viewport?: "desktop" | "mobile";
  }
) {
  const sensitivity = input.drag.pointerKind === "touch" ? 0.006 : 0.004;
  const profile = getRegionCameraProfile(
    input.navigationRegion,
    input.viewport ?? "desktop"
  );
  if (input.drag.deltaX !== 0 || input.drag.deltaY !== 0) {
    state.yaw -= input.drag.deltaX * sensitivity;
    state.pitch = Math.min(
      (55 * Math.PI) / 180,
      Math.max(
        (MINIMUM_CAMERA_PITCH_DEGREES * Math.PI) / 180,
        state.pitch + input.drag.deltaY * sensitivity
      )
    );
    state.lastManualInputSeconds = input.elapsedSeconds;
  } else if (
    input.moving &&
    input.elapsedSeconds - state.lastManualInputSeconds >= 0.8
  ) {
    const error = shortestCameraYawError(state.yaw, input.headingYaw);
    state.yaw += error * (1 - Math.pow(0.5, input.deltaSeconds / 0.18));
    state.pitch = damp(
      state.pitch,
      (profile.pitchDegrees * Math.PI) / 180,
      0.2,
      input.deltaSeconds
    );
  }
  state.distance = damp(
    state.distance,
    profile.distance,
    0.2,
    input.deltaSeconds
  );
  return state;
}
