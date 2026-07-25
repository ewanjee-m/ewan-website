import { describe, expect, it } from "vitest";
import {
  WORLD_RUN_SPEED,
  WORLD_WALK_SPEED
} from "../app/world/WorldRuntime";
import {
  createRpgCharacterMotion3dPose,
  createRpgCharacterMotion3dState,
  evaluateRpgCharacterMotion3dInto
} from "../app/world/RpgCharacterMotion3d";
import { RPG_PLAYER_CHARACTER_DESIGNS } from "../app/world/RpgPlayerCharacterDesign";
import { RPG_CANONICAL_ROUTE } from "./fixtures/rpg-canonical-route";

const AVERAGE_CHARACTER_HEIGHT =
  (RPG_PLAYER_CHARACTER_DESIGNS.male.height +
    RPG_PLAYER_CHARACTER_DESIGNS.female.height) /
  2;

const CANONICAL_ROUTE_LENGTH = RPG_CANONICAL_ROUTE.reduce(
  (total, point, index) =>
    index === 0
      ? total
      : total +
        Math.hypot(
          point[0] - RPG_CANONICAL_ROUTE[index - 1][0],
          point[1] - RPG_CANONICAL_ROUTE[index - 1][1]
        ),
  0
);

describe("movement pace", () => {
  /**
   * Speed is judged against the character, not against the metre: a walk that
   * covers less than a body height a second reads as wading no matter what the
   * number says. The walk used to sit at 0.62 and the run at 0.73, which put
   * the run below a normal person's walk.
   */
  it("walks at a brisk pace for the character's size", () => {
    const bodyHeightsPerSecond = WORLD_WALK_SPEED / AVERAGE_CHARACTER_HEIGHT;
    expect(bodyHeightsPerSecond).toBeGreaterThanOrEqual(1);
    expect(bodyHeightsPerSecond).toBeLessThanOrEqual(1.4);
  });

  it("runs fast enough to read as running", () => {
    const bodyHeightsPerSecond = WORLD_RUN_SPEED / AVERAGE_CHARACTER_HEIGHT;
    expect(bodyHeightsPerSecond).toBeGreaterThanOrEqual(2.2);
    expect(bodyHeightsPerSecond).toBeLessThanOrEqual(3.5);
  });

  it("makes the run key change the pace enough to feel", () => {
    expect(WORLD_RUN_SPEED / WORLD_WALK_SPEED).toBeGreaterThanOrEqual(1.8);
  });

  it("reaches the far side of the world without the visitor giving up", () => {
    expect(CANONICAL_ROUTE_LENGTH / WORLD_WALK_SPEED).toBeLessThanOrEqual(
      45
    );
    expect(CANONICAL_ROUTE_LENGTH / WORLD_RUN_SPEED).toBeLessThanOrEqual(
      25
    );
  });
});

describe("gait against travel", () => {
  /**
   * Cadence has to come from ground covered, not from the clock. A time-based
   * turnover stretches the step to match whatever the speed happens to be, so
   * raising the speed slides the feet along the ground instead of taking
   * longer steps.
   */
  function measureStepLength(speed: number) {
    const state = createRpgCharacterMotion3dState();
    const pose = createRpgCharacterMotion3dPose();
    const step = 1 / 60;
    // Settle the movement blend so the sampled cadence is the moving one.
    for (let frame = 0; frame < 120; frame += 1) {
      evaluateRpgCharacterMotion3dInto(
        state,
        {
          deltaSeconds: step,
          headingX: 0,
          headingZ: 1,
          moving: true,
          grounded: true,
          jumpHeight: 0,
          movementSpeed: speed,
          reducedMotion: false
        },
        pose
      );
    }

    let advanced = 0;
    let previous = state.gaitPhaseRadians;
    for (let frame = 0; frame < 60; frame += 1) {
      evaluateRpgCharacterMotion3dInto(
        state,
        {
          deltaSeconds: step,
          headingX: 0,
          headingZ: 1,
          moving: true,
          grounded: true,
          jumpHeight: 0,
          movementSpeed: speed,
          reducedMotion: false
        },
        pose
      );
      let delta = state.gaitPhaseRadians - previous;
      if (delta < 0) delta += Math.PI * 2;
      advanced += delta;
      previous = state.gaitPhaseRadians;
    }

    const cyclesPerSecond = advanced / (Math.PI * 2);
    // One gait cycle is two steps.
    return speed / (cyclesPerSecond * 2);
  }

  it("keeps a natural step length at walking speed", () => {
    const stepLength = measureStepLength(WORLD_WALK_SPEED);
    expect(stepLength).toBeGreaterThan(0.7);
    expect(stepLength).toBeLessThan(1.6);
  });

  it("keeps a natural step length at running speed", () => {
    const stepLength = measureStepLength(WORLD_RUN_SPEED);
    expect(stepLength).toBeGreaterThan(0.9);
    expect(stepLength).toBeLessThan(2.4);
  });

  it("takes longer strides to run rather than only faster ones", () => {
    const walking = measureStepLength(WORLD_WALK_SPEED);
    const running = measureStepLength(WORLD_RUN_SPEED);
    expect(running).toBeGreaterThan(walking);
  });
});
