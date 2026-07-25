import {
  RPG_REFERENCE_CALIBRATION_INPUT,
  RPG_REFERENCE_ROUTE_CONTROL_IDS,
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_BRIDGE,
  RPG_WORLD_CANAL,
  RPG_WORLD_COASTLINE,
  RPG_WORLD_MODEL,
  RPG_WORLD_ROUTES,
  RPG_WORLD_TRANSITIONS,
  RPG_WORLD_ZONES,
  RPG_WORLD_ZONE_IDS,
  type WorldPoint2,
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

/**
 * The pixel size of the approved reference illustration. It is the coordinate
 * system the world registration mesh is measured in, and nothing else: the map
 * the visitor reads is drawn from the world model in plain top-down world
 * coordinates, see RPG_MAP_VIEW_BOX below.
 */
export const RPG_REFERENCE_MAP_VIEW_BOX = {
  width: 1817,
  height: 866,
  padding: 0
} as const;

export type RpgReferencePoint = readonly [x: number, y: number];

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
      referencePixel: projection.pixel,
      headingRotation: projectRpgReferenceMapHeadingRotation(
        arrival.position,
        [arrival.heading[0], 0, arrival.heading[1]]
      )
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
  const current = projectWorldToReference(position);
  if (!current) {
    throw new RangeError("Map point is outside the registered reference terrain.");
  }
  const unitX = heading[0] / headingLength;
  const unitZ = heading[2] / headingLength;

  /**
   * Reads the direction by comparing a sample a short step along the heading
   * with one the same distance back. In a corner both leave the terrain, and
   * so does a shorter step in some places, so this keeps halving before giving
   * up. A visitor walking into the edge of the world is ordinary; the map
   * arrow is decoration, and it used to throw from here and take the whole
   * renderer down with it.
   */
  const sampleDelta = (step: number) => {
    const offsetX = unitX * step;
    const offsetZ = unitZ * step;
    const ahead = projectWorldToReference([
      position[0] + offsetX,
      position[1],
      position[2] + offsetZ
    ]);
    if (ahead) {
      return [
        ahead.pixel[0] - current.pixel[0],
        ahead.pixel[1] - current.pixel[1]
      ] as const;
    }
    const behind = projectWorldToReference([
      position[0] - offsetX,
      position[1],
      position[2] - offsetZ
    ]);
    if (behind) {
      return [
        current.pixel[0] - behind.pixel[0],
        current.pixel[1] - behind.pixel[1]
      ] as const;
    }
    return null;
  };

  let delta: readonly [number, number] | null = null;
  for (let step = epsilon; step > epsilon / 64 && !delta; step /= 2) {
    delta = sampleDelta(step);
  }

  if (!delta) {
    // Nothing along the heading is on the terrain, which only happens in a
    // corner. The projection is locally smooth, so a sideways pair gives the
    // same rotation once it is turned back a quarter turn.
    for (let step = epsilon; step > epsilon / 64 && !delta; step /= 2) {
      const sideways = projectWorldToReference([
        position[0] - unitZ * step,
        position[1],
        position[2] + unitX * step
      ]);
      if (!sideways) continue;
      const sideDeltaX = sideways.pixel[0] - current.pixel[0];
      const sideDeltaY = sideways.pixel[1] - current.pixel[1];
      delta = [sideDeltaY, -sideDeltaX] as const;
    }
  }

  if (!delta) {
    // The visitor is standing on a point the reference terrain does not cover
    // in any direction. Report the heading unprojected rather than failing:
    // a slightly wrong arrow beats a dead world.
    const fallback = (Math.atan2(unitZ, unitX) * 180) / Math.PI;
    return fallback === -180 ? 180 : fallback;
  }

  const [deltaX, deltaY] = delta;
  const rotation =
    (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
  return rotation === -180 ? 180 : rotation;
}

/* ------------------------------------------------------------------------ *
 * The map the visitor reads.
 *
 * Plain top-down world coordinates: +X is east and draws right, +Z is north
 * and draws up, exactly as RPG_WORLD_ORIENTATION declares. The world is a
 * square, so the drawing is a square, and the shape on screen is the shape of
 * the world. Nothing here comes from the reference illustration.
 * ------------------------------------------------------------------------ */

export const RPG_MAP_PIXELS_PER_WORLD_UNIT = 10;
export const RPG_MAP_EDGE_PADDING = 36;

const MAP_WORLD_WIDTH = RPG_WORLD_BOUNDS.maximumX - RPG_WORLD_BOUNDS.minimumX;
const MAP_WORLD_DEPTH = RPG_WORLD_BOUNDS.maximumZ - RPG_WORLD_BOUNDS.minimumZ;

export const RPG_MAP_VIEW_BOX = {
  width:
    MAP_WORLD_WIDTH * RPG_MAP_PIXELS_PER_WORLD_UNIT +
    RPG_MAP_EDGE_PADDING * 2,
  height:
    MAP_WORLD_DEPTH * RPG_MAP_PIXELS_PER_WORLD_UNIT +
    RPG_MAP_EDGE_PADDING * 2,
  padding: RPG_MAP_EDGE_PADDING
} as const;

export const RPG_MINI_MAP_VIEW_BOX = RPG_MAP_VIEW_BOX;
export const RPG_WORLD_MAP_VIEW_BOX = RPG_MAP_VIEW_BOX;

/**
 * Marker sizes live next to the view box because the padding ring exists to
 * hold them: a visitor standing on the edge of the world still has to be drawn
 * whole. The projection test asserts the padding is at least the largest of
 * these.
 */
export const RPG_MAP_MARKER_GEOMETRY = {
  playerHaloRadius: 24,
  playerDiscRadius: 13,
  playerArrowLength: 30,
  arrivalRadius: 12,
  arrivalRingRadius: 21,
  compassRadius: 30
} as const;

export const RPG_MAP_LABEL_FONT_SIZE = 30;
export const RPG_MINI_MAP_LABEL_CSS_PIXELS = 11;

/**
 * The cream outline the `.rpg-mini-map-label` rule in app/globals.css strokes
 * around every name so it stays readable over the districts. Half of it lies
 * outside the glyphs, which is why the ink band below is wider than the font.
 */
export const RPG_MAP_LABEL_OUTLINE_WIDTH = 7;

/**
 * How far a name's ink reaches above and below its own baseline. SVG text has
 * no box to measure, so this is the em box: an ascender climbs about three
 * quarters of the size above the baseline and a descender drops about a
 * quarter below it, both widened by the outline that is painted around them.
 * It is what makes "does the visitor marker cover this name" answerable
 * without knowing which language the name is written in.
 */
export const RPG_MAP_LABEL_INK_BAND = {
  above: RPG_MAP_LABEL_FONT_SIZE * 0.75 + RPG_MAP_LABEL_OUTLINE_WIDTH / 2,
  below: RPG_MAP_LABEL_FONT_SIZE * 0.25 + RPG_MAP_LABEL_OUTLINE_WIDTH / 2
} as const;
export const RPG_MAP_LAND_SOURCE_ID = "town-ground";
export const RPG_MAP_SCALE_WORLD_UNITS = 20;

export const RPG_MAP_COLORS = {
  sea: "#12293f",
  land: "#efe3c8",
  landEdge: "#7b6448",
  road: "#cbb896",
  roadEdge: "#9a8462",
  canal: "#7fb6cd",
  canalEdge: "#4d8ba8",
  bridge: "#c8804f",
  bridgeEdge: "#8a4f2d"
} as const;

export const RPG_MAP_ZONE_COLORS: Readonly<Record<DestinationId, string>> = {
  airport: "#a9c6c0",
  tokyo: "#a4b3d8",
  gyukatsu: "#dcc096",
  sakura: "#e6b6c6",
  hanabi: "#c2b1dd"
};

function mapWorldXZ(point: WorldPoint2 | WorldPoint3): WorldPoint2 {
  return point.length === 3 ? [point[0], point[2]] : point;
}

const roundMapPixel = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  // Negative zero would reach the DOM as "-0" and read as a different value
  // from the same angle approached the other way round.
  return rounded === 0 ? 0 : rounded;
};

