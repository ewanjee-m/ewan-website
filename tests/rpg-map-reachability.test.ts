import { describe, expect, it } from "vitest";
import {
  RPG_CANONICAL_MAP_SOURCE_IDS,
  RPG_MAP_LAND_SOURCE_ID,
  RPG_MAP_NODES,
  RPG_MAP_ROADS
} from "../app/world/RpgMiniMapProjection";
import {
  RPG_PLAYER_COLLISION_RADIUS,
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_BRIDGE,
  RPG_WORLD_CANAL,
  RPG_WORLD_SCENE_LANDMARKS,
  RPG_WORLD_SPAWN,
  RPG_WORLD_ZONES,
  type WorldPoint2,
  type WorldPolygon
} from "../app/world/RpgWorldModel";
import { isWalkable, polygonContainsPoint } from "../app/world/RpgWorldGeometry";

/**
 * Everything the map offers as somewhere to be has to be somewhere the visitor
 * can actually get to on foot, measured against the walkable space rather than
 * judged by eye. The grid is the walkable test sampled every quarter unit; the
 * flood fill starts where the visitor starts.
 */
const STEP = 0.25;
const { minimumX, maximumX, minimumZ, maximumZ } = RPG_WORLD_BOUNDS;
const columns = Math.round((maximumX - minimumX) / STEP) + 1;
const rows = Math.round((maximumZ - minimumZ) / STEP) + 1;

const walkable = new Uint8Array(columns * rows);
for (let column = 0; column < columns; column += 1) {
  for (let row = 0; row < rows; row += 1) {
    if (isWalkable([minimumX + column * STEP, minimumZ + row * STEP])) {
      walkable[column * rows + row] = 1;
    }
  }
}

const reachable = new Uint8Array(columns * rows);
const spawnIndex =
  Math.round((RPG_WORLD_SPAWN[0] - minimumX) / STEP) * rows +
  Math.round((RPG_WORLD_SPAWN[2] - minimumZ) / STEP);
const pending = [spawnIndex];
reachable[spawnIndex] = walkable[spawnIndex];
while (pending.length > 0) {
  const index = pending.pop()!;
  const column = Math.floor(index / rows);
  const row = index % rows;
  for (const [nextColumn, nextRow] of [
    [column + 1, row],
    [column - 1, row],
    [column, row + 1],
    [column, row - 1]
  ]) {
    if (
      nextColumn < 0 ||
      nextRow < 0 ||
      nextColumn >= columns ||
      nextRow >= rows
    ) {
      continue;
    }
    const neighbour = nextColumn * rows + nextRow;
    if (!walkable[neighbour] || reachable[neighbour]) continue;
    reachable[neighbour] = 1;
    pending.push(neighbour);
  }
}

function isReachable([x, z]: WorldPoint2) {
  const column = Math.round((x - minimumX) / STEP);
  const row = Math.round((z - minimumZ) / STEP);
  if (column < 0 || row < 0 || column >= columns || row >= rows) return false;
  return Boolean(reachable[column * rows + row]);
}

function reachableCellsIn(polygon: WorldPolygon) {
  const xs = polygon.map(([x]) => x);
  const zs = polygon.map(([, z]) => z);
  let count = 0;
  for (
    let x = Math.max(minimumX, Math.min(...xs));
    x <= Math.min(maximumX, Math.max(...xs));
    x += STEP
  ) {
    for (
      let z = Math.max(minimumZ, Math.min(...zs));
      z <= Math.min(maximumZ, Math.max(...zs));
      z += STEP
    ) {
      if (isReachable([x, z])) count += 1;
    }
  }
  return count;
}

function approachRadius(landmark: (typeof RPG_WORLD_SCENE_LANDMARKS)[number]) {
  return (
    Math.max(landmark.size[0], landmark.size[2]) / 2 +
    RPG_PLAYER_COLLISION_RADIUS +
    Math.max(
      landmark.collisionPadding?.[0] ?? 0,
      landmark.collisionPadding?.[1] ?? 0
    ) +
    0.5
  );
}

