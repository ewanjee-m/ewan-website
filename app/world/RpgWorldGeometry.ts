import type { DestinationId } from "../guide/GuideContract";
import {
  RPG_REFERENCE_CALIBRATION_INPUT,
  RPG_REFERENCE_REGISTRATION,
  RPG_PLAYER_COLLISION_RADIUS,
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_ATOMIC_CELLS,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_BRIDGE,
  RPG_WORLD_CANAL,
  RPG_WORLD_COLLISIONS,
  RPG_WORLD_ORIENTATION,
  RPG_WORLD_ROUTES,
  RPG_WORLD_CELLS,
  RPG_WORLD_ZONE_IDS,
  RPG_WORLD_TRANSITIONS,
  RPG_WORLD_ZONES,
  type ReferenceAnchor,
  type ReferenceCalibrationControl,
  type ReferenceControlPoint,
  type ReferenceTriangle,
  type WorldPoint2,
  type WorldPoint3,
  type WorldPolygon
} from "./RpgWorldModel";

export const REGION_EPSILON = 1e-6;
const REFINEMENT_EPSILON = 1e-12;

function point2(position: WorldPoint2 | WorldPoint3): WorldPoint2 {
  return position.length === 3 ? [position[0], position[2]] : position;
}

function hasFiniteWorldCoordinates(position: WorldPoint2 | WorldPoint3) {
  const [x, z] = point2(position);
  return Number.isFinite(x) && Number.isFinite(z);
}

function signedArea(a: WorldPoint2, b: WorldPoint2, c: WorldPoint2) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function barycentricWeights(
  position: WorldPoint2,
  first: WorldPoint2,
  second: WorldPoint2,
  third: WorldPoint2
) {
  const area = signedArea(first, second, third);
  if (!Number.isFinite(area) || Math.abs(area) <= REFINEMENT_EPSILON) return null;
  const w0 = signedArea(position, second, third) / area;
  const w1 = signedArea(first, position, third) / area;
  const weights = [w0, w1, 1 - w0 - w1] as const;
  return weights.every(Number.isFinite) ? weights : null;
}

function distanceToSegmentSquared(
  point: WorldPoint2,
  start: WorldPoint2,
  end: WorldPoint2
) {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) {
    return (point[0] - start[0]) ** 2 + (point[1] - start[1]) ** 2;
  }
  const progress = Math.min(
    1,
    Math.max(
      0,
      ((point[0] - start[0]) * dx + (point[1] - start[1]) * dz) /
        lengthSquared
    )
  );
  const closestX = start[0] + progress * dx;
  const closestZ = start[1] + progress * dz;
  return (point[0] - closestX) ** 2 + (point[1] - closestZ) ** 2;
}

export function polygonContainsPoint(
  polygon: WorldPolygon,
  position: WorldPoint2 | WorldPoint3,
  epsilon = REGION_EPSILON
) {
  if (!hasFiniteWorldCoordinates(position)) return false;
  const [x, z] = point2(position);
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, az] = polygon[previous];
    const [bx, bz] = polygon[index];
    if (distanceToSegmentSquared([x, z], [ax, az], [bx, bz]) <= epsilon ** 2) return true;
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

function transitionProgress(
  centerline: readonly [WorldPoint2, WorldPoint2],
  position: WorldPoint2 | WorldPoint3
) {
  const [x, z] = point2(position);
  const [[ax, az], [bx, bz]] = centerline;
  const dx = bx - ax;
  const dz = bz - az;
  return Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
}

export function getTransitionAt(position: WorldPoint2 | WorldPoint3) {
  if (!hasFiniteWorldCoordinates(position)) return null;
  return RPG_WORLD_TRANSITIONS
    .filter(({ polygon }) => polygonContainsPoint(polygon, position))
    .reduce<(typeof RPG_WORLD_TRANSITIONS)[number] | null>(
      (owner, candidate) =>
        owner === null ||
        candidate.ownershipPriority < owner.ownershipPriority ||
        (candidate.ownershipPriority === owner.ownershipPriority && candidate.id < owner.id)
          ? candidate
          : owner,
      null
    );
}

export function getZoneAt(position: WorldPoint2 | WorldPoint3) {
  if (!hasFiniteWorldCoordinates(position)) return null;
  if (getTransitionAt(position)) return null;
  return RPG_WORLD_ZONES
    .filter(({ polygon }) => polygonContainsPoint(polygon, position))
    .reduce<(typeof RPG_WORLD_ZONES)[number] | null>(
      (owner, candidate) =>
        owner === null ||
        RPG_WORLD_ZONE_IDS.indexOf(candidate.id) < RPG_WORLD_ZONE_IDS.indexOf(owner.id)
          ? candidate
          : owner,
      null
    );
}

export type NavigationRegion =
  | { kind: "zone"; regionId: DestinationId; displayZoneId: DestinationId; highlightedZoneIds: readonly [DestinationId] }
  | {
      kind: "transition";
      regionId: string;
      transitionId: string;
      fromZoneId: DestinationId;
      toZoneId: DestinationId;
      progress: number;
      displayZoneId: DestinationId;
      highlightedZoneIds: readonly DestinationId[];
    };

