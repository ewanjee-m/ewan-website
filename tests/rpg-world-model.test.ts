import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isWalkable, projectWorldToReference } from "../app/world/RpgWorldGeometry";
import {
  getReferenceCalibrationSourceWorldXZ,
  RPG_REFERENCE_CALIBRATION_CONTROLS,
  RPG_REFERENCE_CALIBRATION_INPUT,
  RPG_REFERENCE_CALIBRATION_OBSERVATIONS,
  RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES,
  RPG_REFERENCE_ARRIVAL_ANCHORS,
  RPG_REFERENCE_PROTECTED_RECTANGLES,
  RPG_REFERENCE_REGISTRATION,
  RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES,
  RPG_REFERENCE_ZONE_ANCHORS,
  RPG_TRANSITION_PROTECTED_PAIRS,
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_ATOMIC_CELLS,
  RPG_WORLD_BRIDGE,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_CANAL,
  RPG_WORLD_CELLS,
  RPG_WORLD_COASTLINE,
  RPG_WORLD_LANDMARKS,
  RPG_WORLD_MODEL,
  RPG_WORLD_ROUTES,
  RPG_WORLD_SCENE_LANDMARKS,
  RPG_WORLD_SCENE_SURFACES,
  RPG_WORLD_TRANSITIONS,
  RPG_WORLD_TOPOLOGY_X,
  RPG_WORLD_TOPOLOGY_Z,
  RPG_WORLD_ZONE_IDS,
  RPG_WORLD_ZONES
} from "../app/world/RpgWorldModel";
import {
  RPG_REFERENCE_MAP_GOLDEN,
  RPG_REFERENCE_REGISTRATION_GOLDEN
} from "./fixtures/rpg-reference-registration-golden";

type Point2 = readonly [number, number];

const signedTriangleArea = ([a, b, c]: readonly [Point2, Point2, Point2]) =>
  ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;

const polygonArea = (polygon: readonly Point2[]) =>
  Math.abs(
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2
  );

const axisAlignedRectangleContainsPoint = (
  polygon: readonly Point2[],
  [x, z]: Point2
) => {
  const xs = polygon.map(([coordinate]) => coordinate);
  const zs = polygon.map(([, coordinate]) => coordinate);
  return x >= Math.min(...xs) &&
    x <= Math.max(...xs) &&
    z >= Math.min(...zs) &&
    z <= Math.max(...zs);
};

const clipConvexPolygon = (subject: readonly Point2[], rawClip: readonly Point2[]) => {
  const clip = signedTriangleArea(rawClip as readonly [Point2, Point2, Point2]) > 0
    ? rawClip
    : [...rawClip].reverse();
  let output = [...subject];
  for (let index = 0; index < clip.length; index += 1) {
    const edgeStart = clip[index];
    const edgeEnd = clip[(index + 1) % clip.length];
    const input = output;
    output = [];
    const inside = (point: Point2) =>
      (edgeEnd[0] - edgeStart[0]) * (point[1] - edgeStart[1]) -
        (edgeEnd[1] - edgeStart[1]) * (point[0] - edgeStart[0]) >= -1e-9;
    const intersection = (start: Point2, end: Point2): Point2 => {
      const segmentX = end[0] - start[0];
      const segmentY = end[1] - start[1];
      const edgeX = edgeEnd[0] - edgeStart[0];
      const edgeY = edgeEnd[1] - edgeStart[1];
      const denominator = segmentX * edgeY - segmentY * edgeX;
      const progress =
        ((edgeStart[0] - start[0]) * edgeY - (edgeStart[1] - start[1]) * edgeX) /
        denominator;
      return [start[0] + progress * segmentX, start[1] + progress * segmentY];
    };
    for (let pointIndex = 0; pointIndex < input.length; pointIndex += 1) {
      const current = input[pointIndex];
      const previous = input[(pointIndex + input.length - 1) % input.length];
      const currentInside = inside(current);
      const previousInside = inside(previous);
      if (currentInside !== previousInside) output.push(intersection(previous, current));
      if (currentInside) output.push(current);
    }
  }
  return output;
};

const triangleContainsPoint = (
  triangle: readonly [Point2, Point2, Point2],
  point: Point2
) => {
  const signs = triangle.map((start, index) => {
    const end = triangle[(index + 1) % 3];
    return (end[0] - start[0]) * (point[1] - start[1]) -
      (end[1] - start[1]) * (point[0] - start[0]);
  });
  return signs.every((sign) => sign >= -1e-8) || signs.every((sign) => sign <= 1e-8);
};

