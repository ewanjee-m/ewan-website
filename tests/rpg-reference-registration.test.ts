import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RPG_PLAYER_PROFILE_SAFE_RECTANGLES,
  calculateRpgReferenceCameraPlacement
} from "../app/world/RpgCameraPlacement";
import {
  RPG_RUNTIME_REFERENCE_REGISTRATION,
  getZoneAt,
  isWalkable,
  getCollisionShapes,
  projectWorldToReference,
  projectWorldToReferenceInTriangle,
  referenceToScene,
  sceneToWorld,
  validateCellEdgeConformity,
  validateWorldTopology
} from "../app/world/RpgWorldGeometry";
import {
  RPG_REFERENCE_CALIBRATION_INPUT,
  RPG_REFERENCE_CALIBRATION_OBSERVATIONS,
  RPG_REFERENCE_ARRIVAL_ANCHORS,
  RPG_REFERENCE_LANDMARK_ANCHORS,
  RPG_REFERENCE_REGISTRATION,
  RPG_REFERENCE_ROUTE_CONTROL_IDS,
  RPG_REFERENCE_ZONE_ANCHORS,
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_ATOMIC_CELLS,
  RPG_WORLD_CELLS,
  RPG_WORLD_LANDMARKS,
  RPG_WORLD_ROUTES,
  RPG_WORLD_SCENE_SURFACES,
  RPG_WORLD_SPAWN,
  RPG_WORLD_ZONES,
  type WorldPoint2
} from "../app/world/RpgWorldModel";
import { RPG_REFERENCE_MAP_TRANSITIONS } from "../app/world/RpgMiniMapProjection";
import {
  RPG_REFERENCE_MAP_GOLDEN,
  RPG_REFERENCE_REGISTRATION_GOLDEN
} from "./fixtures/rpg-reference-registration-golden";

const signedArea = (a: WorldPoint2, b: WorldPoint2, c: WorldPoint2) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

const triangleCentroid = (
  [first, second, third]: readonly [WorldPoint2, WorldPoint2, WorldPoint2]
): WorldPoint2 => [
  (first[0] + second[0] + third[0]) / 3,
  (first[1] + second[1] + third[1]) / 3
];

const barycentric = (
  point: WorldPoint2,
  [first, second, third]: readonly [WorldPoint2, WorldPoint2, WorldPoint2]
) => {
  const area = signedArea(first, second, third);
  const w0 = signedArea(point, second, third) / area;
  const w1 = signedArea(first, point, third) / area;
  return [w0, w1, 1 - w0 - w1] as const;
};

const strictlyContains = (
  triangle: readonly [WorldPoint2, WorldPoint2, WorldPoint2],
  point: WorldPoint2
) => {
  const weights = barycentric(point, triangle);
  return weights.every((weight) => weight > 1e-8 && weight < 1 - 1e-8);
};

const properSegmentsIntersect = (
  firstStart: WorldPoint2,
  firstEnd: WorldPoint2,
  secondStart: WorldPoint2,
  secondEnd: WorldPoint2
) =>
  signedArea(firstStart, firstEnd, secondStart) *
    signedArea(firstStart, firstEnd, secondEnd) < -1e-8 &&
  signedArea(secondStart, secondEnd, firstStart) *
    signedArea(secondStart, secondEnd, firstEnd) < -1e-8;

const cyclicallyEqualsReversed = (
  worldOrder: readonly string[],
  referenceOrder: readonly string[]
) => {
  if (worldOrder.length !== referenceOrder.length) return false;
  if (worldOrder.length <= 2) return true;
  return referenceOrder.some((_, offset) =>
    worldOrder.every(
      (id, index) =>
        id ===
        referenceOrder[
          (offset - index + referenceOrder.length) % referenceOrder.length
        ]
    )
  );
};

const runtimeControlById = new Map(
  RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints.map((control) => [control.id, control])
);
const atomicControlById = new Map(
  RPG_REFERENCE_REGISTRATION.controlPoints.map((control) => [control.id, control])
);
const atomicTriangleById = new Map(
  RPG_REFERENCE_REGISTRATION.triangles.map((triangle) => [triangle.id, triangle])
);
const calibrationControlById = new Map(
  RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.map((control) => [control.id, control])
);
const calibrationTriangleById = new Map(
  RPG_REFERENCE_CALIBRATION_INPUT.triangles.map((triangle) => [triangle.id, triangle])
);

const runtimeWorldPoints = (controlPointIds: readonly [string, string, string]) =>
  controlPointIds.map((id) => runtimeControlById.get(id)!.worldXZ) as unknown as readonly [
    WorldPoint2,
    WorldPoint2,
    WorldPoint2
  ];

const directCalibrationProjection = (triangleId: string, point: WorldPoint2) => {
  const triangle = calibrationTriangleById.get(triangleId)!;
  const controls = triangle.controlPointIds.map((id) => calibrationControlById.get(id)!) as unknown as readonly [
    (typeof RPG_REFERENCE_CALIBRATION_INPUT.controlPoints)[number],
    (typeof RPG_REFERENCE_CALIBRATION_INPUT.controlPoints)[number],
    (typeof RPG_REFERENCE_CALIBRATION_INPUT.controlPoints)[number]
  ];
  const weights = barycentric(
    point,
    controls.map((control) => control.worldXZ) as unknown as readonly [
      WorldPoint2,
      WorldPoint2,
      WorldPoint2
    ]
  );
  const interpolate = (read: (control: (typeof controls)[number]) => number) =>
    weights.reduce((sum, weight, index) => sum + weight * read(controls[index]), 0);
  return {
    pixel: [
      interpolate((control) => control.referencePixel[0]),
      interpolate((control) => control.referencePixel[1])
    ] as const,
    spriteScale: interpolate((control) => control.spriteScale),
    depthKey: interpolate((control) => control.depthKey),
    weights
  };
};

const extents = (polygon: readonly WorldPoint2[]) => {
  const xs = polygon.map(([x]) => x);
  const zs = polygon.map(([, z]) => z);
  return {
    minimumX: Math.min(...xs),
    maximumX: Math.max(...xs),
    minimumZ: Math.min(...zs),
    maximumZ: Math.max(...zs)
  };
};

const expectPixelInRectangle = (
  pixel: readonly [number, number],
  rectangle: {
    readonly minimumX: number;
    readonly maximumX: number;
    readonly minimumY: number;
    readonly maximumY: number;
  },
  label: string
) => {
  expect(pixel[0], `${label}:x`).toBeGreaterThanOrEqual(rectangle.minimumX);
  expect(pixel[0], `${label}:x`).toBeLessThanOrEqual(rectangle.maximumX);
  expect(pixel[1], `${label}:y`).toBeGreaterThanOrEqual(rectangle.minimumY);
  expect(pixel[1], `${label}:y`).toBeLessThanOrEqual(rectangle.maximumY);
};