export function getNavigationRegionAt(position: WorldPoint2 | WorldPoint3): NavigationRegion | null {
  if (!hasFiniteWorldCoordinates(position)) return null;
  const transition = getTransitionAt(position);
  if (transition) {
    const progress = transitionProgress(transition.centerline, position);
    const [dualStart, dualEnd] = transition.dualProtectionRange;
    return {
      kind: "transition",
      regionId: transition.id,
      transitionId: transition.id,
      fromZoneId: transition.fromZoneId,
      toZoneId: transition.toZoneId,
      progress,
      displayZoneId: progress < 0.5 ? transition.fromZoneId : transition.toZoneId,
      highlightedZoneIds:
        progress < dualStart
          ? [transition.fromZoneId]
          : progress <= dualEnd
            ? [transition.fromZoneId, transition.toZoneId]
            : [transition.toZoneId]
    };
  }
  const zone = getZoneAt(position);
  return zone
    ? { kind: "zone", regionId: zone.id, displayZoneId: zone.id, highlightedZoneIds: [zone.id] }
    : null;
}

export function getArrival(zoneId: DestinationId) {
  return RPG_WORLD_ARRIVALS.find((arrival) => arrival.zoneId === zoneId)!;
}

function pointInCollision([x, z]: WorldPoint2) {
  return RPG_WORLD_COLLISIONS.some(({ center, halfSize }) =>
    Math.abs(x - center[0]) <= halfSize[0] + RPG_PLAYER_COLLISION_RADIUS &&
    Math.abs(z - center[1]) <= halfSize[1] + RPG_PLAYER_COLLISION_RADIUS
  );
}

export function isWalkable(position: WorldPoint2 | WorldPoint3) {
  if (!hasFiniteWorldCoordinates(position)) return false;
  const [x, z] = point2(position);
  if (x < RPG_WORLD_BOUNDS.minimumX || x > RPG_WORLD_BOUNDS.maximumX || z < RPG_WORLD_BOUNDS.minimumZ || z > RPG_WORLD_BOUNDS.maximumZ) return false;
  if (!RPG_WORLD_ROUTES.some(({ polygon }) => polygonContainsPoint(polygon, [x, z]))) {
    return false;
  }
  const onBridge = polygonContainsPoint(RPG_WORLD_BRIDGE.polygon, [x, z]);
  if (!onBridge && polygonContainsPoint(RPG_WORLD_CANAL.polygon, [x, z])) {
    return false;
  }
  return !pointInCollision([x, z]);
}

export function getSurfaceHeight(position: WorldPoint2 | WorldPoint3) {
  if (!hasFiniteWorldCoordinates(position)) return 0;
  const [x, z] = point2(position);
  if (!polygonContainsPoint(RPG_WORLD_BRIDGE.polygon, [x, z])) return 0;
  const minimumX = RPG_WORLD_BRIDGE.polygon[0][0];
  const maximumX = RPG_WORLD_BRIDGE.polygon[1][0];
  const progress = Math.min(1, Math.max(0, (x - minimumX) / (maximumX - minimumX)));
  return RPG_WORLD_BRIDGE.surfaceHeight + Math.sin(Math.PI * progress) * RPG_WORLD_BRIDGE.archRise;
}

export function getSurfaceNormal(
  position: WorldPoint2 | WorldPoint3,
  epsilon = 0.05
): WorldPoint3 {
  const [x, z] = point2(position);
  const dx =
    getSurfaceHeight([x + epsilon, z]) -
    getSurfaceHeight([x - epsilon, z]);
  const dz =
    getSurfaceHeight([x, z + epsilon]) -
    getSurfaceHeight([x, z - epsilon]);
  const length = Math.hypot(dx, epsilon * 2, dz);
  return [-dx / length, (epsilon * 2) / length, -dz / length];
}

export interface RuntimeReferenceTriangle extends ReferenceTriangle {
  readonly atomicTriangleId: string;
  readonly calibrationTriangleId: string;
}

const calibrationControlById = new Map(
  RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.map((point) => [point.id, point])
);
const atomicControlById = calibrationControlById;

function coordinateKey(point: WorldPoint2) {
  return `${point[0]}:${point[1]}`;
}
const refinedControlById = new Map(
  RPG_REFERENCE_REGISTRATION.controlPoints.map((point) => [point.id, point])
);
const refinedControlByCoordinate = new Map(
  RPG_REFERENCE_REGISTRATION.controlPoints.map((point) => [
    `${point.worldXZ[0]}:${point.worldXZ[1]}`,
    point
  ])
);
const refinedReferenceTriangles: RuntimeReferenceTriangle[] =
  RPG_REFERENCE_REGISTRATION.triangles.map((triangle) => ({
    ...triangle,
    atomicTriangleId: triangle.id,
    calibrationTriangleId: triangle.id
  }));
const refinedTriangleById = new Map(
  refinedReferenceTriangles.map((triangle) => [triangle.id, triangle])
);

function interpolateReferenceTriangle(
  triangle: RuntimeReferenceTriangle,
  world: WorldPoint2
) {
  const controls = triangle.controlPointIds.map((id) => refinedControlById.get(id));
  if (controls.some((control) => control === undefined)) return null;
  const [first, second, third] = controls as unknown as readonly [
    ReferenceControlPoint,
    ReferenceControlPoint,
    ReferenceControlPoint
  ];
  const weights = barycentricWeights(
    world,
    first.worldXZ,
    second.worldXZ,
    third.worldXZ
  );
  if (!weights || !weights.every((weight) => weight >= -REGION_EPSILON)) return null;
  const points = [first, second, third] as const;
  const interpolate = (read: (point: ReferenceControlPoint) => number) =>
    weights.reduce((sum, weight, index) => sum + weight * read(points[index]), 0);
  const pixel = [
    interpolate((point) => point.referencePixel[0]),
    interpolate((point) => point.referencePixel[1])
  ] as const;
  return {
    pixel,
    uv: [
      pixel[0] / RPG_REFERENCE_REGISTRATION.imageSize[0],
      pixel[1] / RPG_REFERENCE_REGISTRATION.imageSize[1]
    ] as const,
    spriteScale: interpolate((point) => point.spriteScale),
    depthKey: interpolate((point) => point.depthKey),
    triangleId: triangle.id
  };
}