export function projectRpgMapWorldPoint(point: WorldPoint2 | WorldPoint3) {
  const [x, z] = mapWorldXZ(point);
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new RangeError("Map projection requires finite world coordinates.");
  }
  const clampedX = Math.min(
    RPG_WORLD_BOUNDS.maximumX,
    Math.max(RPG_WORLD_BOUNDS.minimumX, x)
  );
  const clampedZ = Math.min(
    RPG_WORLD_BOUNDS.maximumZ,
    Math.max(RPG_WORLD_BOUNDS.minimumZ, z)
  );
  return {
    x: roundMapPixel(
      RPG_MAP_EDGE_PADDING +
        (clampedX - RPG_WORLD_BOUNDS.minimumX) * RPG_MAP_PIXELS_PER_WORLD_UNIT
    ),
    y: roundMapPixel(
      RPG_MAP_EDGE_PADDING +
        (RPG_WORLD_BOUNDS.maximumZ - clampedZ) * RPG_MAP_PIXELS_PER_WORLD_UNIT
    )
  };
}

export function serializeRpgMapWorldPolygon(polygon: WorldPolygon) {
  return polygon
    .map((point) => projectRpgMapWorldPoint(point))
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");
}

/**
 * Degrees for an SVG rotate() on a marker whose rest pose points along +X.
 * Facing world east reads 0 and draws right; facing world north reads -90 and
 * draws up, because screen Y grows downward.
 */
