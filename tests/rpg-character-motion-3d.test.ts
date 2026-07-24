import { describe, expect, it } from "vitest";
import {
  createRpgCharacterMotion3dPose,
  createRpgCharacterMotion3dState,
  evaluateRpgCharacterMotion3dInto
} from "../app/world/RpgCharacterMotion3d";
import {
  WORLD_RUN_SPEED,
  WORLD_WALK_SPEED
} from "../app/world/WorldRuntime";

describe("RPG 3D character locomotion", () => {
  it("advances a run gait faster than a walk gait", () => {
    const walkState = createRpgCharacterMotion3dState();
    const runState = createRpgCharacterMotion3dState();
    const walkPose = createRpgCharacterMotion3dPose();
    const runPose = createRpgCharacterMotion3dPose();
    const base = {
      deltaSeconds: 1 / 60,
      headingX: 1,
      headingZ: 0,
      moving: true,
      grounded: true,
      jumpHeight: 0,
      reducedMotion: false
    };

    evaluateRpgCharacterMotion3dInto(
      walkState,
      { ...base, movementSpeedRatio: 1 },
      walkPose
    );
    evaluateRpgCharacterMotion3dInto(
      runState,
      { ...base, movementSpeedRatio: WORLD_RUN_SPEED / WORLD_WALK_SPEED },
      runPose
    );

    expect(runPose.stridePhase).toBeGreaterThan(walkPose.stridePhase);
  });

  it("sanitizes invalid gait speed ratios while preserving the default gait", () => {
    const evaluate = (movementSpeedRatio?: number) => {
      const pose = createRpgCharacterMotion3dPose();
      evaluateRpgCharacterMotion3dInto(
        createRpgCharacterMotion3dState(),
        {
          deltaSeconds: 1 / 60,
          headingX: 0,
          headingZ: 1,
          moving: true,
          grounded: true,
          jumpHeight: 0,
          reducedMotion: false,
          movementSpeedRatio
        },
        pose
      );
      return pose.stridePhase;
    };

    expect(evaluate()).toBe(evaluate(Number.NaN));
    expect(evaluate(0)).toBe(evaluate(0.5));
    expect(evaluate(2)).toBe(evaluate(1.5));
  });

  it("turns a +Z-forward model toward its world heading while reusing caller buffers", () => {
    const state = createRpgCharacterMotion3dState();
    const pose = createRpgCharacterMotion3dPose();
    const input = {
      deltaSeconds: 1 / 60,
      headingX: 1,
      headingZ: 0,
      moving: true,
      grounded: true,
      jumpHeight: 0,
      reducedMotion: false
    };

    const result = evaluateRpgCharacterMotion3dInto(state, input, pose);

    expect(result).toBe(pose);
    expect(state.targetYawRadians).toBeCloseTo(Math.PI / 2, 8);
    expect(pose.rootYaw).toBeGreaterThan(0);
    expect(pose.rootYaw).toBeLessThan(Math.PI / 2);
    expect(pose.rootScaleX).toBe(1);
    expect(pose.rootScaleY).toBe(1);
    expect(pose.rootScaleZ).toBe(1);
  });

  it("crosses the -pi/pi boundary through the shortest turn", () => {
    const degrees = (value: number) => (value * Math.PI) / 180;
    const initialYaw = degrees(179);
    const targetYaw = degrees(-179);
    const state = createRpgCharacterMotion3dState(initialYaw);
    const pose = createRpgCharacterMotion3dPose();

    evaluateRpgCharacterMotion3dInto(
      state,
      {
        deltaSeconds: 1 / 60,
        headingX: Math.sin(targetYaw),
        headingZ: Math.cos(targetYaw),
        moving: true,
        grounded: true,
        jumpHeight: 0,
        reducedMotion: false
      },
      pose
    );

    const travelled =
      ((pose.rootYaw - initialYaw + Math.PI) % (Math.PI * 2) +
        Math.PI * 2) %
        (Math.PI * 2) -
      Math.PI;
    expect(travelled).toBeGreaterThan(0);
    expect(travelled).toBeLessThan(degrees(2));
  });

  it("blends continuously between idle and running instead of snapping", () => {
    const state = createRpgCharacterMotion3dState();
    const pose = createRpgCharacterMotion3dPose();
    const input = {
      deltaSeconds: 1 / 60,
      headingX: 0,
      headingZ: 1,
      moving: false,
      grounded: true,
      jumpHeight: 0,
      reducedMotion: false
    };

    evaluateRpgCharacterMotion3dInto(state, input, pose);
    expect(pose.idleWeight).toBe(1);
    expect(pose.runWeight).toBe(0);
    expect(pose.jumpWeight).toBe(0);

    input.moving = true;
    evaluateRpgCharacterMotion3dInto(state, input, pose);
    expect(pose.runWeight).toBeGreaterThan(0);
    expect(pose.runWeight).toBeLessThan(1);
    const firstRunWeight = pose.runWeight;

    for (let frame = 0; frame < 90; frame += 1) {
      evaluateRpgCharacterMotion3dInto(state, input, pose);
    }
    expect(pose.runWeight).toBeGreaterThan(0.98);

    input.moving = false;
    evaluateRpgCharacterMotion3dInto(state, input, pose);
    expect(pose.runWeight).toBeGreaterThan(firstRunWeight);
    expect(pose.runWeight).toBeLessThan(1);
    expect(pose.idleWeight + pose.runWeight + pose.jumpWeight).toBeCloseTo(
      1,
      10
    );
  });

  it("blends running into an airborne jump and back into locomotion", () => {
    const state = createRpgCharacterMotion3dState();
    const pose = createRpgCharacterMotion3dPose();
    const input = {
      deltaSeconds: 1 / 60,
      headingX: 0,
      headingZ: 1,
      moving: true,
      grounded: true,
      jumpHeight: 0,
      reducedMotion: false
    };
    for (let frame = 0; frame < 90; frame += 1) {
      evaluateRpgCharacterMotion3dInto(state, input, pose);
    }

    input.grounded = false;
    input.jumpHeight = 0.45;
    evaluateRpgCharacterMotion3dInto(state, input, pose);
    expect(pose.jumpWeight).toBeGreaterThan(0);
    expect(pose.jumpWeight).toBeLessThan(1);
    expect(pose.runWeight).toBeGreaterThan(0);
    const firstJumpWeight = pose.jumpWeight;

    for (let frame = 0; frame < 90; frame += 1) {
      evaluateRpgCharacterMotion3dInto(state, input, pose);
    }
    expect(pose.jumpWeight).toBeGreaterThan(0.98);

    input.grounded = true;
    input.jumpHeight = 0;
    evaluateRpgCharacterMotion3dInto(state, input, pose);
    expect(pose.jumpWeight).toBeGreaterThan(firstJumpWeight);
    expect(pose.jumpWeight).toBeLessThan(1);
    expect(pose.idleWeight + pose.runWeight + pose.jumpWeight).toBeCloseTo(
      1,
      10
    );
  });

  it("alternates feet and coordinated limb joints through the walk cycle", () => {
    const state = createRpgCharacterMotion3dState();
    const pose = createRpgCharacterMotion3dPose();
    const input = {
      deltaSeconds: 1 / 60,
      headingX: 0,
      headingZ: 1,
      moving: true,
      grounded: true,
      jumpHeight: 0,
      reducedMotion: false
    };
    const samples = [] as Array<ReturnType<typeof createRpgCharacterMotion3dPose>>;

    for (let frame = 0; frame < 150; frame += 1) {
      evaluateRpgCharacterMotion3dInto(state, input, pose);
      if (frame >= 30) {
        samples.push({ ...pose });
      }
    }

    expect(samples.some((sample) => sample.leftFootLift > 0.08)).toBe(true);
    expect(samples.some((sample) => sample.rightFootLift > 0.08)).toBe(true);
    expect(
      samples.some(
        (sample) => sample.leftFootLift > sample.rightFootLift + 0.08
      )
    ).toBe(true);
    expect(
      samples.some(
        (sample) => sample.rightFootLift > sample.leftFootLift + 0.08
      )
    ).toBe(true);

    const extendedStride = samples.filter(
      (sample) => Math.abs(sample.leftHipPitch) > 0.25
    );
    expect(extendedStride.length).toBeGreaterThan(10);
    expect(
      extendedStride.every(
        (sample) => sample.leftHipPitch * sample.rightHipPitch < 0
      )
    ).toBe(true);
    expect(
      extendedStride.every(
        (sample) => sample.leftHipPitch * sample.leftShoulderPitch < 0
      )
    ).toBe(true);
    expect(samples.some((sample) => sample.leftKneePitch > 0.45)).toBe(true);
    expect(samples.some((sample) => sample.rightKneePitch > 0.45)).toBe(true);
    // Walking arms hang with a soft bend and swing, rather than being locked
    // in the runner's carry the approved sprint art shows. They still never
    // lock straight, and the leading arm bends further than the trailing one.
    expect(
      samples.every((sample) => sample.leftElbowPitch > 0.3)
    ).toBe(true);
    expect(
      samples.every((sample) => sample.rightElbowPitch > 0.3)
    ).toBe(true);
    expect(samples.some((sample) => sample.leftElbowPitch > 0.65)).toBe(true);
    expect(samples.some((sample) => sample.rightElbowPitch > 0.65)).toBe(true);

    // Each leg passes through a deep swing bend and a shallower landing bend,
    // rather than a single symmetric sine.
    const leftKnees = samples.map((sample) => sample.leftKneePitch);
    expect(Math.max(...leftKnees)).toBeGreaterThan(0.6);
    expect(Math.min(...leftKnees)).toBeLessThan(0.2);

    const pelvisHeights = samples.map((sample) => sample.pelvisOffsetY);
    expect(Math.max(...pelvisHeights) - Math.min(...pelvisHeights)).toBeGreaterThan(
      0.035
    );
    expect(samples.every((sample) => sample.pelvisPitch > 0.04)).toBe(true);
    expect(
      samples.every(
        (sample) =>
          Math.abs(sample.pelvisYaw) < 1e-6 ||
          sample.pelvisYaw * sample.chestYaw < 0
      )
    ).toBe(true);
  });

  it("exposes bounded turn, ankle, cloth, hair, shadow, and dust values for direct rig use", () => {
    const state = createRpgCharacterMotion3dState();
    const pose = createRpgCharacterMotion3dPose();
    const input = {
      deltaSeconds: 1 / 60,
      headingX: 0,
      headingZ: 1,
      moving: true,
      grounded: true,
      jumpHeight: 0,
      reducedMotion: false
    };
    for (let frame = 0; frame < 45; frame += 1) {
      evaluateRpgCharacterMotion3dInto(state, input, pose);
    }

    input.headingX = 1;
    input.headingZ = 0;
    // The cloth follows the turn rather than snapping with it, so it needs a
    // few frames of the turn before there is anything to measure.
    for (let frame = 0; frame < 4; frame += 1) {
      evaluateRpgCharacterMotion3dInto(state, input, pose);
    }

    expect(pose.targetYaw).toBeCloseTo(Math.PI / 2, 8);
    expect(pose.rootTurnError).toBeGreaterThan(0);
    expect(pose.rootTurnError).toBeLessThan(Math.PI / 2);
    expect(Math.abs(pose.hairYaw)).toBeGreaterThan(0.02);
    expect(Math.sign(pose.hairYaw)).toBe(-Math.sign(pose.rootTurnError));
    expect(Math.abs(pose.hemYaw)).toBeGreaterThan(0.01);
    expect(Math.abs(pose.leftSleevePitch)).toBeGreaterThan(0.05);
    expect(Math.abs(pose.rightSleevePitch)).toBeGreaterThan(0.05);
    expect(Math.abs(pose.leftAnklePitch)).toBeGreaterThan(0.01);
    expect(Math.abs(pose.rightAnklePitch)).toBeGreaterThan(0.01);
    expect(pose.stridePhase).toBeGreaterThanOrEqual(-Math.PI);
    expect(pose.stridePhase).toBeLessThan(Math.PI);
    expect(pose.rootY).toBeGreaterThanOrEqual(0);
    expect(pose.rootLean).toBeGreaterThan(0.02);
    expect(Math.abs(pose.rootRoll)).toBeGreaterThan(0.01);
    expect(pose.pelvisYaw * pose.chestYaw).toBeLessThan(0);
    expect(pose.shadowScale).toBe(1);
    expect(pose.shadowOpacity).toBeGreaterThan(0.4);
    expect(pose.dustOpacity).toBeGreaterThan(0);

    input.headingX = 0;
    input.headingZ = -1;
    for (let frame = 0; frame < 15; frame += 1) {
      evaluateRpgCharacterMotion3dInto(state, input, pose);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(pose.rootScaleX).toBeGreaterThan(0);
      expect(pose.rootScaleY).toBeGreaterThan(0);
      expect(pose.rootScaleZ).toBeGreaterThan(0);
    }
  });

  it("keeps a standing character breathing and shifting its weight", () => {
    const state = createRpgCharacterMotion3dState();
    const pose = createRpgCharacterMotion3dPose();
    const input = {
      deltaSeconds: 1 / 30,
      headingX: 0,
      headingZ: 1,
      moving: false,
      grounded: true,
      jumpHeight: 0,
      reducedMotion: false
    };
    const chest: number[] = [];
    const roll: number[] = [];
    const shoulder: number[] = [];

    // Eight seconds covers both the breath and the slower weight shift.
    for (let frame = 0; frame < 240; frame += 1) {
      evaluateRpgCharacterMotion3dInto(state, input, pose);
      chest.push(pose.chestPitch);
      roll.push(pose.rootRoll);
      shoulder.push(pose.leftShoulderPitch);
    }

    expect(pose.idleWeight).toBeGreaterThan(0.99);
    // Standing still used to hold one frame, so these ranges were zero.
    expect(Math.max(...chest) - Math.min(...chest)).toBeGreaterThan(0.05);
    expect(Math.max(...roll) - Math.min(...roll)).toBeGreaterThan(0.05);
    expect(Math.max(...shoulder) - Math.min(...shoulder)).toBeGreaterThan(0.05);
  });

  it("damps yaw consistently at common frame rates", () => {
    const runForOneSecond = (deltaSeconds: number) => {
      const state = createRpgCharacterMotion3dState();
      const pose = createRpgCharacterMotion3dPose();
      const input = {
        deltaSeconds,
        headingX: 1,
        headingZ: 0,
        moving: true,
        grounded: true,
        jumpHeight: 0,
        reducedMotion: false
      };
      const frameCount = Math.round(1 / deltaSeconds);
      for (let frame = 0; frame < frameCount; frame += 1) {
        evaluateRpgCharacterMotion3dInto(state, input, pose);
      }
      return pose.rootYaw;
    };

    expect(runForOneSecond(1 / 30)).toBeCloseTo(runForOneSecond(1 / 60), 10);
    expect(runForOneSecond(1 / 120)).toBeCloseTo(
      runForOneSecond(1 / 60),
      10
    );
  });

  it("keeps directional yaw but stops secondary motion when reduced motion is requested", () => {
    const normalState = createRpgCharacterMotion3dState();
    const reducedState = createRpgCharacterMotion3dState();
    const normalPose = createRpgCharacterMotion3dPose();
    const reducedPose = createRpgCharacterMotion3dPose();
    const input = {
      deltaSeconds: 1 / 60,
      headingX: -1,
      headingZ: 0,
      moving: true,
      grounded: false,
      jumpHeight: 0.7,
      reducedMotion: false
    };

    for (let frame = 0; frame < 60; frame += 1) {
      evaluateRpgCharacterMotion3dInto(normalState, input, normalPose);
      input.reducedMotion = true;
      evaluateRpgCharacterMotion3dInto(reducedState, input, reducedPose);
      input.reducedMotion = false;
    }

    expect(reducedPose.rootYaw).toBeCloseTo(normalPose.rootYaw, 10);
    expect(reducedPose.targetYaw).toBeCloseTo(-Math.PI / 2, 8);
    expect(reducedPose.rootY).toBeCloseTo(0.7, 10);
    for (const value of [
      reducedPose.rootLean,
      reducedPose.rootRoll,
      reducedPose.pelvisOffsetY,
      reducedPose.pelvisPitch,
      reducedPose.pelvisYaw,
      reducedPose.chestPitch,
      reducedPose.chestYaw,
      reducedPose.leftHipPitch,
      reducedPose.rightHipPitch,
      reducedPose.leftKneePitch,
      reducedPose.rightKneePitch,
      reducedPose.leftFootLift,
      reducedPose.rightFootLift,
      reducedPose.leftShoulderPitch,
      reducedPose.rightShoulderPitch,
      reducedPose.leftElbowPitch,
      reducedPose.rightElbowPitch,
      reducedPose.leftAnklePitch,
      reducedPose.rightAnklePitch,
      reducedPose.hairPitch,
      reducedPose.hairYaw,
      reducedPose.leftSleevePitch,
      reducedPose.rightSleevePitch,
      reducedPose.hemPitch,
      reducedPose.hemYaw,
      reducedPose.dustOpacity
    ]) {
      expect(value).toBe(0);
    }
  });

  it("reuses flat caller-owned buffers and stays finite for corrupt state and extreme inputs", () => {
    const state = createRpgCharacterMotion3dState();
    const pose = createRpgCharacterMotion3dPose();
    state.yawRadians = Number.NaN;
    state.targetYawRadians = Number.POSITIVE_INFINITY;
    state.movementBlend = Number.NEGATIVE_INFINITY;
    state.jumpBlend = Number.NaN;
    state.gaitPhaseRadians = Number.MAX_VALUE;
    state.motionTimeSeconds = Number.POSITIVE_INFINITY;
    state.turnFollow = Number.NaN;

    const inputs = [
      {
        deltaSeconds: Number.MAX_VALUE,
        headingX: Number.MAX_VALUE,
        headingZ: Number.MAX_VALUE,
        jumpHeight: Number.MAX_VALUE
      },
      {
        deltaSeconds: -Number.MAX_VALUE,
        headingX: Number.NaN,
        headingZ: Number.POSITIVE_INFINITY,
        jumpHeight: Number.NaN
      },
      {
        deltaSeconds: Number.NaN,
        headingX: 0,
        headingZ: 0,
        jumpHeight: Number.NEGATIVE_INFINITY
      },
      {
        deltaSeconds: Number.POSITIVE_INFINITY,
        headingX: -1,
        headingZ: 0,
        jumpHeight: 0.4
      }
    ];

    for (const extreme of inputs) {
      const result = evaluateRpgCharacterMotion3dInto(
        state,
        {
          ...extreme,
          moving: true,
          grounded: false,
          reducedMotion: false
        },
        pose
      );
      expect(result).toBe(pose);
      expect(Object.values(state).every(Number.isFinite)).toBe(true);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(pose.rootScaleX).toBeGreaterThan(0);
      expect(pose.rootScaleY).toBeGreaterThan(0);
      expect(pose.rootScaleZ).toBeGreaterThan(0);
      expect(pose.idleWeight).toBeGreaterThanOrEqual(0);
      expect(pose.runWeight).toBeGreaterThanOrEqual(0);
      expect(pose.jumpWeight).toBeGreaterThanOrEqual(0);
      expect(pose.idleWeight + pose.runWeight + pose.jumpWeight).toBeCloseTo(
        1,
        10
      );
    }
  });

  it("spreads an abrupt 180-degree reversal across stable progressive frames", () => {
    const state = createRpgCharacterMotion3dState();
    const pose = createRpgCharacterMotion3dPose();
    const input = {
      deltaSeconds: 1 / 60,
      headingX: 0,
      headingZ: -1,
      moving: true,
      grounded: true,
      jumpHeight: 0,
      reducedMotion: false
    };
    let previousYaw = 0;
    let previousError = Math.PI + 1;

    for (let frame = 0; frame < 24; frame += 1) {
      evaluateRpgCharacterMotion3dInto(state, input, pose);
      const step = Math.abs(
        ((pose.rootYaw - previousYaw + Math.PI) % (Math.PI * 2) +
          Math.PI * 2) %
          (Math.PI * 2) -
          Math.PI
      );
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(0.5);
      expect(Math.abs(pose.rootTurnError)).toBeLessThan(previousError);
      expect(pose.rootScaleX).toBe(1);
      expect(pose.rootScaleY).toBe(1);
      expect(pose.rootScaleZ).toBe(1);
      previousYaw = pose.rootYaw;
      previousError = Math.abs(pose.rootTurnError);
    }
  });
});
