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
 * How fast the visitor comes about with the turn key held. A half circle takes
 * 1.2 seconds, which is a step of walking: fast enough to answer a wrong turn,
 * slow enough that the town does not smear past.
 */
const TURN_RATE_RADIANS_PER_SECOND = Math.PI / 1.2;

export interface ChaseOrbitCameraState {
  yaw: number;
  pitch: number;
  /**
   * How far above or below the zone's own framing the visitor has dragged.
   * Kept separately from `pitch` so that walking on, or crossing into a zone
   * that frames the world differently, moves the base under them without
   * taking away the sky they chose to look at.
   */
  pitchOffsetRadians: number;
  distance: number;
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

export function createChaseOrbitCameraState(): ChaseOrbitCameraState {
  // Opens on the airport framing rather than on a value of its own. Written
  // down separately, the two drifted apart and the world opened at the old
  // steep angle before easing to the real one in front of the visitor.
  return {
    yaw: 0,
    pitch: (PROFILE.airport.pitchDegrees * Math.PI) / 180,
    pitchOffsetRadians: 0,
    distance: PROFILE.airport.distance
  };
}

function damp(value: number, target: number, halflife: number, delta: number) {
  return target + (value - target) * Math.pow(0.5, delta / halflife);
}

/**
 * Where the visitor is looking, which is also which way they are facing.
 *
 * The camera's yaw is the only record of the direction the visitor faces:
 * the body reads it, and walking is resolved along it. Keeping one value
 * rather than two is what makes it impossible for the view and the eyes to
 * disagree, and it is also what removed the old spin — when the camera chased
 * a heading that was itself derived from the camera, a sideways key fed the
 * loop and walked the visitor in a closed circle.
 *
 * `turn` is the left-right axis of whatever the visitor is holding: a key, or
 * how far a thumb has pushed the stick. It swings them where they stand.
 */
export function advanceChaseOrbitCamera(
  state: ChaseOrbitCameraState,
  input: {
    deltaSeconds: number;
    drag: Readonly<WorldCameraDragIntent>;
    turn?: number;
    navigationRegion: NavigationRegion;
    viewport?: "desktop" | "mobile";
  }
) {
  const sensitivity = input.drag.pointerKind === "touch" ? 0.006 : 0.004;
  const profile = getRegionCameraProfile(
    input.navigationRegion,
    input.viewport ?? "desktop"
  );
  const delta = Math.min(0.25, Math.max(0, input.deltaSeconds));
  const turn = Number.isFinite(input.turn)
    ? Math.min(1, Math.max(-1, input.turn ?? 0))
    : 0;

  // Turning right lowers the yaw, and dragging right lowers it by the same
  // sign, so a key and a drag can never disagree about which way is right.
  state.yaw -= turn * TURN_RATE_RADIANS_PER_SECOND * delta;
  state.yaw -= input.drag.deltaX * sensitivity;
  state.yaw = Math.atan2(Math.sin(state.yaw), Math.cos(state.yaw));

  // Up and down is the visitor's alone. The zone moves the base under their
  // offset, so crossing into the fireworks lowers the framing without taking
  // back the sky they dragged into view.
  const basePitch = (profile.pitchDegrees * Math.PI) / 180;
  state.pitchOffsetRadians += input.drag.deltaY * sensitivity;
  state.pitchOffsetRadians = Math.min(
    (MAXIMUM_CAMERA_PITCH_DEGREES * Math.PI) / 180 - basePitch,
    Math.max(
      (MINIMUM_CAMERA_PITCH_DEGREES * Math.PI) / 180 - basePitch,
      state.pitchOffsetRadians
    )
  );
  state.pitch = basePitch + state.pitchOffsetRadians;

  state.distance = damp(state.distance, profile.distance, 0.2, delta);
  return state;
}
