import { describe, expect, it } from "vitest";
import {
  calculateRpgChaseMovementAzimuth,
  createRpgMovementAzimuthLatch,
  createRpgMovementBuffer,
  createRpgScreenMovementTelemetry,
  latchRpgMovementAzimuth,
  mapRpgScreenMovementInto,
  shouldAutoFollowRpgCharacterHeading
} from "../app/world/RpgScreenMovement";
import {
  createRpgScreenDirection,
  projectRpgWorldDirectionToScreenInto
} from "../app/world/RpgWorldTransform";
import {
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_SPAWN,
  RPG_WORLD_TRANSITIONS,
  type WorldPoint2
} from "../app/world/RpgWorldModel";
import {
  advanceRpgCameraFollowYaw,
  advanceRpgCameraHeadingInto,
  createRpgCameraFollowState,
  createRpgCameraHeadingState
} from "../app/world/RpgCameraPlacement";

const REGION_POINTS = [
  ...RPG_WORLD_ARRIVALS.map(
    (arrival) =>
      [
        arrival.zoneId,
        [arrival.position[0], arrival.position[2]] as WorldPoint2
      ] as const
  ),
  ...RPG_WORLD_TRANSITIONS.map((transition) => {
    const [start, end] = transition.centerline;
    return [
      transition.id,
      [
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2
      ] as WorldPoint2
    ] as const;
  })
];

const CARDINAL_AND_DIAGONAL_INPUTS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
  { x: 1, y: -1 }
] as const;