export function projectRpgMapWorldHeadingRotation(
  heading: readonly [number, number, number]
) {
  const [x, , z] = heading;
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new RangeError("Map heading requires finite world coordinates.");
  }
  if (Math.hypot(x, z) < 1e-8) return 0;
  const rotation = roundMapPixel((Math.atan2(-z, x) * 180) / Math.PI);
  return rotation === -180 ? 180 : rotation;
}

export const RPG_MAP_LAND = Object.freeze({
  sourceId: RPG_MAP_LAND_SOURCE_ID,
  polygon: RPG_WORLD_COASTLINE
});

export const RPG_MAP_ROADS = Object.freeze(
  RPG_WORLD_ROUTES.filter(({ surface }) => surface === "road")
);

export const RPG_MAP_CANAL = RPG_WORLD_CANAL;
export const RPG_MAP_BRIDGE = RPG_WORLD_BRIDGE;
export const RPG_MAP_ZONES = RPG_WORLD_ZONES;

type RpgMapLabelAnchor = "start" | "middle" | "end";

/**
 * Where each name sits relative to its marker. The offsets are chosen so no two
 * baselines share a line, which is what keeps the names apart whatever the
 * locale makes them say, and so every name grows towards the middle of the
 * frame instead of off the edge.
 *
 * They also clear the visitor marker at every arrival. A name used to sit a
 * little over half the marker's reach from its own dot, so arriving anywhere
 * buried the top of that district's name, and at Sakura the marker landed in
 * the middle of "Hanabi" as well. Every offset here is therefore at least the
 * marker's reach plus the ink the name puts on that side of its baseline.
 */
const RPG_MAP_LABEL_PLACEMENT: Readonly<
  Record<
    DestinationId,
    { anchor: RpgMapLabelAnchor; offsetX: number; offsetY: number }
  >
> = {
  airport: { anchor: "start", offsetX: 22, offsetY: -52 },
  tokyo: { anchor: "middle", offsetX: 0, offsetY: -51 },
  gyukatsu: { anchor: "middle", offsetX: 0, offsetY: 64 },
  sakura: { anchor: "middle", offsetX: 0, offsetY: 64 },
  hanabi: { anchor: "end", offsetX: -22, offsetY: -56 }
};

