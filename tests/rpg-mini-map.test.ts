import { describe, expect, it } from "vitest";
import {
  isWalkable,
  projectWorldToReference
} from "../app/world/RpgWorldGeometry";
import {
  RPG_MINI_MAP_VIEW_BOX,
  RPG_REFERENCE_MAP_COASTLINE,
  RPG_REFERENCE_MAP_NODES,
  RPG_REFERENCE_MAP_TRANSITIONS,
  RPG_WORLD_MAP_VIEW_BOX,
  createRpgMapProjection,
  projectRpgReferenceMapHeadingRotation,
  projectRpgReferenceMapPoint,
  projectRpgWorldPolygon,
  unprojectRpgReferenceMapPoint,
  type RpgReferencePoint
} from "../app/world/RpgMiniMapProjection";
import {
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_ZONES
} from "../app/world/RpgWorldModel";
import { RPG_CANONICAL_ROUTE } from "./fixtures/rpg-canonical-route";
import { RPG_REFERENCE_MAP_GOLDEN } from "./fixtures/rpg-reference-registration-golden";

const GOLDEN_COASTLINE = RPG_REFERENCE_MAP_GOLDEN.coastline;
const GOLDEN_TRANSITIONS = RPG_REFERENCE_MAP_GOLDEN.routes;
const GOLDEN_NODES = RPG_REFERENCE_MAP_GOLDEN.nodes;

function pointInPolygon([x, y]: RpgReferencePoint, polygon: readonly RpgReferencePoint[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, ay] = polygon[previous];
    const [bx, by] = polygon[index];
    if ((ay > y) !== (by > y) && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point: RpgReferencePoint, start: RpgReferencePoint, end: RpgReferencePoint) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const progress = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + dx * progress), point[1] - (start[1] + dy * progress));
}

function distanceToPolyline(point: RpgReferencePoint, line: readonly RpgReferencePoint[], closed = false) {
  const segmentCount = closed ? line.length : line.length - 1;
  return Math.min(...Array.from({ length: segmentCount }, (_, index) =>
    distanceToSegment(point, line[index], line[(index + 1) % line.length])));
}

function densify(line: readonly RpgReferencePoint[], step: number, closed = false) {
  const samples: RpgReferencePoint[] = [];
  const segmentCount = closed ? line.length : line.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = line[index];
    const end = line[(index + 1) % line.length];
    const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const count = Math.max(1, Math.ceil(distance / step));
    for (let sample = 0; sample < count; sample += 1) {
      const progress = sample / count;
      samples.push([
        start[0] + (end[0] - start[0]) * progress,
        start[1] + (end[1] - start[1]) * progress
      ]);
    }
  }
  samples.push(closed ? line[0] : line[line.length - 1]);
  return samples;
}