describe("everything the map offers can be walked to", () => {
  it("has one connected walkable space, so nothing is fenced off", () => {
    const walkableCount = walkable.reduce<number>(
      (total, cell) => total + cell,
      0
    );
    const reachableCount = reachable.reduce<number>(
      (total, cell) => total + cell,
      0
    );
    expect(walkableCount).toBeGreaterThan(10_000);
    expect(reachableCount).toBe(walkableCount);
  });

  it("stands every arrival on reachable ground", () => {
    for (const arrival of RPG_WORLD_ARRIVALS) {
      expect(
        isReachable([arrival.position[0], arrival.position[2]]),
        arrival.id
      ).toBe(true);
    }
    for (const node of RPG_MAP_NODES) {
      expect(
        isReachable([node.worldPosition[0], node.worldPosition[2]]),
        node.arrivalId
      ).toBe(true);
    }
  });

  it("only draws roads and districts that have reachable ground on them", () => {
    for (const road of RPG_MAP_ROADS) {
      expect(reachableCellsIn(road.polygon), road.id).toBeGreaterThan(0);
    }
    for (const zone of RPG_WORLD_ZONES) {
      expect(reachableCellsIn(zone.displayPolygon), zone.id).toBeGreaterThan(0);
    }
    expect(reachableCellsIn(RPG_WORLD_BRIDGE.polygon)).toBeGreaterThan(0);
  });

  it("names no source the visitor cannot reach", () => {
    const unreachableByDesign = new Set<string>([
      // The canal is the barrier the bridge crosses, not a destination. It is
      // drawn as water and is deliberately not walkable.
      RPG_WORLD_CANAL.id,
      // The land plate under everything; covered by the zone and road checks.
      RPG_MAP_LAND_SOURCE_ID,
      // The visitor.
      "player"
    ]);
    const destinations = new Set<string>(
      RPG_MAP_NODES.map(({ arrivalId }) => arrivalId)
    );
    const roads = new Set<string>(RPG_MAP_ROADS.map(({ id }) => id));
    const zones = new Set<string>(RPG_WORLD_ZONES.map(({ id }) => id));
    for (const sourceId of RPG_CANONICAL_MAP_SOURCE_IDS) {
      expect(
        unreachableByDesign.has(sourceId) ||
          destinations.has(sourceId) ||
          roads.has(sourceId) ||
          zones.has(sourceId) ||
          sourceId === RPG_WORLD_BRIDGE.id,
        `${sourceId} is drawn on the map but is not a checked world feature`
      ).toBe(true);
    }
  });

  it("keeps every piece of scenery inside the world and approachable", () => {
    const outsideBounds: string[] = [];
    const strandedInWater: string[] = [];
    const unapproachable: string[] = [];

    for (const landmark of RPG_WORLD_SCENE_LANDMARKS) {
      const [x, , z] = landmark.position;
      if (x < minimumX || x > maximumX || z < minimumZ || z > maximumZ) {
        outsideBounds.push(landmark.id);
      }

      const radius = approachRadius(landmark);
      const approachable = Array.from({ length: 72 }, (_, sample) => {
        const angle = (sample / 72) * Math.PI * 2;
        return [
          x + Math.cos(angle) * radius,
          z + Math.sin(angle) * radius
        ] as WorldPoint2;
      }).some((point) => isWalkable(point) && isReachable(point));
      if (!approachable) unapproachable.push(landmark.id);

      const overWater =
        polygonContainsPoint(RPG_WORLD_CANAL.polygon, [x, z] as WorldPoint2) &&
        !polygonContainsPoint(RPG_WORLD_BRIDGE.polygon, [x, z] as WorldPoint2);
      if (overWater && !approachable) strandedInWater.push(landmark.id);
    }

    expect(outsideBounds).toEqual([]);
    expect(unapproachable).toEqual([]);
    expect(strandedInWater).toEqual([]);
    expect(RPG_WORLD_SCENE_LANDMARKS.length).toBeGreaterThan(0);
  });
});