export interface RpgMapNode {
  readonly arrivalId: string;
  readonly zoneId: DestinationId;
  readonly worldPosition: WorldPoint3;
  readonly point: { readonly x: number; readonly y: number };
  readonly headingRotation: number;
  readonly label: {
    readonly x: number;
    readonly y: number;
    readonly anchor: RpgMapLabelAnchor;
  };
}

export const RPG_MAP_NODES: readonly RpgMapNode[] = Object.freeze(
  RPG_WORLD_ARRIVALS.map((arrival) => {
    const point = projectRpgMapWorldPoint(arrival.position);
    const placement = RPG_MAP_LABEL_PLACEMENT[arrival.zoneId];
    return Object.freeze({
      arrivalId: arrival.id,
      zoneId: arrival.zoneId,
      worldPosition: arrival.position,
      point,
      headingRotation: projectRpgMapWorldHeadingRotation([
        arrival.heading[0],
        0,
        arrival.heading[1]
      ]),
      label: Object.freeze({
        x: point.x + placement.offsetX,
        y: point.y + placement.offsetY,
        anchor: placement.anchor
      })
    });
  })
);

/**
 * The order the world itself connects its districts in, read off the transition
 * list rather than written down twice. Where a district has more than one way
 * out, the lowest ownership priority is the main road on.
 */
export const RPG_MAP_TOUR_ORDER: readonly DestinationId[] = Object.freeze(
  (() => {
    const nextByZone = new Map<DestinationId, DestinationId>();
    for (const transition of [...RPG_WORLD_TRANSITIONS].sort(
      (first, second) => first.ownershipPriority - second.ownershipPriority
    )) {
      if (!nextByZone.has(transition.fromZoneId)) {
        nextByZone.set(transition.fromZoneId, transition.toZoneId);
      }
    }
    const order: DestinationId[] = [RPG_WORLD_ZONE_IDS[0]];
    const seen = new Set<DestinationId>(order);
    for (
      let next = nextByZone.get(order[0]);
      next !== undefined && !seen.has(next);
      next = nextByZone.get(next)
    ) {
      order.push(next);
      seen.add(next);
    }
    return order;
  })()
);

const nextZoneByZone = new Map<DestinationId, DestinationId>(
  RPG_MAP_TOUR_ORDER.slice(0, -1).map((zoneId, index) => [
    zoneId,
    RPG_MAP_TOUR_ORDER[index + 1]
  ])
);

export function getRpgMapNextZoneId(
  zoneId: DestinationId
): DestinationId | null {
  return nextZoneByZone.get(zoneId) ?? null;
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
  referenceNodes: RPG_REFERENCE_MAP_NODES,
  routes: Object.freeze([...RPG_WORLD_MODEL.routes]),
  zones: Object.freeze([...RPG_WORLD_MODEL.zones]),
  landmarks: Object.freeze(
    RPG_WORLD_MODEL.landmarks.filter(({ id }) => primaryLandmarkIds.has(id))
  ),
  arrivals: Object.freeze([...RPG_WORLD_MODEL.arrivals])
});

/**
 * Every feature either map is allowed to draw, and each one is a thing in the
 * world model. The illustration's shoreline and its five hand-drawn route
 * polylines used to be in here; they described land and paths at coordinates
 * the world does not have, so they are gone.
 */
export const RPG_CANONICAL_MAP_SOURCE_IDS = Object.freeze([
  ...new Set([
    RPG_MAP_LAND_SOURCE_ID,
    ...RPG_MAP_ZONES.map(({ id }) => id),
    ...RPG_MAP_ROADS.map(({ id }) => id),
    RPG_MAP_CANAL.id,
    RPG_MAP_BRIDGE.id,
    ...RPG_MAP_NODES.map(({ arrivalId }) => arrivalId),
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