function interpolateCalibrationTriangle(
  triangle: (typeof RPG_REFERENCE_CALIBRATION_INPUT.triangles)[number],
  world: WorldPoint2
) {
  const runtimeTriangle = refinedTriangleById.get(triangle.id);
  if (!runtimeTriangle) return null;
  const sample = interpolateReferenceTriangle(runtimeTriangle, world);
  return sample
    ? {
        referencePixel: sample.pixel,
        spriteScale: sample.spriteScale,
        depthKey: sample.depthKey,
        calibrationTriangleId: triangle.id
      }
    : null;
}

function sampleCalibrationAtWorld(world: WorldPoint2) {
  if (!hasFiniteWorldCoordinates(world)) return null;
  for (const triangle of refinedReferenceTriangles) {
    const sample = interpolateReferenceTriangle(triangle, world);
    if (sample) {
      return {
        referencePixel: sample.pixel,
        spriteScale: sample.spriteScale,
        depthKey: sample.depthKey,
        calibrationTriangleId: triangle.id
      };
    }
  }
  return null;
}

const measuredReferenceAnchors = RPG_REFERENCE_REGISTRATION.anchors.flatMap(
  (anchor): ReferenceAnchor[] => {
    const sample = sampleCalibrationAtWorld(anchor.worldXZ);
    return sample
      ? [{
          ...anchor,
          referencePixel: sample.referencePixel,
          spriteScale: sample.spriteScale,
          depthKey: sample.depthKey
        }]
      : [];
  }
);

export const RPG_RUNTIME_REFERENCE_REGISTRATION = {
  id: RPG_REFERENCE_REGISTRATION.id,
  imageSize: RPG_REFERENCE_REGISTRATION.imageSize,
  orientation: RPG_REFERENCE_REGISTRATION.orientation,
  controlPoints: [...refinedControlById.values()],
  triangles: refinedReferenceTriangles,
  anchors: measuredReferenceAnchors
} as const;

export function projectWorldToReferenceInTriangle(
  triangleId: string,
  position: WorldPoint2 | WorldPoint3
) {
  if (!hasFiniteWorldCoordinates(position)) return null;
  const world = point2(position);
  const refinedTriangle = refinedTriangleById.get(triangleId);
  if (refinedTriangle) return interpolateReferenceTriangle(refinedTriangle, world);
  return null;
}

export function projectWorldVectorToReferenceInTriangle(
  triangleId: string,
  vector: WorldPoint2
): WorldPoint2 | null {
  if (!vector.every(Number.isFinite)) return null;
  const triangle = refinedTriangleById.get(triangleId);
  if (!triangle) return null;
  const controls = triangle.controlPointIds.map((id) => refinedControlById.get(id));
  if (controls.some((control) => control === undefined)) return null;
  const [first, second, third] = controls as unknown as readonly [
    ReferenceControlPoint,
    ReferenceControlPoint,
    ReferenceControlPoint
  ];
  const worldXX = second.worldXZ[0] - first.worldXZ[0];
  const worldXZ = third.worldXZ[0] - first.worldXZ[0];
  const worldZX = second.worldXZ[1] - first.worldXZ[1];
  const worldZZ = third.worldXZ[1] - first.worldXZ[1];
  const determinant = worldXX * worldZZ - worldXZ * worldZX;
  if (Math.abs(determinant) <= REFINEMENT_EPSILON) return null;
  const barycentricX =
    (vector[0] * worldZZ - vector[1] * worldXZ) / determinant;
  const barycentricZ =
    (worldXX * vector[1] - worldZX * vector[0]) / determinant;
  return [
    barycentricX * (second.referencePixel[0] - first.referencePixel[0]) +
      barycentricZ * (third.referencePixel[0] - first.referencePixel[0]),
    barycentricX * (second.referencePixel[1] - first.referencePixel[1]) +
      barycentricZ * (third.referencePixel[1] - first.referencePixel[1])
  ];
}

export function projectWorldToReference(position: WorldPoint2 | WorldPoint3) {
  if (!hasFiniteWorldCoordinates(position)) return null;
  const world = point2(position);
  for (const triangle of refinedReferenceTriangles) {
    const projection = interpolateReferenceTriangle(triangle, world);
    if (projection) return projection;
  }
  return null;
}

export function referenceToScene(pixel: readonly [number, number]): WorldPoint3 | null {
  if (!Number.isFinite(pixel[0]) || !Number.isFinite(pixel[1])) return null;
  for (const triangle of refinedReferenceTriangles) {
    const controls = triangle.controlPointIds.map((id) => calibrationControlById.get(id));
    if (controls.some((control) => control === undefined)) continue;
    const [first, second, third] = controls as unknown as readonly [
      ReferenceCalibrationControl,
      ReferenceCalibrationControl,
      ReferenceCalibrationControl
    ];
    const weights = barycentricWeights(
      pixel,
      first.referencePixel,
      second.referencePixel,
      third.referencePixel
    );
    if (!weights || !weights.every((weight) => weight >= -REGION_EPSILON)) continue;
    const points = [first, second, third] as const;
    const interpolate = (read: (control: ReferenceCalibrationControl) => number) =>
      weights.reduce((sum, weight, index) => sum + weight * read(points[index]), 0);
    const world = [
      interpolate((control) => control.worldXZ[0]),
      interpolate((control) => control.worldXZ[1])
    ] as const;
    return worldToScene([world[0], 0, world[1]]);
  }
  return null;
}

