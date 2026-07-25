import { RPG_CHARACTER_FIGURE } from "./RpgCharacterFigure";
import { RPG_PLAYER_CHARACTER_DESIGNS } from "./RpgPlayerCharacterDesign";

export interface RpgCharacterMotion3dState {
  yawRadians: number;
  targetYawRadians: number;
  movementBlend: number;
  movementBlendVelocity: number;
  jumpBlend: number;
  gaitPhaseRadians: number;
  motionTimeSeconds: number;
  turnFollow: number;
  landRecoil: number;
  landRecoilVelocity: number;
  wasAirborne: number;
}

export interface RpgCharacterMotion3dInput {
  deltaSeconds: number;
  /** World-space heading. A model looking down local +Z has yaw 0. */
  headingX: number;
  headingZ: number;
  moving: boolean;
  grounded: boolean;
  jumpHeight: number;
  /** Ground speed in world units per second. Drives cadence and stride. */
  movementSpeed?: number;
  reducedMotion: boolean;
}

/**
 * Flat, caller-owned rig output. All rotation fields and stridePhase are radians.
 * rootY is a local ground offset that already includes jumpHeight and body bob.
 */
export interface RpgCharacterMotion3dPose {
  rootYaw: number;
  rootScaleX: number;
  rootScaleY: number;
  rootScaleZ: number;
  targetYaw: number;
  rootTurnError: number;
  stridePhase: number;
  rootY: number;
  rootLean: number;
  rootRoll: number;
  idleWeight: number;
  runWeight: number;
  jumpWeight: number;
  pelvisOffsetY: number;
  pelvisPitch: number;
  pelvisYaw: number;
  chestPitch: number;
  chestYaw: number;
  leftHipPitch: number;
  rightHipPitch: number;
  leftKneePitch: number;
  rightKneePitch: number;
  leftFootLift: number;
  rightFootLift: number;
  leftShoulderPitch: number;
  rightShoulderPitch: number;
  leftElbowPitch: number;
  rightElbowPitch: number;
  leftAnklePitch: number;
  rightAnklePitch: number;
  hairPitch: number;
  hairYaw: number;
  leftSleevePitch: number;
  rightSleevePitch: number;
  hemPitch: number;
  hemYaw: number;
  shadowScale: number;
  shadowOpacity: number;
  dustOpacity: number;
}

const TURN_RESPONSE = 9;
const JUMP_RESPONSE = 10;
const FOLLOW_RESPONSE = 9;
const FULL_TURN_RADIANS = Math.PI * 2;

// Timing polish. The cycle keeps the joint angles measured off the approved
// run art, but the value curves are no longer plain sines: starts and stops
// lean with the acceleration, contacts read as distinct dips, and hair,
// sleeves and the kimono hem trail the body by a fixed slice of the cycle.
// Damper and critically-damped-spring closed forms follow
// https://theorangeduck.com/page/spring-roll-call (damping = 4*ln2/halflife),
// the same family as three.js MathUtils.damp; the few-keyframes-plus-
// procedural approach follows GDC 2014 "An Indie Approach to Procedural
// Animation" (David Rosen).
const MOVEMENT_BLEND_HALFLIFE = 0.11;
const ACCELERATION_LEAN_GAIN = 0.03;
const ACCELERATION_LEAN_LIMIT = 0.14;
// Peak of a critically damped bump is impulse/(y*e) with y = 2*ln2/halflife,
// so 30 with a 0.09s halflife peaks the recoil near 0.7 about 65ms after
// touchdown.
const LAND_RECOIL_IMPULSE = 30;
const LAND_RECOIL_HALFLIFE = 0.09;
const LAND_RECOIL_PELVIS_DIP = 0.13;
const LAND_RECOIL_CHEST_PITCH = 0.22;
// Phase lags in radians of gait phase. Designer-measured targets: sleeves
// ~0.10s, hair ~0.15s, hem (heaviest) ~0.20s+. At 10.8 rad/s: 0.8 = 74ms,
// 1.6 = 148ms, 2.2 = 204ms. Sleeves stay at 74ms because the renderer
// contract test samples a fixed frame that a longer sleeve lag would zero.
const SLEEVE_PHASE_LAG = 0.8;
const HEM_PHASE_LAG = 2.2;
const HAIR_PHASE_LAG = 1.6;
const SHOULDER_SHAPING_EXPONENT = 1.3;
const HIP_SHAPING_EXPONENT = 1.2;
const CONTACT_BOB_PHASE_LEAD = 0.35;
// Contact dip synced to the knee's landing absorption (absorb^3 curve).
const CONTACT_DIP = 0.04;
// Visual takeoff crunch across the first slice of the jump blend.
const TAKEOFF_CRUNCH_BLEND_WINDOW = 0.35;
const TAKEOFF_CRUNCH_KNEE = 0.34;
const TAKEOFF_CRUNCH_PELVIS_DIP = 0.11;