describe("RPG terrain map projection", () => {
  it("uses the registered reference coordinate system", () => {
    expect(RPG_MINI_MAP_VIEW_BOX).toEqual({
      width: RPG_REFERENCE_MAP_GOLDEN.imageSize[0],
      height: RPG_REFERENCE_MAP_GOLDEN.imageSize[1],
      padding: 0
    });
    expect(RPG_WORLD_MAP_VIEW_BOX).toBe(RPG_MINI_MAP_VIEW_BOX);
  });

  it("round-trips walkable map points within 0.1 world units", () => {
    const samples: Array<readonly [number, number]> = [];
    for (let index = 1; index < RPG_CANONICAL_ROUTE.length; index += 1) {
      const from = RPG_CANONICAL_ROUTE[index - 1];
      const to = RPG_CANONICAL_ROUTE[index];
      const count = Math.ceil(
        Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.1
      );
      for (let sample = 0; sample <= count; sample += 1) {
        const progress = sample / count;
        samples.push([
          from[0] + (to[0] - from[0]) * progress,
          from[1] + (to[1] - from[1]) * progress
        ]);
      }
    }
    for (
      let x = RPG_WORLD_BOUNDS.minimumX;
      x <= RPG_WORLD_BOUNDS.maximumX;
      x += 0.5
    ) {
      for (
        let z = RPG_WORLD_BOUNDS.minimumZ;
        z <= RPG_WORLD_BOUNDS.maximumZ;
        z += 0.5
      ) {
        if (isWalkable([x, z])) samples.push([x, z]);
      }
    }
    for (const [x, z] of samples) {
      const pixel = projectRpgReferenceMapPoint([x, 0, z]);
      const world = unprojectRpgReferenceMapPoint([pixel.x, pixel.y]);
      expect(world, `${x},${z}`).not.toBeNull();
      expect(
        Math.hypot(world![0] - x, world![2] - z),
        `${x},${z}`
      ).toBeLessThanOrEqual(0.1);
    }
  });

  it("projects world polygons into registered reference points", () => {
    const polygon = RPG_WORLD_ZONES[0].displayPolygon;

    expect(projectRpgWorldPolygon(polygon)).toEqual(
      polygon.map((point) => projectWorldToReference(point)!.pixel)
    );
  });

  it("rejects a polygon outside the registered map terrain", () => {
    expect(() =>
      projectRpgWorldPolygon([
        [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
        [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER],
        [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1]
      ])
    ).toThrow(RangeError);
  });

  it("keeps the independent coastline, transition, and five-node golden exact", () => {
    expect(RPG_REFERENCE_MAP_COASTLINE).toEqual(GOLDEN_COASTLINE);
    expect(Object.fromEntries(RPG_REFERENCE_MAP_TRANSITIONS.map(({ id, points }) => [id, points]))).toEqual(GOLDEN_TRANSITIONS);
    expect(Object.fromEntries(RPG_REFERENCE_MAP_NODES.map(({ zoneId, referencePixel }) => [zoneId, referencePixel]))).toEqual(GOLDEN_NODES);
    expect(RPG_REFERENCE_MAP_NODES.map(({ arrivalId }) => arrivalId)).toEqual([
      "airport-arrival", "tokyo-arrival", "gyukatsu-arrival", "sakura-arrival", "hanabi-arrival"
    ]);
    for (const node of RPG_REFERENCE_MAP_NODES) {
      const target = GOLDEN_NODES[node.zoneId];
      expect(
        Math.hypot(
          node.referencePixel[0] - target[0],
          node.referencePixel[1] - target[1]
        ),
        node.arrivalId
      ).toBeLessThanOrEqual(0.5);
    }
  });

  it("meets the coastline raster and symmetric boundary gates", () => {
    let intersection = 0;
    let union = 0;
    let waterIntersection = 0;
    let waterUnion = 0;
    for (let y = 0; y <= 864; y += 2) {
      for (let x = 0; x <= 1816; x += 2) {
        const point = [x + 1, y + 1] as const;
        const goldenLand = pointInPolygon(point, GOLDEN_COASTLINE);
        const actualLand = pointInPolygon(point, RPG_REFERENCE_MAP_COASTLINE);
        if (goldenLand && actualLand) intersection += 1;
        if (goldenLand || actualLand) union += 1;
        if (distanceToPolyline(point, GOLDEN_COASTLINE, true) <= 64) {
          if (goldenLand && actualLand) waterIntersection += 1;
          if (goldenLand || actualLand) waterUnion += 1;
        }
      }
    }
    expect(intersection / union).toBeGreaterThanOrEqual(0.72);
    expect(waterIntersection / waterUnion).toBeGreaterThanOrEqual(0.82);

    const symmetricDistances = [
      ...densify(GOLDEN_COASTLINE, 2, true).map((point) => distanceToPolyline(point, RPG_REFERENCE_MAP_COASTLINE, true)),
      ...densify(RPG_REFERENCE_MAP_COASTLINE, 2, true).map((point) => distanceToPolyline(point, GOLDEN_COASTLINE, true))
    ].sort((a, b) => a - b);
    const p95 = symmetricDistances[Math.ceil(symmetricDistances.length * 0.95) - 1];
    expect(p95).toBeLessThanOrEqual(18);
    expect(symmetricDistances.at(-1)).toBeLessThanOrEqual(32);
  });

  it("meets symmetric densified route, endpoint, and curved bridge gates", () => {
    for (const route of RPG_REFERENCE_MAP_TRANSITIONS) {
      const golden = GOLDEN_TRANSITIONS[route.id];
      const threshold = route.kind === "bridge" ? 12 : 14;
      const distances = [
        ...densify(golden, 8).map((point) => distanceToPolyline(point, route.points)),
        ...densify(route.points, 8).map((point) => distanceToPolyline(point, golden))
      ];
      expect(Math.max(...distances), route.id).toBeLessThanOrEqual(threshold);
      for (const endpoint of [golden[0], golden[golden.length - 1]]) {
        const nearestNode = Math.min(...Object.values(GOLDEN_NODES).map((node) => Math.hypot(endpoint[0] - node[0], endpoint[1] - node[1])));
        expect(nearestNode, `${route.id}:endpoint`).toBeGreaterThanOrEqual(24);
      }
    }

    const bridge = GOLDEN_TRANSITIONS["sakura-to-hanabi"];
    const start = bridge[0];
    const middle = bridge[2];
    const end = bridge[bridge.length - 1];
    const chordY = start[1] + ((end[1] - start[1]) * (middle[0] - start[0])) / (end[0] - start[0]);
    expect(chordY - middle[1]).toBeGreaterThanOrEqual(22);
  });

  it("projects the player and heading through the measured local reference registration", () => {
    const arrival = RPG_WORLD_ARRIVALS[2];
    const expected = projectWorldToReference(arrival.position)!;
    expect(projectRpgReferenceMapPoint(arrival.position)).toEqual({
      x: expected.pixel[0],
      y: expected.pixel[1]
    });

    const heading = [arrival.heading[0], 0, arrival.heading[1]] as const;
    const epsilon = 0.25;
    const next = projectWorldToReference([
      arrival.position[0] + heading[0] * epsilon,
      arrival.position[1],
      arrival.position[2] + heading[2] * epsilon
    ])!;
    const expectedAngle = Math.atan2(
      next.pixel[1] - expected.pixel[1],
      next.pixel[0] - expected.pixel[0]
    ) * 180 / Math.PI;
    expect(projectRpgReferenceMapHeadingRotation(arrival.position, heading, epsilon)).toBeCloseTo(expectedAngle, 10);
  });

  it("retains the standalone bounded projection utility", () => {
    const projection = createRpgMapProjection({
      bounds: { minimumX: 10, maximumX: 30, minimumZ: -20, maximumZ: 20 },
      orientation: {
        rotationRadians: 0,
        worldXAxis: "reference-right",
        worldZAxis: "reference-up",
        referenceOrigin: "top-left"
      }
    });
    expect(projection.projectPoint([15, 0, 10], { width: 300, height: 200, padding: 20 })).toEqual({ x: 130, y: 60 });
  });
});
