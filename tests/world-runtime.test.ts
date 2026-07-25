import { describe, expect, it } from "vitest";
import { isWalkable } from "../app/world/RpgWorldGeometry";
import { getChaseOrbitCameraBasis } from "../app/world/ChaseOrbitCamera";
import {
  WORLD_RUN_SPEED,
  WORLD_WALK_SPEED,
  createWorldRuntime
} from "../app/world/WorldRuntime";
import {
  RPG_WORLD_BOUNDS,
  RPG_WORLD_SPAWN
} from "../app/world/RpgWorldModel";
import { createInitialWorldNavigationSnapshot } from "../app/world/WorldNavigationState";
import {
  advanceRpgBusRuntime,
  createRpgBusRuntime
} from "../app/world/RpgBusRuntime";
import {
  RPG_BUS_ROUTE_LENGTH,
  evaluateRpgBusMotionInto,
  isRpgPositionOutsideMovingBus
} from "../app/world/RpgBusMotion";
import {
  RPG_CANONICAL_ROUTE,
  RPG_CANONICAL_ROUTE_TOLERANCE
} from "./fixtures/rpg-canonical-route";

const CAMERA_YAW = 0;
const CAMERA_BASIS = getChaseOrbitCameraBasis(CAMERA_YAW);

const RPG_CANONICAL_ROUTE_LENGTH = RPG_CANONICAL_ROUTE.reduce(
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

/**
 * Keys are read in the camera's frame, so a world-space bearing has to be
 * expressed against the camera basis before it can be pressed. Steering by the
 * world axes only ever worked because the two frames used to be confused with
 * each other.
 */
/**
 * The bearing the visitor has to be facing for a forward key to carry them
 * toward a world point. Travel is along the facing only, so a destination is
 * turned toward rather than pressed sideways into.
 */
function yawTowards(dx: number, dz: number) {
  return Math.atan2(dx, dz);
}

function walkForward(runRequested = false) {
  return { x: 0, y: 1, runRequested };
}

describe("WorldRuntime", () => {
  it("keeps browser canonical-route arrivals within 0.05 world units", () => {
    expect(RPG_CANONICAL_ROUTE_TOLERANCE).toBeLessThanOrEqual(0.05);
  });

  it("uses the same bus pose for rendering and dynamic player collision", () => {
    const bus = createRpgBusRuntime();
    const pose = bus.pose;
    advanceRpgBusRuntime(bus, 1, false);
    expect(bus.pose).toBe(pose);
    evaluateRpgBusMotionInto(
      {
        routeProgress: (22 + Math.PI * 2) / RPG_BUS_ROUTE_LENGTH,
        completedLoops: 0
      },
      bus.pose
    );
    const runtime = createWorldRuntime({
      canOccupyDynamic: ([x, z]) =>
        isRpgPositionOutsideMovingBus(x, z, bus.pose)
    });
    expect(
      isRpgPositionOutsideMovingBus(
        pose.position[0],
        pose.position[2],
        pose
      )
    ).toBe(false);
    const spawn = runtime.getNavigationSnapshot().position;
    const initialDistance = Math.hypot(
      spawn[0] - pose.position[0],
      spawn[2] - pose.position[2]
    );
    const maxFrames = Math.ceil(
      (initialDistance / WORLD_WALK_SPEED + 2) * 120
    );
    for (let frame = 0; frame < maxFrames; frame += 1) {
      const position = runtime.getNavigationSnapshot().position;
      const dx = pose.position[0] - position[0];
      const dz = pose.position[2] - position[2];
      runtime.setMovement(walkForward());
      runtime.advance(1 / 120, yawTowards(dx, dz));
      const next = runtime.getNavigationSnapshot().position;
      expect(
        isRpgPositionOutsideMovingBus(next[0], next[2], pose)
      ).toBe(true);
    }
    const stopped = runtime.getNavigationSnapshot().position;
    expect(
      Math.hypot(
        stopped[0] - pose.position[0],
        stopped[2] - pose.position[2]
      )
    ).toBeLessThan(4);
    expect(runtime).not.toHaveProperty("setPosition");
  });

  it("keeps the canonical route walkable at 0.1-unit samples", () => {
    let distance = 0;
    for (let index = 1; index < RPG_CANONICAL_ROUTE.length; index += 1) {
      const from = RPG_CANONICAL_ROUTE[index - 1];
      const to = RPG_CANONICAL_ROUTE[index];
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      distance += length;
      const count = Math.ceil(length / 0.1);
      for (let sample = 0; sample <= count; sample += 1) {
        const progress = sample / count;
        expect(isWalkable([
          from[0] + (to[0] - from[0]) * progress,
          from[1] + (to[1] - from[1]) * progress
        ])).toBe(true);
      }
    }
    // Derived from the route rather than restated beside it. The literal that
    // used to sit here was the length before the bridge approach moved east off
    // sakura-tree-05's grown collision box, and a restated length only ever
    // tells you the route changed -- which the walkability loop above already
    // checks properly. This still catches a leg that stops being summed.
    const routeLength = RPG_CANONICAL_ROUTE.reduce(
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
    expect(distance).toBeCloseTo(routeLength, 9);
    expect(routeLength).toBeGreaterThan(120);
  });

  function driveCanonicalRoute(runRequested: boolean) {
    const runtime = createWorldRuntime();
    const speed = runRequested ? WORLD_RUN_SPEED : WORLD_WALK_SPEED;
    const framePattern = [1 / 120, 1 / 50, 1 / 30, 1 / 90] as const;
    const visitedZones: string[] = [];
    let elapsedSeconds = 0;
    let frame = 0;

    for (let index = 1; index < RPG_CANONICAL_ROUTE.length; index += 1) {
      const target = RPG_CANONICAL_ROUTE[index];
      // Bounded rather than open. An unbounded walk-until-arrived loop turns
      // any regression that stops the visitor short into a hung suite instead
      // of a failed assertion, which is what happened when travel stopped
      // answering a sideways key.
      let steps = 0;
      for (; steps < 200_000; steps += 1) {
        const current = runtime.getNavigationSnapshot().position;
        const dx = target[0] - current[0];
        const dz = target[1] - current[2];
        const remaining = Math.hypot(dx, dz);
        if (remaining <= 1e-7) break;
        const delta = Math.min(
          framePattern[frame % framePattern.length],
          remaining / speed
        );
        runtime.setMovement(walkForward(runRequested));
        runtime.advance(delta, yawTowards(dx, dz));
        elapsedSeconds += delta;
        frame += 1;
        const zone = runtime.getNavigationSnapshot().currentZoneId;
        if (visitedZones.at(-1) !== zone) visitedZones.push(zone);
      }
      expect(steps, `stuck short of ${target.join(",")}`).toBeLessThan(200_000);
    }

    runtime.setMovement({ x: 0, y: 0, runRequested: false });
    return { runtime, elapsedSeconds, visitedZones };
  }

  // Derived from the speeds rather than written down beside them: a pace change
  // should move this expectation on its own instead of failing a magic number.
  it.each([
    { runRequested: false, speed: WORLD_WALK_SPEED },
    { runRequested: true, speed: WORLD_RUN_SPEED }
  ])(
    "drives the real runtime through every region at $speed units per second",
    ({ runRequested, speed }) => {
      const expectedSeconds = RPG_CANONICAL_ROUTE_LENGTH / speed;
      const result = driveCanonicalRoute(runRequested);
      expect(result.elapsedSeconds).toBeGreaterThanOrEqual(
        expectedSeconds * 0.95
      );
      expect(result.elapsedSeconds).toBeLessThanOrEqual(
        expectedSeconds * 1.05
      );
      expect(result.visitedZones).toEqual([
        "airport",
        "tokyo",
        "gyukatsu",
        "sakura",
        "hanabi"
      ]);
      expect(result.runtime.getNavigationSnapshot().position).toEqual([
        26,
        0,
        -18
      ]);
    }
  );

  it("keeps an idle revision stable and exposes no coordinate jump API", () => {
    const runtime = createWorldRuntime();
    const before = runtime.getNavigationSnapshot();
    for (let frame = 0; frame < 30; frame += 1) {
      runtime.advance(1 / 60, 0);
    }
    const after = runtime.getNavigationSnapshot();
    expect(after.position).toEqual(before.position);
    expect(after.revision).toBe(before.revision);
    expect(runtime).not.toHaveProperty("teleport");
    expect(runtime).not.toHaveProperty("fastTravel");
    expect(runtime).not.toHaveProperty("setPosition");
  });

  it("ignores non-finite frame deltas without corrupting a queued jump", () => {
    const runtime = createWorldRuntime();
    runtime.jump();
    const before = runtime.getNavigationSnapshot();

    runtime.advance(Number.NaN, 0);

    const ignored = runtime.getNavigationSnapshot();
    expect(ignored.position).toEqual(before.position);
    expect(ignored.jumpOffset).toBe(0);
    expect(ignored.grounded).toBe(true);
    expect(ignored.revision).toBe(before.revision);

    runtime.advance(0.1, 0);
    const airborne = runtime.getNavigationSnapshot();
    expect(airborne.jumpOffset).toBeGreaterThan(0);
    expect(airborne.position.every(Number.isFinite)).toBe(true);
  });

  it("moves from active input and stops after input is released", () => {
    const runtime = createWorldRuntime();
    runtime.setMovement(walkForward());
    runtime.advance(0.1, CAMERA_YAW);

    const moving = runtime.getNavigationSnapshot();
    // The visitor faces the way the view looks and walks along it, so the
    // heading is the camera's forward rather than a fixed world axis.
    expect(moving.heading[0]).toBeCloseTo(CAMERA_BASIS.forwardX, 12);
    expect(moving.heading[2]).toBeCloseTo(CAMERA_BASIS.forwardZ, 12);
    expect(
      (moving.position[0] - RPG_WORLD_SPAWN[0]) * CAMERA_BASIS.forwardX +
        (moving.position[2] - RPG_WORLD_SPAWN[2]) * CAMERA_BASIS.forwardZ
    ).toBeGreaterThan(0);
    expect(moving.moving).toBe(true);
    expect(moving.locomotion).toBe("walk");

    runtime.setMovement({ x: 0, y: 0, runRequested: false });
    const stoppedAt = runtime.getNavigationSnapshot().position;
    runtime.advance(0.1, CAMERA_YAW);

    const stopped = runtime.getNavigationSnapshot();
    expect(stopped.position).toEqual(stoppedAt);
    expect(stopped.moving).toBe(false);
    expect(stopped.locomotion).toBe("idle");
  });

  it("walks at the same pace whether or not the visitor is turning", () => {
    // Rounding a corner is holding forward and a turn together. Turning is
    // spent on the view, so it must not add to or take from the stride.
    const straight = createWorldRuntime();
    const turning = createWorldRuntime();

    straight.setMovement({ x: 0, y: 1, runRequested: false });
    turning.setMovement({ x: 1, y: 1, runRequested: false });
    straight.advance(0.1, CAMERA_YAW);
    turning.advance(0.1, CAMERA_YAW);

    const travelled = (position: readonly number[]) =>
      Math.hypot(
        position[0] - RPG_WORLD_SPAWN[0],
        position[2] - RPG_WORLD_SPAWN[2]
      );
    expect(
      travelled(turning.getNavigationSnapshot().position)
    ).toBeCloseTo(
      travelled(straight.getNavigationSnapshot().position),
      10
    );
  });

  it("moves at half speed for half-strength analog input with a unit heading", () => {
    const full = createWorldRuntime();
    const half = createWorldRuntime();
    full.setMovement({ x: 0, y: 1, runRequested: false });
    half.setMovement({ x: 0, y: 0.5, runRequested: false });

    full.advance(0.1, CAMERA_YAW);
    half.advance(0.1, CAMERA_YAW);

    const fullSnapshot = full.getNavigationSnapshot();
    const halfSnapshot = half.getNavigationSnapshot();
    const travelled = (position: readonly number[]) =>
      Math.hypot(
        position[0] - RPG_WORLD_SPAWN[0],
        position[2] - RPG_WORLD_SPAWN[2]
      );
    expect(travelled(halfSnapshot.position)).toBeCloseTo(
      travelled(fullSnapshot.position) * 0.5,
      10
    );
    // Half strength still walks the same way: along the visitor's own line.
    expect(halfSnapshot.heading[0]).toBeCloseTo(CAMERA_BASIS.forwardX, 12);
    expect(halfSnapshot.heading[2]).toBeCloseTo(CAMERA_BASIS.forwardZ, 12);
  });

  it("never leaves the world boundary or walkable navigation space", () => {
    // Every bearing, forwards and backwards. Sideways is not a direction the
    // visitor can travel any more, so the sweep is over facings instead.
    for (const [yaw, forward] of [
      [0, 1],
      [Math.PI / 2, 1],
      [Math.PI, 1],
      [-Math.PI / 2, 1],
      [0, -1],
      [2.3, -1]
    ] as const) {
      const runtime = createWorldRuntime();
      runtime.setMovement({ x: 0, y: forward, runRequested: true });
      for (let frame = 0; frame < 400; frame += 1) {
        runtime.advance(0.25, yaw);
      }
      const [x, , z] = runtime.getNavigationSnapshot().position;
      expect(x).toBeGreaterThanOrEqual(RPG_WORLD_BOUNDS.minimumX);
      expect(x).toBeLessThanOrEqual(RPG_WORLD_BOUNDS.maximumX);
      expect(z).toBeGreaterThanOrEqual(RPG_WORLD_BOUNDS.minimumZ);
      expect(z).toBeLessThanOrEqual(RPG_WORLD_BOUNDS.maximumZ);
      expect(isWalkable([x, z])).toBe(true);
    }
  });

  it("slides along a free edge when dynamic geometry blocks one axis", () => {
    const runtime = createWorldRuntime({
      canOccupyDynamic: ([x]) => x <= -26
    });
    // Aim at the blocked +X edge and the free +Z edge in world terms; pressing
    // raw axis values would walk away from the blocker and test nothing.
    runtime.setMovement(walkForward());

    for (let frame = 0; frame < 10; frame += 1) {
      runtime.advance(0.1, yawTowards(1, 1));
    }

    const [x, , z] = runtime.getNavigationSnapshot().position;
    expect(x).toBeLessThanOrEqual(-26);
    expect(z).toBeGreaterThan(RPG_WORLD_SPAWN[2]);
  });

  it("substeps long frames so the player cannot tunnel through dynamic geometry", () => {
    const runtime = createWorldRuntime({
      canOccupyDynamic: ([x]) => x < -26 || x > -25.5
    });
    // Run straight at the wall band in world +X, which is where it sits.
    runtime.setMovement(walkForward(true));

    runtime.advance(1, yawTowards(1, 0));

    expect(runtime.getNavigationSnapshot().position[0]).toBeLessThan(-26);
  });

  it("jumps above the surface and lands without horizontal movement", () => {
    const runtime = createWorldRuntime();

    runtime.jump();
    runtime.advance(0.25, 0);

    const airborne = runtime.getNavigationSnapshot();
    expect(airborne.jumpOffset).toBeGreaterThan(0);
    expect(airborne.position[0]).toBe(RPG_WORLD_SPAWN[0]);
    expect(airborne.position[2]).toBe(RPG_WORLD_SPAWN[2]);
    expect(airborne.grounded).toBe(false);
    expect(airborne.locomotion).toBe("jump");

    for (let step = 0; step < 40; step += 1) {
      runtime.advance(0.1, 0);
    }

    const landed = runtime.getNavigationSnapshot();
    expect(landed.position).toEqual(RPG_WORLD_SPAWN);
    expect(landed.jumpOffset).toBe(0);
    expect(landed.grounded).toBe(true);
  });

  it("resets movement, heading, and jumping to the safe spawn", () => {
    const runtime = createWorldRuntime();
    runtime.setMovement({ x: 1, y: 1, runRequested: true });
    runtime.advance(0.1, 0);
    runtime.jump();
    runtime.advance(0.1, 0);

    runtime.reset();

    // Facing away from the spawn camera, so a reset puts the visitor's back to
    // the viewer rather than their profile.
    expect(runtime.getNavigationSnapshot()).toMatchObject({
      position: RPG_WORLD_SPAWN,
      jumpOffset: 0,
      heading: [CAMERA_BASIS.forwardX, 0, CAMERA_BASIS.forwardZ],
      moving: false,
      grounded: true,
      locomotion: "idle",
      currentZoneId: "airport"
    });
  });

  it("publishes deeply immutable caller-visible navigation snapshots", () => {
    const runtime = createWorldRuntime();
    const initial = runtime.getNavigationSnapshot();

    // Forward rather than sideways: a turn key changes the view, not the
    // world, so it would publish nothing for this to inspect.
    runtime.setMovement(walkForward());
    runtime.advance(1 / 60, CAMERA_YAW);
    const moved = runtime.getNavigationSnapshot();

    expect(moved).not.toBe(initial);
    expect(moved.revision).toBeGreaterThan(initial.revision);
    expect(Object.isFrozen(moved)).toBe(true);
    expect(Object.isFrozen(moved.position)).toBe(true);
    expect(Object.isFrozen(moved.surfaceNormal)).toBe(true);
    expect(Object.isFrozen(moved.heading)).toBe(true);
    expect(Object.isFrozen(moved.navigationRegion)).toBe(true);
    expect(
      Object.isFrozen(moved.navigationRegion.highlightedZoneIds)
    ).toBe(true);
    expect(Object.isFrozen(moved.highlightedZoneIds)).toBe(true);
    expect(moved.highlightedZoneIds).toBe(
      moved.navigationRegion.highlightedZoneIds
    );
    expect(
      Reflect.set(moved.navigationRegion, "regionId", "mutated")
    ).toBe(false);
    expect(
      Reflect.set(
        moved.navigationRegion.highlightedZoneIds,
        "0",
        "hanabi"
      )
    ).toBe(false);
  });

  it("deeply freezes the initial navigation snapshot", () => {
    const initial = createInitialWorldNavigationSnapshot();

    expect(Object.isFrozen(initial)).toBe(true);
    expect(Object.isFrozen(initial.position)).toBe(true);
    expect(Object.isFrozen(initial.surfaceNormal)).toBe(true);
    expect(Object.isFrozen(initial.heading)).toBe(true);
    expect(Object.isFrozen(initial.navigationRegion)).toBe(true);
    expect(
      Object.isFrozen(initial.navigationRegion.highlightedZoneIds)
    ).toBe(true);
    expect(Object.isFrozen(initial.highlightedZoneIds)).toBe(true);
    expect(initial.highlightedZoneIds).toBe(
      initial.navigationRegion.highlightedZoneIds
    );
    expect(
      Reflect.set(initial.navigationRegion, "regionId", "mutated")
    ).toBe(false);
  });
});