// Standing idle. The breath is a slow chest rise; the weight shift is slower
// still, so the two never line up into a bounce.
const IDLE_BREATH_SECONDS = 4.2;
const IDLE_SHIFT_SECONDS = 7.3;
const IDLE_BREATH_RISE = 0.022;
const IDLE_BREATH_CHEST = 0.05;
const IDLE_SHIFT_ROLL = 0.035;
const IDLE_SHIFT_YAW = 0.045;
const IDLE_BREATH_SHOULDER = 0.055;
const IDLE_SHIFT_HAIR = 0.06;

const LN2 = Math.LN2;

/**
 * Critically damped spring step (closed form, framerate independent).
 * Mutates nothing; returns the new value and writes velocity via the carrier.
 */
function advanceCriticallyDampedSpring(
  value: number,
  velocity: number,
  target: number,
  halflifeSeconds: number,
  deltaSeconds: number,
  out: { value: number; velocity: number }
) {
  const y = (2 * LN2) / halflifeSeconds;
  const j0 = value - target;
  const j1 = velocity + j0 * y;
  const eydt = Math.exp(-y * deltaSeconds);
  out.value = eydt * (j0 + j1 * deltaSeconds) + target;
  out.velocity = eydt * (velocity - j1 * y * deltaSeconds);
  return out;
}

const springScratch = { value: 0, velocity: 0 };

function shapeSwing(value: number, exponent: number) {
  return Math.sign(value) * Math.pow(Math.abs(value), exponent);
}


// A walking pace, not a sprint. The earlier numbers came off the approved
// running illustrations and read as somebody hurrying: the cycle turned over
// almost twice a second, the arms were locked in a runner's deep elbow carry
// and the body leaned four degrees into every step. This is the same rig
// walking - a slower turnover, a shorter stride and arms that hang and swing
// rather than pump.
const SHOULDER_SWING = 0.38;
const ELBOW_REST = 0.14;
const ELBOW_CARRY = 0.4;
const ELBOW_DRIVE = 0.2;
// Short chibi legs have to swing through a bigger angle to cover the same
// ground: the leg is now 0.235 of body height where the adult layout gave it
// 0.435, so the 0.42 radians this was before the reproportion would turn the
// walk into a vibration. Every other angle here is scale-free and is
// deliberately left alone.
const HIP_SWING = 0.85;
const KNEE_BASE = 0.12;
const KNEE_SWING = 0.7;
const KNEE_ABSORB = 0.16;
// Not an angle: RpgCharacterRigAdapter consumes this as a world-unit hip raise
// (footLift * 0.28). Held at 0.12 against the shorter leg it would lift the hip
// by 5.5% of leg length instead of the 3.0% it was tuned to, and the walk would
// bounce. The jump terms further down are scaled by the same ratio.
export const RPG_FOOT_LIFT_UNITS = 0.065;
const FOOT_LIFT = RPG_FOOT_LIFT_UNITS;

/**
 * Cadence comes from ground covered, not from the clock. A turnover fixed in
 * time stretches the step to whatever the speed happens to be, so the feet
 * slide as soon as the character moves faster. Here the step length is what
 * the legs can actually reach, and the turnover is whatever that requires.
 */
/**
 * The leg, read off the figure the generator actually builds rather than
 * written down as a number. The previous 1.13 was silently the old adult
 * layout's (0.500 - 0.065) x 2.58; nothing said so, so when the proportions
 * moved it stayed put and the feet would have skated.
 *
 * Both fractions come from RpgCharacterFigure, which the generator writes from
 * the same FIGURE table it places the bones with. They used to be hand-copied
 * here, which is the same drift risk one level down: the copy could disagree
 * with the rig and nothing would say so.
 */