export function worldToScene(position: WorldPoint3): WorldPoint3 {
  const cosine = Math.cos(RPG_WORLD_ORIENTATION.rotationRadians);
  const sine = Math.sin(RPG_WORLD_ORIENTATION.rotationRadians);
  return [position[0] * cosine + position[2] * sine, position[1], -position[0] * sine + position[2] * cosine];
}

export function sceneToWorld(position: WorldPoint3): WorldPoint3 {
  const cosine = Math.cos(RPG_WORLD_ORIENTATION.rotationRadians);
  const sine = Math.sin(RPG_WORLD_ORIENTATION.rotationRadians);
  return [position[0] * cosine - position[2] * sine, position[1], position[0] * sine + position[2] * cosine];
}

export function worldToMap(position: WorldPoint2 | WorldPoint3) {
  if (!hasFiniteWorldCoordinates(position)) return null;
  const [x, z] = point2(position);
  return {
    x: Math.min(1, Math.max(0, (x - RPG_WORLD_BOUNDS.minimumX) / 72)),
    y: Math.min(1, Math.max(0, (RPG_WORLD_BOUNDS.maximumZ - z) / 72))
  };
}

export function getCollisionShapes() {
  return RPG_WORLD_COLLISIONS;
}

function polygonArea(polygon: WorldPolygon) {
  return Math.abs(
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point[0] * next[1] - next[0] * point[1];
    }, 0) / 2
  );
}

function rectangleExtents(polygon: WorldPolygon) {
  const xs = polygon.map(([x]) => x);
  const zs = polygon.map(([, z]) => z);
  return {
    minimumX: Math.min(...xs),
    maximumX: Math.max(...xs),
    minimumZ: Math.min(...zs),
    maximumZ: Math.max(...zs)
  };
}

interface TriangleGeometry {
  readonly id: string;
  readonly controlPointIds: readonly [string, string, string];
  readonly points: readonly [WorldPoint2, WorldPoint2, WorldPoint2];
}

function pointStrictlyInsideTriangle(
  point: WorldPoint2,
  [first, second, third]: TriangleGeometry["points"]
) {
  const areas = [
    signedArea(first, second, point),
    signedArea(second, third, point),
    signedArea(third, first, point)
  ];
  if (areas.some((area) => Math.abs(area) <= REGION_EPSILON)) return false;
  return areas.every((area) => area > 0) || areas.every((area) => area < 0);
}

function segmentsProperlyIntersect(
  firstStart: WorldPoint2,
  firstEnd: WorldPoint2,
  secondStart: WorldPoint2,
  secondEnd: WorldPoint2
) {
  const firstStartSide = signedArea(firstStart, firstEnd, secondStart);
  const firstEndSide = signedArea(firstStart, firstEnd, secondEnd);
  const secondStartSide = signedArea(secondStart, secondEnd, firstStart);
  const secondEndSide = signedArea(secondStart, secondEnd, firstEnd);
  return (
    firstStartSide * firstEndSide < -REGION_EPSILON &&
    secondStartSide * secondEndSide < -REGION_EPSILON
  );
}

function trianglesHaveInteriorOverlap(first: TriangleGeometry, second: TriangleGeometry) {
  if (
    first.controlPointIds.every((id) => second.controlPointIds.includes(id)) &&
    second.controlPointIds.every((id) => first.controlPointIds.includes(id))
  ) {
    return true;
  }
  for (let firstEdge = 0; firstEdge < 3; firstEdge += 1) {
    for (let secondEdge = 0; secondEdge < 3; secondEdge += 1) {
      if (
        segmentsProperlyIntersect(
          first.points[firstEdge],
          first.points[(firstEdge + 1) % 3],
          second.points[secondEdge],
          second.points[(secondEdge + 1) % 3]
        )
      ) {
        return true;
      }
    }
  }
  return (
    first.points.some((point) => pointStrictlyInsideTriangle(point, second.points)) ||
    second.points.some((point) => pointStrictlyInsideTriangle(point, first.points))
  );
}

function inspectNonAdjacentTriangleOverlaps(triangles: readonly TriangleGeometry[]) {
  const entries = triangles.map((triangle) => {
    const xs = triangle.points.map(([x]) => x);
    const ys = triangle.points.map(([, y]) => y);
    return {
      triangle,
      minimumX: Math.min(...xs),
      maximumX: Math.max(...xs),
      minimumY: Math.min(...ys),
      maximumY: Math.max(...ys)
    };
  }).sort((first, second) => first.minimumX - second.minimumX);
  let candidateCount = 0;
  let overlapCount = 0;
  for (let firstIndex = 0; firstIndex < entries.length; firstIndex += 1) {
    const first = entries[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < entries.length; secondIndex += 1) {
      const second = entries[secondIndex];
      if (second.minimumX >= first.maximumX - REGION_EPSILON) break;
      if (
        second.minimumY >= first.maximumY - REGION_EPSILON ||
        first.minimumY >= second.maximumY - REGION_EPSILON
      ) {
        continue;
      }
      candidateCount += 1;
      if (trianglesHaveInteriorOverlap(first.triangle, second.triangle)) overlapCount += 1;
    }
  }
  return { candidateCount, overlapCount };
}