describe("WORLD-01 canonical RPG world model", () => {
  it("owns exactly five complete zones and one global registration", () => {
    expect(RPG_WORLD_ZONE_IDS).toEqual(["airport", "tokyo", "gyukatsu", "sakura", "hanabi"]);
    expect(RPG_WORLD_ZONES).toHaveLength(5);
    for (const zone of RPG_WORLD_ZONES) {
      expect(zone.polygon.length, zone.id).toBeGreaterThanOrEqual(3);
      expect(zone.primaryLandmarkId, zone.id).toBeTruthy();
      expect(zone.arrivalId, zone.id).toBeTruthy();
      expect(zone.cameraAnchor, zone.id).toHaveLength(2);
      expect(zone.protectedLandmarkRectangle.maximumX, zone.id).toBeGreaterThan(zone.protectedLandmarkRectangle.minimumX);
      expect(zone.cameraFocusRectangle.maximumX, zone.id)
        .toBeGreaterThan(zone.cameraFocusRectangle.minimumX);
      expect(zone).not.toHaveProperty("referenceTransform");
      expect(zone).not.toHaveProperty("referenceScale");
    }
    expect(RPG_WORLD_MODEL.referenceRegistration).toBe(RPG_REFERENCE_REGISTRATION);
    expect(RPG_WORLD_MODEL.referenceCameraFocusRectangles)
      .toBe(RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES);
    expect(RPG_REFERENCE_REGISTRATION.imageSize).toEqual([1817, 866]);
  });

  it("defines directed transitions with shared navigation policy", () => {
    for (const transition of RPG_WORLD_TRANSITIONS) {
      expect(transition.fromZoneId).not.toBe(transition.toZoneId);
      expect(transition.centerline).toHaveLength(2);
      expect(transition.entryEdge).toHaveLength(2);
      expect(transition.exitEdge).toHaveLength(2);
      expect(transition.boundaryOwner).toBe("transition");
      expect(transition.ownershipPriority).toBeGreaterThan(0);
      expect(transition.dualProtectionRange).toEqual([0.4, 0.6]);
      expect(transition.fromCameraAnchor).toHaveLength(2);
      expect(transition.toCameraAnchor).toHaveLength(2);
      expect(transition.fromProtectedLandmarkId).toBeTruthy();
      expect(transition.toProtectedLandmarkId).toBeTruthy();
    }
  });

  it("uses the exact connected route and transition model", () => {
    expect(RPG_WORLD_ROUTES.map(({ id, polygon }) => [id, polygon])).toEqual([
      ["airport-arrival-road", [[-32.5, -7.5], [-27, -7.5], [-27, 20], [-32.5, 20]]],
      ["tokyo-north-boulevard", [[-30, 17], [-8, 17], [-8, 23], [-30, 23]]],
      ["tokyo-center-connector", [[-11, 0], [-5, 0], [-5, 23], [-11, 23]]],
      ["gyukatsu-cross-street", [[-27, -3], [11, -3], [11, 3], [-27, 3]]],
      ["center-south-connector", [[5, -20], [11, -20], [11, 3], [5, 3]]],
      ["sakura-festival-road", [[-12, -20], [14.3, -20], [14.3, -16], [-12, -16]]],
      ["sakura-bridge-route", [[14.3, -18], [18.9, -18], [18.9, -16], [14.3, -16]]],
      ["hanabi-festival-road", [[18.9, -19], [26, -19], [26, -14], [18.9, -14]]]
    ]);
    expect(
      RPG_WORLD_TRANSITIONS.map(({ id, polygon, centerline }) => [
        id,
        polygon,
        centerline
      ])
    ).toEqual([
      ["airport-to-tokyo", [[-21, 17], [-19, 17], [-19, 23], [-21, 23]], [[-21, 20], [-19, 20]]],
      ["airport-to-gyukatsu", [[-21, -3], [-19, -3], [-19, 3], [-21, 3]], [[-21, 0], [-19, 0]]],
      ["tokyo-to-gyukatsu", [[-11, 9], [-5, 9], [-5, 11], [-11, 11]], [[-8, 11], [-8, 9]]],
      ["gyukatsu-to-sakura", [[5, -11], [11, -11], [11, -9], [5, -9]], [[8, -9], [8, -11]]],
      ["sakura-to-hanabi", [[15, -18], [17, -18], [17, -16], [15, -16]], [[15, -17], [17, -17]]]
    ]);
    expect(RPG_WORLD_TRANSITIONS.map(({ id }) => id)).not.toContain(
      "airport-to-sakura"
    );
    expect(RPG_WORLD_TRANSITIONS.map(({ id }) => id)).not.toContain(
      "gyukatsu-to-hanabi"
    );
    expect(
      RPG_WORLD_SCENE_LANDMARKS.map(
        ({ navigationRegionId }) => navigationRegionId
      ).filter(Boolean)
    ).not.toContain("gyukatsu-to-hanabi");

    const bridgeRoute = RPG_WORLD_ROUTES.find(
      ({ id }) => id === "sakura-bridge-route"
    )!;
    expect(RPG_WORLD_BRIDGE.polygon).toBe(bridgeRoute.polygon);
    expect(
      RPG_WORLD_ARRIVALS.find(({ id }) => id === "hanabi-arrival")!.position
    ).toEqual([26, 0, -18]);
    expect(
      RPG_WORLD_ZONES.find(({ id }) => id === "hanabi")!.cameraAnchor
    ).toEqual([26, -18]);
  });

  it("uses one polygon for logical and displayed zone ownership", () => {
    for (const zone of RPG_WORLD_ZONES) {
      expect(zone.displayPolygon, zone.id).toBe(zone.polygon);
    }
  });

  it("derives every route renderable from its canonical route geometry", () => {
    expect(RPG_WORLD_MODEL.sceneSurfaces).toBe(RPG_WORLD_SCENE_SURFACES);
    for (const route of RPG_WORLD_ROUTES) {
      const renderable = [
        ...RPG_WORLD_SCENE_SURFACES,
        ...RPG_WORLD_SCENE_LANDMARKS
      ].find(({ id }) => id === route.renderableId)!;
      expect(renderable, route.id).toBeDefined();
      expect(renderable.sourceRouteId, route.id).toBe(route.id);
      const xs = route.polygon.map(([x]) => x);
      const zs = route.polygon.map(([, z]) => z);
      expect(renderable.position[0], route.id).toBeCloseTo(
        (Math.min(...xs) + Math.max(...xs)) / 2,
        10
      );
      expect(renderable.position[2], route.id).toBeCloseTo(
        (Math.min(...zs) + Math.max(...zs)) / 2,
        10
      );
      expect(renderable.size[0], route.id).toBeCloseTo(
        Math.max(...xs) - Math.min(...xs),
        10
      );
      expect(renderable.size[2], route.id).toBeCloseTo(
        Math.max(...zs) - Math.min(...zs),
        10
      );
    }
  });

  it("keeps canonical IDs unique and renderer-independent", () => {
    const ids = [
      ...RPG_WORLD_LANDMARKS.map(({ id }) => id),
      ...RPG_WORLD_MODEL.routes.map(({ id }) => id)
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(RPG_WORLD_ARRIVALS.map(({ zoneId }) => zoneId))).toEqual(new Set(RPG_WORLD_ZONE_IDS));
    expect(JSON.stringify(RPG_WORLD_MODEL)).not.toMatch(/react|three|svg/i);
  });

  it("owns the five approved arrival foot targets and their projection tolerance", () => {
    expect(RPG_REFERENCE_MAP_GOLDEN.nodes).toEqual({
      airport: [430, 600],
      tokyo: [760, 455],
      gyukatsu: [1035, 610],
      sakura: [1260, 595],
      hanabi: [1570, 640]
    });
    expect(RPG_REFERENCE_ARRIVAL_ANCHORS).toHaveLength(RPG_WORLD_ARRIVALS.length);
    for (const arrival of RPG_WORLD_ARRIVALS) {
      expect(arrival.approvedReferenceFoot.pixel).toEqual(
        RPG_REFERENCE_MAP_GOLDEN.nodes[arrival.zoneId]
      );
      expect(arrival.approvedReferenceFoot.maximumProjectionErrorPixels).toBe(0.5);
      expect(arrival.approvedReferenceFoot.spriteHeightRangePixels[1])
        .toBeGreaterThan(arrival.approvedReferenceFoot.spriteHeightRangePixels[0]);
      const anchor = RPG_REFERENCE_ARRIVAL_ANCHORS.find(
        ({ sourceId }) => sourceId === arrival.id
      )!;
      expect(anchor.role).toBe("arrival");
      expect(anchor.worldXZ).toEqual([arrival.position[0], arrival.position[2]]);
      expect(anchor.referencePixel).toBe(arrival.approvedReferenceFoot.pixel);
    }
  });

  it("keeps the approved image size and independently measured zone golden values", () => {
    const image = readFileSync(
      resolve(process.cwd(), "public/assets/world/world-environment-concept.png")
    );
    expect(image.subarray(1, 4).toString()).toBe("PNG");
    expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual(
      RPG_REFERENCE_REGISTRATION_GOLDEN.imageSize
    );
    expect(RPG_REFERENCE_CALIBRATION_INPUT.imageSize).toEqual(
      RPG_REFERENCE_REGISTRATION_GOLDEN.imageSize
    );

    for (const zoneId of RPG_WORLD_ZONE_IDS) {
      const measured = RPG_REFERENCE_ZONE_ANCHORS[zoneId];
      const golden = RPG_REFERENCE_REGISTRATION_GOLDEN.zones[zoneId];
      expect(measured.sourceId).toBe(golden.sourceId);
      measured.referencePixel.forEach((coordinate, index) => {
        expect(Math.abs(coordinate - golden.referencePixel[index])).toBeLessThanOrEqual(1);
      });
      expect(measured.spriteScale).toBe(golden.spriteScale);
      expect(measured.depthKey).toBe(golden.depthKey);
      for (const edge of ["minimumX", "maximumX", "minimumY", "maximumY"] as const) {
        expect(
          Math.abs(measured.protectedRectangle[edge] - golden.protectedRectangle[edge])
        ).toBeLessThanOrEqual(1);
        expect(
          Math.abs(
            measured.cameraFocusRectangle[edge] -
              golden.cameraFocusRectangle[edge]
          )
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  it("shares canonical recognizable protected rectangles by object identity", () => {
    const existingIds = new Set([
      ...RPG_WORLD_SCENE_SURFACES.map(({ id }) => id),
      ...RPG_WORLD_SCENE_LANDMARKS.map(({ id }) => id)
    ]);

    for (const rectangle of Object.values(RPG_REFERENCE_PROTECTED_RECTANGLES)) {
      expect(existingIds.has(rectangle.sourceId), rectangle.sourceId).toBe(true);
      expect(rectangle.maximumX - rectangle.minimumX, rectangle.sourceId).toBeGreaterThanOrEqual(132);
      expect(rectangle.maximumY - rectangle.minimumY, rectangle.sourceId).toBeGreaterThanOrEqual(132);
      expect(rectangle.measuredFeature, rectangle.sourceId).toBeTruthy();
    }
    for (const rectangle of Object.values(RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES)) {
      expect(existingIds.has(rectangle.sourceId), rectangle.sourceId).toBe(true);
      expect(rectangle.maximumX - rectangle.minimumX, rectangle.sourceId)
        .toBeLessThanOrEqual(300);
      expect(rectangle.maximumY - rectangle.minimumY, rectangle.sourceId)
        .toBeLessThanOrEqual(350);
      expect(rectangle.measuredFeature, rectangle.sourceId).toContain(
        "camera focus"
      );
    }
    for (const rectangle of Object.values(RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES)) {
      expect(existingIds.has(rectangle.sourceId), rectangle.sourceId).toBe(true);
      expect(rectangle.maximumX - rectangle.minimumX, rectangle.sourceId).toBeGreaterThanOrEqual(132);
      expect(rectangle.maximumY - rectangle.minimumY, rectangle.sourceId).toBeGreaterThanOrEqual(132);
      expect(rectangle.measuredFeature, rectangle.sourceId).toBeTruthy();
    }

    for (const zone of RPG_WORLD_ZONES) {
      expect(zone.protectedLandmarkRectangle).toBe(
        RPG_REFERENCE_PROTECTED_RECTANGLES[zone.primaryLandmarkId as keyof typeof RPG_REFERENCE_PROTECTED_RECTANGLES]
      );
      expect(RPG_REFERENCE_ZONE_ANCHORS[zone.id].protectedRectangle).toBe(
        zone.protectedLandmarkRectangle
      );
      expect(zone.cameraFocusRectangle).toBe(
        RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES[
          zone.primaryLandmarkId as keyof typeof RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES
        ]
      );
      expect(RPG_REFERENCE_ZONE_ANCHORS[zone.id].cameraFocusRectangle).toBe(
        zone.cameraFocusRectangle
      );
    }

    for (const goldenPair of RPG_REFERENCE_REGISTRATION_GOLDEN.transitionPairs) {
      const pair = RPG_TRANSITION_PROTECTED_PAIRS.find(
        ({ transitionId }) => transitionId === goldenPair.transitionId
      )!;
      expect(pair.fromRectangle).toBe(
        RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES[goldenPair.fromRectangleKey]
      );
      expect(pair.toRectangle).toBe(
        RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES[goldenPair.toRectangleKey]
      );
    }
  });

  it("fits each measured camera focus inside the approved mobile source crop", () => {
    const expected = {
      airport: {
        crop: { x: 305, y: 138, width: 300, height: 600 },
        focus: { minimumX: 325, maximumX: 605, minimumY: 300, maximumY: 650 }
      },
      tokyo: {
        crop: { x: 610, y: 0, width: 300, height: 600 },
        focus: { minimumX: 630, maximumX: 900, minimumY: 250, maximumY: 580 }
      },
      gyukatsu: {
        crop: { x: 885, y: 121, width: 300, height: 600 },
        focus: { minimumX: 900, maximumX: 1170, minimumY: 350, maximumY: 680 }
      },
      sakura: {
        crop: { x: 1110, y: 106, width: 300, height: 600 },
        focus: { minimumX: 1150, maximumX: 1410, minimumY: 330, maximumY: 650 }
      },
      hanabi: {
        crop: { x: 1420, y: 178, width: 300, height: 600 },
        focus: { minimumX: 1455, maximumX: 1720, minimumY: 300, maximumY: 590 }
      }
    } as const;

    for (const zoneId of RPG_WORLD_ZONE_IDS) {
      const { crop, focus } = expected[zoneId];
      const measured = RPG_REFERENCE_ZONE_ANCHORS[zoneId].cameraFocusRectangle;
      expect(measured, zoneId).toMatchObject(focus);
      expect(measured.minimumX, `${zoneId}:left`).toBeGreaterThanOrEqual(crop.x);
      expect(measured.maximumX, `${zoneId}:right`)
        .toBeLessThanOrEqual(crop.x + crop.width);
      expect(measured.minimumY, `${zoneId}:top`).toBeGreaterThanOrEqual(crop.y);
      expect(measured.maximumY, `${zoneId}:bottom`)
        .toBeLessThanOrEqual(crop.y + crop.height);
    }
  });

  it("uses the five explicit static transition protection pairs", () => {
    const expected = [
      ["airport-to-tokyo", "airport-coastal-apron", "tokyo-neighborhood-paving"],
      ["airport-to-gyukatsu", "airport-bus-plaza", "gyukatsu-stone-plaza"],
      ["tokyo-to-gyukatsu", "district-volume-tokyo-east-tower", "gyukatsu-teahouse-machiya"],
      ["gyukatsu-to-sakura", "gyukatsu-stone-plaza", "sakura-riverside-garden"],
      ["sakura-to-hanabi", "sakura-bridge", "hanabi-festival-plaza"]
    ];
    expect(
      RPG_TRANSITION_PROTECTED_PAIRS.map(({ transitionId, fromId, toId }) => [
        transitionId,
        fromId,
        toId
      ])
    ).toEqual(expected);

    for (const pair of RPG_TRANSITION_PROTECTED_PAIRS) {
      const transition = RPG_WORLD_TRANSITIONS.find(({ id }) => id === pair.transitionId)!;
      expect(transition.fromProtectedLandmarkId).toBe(pair.fromId);
      expect(transition.toProtectedLandmarkId).toBe(pair.toId);
    }
  });

  it("derives every measured calibration world control from an existing feature", () => {
    const sourceKinds = new Set(
      RPG_REFERENCE_CALIBRATION_CONTROLS.flatMap(({ source }) =>
        source ? [source.kind] : []
      )
    );
    expect(sourceKinds).toEqual(
      new Set([
        "landmark",
        "route-vertex",
        "transition-centerline",
        "coastline-vertex",
        "canal-vertex",
        "bridge-vertex"
      ])
    );

    for (const control of RPG_REFERENCE_CALIBRATION_CONTROLS) {
      if (control.source) {
        expect(control.worldXZ, control.id).toEqual(
          getReferenceCalibrationSourceWorldXZ(control.source)
        );
      } else {
        expect(
          [
            "arrival-affine-control",
            "spawn-control",
            "route-control",
            "mesh-steiner"
          ],
          control.id
        ).toContain(control.measurementRole);
      }
    }

    const controlIds = new Set(RPG_REFERENCE_CALIBRATION_CONTROLS.map(({ id }) => id));
    for (const triangle of RPG_REFERENCE_CALIBRATION_INPUT.triangles) {
      expect(triangle.controlPointIds.every((id) => controlIds.has(id)), triangle.id).toBe(true);
    }
    expect(RPG_REFERENCE_CALIBRATION_INPUT.nonAffine).toBe(true);
    expect(new Set(RPG_REFERENCE_CALIBRATION_CONTROLS.map(({ referencePixel }) => referencePixel[1])).size).toBeGreaterThan(3);

    for (const expected of [
      {
        id: "calibration-sakura-road-west",
        source: { kind: "route-vertex", id: "sakura-festival-road", vertexIndex: 0 },
        worldXZ: [-12, -20],
        referencePixel: [1010, 650],
        spriteScale: 1.12,
        depthKey: 0.76
      },
      {
        id: "calibration-bridge-west-end",
        source: { kind: "bridge-vertex", id: "sakura-bridge", vertexIndex: 0 },
        worldXZ: [14.3, -18],
        referencePixel: [1370, 640],
        spriteScale: 1.13,
        depthKey: 0.8
      }
    ] as const) {
      expect(
        RPG_REFERENCE_CALIBRATION_CONTROLS.find(({ id }) => id === expected.id)
      ).toMatchObject(expected);
    }
    expect(
      RPG_REFERENCE_CALIBRATION_CONTROLS.some(
        ({ source }) => source?.kind === "scene-surface"
      )
    ).toBe(false);
  });

  it("triangulates the exact world domain without gaps overlaps or foldover", () => {
    const controls = new Map(
      RPG_REFERENCE_CALIBRATION_CONTROLS.map((control) => [control.id, control])
    );
    const triangles = RPG_REFERENCE_CALIBRATION_INPUT.triangles.map((triangle) => ({
      ...triangle,
      world: triangle.controlPointIds.map((id) => controls.get(id)!.worldXZ) as unknown as readonly [Point2, Point2, Point2],
      reference: triangle.controlPointIds.map((id) => controls.get(id)!.referencePixel) as unknown as readonly [Point2, Point2, Point2]
    }));
    const usedControlIds = new Set(
      triangles.flatMap(({ controlPointIds }) => [...controlPointIds])
    );
    expect(usedControlIds).toEqual(new Set(controls.keys()));

    const worldAreas = triangles.map(({ world }) => signedTriangleArea(world));
    const referenceAreas = triangles.map(({ reference }) => signedTriangleArea(reference));
    expect(worldAreas.every((area) => area > 0)).toBe(true);
    expect(referenceAreas.every((area) => area < 0)).toBe(true);
    expect(worldAreas.reduce((sum, area) => sum + area, 0)).toBeCloseTo(
      (RPG_WORLD_BOUNDS.maximumX - RPG_WORLD_BOUNDS.minimumX) *
        (RPG_WORLD_BOUNDS.maximumZ - RPG_WORLD_BOUNDS.minimumZ),
      10
    );

    const edgeCounts = new Map<string, { count: number; points: readonly [Point2, Point2] }>();
    for (const triangle of triangles) {
      triangle.controlPointIds.forEach((startId, index) => {
        const endId = triangle.controlPointIds[(index + 1) % 3];
        const key = [startId, endId].sort().join("|");
        const existing = edgeCounts.get(key);
        edgeCounts.set(key, {
          count: (existing?.count ?? 0) + 1,
          points: [controls.get(startId)!.worldXZ, controls.get(endId)!.worldXZ]
        });
      });
    }
    const boundaryEdges = [...edgeCounts.values()].filter(({ count }) => count === 1);
    expect([...edgeCounts.values()].every(({ count }) => count === 1 || count === 2)).toBe(true);
    let boundaryLength = 0;
    for (const { points: [start, end] } of boundaryEdges) {
      const onVerticalBoundary =
        start[0] === end[0] &&
        (start[0] === RPG_WORLD_BOUNDS.minimumX || start[0] === RPG_WORLD_BOUNDS.maximumX);
      const onHorizontalBoundary =
        start[1] === end[1] &&
        (start[1] === RPG_WORLD_BOUNDS.minimumZ || start[1] === RPG_WORLD_BOUNDS.maximumZ);
      expect(onVerticalBoundary || onHorizontalBoundary).toBe(true);
      boundaryLength += Math.hypot(end[0] - start[0], end[1] - start[1]);
    }
    expect(boundaryLength).toBeCloseTo(288, 10);

    for (let first = 0; first < triangles.length; first += 1) {
      for (let second = first + 1; second < triangles.length; second += 1) {
        expect(
          polygonArea(clipConvexPolygon(triangles[first].world, triangles[second].world)),
          `world:${triangles[first].id}:${triangles[second].id}`
        ).toBeLessThanOrEqual(1e-7);
        expect(
          polygonArea(
            clipConvexPolygon(triangles[first].reference, triangles[second].reference)
          ),
          `reference:${triangles[first].id}:${triangles[second].id}`
        ).toBeLessThanOrEqual(1e-7);
      }
    }

    const coveredPoints = [
      ...RPG_REFERENCE_REGISTRATION.controlPoints.map(({ worldXZ }) => worldXZ),
      ...RPG_WORLD_CELLS.map(({ polygon }) => [
        polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length,
        polygon.reduce((sum, [, z]) => sum + z, 0) / polygon.length
      ] as const)
    ];
    for (const point of coveredPoints) {
      expect(
        triangles.some(({ world }) => triangleContainsPoint(world, point)),
        `uncovered:${point[0]},${point[1]}`
      ).toBe(true);
    }
  });

  it("matches every calibration control and transition measurement to the independent golden", () => {
    const measuredControls = [
      ...RPG_REFERENCE_CALIBRATION_CONTROLS.filter(
        ({ source }) => source !== undefined
      ),
      ...RPG_REFERENCE_CALIBRATION_OBSERVATIONS
    ];
    expect(RPG_REFERENCE_REGISTRATION_GOLDEN.calibrationControls).toHaveLength(
      measuredControls.length
    );
    expect(new Set(measuredControls.map(({ id }) => id))).toEqual(
      new Set(RPG_REFERENCE_REGISTRATION_GOLDEN.calibrationControls.map(({ id }) => id))
    );
    for (const golden of RPG_REFERENCE_REGISTRATION_GOLDEN.calibrationControls) {
      const measured = measuredControls.find(({ id }) => id === golden.id)!;
      expect(measured, golden.id).toBeDefined();
      measured.referencePixel.forEach((coordinate, index) => {
        expect(Math.abs(coordinate - golden.referencePixel[index]), golden.id).toBeLessThanOrEqual(1);
      });
      expect(measured.spriteScale, golden.id).toBeCloseTo(golden.spriteScale, 12);
      expect(measured.depthKey, golden.id).toBeCloseTo(golden.depthKey, 12);
      expect(measured.measurementRole, golden.id).toBe(golden.measurementRole);
    }
    expect(
      RPG_REFERENCE_CALIBRATION_CONTROLS.some(({ id }) =>
        [
          "calibration-airport-arrival",
          "calibration-hanabi-arrival-paving"
        ].includes(id)
      )
    ).toBe(false);
    expect(
      RPG_REFERENCE_CALIBRATION_CONTROLS.some(
        ({ id }) => id === "calibration-airport-bus-base"
      )
    ).toBe(false);

    expect(Object.keys(RPG_REFERENCE_REGISTRATION_GOLDEN.transitionProtectedRectangles)).toEqual(
      Object.keys(RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES)
    );
    for (const key of Object.keys(
      RPG_REFERENCE_REGISTRATION_GOLDEN.transitionProtectedRectangles
    ) as (keyof typeof RPG_REFERENCE_REGISTRATION_GOLDEN.transitionProtectedRectangles)[]) {
      const golden = RPG_REFERENCE_REGISTRATION_GOLDEN.transitionProtectedRectangles[key];
      const measured = RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES[key];
      expect(measured.sourceId, key).toBe(golden.sourceId);
      for (const edge of ["minimumX", "maximumX", "minimumY", "maximumY"] as const) {
        expect(Math.abs(measured[edge] - golden[edge]), key).toBeLessThanOrEqual(1);
      }
    }

    expect(
      RPG_TRANSITION_PROTECTED_PAIRS.map(({ transitionId, fromId, toId }) => ({
        transitionId,
        fromId,
        toId
      }))
    ).toEqual(
      RPG_REFERENCE_REGISTRATION_GOLDEN.transitionPairs.map(
        ({ transitionId, fromId, toId }) => ({ transitionId, fromId, toId })
      )
    );
  });

  it("keeps arrival and synthetic depth evidence input-only and surface-backed", () => {
    const annotations =
      RPG_REFERENCE_REGISTRATION_GOLDEN.arrivalTraversableSurfaceAnnotations;
    expect(Object.keys(annotations)).toEqual(RPG_WORLD_ZONE_IDS);

    for (const zoneId of RPG_WORLD_ZONE_IDS) {
      const annotation = annotations[zoneId];
      expect(Object.keys(annotation)).toEqual([
        "arrivalId",
        "zoneId",
        "surfaceId",
        "sourceRouteId",
        "approvedImageRectangle"
      ]);
      expect(annotation.zoneId).toBe(zoneId);
      const zone = RPG_WORLD_ZONES.find(({ id }) => id === zoneId)!;
      const arrival = RPG_WORLD_ARRIVALS.find(({ id }) => id === annotation.arrivalId)!;
      const surface = RPG_WORLD_SCENE_SURFACES.find(({ id }) => id === annotation.surfaceId)!;
      const route = RPG_WORLD_ROUTES.find(({ id }) => id === annotation.sourceRouteId)!;
      expect(arrival, zoneId).toBeDefined();
      expect(arrival.zoneId, zoneId).toBe(zoneId);
      expect(zone.arrivalId, zoneId).toBe(arrival.id);
      expect(surface, annotation.surfaceId).toBeDefined();
      expect(surface.sourceRouteId, annotation.surfaceId).toBe(annotation.sourceRouteId);
      expect(route, annotation.sourceRouteId).toBeDefined();
      expect(route.renderableId, annotation.sourceRouteId).toBe(annotation.surfaceId);

      const arrivalWorldXZ = [arrival.position[0], arrival.position[2]] as const;
      expect(axisAlignedRectangleContainsPoint(zone.polygon, arrivalWorldXZ), zoneId).toBe(true);
      expect(axisAlignedRectangleContainsPoint(route.polygon, arrivalWorldXZ), zoneId).toBe(true);
      expect(isWalkable(arrivalWorldXZ), zoneId).toBe(true);
      const projection = projectWorldToReference(arrivalWorldXZ);
      expect(projection, zoneId).not.toBeNull();

      const rectangle = annotation.approvedImageRectangle;
      expect(rectangle.minimumX, zoneId).toBeGreaterThanOrEqual(0);
      expect(rectangle.maximumX, zoneId).toBeLessThanOrEqual(
        RPG_REFERENCE_REGISTRATION_GOLDEN.imageSize[0]
      );
      expect(rectangle.minimumY, zoneId).toBeGreaterThanOrEqual(0);
      expect(rectangle.maximumY, zoneId).toBeLessThanOrEqual(
        RPG_REFERENCE_REGISTRATION_GOLDEN.imageSize[1]
      );
      const annotationInsets = [
        projection!.pixel[0] - rectangle.minimumX,
        rectangle.maximumX - projection!.pixel[0],
        projection!.pixel[1] - rectangle.minimumY,
        rectangle.maximumY - projection!.pixel[1]
      ];
      expect(Math.min(...annotationInsets), zoneId).toBeGreaterThanOrEqual(32);
      expect(annotation, zoneId).not.toHaveProperty("referencePixel");
      expect(annotation, zoneId).not.toHaveProperty("spriteScale");
      expect(annotation, zoneId).not.toHaveProperty("depthKey");
    }

    const pairs = RPG_REFERENCE_REGISTRATION_GOLDEN.depthPairs;
    const minimumGaps = RPG_REFERENCE_REGISTRATION_GOLDEN.depthPairMinimumGaps;
    expect(Object.keys(pairs)).toEqual(["airport", "center", "east"]);
    expect(minimumGaps).toEqual({ pixelY: 16, spriteScale: 0.04, depthKey: 0.04 });

    for (const [pairId, pair] of Object.entries(pairs)) {
      expect(Object.keys(pair), pairId).toEqual([
        "zoneId",
        "surfaceId",
        "farWorldXZ",
        "nearWorldXZ"
      ]);
      expect(pair, pairId).not.toHaveProperty("referencePixel");
      expect(pair, pairId).not.toHaveProperty("pixel");
      expect(pair, pairId).not.toHaveProperty("spriteScale");
      expect(pair, pairId).not.toHaveProperty("depthKey");
      expect(pair.nearWorldXZ[1], pairId).toBeLessThan(pair.farWorldXZ[1]);

      const annotation = Object.values(annotations).find(
        ({ zoneId, surfaceId }) => zoneId === pair.zoneId && surfaceId === pair.surfaceId
      )!;
      expect(annotation, pairId).toBeDefined();
      const zone = RPG_WORLD_ZONES.find(({ id }) => id === pair.zoneId)!;
      const surface = RPG_WORLD_SCENE_SURFACES.find(({ id }) => id === pair.surfaceId)!;
      const route = RPG_WORLD_ROUTES.find(({ id }) => id === annotation.sourceRouteId)!;
      expect(surface.sourceRouteId, pairId).toBe(route.id);
      expect(route.renderableId, pairId).toBe(pair.surfaceId);

      for (const point of [pair.farWorldXZ, pair.nearWorldXZ]) {
        expect(axisAlignedRectangleContainsPoint(zone.polygon, point), pairId).toBe(true);
        expect(axisAlignedRectangleContainsPoint(route.polygon, point), pairId).toBe(true);
        expect(isWalkable(point), pairId).toBe(true);
        expect(projectWorldToReference(point), pairId).not.toBeNull();
      }

      const far = projectWorldToReference(pair.farWorldXZ)!;
      const near = projectWorldToReference(pair.nearWorldXZ)!;
      expect(near.pixel[1] - far.pixel[1], `${pairId}:pixelY`).toBeGreaterThanOrEqual(
        minimumGaps.pixelY
      );
      expect(
        [far.spriteScale, near.spriteScale].every(
          (spriteScale) => Number.isFinite(spriteScale) && spriteScale > 0
        ),
        `${pairId}:spriteScale`
      ).toBe(true);
      expect(near.depthKey - far.depthKey, `${pairId}:depthKey`).toBeGreaterThanOrEqual(
        minimumGaps.depthKey
      );
    }
  });

  it("keeps every projected transition sample inside a feasible camera crop", () => {
    const imageWidth = 1817;
    const controls = new Map(
      RPG_REFERENCE_CALIBRATION_CONTROLS.map((control) => [control.id, control])
    );
    const projectToReference = (point: Point2) => {
      for (const triangle of RPG_REFERENCE_CALIBRATION_INPUT.triangles) {
        const [first, second, third] = triangle.controlPointIds.map((id) => controls.get(id)!);
        const area = signedTriangleArea([
          first.worldXZ,
          second.worldXZ,
          third.worldXZ
        ]);
        const weights = [
          signedTriangleArea([point, second.worldXZ, third.worldXZ]) / area,
          signedTriangleArea([first.worldXZ, point, third.worldXZ]) / area,
          signedTriangleArea([first.worldXZ, second.worldXZ, point]) / area
        ];
        if (weights.every((weight) => weight >= -1e-8)) {
          return [
            weights[0] * first.referencePixel[0] +
              weights[1] * second.referencePixel[0] +
              weights[2] * third.referencePixel[0],
            weights[0] * first.referencePixel[1] +
              weights[1] * second.referencePixel[1] +
              weights[2] * third.referencePixel[1]
          ] as const;
        }
      }
      throw new Error(`Calibration domain gap at ${point[0]},${point[1]}`);
    };
    const transitionProgress = (
      [[startX, startZ], [endX, endZ]]: readonly [Point2, Point2],
      [x, z]: Point2
    ) => {
      const deltaX = endX - startX;
      const deltaZ = endZ - startZ;
      return Math.min(
        1,
        Math.max(
          0,
          ((x - startX) * deltaX + (z - startZ) * deltaZ) /
            (deltaX * deltaX + deltaZ * deltaZ)
        )
      );
    };
    const viewportProfiles = {
      desktop: { viewportWidth: 1440, backdropScale: 900 / 866 },
      mobile: { viewportWidth: 390, backdropScale: 420 / 866 }
    } as const;
    expect(viewportProfiles.mobile.viewportWidth / viewportProfiles.mobile.backdropScale).toBeCloseTo(
      804.142857,
      6
    );

    for (const [profile, viewport] of Object.entries(viewportProfiles)) {
      const sourceWindowWidth = viewport.viewportWidth / viewport.backdropScale;
      const playerMarginInSourcePixels = 32 / viewport.backdropScale;
      const minimumCropHeadroomInSourcePixels = 4 / viewport.backdropScale;
      const clampMaximum = imageWidth - sourceWindowWidth;
      const expectFeasibleCrop = (
        label: string,
        point: Point2,
        protectedRectangles: readonly {
          readonly minimumX: number;
          readonly maximumX: number;
        }[]
      ) => {
        const [playerReferenceX] = projectToReference(point);
        const minimumCropLeft = Math.max(
          0,
          playerReferenceX + playerMarginInSourcePixels - sourceWindowWidth,
          ...protectedRectangles.map(({ maximumX }) => maximumX - sourceWindowWidth)
        );
        const maximumCropLeft = Math.min(
          clampMaximum,
          playerReferenceX - playerMarginInSourcePixels,
          ...protectedRectangles.map(({ minimumX }) => minimumX)
        );
        expect(
          maximumCropLeft - minimumCropLeft,
          `${profile}:${label}`
        ).toBeGreaterThanOrEqual(minimumCropHeadroomInSourcePixels);
      };
      for (const transition of RPG_WORLD_TRANSITIONS) {
        const pair = RPG_TRANSITION_PROTECTED_PAIRS.find(
          ({ transitionId }) => transitionId === transition.id
        )!;
        const polygonCentroid = [
          transition.polygon.reduce((sum, [x]) => sum + x, 0) / transition.polygon.length,
          transition.polygon.reduce((sum, [, z]) => sum + z, 0) / transition.polygon.length
        ] as const;
        const requiredSamples = [
          ...transition.polygon.map((point, index) => ({ label: `vertex-${index}`, point })),
          ...transition.polygon.map((point, index) => {
            const next = transition.polygon[(index + 1) % transition.polygon.length];
            return {
              label: `edge-midpoint-${index}`,
              point: [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as const
            };
          }),
          { label: "centroid", point: polygonCentroid },
          ...Array.from({ length: 21 }, (_, index) => {
            const progress = index / 20;
            const [start, end] = transition.centerline;
            return {
              label: `centerline-${progress.toFixed(2)}`,
              point: [
                start[0] + (end[0] - start[0]) * progress,
                start[1] + (end[1] - start[1]) * progress
              ] as const
            };
          })
        ];

        for (const sample of requiredSamples) {
          const progress = transitionProgress(transition.centerline, sample.point);
          const protectedRectangles =
            progress < 0.4
              ? [pair.fromRectangle]
              : progress <= 0.6
                ? [pair.fromRectangle, pair.toRectangle]
                : [pair.toRectangle];
          expectFeasibleCrop(
            `${transition.id}:${sample.label}:progress=${progress}`,
            sample.point,
            protectedRectangles
          );
        }
      }

      for (const route of RPG_WORLD_ROUTES) {
        const centroid = [
          route.polygon.reduce((sum, [x]) => sum + x, 0) / route.polygon.length,
          route.polygon.reduce((sum, [, z]) => sum + z, 0) / route.polygon.length
        ] as const;
        const routeSamples = [
          ...route.polygon.map((point, index) => ({ label: `vertex-${index}`, point })),
          ...route.polygon.map((point, index) => {
            const next = route.polygon[(index + 1) % route.polygon.length];
            return {
              label: `edge-midpoint-${index}`,
              point: [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as const
            };
          }),
          { label: "centroid", point: centroid }
        ];
        for (const sample of routeSamples) {
          expectFeasibleCrop(`${route.id}:${sample.label}`, sample.point, []);
        }
      }
    }
  });

  it("keeps the independent golden fixture and self-goldens out of runtime", () => {
    const runtimeSource = readFileSync(
      resolve(process.cwd(), "app/world/RpgWorldModel.ts"),
      "utf8"
    );
    expect(runtimeSource).not.toContain("rpg-reference-registration-golden");
    expect(runtimeSource).not.toContain("ReferenceGoldenSample");
    expect(runtimeSource).not.toContain("RPG_REFERENCE_GOLDEN_SAMPLES");
  });

  it("derives atomic topology from every canonical route and transition cut", () => {
    expect(RPG_WORLD_ZONES).toHaveLength(5);
    expect(RPG_WORLD_ROUTES).toHaveLength(8);
    expect(RPG_WORLD_TRANSITIONS).toHaveLength(5);
    expect(RPG_WORLD_ATOMIC_CELLS.length).toBeGreaterThan(RPG_WORLD_CELLS.length);
    expect(RPG_WORLD_CELLS.length).toBeGreaterThan(0);
    for (const route of RPG_WORLD_ROUTES) {
      for (const [x, z] of route.polygon) {
        expect(RPG_WORLD_TOPOLOGY_X, `${route.id}:x=${x}`).toContain(x);
        expect(RPG_WORLD_TOPOLOGY_Z, `${route.id}:z=${z}`).toContain(z);
      }
    }
    for (const transition of RPG_WORLD_TRANSITIONS) {
      for (const [x, z] of transition.polygon) {
        expect(RPG_WORLD_TOPOLOGY_X, `${transition.id}:x=${x}`).toContain(x);
        expect(RPG_WORLD_TOPOLOGY_Z, `${transition.id}:z=${z}`).toContain(z);
      }
      for (const progress of transition.dualProtectionRange) {
        const [start, end] = transition.centerline;
        const cut = [
          start[0] + (end[0] - start[0]) * progress,
          start[1] + (end[1] - start[1]) * progress
        ] as const;
        expect(RPG_WORLD_TOPOLOGY_X, `${transition.id}:${progress}:x`).toContain(
          cut[0]
        );
        expect(RPG_WORLD_TOPOLOGY_Z, `${transition.id}:${progress}:z`).toContain(
          cut[1]
        );
      }
    }
    expect(
      RPG_WORLD_CELLS.every(
        ({ kind }) => kind === "zone" || kind === "transition"
      )
    ).toBe(true);
    expect(RPG_WORLD_MODEL.coastline).toBe(RPG_WORLD_COASTLINE);
    expect(RPG_WORLD_MODEL.canal).toBe(RPG_WORLD_CANAL);
    expect(RPG_WORLD_MODEL.bridge).toBe(RPG_WORLD_BRIDGE);
  });
});