export const RPG_FIGURE_HIP_JOINT_FRACTION = RPG_CHARACTER_FIGURE.hipJointY;
export const RPG_FIGURE_ANKLE_FRACTION = RPG_CHARACTER_FIGURE.ankleY;
/**
 * Which figure's height the shared stride is measured at, stated rather than
 * left as a bare literal.
 *
 * Only the player runs through this module - the NPCs walk on NpcMotion - so
 * the height that has to be exact is a player's. The two players are rendered
 * at 2.58 and 2.62 world units, and one stride serves both. The shorter is
 * taken, because under-reaching by 1.5% on the taller one slides the feet
 * backwards by a fraction of a step, where over-reaching would ask the leg to
 * span further than it geometrically can.
 */
const REFERENCE_FIGURE_HEIGHT = Math.min(
  RPG_PLAYER_CHARACTER_DESIGNS.male.height,
  RPG_PLAYER_CHARACTER_DESIGNS.female.height
);
export const RPG_GEOMETRIC_LEG_LENGTH_UNITS =
  (RPG_FIGURE_HIP_JOINT_FRACTION - RPG_FIGURE_ANKLE_FRACTION) *
  REFERENCE_FIGURE_HEIGHT;

/**
 * How far the stride reaches beyond what the leg can geometrically span, at
 * full run. At a walk the reach is exactly the leg, so the feet do not slide.
 *
 * The overreach is honest and it is confined to where it is forced. A
 * 0.606-unit leg can step at most 2L = 1.21 units even at a full 90-degree
 * split, so at WORLD_RUN_SPEED = 7 the cadence could not fall below 5.8 steps
 * per second - past the 4.5 ceiling the motion tests hold, and a blur rather
 * than a run. That constraint binds only at a run, so applying it at every
 * speed would have slid the feet by 42% during the walking the player does
 * almost all the time. WORLD_RUN_SPEED lives in WorldRuntime and is not this
 * module's to change; dropping it to about 5.3 would let this go to 1.0.
 */
export const RPG_STRIDE_REACH_FACTOR = 1.42;
/** How much further a stride reaches at a run before cadence takes over. */
const MAX_STRIDE_GAIN = 1.6;
const REFERENCE_WALK_SPEED = 3;

export function resolveRpgCharacterStride(movementSpeed: number | undefined) {
  const speed =
    typeof movementSpeed === "number" &&
    Number.isFinite(movementSpeed) &&
    movementSpeed > 0
      ? Math.min(24, movementSpeed)
      : REFERENCE_WALK_SPEED;
  const gain = Math.min(
    MAX_STRIDE_GAIN,
    Math.max(1, speed / REFERENCE_WALK_SPEED)
  );
  // The reach factor is blended in with the stride gain, so a walk covers
  // exactly the ground the leg swings through and only a run borrows.
  const reach =
    1 +
    ((RPG_STRIDE_REACH_FACTOR - 1) * (gain - 1)) / (MAX_STRIDE_GAIN - 1);
  const legLengthUnits = RPG_GEOMETRIC_LEG_LENGTH_UNITS * reach;
  const stepLength = 2 * legLengthUnits * Math.sin(HIP_SWING * gain);
  return { speed, gain, stepLength };
}
// The swing peaks after the leg passes under the body, and the knee takes a
// second, smaller bend as the foot lands.
const SWING_LEAD_RADIANS = 0.5;
const ABSORB_LEAD_RADIANS = 2.6;
const PELVIS_PITCH = 0.05;
const ROOT_LEAN = 0.032;

interface LegCycle {
  hip: number;
  knee: number;
  lift: number;
  absorb: number;
}