function segmentContainedInSegment(
  start: WorldPoint2,
  end: WorldPoint2,
  containerStart: WorldPoint2,
  containerEnd: WorldPoint2
) {
  if (
    Math.abs(signedArea(containerStart, containerEnd, start)) > REGION_EPSILON ||
    Math.abs(signedArea(containerStart, containerEnd, end)) > REGION_EPSILON
  ) {
    return false;
  }
  const dx = containerEnd[0] - containerStart[0];
  const dz = containerEnd[1] - containerStart[1];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= REFINEMENT_EPSILON) return false;
  const progress = (point: WorldPoint2) =>
    ((point[0] - containerStart[0]) * dx + (point[1] - containerStart[1]) * dz) /
    lengthSquared;
  const startProgress = progress(start);
  const endProgress = progress(end);
  return (
    startProgress >= -REGION_EPSILON &&
    startProgress <= 1 + REGION_EPSILON &&
    endProgress >= -REGION_EPSILON &&
    endProgress <= 1 + REGION_EPSILON
  );
}

interface TopologyCellLike {
  readonly polygon: WorldPolygon;
}

interface AxisEdge {
  readonly axis: "horizontal" | "vertical";
  readonly fixed: number;
  readonly minimum: number;
  readonly maximum: number;
}

export function validateCellEdgeConformity(cells: readonly TopologyCellLike[]) {
  const horizontalByZ = new Map<number, AxisEdge[]>();
  const verticalByX = new Map<number, AxisEdge[]>();
  let nonConformingEdgeCount = 0;

  const addEdge = (first: WorldPoint2, second: WorldPoint2) => {
    if (Math.abs(first[1] - second[1]) <= REGION_EPSILON) {
      const edge: AxisEdge = {
        axis: "horizontal",
        fixed: first[1],
        minimum: Math.min(first[0], second[0]),
        maximum: Math.max(first[0], second[0])
      };
      const group = horizontalByZ.get(edge.fixed);
      if (group) group.push(edge);
      else horizontalByZ.set(edge.fixed, [edge]);
      return;
    }
    if (Math.abs(first[0] - second[0]) <= REGION_EPSILON) {
      const edge: AxisEdge = {
        axis: "vertical",
        fixed: first[0],
        minimum: Math.min(first[1], second[1]),
        maximum: Math.max(first[1], second[1])
      };
      const group = verticalByX.get(edge.fixed);
      if (group) group.push(edge);
      else verticalByX.set(edge.fixed, [edge]);
      return;
    }
    nonConformingEdgeCount += 1;
  };

  for (const cell of cells) {
    for (let index = 0; index < cell.polygon.length; index += 1) {
      addEdge(cell.polygon[index], cell.polygon[(index + 1) % cell.polygon.length]);
    }
  }

  const inspectCollinearGroups = (groups: Map<number, AxisEdge[]>) => {
    for (const edges of groups.values()) {
      const exactOwners = new Map<string, number>();
      for (const edge of edges) {
        const key = `${edge.minimum}:${edge.maximum}`;
        exactOwners.set(key, (exactOwners.get(key) ?? 0) + 1);
      }
      nonConformingEdgeCount += [...exactOwners.values()].filter((owners) => owners > 2).length;

      const uniqueEdges = [...new Map(edges.map((edge) => [`${edge.minimum}:${edge.maximum}`, edge])).values()]
        .sort((first, second) => first.minimum - second.minimum || first.maximum - second.maximum);
      for (let firstIndex = 0; firstIndex < uniqueEdges.length; firstIndex += 1) {
        const first = uniqueEdges[firstIndex];
        for (let secondIndex = firstIndex + 1; secondIndex < uniqueEdges.length; secondIndex += 1) {
          const second = uniqueEdges[secondIndex];
          if (second.minimum >= first.maximum - REGION_EPSILON) break;
          const overlap = Math.min(first.maximum, second.maximum) - Math.max(first.minimum, second.minimum);
          if (overlap > REGION_EPSILON) nonConformingEdgeCount += 1;
        }
      }
    }
  };

  inspectCollinearGroups(horizontalByZ);
  inspectCollinearGroups(verticalByX);

  const hasInteriorPoint = (edges: readonly AxisEdge[] | undefined, coordinate: number) =>
    edges?.some(
      ({ minimum, maximum }) =>
        coordinate > minimum + REGION_EPSILON && coordinate < maximum - REGION_EPSILON
    ) ?? false;

  for (const edges of verticalByX.values()) {
    for (const edge of edges) {
      if (hasInteriorPoint(horizontalByZ.get(edge.minimum), edge.fixed)) nonConformingEdgeCount += 1;
      if (hasInteriorPoint(horizontalByZ.get(edge.maximum), edge.fixed)) nonConformingEdgeCount += 1;
    }
  }
  for (const edges of horizontalByZ.values()) {
    for (const edge of edges) {
      if (hasInteriorPoint(verticalByX.get(edge.minimum), edge.fixed)) nonConformingEdgeCount += 1;
      if (hasInteriorPoint(verticalByX.get(edge.maximum), edge.fixed)) nonConformingEdgeCount += 1;
    }
  }

  return { valid: nonConformingEdgeCount === 0, nonConformingEdgeCount };
}

