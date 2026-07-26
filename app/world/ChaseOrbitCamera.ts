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

/**
 * How fast the visitor comes about when they ask to face the other way.
 *
 * Held turning and coming about are two different things and third-person
 * action games treat them as such: a held turn is a steering rate, while an
 * about-face is a pivot that lands in a fraction of a second. Running the
 * pivot at the steering rate took 1.2 seconds, which reads as being spun
 * rather than as turning to look behind. 0.28 seconds is a pivot the eye
 * follows without waiting on.
 */
const ABOUT_FACE_RATE_RADIANS_PER_SECOND = Math.PI / 0.28;

/**
 * How long the back control has to be let go of before it can turn the visitor
 * again.
 *
 * A person releasing a key and pressing it again is away for a fifth of a
 * second at the very least. An intent that merely flickers off for a frame,
 * which is what a thumb resting on the edge of the stick does, is not a second
 * press, and treating it as one is what spun the visitor on and on.
 */
const RPG_ABOUT_FACE_RELEASE_SECONDS = 0.2;

export interface ChaseOrbitCameraState {
  yaw: number;
  pitch: number;
  /**
   * How much of an about-face is still to be turned, in radians, and whether
   * the back key was already down last frame. Pressing back turns the visitor
   * round rather than walking them backwards, so it has to fire once per press
   * instead of every frame the key is held.
   */
  aboutFaceRemaining: number;
  aboutFaceHeld: boolean;
  aboutFaceReleasedSeconds: number;
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
    aboutFaceRemaining: 0,
    aboutFaceHeld: false,
    aboutFaceReleasedSeconds: RPG_ABOUT_FACE_RELEASE_SECONDS,
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
    /** True while the visitor is asking to face the other way. */
    aboutFace?: boolean;
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

  // Back is a turn, not a reverse gear: it swings the visitor round to face
  // the other way and then they walk on.
  //
  // Latched on the press, and refused while one is still swinging, so that a
  // held key turns them once instead of spinning them and a thumb wobbling on
  // the stick cannot queue another turn on top of the one running.
  const aboutFace = Boolean(input.aboutFace);
  // Read how long it has been let go of before this frame's press resets it,
  // or the press would always find its own zero and never arm.
  const releasedFor = state.aboutFaceReleasedSeconds;
  state.aboutFaceReleasedSeconds = aboutFace ? 0 : releasedFor + delta;
  if (
    aboutFace &&
    !state.aboutFaceHeld &&
    state.aboutFaceRemaining <= 0 &&
    releasedFor >= RPG_ABOUT_FACE_RELEASE_SECONDS
  ) {
    state.aboutFaceRemaining = Math.PI;
  }
  state.aboutFaceHeld = aboutFace;
  const swing = Math.min(
    state.aboutFaceRemaining,
    ABOUT_FACE_RATE_RADIANS_PER_SECOND * delta
  );
  state.aboutFaceRemaining = Math.max(0, state.aboutFaceRemaining - swing);

  // Turning right lowers the yaw, and dragging right lowers it by the same
  // sign, so a key and a drag can never disagree about which way is right.
  //
  // The turn axis is ignored while an about-face runs. A stick pushed "down"
  // is never exactly down, and that leftover sideways lean used to ride on top
  // of the swing and keep turning the visitor after it finished.
  if (swing <= 0) {
    state.yaw -= turn * TURN_RATE_RADIANS_PER_SECOND * delta;
  }
  state.yaw -= swing;
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