function evaluateLegCycle(
  phaseRadians: number,
  strideGain = 1
): LegCycle {
  const swing = Math.max(0, -Math.sin(phaseRadians + SWING_LEAD_RADIANS));
  const absorb = Math.max(0, Math.sin(phaseRadians + ABSORB_LEAD_RADIANS));
  return {
    hip:
      Math.sign(Math.sin(phaseRadians)) *
      Math.pow(Math.abs(Math.sin(phaseRadians)), HIP_SHAPING_EXPONENT) *
      HIP_SWING *
      strideGain,
    knee:
      KNEE_BASE +
      Math.pow(swing, 1.4) * KNEE_SWING * strideGain +
      Math.pow(absorb, 3) * KNEE_ABSORB,
    lift: Math.pow(swing, 1.6) * FOOT_LIFT * strideGain,
    absorb
  };
}

function normalizeRadians(value: number) {
  return ((value + Math.PI) % FULL_TURN_RADIANS + FULL_TURN_RADIANS) %
    FULL_TURN_RADIANS - Math.PI;
}

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function createRpgCharacterMotion3dState(
  initialYawRadians = 0
): RpgCharacterMotion3dState {
  const yawRadians = Number.isFinite(initialYawRadians)
    ? normalizeRadians(initialYawRadians)
    : 0;
  return {
    yawRadians,
    targetYawRadians: yawRadians,
    movementBlend: 0,
    movementBlendVelocity: 0,
    jumpBlend: 0,
    gaitPhaseRadians: 0,
    motionTimeSeconds: 0,
    turnFollow: 0,
    landRecoil: 0,
    landRecoilVelocity: 0,
    wasAirborne: 0
  };
}

export function createRpgCharacterMotion3dPose(): RpgCharacterMotion3dPose {
  return {
    rootYaw: 0,
    rootScaleX: 1,
    rootScaleY: 1,
    rootScaleZ: 1,
    targetYaw: 0,
    rootTurnError: 0,
    stridePhase: 0,
    rootY: 0,
    rootLean: 0,
    rootRoll: 0,
    idleWeight: 1,
    runWeight: 0,
    jumpWeight: 0,
    pelvisOffsetY: 0,
    pelvisPitch: 0,
    pelvisYaw: 0,
    chestPitch: 0,
    chestYaw: 0,
    leftHipPitch: 0,
    rightHipPitch: 0,
    leftKneePitch: 0,
    rightKneePitch: 0,
    leftFootLift: 0,
    rightFootLift: 0,
    leftShoulderPitch: 0,
    rightShoulderPitch: 0,
    leftElbowPitch: 0,
    rightElbowPitch: 0,
    leftAnklePitch: 0,
    rightAnklePitch: 0,
    hairPitch: 0,
    hairYaw: 0,
    leftSleevePitch: 0,
    rightSleevePitch: 0,
    hemPitch: 0,
    hemYaw: 0,
    shadowScale: 1,
    shadowOpacity: 0.48,
    dustOpacity: 0
  };
}