describe("WORLD-06 measured non-affine reference registration", () => {
  it("publishes the self-contained approved map golden without runtime coupling", () => {
    expect(RPG_REFERENCE_MAP_GOLDEN.imageSize).toEqual([1817, 866]);
    expect(RPG_REFERENCE_MAP_GOLDEN.coastline).toHaveLength(24);
    expect(Object.keys(RPG_REFERENCE_MAP_GOLDEN.routes)).toEqual([
      "airport-to-tokyo",
      "airport-to-gyukatsu",
      "tokyo-to-gyukatsu",
      "gyukatsu-to-sakura",
      "sakura-to-hanabi"
    ]);
    expect(RPG_REFERENCE_MAP_GOLDEN.routes["gyukatsu-to-sakura"]).toEqual([
      [1080, 635],
      [1150, 640],
      [1210, 620],
      [1230, 610]
    ]);
    expect(RPG_REFERENCE_MAP_GOLDEN.nodes).toEqual({
      airport: [430, 600],
      tokyo: [760, 455],
      gyukatsu: [1035, 610],
      sakura: [1260, 595],
      hanabi: [1570, 640]
    });

    for (const runtimePath of [
      "app/world/RpgWorldModel.ts",
      "app/world/RpgWorldGeometry.ts"
    ]) {
      expect(readFileSync(resolve(process.cwd(), runtimePath), "utf8"))
        .not.toContain("RPG_REFERENCE_MAP_GOLDEN");
    }
  });

  it("matches every independent measured control within the approved tolerance", () => {
    const measuredControls = RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.filter(
      ({ source }) => source !== undefined
    );
    expect(RPG_REFERENCE_REGISTRATION_GOLDEN.calibrationControls).toHaveLength(
      measuredControls.length + RPG_REFERENCE_CALIBRATION_OBSERVATIONS.length
    );

    for (const golden of RPG_REFERENCE_REGISTRATION_GOLDEN.calibrationControls) {
      const measured = RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.find(
        ({ id }) => id === golden.id
      );
      const observation = RPG_REFERENCE_CALIBRATION_OBSERVATIONS.find(
        ({ id }) => id === golden.id
      );
      expect(
        Number(measured !== undefined) + Number(observation !== undefined),
        `${golden.id}:single-owner`
      ).toBe(1);
      if (observation) {
        expect(observation.referencePixel, golden.id).toEqual(
          golden.referencePixel
        );
        expect(observation.spriteScale, golden.id).toBe(golden.spriteScale);
        expect(observation.depthKey, golden.id).toBe(golden.depthKey);
        expect(
          RPG_REFERENCE_REGISTRATION.controlPoints.some(
            ({ id }) => id === observation.id
          ),
          `${golden.id}:not-player-authority`
        ).toBe(false);
        continue;
      }
      if (!measured) {
        throw new Error(`Missing mesh measurement: ${golden.id}`);
      }
      const projection = projectWorldToReference(measured.worldXZ);
      expect(projection, golden.id).not.toBeNull();
      const arrivalAnchor = RPG_REFERENCE_ARRIVAL_ANCHORS.find(
        ({ worldXZ }) =>
          worldXZ[0] === measured.worldXZ[0] && worldXZ[1] === measured.worldXZ[1]
      );
      const expectedPixel = arrivalAnchor?.referencePixel ?? golden.referencePixel;
      expect(Math.abs(projection!.pixel[0] - expectedPixel[0]), golden.id)
        .toBeLessThanOrEqual(arrivalAnchor ? 0.5 : 1);
      expect(Math.abs(projection!.pixel[1] - expectedPixel[1]), golden.id)
        .toBeLessThanOrEqual(arrivalAnchor ? 0.5 : 1);
      if (!arrivalAnchor) {
        expect(Math.abs(projection!.spriteScale - golden.spriteScale), golden.id)
          .toBeLessThanOrEqual(0.01);
        expect(Math.abs(projection!.depthKey - golden.depthKey), golden.id)
          .toBeLessThanOrEqual(0.01);
      }
      expect(projection!.uv, golden.id).toEqual([
        projection!.pixel[0] / RPG_REFERENCE_REGISTRATION_GOLDEN.imageSize[0],
        projection!.pixel[1] / RPG_REFERENCE_REGISTRATION_GOLDEN.imageSize[1]
      ]);
      const scene = referenceToScene(projection!.pixel);
      expect(scene, golden.id).not.toBeNull();
      const restored = sceneToWorld(scene!);
      expect(Math.hypot(
        restored[0] - measured.worldXZ[0],
        restored[2] - measured.worldXZ[1]
      ), golden.id).toBeLessThanOrEqual(1e-6);
    }

    const runtimeSource = readFileSync(
      resolve(process.cwd(), "app/world/RpgWorldGeometry.ts"),
      "utf8"
    );
    expect(runtimeSource).not.toContain("tests/fixtures");
    expect(runtimeSource).not.toContain("RPG_REFERENCE_GOLDEN_SAMPLES");
  });

  it("projects every canonical arrival onto its independently annotated traversable surface", () => {
    expect(RPG_REFERENCE_REGISTRATION_GOLDEN.imageSize).toEqual([1817, 866]);

    for (const zoneId of ["airport", "tokyo", "gyukatsu", "sakura", "hanabi"] as const) {
      const annotation =
        RPG_REFERENCE_REGISTRATION_GOLDEN.arrivalTraversableSurfaceAnnotations[zoneId];
      const zone = RPG_WORLD_ZONES.find(({ id }) => id === zoneId)!;
      const arrival = RPG_WORLD_ARRIVALS.find(({ id }) => id === annotation.arrivalId)!;
      const landmark = RPG_WORLD_LANDMARKS.find(
        ({ id }) => id === zone.primaryLandmarkId
      )!;
      const surface = RPG_WORLD_SCENE_SURFACES.find(
        ({ id }) => id === annotation.surfaceId
      );
      const route = RPG_WORLD_ROUTES.find(({ id }) => id === annotation.sourceRouteId);
      const arrivalWorldXZ = [arrival.position[0], arrival.position[2]] as const;

      expect(annotation.zoneId, zoneId).toBe(zoneId);
      expect(zone.arrivalId, zoneId).toBe(arrival.id);
      expect(arrival.zoneId, zoneId).toBe(zoneId);
      expect(isWalkable(arrivalWorldXZ), zoneId).toBe(true);
      expect(getZoneAt(arrivalWorldXZ)?.id, zoneId).toBe(zoneId);
      expect(surface, annotation.surfaceId).toBeDefined();
      expect(route, annotation.sourceRouteId).toBeDefined();
      expect(surface!.sourceRouteId, annotation.surfaceId).toBe(annotation.sourceRouteId);
      expect(route!.renderableId, annotation.sourceRouteId).toBe(annotation.surfaceId);

      const headingNorm = Math.hypot(...arrival.heading);
      expect(Math.abs(headingNorm - 1), `${arrival.id}:heading-norm`)
        .toBeLessThanOrEqual(1e-10);
      const landmarkVector = [
        landmark.position[0] - arrival.position[0],
        landmark.position[2] - arrival.position[2]
      ] as const;
      const landmarkDistance = Math.hypot(...landmarkVector);
      expect(landmarkDistance, `${arrival.id}:landmark-distance`).toBeGreaterThan(0);
      const headingDot =
        arrival.heading[0] * landmarkVector[0] / landmarkDistance +
        arrival.heading[1] * landmarkVector[1] / landmarkDistance;
      expect(headingDot, `${arrival.id}:heading-dot`).toBeGreaterThanOrEqual(0.999999);

      const projection = projectWorldToReference(arrivalWorldXZ);
      expect(projection, arrival.id).not.toBeNull();
      expect([
        ...projection!.pixel,
        projection!.spriteScale,
        projection!.depthKey,
        ...projection!.uv
      ].every(Number.isFinite), `${arrival.id}:finite-projection`).toBe(true);
      expect(projection!.pixel[0], `${arrival.id}:image-x`).toBeGreaterThanOrEqual(0);
      expect(projection!.pixel[0], `${arrival.id}:image-x`).toBeLessThanOrEqual(1817);
      expect(projection!.pixel[1], `${arrival.id}:image-y`).toBeGreaterThanOrEqual(0);
      expect(projection!.pixel[1], `${arrival.id}:image-y`).toBeLessThanOrEqual(866);
      expect(projection!.pixel, `${arrival.id}:approved-foot`).toEqual(
        RPG_REFERENCE_MAP_GOLDEN.nodes[zoneId]
      );
      expect(
        Math.hypot(
          projection!.pixel[0] - arrival.approvedReferenceFoot.pixel[0],
          projection!.pixel[1] - arrival.approvedReferenceFoot.pixel[1]
        ),
        `${arrival.id}:approved-foot-error`
      ).toBeLessThanOrEqual(
        arrival.approvedReferenceFoot.maximumProjectionErrorPixels
      );
      expectPixelInRectangle(
        projection!.pixel,
        annotation.approvedImageRectangle,
        arrival.id
      );

      const scene = referenceToScene(projection!.pixel);
      expect(scene, arrival.id).not.toBeNull();
      const restored = sceneToWorld(scene!);
      expect(Math.hypot(
        restored[0] - arrival.position[0],
        restored[2] - arrival.position[2]
      ), `${arrival.id}:inverse-world-error`).toBeLessThanOrEqual(1e-6);
      const reprojection = projectWorldToReference([restored[0], restored[2]]);
      expect(reprojection, arrival.id).not.toBeNull();
      expect(Math.abs(reprojection!.pixel[0] - projection!.pixel[0]), `${arrival.id}:reproject-x`)
        .toBeLessThanOrEqual(1);
      expect(Math.abs(reprojection!.pixel[1] - projection!.pixel[1]), `${arrival.id}:reproject-y`)
        .toBeLessThanOrEqual(1);

      const protectedRectangle =
        RPG_REFERENCE_ZONE_ANCHORS[zoneId].cameraFocusRectangle;
      expect(RPG_REFERENCE_ZONE_ANCHORS[zoneId].sourceId, zoneId)
        .toBe(zone.primaryLandmarkId);
      for (const profileId of ["desktop", "mobile"] as const) {
        const label = `${arrival.id}:${profileId}-crop`;
        const placement = calculateRpgReferenceCameraPlacement({
          player: arrival.position,
          profile: profileId
        });
        expect(placement, label).not.toBeNull();
        expect(placement!.playerReferenceProjection, label).toEqual(projection);
        expect(placement!.playerCssSafeRectangle, label).toEqual(
          RPG_PLAYER_PROFILE_SAFE_RECTANGLES[profileId].player
        );
        expect(placement!.footCssSafeRectangle, label).toEqual(
          RPG_PLAYER_PROFILE_SAFE_RECTANGLES[profileId].foot
        );
        expect(placement!.selectedProtectedRectangles, label).toHaveLength(1);
        expect(placement!.selectedProtectedRectangles[0].sourceId, label)
          .toBe(protectedRectangle.sourceId);
        const playerSafe = RPG_PLAYER_PROFILE_SAFE_RECTANGLES[profileId].player;
        const footSafe = RPG_PLAYER_PROFILE_SAFE_RECTANGLES[profileId].foot;
        expect(placement!.playerProjectedBounds.safeFrame.minimumX, label)
          .toBeGreaterThanOrEqual(playerSafe.x - 1e-6);
        expect(placement!.playerProjectedBounds.safeFrame.maximumX, label)
          .toBeLessThanOrEqual(playerSafe.x + playerSafe.width + 1e-6);
        expect(placement!.playerProjectedBounds.safeFrame.minimumY, label)
          .toBeGreaterThanOrEqual(playerSafe.y - 1e-6);
        expect(placement!.playerProjectedBounds.safeFrame.maximumY, label)
          .toBeLessThanOrEqual(playerSafe.y + playerSafe.height + 1e-6);
        expect(placement!.footProjectedBounds.safeFrame.minimumX, label)
          .toBeGreaterThanOrEqual(footSafe.x - 1e-6);
        expect(placement!.footProjectedBounds.safeFrame.maximumX, label)
          .toBeLessThanOrEqual(footSafe.x + footSafe.width + 1e-6);
        expect(placement!.footProjectedBounds.safeFrame.minimumY, label)
          .toBeGreaterThanOrEqual(footSafe.y - 1e-6);
        expect(placement!.footProjectedBounds.safeFrame.maximumY, label)
          .toBeLessThanOrEqual(footSafe.y + footSafe.height + 1e-6);
      }
    }
  });

  it("preserves the annotated near-to-far depth ordering on all three traversable surfaces", () => {
    const annotations = Object.values(
      RPG_REFERENCE_REGISTRATION_GOLDEN.arrivalTraversableSurfaceAnnotations
    );
    const minimumGaps = RPG_REFERENCE_REGISTRATION_GOLDEN.depthPairMinimumGaps;

    for (const pairId of ["airport", "center", "east"] as const) {
      const pair = RPG_REFERENCE_REGISTRATION_GOLDEN.depthPairs[pairId];
      const annotation = annotations.find(
        ({ zoneId, surfaceId }) =>
          zoneId === pair.zoneId && surfaceId === pair.surfaceId
      );
      expect(annotation, `${pairId}:annotation`).toBeDefined();
      const surface = RPG_WORLD_SCENE_SURFACES.find(({ id }) => id === pair.surfaceId);
      const route = RPG_WORLD_ROUTES.find(({ id }) => id === annotation!.sourceRouteId);
      expect(surface, `${pairId}:surface`).toBeDefined();
      expect(route, `${pairId}:route`).toBeDefined();
      expect(surface!.sourceRouteId, pairId).toBe(annotation!.sourceRouteId);
      expect(route!.renderableId, pairId).toBe(pair.surfaceId);

      const projections = [pair.farWorldXZ, pair.nearWorldXZ].map((point, index) => {
        const label = `${pairId}:${index === 0 ? "far" : "near"}`;
        expect(isWalkable(point), label).toBe(true);
        expect(getZoneAt(point)?.id, label).toBe(pair.zoneId);
        const projection = projectWorldToReference(point);
        expect(projection, label).not.toBeNull();
        expect([
          ...projection!.pixel,
          projection!.spriteScale,
          projection!.depthKey,
          ...projection!.uv
        ].every(Number.isFinite), `${label}:finite-projection`).toBe(true);
        expect(projection!.pixel[0], `${label}:image-x`).toBeGreaterThanOrEqual(0);
        expect(projection!.pixel[0], `${label}:image-x`).toBeLessThanOrEqual(1817);
        expect(projection!.pixel[1], `${label}:image-y`).toBeGreaterThanOrEqual(0);
        expect(projection!.pixel[1], `${label}:image-y`).toBeLessThanOrEqual(866);
        return projection!;
      });
      const [far, near] = projections;

      expect(near.pixel[1] - far.pixel[1], `${pairId}:pixel-y-gap`)
        .toBeGreaterThanOrEqual(minimumGaps.pixelY);
      expect(
        [far.spriteScale, near.spriteScale].every(
          (spriteScale) => Number.isFinite(spriteScale) && spriteScale > 0
        ),
        `${pairId}:sprite-scale`
      ).toBe(true);
      expect(near.depthKey - far.depthKey, `${pairId}:depth-key-gap`)
        .toBeGreaterThanOrEqual(minimumGaps.depthKey);
    }
  });

  it("keeps arrival and depth fixtures semantic-only instead of storing runtime projections", () => {
    const annotations =
      RPG_REFERENCE_REGISTRATION_GOLDEN.arrivalTraversableSurfaceAnnotations;
    const runtimeOutputKeys = [
      "referencePixel",
      "pixel",
      "uv",
      "spriteScale",
      "depthKey",
      "triangleId",
      "anchorId"
    ] as const;

    for (const zoneId of ["airport", "tokyo", "gyukatsu", "sakura", "hanabi"] as const) {
      const annotation = annotations[zoneId];
      expect(Object.keys(annotation), zoneId).toEqual([
        "arrivalId",
        "zoneId",
        "surfaceId",
        "sourceRouteId",
        "approvedImageRectangle"
      ]);
      expect(Object.keys(annotation.approvedImageRectangle), zoneId).toEqual([
        "minimumX",
        "maximumX",
        "minimumY",
        "maximumY"
      ]);
      for (const key of runtimeOutputKeys) {
        expect(annotation, `${zoneId}:${key}`).not.toHaveProperty(key);
      }
    }

    for (const pairId of ["airport", "center", "east"] as const) {
      const pair = RPG_REFERENCE_REGISTRATION_GOLDEN.depthPairs[pairId];
      expect(Object.keys(pair), pairId).toEqual([
        "zoneId",
        "surfaceId",
        "farWorldXZ",
        "nearWorldXZ"
      ]);
      for (const key of runtimeOutputKeys) {
        expect(pair, `${pairId}:${key}`).not.toHaveProperty(key);
      }
    }
  });

  it("round-trips every refined control and face centroid through the measured inverse", () => {
    let maximumWorldError = 0;
    let maximumPixelError = 0;
    let coarseOwnerCount = 0;

    for (const control of RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints) {
      const scene = referenceToScene(control.referencePixel);
      expect(scene, control.id).not.toBeNull();
      const restored = sceneToWorld(scene!);
      maximumWorldError = Math.max(
        maximumWorldError,
        Math.hypot(
          restored[0] - control.worldXZ[0],
          restored[2] - control.worldXZ[1]
        )
      );
    }

    for (const face of RPG_RUNTIME_REFERENCE_REGISTRATION.triangles) {
      const centroid = triangleCentroid(runtimeWorldPoints(face.controlPointIds));
      const projection = projectWorldToReferenceInTriangle(face.id, centroid)!;
      const authoritativeProjection = projectWorldToReference(centroid);
      expect(authoritativeProjection, face.id).not.toBeNull();
      if (authoritativeProjection!.triangleId.startsWith("calibration-domain:")) {
        coarseOwnerCount += 1;
      }
      const scene = referenceToScene(projection.pixel);
      expect(scene, face.id).not.toBeNull();
      const restored = sceneToWorld(scene!);
      maximumWorldError = Math.max(
        maximumWorldError,
        Math.hypot(restored[0] - centroid[0], restored[2] - centroid[1])
      );
      const reprojection = projectWorldToReference([restored[0], restored[2]]);
      expect(reprojection, face.id).not.toBeNull();
      maximumPixelError = Math.max(
        maximumPixelError,
        Math.abs(reprojection!.pixel[0] - projection.pixel[0]),
        Math.abs(reprojection!.pixel[1] - projection.pixel[1])
      );
    }

    expect(maximumWorldError).toBeLessThanOrEqual(1e-6);
    expect(maximumPixelError).toBeLessThanOrEqual(1);
    expect(coarseOwnerCount).toBe(0);
  });

  it("chooses a deterministic inverse on every shared calibration edge", () => {
    const edgeOwners = new Map<string, number>();
    for (const triangle of RPG_REFERENCE_CALIBRATION_INPUT.triangles) {
      for (let index = 0; index < 3; index += 1) {
        const key = [
          triangle.controlPointIds[index],
          triangle.controlPointIds[(index + 1) % 3]
        ].sort().join("|");
        edgeOwners.set(key, (edgeOwners.get(key) ?? 0) + 1);
      }
    }

    for (const [key, ownerCount] of edgeOwners) {
      if (ownerCount !== 2) continue;
      const [first, second] = key.split("|").map((id) => calibrationControlById.get(id)!);
      const pixel = [
        (first.referencePixel[0] + second.referencePixel[0]) / 2,
        (first.referencePixel[1] + second.referencePixel[1]) / 2
      ] as const;
      const expectedWorld = [
        (first.worldXZ[0] + second.worldXZ[0]) / 2,
        (first.worldXZ[1] + second.worldXZ[1]) / 2
      ] as const;
      const scene = referenceToScene(pixel);
      expect(scene, key).not.toBeNull();
      expect(referenceToScene(pixel), key).toEqual(scene);
      const restored = sceneToWorld(scene!);
      expect(Math.hypot(
        restored[0] - expectedWorld[0],
        restored[2] - expectedWorld[1]
      ), key).toBeLessThanOrEqual(1e-6);
    }
  });

  it("uses the explicit common mesh directly as the runtime authority", () => {
    expect(RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints).toHaveLength(53);
    expect(RPG_RUNTIME_REFERENCE_REGISTRATION.triangles).toHaveLength(99);
    expect(RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints).toEqual(
      RPG_REFERENCE_REGISTRATION.controlPoints
    );
    expect(RPG_RUNTIME_REFERENCE_REGISTRATION.triangles).toEqual(
      RPG_REFERENCE_REGISTRATION.triangles.map((triangle) => ({
        ...triangle,
        atomicTriangleId: triangle.id,
        calibrationTriangleId: triangle.id
      }))
    );
    expect(new Set(RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints.map(({ id }) => id)).size)
      .toBe(RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints.length);
    expect(new Set(RPG_RUNTIME_REFERENCE_REGISTRATION.triangles.map(({ id }) => id)).size)
      .toBe(RPG_RUNTIME_REFERENCE_REGISTRATION.triangles.length);

    for (const atomicTriangle of RPG_REFERENCE_REGISTRATION.triangles) {
      const points = atomicTriangle.controlPointIds.map(
        (id) => atomicControlById.get(id)!.worldXZ
      ) as unknown as readonly [WorldPoint2, WorldPoint2, WorldPoint2];
      expect(projectWorldToReferenceInTriangle(
        atomicTriangle.id,
        triangleCentroid(points)
      ), atomicTriangle.id).not.toBeNull();
    }
  });

  it("keeps every refined face inside exactly one atomic and one calibration owner", () => {
    const atomicIds = new Set(RPG_REFERENCE_REGISTRATION.triangles.map(({ id }) => id));
    const calibrationIds = new Set(
      RPG_REFERENCE_CALIBRATION_INPUT.triangles.map(({ id }) => id)
    );

    for (const face of RPG_RUNTIME_REFERENCE_REGISTRATION.triangles) {
      expect(atomicIds.has(face.atomicTriangleId), face.id).toBe(true);
      expect(calibrationIds.has(face.calibrationTriangleId), face.id).toBe(true);
      const points = runtimeWorldPoints(face.controlPointIds);
      const atomicTriangle = atomicTriangleById.get(face.atomicTriangleId)!;
      const atomicPoints = atomicTriangle.controlPointIds.map(
        (id) => atomicControlById.get(id)!.worldXZ
      ) as unknown as readonly [WorldPoint2, WorldPoint2, WorldPoint2];
      for (const point of points) {
        expect(
          barycentric(point, atomicPoints).every((weight) => weight >= -1e-6),
          face.id
        ).toBe(true);
      }
      const centroid = triangleCentroid(points);
      const direct = directCalibrationProjection(face.calibrationTriangleId, centroid);
      expect(direct.weights.every((weight) => weight >= -1e-6), face.id).toBe(true);
      for (const point of points) {
        expect(
          directCalibrationProjection(face.calibrationTriangleId, point).weights.every(
            (weight) => weight >= -1e-6
          ),
          face.id
        ).toBe(true);
      }

      const refined = projectWorldToReferenceInTriangle(face.id, centroid)!;
      expect(Math.abs(refined.pixel[0] - direct.pixel[0]), face.id).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(refined.pixel[1] - direct.pixel[1]), face.id).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(refined.spriteScale - direct.spriteScale), face.id)
        .toBeLessThanOrEqual(1e-6);
      expect(Math.abs(refined.depthKey - direct.depthKey), face.id)
        .toBeLessThanOrEqual(1e-6);
    }
  });

  it("is continuous across every shared refined edge", () => {
    const edgeOwners = new Map<
      string,
      (typeof RPG_RUNTIME_REFERENCE_REGISTRATION.triangles)[number][]
    >();
    for (const triangle of RPG_RUNTIME_REFERENCE_REGISTRATION.triangles) {
      for (let index = 0; index < 3; index += 1) {
        const key = [
          triangle.controlPointIds[index],
          triangle.controlPointIds[(index + 1) % 3]
        ].sort().join("|");
        const owners = edgeOwners.get(key);
        if (owners) owners.push(triangle);
        else edgeOwners.set(key, [triangle]);
      }
    }

    let sharedEdgeCount = 0;
    let maximumPixelError = 0;
    let maximumScaleError = 0;
    let maximumDepthError = 0;
    let maximumSelectedPixelError = 0;
    for (const [key, owners] of edgeOwners) {
      expect(owners.length, key).toBeLessThanOrEqual(2);
      if (owners.length !== 2) continue;
      sharedEdgeCount += 1;
      const [first, second] = key.split("|").map((id) => runtimeControlById.get(id)!);
      const midpoint: WorldPoint2 = [
        (first.worldXZ[0] + second.worldXZ[0]) / 2,
        (first.worldXZ[1] + second.worldXZ[1]) / 2
      ];
      const firstProjection = projectWorldToReferenceInTriangle(owners[0].id, midpoint)!;
      const secondProjection = projectWorldToReferenceInTriangle(owners[1].id, midpoint)!;
      const selectedProjection = projectWorldToReference(midpoint);
      expect(selectedProjection, key).not.toBeNull();
      expect(projectWorldToReference(midpoint), key).toEqual(selectedProjection);
      maximumPixelError = Math.max(
        maximumPixelError,
        Math.abs(firstProjection.pixel[0] - secondProjection.pixel[0]),
        Math.abs(firstProjection.pixel[1] - secondProjection.pixel[1])
      );
      maximumScaleError = Math.max(
        maximumScaleError,
        Math.abs(firstProjection.spriteScale - secondProjection.spriteScale)
      );
      maximumDepthError = Math.max(
        maximumDepthError,
        Math.abs(firstProjection.depthKey - secondProjection.depthKey)
      );
      maximumSelectedPixelError = Math.max(
        maximumSelectedPixelError,
        Math.abs(selectedProjection!.pixel[0] - firstProjection.pixel[0]),
        Math.abs(selectedProjection!.pixel[1] - firstProjection.pixel[1])
      );
    }

    expect(sharedEdgeCount).toBeGreaterThan(RPG_REFERENCE_REGISTRATION.triangles.length);
    expect(maximumPixelError).toBeLessThanOrEqual(1);
    expect(maximumScaleError).toBeLessThanOrEqual(0.01);
    expect(maximumDepthError).toBeLessThanOrEqual(0.01);
    expect(maximumSelectedPixelError).toBeLessThanOrEqual(1);
  });

  it("keeps canonical blocked anchors projectable without using legacy affine anchor values", () => {
    const blockingPrimaryIds = [
      "tokyo-blue-tower",
      "gyukatsu-main-machiya",
      "sakura-tree-01",
      "hanabi-apple-stall"
    ];
    const collisions = getCollisionShapes();
    for (const sourceId of blockingPrimaryIds) {
      const landmark = RPG_WORLD_LANDMARKS.find(({ id }) => id === sourceId)!;
      expect(landmark.blocksMovement, sourceId).toBe(true);
      expect(collisions.some((collision) => collision.sourceId === sourceId), sourceId)
        .toBe(true);
      expect(isWalkable([landmark.position[0], landmark.position[2]]), sourceId).toBe(false);
    }

    expect(RPG_RUNTIME_REFERENCE_REGISTRATION.anchors).toHaveLength(
      RPG_REFERENCE_LANDMARK_ANCHORS.length + RPG_REFERENCE_ARRIVAL_ANCHORS.length
    );
    for (const anchor of RPG_RUNTIME_REFERENCE_REGISTRATION.anchors.filter(
      ({ role }) => role === "landmark"
    )) {
      const projection = projectWorldToReference(anchor.worldXZ);
      expect(projection, anchor.id).toMatchObject({
        pixel: anchor.referencePixel,
        spriteScale: anchor.spriteScale,
        depthKey: anchor.depthKey
      });
      expect(projection!.triangleId).toMatch(/^reference-mesh-triangle-/);
    }
    for (const anchor of RPG_RUNTIME_REFERENCE_REGISTRATION.anchors.filter(
      ({ role }) => role === "arrival"
    )) {
      expect(projectWorldToReference(anchor.worldXZ)).toMatchObject({
        pixel: anchor.referencePixel
      });
      expect(projectWorldToReference(anchor.worldXZ)!.triangleId).toMatch(
        /^reference-mesh-triangle-/
      );
      expect(referenceToScene(anchor.referencePixel)).toEqual(
        referenceToScene(projectWorldToReference(anchor.worldXZ)!.pixel)
      );
    }
  });

  it("fails closed for non-finite and unmapped positions", () => {
    for (const point of [
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      [0, Number.NEGATIVE_INFINITY],
      [-100, 0],
      [0, 100]
    ] as const) {
      expect(projectWorldToReference(point), String(point)).toBeNull();
    }
    expect(isWalkable([-8, 14])).toBe(false);
    expect(projectWorldToReference([-8, 14])).not.toBeNull();
    expect(isWalkable([16.6, 0])).toBe(false);
    expect(projectWorldToReference([16.6, 0])).not.toBeNull();
    expect(projectWorldToReferenceInTriangle("missing-triangle", [0, 0])).toBeNull();
    expect(projectWorldToReferenceInTriangle(
      RPG_RUNTIME_REFERENCE_REGISTRATION.triangles[0].id,
      [Number.NaN, 0]
    )).toBeNull();
    for (const pixel of [
      [Number.NaN, 0],
      [Number.POSITIVE_INFINITY, 0],
      [0, Number.NEGATIVE_INFINITY],
      [-10_000, -10_000],
      [10_000, 10_000]
    ] as const) {
      expect(referenceToScene(pixel), String(pixel)).toBeNull();
    }
  });
});

