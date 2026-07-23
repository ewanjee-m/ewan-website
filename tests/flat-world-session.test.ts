import { describe, expect, it } from "vitest";
import {
  createFlatWorldSession,
  createFlatWorldSnapshot,
  getFlatWorldAdvanceSeconds
} from "../app/world/FlatWorldSession";
import {
  getArrival,
  isWalkable
} from "../app/world/RpgWorldGeometry";
import {
  RPG_WORLD_BOUNDS,
  RPG_WORLD_SPAWN,
  RPG_WORLD_ZONE_IDS,
  RPG_WORLD_ZONES
} from "../app/world/RpgWorldModel";

const options = {
  bounds: {
    minimumX: -18,
    maximumX: 18,
    minimumZ: -4.5,
    maximumZ: 4.5
  },
  start: { x: -15, z: 1.5 },
  moveSpeed: 4
} as const;

describe("flat rectangular world movement", () => {
  it("keeps low-frame-rate movement responsive without accepting a tab-resume teleport", () => {
    expect(getFlatWorldAdvanceSeconds(1 / 60)).toBeCloseTo(1 / 60, 10);
    expect(getFlatWorldAdvanceSeconds(0.2)).toBe(0.2);
    expect(getFlatWorldAdvanceSeconds(2)).toBe(0.25);
    expect(getFlatWorldAdvanceSeconds(Number.NaN)).toBe(0);
    expect(getFlatWorldAdvanceSeconds(-1)).toBe(0);
  });

  it("moves directly on the rectangular plane and stops after input is released", () => {
    const world = createFlatWorldSession(options);

    world.setMovement({ x: 1, y: -0.5 });
    world.advance(1);

    const movingSnapshot = world.getSnapshot();
    expect(movingSnapshot).toMatchObject({
      surfaceNormal: [0, 1, 0],
      heading: [0.8944271909999159, 0, 0.4472135954999579],
      moving: true,
      grounded: true
    });
    expect(movingSnapshot.position[0]).toBeCloseTo(-11.422291236000337, 10);
    expect(movingSnapshot.position[1]).toBe(0);
    expect(movingSnapshot.position[2]).toBeCloseTo(3.2888543819998315, 10);

    const stoppedAt = world.getSnapshot().position;
    world.setMovement({ x: 0, y: 0 });
    world.advance(1);

    expect(world.getSnapshot().position).toEqual(stoppedAt);
    expect(world.getSnapshot().moving).toBe(false);
  });

  it("normalizes diagonal input so it is not faster than moving on one axis", () => {
    const axis = createFlatWorldSession(options);
    const diagonal = createFlatWorldSession(options);

    axis.setMovement({ x: 1, y: 0 });
    diagonal.setMovement({ x: 1, y: 1 });
    axis.advance(0.5);
    diagonal.advance(0.5);

    const axisPosition = axis.getSnapshot().position;
    const diagonalPosition = diagonal.getSnapshot().position;
    const axisDistance = Math.hypot(
      axisPosition[0] - options.start.x,
      axisPosition[2] - options.start.z
    );
    const diagonalDistance = Math.hypot(
      diagonalPosition[0] - options.start.x,
      diagonalPosition[2] - options.start.z
    );

    expect(diagonalDistance).toBeCloseTo(axisDistance, 8);
  });

  it.each([
    { intent: { x: -1, y: 0 }, axis: 0, edge: options.bounds.minimumX },
    { intent: { x: 1, y: 0 }, axis: 0, edge: options.bounds.maximumX },
    { intent: { x: 0, y: 1 }, axis: 2, edge: options.bounds.minimumZ },
    { intent: { x: 0, y: -1 }, axis: 2, edge: options.bounds.maximumZ }
  ])("stops at rectangular edge $edge", ({ intent, axis, edge }) => {
    const world = createFlatWorldSession(options);
    world.setMovement(intent);
    world.advance(30);

    expect(world.getSnapshot().position[axis]).toBe(edge);
  });

  it("jumps above the plane and lands without changing the horizontal position", () => {
    const world = createFlatWorldSession(options);

    world.jump();
    world.advance(0.25);

    expect(world.getSnapshot().position[1]).toBeGreaterThan(0);
    expect(world.getSnapshot().position[0]).toBe(options.start.x);
    expect(world.getSnapshot().position[2]).toBe(options.start.z);
    expect(world.getSnapshot().grounded).toBe(false);

    for (let step = 0; step < 40; step += 1) {
      world.advance(0.1);
    }

    expect(world.getSnapshot().position).toEqual([
      options.start.x,
      0,
      options.start.z
    ]);
    expect(world.getSnapshot().grounded).toBe(true);
  });

  it("resets movement and jumping to the safe starting point", () => {
    const world = createFlatWorldSession(options);
    world.setMovement({ x: 1, y: 1 });
    world.advance(1);
    world.jump();
    world.advance(0.2);

    world.reset();

    expect(world.getSnapshot()).toEqual({
      position: [options.start.x, 0, options.start.z],
      surfaceNormal: [0, 1, 0],
      heading: [1, 0, 0],
      moving: false,
      grounded: true
    });
  });

  it("reuses a caller-owned snapshot during the animation loop", () => {
    const world = createFlatWorldSession(options);
    const snapshot = createFlatWorldSnapshot();
    const position = snapshot.position;

    expect(world.readSnapshot(snapshot)).toBe(snapshot);
    world.setMovement({ x: 1, y: 0 });
    world.advance(1 / 60);
    expect(world.readSnapshot(snapshot)).toBe(snapshot);
    expect(snapshot.position).toBe(position);
    expect(snapshot.position[0]).toBeGreaterThan(options.start.x);
  });

  it("stops at solid town geometry and slides along its free edge", () => {
    const world = createFlatWorldSession({
      ...options,
      start: { x: -2, z: -1 },
      canMoveTo: (x, z) => !(x > 0 && z < 0)
    });

    world.setMovement({ x: 1, y: 1 });
    world.advance(1);

    const [x, , z] = world.getSnapshot().position;
    expect(x).toBeLessThanOrEqual(0);
    expect(z).toBeLessThan(-1);
  });

  it("substeps long frames so the player cannot tunnel through a building", () => {
    const world = createFlatWorldSession({
      ...options,
      start: { x: 0, z: 0 },
      canMoveTo: (x) => x < 0.5 || x > 1.5
    });

    world.setMovement({ x: 1, y: 0 });
    world.advance(1);

    expect(world.getSnapshot().position[0]).toBeLessThan(0.5);
  });

  it("teleports fast travel onto an open destination and lands grounded", () => {
    const world = createFlatWorldSession(options);
    world.jump();

    expect(world.teleport(12, -3)).toBe(true);

    const snapshot = world.getSnapshot();
    expect(snapshot.position[0]).toBe(12);
    expect(snapshot.position[1]).toBe(0);
    expect(snapshot.position[2]).toBe(-3);
    expect(snapshot.grounded).toBe(true);
  });

  it("keeps fast travel inside the town bounds", () => {
    const world = createFlatWorldSession(options);

    expect(world.teleport(999, -999)).toBe(true);

    const snapshot = world.getSnapshot();
    expect(snapshot.position[0]).toBe(options.bounds.maximumX);
    expect(snapshot.position[2]).toBe(options.bounds.minimumZ);
  });

  it("lands fast travel on nearby walkable ground when the target is blocked", () => {
    const world = createFlatWorldSession({
      ...options,
      canMoveTo: (x, z) => Math.hypot(x - 10, z) > 1.2
    });

    expect(world.teleport(10, 0)).toBe(true);

    const [x, , z] = world.getSnapshot().position;
    expect(Math.hypot(x - 10, z)).toBeGreaterThan(1.2);
    expect(Math.hypot(x - 10, z)).toBeLessThanOrEqual(3);
  });

  it("stays put when no walkable ground exists near the destination", () => {
    const world = createFlatWorldSession({
      ...options,
      canMoveTo: (x) => x < 0
    });
    const before = world.getSnapshot().position;

    expect(world.teleport(15, 0)).toBe(false);

    expect(world.getSnapshot().position).toEqual(before);
  });

  it("commits fast travel as one deeply immutable navigation snapshot", () => {
    const world = createFlatWorldSession({
      bounds: RPG_WORLD_BOUNDS,
      start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
      moveSpeed: 4
    });
    const before = world.getNavigationSnapshot();
    const arrival = getArrival("hanabi");
    const zone = RPG_WORLD_ZONES.find(({ id }) => id === "hanabi")!;

    const committed = world.fastTravel("hanabi");

    expect(committed).not.toBe(before);
    expect(world.getNavigationSnapshot()).toBe(committed);
    expect(committed.revision).toBe(before.revision + 1);
    expect(committed).toMatchObject({
      position: arrival.position,
      heading: [arrival.heading[0], 0, arrival.heading[1]],
      currentZoneId: "hanabi",
      navigationRegionId: "hanabi",
      transitionProgress: null,
      highlightedZoneIds: ["hanabi"],
      destinationId: "hanabi",
      moving: false,
      grounded: true,
      logicalCamera: {
        anchor: [zone.cameraAnchor[0], 0, zone.cameraAnchor[1]],
        player: arrival.position,
        heading: [arrival.heading[0], 0, arrival.heading[1]]
      }
    });
    expect(Object.isFrozen(committed)).toBe(true);
    expect(Object.isFrozen(committed.position)).toBe(true);
    expect(Object.isFrozen(committed.heading)).toBe(true);
    expect(Object.isFrozen(committed.navigationRegion)).toBe(true);
    expect(Object.isFrozen(committed.highlightedZoneIds)).toBe(true);
    expect(Object.isFrozen(committed.logicalCamera)).toBe(true);
    expect(Object.isFrozen(committed.logicalCamera.anchor)).toBe(true);
  });

  it.each(RPG_WORLD_ZONE_IDS)(
    "commits the canonical %s arrival and facing in one revision",
    (destinationId) => {
      const world = createFlatWorldSession({
        bounds: RPG_WORLD_BOUNDS,
        start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
        moveSpeed: 4,
        canMoveTo: (x, z) => isWalkable([x, z])
      });
      const before = world.getNavigationSnapshot();
      const arrival = getArrival(destinationId);
      const zone = RPG_WORLD_ZONES.find(({ id }) => id === destinationId)!;

      const committed = world.fastTravel(destinationId);

      expect(committed.revision).toBe(before.revision + 1);
      expect(committed.position).toEqual(arrival.position);
      expect(committed.heading[0]).toBeCloseTo(arrival.heading[0]);
      expect(committed.heading[1]).toBe(0);
      expect(committed.heading[2]).toBeCloseTo(arrival.heading[1]);
      expect(committed.currentZoneId).toBe(destinationId);
      expect(committed.destinationId).toBe(destinationId);
      expect(committed.logicalCamera.anchor).toEqual([
        zone.cameraAnchor[0],
        0,
        zone.cameraAnchor[1]
      ]);
      expect(committed.logicalCamera.player).toBe(committed.position);
      expect(committed.logicalCamera.heading).toBe(committed.heading);
      expect(world.getNavigationSnapshot()).toBe(committed);
    }
  );

  it("returns the exact prior navigation object for an invalid destination", () => {
    const world = createFlatWorldSession({
      bounds: RPG_WORLD_BOUNDS,
      start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
      moveSpeed: 4
    });
    const before = world.getNavigationSnapshot();

    const result = world.fastTravel("not-a-destination" as "airport");

    expect(result).toBe(before);
    expect(world.getNavigationSnapshot()).toBe(before);
    expect(result.revision).toBe(before.revision);
    expect(result.position).toBe(before.position);
    expect(result.heading).toBe(before.heading);
    expect(result.logicalCamera).toBe(before.logicalCamera);
  });

  it("preserves exact navigation identity when fast-travel preparation cannot land", () => {
    const world = createFlatWorldSession({
      bounds: RPG_WORLD_BOUNDS,
      start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
      moveSpeed: 4,
      canMoveTo: () => false
    });
    const before = world.getNavigationSnapshot();

    const result = world.fastTravel("tokyo");

    expect(result).toBe(before);
    expect(world.getNavigationSnapshot()).toBe(before);
    expect(result.revision).toBe(before.revision);
    expect(result.position).toBe(before.position);
    expect(result.heading).toBe(before.heading);
    expect(result.logicalCamera).toBe(before.logicalCamera);
  });

  it("rolls back by identity when canMoveTo throws during preparation", () => {
    let canMoveToCalls = 0;
    const world = createFlatWorldSession({
      bounds: RPG_WORLD_BOUNDS,
      start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
      moveSpeed: 4,
      canMoveTo: () => {
        canMoveToCalls += 1;
        throw new Error("walkability lookup failed");
      }
    });
    const before = world.getNavigationSnapshot();

    const result = world.fastTravel("gyukatsu");

    expect(canMoveToCalls).toBe(1);
    expect(result).toBe(before);
    expect(world.getNavigationSnapshot()).toBe(before);
    expect(result.revision).toBe(before.revision);
    expect(result.position).toBe(before.position);
    expect(result.heading).toBe(before.heading);
    expect(result.logicalCamera).toBe(before.logicalCamera);
  });

  it("rolls back by identity when a fast-travel dependency throws", () => {
    const dependencyError = new Error("arrival lookup failed");
    const world = createFlatWorldSession({
      bounds: RPG_WORLD_BOUNDS,
      start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
      moveSpeed: 4,
      resolveFastTravelDestination: () => {
        throw dependencyError;
      }
    });
    const before = world.getNavigationSnapshot();

    const result = world.fastTravel("sakura");

    expect(result).toBe(before);
    expect(world.getNavigationSnapshot()).toBe(before);
    expect(result.revision).toBe(before.revision);
    expect(result.position).toBe(before.position);
    expect(result.heading).toBe(before.heading);
    expect(result.logicalCamera).toBe(before.logicalCamera);
  });
});
