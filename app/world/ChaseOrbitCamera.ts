import type { DestinationId } from "../guide/GuideContract";
import type { NavigationRegion } from "./RpgWorldGeometry";
import type { WorldCameraDragIntent } from "./WorldInput";

/**
 * Per-zone camera framing.
 *
 * The top edge of the frame sits at `fov / 2 - pitch` above the horizon. The
 * earlier table put that at +0.5 degrees at the airport and below the horizon
 * at gyukatsu, so the visitor never saw sky: the world read as a flat floor,
 * and the festival fireworks — which sit 6 to 21 degrees up — could not appear
 * on screen from anywhere. These pitches keep a clear band of sky in view
 * while still looking down enough to read the ground being walked on.
 *
 * The field of view is now near-constant across zones. It used to jump from 45
 * to 60 on desktop and 52 to 75 on mobile, which stretched the whole world the
 * moment the visitor crossed a boundary and read as the lens being swapped
 * mid-walk. Those numbers were chosen to fit landmarks into evidence
 * screenshots rather than to be walked around in.
 *
 * Distance still varies per zone, which changes how much of the town is in
 * view without changing how the world is drawn.
 */
const PROFILE = {
  airport: {
    distance: 8.4,
    pitchDegrees: 14,
    desktopFovDegrees: 55,
    mobileFovDegrees: 66
  },
  tokyo: {
    distance: 7.8,
    pitchDegrees: 13,
    desktopFovDegrees: 55,
    mobileFovDegrees: 66
  },
  gyukatsu: {
    distance: 7,
    pitchDegrees: 15,
    desktopFovDegrees: 55,
    mobileFovDegrees: 66
  },
  sakura: {
    distance: 8,
    // Portrait mobile needs the extra width here to keep both the tree and the
    // bridge in frame at once.
    pitchDegrees: 13,
    desktopFovDegrees: 56,
    mobileFovDegrees: 70
  },
  hanabi: {
    distance: 9.2,
    // The lowest pitch of the five, because this is the one place the visitor
    // is meant to look up at the fireworks rather than down at the street.
    pitchDegrees: 9,
    desktopFovDegrees: 60,
    mobileFovDegrees: 72
  }
} as const;

const MINIMUM_CAMERA_PITCH_DEGREES = 0;
/**
 * How far up the visitor can swing the view. A 55 degree ceiling only allowed
 * a shallow sweep; 74 lets them look down over the town without ever passing
 * straight overhead, where the up vector would flip.
 */
const MAXIMUM_CAMERA_PITCH_DEGREES = 74;
/**
 * How long a drag holds the view before the walk is allowed to pull it back.
 * A drag is the visitor saying where they want to look, so taking the view off
 * them again after a heartbeat makes the camera feel like it is fighting them.
 * They keep it until they have walked on for a few seconds.
 */
const MANUAL_LOOK_GRACE_SECONDS = 3.5;

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

/**
 * Where the camera sits relative to the point it is looking at. Placement and
 * movement both read the camera's direction from here, so the two can never
 * disagree about which way is forward and which way is right.
 */
export function getChaseOrbitCameraOffset(
  yaw: number,
  pitch: number,
  distance: number
): readonly [number, number, number] {
  const horizontal = Math.cos(pitch) * distance;
  const basis = getChaseOrbitCameraBasis(yaw);
  return [
    -basis.forwardX * horizontal,
    Math.sin(pitch) * distance,
    -basis.forwardZ * horizontal
  ];
}

/**
 * The camera's ground-plane forward and right hand. Right is forward crossed
 * with world up, which is the same hand a viewer has: looking down -Z puts +X
 * on the right. Reading it from one place is what keeps a left key from
 * walking the visitor to the right.
 */
export function getChaseOrbitCameraBasis(yaw: number) {
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  return {
    forwardX,
    forwardZ,
    rightX: -forwardZ,
    rightZ: forwardX
  };
}

/**
 * How long the view takes to halve the angle between itself and the way the
 * visitor is walking.
 *
 * A chase camera has to swing in behind the visitor however they walk, or they
 * spend the session looking at their own profile. But movement is resolved
 * against the camera, so chasing the heading feeds itself: the heading leads
 * the camera, the camera turns toward it, and the walk direction turns with
 * the camera. At the 0.18s this used to run at, that loop spun the visitor
 * almost twice on the spot in two seconds while moving them 0.17 units. Slowed
 * to 1.4s the identical coupling becomes a wide, natural curve: about a 4 unit
 * radius at walking pace, which reads as leaning into a turn.
 */
const RECENTER_HALFLIFE_SECONDS = 1.4;

/**
 * How much sideways is too much for the view to follow.
 *
 * Movement is resolved against the camera, so the heading is always the
 * camera's yaw plus the angle of the key being held. A camera that chases that
 * heading can therefore never catch it while a sideways key is down — the gap
 * stays open for as long as the key is held, and the visitor is walked around
 * a circle back to where they started. Chasing fast makes it a pirouette;
 * chasing slowly only makes the circle wider. Neither is a walk.
 *
 * So the view follows a walk that is roughly straight ahead, and holds still
 * for a sideways one. Straight ahead is also the only case where following has
 * anything to do: the heading and the yaw already agree, and what the recentre
 * corrects is the gap a drag left behind.
 */
const RECENTER_LATERAL_LIMIT = 0.35;

export function shouldRecenterChaseOrbitCamera(
  movementIntent: Readonly<{ x: number; y: number }> | undefined
) {
  if (!movementIntent) return true;
  const { x, y } = movementIntent;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const length = Math.hypot(x, y);
  if (length <= 1e-8) return false;
  return y / length > 0 && Math.abs(x / length) <= RECENTER_LATERAL_LIMIT;
}

export function createChaseOrbitCameraState(): ChaseOrbitCameraState {
  // Opens on the airport framing rather than on a value of its own. Written
  // down separately, the two drifted apart and the world opened at the old
  // steep angle before easing to the real one in front of the visitor.
  return {
    yaw: 0,
    pitch: (PROFILE.airport.pitchDegrees * Math.PI) / 180,
    distance: PROFILE.airport.distance,
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
    movementIntent?: Readonly<{ x: number; y: number }>;
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
      (MAXIMUM_CAMERA_PITCH_DEGREES * Math.PI) / 180,
      Math.max(
        (MINIMUM_CAMERA_PITCH_DEGREES * Math.PI) / 180,
        state.pitch + input.drag.deltaY * sensitivity
      )
    );
    state.lastManualInputSeconds = input.elapsedSeconds;
  } else if (
    input.moving &&
    // Walking straight ahead is the visitor saying "this way now", so it ends
    // the grace a drag bought rather than waiting it out. Standing still or
    // stepping sideways keeps the view they chose.
    (shouldRecenterChaseOrbitCamera(input.movementIntent) ||
      input.elapsedSeconds - state.lastManualInputSeconds >=
        MANUAL_LOOK_GRACE_SECONDS)
  ) {
    if (shouldRecenterChaseOrbitCamera(input.movementIntent)) {
      const error = shortestCameraYawError(state.yaw, input.headingYaw);
      state.yaw +=
        error *
        (1 - Math.pow(0.5, input.deltaSeconds / RECENTER_HALFLIFE_SECONDS));
    }
    // Pitch belongs to the zone the visitor is standing in, not to the
    // direction they happen to be walking, so it settles either way.
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