describe("WORLD-07 conforming registration topology", () => {
  it("uses one mesh authority for arrivals and derives every map route from its controls", () => {
    const arrivalKeys = new Set(
      RPG_WORLD_ARRIVALS.map(
        ({ position }) => `${position[0].toFixed(9)}:${position[2].toFixed(9)}`
      )
    );
    expect(
      RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.filter(({ worldXZ }) =>
        arrivalKeys.has(`${worldXZ[0].toFixed(9)}:${worldXZ[1].toFixed(9)}`)
      )
    ).toEqual([]);

    const controlById = new Map(
      RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.map((control) => [
        control.id,
        control
      ])
    );
    expect(Object.keys(RPG_REFERENCE_ROUTE_CONTROL_IDS)).toEqual(
      RPG_REFERENCE_MAP_TRANSITIONS.map(({ id }) => id)
    );
    for (const route of RPG_REFERENCE_MAP_TRANSITIONS) {
      const controlIds = RPG_REFERENCE_ROUTE_CONTROL_IDS[route.id];
      expect(controlIds, route.id).toHaveLength(route.points.length);
      for (let index = 0; index < controlIds.length; index += 1) {
        const control = controlById.get(controlIds[index])!;
        expect(control, `${route.id}:${index}`).toBeDefined();
        expect(route.points[index], `${route.id}:${index}:shared-pixel`).toBe(
          control.referencePixel
        );
        const projection = projectWorldToReference(control.worldXZ)!;
        expect(projection.triangleId, `${route.id}:${index}:mesh-owner`).not.toMatch(
          /^(?:anchor|calibration):/
        );
        expect(
          Math.hypot(
            projection.pixel[0] - control.referencePixel[0],
            projection.pixel[1] - control.referencePixel[1]
          ),
          `${route.id}:${index}:exact`
        ).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it("keeps dense Airport travel aligned after leaving the arrival microtriangle", () => {
    const arrival = RPG_WORLD_ARRIVALS.find(({ zoneId }) => zoneId === "airport")!;
    const arrivalWorld = [arrival.position[0], arrival.position[2]] as const;
    const arrivalReference = arrival.approvedReferenceFoot.pixel;
    const controlById = new Map(
      RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.map((control) => [
        control.id,
        control
      ])
    );
    const branches = [
      controlById.get(RPG_REFERENCE_ROUTE_CONTROL_IDS["airport-to-tokyo"][0])!,
      controlById.get(RPG_REFERENCE_ROUTE_CONTROL_IDS["airport-to-gyukatsu"][0])!
    ];
    const distanceToSegment = (
      point: WorldPoint2,
      start: WorldPoint2,
      end: WorldPoint2
    ) => {
      const deltaX = end[0] - start[0];
      const deltaY = end[1] - start[1];
      const lengthSquared = deltaX * deltaX + deltaY * deltaY;
      const progress = Math.max(
        0,
        Math.min(
          1,
          ((point[0] - start[0]) * deltaX +
            (point[1] - start[1]) * deltaY) /
            lengthSquared
        )
      );
      return Math.hypot(
        point[0] - (start[0] + deltaX * progress),
        point[1] - (start[1] + deltaY * progress)
      );
    };

    const spawnProjection = projectWorldToReference(RPG_WORLD_SPAWN)!;
    expect(spawnProjection).not.toBeNull();
    expect(spawnProjection.pixel).toEqual([455, 620]);
    expect(spawnProjection.pixel).not.toEqual(arrivalReference);
    const spawnControl = controlById.get("spawn-airport-center")!;
    expect(spawnControl.worldXZ).toEqual([
      RPG_WORLD_SPAWN[0],
      RPG_WORLD_SPAWN[2]
    ]);
    expect(spawnControl.referencePixel).toEqual(spawnProjection.pixel);
    expect(spawnControl.measurementRole).toBe("spawn-control");

    for (const branch of branches) {
      const worldDistance = Math.hypot(
        branch.worldXZ[0] - arrivalWorld[0],
        branch.worldXZ[1] - arrivalWorld[1]
      );
      const sampleCount = Math.ceil(worldDistance / 0.05);
      for (let index = 0; index <= sampleCount; index += 1) {
        const progress = index / sampleCount;
        const world = [
          arrivalWorld[0] +
            (branch.worldXZ[0] - arrivalWorld[0]) * progress,
          arrivalWorld[1] +
            (branch.worldXZ[1] - arrivalWorld[1]) * progress
        ] as const;
        const projection = projectWorldToReference(world);
        expect(projection, `${branch.id}:${index}:projection`).not.toBeNull();
        expect(
          distanceToSegment(
            projection!.pixel,
            arrivalReference,
            branch.referencePixel
          ),
          `${branch.id}:${index}:route-distance`
        ).toBeLessThanOrEqual(14);
      }
    }
  });

  it("closes the Sakura-Hanabi route onto the re-registered arrival", () => {
    const routeControl = RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.find(
      ({ id }) => id === "route-sakura-hanabi-4"
    )!;
    const arrival = RPG_WORLD_ARRIVALS.find(
      ({ zoneId }) => zoneId === "hanabi"
    )!;
    const start = routeControl.worldXZ;
    const end = [arrival.position[0], arrival.position[2]] as const;
    expect(routeControl.referencePixel).toEqual([1545, 640]);
    expect(arrival.approvedReferenceFoot.pixel).toEqual([1570, 640]);

    let previousX = Number.NEGATIVE_INFINITY;
    for (let index = 0; index <= 200; index += 1) {
      const progress = index / 200;
      const point = [
        start[0] + (end[0] - start[0]) * progress,
        start[1] + (end[1] - start[1]) * progress
      ] as const;
      const projection = projectWorldToReference(point)!;
      const expectedX = 1545 + 25 * progress;
      expect(projection, `hanabi-route:${index}`).not.toBeNull();
      expect(Math.abs(projection.pixel[0] - expectedX), `hanabi-route:${index}:x`)
        .toBeLessThanOrEqual(2);
      expect(Math.abs(projection.pixel[1] - 640), `hanabi-route:${index}:y`)
        .toBeLessThanOrEqual(1e-6);
      expect(projection.pixel[0], `hanabi-route:${index}:monotone`)
        .toBeGreaterThanOrEqual(previousX);
      previousX = projection.pixel[0];
    }
  });

  it("has one reversed rotation system with no folds overlaps or T-junctions in either domain", () => {
    const controls = RPG_REFERENCE_CALIBRATION_INPUT.controlPoints;
    const controlById = new Map(controls.map((control) => [control.id, control]));
    const edgeOwners = new Map<string, number>();
    const neighbors = new Map<string, Set<string>>();
    const triangles = RPG_REFERENCE_CALIBRATION_INPUT.triangles.map((triangle) => {
      const points = triangle.controlPointIds.map((id) => controlById.get(id)!);
      expect(points.every(Boolean), triangle.id).toBe(true);
      const world = points.map(({ worldXZ }) => worldXZ) as [
        WorldPoint2,
        WorldPoint2,
        WorldPoint2
      ];
      const reference = points.map(({ referencePixel }) => referencePixel) as [
        WorldPoint2,
        WorldPoint2,
        WorldPoint2
      ];
      expect(signedArea(...world), `${triangle.id}:world-winding`).toBeGreaterThan(
        1e-8
      );
      expect(
        signedArea(...reference),
        `${triangle.id}:reference-winding`
      ).toBeLessThan(-1e-8);
      for (let index = 0; index < 3; index += 1) {
        const first = triangle.controlPointIds[index];
        const second = triangle.controlPointIds[(index + 1) % 3];
        const key = [first, second].sort().join("|");
        edgeOwners.set(key, (edgeOwners.get(key) ?? 0) + 1);
        if (!neighbors.has(first)) neighbors.set(first, new Set());
        if (!neighbors.has(second)) neighbors.set(second, new Set());
        neighbors.get(first)!.add(second);
        neighbors.get(second)!.add(first);
      }
      return { id: triangle.id, controlPointIds: triangle.controlPointIds, world, reference };
    });

    expect([...edgeOwners.values()].filter((count) => count > 2)).toEqual([]);
    for (const control of controls) {
      const adjacentIds = [...(neighbors.get(control.id) ?? [])];
      expect(adjacentIds.length, `${control.id}:isolated`).toBeGreaterThanOrEqual(2);
      const order = (domain: "worldXZ" | "referencePixel") =>
        [...adjacentIds].sort((firstId, secondId) => {
          const first = controlById.get(firstId)![domain];
          const second = controlById.get(secondId)![domain];
          const origin = control[domain];
          return (
            Math.atan2(first[1] - origin[1], first[0] - origin[0]) -
            Math.atan2(second[1] - origin[1], second[0] - origin[0])
          );
        });
      expect(
        cyclicallyEqualsReversed(order("worldXZ"), order("referencePixel")),
        `${control.id}:rotation-system`
      ).toBe(true);
    }

    for (const domain of ["world", "reference"] as const) {
      const pointsFor = (triangle: (typeof triangles)[number]) => triangle[domain];
      for (const [key] of edgeOwners) {
        const [firstId, secondId] = key.split("|");
        const first = controlById.get(firstId)!;
        const second = controlById.get(secondId)!;
        const start = domain === "world" ? first.worldXZ : first.referencePixel;
        const end = domain === "world" ? second.worldXZ : second.referencePixel;
        for (const candidate of controls) {
          if (candidate.id === firstId || candidate.id === secondId) continue;
          const point =
            domain === "world" ? candidate.worldXZ : candidate.referencePixel;
          const onLine = Math.abs(signedArea(start, end, point)) <= 1e-8;
          const inside =
            (point[0] - start[0]) * (point[0] - end[0]) +
              (point[1] - start[1]) * (point[1] - end[1]) <
            -1e-8;
          expect(onLine && inside, `${domain}:${key}:t-junction:${candidate.id}`).toBe(
            false
          );
        }
      }

      for (let firstIndex = 0; firstIndex < triangles.length; firstIndex += 1) {
        const first = triangles[firstIndex];
        const firstPoints = pointsFor(first);
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < triangles.length;
          secondIndex += 1
        ) {
          const second = triangles[secondIndex];
          if (
            first.controlPointIds.some((id) =>
              second.controlPointIds.includes(id)
            )
          ) {
            continue;
          }
          const secondPoints = pointsFor(second);
          const edgeCrossing = firstPoints.some((start, index) =>
            secondPoints.some((secondStart, secondEdgeIndex) =>
              properSegmentsIntersect(
                start,
                firstPoints[(index + 1) % 3],
                secondStart,
                secondPoints[(secondEdgeIndex + 1) % 3]
              )
            )
          );
          const containment =
            firstPoints.some((point) => strictlyContains(secondPoints, point)) ||
            secondPoints.some((point) => strictlyContains(firstPoints, point));
          expect(
            edgeCrossing || containment,
            `${domain}:${first.id}:${second.id}:overlap`
          ).toBe(false);
        }
      }
    }
  });

  it("round-trips dense triangle interiors and every shared edge to 1e-6", () => {
    const controls = new Map(
      RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.map((control) => [
        control.id,
        control
      ])
    );
    const sharedEdges = new Map<string, number>();
    for (const triangle of RPG_REFERENCE_CALIBRATION_INPUT.triangles) {
      const triangleControls = triangle.controlPointIds.map((id) => controls.get(id)!);
      for (const [firstWeight, secondWeight] of [
        [0.2, 0.3],
        [0.2, 0.6],
        [0.4, 0.2],
        [1 / 3, 1 / 3]
      ] as const) {
        const thirdWeight = 1 - firstWeight - secondWeight;
        const world = [
          triangleControls[0].worldXZ[0] * firstWeight +
            triangleControls[1].worldXZ[0] * secondWeight +
            triangleControls[2].worldXZ[0] * thirdWeight,
          triangleControls[0].worldXZ[1] * firstWeight +
            triangleControls[1].worldXZ[1] * secondWeight +
            triangleControls[2].worldXZ[1] * thirdWeight
        ] as const;
        const projection = projectWorldToReference(world)!;
        const scene = referenceToScene(projection.pixel)!;
        const restored = sceneToWorld(scene);
        expect(
          Math.hypot(restored[0] - world[0], restored[2] - world[1]),
          `${triangle.id}:${firstWeight},${secondWeight}`
        ).toBeLessThanOrEqual(1e-6);
      }
      for (let index = 0; index < 3; index += 1) {
        const key = [
          triangle.controlPointIds[index],
          triangle.controlPointIds[(index + 1) % 3]
        ].sort().join("|");
        sharedEdges.set(key, (sharedEdges.get(key) ?? 0) + 1);
      }
    }

    for (const [key, ownerCount] of sharedEdges) {
      if (ownerCount !== 2) continue;
      const [first, second] = key.split("|").map((id) => controls.get(id)!);
      for (let sample = 0; sample <= 10; sample += 1) {
        const progress = sample / 10;
        const world = [
          first.worldXZ[0] + (second.worldXZ[0] - first.worldXZ[0]) * progress,
          first.worldXZ[1] + (second.worldXZ[1] - first.worldXZ[1]) * progress
        ] as const;
        const projection = projectWorldToReference(world)!;
        const restored = sceneToWorld(referenceToScene(projection.pixel)!);
        expect(
          Math.hypot(restored[0] - world[0], restored[2] - world[1]),
          `${key}:${sample}`
        ).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it("partitions every unchanged atomic triangle and the full walkable area", () => {
    const refinedAreaByAtomicId = new Map<string, number>();
    let refinedArea = 0;
    for (const face of RPG_RUNTIME_REFERENCE_REGISTRATION.triangles) {
      const area = signedArea(...runtimeWorldPoints(face.controlPointIds)) / 2;
      refinedArea += area;
      refinedAreaByAtomicId.set(
        face.atomicTriangleId,
        (refinedAreaByAtomicId.get(face.atomicTriangleId) ?? 0) + area
      );
    }

    let atomicArea = 0;
    for (const triangle of RPG_REFERENCE_REGISTRATION.triangles) {
      const controls = triangle.controlPointIds.map(
        (id) => atomicControlById.get(id)!.worldXZ
      ) as unknown as readonly [WorldPoint2, WorldPoint2, WorldPoint2];
      const area = signedArea(...controls) / 2;
      atomicArea += area;
      expect(
        Math.abs((refinedAreaByAtomicId.get(triangle.id) ?? 0) - area),
        triangle.id
      ).toBeLessThanOrEqual(1e-6);
    }

    expect(refinedAreaByAtomicId.size).toBe(RPG_REFERENCE_REGISTRATION.triangles.length);
    expect(Math.abs(refinedArea - atomicArea)).toBeLessThanOrEqual(1e-6);
  });

  it("has positive world and image-y-up reference winding with no overlap or foldover", () => {
    let minimumWorldArea = Number.POSITIVE_INFINITY;
    let minimumReferenceArea = Number.POSITIVE_INFINITY;
    for (const face of RPG_RUNTIME_REFERENCE_REGISTRATION.triangles) {
      const controls = face.controlPointIds.map((id) => runtimeControlById.get(id)!) as unknown as readonly [
        (typeof RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints)[number],
        (typeof RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints)[number],
        (typeof RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints)[number]
      ];
      minimumWorldArea = Math.min(
        minimumWorldArea,
        signedArea(...controls.map(({ worldXZ }) => worldXZ) as [
          WorldPoint2,
          WorldPoint2,
          WorldPoint2
        ]) / 2
      );
      minimumReferenceArea = Math.min(
        minimumReferenceArea,
        -signedArea(...controls.map(({ referencePixel }) => referencePixel) as [
          WorldPoint2,
          WorldPoint2,
          WorldPoint2
        ]) / 2
      );
    }

    expect(minimumWorldArea).toBeGreaterThan(0);
    expect(minimumReferenceArea).toBeGreaterThan(0);
    const report = validateWorldTopology();
    expect(report).toMatchObject({
      valid: true,
      overlapArea: 0,
      symmetricDifferenceArea: 0,
      nonConformingEdgeCount: 0,
      missingCalibrationControlCount: 0,
      missingAtomicControlCount: 0,
      uncoveredAtomicTriangleCount: 0,
      calibrationBreaklineCrossingCount: 0,
      foldoverCount: 0,
      unexpectedBoundaryEdgeCount: 0,
      nonManifoldEdgeCount: 0,
      sharedEdgeProjectionFailureCount: 0,
      worldTriangleOverlapCount: 0,
      referenceTriangleOverlapCount: 0,
      orphanCellCount: 0,
      orphanTriangleCount: 0,
      maximumEastBoundaryReferenceX: 1728
    });
    expect(report.worldOverlapCandidateCount).toBeGreaterThan(0);
    expect(report.referenceOverlapCandidateCount).toBeGreaterThan(0);
    expect(report.boundaryEdgeCount).toBeGreaterThan(0);
    expect(report.maximumAtomicAreaError).toBeLessThanOrEqual(1e-6);
    expect(report.registrationArea).toBeCloseTo(72 * 72, 8);
    expect(report.maximumMeasuredControlPixelError).toBeLessThanOrEqual(1);
    expect(report.maximumDirectPixelError).toBeLessThanOrEqual(1);
    expect(report.minimumWorldTriangleArea).toBeCloseTo(minimumWorldArea, 12);
    expect(report.minimumReferenceTriangleArea).toBeCloseTo(minimumReferenceArea, 9);
  });

  it("keeps gameplay walkability separate while the common mesh covers the full domain", () => {
    expect(
      new Set(RPG_RUNTIME_REFERENCE_REGISTRATION.triangles.map(({ cellId }) => cellId))
    ).toEqual(new Set(["reference-domain"]));
    for (const cell of RPG_WORLD_ATOMIC_CELLS) {
      const bounds = extents(cell.polygon);
      const center: WorldPoint2 = [
        (bounds.minimumX + bounds.maximumX) / 2,
        (bounds.minimumZ + bounds.maximumZ) / 2
      ];
      expect(isWalkable(center), cell.id).toBe(cell.walkable);
      const projection = projectWorldToReference(center);
      expect(projection, cell.id).not.toBeNull();
      expect(projection!.triangleId, cell.id).toMatch(/^reference-mesh-triangle-/);
    }
  });

  it("rejects split-versus-unsplit T-junction cell edges", () => {
    const rectangle = (
      minimumX: number,
      maximumX: number,
      minimumZ: number,
      maximumZ: number
    ) => [
      [minimumX, minimumZ],
      [maximumX, minimumZ],
      [maximumX, maximumZ],
      [minimumX, maximumZ]
    ] as const;
    const conforming = [
      { polygon: rectangle(0, 1, 0, 1) },
      { polygon: rectangle(1, 2, 0, 1) },
      { polygon: rectangle(0, 1, 1, 2) },
      { polygon: rectangle(1, 2, 1, 2) }
    ];
    const tJunction = [
      { polygon: rectangle(0, 2, 0, 1) },
      { polygon: rectangle(0, 1, 1, 2) },
      { polygon: rectangle(1, 2, 1, 2) }
    ];

    expect(validateCellEdgeConformity(conforming)).toEqual({
      valid: true,
      nonConformingEdgeCount: 0
    });
    const failure = validateCellEdgeConformity(tJunction);
    expect(failure.valid).toBe(false);
    expect(failure.nonConformingEdgeCount).toBeGreaterThan(0);
  });

  it("publishes the exact validated common-mesh and image contract", () => {
    expect(RPG_WORLD_CELLS.length).toBeGreaterThan(0);
    expect(RPG_REFERENCE_REGISTRATION.controlPoints).toHaveLength(53);
    expect(RPG_REFERENCE_REGISTRATION.triangles).toHaveLength(99);
    expect(new Set(RPG_REFERENCE_REGISTRATION.controlPoints.map(({ id }) => id)).size)
      .toBe(53);
    expect(new Set(RPG_REFERENCE_REGISTRATION.triangles.map(({ id }) => id)).size)
      .toBe(99);
    expect(RPG_REFERENCE_REGISTRATION.imageSize).toEqual([1817, 866]);
    expect(RPG_RUNTIME_REFERENCE_REGISTRATION.imageSize).toEqual(
      RPG_REFERENCE_REGISTRATION.imageSize
    );
  });
});
