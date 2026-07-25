import { describe, expect, it } from "vitest";
import {
  RPG_CANONICAL_ROUTE,
  RPG_CANONICAL_ROUTE_STEERING,
  RPG_CANONICAL_ROUTE_TOLERANCE
} from "./fixtures/rpg-canonical-route";
import { isWalkable } from "../app/world/RpgWorldGeometry";
import { RPG_PLAYER_COLLISION_RADIUS } from "../app/world/RpgWorldModel";

/**
 * The canonical route is the walk every route test drives, and every vertex on
 * it is asserted to be reached within RPG_CANONICAL_ROUTE_TOLERANCE. That is
 * only possible if the whole tolerance disc is standing room: the runtime never
 * places the visitor on a blocked cell, so a vertex whose disc is even
 * partially blocked is a vertex the driver can only reach by luck, and one
 * whose disc is entirely blocked cannot be reached at all.
 *
 * This exists because it did happen. Widening RPG_PLAYER_COLLISION_RADIUS from
 * 0.3 to 0.53 — the chibi rebuild made the skull the widest part of the figure —
 * grew every blocker by 0.23 units, and sakura-tree-05 at (12.8, -16.53) with a
 * 1.075 half-size swallowed the bridge approach at (14.3, -18). The e2e route
 * tests failed as a correction deadlock against an invisible wall, which is a
 * long way from the actual cause. Sampled here, the cause is one line.
 */

const DISC_STEP = 0.005;
const LEG_STEP = 0.02;

function blockedPointsInsideTolerance(target: readonly [number, number]) {
  const blocked: [number, number][] = [];
  for (
    let offsetX = -RPG_CANONICAL_ROUTE_TOLERANCE;
    offsetX <= RPG_CANONICAL_ROUTE_TOLERANCE + 1e-9;
    offsetX += DISC_STEP
  ) {
    for (
      let offsetZ = -RPG_CANONICAL_ROUTE_TOLERANCE;
      offsetZ <= RPG_CANONICAL_ROUTE_TOLERANCE + 1e-9;
      offsetZ += DISC_STEP
    ) {
      if (Math.hypot(offsetX, offsetZ) > RPG_CANONICAL_ROUTE_TOLERANCE) continue;
      const point: [number, number] = [
        target[0] + offsetX,
        target[1] + offsetZ
      ];
      if (!isWalkable(point)) blocked.push(point);
    }
  }
  return blocked;
}

function blockedPointsAlongLeg(
  from: readonly [number, number],
  to: readonly [number, number]
) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(1, Math.ceil(length / LEG_STEP));
  const blocked: [number, number][] = [];
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const point: [number, number] = [
      from[0] + (to[0] - from[0]) * progress,
      from[1] + (to[1] - from[1]) * progress
    ];
    if (!isWalkable(point)) blocked.push(point);
  }
  return blocked;
}

describe("canonical route walkability", () => {
  it("reports the collision radius the waypoints below were measured against", () => {
    // Deliberately not pinned to a value. The radius is the character work's to
    // set, and it has already moved twice in a day; what this file defends is
    // that whatever it is set to, the route stays walkable. Naming it here means
    // a failure below arrives with the number that caused it.
    expect(RPG_PLAYER_COLLISION_RADIUS).toBeGreaterThan(0);
  });

  it.each(RPG_CANONICAL_ROUTE.map((point, index) => [index, point] as const))(
    "vertex %i has standing room across the whole arrival tolerance",
    (index, target) => {
      const blocked = blockedPointsInsideTolerance(target);
      expect(
        blocked.length,
        `canonical vertex ${index} at ${target.join(",")} has ${blocked.length} ` +
          `blocked points inside the ${RPG_CANONICAL_ROUTE_TOLERANCE} tolerance, ` +
          `first at ${blocked[0]?.join(",")}`
      ).toBe(0);
    }
  );

  it.each(
    RPG_CANONICAL_ROUTE_STEERING.map((point, index) => [index, point] as const)
  )("steering point %i is standing room", (index, target) => {
    expect(
      isWalkable(target as [number, number]),
      `canonical steering point ${index} at ${target.join(",")} is blocked`
    ).toBe(true);
  });

  it.each(
    RPG_CANONICAL_ROUTE.slice(1).map(
      (target, index) => [index, RPG_CANONICAL_ROUTE[index], target] as const
    )
  )("leg %i is walkable end to end", (index, from, to) => {
    const blocked = blockedPointsAlongLeg(from, to);
    expect(
      blocked.length,
      `canonical leg ${index}->${index + 1} has ${blocked.length} blocked ` +
        `samples, first at ${blocked[0]?.join(",")}`
    ).toBe(0);
  });

  it.each(
    RPG_CANONICAL_ROUTE_STEERING.slice(1).map(
      (target, index) =>
        [index, RPG_CANONICAL_ROUTE_STEERING[index], target] as const
    )
  )("steering leg %i is walkable end to end", (index, from, to) => {
    const blocked = blockedPointsAlongLeg(from, to);
    expect(
      blocked.length,
      `canonical steering leg ${index}->${index + 1} has ${blocked.length} ` +
        `blocked samples, first at ${blocked[0]?.join(",")}`
    ).toBe(0);
  });
});