describe("RPG screen-relative movement", () => {
  it("swings the camera in behind whichever way the visitor walks", () => {
    expect(shouldAutoFollowRpgCharacterHeading({ x: 0, y: 1 })).toBe(true);
    expect(shouldAutoFollowRpgCharacterHeading({ x: 0, y: -1 })).toBe(true);
    expect(shouldAutoFollowRpgCharacterHeading({ x: 0.08, y: 1 })).toBe(true);
    expect(shouldAutoFollowRpgCharacterHeading({ x: 1, y: 0 })).toBe(true);
    expect(shouldAutoFollowRpgCharacterHeading({ x: -1, y: 0 })).toBe(true);
    expect(shouldAutoFollowRpgCharacterHeading({ x: 0.7, y: 0.7 })).toBe(true);
    expect(shouldAutoFollowRpgCharacterHeading({ x: 0, y: 0 })).toBe(false);
  });

  it("keeps manual camera drag in control while movement is held", () => {
    expect(
      shouldAutoFollowRpgCharacterHeading({ x: 0, y: 1 }, true)
    ).toBe(false);
    expect(
      shouldAutoFollowRpgCharacterHeading({ x: 0, y: 1 }, false)
    ).toBe(true);
  });

  it("maps cardinal and diagonal input through every zone and transition", () => {
    for (const [label, worldPosition] of REGION_POINTS) {
      for (const screen of CARDINAL_AND_DIAGONAL_INPUTS) {
        const movement = mapRpgScreenMovementInto(
          { screen, cameraAzimuthDegrees: 137, worldPosition },
          createRpgMovementBuffer()
        );
        expect(
          Math.hypot(movement.x, movement.y),
          `${label}:${screen.x},${screen.y}:normalized-world`
        ).toBeCloseTo(1, 8);

        const projected = projectRpgWorldDirectionToScreenInto(
          worldPosition,
          [movement.x, -movement.y],
          createRpgScreenDirection()
        );
        expect(
          projected,
          `${label}:${screen.x},${screen.y}:projected`
        ).not.toBeNull();
        const inputLength = Math.hypot(screen.x, screen.y);
        const expectedReferenceX = screen.x / inputLength;
        // Existing MovementIntent +y means screen up; reference +y is down.
        const expectedReferenceY = -screen.y / inputLength;
        expect(
          projected!.x * expectedReferenceX +
            projected!.y * expectedReferenceY,
          `${label}:${screen.x},${screen.y}:screen-alignment`
        ).toBeGreaterThan(0.98);
      }
    }
  });

  it("uses the approved continuous movement basis across arrival zones", () => {
    const movementDirections = RPG_WORLD_ARRIVALS.map((arrival) =>
      mapRpgScreenMovementInto(
        {
          screen: { x: 1, y: 0 },
          cameraAzimuthDegrees: 0,
          worldPosition: arrival.position
        },
        createRpgMovementBuffer()
      )
    );

    expect(
      new Set(
        movementDirections.map(
          ({ x, y }) => `${x.toFixed(4)},${y.toFixed(4)}`
        )
      ).size
    ).toBe(1);
  });

  it("removes fixed rotation compensation and ignores free camera yaw", () => {
    expect(calculateRpgChaseMovementAzimuth(135, 0)).toBe(135);
    expect(calculateRpgChaseMovementAzimuth(135, 90)).toBe(-135);
    expect(
      calculateRpgChaseMovementAzimuth(
        Number.POSITIVE_INFINITY,
        Number.NaN
      )
    ).toBe(0);

    const results = [-720, 0, 45, 135, 810, Number.POSITIVE_INFINITY].map(
      (cameraAzimuthDegrees) =>
        mapRpgScreenMovementInto(
          {
            screen: { x: 0, y: 1 },
            cameraAzimuthDegrees,
            worldPosition: RPG_WORLD_ARRIVALS[3].position
          },
          createRpgMovementBuffer()
        )
    );
    for (const result of results.slice(1)) {
      expect(result.x).toBeCloseTo(results[0].x, 12);
      expect(result.y).toBeCloseTo(results[0].y, 12);
    }
  });

  it("normalizes diagonals while preserving sub-unit input strength", () => {
    const diagonal = mapRpgScreenMovementInto(
      {
        screen: { x: 1, y: 1 },
        cameraAzimuthDegrees: Number.POSITIVE_INFINITY,
        worldPosition: RPG_WORLD_ARRIVALS[0].position
      },
      createRpgMovementBuffer()
    );
    const partial = mapRpgScreenMovementInto(
      {
        screen: { x: 0.3, y: 0.4 },
        cameraAzimuthDegrees: -900,
        worldPosition: RPG_WORLD_ARRIVALS[0].position
      },
      createRpgMovementBuffer()
    );

    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 8);
    expect(Math.hypot(partial.x, partial.y)).toBeCloseTo(0.5, 8);
  });

  it("reuses the caller-owned output buffer in the animation loop", () => {
    const buffer = createRpgMovementBuffer();
    expect(
      mapRpgScreenMovementInto(
        {
          screen: { x: 0.4, y: -0.2 },
          cameraAzimuthDegrees: 20,
          worldPosition: RPG_WORLD_ARRIVALS[0].position
        },
        buffer
      )
    ).toBe(buffer);
  });

  it("marks the spawn fallback as compatibility-only telemetry", () => {
    const fallbackTelemetry = createRpgScreenMovementTelemetry();
    const explicitTelemetry = createRpgScreenMovementTelemetry();
    const fallback = mapRpgScreenMovementInto(
      {
        screen: { x: 0, y: 1 },
        cameraAzimuthDegrees: 45,
        telemetry: fallbackTelemetry
      },
      createRpgMovementBuffer()
    );
    const explicit = mapRpgScreenMovementInto(
      {
        screen: { x: 0, y: 1 },
        cameraAzimuthDegrees: -45,
        worldPosition: RPG_WORLD_SPAWN,
        telemetry: explicitTelemetry
      },
      createRpgMovementBuffer()
    );

    expect(fallbackTelemetry.usedCompatibilityWorldPosition).toBe(true);
    expect(explicitTelemetry.usedCompatibilityWorldPosition).toBe(false);
    expect(fallback.x).toBeCloseTo(explicit.x, 12);
    expect(fallback.y).toBeCloseTo(explicit.y, 12);
  });

  it("fails movement closed for nonfinite, outside, and idle input", () => {
    for (const input of [
      {
        screen: { x: Number.NaN, y: 1 },
        cameraAzimuthDegrees: 0,
        worldPosition: RPG_WORLD_SPAWN
      },
      {
        screen: { x: 1, y: Number.POSITIVE_INFINITY },
        cameraAzimuthDegrees: 0,
        worldPosition: RPG_WORLD_SPAWN
      },
      {
        screen: { x: 1, y: 0 },
        cameraAzimuthDegrees: 0,
        worldPosition: [Number.NaN, 0] as WorldPoint2
      },
      {
        screen: { x: 1, y: 0 },
        cameraAzimuthDegrees: 0,
        worldPosition: [1000, 1000] as WorldPoint2
      },
      {
        screen: { x: 0, y: 0 },
        cameraAzimuthDegrees: Number.NaN,
        worldPosition: RPG_WORLD_SPAWN
      }
    ]) {
      const target = { x: 9, y: -7 };
      expect(mapRpgScreenMovementInto(input, target)).toBe(target);
      expect(target).toEqual({ x: 0, y: 0 });
    }
  });

  it("keeps the projected walk bearing stable while released drag drains", () => {
    const heading = createRpgCameraHeadingState([0, 0, -1]);
    const follow = createRpgCameraFollowState(0);
    const renderedHeading: [number, number, number] = [0, 0, -1];
    const characterHeading: [number, number, number] = [0, 0, -1];
    advanceRpgCameraFollowYaw(follow, {
      rigYawDegrees: 90,
      moving: false,
      dragging: true,
      deltaSeconds: 1 / 60
    });

    const steps: number[] = [];
    for (let frame = 0; frame < 180; frame += 1) {
      const orbitYawDegrees = advanceRpgCameraFollowYaw(follow, {
        rigYawDegrees: 90,
        moving: true,
        dragging: false,
        deltaSeconds: 1 / 60,
        heading
      });
      const world = mapRpgScreenMovementInto(
        {
          screen: { x: 0, y: 1 },
          cameraAzimuthDegrees: calculateRpgChaseMovementAzimuth(
            heading.yawDegrees,
            orbitYawDegrees
          ),
          worldPosition: RPG_WORLD_SPAWN
        },
        createRpgMovementBuffer()
      );
      steps.push((Math.atan2(world.y, world.x) * 180) / Math.PI);
      const viewRadians = (heading.yawDegrees * Math.PI) / 180;
      characterHeading[0] = Math.sin(viewRadians);
      characterHeading[2] = Math.cos(viewRadians);
      advanceRpgCameraHeadingInto(
        heading,
        {
          heading: characterHeading,
          deltaSeconds: 1 / 60,
          orbitYawDegrees
        },
        renderedHeading
      );
    }

    for (const step of steps) {
      expect(step).toBeCloseTo(steps[0], 8);
    }
    expect(follow.orbitYawDegrees).toBe(0);
  });

  it("comes around behind a backward step instead of holding the old view", () => {
    const initialHeading = [Math.SQRT1_2, 0, -Math.SQRT1_2] as const;
    const backwardHeading = [-Math.SQRT1_2, 0, Math.SQRT1_2] as const;
    const cameraHeading = createRpgCameraHeadingState(initialHeading);
    const renderedHeading: [number, number, number] = [...initialHeading];

    for (let frame = 0; frame < 60; frame += 1) {
      advanceRpgCameraHeadingInto(
        cameraHeading,
        {
          heading: backwardHeading,
          deltaSeconds: shouldAutoFollowRpgCharacterHeading({ x: 0, y: -1 })
            ? 1 / 60
            : 0
        },
        renderedHeading
      );
    }

    expect(cameraHeading.yawDegrees).toBeCloseTo(-45, 0);
    expect(Math.abs(cameraHeading.yawDegrees - -45)).toBeLessThan(0.5);
  });

  it("holds one bearing while a direction is pushed, then takes a new one", () => {
    const latch = createRpgMovementAzimuthLatch();

    expect(latchRpgMovementAzimuth(latch, { x: 1, y: 0 }, 0)).toBeCloseTo(0, 8);
    expect(latchRpgMovementAzimuth(latch, { x: 1, y: 0 }, 40)).toBeCloseTo(
      0,
      8
    );
    expect(latchRpgMovementAzimuth(latch, { x: 1, y: 0 }, 90)).toBeCloseTo(
      0,
      8
    );
    expect(
      latchRpgMovementAzimuth(latch, { x: 0, y: 1 }, 90)
    ).toBeCloseTo(90, 8);
    latchRpgMovementAzimuth(latch, { x: 0, y: 0 }, 90);
    expect(latch.held).toBe(false);
    expect(latchRpgMovementAzimuth(latch, { x: 1, y: 0 }, 200)).toBeCloseTo(
      200,
      8
    );
  });

  it("does not take a new bearing for a small wobble on the stick", () => {
    const latch = createRpgMovementAzimuthLatch();

    latchRpgMovementAzimuth(latch, { x: 0, y: 1 }, 10);
    expect(
      latchRpgMovementAzimuth(latch, { x: 0.36, y: 1 }, 80)
    ).toBeCloseTo(10, 8);
  });
});
