import { describe, expect, it } from "vitest";
import {
  getArrival,
  getNavigationRegionAt,
  getSurfaceHeight,
  getTransitionAt,
  getZoneAt,
  isWalkable,
  polygonContainsPoint,
  projectWorldToReference,
  referenceToScene,
  sceneToWorld,
  worldToMap,
  worldToScene
} from "../app/world/RpgWorldGeometry";
import {
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_BRIDGE,
  RPG_WORLD_CANAL,
  RPG_WORLD_CELLS,
  RPG_WORLD_COLLISIONS,
  RPG_WORLD_LANDMARKS,
  RPG_WORLD_ROUTES,
  RPG_WORLD_SPAWN,
  RPG_WORLD_STATIC_BLOCKERS,
  RPG_WORLD_TRANSITIONS,
  RPG_WORLD_ZONE_IDS,
  RPG_WORLD_ZONES
} from "../app/world/RpgWorldModel";

describe("WORLD-02 through WORLD-05 world geometry", () => {
  it("projects every route and transition boundary, centroid, and centerline sample", () => {
    const polygonSamples = (polygon: readonly (readonly [number, number])[]) => [
      ...polygon,
      ...polygon.map((point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        return [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as const;
      }),
      [
        polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length,
        polygon.reduce((sum, [, z]) => sum + z, 0) / polygon.length
      ] as const
    ];
    const expectMeasuredRoundTrip = (
      point: readonly [number, number],
      label: string
    ) => {
      const projection = projectWorldToReference(point);
      expect(projection, label).not.toBeNull();
      expect(projectWorldToReference(point), `${label}:deterministic`).toEqual(projection);
      const scene = referenceToScene(projection!.pixel);
      expect(scene, label).not.toBeNull();
      const restored = sceneToWorld(scene!);
      expect(Math.hypot(restored[0] - point[0], restored[2] - point[1]), label)
        .toBeLessThanOrEqual(1e-6);
      const reprojection = projectWorldToReference([restored[0], restored[2]]);
      expect(reprojection, label).not.toBeNull();
      expect(Math.abs(reprojection!.pixel[0] - projection!.pixel[0]), label)
        .toBeLessThanOrEqual(1);
      expect(Math.abs(reprojection!.pixel[1] - projection!.pixel[1]), label)
        .toBeLessThanOrEqual(1);
    };

    for (const route of RPG_WORLD_ROUTES) {
      for (const point of polygonSamples(route.polygon)) {
        expect(getNavigationRegionAt(point), `${route.id}:${point}`).not.toBeNull();
        expectMeasuredRoundTrip(point, `${route.id}:${point}`);
      }
    }

    for (const transition of RPG_WORLD_TRANSITIONS) {
      const [start, end] = transition.centerline;
      const samples = [
        ...polygonSamples(transition.polygon),
        ...Array.from({ length: 21 }, (_, index) => {
          const progress = index / 20;
          return [
            start[0] + (end[0] - start[0]) * progress,
            start[1] + (end[1] - start[1]) * progress
          ] as const;
        })
      ];
      for (const point of samples) {
        const expectedOwner = [...RPG_WORLD_TRANSITIONS]
          .filter(({ polygon }) => polygonContainsPoint(polygon, point))
          .sort(
            (first, second) =>
              first.ownershipPriority - second.ownershipPriority ||
              first.id.localeCompare(second.id)
          )[0];
        expect(getTransitionAt(point)?.id, `${transition.id}:${point}`).toBe(
          expectedOwner.id
        );
        expect(getNavigationRegionAt(point), `${transition.id}:${point}`).not.toBeNull();
        expectMeasuredRoundTrip(point, `${transition.id}:${point}`);
      }
    }
  });

  it("projects the approved south and east controls through the public authority", () => {
    for (const { point, pixel } of [
      {
        point: [-12, -20],
        pixel: [1010, 650]
      },
      {
        point: [14.3, -18],
        pixel: [1370, 640]
      },
      {
        point: [26, -18],
        pixel: [1570, 640]
      }
    ] as const) {
      const projection = projectWorldToReference(point);
      expect(projection, String(point)).not.toBeNull();
      expect(projection!.triangleId, String(point)).toMatch(
        /^reference-mesh-triangle-/
      );
      expect(projection!.pixel[0], String(point)).toBeCloseTo(pixel[0], 10);
      expect(projection!.pixel[1], String(point)).toBeCloseTo(pixel[1], 10);
      expect([
        ...projection!.pixel,
        ...projection!.uv,
        projection!.spriteScale,
        projection!.depthKey
      ].every(Number.isFinite), String(point)).toBe(true);
      expect(projection!.pixel[0], String(point)).toBeGreaterThanOrEqual(0);
      expect(projection!.pixel[0], String(point)).toBeLessThanOrEqual(1817);
      expect(projection!.pixel[1], String(point)).toBeGreaterThanOrEqual(0);
      expect(projection!.pixel[1], String(point)).toBeLessThanOrEqual(866);
    }
  });

  it("gives transitions shared-edge ownership and canonical display/highlight boundaries", () => {
    for (const transition of RPG_WORLD_TRANSITIONS) {
      const [[ax, az], [bx, bz]] = transition.centerline;
      for (const [progress, display, highlights] of [
        [0, transition.fromZoneId, [transition.fromZoneId]],
        [0.4, transition.fromZoneId, [transition.fromZoneId, transition.toZoneId]],
        [0.5, transition.toZoneId, [transition.fromZoneId, transition.toZoneId]],
        [0.6, transition.toZoneId, [transition.fromZoneId, transition.toZoneId]],
        [1, transition.toZoneId, [transition.toZoneId]]
      ] as const) {
        const point = [ax + (bx - ax) * progress, az + (bz - az) * progress] as const;
        expect(getTransitionAt(point)?.id).toBe(transition.id);
        expect(getZoneAt(point)).toBeNull();
        const region = getNavigationRegionAt(point)!;
        expect(region.kind).toBe("transition");
        expect(region.displayZoneId).toBe(display);
        expect(region.highlightedZoneIds).toEqual(highlights);
      }
    }
  });

  it("resolves shared edges and multi-transition junctions by explicit ownership metadata", () => {
    for (const transition of RPG_WORLD_TRANSITIONS) {
      expect(transition.boundaryOwner).toBe("transition");
      expect(Number.isInteger(transition.ownershipPriority)).toBe(true);
      for (const [edge, progress] of [
        [transition.entryEdge, 0],
        [transition.exitEdge, 1]
      ] as const) {
        const midpoint = [
          (edge[0][0] + edge[1][0]) / 2,
          (edge[0][1] + edge[1][1]) / 2
        ] as const;
        const owner = getNavigationRegionAt(midpoint)!;
        expect(owner.kind, `${transition.id}:${progress}`).toBe("transition");
        if (owner.kind === "transition" && owner.transitionId === transition.id) {
          expect(owner.progress, transition.id).toBe(progress);
        }
      }
    }

    const entryOwner = getNavigationRegionAt([-21, 20]);
    expect(entryOwner).toMatchObject({
      kind: "transition",
      transitionId: "airport-to-tokyo",
      regionId: "airport-to-tokyo"
    });
    expect(getNavigationRegionAt([-21.0000005, 20])).toMatchObject({
      kind: "transition",
      transitionId: "airport-to-tokyo",
      progress: 0
    });
  });

  it("keeps every arrival walkable, inside its zone, and facing its landmark", () => {
    for (const zoneId of RPG_WORLD_ZONE_IDS) {
      const arrival = getArrival(zoneId);
      expect(getZoneAt(arrival.position)?.id).toBe(zoneId);
      expect(isWalkable(arrival.position)).toBe(true);
      expect(Math.hypot(...arrival.heading)).toBeCloseTo(1, 10);
    }
  });

  it("keeps display polygons and logical zone classification identical", () => {
    expect(getZoneAt([-35, -30])?.id).toBe("airport");
    for (const zone of RPG_WORLD_ZONES) {
      expect(zone.displayPolygon).toBe(zone.polygon);
      const points = [
        ...zone.polygon,
        ...zone.polygon.map((point, index) => {
          const next = zone.polygon[(index + 1) % zone.polygon.length];
          return [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as const;
        }),
        [
          zone.polygon.reduce((sum, [x]) => sum + x, 0) / zone.polygon.length,
          zone.polygon.reduce((sum, [, z]) => sum + z, 0) / zone.polygon.length
        ] as const
      ];
      for (const point of points) {
        expect(polygonContainsPoint(zone.displayPolygon, point), `${zone.id}:${point}`).toBe(
          polygonContainsPoint(zone.polygon, point)
        );
        const transition = getTransitionAt(point);
        expect(getZoneAt(point)?.id ?? null, `${zone.id}:${point}`).toBe(
          transition ? null : zone.id
        );
      }
    }
  });

  it("rejects water and blockers while keeping the bridge walkable", () => {
    expect(isWalkable([16.6, 0])).toBe(false);
    expect(isWalkable([16.6, -17])).toBe(true);
    expect(isWalkable([-8, 14])).toBe(false);
    expect(getSurfaceHeight([16.6, -17])).toBeCloseTo(RPG_WORLD_BRIDGE.surfaceHeight + RPG_WORLD_BRIDGE.archRise, 8);
  });

  it("accepts model-authored outdoor surfaces after collision and canal subtraction", () => {
    for (const point of [
      [-35, -30],
      [0, 15],
      [30, -10],
      [26, -18],
      [28, -24]
    ] as const) {
      expect(isWalkable(point), String(point)).toBe(true);
    }
    for (const point of [
      [16.6, -15],
      [16.6, 0],
      [RPG_WORLD_BOUNDS.maximumX + 0.1, 0]
    ] as const) {
      expect(isWalkable(point), String(point)).toBe(false);
    }
  });

  it("WORLD-03 flood-fills from spawn to all arrivals and crosses the canal only on the bridge", () => {
    expect(RPG_WORLD_COLLISIONS.map(({ sourceId }) => sourceId)).toContain(
      "sakura-tree-05"
    );
    expect(RPG_WORLD_COLLISIONS.map(({ sourceId }) => sourceId)).toContain(
      "district-volume-sakura-tree-east-north"
    );
    const extents = (polygon: readonly (readonly [number, number])[]) => ({
      minimumX: Math.min(...polygon.map(([x]) => x)),
      maximumX: Math.max(...polygon.map(([x]) => x)),
      minimumZ: Math.min(...polygon.map(([, z]) => z)),
      maximumZ: Math.max(...polygon.map(([, z]) => z))
    });
    const cells = RPG_WORLD_CELLS.map((cell) => ({ ...cell, ...extents(cell.polygon) }));
    const adjacent = (first: (typeof cells)[number], second: (typeof cells)[number]) => {
      const sharedVertical =
        Math.abs(first.maximumX - second.minimumX) <= 1e-9 ||
        Math.abs(second.maximumX - first.minimumX) <= 1e-9;
      const sharedHorizontal =
        Math.abs(first.maximumZ - second.minimumZ) <= 1e-9 ||
        Math.abs(second.maximumZ - first.minimumZ) <= 1e-9;
      const zOverlap =
        Math.min(first.maximumZ, second.maximumZ) -
        Math.max(first.minimumZ, second.minimumZ);
      const xOverlap =
        Math.min(first.maximumX, second.maximumX) -
        Math.max(first.minimumX, second.minimumX);
      return (sharedVertical && zOverlap > 1e-9) ||
        (sharedHorizontal && xOverlap > 1e-9);
    };
    const contains = (
      cell: (typeof cells)[number],
      [x, z]: readonly [number, number]
    ) =>
      x >= cell.minimumX - 1e-9 &&
      x <= cell.maximumX + 1e-9 &&
      z >= cell.minimumZ - 1e-9 &&
      z <= cell.maximumZ + 1e-9;

    const startPoint = [RPG_WORLD_SPAWN[0], RPG_WORLD_SPAWN[2]] as const;
    const queue = cells.filter((cell) => contains(cell, startPoint));
    const visited = new Set(queue.map(({ id }) => id));
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const candidate of cells) {
        if (!visited.has(candidate.id) && adjacent(current, candidate)) {
          visited.add(candidate.id);
          queue.push(candidate);
        }
      }
    }
    expect(visited.size).toBe(cells.length);

    for (const arrival of RPG_WORLD_ARRIVALS) {
      const point = [arrival.position[0], arrival.position[2]] as const;
      expect(
        cells.some((cell) => visited.has(cell.id) && contains(cell, point)),
        arrival.id
      ).toBe(true);
    }

    const canal = extents(RPG_WORLD_CANAL.polygon);
    const bridge = extents(RPG_WORLD_BRIDGE.polygon);
    const canalInteriorCells = cells.filter(
      (cell) =>
        cell.maximumX > canal.minimumX + 1e-9 &&
        cell.minimumX < canal.maximumX - 1e-9
    );
    expect(canalInteriorCells.length).toBeGreaterThan(0);
    for (const cell of canalInteriorCells) {
      expect(cell.minimumX, cell.id).toBeGreaterThanOrEqual(bridge.minimumX - 1e-9);
      expect(cell.maximumX, cell.id).toBeLessThanOrEqual(bridge.maximumX + 1e-9);
      expect(cell.minimumZ, cell.id).toBeGreaterThanOrEqual(bridge.minimumZ - 1e-9);
      expect(cell.maximumZ, cell.id).toBeLessThanOrEqual(bridge.maximumZ + 1e-9);
    }
  });

  it("projects blocked render geometry without changing gameplay walkability", () => {
    for (const landmark of RPG_WORLD_LANDMARKS.filter(
      ({ blocksMovement }) => blocksMovement
    )) {
      const point = [landmark.position[0], landmark.position[2]] as const;
      expect(isWalkable(point), landmark.id).toBe(false);
      expect(projectWorldToReference(point), landmark.id).not.toBeNull();
    }
    for (const blocker of RPG_WORLD_STATIC_BLOCKERS) {
      expect(isWalkable(blocker.collision.center), blocker.id).toBe(false);
      expect(projectWorldToReference(blocker.collision.center), blocker.id).not.toBeNull();
    }
  });

  it("fails closed for every non-finite spatial lookup", () => {
    for (const point of [
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      [0, Number.NEGATIVE_INFINITY]
    ] as const) {
      expect(isWalkable(point)).toBe(false);
      expect(getZoneAt(point)).toBeNull();
      expect(getTransitionAt(point)).toBeNull();
      expect(getNavigationRegionAt(point)).toBeNull();
      expect(projectWorldToReference(point)).toBeNull();
      expect(worldToMap(point)).toBeNull();
      expect(getSurfaceHeight(point)).toBe(0);
    }
  });

  it("round-trips canonical positions and uses one normalized map orientation", () => {
    for (const point of [[-30, 0, 0], [16.6, 0, -17], [26, 0, -18], [3.25, 1.2, 7.5]] as const) {
      const restored = sceneToWorld(worldToScene(point));
      expect(restored[0]).toBeCloseTo(point[0], 10);
      expect(restored[1]).toBeCloseTo(point[1], 10);
      expect(restored[2]).toBeCloseTo(point[2], 10);
    }
    expect(worldToMap([-36, 36])).toEqual({ x: 0, y: 0 });
    expect(worldToMap([36, -36])).toEqual({ x: 1, y: 1 });
  });
});
