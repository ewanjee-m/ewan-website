import {
  RPG_REFERENCE_CALIBRATION_INPUT,
  RPG_REFERENCE_ROUTE_CONTROL_IDS,
  RPG_WORLD_MODEL,
  type WorldPoint3,
  type WorldPolygon
} from "./RpgWorldModel";
import {
  isWalkable,
  projectWorldToReference,
  referenceToScene,
  sceneToWorld
} from "./RpgWorldGeometry";
import type { DestinationId } from "../guide/GuideContract";

export interface RpgMapViewBox {
  width: number;
  height: number;
  padding: number;
}

export interface RpgMapArea {
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}

export type RpgMapHorizontalAxis = "reference-left" | "reference-right";
export type RpgMapVerticalAxis = "reference-up" | "reference-down";
export type RpgMapReferenceOrigin =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export interface RpgMapOrientation {
  readonly rotationRadians: number;
  readonly worldXAxis: RpgMapHorizontalAxis;
  readonly worldZAxis: RpgMapVerticalAxis;
  readonly referenceOrigin: RpgMapReferenceOrigin;
}

export interface RpgMapProjectionConfig {
  readonly bounds: RpgMapArea;
  readonly orientation: RpgMapOrientation;
}

export interface RpgMapProjection {
  projectNormalizedPoint(point: WorldPoint3): { x: number; y: number };
  projectPoint(
    point: WorldPoint3,
    viewBox: RpgMapViewBox
  ): { x: number; y: number };
  projectPolygon(polygon: WorldPolygon, viewBox: RpgMapViewBox): string;
  projectArea(area: RpgMapArea, viewBox: RpgMapViewBox): {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  projectDistance(worldDistance: number, viewBox: RpgMapViewBox): number;
  projectHeadingRotation(
    heading: readonly [number, number, number]
  ): number;
}

export const RPG_REFERENCE_MAP_VIEW_BOX = {
  width: 1817,
  height: 866,
  padding: 0
} as const;

export const RPG_MINI_MAP_VIEW_BOX = RPG_REFERENCE_MAP_VIEW_BOX;
export const RPG_WORLD_MAP_VIEW_BOX = RPG_REFERENCE_MAP_VIEW_BOX;

export type RpgReferencePoint = readonly [x: number, y: number];

export const RPG_REFERENCE_MAP_COASTLINE = Object.freeze([
  [0, 430],
  [110, 380],
  [300, 330],
  [520, 290],
  [760, 275],
  [1020, 295],
  [1240, 340],
  [1410, 390],
  [1600, 370],
  [1816, 360],
  [1816, 650],
  [1760, 720],
  [1670, 780],
  [1585, 790],
  [1530, 745],
  [1490, 675],
  [1425, 620],
  [1340, 655],
  [1280, 745],
  [1160, 820],
  [960, 855],
  [650, 865],
  [340, 825],
  [100, 690]
] as const satisfies readonly RpgReferencePoint[]);

const referenceRouteControlById = new Map(
  RPG_REFERENCE_CALIBRATION_INPUT.controlPoints.map((control) => [
    control.id,
    control
  ])
);

const referenceRoutePoints = (
  routeId: keyof typeof RPG_REFERENCE_ROUTE_CONTROL_IDS
) =>
  Object.freeze(
    RPG_REFERENCE_ROUTE_CONTROL_IDS[routeId].map((id) => {
      const control = referenceRouteControlById.get(id);
      if (!control) {
        throw new RangeError(`Missing reference route control: ${id}`);
      }
      return control.referencePixel;
    })
  );

export const RPG_REFERENCE_MAP_TRANSITIONS = Object.freeze([
  {
    id: "airport-to-tokyo",
    fromZoneId: "airport",
    toZoneId: "tokyo",
    kind: "road",
    points: referenceRoutePoints("airport-to-tokyo")
  },
  {
    id: "airport-to-gyukatsu",
    fromZoneId: "airport",
    toZoneId: "gyukatsu",
    kind: "road",
    points: referenceRoutePoints("airport-to-gyukatsu")
  },
  {
    id: "tokyo-to-gyukatsu",
    fromZoneId: "tokyo",
    toZoneId: "gyukatsu",
    kind: "road",
    points: referenceRoutePoints("tokyo-to-gyukatsu")
  },
  {
    id: "gyukatsu-to-sakura",
    fromZoneId: "gyukatsu",
    toZoneId: "sakura",
    kind: "road",
    points: referenceRoutePoints("gyukatsu-to-sakura")
  },
  {
    id: "sakura-to-hanabi",
    fromZoneId: "sakura",
    toZoneId: "hanabi",
    kind: "bridge",
    points: referenceRoutePoints("sakura-to-hanabi")
  }
] as const satisfies readonly {
  id: string;
  fromZoneId: DestinationId;
  toZoneId: DestinationId;
  kind: "road" | "bridge";
  points: readonly RpgReferencePoint[];
}[]);

export const RPG_REFERENCE_MAP_NODES = Object.freeze(
  RPG_WORLD_MODEL.arrivals.map((arrival) => {
    const projection = projectWorldToReference(arrival.position);
    if (!projection) {
      throw new RangeError(
        `Map arrival is outside the registered reference terrain: ${arrival.id}`
      );
    }
    return Object.freeze({
      id: arrival.id,
      arrivalId: arrival.id,
      zoneId: arrival.zoneId,
      worldPosition: arrival.position,
      referencePixel: projection.pixel
    });
  })
);

export function serializeRpgReferencePoints(
  points: readonly RpgReferencePoint[]
) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

export function projectRpgReferenceMapPoint(point: WorldPoint3) {
  const projection = projectWorldToReference(point);
  if (!projection) {
    throw new RangeError("Map point is outside the registered reference terrain.");
  }
  return { x: projection.pixel[0], y: projection.pixel[1] };
}

export function unprojectRpgReferenceMapPoint(
  point: readonly [number, number]
): WorldPoint3 | null {
  const scene = referenceToScene(point);
  return scene ? sceneToWorld(scene) : null;
}

export function isRpgReferenceMapPointWalkable(
  point: readonly [number, number]
) {
  const world = unprojectRpgReferenceMapPoint(point);
  return world !== null && isWalkable(world);
}

export function projectRpgWorldPolygon(polygon: WorldPolygon) {
  return polygon.map((point) => {
    const projection = projectWorldToReference(point);
    if (!projection) {
      throw new RangeError(
        `Map polygon point is outside registration: ${point}`
      );
    }
    return projection.pixel;
  });
}

export function projectRpgReferenceMapHeadingRotation(
  position: WorldPoint3,
  heading: readonly [number, number, number],
  epsilon = 0.25
) {
  if (![...position, ...heading, epsilon].every(Number.isFinite)) {
    throw new RangeError("Map heading requires finite world coordinates.");
  }
  const headingLength = Math.hypot(heading[0], heading[2]);
  if (headingLength < 1e-8) return 0;
  if (epsilon <= 0) {
    throw new RangeError("Map heading epsilon must be positive.");
  }
  const current = projectRpgReferenceMapPoint(position);
  const next = projectRpgReferenceMapPoint([
    position[0] + (heading[0] / headingLength) * epsilon,
    position[1],
    position[2] + (heading[2] / headingLength) * epsilon
  ]);
  const rotation =
    (Math.atan2(next.y - current.y, next.x - current.x) * 180) /
    Math.PI;
  return rotation === -180 ? 180 : rotation;
}

const primaryLandmarkIds = new Set(
  RPG_WORLD_MODEL.zones.map(({ primaryLandmarkId }) => primaryLandmarkId)
);
const landSurface = RPG_WORLD_MODEL.sceneSurfaces.find(
  ({ kind }) => kind === "ground"
)!;
const waterSurface = RPG_WORLD_MODEL.sceneSurfaces.find(
  ({ id }) => id === RPG_WORLD_MODEL.water.id
)!;
const canalLandmark = RPG_WORLD_MODEL.landmarks.find(
  ({ id }) => id === RPG_WORLD_MODEL.canal.id
)!;
const bridgeLandmark = RPG_WORLD_MODEL.landmarks.find(
  ({ id }) => id === RPG_WORLD_MODEL.bridge.id
)!;

export const RPG_CANONICAL_MAP_GEOMETRY = Object.freeze({
  bounds: RPG_WORLD_MODEL.bounds,
  orientation: RPG_WORLD_MODEL.orientation,
  water: Object.freeze({
    sourceId: RPG_WORLD_MODEL.water.id,
    polygon: RPG_WORLD_MODEL.water.polygon,
    color: waterSurface.color
  }),
  land: Object.freeze({
    sourceId: landSurface.id,
    polygon: RPG_WORLD_MODEL.coastline,
    color: landSurface.color
  }),
  coastline: Object.freeze({
    sourceId: landSurface.id,
    polygon: RPG_WORLD_MODEL.coastline,
    color: landSurface.accent ?? landSurface.color
  }),
  canal: Object.freeze({
    sourceId: RPG_WORLD_MODEL.canal.id,
    polygon: RPG_WORLD_MODEL.canal.polygon,
    color: canalLandmark.color
  }),
  bridge: Object.freeze({
    sourceId: RPG_WORLD_MODEL.bridge.id,
    polygon: RPG_WORLD_MODEL.bridge.polygon,
    color: bridgeLandmark.color
  }),
  referenceCoastline: RPG_REFERENCE_MAP_COASTLINE,
  referenceTransitions: RPG_REFERENCE_MAP_TRANSITIONS,
  referenceNodes: RPG_REFERENCE_MAP_NODES,
  routes: Object.freeze([...RPG_WORLD_MODEL.routes]),
  zones: Object.freeze([...RPG_WORLD_MODEL.zones]),
  landmarks: Object.freeze(
    RPG_WORLD_MODEL.landmarks.filter(({ id }) => primaryLandmarkIds.has(id))
  ),
  arrivals: Object.freeze([...RPG_WORLD_MODEL.arrivals])
});

export const RPG_CANONICAL_MAP_SOURCE_IDS = Object.freeze([
  ...new Set([
    "approved-reference-coastline",
    ...RPG_REFERENCE_MAP_TRANSITIONS.map(({ id }) => id),
    ...RPG_REFERENCE_MAP_NODES.map(({ zoneId }) => zoneId),
    ...RPG_REFERENCE_MAP_NODES.map(({ arrivalId }) => arrivalId),
    "player"
  ])
]);

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`);
  }
}

function validateProjectionConfig({
  bounds,
  orientation
}: RpgMapProjectionConfig) {
  assertFinite(bounds.minimumX, "Map minimum X");
  assertFinite(bounds.maximumX, "Map maximum X");
  assertFinite(bounds.minimumZ, "Map minimum Z");
  assertFinite(bounds.maximumZ, "Map maximum Z");
  if (
    bounds.maximumX <= bounds.minimumX ||
    bounds.maximumZ <= bounds.minimumZ
  ) {
    throw new RangeError("Map bounds must have positive width and depth.");
  }
  assertFinite(orientation.rotationRadians, "Map orientation rotation");
}

function getMapPlacement(
  bounds: RpgMapArea,
  viewBox: RpgMapViewBox
) {
  assertFinite(viewBox.width, "Map view-box width");
  assertFinite(viewBox.height, "Map view-box height");
  assertFinite(viewBox.padding, "Map view-box padding");
  const drawableWidth = viewBox.width - viewBox.padding * 2;
  const drawableHeight = viewBox.height - viewBox.padding * 2;
  if (drawableWidth <= 0 || drawableHeight <= 0) {
    throw new RangeError("Map view box must contain a drawable area.");
  }
  const worldWidth = bounds.maximumX - bounds.minimumX;
  const worldDepth = bounds.maximumZ - bounds.minimumZ;
  const scale = Math.min(
    drawableWidth / worldWidth,
    drawableHeight / worldDepth
  );
  return {
    scale,
    offsetX: (viewBox.width - worldWidth * scale) / 2,
    offsetY: (viewBox.height - worldDepth * scale) / 2
  };
}

export function createRpgMapProjection({
  bounds,
  orientation
}: RpgMapProjectionConfig): RpgMapProjection {
  validateProjectionConfig({ bounds, orientation });
  const worldWidth = bounds.maximumX - bounds.minimumX;
  const worldDepth = bounds.maximumZ - bounds.minimumZ;
  const xPointsRight = orientation.worldXAxis === "reference-right";
  const zPointsUp = orientation.worldZAxis === "reference-up";
  const originAtRight = orientation.referenceOrigin.endsWith("right");
  const originAtBottom = orientation.referenceOrigin.startsWith("bottom");

  const projectNormalizedPoint = (point: WorldPoint3) => {
    const x = point[0];
    const z = point[2];
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      throw new RangeError(
        "Map projection requires finite world coordinates."
      );
    }
    const worldX = Math.min(
      1,
      Math.max(0, (x - bounds.minimumX) / worldWidth)
    );
    const worldZ = Math.min(
      1,
      Math.max(0, (z - bounds.minimumZ) / worldDepth)
    );
    const topLeftX = xPointsRight ? worldX : 1 - worldX;
    const topLeftY = zPointsUp ? 1 - worldZ : worldZ;

    // Normalized coordinates are expressed from the model's declared
    // reference origin. SVG placement converts them back to top-left space.
    return {
      x: originAtRight ? 1 - topLeftX : topLeftX,
      y: originAtBottom ? 1 - topLeftY : topLeftY
    };
  };

  const projectPoint = (point: WorldPoint3, viewBox: RpgMapViewBox) => {
    const { scale, offsetX, offsetY } = getMapPlacement(bounds, viewBox);
    const normalized = projectNormalizedPoint(point);
    const topLeftX = originAtRight ? 1 - normalized.x : normalized.x;
    const topLeftY = originAtBottom ? 1 - normalized.y : normalized.y;
    return {
      x: offsetX + topLeftX * worldWidth * scale,
      y: offsetY + topLeftY * worldDepth * scale
    };
  };

  const projectPolygon = (
    polygon: WorldPolygon,
    viewBox: RpgMapViewBox
  ) =>
    polygon
      .map(([x, z]) => projectPoint([x, 0, z], viewBox))
      .map(({ x, y }) => `${x},${y}`)
      .join(" ");

  const projectArea = (area: RpgMapArea, viewBox: RpgMapViewBox) => {
    const corners = [
      [area.minimumX, 0, area.minimumZ],
      [area.minimumX, 0, area.maximumZ],
      [area.maximumX, 0, area.minimumZ],
      [area.maximumX, 0, area.maximumZ]
    ] as const;
    const projected = corners.map((point) => projectPoint(point, viewBox));
    const xs = projected.map(({ x }) => x);
    const ys = projected.map(({ y }) => y);
    const minimumX = Math.min(...xs);
    const maximumX = Math.max(...xs);
    const minimumY = Math.min(...ys);
    const maximumY = Math.max(...ys);
    return {
      x: minimumX,
      y: minimumY,
      width: maximumX - minimumX,
      height: maximumY - minimumY
    };
  };

  const projectDistance = (
    worldDistance: number,
    viewBox: RpgMapViewBox
  ) => worldDistance * getMapPlacement(bounds, viewBox).scale;

  const projectHeadingRotation = (
    heading: readonly [number, number, number]
  ) => {
    const x = heading[0];
    const z = heading[2];
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      throw new RangeError("Map heading requires finite world coordinates.");
    }
    if (Math.hypot(x, z) < 1e-8) {
      return 0;
    }
    const mapX = xPointsRight ? x : -x;
    const mapY = zPointsUp ? -z : z;
    const rotation = (Math.atan2(mapX, -mapY) * 180) / Math.PI;
    return rotation === -180 ? 180 : rotation;
  };

  return Object.freeze({
    projectNormalizedPoint,
    projectPoint,
    projectPolygon,
    projectArea,
    projectDistance,
    projectHeadingRotation
  });
}

export const RPG_CANONICAL_MAP_PROJECTION = createRpgMapProjection({
  bounds: RPG_CANONICAL_MAP_GEOMETRY.bounds,
  orientation: RPG_CANONICAL_MAP_GEOMETRY.orientation
});

export function projectRpgNormalizedMapPoint(point: WorldPoint3) {
  return RPG_CANONICAL_MAP_PROJECTION.projectNormalizedPoint(point);
}

export function projectRpgMapPoint(
  point: WorldPoint3,
  viewBox: RpgMapViewBox
) {
  return RPG_CANONICAL_MAP_PROJECTION.projectPoint(point, viewBox);
}

export function projectRpgMapPolygon(
  polygon: WorldPolygon,
  viewBox: RpgMapViewBox
) {
  return RPG_CANONICAL_MAP_PROJECTION.projectPolygon(polygon, viewBox);
}

export function projectRpgMapArea(area: RpgMapArea, viewBox: RpgMapViewBox) {
  return RPG_CANONICAL_MAP_PROJECTION.projectArea(area, viewBox);
}

export function projectRpgMapDistance(
  worldDistance: number,
  viewBox: RpgMapViewBox
) {
  return RPG_CANONICAL_MAP_PROJECTION.projectDistance(
    worldDistance,
    viewBox
  );
}

export function projectRpgMapHeadingRotation(
  heading: readonly [number, number, number]
) {
  return RPG_CANONICAL_MAP_PROJECTION.projectHeadingRotation(heading);
}

export function projectRpgMiniMapPoint(
  point: readonly [number, number, number]
) {
  return projectRpgMapPoint(point, RPG_MINI_MAP_VIEW_BOX);
}

export function projectRpgMiniMapArea(area: RpgMapArea) {
  return projectRpgMapArea(area, RPG_MINI_MAP_VIEW_BOX);
}

export function projectRpgMiniMapHeadingRotation(
  heading: readonly [number, number, number]
) {
  return projectRpgMapHeadingRotation(heading);
}