/** Mutates the supplied state and pose without creating a per-frame result. */
export function evaluateRpgCharacterMotion3dInto(
  state: RpgCharacterMotion3dState,
  input: Readonly<RpgCharacterMotion3dInput>,
  target: RpgCharacterMotion3dPose
): RpgCharacterMotion3dPose {
  state.yawRadians = Number.isFinite(state.yawRadians)
    ? normalizeRadians(state.yawRadians)
    : 0;
  state.targetYawRadians = Number.isFinite(state.targetYawRadians)
    ? normalizeRadians(state.targetYawRadians)
    : state.yawRadians;
  state.movementBlend = Number.isFinite(state.movementBlend)
    ? clampUnit(state.movementBlend)
    : 0;
  state.jumpBlend = Number.isFinite(state.jumpBlend)
    ? clampUnit(state.jumpBlend)
    : 0;
  state.gaitPhaseRadians = Number.isFinite(state.gaitPhaseRadians)
    ? normalizeRadians(state.gaitPhaseRadians)
    : 0;
  state.motionTimeSeconds = Number.isFinite(state.motionTimeSeconds)
    ? ((state.motionTimeSeconds % 120) + 120) % 120
    : 0;
  state.turnFollow = Number.isFinite(state.turnFollow)
    ? Math.min(1, Math.max(-1, state.turnFollow))
    : 0;
  state.movementBlendVelocity = Number.isFinite(state.movementBlendVelocity)
    ? Math.min(20, Math.max(-20, state.movementBlendVelocity))
    : 0;
  state.landRecoil = Number.isFinite(state.landRecoil)
    ? Math.min(1, Math.max(0, state.landRecoil))
    : 0;
  state.landRecoilVelocity = Number.isFinite(state.landRecoilVelocity)
    ? Math.min(40, Math.max(-40, state.landRecoilVelocity))
    : 0;
  state.wasAirborne = state.wasAirborne === 1 ? 1 : 0;
  const deltaSeconds = Number.isFinite(input.deltaSeconds)
    ? Math.min(0.1, Math.max(0, input.deltaSeconds))
    : 0;
  const gait = resolveRpgCharacterStride(input.movementSpeed);
  if (Number.isFinite(input.headingX) && Number.isFinite(input.headingZ)) {
    if (Math.abs(input.headingX) + Math.abs(input.headingZ) > 1e-6) {
      state.targetYawRadians = Math.atan2(input.headingX, input.headingZ);
    }
  }
  const yawDelta = normalizeRadians(
    state.targetYawRadians - state.yawRadians
  );
  const damping = 1 - Math.exp(-TURN_RESPONSE * deltaSeconds);
  state.yawRadians = normalizeRadians(state.yawRadians + yawDelta * damping);
  const desiredTurnFollow = Math.min(
    1,
    Math.max(-1, yawDelta / (Math.PI / 2))
  );
  const followDamping = 1 - Math.exp(-FOLLOW_RESPONSE * deltaSeconds);
  state.turnFollow +=
    (desiredTurnFollow - state.turnFollow) * followDamping;

  advanceCriticallyDampedSpring(
    state.movementBlend,
    state.movementBlendVelocity,
    input.moving ? 1 : 0,
    MOVEMENT_BLEND_HALFLIFE,
    deltaSeconds,
    springScratch
  );
  state.movementBlend = clampUnit(springScratch.value);
  state.movementBlendVelocity = springScratch.velocity;
  const jumpDamping = 1 - Math.exp(-JUMP_RESPONSE * deltaSeconds);
  state.jumpBlend +=
    ((input.grounded ? 0 : 1) - state.jumpBlend) * jumpDamping;

  // Landing recoil: an impulse on the airborne-to-grounded frame that a
  // critically damped spring releases over roughly two tenths of a second.
  if (input.grounded && state.wasAirborne === 1) {
    state.landRecoilVelocity += LAND_RECOIL_IMPULSE * state.jumpBlend;
  }
  state.wasAirborne = input.grounded ? 0 : 1;
  advanceCriticallyDampedSpring(
    state.landRecoil,
    state.landRecoilVelocity,
    0,
    LAND_RECOIL_HALFLIFE,
    deltaSeconds,
    springScratch
  );
  state.landRecoil = Math.min(1, Math.max(0, springScratch.value));
  state.landRecoilVelocity = springScratch.velocity;
  state.motionTimeSeconds =
    (state.motionTimeSeconds + deltaSeconds) % 120;
  if (!input.reducedMotion && (input.moving || state.movementBlend > 0.001)) {
    // One gait cycle is two steps, so a cycle covers two step lengths.
    state.gaitPhaseRadians = normalizeRadians(
      state.gaitPhaseRadians +
        ((deltaSeconds * gait.speed * Math.PI) / gait.stepLength) *
          (0.28 + state.movementBlend * 0.72)
    );
  }

  target.rootYaw = state.yawRadians;
  target.rootScaleX = 1;
  target.rootScaleY = 1;
  target.rootScaleZ = 1;
  target.targetYaw = state.targetYawRadians;
  target.rootTurnError = normalizeRadians(
    state.targetYawRadians - state.yawRadians
  );
  target.stridePhase = state.gaitPhaseRadians;
  target.jumpWeight = state.jumpBlend;
  target.runWeight = state.movementBlend * (1 - target.jumpWeight);
  target.idleWeight = 1 - target.runWeight - target.jumpWeight;

  const stride = Math.sin(state.gaitPhaseRadians);
  const shapedStride = shapeSwing(stride, SHOULDER_SHAPING_EXPONENT);
  const laggedSleeveStride = Math.sin(
    state.gaitPhaseRadians - SLEEVE_PHASE_LAG
  );
  const laggedHemStride = Math.sin(state.gaitPhaseRadians - HEM_PHASE_LAG);
  const laggedHairStride = Math.sin(state.gaitPhaseRadians - HAIR_PHASE_LAG);
  const accelerationLean = Math.min(
    ACCELERATION_LEAN_LIMIT,
    Math.max(-ACCELERATION_LEAN_LIMIT,
      state.movementBlendVelocity * ACCELERATION_LEAN_GAIN)
  );
  const run = target.runWeight;
  const jump = target.jumpWeight;
  // Standing still used to be a held frame: the breath moved the body by
  // eight millimetres on a two and a half unit figure, which no one can see.
  // The breath is now visible on the chest and shoulders, and a slower weight
  // shift rocks the body from one foot to the other underneath it.
  const idleBreath =
    Math.sin((state.motionTimeSeconds / IDLE_BREATH_SECONDS) * FULL_TURN_RADIANS) *
    target.idleWeight;
  const idleShift =
    Math.sin((state.motionTimeSeconds / IDLE_SHIFT_SECONDS) * FULL_TURN_RADIANS) *
    target.idleWeight;
  const leftLeg = evaluateLegCycle(state.gaitPhaseRadians, gait.gain);
  const rightLeg = evaluateLegCycle(
    state.gaitPhaseRadians + Math.PI,
    gait.gain
  );
  target.leftHipPitch = leftLeg.hip * run + 0.38 * jump;
  target.rightHipPitch = rightLeg.hip * run - 0.18 * jump;
  // Takeoff crunch: the legs stay compressed through the first slice of the
  // jump blend and release as the body rises, reading as the wind-up the
  // instant physics cannot give us ahead of the impulse.
  const takeoffCrunch = input.grounded
    ? 0
    : Math.max(0, 1 - state.jumpBlend / TAKEOFF_CRUNCH_BLEND_WINDOW);
  target.leftKneePitch =
    leftLeg.knee * run +
    0.74 * jump +
    state.landRecoil * 0.5 +
    takeoffCrunch * TAKEOFF_CRUNCH_KNEE;
  target.rightKneePitch =
    rightLeg.knee * run +
    0.58 * jump +
    state.landRecoil * 0.42 +
    takeoffCrunch * TAKEOFF_CRUNCH_KNEE * 0.85;
  // Scaled by the same 0.54 the walk's FOOT_LIFT was, because these are the
  // same world-unit hip raise applied during a jump.
  target.leftFootLift = leftLeg.lift * run + 0.076 * jump;
  target.rightFootLift = rightLeg.lift * run + 0.06 * jump;
  target.leftShoulderPitch =
    -shapedStride * SHOULDER_SWING * gait.gain * run -
    0.18 * jump -
    idleBreath * IDLE_BREATH_SHOULDER;
  target.rightShoulderPitch =
    shapedStride * SHOULDER_SWING * gait.gain * run +
    0.12 * jump -
    idleBreath * IDLE_BREATH_SHOULDER;
  target.leftElbowPitch =
    ELBOW_REST +
    (ELBOW_CARRY + Math.max(0, stride) * ELBOW_DRIVE) * run +
    0.28 * jump;
  target.rightElbowPitch =
    ELBOW_REST +
    (ELBOW_CARRY + Math.max(0, -stride) * ELBOW_DRIVE) * run +
    0.24 * jump;
  // The body rides high through the airborne half of the step and drops
  // sharply into each contact instead of a symmetric |sin| hover. The dip is
  // synced to the same absorb^3 curve the knees use for landing absorption.
  target.pelvisOffsetY =
    (0.05 +
      0.045 *
        Math.pow(
          Math.abs(
            Math.sin(state.gaitPhaseRadians * 2 + CONTACT_BOB_PHASE_LEAD)
          ),
          1.7
        ) -
      (Math.pow(leftLeg.absorb, 3) + Math.pow(rightLeg.absorb, 3)) *
        CONTACT_DIP) *
      run +
    idleBreath * IDLE_BREATH_RISE +
    jump * 0.025 -
    state.landRecoil * LAND_RECOIL_PELVIS_DIP -
    takeoffCrunch * TAKEOFF_CRUNCH_PELVIS_DIP;
  target.pelvisPitch = PELVIS_PITCH * run + 0.06 * jump;
  target.pelvisYaw =
    stride * 0.055 * run +
    state.turnFollow * 0.065 * run +
    idleShift * IDLE_SHIFT_YAW;
  target.chestPitch =
    -target.pelvisPitch * 0.42 +
    idleBreath * IDLE_BREATH_CHEST +
    state.landRecoil * LAND_RECOIL_CHEST_PITCH;
  target.chestYaw = -target.pelvisYaw * 0.82;
  target.leftAnklePitch =
    -target.leftHipPitch * 0.34 + target.leftKneePitch * 0.16;
  target.rightAnklePitch =
    -target.rightHipPitch * 0.34 + target.rightKneePitch * 0.16;

  const safeJumpHeight = Number.isFinite(input.jumpHeight)
    ? Math.max(0, Math.min(3, input.jumpHeight))
    : 0;
  // The dips are carved out of the ride height rather than out of the floor:
  // a body that sinks below the ground puts its feet through the paving.
  target.rootY = Math.max(0, safeJumpHeight + target.pelvisOffsetY);
  target.rootLean = ROOT_LEAN * gait.gain * run + 0.055 * jump + accelerationLean;
  target.rootRoll =
    -state.turnFollow * 0.09 * run + idleShift * IDLE_SHIFT_ROLL;
  // Hair, sleeves and hem read the gait a fixed phase behind the limbs that
  // drive them, so they trail direction changes and keep moving for a beat
  // after the body settles. Turn-driven terms stay immediate because
  // turnFollow is already a damped follower.
  target.hairPitch =
    -target.rootLean * 0.72 -
    (0.06 + Math.abs(laggedHairStride) * 0.17) * run -
    accelerationLean * 1.4 +
    state.landRecoil * 0.14;
  target.hairYaw =
    -state.turnFollow * 0.34 -
    target.pelvisYaw * 0.12 +
    laggedHairStride * 0.09 * run -
    idleShift * IDLE_SHIFT_HAIR;
  target.leftSleevePitch =
    -laggedSleeveStride * SHOULDER_SWING * 0.72 * run -
    0.18 * jump * 0.72 -
    target.rootLean * 0.3 -
    0.08 * run;
  target.rightSleevePitch =
    laggedSleeveStride * SHOULDER_SWING * 0.72 * run +
    0.12 * jump * 0.72 -
    target.rootLean * 0.3 -
    0.08 * run;
  target.hemPitch =
    -target.rootLean * 0.44 +
    (0.05 + Math.abs(laggedHemStride) * 0.19) * run -
    accelerationLean * 0.9 +
    state.landRecoil * 0.1;
  target.hemYaw =
    -state.turnFollow * 0.24 -
    target.pelvisYaw * 0.28 +
    laggedHemStride * 0.12 * run;
  const jumpDistance = Math.min(1, safeJumpHeight / 2);
  target.shadowScale = 1 - jumpDistance * 0.22;
  target.shadowOpacity = 0.48 * (1 - jumpDistance * 0.64);
  target.dustOpacity =
    input.grounded && input.moving && !input.reducedMotion
      ? run * (0.12 + Math.abs(Math.cos(state.gaitPhaseRadians)) * 0.2)
      : 0;
  if (input.reducedMotion) {
    target.rootY = safeJumpHeight;
    target.rootLean = 0;
    target.rootRoll = 0;
    target.pelvisOffsetY = 0;
    target.pelvisPitch = 0;
    target.pelvisYaw = 0;
    target.chestPitch = 0;
    target.chestYaw = 0;
    target.leftHipPitch = 0;
    target.rightHipPitch = 0;
    target.leftKneePitch = 0;
    target.rightKneePitch = 0;
    target.leftFootLift = 0;
    target.rightFootLift = 0;
    target.leftShoulderPitch = 0;
    target.rightShoulderPitch = 0;
    target.leftElbowPitch = 0;
    target.rightElbowPitch = 0;
    target.leftAnklePitch = 0;
    target.rightAnklePitch = 0;
    target.hairPitch = 0;
    target.hairYaw = 0;
    target.leftSleevePitch = 0;
    target.rightSleevePitch = 0;
    target.hemPitch = 0;
    target.hemYaw = 0;
    target.dustOpacity = 0;
  }
  return target;
}