export function validateWorldTopology() {
  const cellExtents = RPG_WORLD_CELLS.map((cell) => ({
    cell,
    ...rectangleExtents(cell.polygon)
  })).sort((first, second) => first.minimumX - second.minimumX);
  let overlapArea = 0;
  for (let firstIndex = 0; firstIndex < cellExtents.length; firstIndex += 1) {
    const first = cellExtents[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < cellExtents.length; secondIndex += 1) {
      const second = cellExtents[secondIndex];
      if (second.minimumX >= first.maximumX - REGION_EPSILON) break;
      const width = Math.min(first.maximumX, second.maximumX) - Math.max(first.minimumX, second.minimumX);
      const depth = Math.min(first.maximumZ, second.maximumZ) - Math.max(first.minimumZ, second.minimumZ);
      if (width > REGION_EPSILON && depth > REGION_EPSILON) overlapArea += width * depth;
    }
  }

  let symmetricDifferenceArea = 0;
  let walkableArea = 0;
  for (const cell of RPG_WORLD_ATOMIC_CELLS) {
    const extents = rectangleExtents(cell.polygon);
    const center: WorldPoint2 = [
      (extents.minimumX + extents.maximumX) / 2,
      (extents.minimumZ + extents.maximumZ) / 2
    ];
    const canonicalWalkable = isWalkable(center);
    const cellArea = polygonArea(cell.polygon);
    if (canonicalWalkable) walkableArea += cellArea;
    if (canonicalWalkable !== cell.walkable) symmetricDifferenceArea += cellArea;
  }

  const { nonConformingEdgeCount } = validateCellEdgeConformity(RPG_WORLD_CELLS);

  const atomicTriangleIds = new Set(
    RPG_REFERENCE_REGISTRATION.triangles.map(({ id }) => id)
  );
  const calibrationTriangleIds = new Set(
    RPG_REFERENCE_CALIBRATION_INPUT.triangles.map(({ id }) => id)
  );
  const regionIds = new Set([
    ...RPG_WORLD_ZONES.map(({ id }) => id),
    ...RPG_WORLD_TRANSITIONS.map(({ id }) => id)
  ]);
  const orphanCellCount = RPG_WORLD_CELLS.filter(
    ({ regionId }) => !regionIds.has(regionId)
  ).length;
  const orphanTriangleCount = refinedReferenceTriangles.filter(
    ({ cellId, atomicTriangleId, calibrationTriangleId }) =>
      cellId !== "reference-domain" ||
      !atomicTriangleIds.has(atomicTriangleId) ||
      !calibrationTriangleIds.has(calibrationTriangleId)
  ).length;

  const missingCalibrationControlCount = RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.filter(
    ({ worldXZ }) => sampleCalibrationAtWorld(worldXZ) === null
  ).length;
  const missingAtomicControlCount = RPG_REFERENCE_REGISTRATION.controlPoints.filter(
    ({ worldXZ }) => !refinedControlByCoordinate.has(coordinateKey(worldXZ))
  ).length;

  const atomicAreaById = new Map<string, number>();
  for (const triangle of RPG_REFERENCE_REGISTRATION.triangles) {
    const controls = triangle.controlPointIds.map((id) => atomicControlById.get(id));
    if (controls.some((control) => control === undefined)) continue;
    const [first, second, third] = controls as unknown as readonly [
      ReferenceControlPoint,
      ReferenceControlPoint,
      ReferenceControlPoint
    ];
    atomicAreaById.set(
      triangle.id,
      signedArea(first.worldXZ, second.worldXZ, third.worldXZ) / 2
    );
  }

  const refinedAreaByAtomicId = new Map<string, number>();
  const worldTriangles: TriangleGeometry[] = [];
  const referenceTriangles: TriangleGeometry[] = [];
  const edgeOwners = new Map<string, RuntimeReferenceTriangle[]>();
  let registrationArea = 0;
  let foldoverCount = 0;
  let calibrationBreaklineCrossingCount = 0;
  let minimumWorldTriangleArea = Number.POSITIVE_INFINITY;
  let minimumReferenceTriangleArea = Number.POSITIVE_INFINITY;
  let maximumDirectPixelError = 0;
  let maximumDirectSpriteScaleError = 0;
  let maximumDirectDepthKeyError = 0;

  for (const triangle of refinedReferenceTriangles) {
    const controls = triangle.controlPointIds.map((id) => refinedControlById.get(id));
    const calibrationTriangle = RPG_REFERENCE_CALIBRATION_INPUT.triangles.find(
      ({ id }) => id === triangle.calibrationTriangleId
    );
    if (controls.some((control) => control === undefined) || !calibrationTriangle) {
      foldoverCount += 1;
      continue;
    }
    const [first, second, third] = controls as unknown as readonly [
      ReferenceControlPoint,
      ReferenceControlPoint,
      ReferenceControlPoint
    ];
    const worldArea = signedArea(first.worldXZ, second.worldXZ, third.worldXZ) / 2;
    const referenceArea = -signedArea(
      first.referencePixel,
      second.referencePixel,
      third.referencePixel
    ) / 2;
    registrationArea += worldArea;
    refinedAreaByAtomicId.set(
      triangle.atomicTriangleId,
      (refinedAreaByAtomicId.get(triangle.atomicTriangleId) ?? 0) + worldArea
    );
    minimumWorldTriangleArea = Math.min(minimumWorldTriangleArea, worldArea);
    minimumReferenceTriangleArea = Math.min(minimumReferenceTriangleArea, referenceArea);
    if (worldArea <= REFINEMENT_EPSILON || referenceArea <= REFINEMENT_EPSILON) {
      foldoverCount += 1;
    }

    const worldPoints = [first.worldXZ, second.worldXZ, third.worldXZ] as const;
    const referencePoints = [
      first.referencePixel,
      second.referencePixel,
      third.referencePixel
    ] as const;
    worldTriangles.push({
      id: triangle.id,
      controlPointIds: triangle.controlPointIds,
      points: worldPoints
    });
    referenceTriangles.push({
      id: triangle.id,
      controlPointIds: triangle.controlPointIds,
      points: referencePoints
    });

    const calibrationControls = calibrationTriangle.controlPointIds.map((id) =>
      calibrationControlById.get(id)
    );
    if (calibrationControls.some((control) => control === undefined)) {
      calibrationBreaklineCrossingCount += 1;
    } else {
      const [calibrationFirst, calibrationSecond, calibrationThird] = calibrationControls as unknown as readonly [
        ReferenceCalibrationControl,
        ReferenceCalibrationControl,
        ReferenceCalibrationControl
      ];
      if (
        worldPoints.some((point) => {
          const weights = barycentricWeights(
            point,
            calibrationFirst.worldXZ,
            calibrationSecond.worldXZ,
            calibrationThird.worldXZ
          );
          return !weights || weights.some((weight) => weight < -REGION_EPSILON);
        })
      ) {
        calibrationBreaklineCrossingCount += 1;
      }
    }

    const centroid: WorldPoint2 = [
      (first.worldXZ[0] + second.worldXZ[0] + third.worldXZ[0]) / 3,
      (first.worldXZ[1] + second.worldXZ[1] + third.worldXZ[1]) / 3
    ];
    const refinedProjection = interpolateReferenceTriangle(triangle, centroid);
    const directProjection = interpolateCalibrationTriangle(calibrationTriangle, centroid);
    if (!refinedProjection || !directProjection) {
      calibrationBreaklineCrossingCount += 1;
    } else {
      maximumDirectPixelError = Math.max(
        maximumDirectPixelError,
        Math.abs(refinedProjection.pixel[0] - directProjection.referencePixel[0]),
        Math.abs(refinedProjection.pixel[1] - directProjection.referencePixel[1])
      );
      maximumDirectSpriteScaleError = Math.max(
        maximumDirectSpriteScaleError,
        Math.abs(refinedProjection.spriteScale - directProjection.spriteScale)
      );
      maximumDirectDepthKeyError = Math.max(
        maximumDirectDepthKeyError,
        Math.abs(refinedProjection.depthKey - directProjection.depthKey)
      );
    }

    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const endpointIds = [
        triangle.controlPointIds[edgeIndex],
        triangle.controlPointIds[(edgeIndex + 1) % 3]
      ].sort();
      const key = endpointIds.join("|");
      const owners = edgeOwners.get(key);
      if (owners) owners.push(triangle);
      else edgeOwners.set(key, [triangle]);
    }
  }

  let maximumAtomicAreaError = 0;
  let uncoveredAtomicTriangleCount = 0;
  for (const [triangleId, atomicArea] of atomicAreaById) {
    const refinedArea = refinedAreaByAtomicId.get(triangleId);
    if (refinedArea === undefined) {
      uncoveredAtomicTriangleCount += 1;
      continue;
    }
    maximumAtomicAreaError = Math.max(
      maximumAtomicAreaError,
      Math.abs(atomicArea - refinedArea)
    );
  }

  const atomicEdgeOwners = new Map<
    string,
    { readonly start: WorldPoint2; readonly end: WorldPoint2 }[]
  >();
  for (const triangle of RPG_REFERENCE_REGISTRATION.triangles) {
    for (let edgeIndex = 0; edgeIndex < 3; edgeIndex += 1) {
      const endpointIds = [
        triangle.controlPointIds[edgeIndex],
        triangle.controlPointIds[(edgeIndex + 1) % 3]
      ].sort();
      const start = atomicControlById.get(endpointIds[0]);
      const end = atomicControlById.get(endpointIds[1]);
      if (!start || !end) continue;
      const key = endpointIds.join("|");
      const owners = atomicEdgeOwners.get(key);
      const edge = { start: start.worldXZ, end: end.worldXZ } as const;
      if (owners) owners.push(edge);
      else atomicEdgeOwners.set(key, [edge]);
    }
  }
  const atomicBoundarySegments = [...atomicEdgeOwners.values()]
    .filter((owners) => owners.length === 1)
    .map(([edge]) => edge);

  let boundaryEdgeCount = 0;
  let unexpectedBoundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  let sharedEdgeCount = 0;
  let sharedEdgeProjectionFailureCount = 0;
  let maximumSharedEdgePixelError = 0;
  let maximumSharedEdgeSpriteScaleError = 0;
  let maximumSharedEdgeDepthKeyError = 0;
  for (const [key, owners] of edgeOwners) {
    if (owners.length === 1) {
      boundaryEdgeCount += 1;
      const [firstId, secondId] = key.split("|");
      const first = refinedControlById.get(firstId);
      const second = refinedControlById.get(secondId);
      if (
        !first ||
        !second ||
        !atomicBoundarySegments.some((boundary) =>
          segmentContainedInSegment(
            first.worldXZ,
            second.worldXZ,
            boundary.start,
            boundary.end
          )
        )
      ) {
        unexpectedBoundaryEdgeCount += 1;
      }
      continue;
    }
    if (owners.length !== 2) {
      nonManifoldEdgeCount += 1;
      continue;
    }
    sharedEdgeCount += 1;
    const [firstId, secondId] = key.split("|");
    const first = refinedControlById.get(firstId);
    const second = refinedControlById.get(secondId);
    if (!first || !second) {
      sharedEdgeProjectionFailureCount += 1;
      continue;
    }
    const midpoint: WorldPoint2 = [
      (first.worldXZ[0] + second.worldXZ[0]) / 2,
      (first.worldXZ[1] + second.worldXZ[1]) / 2
    ];
    const firstProjection = interpolateReferenceTriangle(owners[0], midpoint);
    const secondProjection = interpolateReferenceTriangle(owners[1], midpoint);
    if (!firstProjection || !secondProjection) {
      sharedEdgeProjectionFailureCount += 1;
      continue;
    }
    maximumSharedEdgePixelError = Math.max(
      maximumSharedEdgePixelError,
      Math.abs(firstProjection.pixel[0] - secondProjection.pixel[0]),
      Math.abs(firstProjection.pixel[1] - secondProjection.pixel[1])
    );
    maximumSharedEdgeSpriteScaleError = Math.max(
      maximumSharedEdgeSpriteScaleError,
      Math.abs(firstProjection.spriteScale - secondProjection.spriteScale)
    );
    maximumSharedEdgeDepthKeyError = Math.max(
      maximumSharedEdgeDepthKeyError,
      Math.abs(firstProjection.depthKey - secondProjection.depthKey)
    );
  }

  const worldOverlap = inspectNonAdjacentTriangleOverlaps(worldTriangles);
  const referenceOverlap = inspectNonAdjacentTriangleOverlaps(referenceTriangles);
  let maximumMeasuredControlPixelError = 0;
  let maximumMeasuredControlSpriteScaleError = 0;
  let maximumMeasuredControlDepthKeyError = 0;
  for (const control of RPG_REFERENCE_CALIBRATION_INPUT.controlPoints) {
    const projection = sampleCalibrationAtWorld(control.worldXZ);
    if (!projection) {
      maximumMeasuredControlPixelError = Number.POSITIVE_INFINITY;
      maximumMeasuredControlSpriteScaleError = Number.POSITIVE_INFINITY;
      maximumMeasuredControlDepthKeyError = Number.POSITIVE_INFINITY;
      break;
    }
    maximumMeasuredControlPixelError = Math.max(
      maximumMeasuredControlPixelError,
      Math.abs(projection.referencePixel[0] - control.referencePixel[0]),
      Math.abs(projection.referencePixel[1] - control.referencePixel[1])
    );
    maximumMeasuredControlSpriteScaleError = Math.max(
      maximumMeasuredControlSpriteScaleError,
      Math.abs(projection.spriteScale - control.spriteScale)
    );
    maximumMeasuredControlDepthKeyError = Math.max(
      maximumMeasuredControlDepthKeyError,
      Math.abs(projection.depthKey - control.depthKey)
    );
  }
  const maximumEastBoundaryReferenceX = Math.max(
    ...RPG_REFERENCE_CALIBRATION_INPUT.controlPoints
      .filter(({ worldXZ }) => worldXZ[0] === RPG_WORLD_BOUNDS.maximumX)
      .map(({ referencePixel }) => referencePixel[0])
  );

  return {
    valid:
      overlapArea <= REGION_EPSILON &&
      symmetricDifferenceArea <= REGION_EPSILON &&
      Math.abs(
        registrationArea -
          (RPG_WORLD_BOUNDS.maximumX - RPG_WORLD_BOUNDS.minimumX) *
            (RPG_WORLD_BOUNDS.maximumZ - RPG_WORLD_BOUNDS.minimumZ)
      ) <= REGION_EPSILON &&
      nonConformingEdgeCount === 0 &&
      missingCalibrationControlCount === 0 &&
      missingAtomicControlCount === 0 &&
      uncoveredAtomicTriangleCount === 0 &&
      maximumAtomicAreaError <= REGION_EPSILON &&
      calibrationBreaklineCrossingCount === 0 &&
      foldoverCount === 0 &&
      unexpectedBoundaryEdgeCount === 0 &&
      nonManifoldEdgeCount === 0 &&
      sharedEdgeProjectionFailureCount === 0 &&
      maximumSharedEdgePixelError <= 1 &&
      maximumSharedEdgeSpriteScaleError <= 0.01 &&
      maximumSharedEdgeDepthKeyError <= 0.01 &&
      maximumDirectPixelError <= 1 &&
      maximumDirectSpriteScaleError <= 0.01 &&
      maximumDirectDepthKeyError <= 0.01 &&
      worldOverlap.overlapCount === 0 &&
      referenceOverlap.overlapCount === 0 &&
      maximumMeasuredControlPixelError <= 1 &&
      maximumMeasuredControlSpriteScaleError <= 0.01 &&
      maximumMeasuredControlDepthKeyError <= 0.01 &&
      maximumEastBoundaryReferenceX <= 1751.019 &&
      orphanCellCount === 0 &&
      orphanTriangleCount === 0,
    overlapArea,
    symmetricDifferenceArea,
    registrationArea,
    walkableArea,
    nonConformingEdgeCount,
    refinedControlCount: refinedControlById.size,
    refinedTriangleCount: refinedReferenceTriangles.length,
    missingCalibrationControlCount,
    missingAtomicControlCount,
    uncoveredAtomicTriangleCount,
    maximumAtomicAreaError,
    calibrationBreaklineCrossingCount,
    foldoverCount,
    minimumWorldTriangleArea,
    minimumReferenceTriangleArea,
    boundaryEdgeCount,
    unexpectedBoundaryEdgeCount,
    nonManifoldEdgeCount,
    sharedEdgeCount,
    sharedEdgeProjectionFailureCount,
    maximumSharedEdgePixelError,
    maximumSharedEdgeSpriteScaleError,
    maximumSharedEdgeDepthKeyError,
    maximumDirectPixelError,
    maximumDirectSpriteScaleError,
    maximumDirectDepthKeyError,
    worldOverlapCandidateCount: worldOverlap.candidateCount,
    worldTriangleOverlapCount: worldOverlap.overlapCount,
    referenceOverlapCandidateCount: referenceOverlap.candidateCount,
    referenceTriangleOverlapCount: referenceOverlap.overlapCount,
    maximumMeasuredControlPixelError,
    maximumMeasuredControlSpriteScaleError,
    maximumMeasuredControlDepthKeyError,
    maximumEastBoundaryReferenceX,
    orphanCellCount,
    orphanTriangleCount
  };
}
