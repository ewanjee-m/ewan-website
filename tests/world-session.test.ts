import { describe, expect, it } from "vitest";
import {
  createWorldSession,
  createWorldSnapshot
} from "../app/world/WorldSession";

describe("world movement", () => {
  it("moves on the spherical surface and stops when input is released", () => {
    const world = createWorldSession({ radius: 12, moveSpeed: 3 });
    const initial = world.getSnapshot();

    world.setMovement({ x: 0, y: 1 });
    world.advance(1);
    const moved = world.getSnapshot();

    expect(moved.position).not.toEqual(initial.position);
    expect(Math.hypot(...moved.position)).toBeCloseTo(12, 5);

    world.setMovement({ x: 0, y: 0 });
    world.advance(1);

    expect(world.getSnapshot().position).toEqual(moved.position);
  });

  it("jumps away from the surface and lands on the same sphere", () => {
    const world = createWorldSession({ radius: 12, moveSpeed: 3 });

    world.jump();
    world.advance(0.25);

    expect(Math.hypot(...world.getSnapshot().position)).toBeGreaterThan(12);
    expect(world.getSnapshot().grounded).toBe(false);

    for (let step = 0; step < 30; step += 1) {
      world.advance(0.1);
    }

    expect(Math.hypot(...world.getSnapshot().position)).toBeCloseTo(12, 5);
    expect(world.getSnapshot().grounded).toBe(true);
  });

  it("keeps the player center inside the spherical walking corridor", () => {
    const radius = 12;
    const corridorHalfWidth = 1;
    const world = createWorldSession({
      radius,
      moveSpeed: 3,
      corridorHalfWidth
    });

    world.setMovement({ x: 1, y: 0 });
    for (let frame = 0; frame < 300; frame += 1) {
      world.advance(1 / 60);
    }
    const atEdge = world.getSnapshot();
    const crossTrackOffset =
      Math.asin(atEdge.surfaceNormal[0]) * radius;
    expect(Math.abs(crossTrackOffset)).toBeLessThanOrEqual(
      corridorHalfWidth + 0.001
    );

    world.setMovement({ x: 0, y: 1 });
    world.advance(1);
    const advanced = world.getSnapshot();
    expect(advanced.position).not.toEqual(atEdge.position);
    expect(Math.hypot(...advanced.position)).toBeCloseTo(radius, 5);
  });

  it("returns a moving or airborne player to the safe starting point", () => {
    const world = createWorldSession({
      radius: 12,
      moveSpeed: 3,
      corridorHalfWidth: 1
    });
    world.setMovement({ x: 0.6, y: 1 });
    world.advance(1);
    world.jump();
    world.advance(0.2);

    world.reset();

    expect(world.getSnapshot()).toEqual({
      position: [0, 12, 0],
      surfaceNormal: [0, 1, 0],
      heading: [0, 0, -1],
      moving: false,
      grounded: true
    });
  });

  it("reuses a caller-owned snapshot during the animation loop", () => {
    const world = createWorldSession({ radius: 12, moveSpeed: 3 });
    const snapshot = createWorldSnapshot();
    const position = snapshot.position;

    expect(world.readSnapshot(snapshot)).toBe(snapshot);
    world.setMovement({ x: 0, y: 1 });
    world.advance(1 / 60);
    expect(world.readSnapshot(snapshot)).toBe(snapshot);
    expect(snapshot.position).toBe(position);
    expect(snapshot.position).not.toEqual([0, 12, 0]);
  });

  it("opens the bus-lane side only inside the marked crosswalk segment", () => {
    const radius = 12;
    const createCrosswalkWorld = () =>
      createWorldSession({
        radius,
        moveSpeed: 3,
        corridorHalfWidth: 1,
        crosswalk: {
          trackAngle: 0,
          halfLength: 1.2,
          minimumOffset: -2.65,
          maximumOffset: 1
        }
      });
    const atCrosswalk = createCrosswalkWorld();
    atCrosswalk.setMovement({ x: -1, y: 0 });
    for (let frame = 0; frame < 180; frame += 1) {
      atCrosswalk.advance(1 / 60);
    }
    const crossingOffset =
      Math.asin(atCrosswalk.getSnapshot().surfaceNormal[0]) * radius;
    expect(crossingOffset).toBeLessThan(-2.5);

    const awayFromCrosswalk = createCrosswalkWorld();
    awayFromCrosswalk.setMovement({ x: 0, y: 1 });
    awayFromCrosswalk.advance(1);
    awayFromCrosswalk.setMovement({ x: 0, y: 0 });
    awayFromCrosswalk.advance(1 / 60);
    awayFromCrosswalk.setMovement({ x: -1, y: 0 });
    for (let frame = 0; frame < 180; frame += 1) {
      awayFromCrosswalk.advance(1 / 60);
    }
    const blockedOffset =
      Math.asin(awayFromCrosswalk.getSnapshot().surfaceNormal[0]) * radius;
    expect(blockedOffset).toBeGreaterThanOrEqual(-1.001);
  });

  it("holds the crosswalk edge instead of snapping a crossing player sideways", () => {
    const radius = 12;
    const world = createWorldSession({
      radius,
      moveSpeed: 3,
      corridorHalfWidth: 1,
      crosswalk: {
        trackAngle: 0,
        halfLength: 1.2,
        minimumOffset: -2.65,
        maximumOffset: 1
      }
    });
    world.setMovement({ x: -1, y: 0 });
    for (let frame = 0; frame < 180; frame += 1) {
      world.advance(1 / 60);
    }

    world.setMovement({ x: 0, y: 1 });
    world.advance(1);
    const held = world.getSnapshot();
    const trackDistance =
      Math.abs(Math.atan2(-held.surfaceNormal[2], held.surfaceNormal[1])) *
      radius;
    const crossTrackOffset = Math.asin(held.surfaceNormal[0]) * radius;

    expect(trackDistance).toBeLessThanOrEqual(1.201);
    expect(crossTrackOffset).toBeLessThan(-2.5);

    world.setMovement({ x: 0, y: 0 });
    world.advance(1 / 60);
    world.setMovement({ x: 1, y: 0 });
    for (let frame = 0; frame < 180; frame += 1) {
      world.advance(1 / 60);
    }
    const returnedOffset =
      Math.asin(world.getSnapshot().surfaceNormal[0]) * radius;
    expect(returnedOffset).toBeGreaterThanOrEqual(-1.001);

    world.setMovement({ x: 0, y: 0 });
    world.advance(1 / 60);
    world.setMovement({ x: -1, y: 0 });
    world.advance(1);
    const continued = world.getSnapshot();
    const continuedTrackDistance =
      Math.abs(
        Math.atan2(-continued.surfaceNormal[2], continued.surfaceNormal[1])
      ) * radius;
    expect(continuedTrackDistance).toBeGreaterThan(1.2);
  });

  it.each([
    { intent: { x: 0, y: -1 }, axis: 2, sign: 1, label: "backward" },
    { intent: { x: 1, y: 0 }, axis: 0, sign: 1, label: "right" },
    { intent: { x: -1, y: 0 }, axis: 0, sign: -1, label: "left" }
  ])("keeps moving $label while the same intent is held", ({ intent, axis, sign }) => {
    const world = createWorldSession({ radius: 12, moveSpeed: 3 });
    const initial = world.getSnapshot().position;

    world.setMovement(intent);
    for (let frame = 0; frame < 60; frame += 1) {
      world.advance(1 / 60);
    }

    const position = world.getSnapshot().position;
    const travelled = Math.hypot(
      position[0] - initial[0],
      position[1] - initial[1],
      position[2] - initial[2]
    );
    expect(travelled).toBeGreaterThan(2.5);
    expect(position[axis] * sign).toBeGreaterThan(2.5);
  });

  it("crosses both poles and completes a full spherical loop without flipping", () => {
    const radius = 12;
    const moveSpeed = 3;
    const world = createWorldSession({ radius, moveSpeed });
    const initial = world.getSnapshot();
    const frames = 1600;
    const delta = (Math.PI * 2 * radius) / moveSpeed / frames;

    world.setMovement({ x: 0, y: 1 });
    for (let frame = 0; frame < frames / 2; frame += 1) {
      world.advance(delta);
    }
    const oppositePole = world.getSnapshot();
    expect(oppositePole.position[1]).toBeCloseTo(-radius, 5);
    expect(
      oppositePole.surfaceNormal[0] * oppositePole.heading[0] +
        oppositePole.surfaceNormal[1] * oppositePole.heading[1] +
        oppositePole.surfaceNormal[2] * oppositePole.heading[2]
    ).toBeCloseTo(0, 7);

    for (let frame = frames / 2; frame < frames; frame += 1) {
      world.advance(delta);
    }
    const completed = world.getSnapshot();
    expect(completed.position).toEqual(
      expect.arrayContaining(initial.position.map((value) => expect.closeTo(value, 5)))
    );
    expect(completed.heading).toEqual(
      expect.arrayContaining(initial.heading.map((value) => expect.closeTo(value, 5)))
    );
  });
});
