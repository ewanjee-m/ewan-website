import type { DestinationId } from "../guide/GuideContract";

export type WorldPoint2 = readonly [x: number, z: number];
export type WorldPoint3 = readonly [x: number, y: number, z: number];
export type WorldPolygon = readonly WorldPoint2[];

export interface WorldBounds {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}

export interface ReferenceProtectedRectangle {
  readonly id: string;
  readonly sourceId: string;
  readonly measuredFeature: string;
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
}

export interface WorldZone {
  readonly id: DestinationId;
  readonly polygon: WorldPolygon;
  readonly displayPolygon: WorldPolygon;
  readonly primaryLandmarkId: string;
  readonly arrivalId: string;
  readonly cameraAnchor: WorldPoint2;
  readonly protectedLandmarkRectangle: ReferenceProtectedRectangle;
  readonly cameraFocusRectangle: ReferenceProtectedRectangle;
}

export interface WorldTransition {
  readonly id: string;
  readonly polygon: WorldPolygon;
  readonly fromZoneId: DestinationId;
  readonly toZoneId: DestinationId;
  readonly centerline: readonly [WorldPoint2, WorldPoint2];
  readonly entryEdge: readonly [WorldPoint2, WorldPoint2];
  readonly exitEdge: readonly [WorldPoint2, WorldPoint2];
  readonly boundaryOwner: "transition";
  readonly ownershipPriority: number;
  readonly dualProtectionRange: readonly [0.4, 0.6];
  readonly fromCameraAnchor: WorldPoint2;
  readonly toCameraAnchor: WorldPoint2;
  readonly fromProtectedLandmarkId: string;
  readonly toProtectedLandmarkId: string;
}

export interface WorldRoute {
  readonly id: string;
  readonly polygon: WorldPolygon;
  readonly surface: "road" | "bridge";
  readonly renderableId: string;
}

export type WorldSceneSurfaceKind = "ground" | "water" | "road" | "sidewalk" | "plaza";

export interface WorldSceneSurface {
  readonly id: string;
  readonly kind: WorldSceneSurfaceKind;
  readonly shape?: "rectangle" | "circle";
  readonly position: WorldPoint3;
  readonly size: WorldPoint3;
  readonly color: string;
  readonly accent?: string;
  readonly sourceRouteId?: string;
}

export type WorldSceneLandmarkKind =
  | "terminal"
  | "bus"
  | "tower"
  | "machiya"
  | "sakuraTree"
  | "canal"
  | "bridge"
  | "stall"
  | "lantern"
  | "torii"
  | "npc"
  | "hanabi";

export interface WorldSceneLandmark {
  readonly id: string;
  readonly kind: WorldSceneLandmarkKind;
  readonly zoneId: DestinationId;
  readonly position: WorldPoint3;
  readonly size: WorldPoint3;
  readonly color: string;
  readonly accent: string;
  readonly blocksMovement: boolean;
  readonly rotationY?: number;
  readonly variant?: number;
  readonly sourceRouteId?: string;
  readonly navigationRegionId?: string;
  readonly collisionPadding?: WorldPoint2;
}

export interface WorldArrival {
  readonly id: string;
  readonly zoneId: DestinationId;
  readonly position: WorldPoint3;
  readonly heading: WorldPoint2;
  readonly approvedReferenceFoot: {
    readonly pixel: readonly [x: number, y: number];
    readonly maximumProjectionErrorPixels: 0.5;
    readonly spriteHeightRangePixels: readonly [minimum: number, maximum: number];
  };
}

export interface WorldCollisionShape {
  readonly id: string;
  readonly sourceId: string;
  readonly kind: "orientedRect";
  readonly center: WorldPoint2;
  readonly halfSize: WorldPoint2;
  readonly rotationRadians: number;
}

export interface ReferenceControlPoint {
  readonly id: string;
  readonly worldXZ: WorldPoint2;
  readonly referencePixel: readonly [x: number, y: number];
  readonly spriteScale: number;
  readonly depthKey: number;
}

export interface ReferenceTriangle {
  readonly id: string;
  readonly cellId: string;
  readonly controlPointIds: readonly [string, string, string];
}

export interface ReferenceAnchor {
  readonly id: string;
  readonly sourceId: string;
  readonly role?: "landmark" | "arrival";
  readonly worldXZ: WorldPoint2;
  readonly referencePixel: readonly [x: number, y: number];
  readonly spriteScale: number;
  readonly depthKey: number;
}

export interface ReferenceRegistration {
  readonly id: "rpg-world-reference-registration";
  readonly imageSize: readonly [width: 1817, height: 866];
  readonly orientation: typeof RPG_WORLD_ORIENTATION;
  readonly controlPoints: readonly ReferenceControlPoint[];
  readonly triangles: readonly ReferenceTriangle[];
  readonly anchors: readonly ReferenceAnchor[];
}

export interface ReferenceZoneAnchor extends ReferenceAnchor {
  readonly zoneId: DestinationId;
  readonly protectedRectangle: ReferenceProtectedRectangle;
  readonly cameraFocusRectangle: ReferenceProtectedRectangle;
}

export type ReferenceWorldFeatureSource =
  | { readonly kind: "landmark"; readonly id: string }
  | { readonly kind: "arrival"; readonly id: string }
  | { readonly kind: "scene-surface"; readonly id: string }
  | { readonly kind: "route-vertex"; readonly id: string; readonly vertexIndex: number }
  | { readonly kind: "transition-centerline"; readonly id: string; readonly pointIndex: 0 | 1 }
  | { readonly kind: "coastline-vertex"; readonly id: "town-coastline"; readonly vertexIndex: number }
  | { readonly kind: "canal-vertex"; readonly id: "sakura-canal"; readonly vertexIndex: number }
  | { readonly kind: "bridge-vertex"; readonly id: "sakura-bridge"; readonly vertexIndex: number };

export interface ReferenceCalibrationControl extends ReferenceControlPoint {
  readonly source?: ReferenceWorldFeatureSource;
  readonly measurementRole:
    | "approved-feature"
    | "derived-surface-control"
    | "navigable-boundary-inset"
    | "arrival-affine-control"
    | "spawn-control"
    | "route-control"
    | "mesh-steiner";
}

export interface ReferenceCalibrationTriangle {
  readonly id: string;
  readonly controlPointIds: readonly [string, string, string];
}

const rectangle = (
  minimumX: number,
  maximumX: number,
  minimumZ: number,
  maximumZ: number
): WorldPolygon => [
  [minimumX, minimumZ],
  [maximumX, minimumZ],
  [maximumX, maximumZ],
  [minimumX, maximumZ]
];

export const RPG_WORLD_BOUNDS: WorldBounds = {
  minimumX: -36,
  maximumX: 36,
  minimumZ: -36,
  maximumZ: 36
} as const;

export const RPG_WORLD_ORIENTATION = {
  rotationRadians: Math.PI / 4,
  worldXAxis: "reference-right",
  worldZAxis: "reference-up",
  referenceOrigin: "top-left"
} as const;

export const RPG_WORLD_ZONE_IDS = [
  "airport",
  "tokyo",
  "gyukatsu",
  "sakura",
  "hanabi"
] as const satisfies readonly DestinationId[];

export const RPG_PRIMARY_LANDMARK_POSITIONS: Readonly<
  Record<DestinationId, WorldPoint3>
> = {
  airport: [-22, 1.075, 1],
  tokyo: [-17, 3.65, 29],
  gyukatsu: [-1, 1.55, 8],
  sakura: [12.7, 3.3, -32.6],
  hanabi: [22, 1.1, -16]
};

const primaryLandmarkXZ = (zoneId: DestinationId): WorldPoint2 => [
  RPG_PRIMARY_LANDMARK_POSITIONS[zoneId][0],
  RPG_PRIMARY_LANDMARK_POSITIONS[zoneId][2]
];

export const RPG_REFERENCE_PROTECTED_RECTANGLES = {
  "airport-limousine-bus": { id: "airport-limousine-bus-protected", sourceId: "airport-limousine-bus", measuredFeature: "airport limousine bus", minimumX: 165, maximumX: 525, minimumY: 430, maximumY: 610 },
  "tokyo-blue-tower": { id: "tokyo-blue-tower-protected", sourceId: "tokyo-blue-tower", measuredFeature: "airport-side Tokyo tower", minimumX: 429, maximumX: 561, minimumY: 65, maximumY: 320 },
  "gyukatsu-main-machiya": { id: "gyukatsu-main-machiya-protected", sourceId: "gyukatsu-main-machiya", measuredFeature: "central gyukatsu machiya", minimumX: 815, maximumX: 1135, minimumY: 285, maximumY: 615 },
  "sakura-tree-01": { id: "sakura-tree-01-protected", sourceId: "sakura-tree-01", measuredFeature: "primary riverside sakura canopy", minimumX: 1040, maximumX: 1455, minimumY: 165, maximumY: 590 },
  "hanabi-apple-stall": { id: "hanabi-apple-stall-protected", sourceId: "hanabi-apple-stall", measuredFeature: "hanabi lantern-market composite", minimumX: 1500, maximumX: 1810, minimumY: 285, maximumY: 570 }
} as const satisfies Readonly<Record<string, ReferenceProtectedRectangle>>;

export const RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES = {
  "airport-limousine-bus": { id: "airport-limousine-bus-camera-focus", sourceId: "airport-limousine-bus", measuredFeature: "airport limousine bus camera focus", minimumX: 325, maximumX: 605, minimumY: 300, maximumY: 650 },
  "tokyo-blue-tower": { id: "tokyo-blue-tower-camera-focus", sourceId: "tokyo-blue-tower", measuredFeature: "airport-side Tokyo tower camera focus", minimumX: 630, maximumX: 900, minimumY: 250, maximumY: 580 },
  "gyukatsu-main-machiya": { id: "gyukatsu-main-machiya-camera-focus", sourceId: "gyukatsu-main-machiya", measuredFeature: "central gyukatsu machiya camera focus", minimumX: 900, maximumX: 1170, minimumY: 350, maximumY: 680 },
  "sakura-tree-01": { id: "sakura-tree-01-camera-focus", sourceId: "sakura-tree-01", measuredFeature: "primary riverside sakura camera focus", minimumX: 1150, maximumX: 1410, minimumY: 330, maximumY: 650 },
  "hanabi-apple-stall": { id: "hanabi-apple-stall-camera-focus", sourceId: "hanabi-apple-stall", measuredFeature: "hanabi lantern-market camera focus", minimumX: 1455, maximumX: 1720, minimumY: 300, maximumY: 590 }
} as const satisfies Readonly<Record<string, ReferenceProtectedRectangle>>;

export const RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES = {
  "airport-to-tokyo:from": { id: "airport-to-tokyo-from-protected", sourceId: "airport-coastal-apron", measuredFeature: "terminal-side apron crossing", minimumX: 360, maximumX: 510, minimumY: 300, maximumY: 470 },
  "airport-to-tokyo:to": { id: "airport-to-tokyo-to-protected", sourceId: "tokyo-neighborhood-paving", measuredFeature: "west Tokyo neighborhood crossing", minimumX: 530, maximumX: 680, minimumY: 330, maximumY: 500 },
  "airport-to-gyukatsu:from": { id: "airport-to-gyukatsu-from-protected", sourceId: "airport-bus-plaza", measuredFeature: "airport bus shelter plaza", minimumX: 280, maximumX: 500, minimumY: 470, maximumY: 610 },
  "airport-to-gyukatsu:to": { id: "airport-to-gyukatsu-to-protected", sourceId: "gyukatsu-stone-plaza", measuredFeature: "west gyukatsu stone crossing", minimumX: 650, maximumX: 820, minimumY: 420, maximumY: 590 },
  "tokyo-to-gyukatsu:from": { id: "tokyo-to-gyukatsu-from-protected", sourceId: "district-volume-tokyo-east-tower", measuredFeature: "east Tokyo transition tower", minimumX: 1000, maximumX: 1150, minimumY: 260, maximumY: 440 },
  "tokyo-to-gyukatsu:to": { id: "tokyo-to-gyukatsu-to-protected", sourceId: "gyukatsu-teahouse-machiya", measuredFeature: "east gyukatsu teahouse facade", minimumX: 1020, maximumX: 1164, minimumY: 380, maximumY: 560 },
  "gyukatsu-to-sakura:from": { id: "gyukatsu-to-sakura-from-protected", sourceId: "gyukatsu-stone-plaza", measuredFeature: "east gyukatsu stone plaza", minimumX: 850, maximumX: 1030, minimumY: 500, maximumY: 680 },
  "gyukatsu-to-sakura:to": { id: "gyukatsu-to-sakura-to-protected", sourceId: "sakura-riverside-garden", measuredFeature: "west sakura riverside garden", minimumX: 1100, maximumX: 1280, minimumY: 400, maximumY: 580 },
  "sakura-to-hanabi:from": { id: "sakura-to-hanabi-from-protected", sourceId: "sakura-bridge", measuredFeature: "recognizable arched bridge", minimumX: 1360, maximumX: 1540, minimumY: 500, maximumY: 680 },
  "sakura-to-hanabi:to": { id: "sakura-to-hanabi-to-protected", sourceId: "hanabi-festival-plaza", measuredFeature: "lantern-market festival plaza", minimumX: 1550, maximumX: 1730, minimumY: 400, maximumY: 580 }
} as const satisfies Readonly<Record<string, ReferenceProtectedRectangle>>;

export const RPG_REFERENCE_ZONE_ANCHORS: Readonly<Record<DestinationId, ReferenceZoneAnchor>> = {
  airport: { id: "airport-measured-zone-anchor", zoneId: "airport", sourceId: "airport-limousine-bus", worldXZ: primaryLandmarkXZ("airport"), referencePixel: [345, 520], spriteScale: 1.08, depthKey: 0.6, protectedRectangle: RPG_REFERENCE_PROTECTED_RECTANGLES["airport-limousine-bus"], cameraFocusRectangle: RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES["airport-limousine-bus"] },
  tokyo: { id: "tokyo-measured-zone-anchor", zoneId: "tokyo", sourceId: "tokyo-blue-tower", worldXZ: primaryLandmarkXZ("tokyo"), referencePixel: [495, 195], spriteScale: 0.72, depthKey: 0.22, protectedRectangle: RPG_REFERENCE_PROTECTED_RECTANGLES["tokyo-blue-tower"], cameraFocusRectangle: RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES["tokyo-blue-tower"] },
  gyukatsu: { id: "gyukatsu-measured-zone-anchor", zoneId: "gyukatsu", sourceId: "gyukatsu-main-machiya", worldXZ: primaryLandmarkXZ("gyukatsu"), referencePixel: [975, 450], spriteScale: 1, depthKey: 0.52, protectedRectangle: RPG_REFERENCE_PROTECTED_RECTANGLES["gyukatsu-main-machiya"], cameraFocusRectangle: RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES["gyukatsu-main-machiya"] },
  sakura: { id: "sakura-measured-zone-anchor", zoneId: "sakura", sourceId: "sakura-tree-01", worldXZ: primaryLandmarkXZ("sakura"), referencePixel: [1245, 375], spriteScale: 0.88, depthKey: 0.43, protectedRectangle: RPG_REFERENCE_PROTECTED_RECTANGLES["sakura-tree-01"], cameraFocusRectangle: RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES["sakura-tree-01"] },
  hanabi: { id: "hanabi-measured-zone-anchor", zoneId: "hanabi", sourceId: "hanabi-apple-stall", worldXZ: primaryLandmarkXZ("hanabi"), referencePixel: [1655, 430], spriteScale: 0.96, depthKey: 0.5, protectedRectangle: RPG_REFERENCE_PROTECTED_RECTANGLES["hanabi-apple-stall"], cameraFocusRectangle: RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES["hanabi-apple-stall"] }
};

const RPG_ZONE_POLYGONS: Readonly<Record<DestinationId, WorldPolygon>> = {
  airport: rectangle(-36, -21, -36, 36),
  tokyo: rectangle(-19, 36, 11, 36),
  gyukatsu: rectangle(-19, 15, -9, 9),
  sakura: rectangle(-19, 15, -36, -11),
  hanabi: rectangle(17, 36, -36, 9)
};

export const RPG_WORLD_ZONES: readonly WorldZone[] = [
  { id: "airport", polygon: RPG_ZONE_POLYGONS.airport, displayPolygon: RPG_ZONE_POLYGONS.airport, primaryLandmarkId: "airport-limousine-bus", arrivalId: "airport-arrival", cameraAnchor: [-30, 0], protectedLandmarkRectangle: RPG_REFERENCE_ZONE_ANCHORS.airport.protectedRectangle, cameraFocusRectangle: RPG_REFERENCE_ZONE_ANCHORS.airport.cameraFocusRectangle },
  { id: "tokyo", polygon: RPG_ZONE_POLYGONS.tokyo, displayPolygon: RPG_ZONE_POLYGONS.tokyo, primaryLandmarkId: "tokyo-blue-tower", arrivalId: "tokyo-arrival", cameraAnchor: [-8, 20], protectedLandmarkRectangle: RPG_REFERENCE_ZONE_ANCHORS.tokyo.protectedRectangle, cameraFocusRectangle: RPG_REFERENCE_ZONE_ANCHORS.tokyo.cameraFocusRectangle },
  { id: "gyukatsu", polygon: RPG_ZONE_POLYGONS.gyukatsu, displayPolygon: RPG_ZONE_POLYGONS.gyukatsu, primaryLandmarkId: "gyukatsu-main-machiya", arrivalId: "gyukatsu-arrival", cameraAnchor: [8, 0], protectedLandmarkRectangle: RPG_REFERENCE_ZONE_ANCHORS.gyukatsu.protectedRectangle, cameraFocusRectangle: RPG_REFERENCE_ZONE_ANCHORS.gyukatsu.cameraFocusRectangle },
  { id: "sakura", polygon: RPG_ZONE_POLYGONS.sakura, displayPolygon: RPG_ZONE_POLYGONS.sakura, primaryLandmarkId: "sakura-tree-01", arrivalId: "sakura-arrival", cameraAnchor: [9, -20], protectedLandmarkRectangle: RPG_REFERENCE_ZONE_ANCHORS.sakura.protectedRectangle, cameraFocusRectangle: RPG_REFERENCE_ZONE_ANCHORS.sakura.cameraFocusRectangle },
  { id: "hanabi", polygon: RPG_ZONE_POLYGONS.hanabi, displayPolygon: RPG_ZONE_POLYGONS.hanabi, primaryLandmarkId: "hanabi-apple-stall", arrivalId: "hanabi-arrival", cameraAnchor: [26, -18], protectedLandmarkRectangle: RPG_REFERENCE_ZONE_ANCHORS.hanabi.protectedRectangle, cameraFocusRectangle: RPG_REFERENCE_ZONE_ANCHORS.hanabi.cameraFocusRectangle }
] as const;

const zoneById = Object.fromEntries(RPG_WORLD_ZONES.map((zone) => [zone.id, zone])) as Record<DestinationId, WorldZone>;
const transition = (
  id: string,
  fromZoneId: DestinationId,
  toZoneId: DestinationId,
  polygon: WorldPolygon,
  centerline: readonly [WorldPoint2, WorldPoint2],
  ownershipPriority: number,
  fromProtectedLandmarkId: string,
  toProtectedLandmarkId: string
): WorldTransition => {
  const xs = polygon.map(([x]) => x);
  const zs = polygon.map(([, z]) => z);
  const [entry, exit] = centerline;
  const horizontal = Math.abs(exit[0] - entry[0]) >= Math.abs(exit[1] - entry[1]);
  return {
    id,
    fromZoneId,
    toZoneId,
    polygon,
    centerline,
    entryEdge: horizontal
      ? [[entry[0], Math.min(...zs)], [entry[0], Math.max(...zs)]]
      : [[Math.min(...xs), entry[1]], [Math.max(...xs), entry[1]]],
    exitEdge: horizontal
      ? [[exit[0], Math.min(...zs)], [exit[0], Math.max(...zs)]]
      : [[Math.min(...xs), exit[1]], [Math.max(...xs), exit[1]]],
    boundaryOwner: "transition",
    ownershipPriority,
    dualProtectionRange: [0.4, 0.6],
    fromCameraAnchor: zoneById[fromZoneId].cameraAnchor,
    toCameraAnchor: zoneById[toZoneId].cameraAnchor,
    fromProtectedLandmarkId,
    toProtectedLandmarkId
  };
};

export const RPG_WORLD_TRANSITIONS: readonly WorldTransition[] = [
  transition("airport-to-tokyo", "airport", "tokyo", rectangle(-21, -19, 17, 23), [[-21, 20], [-19, 20]], 10, "airport-coastal-apron", "tokyo-neighborhood-paving"),
  transition("airport-to-gyukatsu", "airport", "gyukatsu", rectangle(-21, -19, -3, 3), [[-21, 0], [-19, 0]], 20, "airport-bus-plaza", "gyukatsu-stone-plaza"),
  transition("tokyo-to-gyukatsu", "tokyo", "gyukatsu", rectangle(-11, -5, 9, 11), [[-8, 11], [-8, 9]], 30, "district-volume-tokyo-east-tower", "gyukatsu-teahouse-machiya"),
  transition("gyukatsu-to-sakura", "gyukatsu", "sakura", rectangle(5, 11, -11, -9), [[8, -9], [8, -11]], 40, "gyukatsu-stone-plaza", "sakura-riverside-garden"),
  transition("sakura-to-hanabi", "sakura", "hanabi", rectangle(15, 17, -18, -16), [[15, -17], [17, -17]], 50, "sakura-bridge", "hanabi-festival-plaza")
] as const;

export const RPG_TRANSITION_PROTECTED_PAIRS = [
  { transitionId: "airport-to-tokyo", fromId: "airport-coastal-apron", toId: "tokyo-neighborhood-paving", fromRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["airport-to-tokyo:from"], toRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["airport-to-tokyo:to"] },
  { transitionId: "airport-to-gyukatsu", fromId: "airport-bus-plaza", toId: "gyukatsu-stone-plaza", fromRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["airport-to-gyukatsu:from"], toRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["airport-to-gyukatsu:to"] },
  { transitionId: "tokyo-to-gyukatsu", fromId: "district-volume-tokyo-east-tower", toId: "gyukatsu-teahouse-machiya", fromRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["tokyo-to-gyukatsu:from"], toRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["tokyo-to-gyukatsu:to"] },
  { transitionId: "gyukatsu-to-sakura", fromId: "gyukatsu-stone-plaza", toId: "sakura-riverside-garden", fromRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["gyukatsu-to-sakura:from"], toRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["gyukatsu-to-sakura:to"] },
  { transitionId: "sakura-to-hanabi", fromId: "sakura-bridge", toId: "hanabi-festival-plaza", fromRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["sakura-to-hanabi:from"], toRectangle: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES["sakura-to-hanabi:to"] }
] as const;

const RPG_WORLD_BRIDGE_POLYGON = rectangle(14.3, 18.9, -18, -16);

export const RPG_WORLD_ROUTES: readonly WorldRoute[] = [
  { id: "airport-arrival-road", polygon: rectangle(-32.5, -27, -7.5, 20), surface: "road", renderableId: "airport-arrival-road-surface" },
  { id: "tokyo-north-boulevard", polygon: rectangle(-30, -8, 17, 23), surface: "road", renderableId: "tokyo-north-boulevard-surface" },
  { id: "tokyo-center-connector", polygon: rectangle(-11, -5, 0, 23), surface: "road", renderableId: "tokyo-center-connector-surface" },
  { id: "gyukatsu-cross-street", polygon: rectangle(-27, 11, -3, 3), surface: "road", renderableId: "gyukatsu-cross-street-surface" },
  { id: "center-south-connector", polygon: rectangle(5, 11, -20, 3), surface: "road", renderableId: "center-south-connector-surface" },
  { id: "sakura-festival-road", polygon: rectangle(-12, 14.3, -20, -16), surface: "road", renderableId: "sakura-festival-road-surface" },
  { id: "sakura-bridge-route", polygon: RPG_WORLD_BRIDGE_POLYGON, surface: "bridge", renderableId: "sakura-bridge" },
  { id: "hanabi-festival-road", polygon: rectangle(18.9, 26, -19, -14), surface: "road", renderableId: "hanabi-festival-road-surface" }
] as const;

export const RPG_WORLD_SPAWN: WorldPoint3 = [
  -26.304534009865293,
  0,
  -2.973191261452298
];
export const RPG_WORLD_COASTLINE: WorldPolygon = rectangle(-36, 36, -36, 36);
export const RPG_WORLD_WATER = { id: "town-ocean", polygon: rectangle(-56, 56, -56, 56) } as const;
export const RPG_WORLD_CANAL = { id: "sakura-canal", polygon: rectangle(16.6 - 2.2 / 2, 16.6 + 2.2 / 2, -36, 36), waterLevel: -0.42 } as const;
const rpgWorldBridgeRoute = RPG_WORLD_ROUTES.find(
  ({ id }) => id === "sakura-bridge-route"
)!;
export const RPG_WORLD_BRIDGE = { id: "sakura-bridge", routeId: rpgWorldBridgeRoute.id, polygon: rpgWorldBridgeRoute.polygon, surfaceHeight: 0.07, archRise: 0.42 } as const;

const BRIDGE_MINIMUM_X = Math.min(...RPG_WORLD_BRIDGE.polygon.map(([x]) => x));
const BRIDGE_MAXIMUM_X = Math.max(...RPG_WORLD_BRIDGE.polygon.map(([x]) => x));
const BRIDGE_CENTER_X = (BRIDGE_MINIMUM_X + BRIDGE_MAXIMUM_X) / 2;
const BRIDGE_WIDTH = BRIDGE_MAXIMUM_X - BRIDGE_MINIMUM_X;
const FESTIVAL_ROUTE_MINIMUM_Z = Math.min(...RPG_WORLD_BRIDGE.polygon.map(([, z]) => z));
const FESTIVAL_ROUTE_MAXIMUM_Z = Math.max(...RPG_WORLD_BRIDGE.polygon.map(([, z]) => z));
const BRIDGE_ROUTE_HALF_DEPTH =
  (FESTIVAL_ROUTE_MAXIMUM_Z - FESTIVAL_ROUTE_MINIMUM_Z) / 2;
const BRIDGE_CENTER_Z =
  (FESTIVAL_ROUTE_MINIMUM_Z + FESTIVAL_ROUTE_MAXIMUM_Z) / 2;
const TOWN_DEPTH = RPG_WORLD_BOUNDS.maximumZ - RPG_WORLD_BOUNDS.minimumZ;
const CANAL_WIDTH = 2.2;
const CANAL_WEST_BANK_X = BRIDGE_CENTER_X - CANAL_WIDTH / 2;
const CANAL_EAST_BANK_X = BRIDGE_CENTER_X + CANAL_WIDTH / 2;
export const RPG_WORLD_CANAL_WATER_LEVEL = RPG_WORLD_CANAL.waterLevel;

const createRouteSurface = (route: WorldRoute): WorldSceneSurface => {
  const xs = route.polygon.map(([x]) => x);
  const zs = route.polygon.map(([, z]) => z);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumZ = Math.min(...zs);
  const maximumZ = Math.max(...zs);
  return {
    id: route.renderableId,
    kind: "road",
    position: [(minimumX + maximumX) / 2, 0.02, (minimumZ + maximumZ) / 2],
    size: [maximumX - minimumX, 0.08, maximumZ - minimumZ],
    color: "#b8ad9a",
    accent: "#c7bca9",
    sourceRouteId: route.id
  };
};

export const RPG_WORLD_SCENE_SURFACES: readonly WorldSceneSurface[] = [
  {
    id: "town-ocean",
    kind: "water",
    position: [0, -1, 0],
    size: [112, 0.9, 112],
    color: "#397f99",
    accent: "#84c9d4"
  },
  {
    id: "town-meadow",
    kind: "ground",
    position: [
      (RPG_WORLD_BOUNDS.minimumX + CANAL_WEST_BANK_X) / 2,
      -0.6,
      0
    ],
    size: [CANAL_WEST_BANK_X - RPG_WORLD_BOUNDS.minimumX, 1.2, TOWN_DEPTH],
    color: "#7d8d6f",
    accent: "#697a60"
  },
  {
    id: "town-meadow-east",
    kind: "ground",
    position: [
      (CANAL_EAST_BANK_X + RPG_WORLD_BOUNDS.maximumX) / 2,
      -0.6,
      0
    ],
    size: [RPG_WORLD_BOUNDS.maximumX - CANAL_EAST_BANK_X, 1.2, TOWN_DEPTH],
    color: "#788869",
    accent: "#697a60"
  },
  {
    id: "airport-coastal-apron",
    kind: "plaza",
    position: [-28, -0.005, 13],
    size: [15, 0.05, 45],
    color: "#aeb4ae",
    accent: "#d8d5c9"
  },
  {
    id: "tokyo-neighborhood-paving",
    kind: "plaza",
    position: [-8, -0.002, 24],
    size: [23, 0.055, 23],
    color: "#92928b",
    accent: "#c7c0b3"
  },
  {
    id: "gyukatsu-stone-plaza",
    kind: "plaza",
    shape: "circle",
    position: [7, 0.005, 0],
    size: [17, 0.06, 17],
    color: "#afa28e",
    accent: "#d4c7ad"
  },
  {
    id: "sakura-riverside-garden",
    kind: "plaza",
    position: [3.5, -0.004, -22],
    size: [23, 0.05, 23],
    color: "#99988a",
    accent: "#d5c5bb"
  },
  {
    id: "hanabi-riverside-paving",
    kind: "plaza",
    position: [26.9, -0.004, -24],
    size: [18.2, 0.05, 23],
    color: "#77736f",
    accent: "#b3a493"
  },
  ...RPG_WORLD_ROUTES.filter(({ surface }) => surface === "road").map(createRouteSurface),
  {
    id: "tokyo-pedestrian-edge",
    kind: "sidewalk",
    position: [-19, 0.045, 24.4],
    size: [22, 0.13, 1.5],
    color: "#d6cab7",
    accent: "#aa9c88"
  },
  {
    id: "sakura-pedestrian-edge",
    kind: "sidewalk",
    position: [(BRIDGE_MINIMUM_X - 12) / 2, 0.045, -29.4],
    size: [BRIDGE_MINIMUM_X + 12, 0.13, 1.5],
    color: "#d6cab7",
    accent: "#aa9c88"
  },
  {
    id: "airport-bus-plaza",
    kind: "plaza",
    position: [-22.5, 0, 1],
    size: [12, 0.07, 10],
    color: "#9eaa9e",
    accent: "#d7d1c3"
  },
  {
    id: "gyukatsu-courtyard",
    kind: "plaza",
    position: [1, 0, 8],
    size: [12, 0.07, 6],
    color: "#a69d88",
    accent: "#c9bda5"
  },
  {
    id: "hanabi-festival-plaza",
    kind: "plaza",
    position: [27, 0, -24],
    size: [18, 0.07, 11],
    color: "#897d70",
    accent: "#b9aa92"
  }
] as const;

const createSakuraTree = (
  id: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  variant: number,
  blocksMovement = true,
  collisionPadding?: WorldPoint2
): WorldSceneLandmark => ({
  id,
  kind: "sakuraTree",
  zoneId: "sakura",
  position,
  size,
  color: variant % 2 === 0 ? "#6f4d43" : "#795246",
  accent: variant % 2 === 0 ? "#f5abc5" : "#ffc1d4",
  blocksMovement,
  variant,
  collisionPadding
});

const createLantern = (
  id: string,
  x: number,
  z: number,
  variant: number
): WorldSceneLandmark => ({
  id,
  kind: "lantern",
  zoneId: "hanabi",
  position: [x, 1.45, z],
  size: [0.18, 2.9, 0.18],
  color: "#49362f",
  accent: variant % 2 === 0 ? "#ff7a63" : "#ffd170",
  blocksMovement: true,
  variant
});

const createNpc = (
  id: string,
  zoneId: DestinationId,
  position: readonly [number, number, number],
  color: string,
  accent: string,
  variant: number
): WorldSceneLandmark => ({
  id,
  kind: "npc",
  zoneId,
  position,
  size: [0.56, 1.66, 0.56],
  color,
  accent,
  blocksMovement: false,
  variant
});

export const RPG_WORLD_SCENE_LANDMARKS: readonly WorldSceneLandmark[] = [
  {
    id: "airport-terminal",
    kind: "terminal",
    zoneId: "airport",
    position: [-29, 2.1, 28],
    size: [9, 4.2, 4.4],
    color: "#e2e1d9",
    accent: "#d85c4a",
    blocksMovement: true
  },
  {
    id: "airport-limousine-bus",
    kind: "bus",
    zoneId: "airport",
    position: RPG_PRIMARY_LANDMARK_POSITIONS.airport,
    size: [6, 2.15, 2.2],
    color: "#f1eee5",
    accent: "#dc6048",
    blocksMovement: false
  },
  {
    id: "district-volume-airport-terminal-annex",
    kind: "terminal",
    zoneId: "airport",
    position: [-23.4, 1.7, 13.5],
    size: [5.8, 3.4, 5],
    color: "#d9dedb",
    accent: "#d55b47",
    blocksMovement: true,
    variant: 1
  },
  {
    id: "district-volume-airport-control-tower",
    kind: "tower",
    zoneId: "airport",
    position: [-22.3, 3.25, 27],
    size: [3, 6.5, 3],
    color: "#526876",
    accent: "#e77a55",
    blocksMovement: true,
    variant: 3
  },
  {
    id: "tokyo-blue-tower",
    kind: "tower",
    zoneId: "tokyo",
    position: RPG_PRIMARY_LANDMARK_POSITIONS.tokyo,
    size: [3.25, 7.3, 3.1],
    color: "#304c60",
    accent: "#71d0d1",
    blocksMovement: true,
    variant: 0
  },
  {
    id: "tokyo-violet-tower",
    kind: "tower",
    zoneId: "tokyo",
    position: [-11, 2.9, 29],
    size: [3.65, 5.8, 3.15],
    color: "#554a63",
    accent: "#ee80aa",
    blocksMovement: true,
    variant: 1
  },
  {
    id: "tokyo-sunset-tower",
    kind: "tower",
    zoneId: "tokyo",
    position: [-3, 2.45, 29],
    size: [2.25, 4.9, 3],
    color: "#3b5963",
    accent: "#efaf5e",
    blocksMovement: true,
    variant: 2
  },
  {
    id: "district-volume-tokyo-market-tower",
    kind: "tower",
    zoneId: "tokyo",
    position: [-18, 2.6, 14.2],
    size: [3.2, 5.2, 2.8],
    color: "#3e5b62",
    accent: "#f0a85f",
    blocksMovement: true,
    variant: 3
  },
  {
    id: "district-volume-tokyo-neon-tower",
    kind: "tower",
    zoneId: "tokyo",
    position: [-13.8, 3.2, 14],
    size: [3, 6.4, 2.7],
    color: "#4d4664",
    accent: "#ef7fb3",
    blocksMovement: true,
    variant: 4
  },
  {
    id: "district-volume-tokyo-east-tower",
    kind: "tower",
    zoneId: "tokyo",
    position: [-2.4, 3.4, 15.3],
    size: [3.4, 6.8, 3.2],
    color: "#31545f",
    accent: "#5ed4d3",
    blocksMovement: true,
    variant: 5
  },
  {
    id: "district-volume-tokyo-corner-tower",
    kind: "tower",
    zoneId: "tokyo",
    position: [1.5, 2.75, 25.2],
    size: [4, 5.5, 3.6],
    color: "#645367",
    accent: "#f2a269",
    blocksMovement: true,
    variant: 6,
    collisionPadding: [0, 0.5]
  },
  {
    id: "district-volume-tokyo-terrace-tower",
    kind: "tower",
    zoneId: "tokyo",
    position: [-18, 3, 34],
    size: [3, 6, 3],
    color: "#38545d",
    accent: "#79c9d2",
    blocksMovement: true,
    variant: 7
  },
  {
    id: "district-volume-tokyo-amber-tower",
    kind: "tower",
    zoneId: "tokyo",
    position: [-5, 2.8, 34],
    size: [3.4, 5.6, 3],
    color: "#544d5e",
    accent: "#f0b060",
    blocksMovement: true,
    variant: 8
  },
  {
    id: "gyukatsu-main-machiya",
    kind: "machiya",
    zoneId: "gyukatsu",
    position: RPG_PRIMARY_LANDMARK_POSITIONS.gyukatsu,
    size: [6.2, 3.1, 3.35],
    color: "#754a3e",
    accent: "#efb45d",
    blocksMovement: true,
    variant: 0
  },
  {
    id: "gyukatsu-teahouse-machiya",
    kind: "machiya",
    zoneId: "gyukatsu",
    position: [16, 1.35, -7],
    size: [3, 2.7, 3.2],
    color: "#485f5f",
    accent: "#e7d09e",
    blocksMovement: true,
    variant: 1
  },
  {
    id: "district-volume-gyukatsu-noren-machiya",
    kind: "machiya",
    zoneId: "gyukatsu",
    position: [10.5, 1.45, 7],
    size: [4.5, 2.9, 3],
    color: "#705043",
    accent: "#e9a84f",
    blocksMovement: true,
    variant: 2
  },
  {
    id: "district-volume-gyukatsu-lantern-machiya",
    kind: "machiya",
    zoneId: "gyukatsu",
    position: [14, 1.6, 6.8],
    size: [5, 3.2, 3.2],
    color: "#3f5a57",
    accent: "#e7c37e",
    blocksMovement: true,
    variant: 3
  },
  {
    id: "district-volume-gyukatsu-side-street-machiya",
    kind: "machiya",
    zoneId: "gyukatsu",
    position: [0, 1.35, -7],
    size: [5, 2.7, 3.2],
    color: "#6c443d",
    accent: "#edb760",
    blocksMovement: true,
    variant: 4
  },
  {
    id: "district-volume-gyukatsu-charcoal-machiya",
    kind: "machiya",
    zoneId: "gyukatsu",
    position: [12.8, 1.4, -7],
    size: [3, 2.8, 3.2],
    color: "#3f5052",
    accent: "#e8cf9e",
    blocksMovement: true,
    variant: 5
  },
  createSakuraTree(
    "sakura-tree-01",
    RPG_PRIMARY_LANDMARK_POSITIONS.sakura,
    [4.8, 6.6, 4.8],
    0,
    true,
    [0, 0.5]
  ),
  createSakuraTree(
    "sakura-tree-02",
    [12.9, 2.1, -11.43],
    [2.25, 4.2, 2.25],
    1
  ),
  createSakuraTree(
    "sakura-tree-03",
    [4, 1.9, -11.5],
    [2, 3.8, 2],
    2
  ),
  createSakuraTree(
    "sakura-tree-04",
    [13.3, 2.15, -14],
    [2.3, 4.3, 2.3],
    3
  ),
  createSakuraTree(
    "sakura-tree-05",
    [12.8, 2, -16.53],
    [2.15, 4, 2.15],
    4
  ),
  createSakuraTree(
    "sakura-tree-06",
    [4, 1.9, -16.5],
    [2, 3.8, 2],
    5
  ),
  createSakuraTree(
    "district-volume-sakura-tree-west-north",
    [4.2, 2, -31.6],
    [2.2, 4, 2.2],
    6
  ),
  createSakuraTree(
    "district-volume-sakura-tree-east-north",
    [13, 1.95, -21.5],
    [2.1, 3.9, 2.1],
    7
  ),
  createSakuraTree(
    "district-volume-sakura-tree-west-south",
    [4.2, 2.1, -34.5],
    [2.2, 4.2, 2.2],
    8
  ),
  createSakuraTree(
    "district-volume-sakura-tree-center-south",
    [6.9, 2.05, -31.6],
    [2.15, 4.1, 2.15],
    9
  ),
  createSakuraTree(
    "district-volume-sakura-tree-east-south",
    [6.9, 1.95, -34.5],
    [2.1, 3.9, 2.1],
    10
  ),
  {
    id: "sakura-canal",
    kind: "canal",
    zoneId: "sakura",
    position: [BRIDGE_CENTER_X, RPG_WORLD_CANAL_WATER_LEVEL, 0],
    size: [CANAL_WIDTH, 0.3, 72],
    color: "#398aa2",
    accent: "#92d9dc",
    blocksMovement: false
  },
  {
    id: "sakura-bridge",
    kind: "bridge",
    zoneId: "sakura",
    position: [BRIDGE_CENTER_X, 0, BRIDGE_CENTER_Z],
    size: [BRIDGE_WIDTH, 0.14, BRIDGE_ROUTE_HALF_DEPTH * 2],
    color: "#ac4a3d",
    accent: "#efad60",
    blocksMovement: false,
    sourceRouteId: "sakura-bridge-route"
  },
  {
    id: "hanabi-apple-stall",
    kind: "stall",
    zoneId: "hanabi",
    position: RPG_PRIMARY_LANDMARK_POSITIONS.hanabi,
    size: [2.65, 2.35, 2.4],
    color: "#a64147",
    accent: "#f2c563",
    blocksMovement: true,
    variant: 0
  },
  {
    id: "hanabi-mask-stall",
    kind: "stall",
    zoneId: "hanabi",
    position: [27, 1.08, -16],
    size: [2.65, 2.31, 2.4],
    color: "#3d6269",
    accent: "#ed8a86",
    blocksMovement: true,
    variant: 1
  },
  {
    id: "hanabi-goldfish-stall",
    kind: "stall",
    zoneId: "hanabi",
    position: [32, 1.1, -16],
    size: [2.65, 2.35, 2.4],
    color: "#725269",
    accent: "#65cdc3",
    blocksMovement: true,
    variant: 2
  },
  {
    id: "district-volume-hanabi-dango-stall",
    kind: "stall",
    zoneId: "hanabi",
    position: [20, 1.08, -33],
    size: [2.65, 2.31, 2.4],
    color: "#84504d",
    accent: "#f2b966",
    blocksMovement: true,
    variant: 3
  },
  {
    id: "district-volume-hanabi-fan-stall",
    kind: "stall",
    zoneId: "hanabi",
    position: [24, 1.1, -33],
    size: [2.65, 2.35, 2.4],
    color: "#41636b",
    accent: "#ed8ca7",
    blocksMovement: true,
    variant: 4
  },
  {
    id: "district-volume-hanabi-candy-stall",
    kind: "stall",
    zoneId: "hanabi",
    position: [29, 1.08, -33],
    size: [2.65, 2.31, 2.4],
    color: "#73526d",
    accent: "#6ed2c5",
    blocksMovement: true,
    variant: 5
  },
  ...[20, 23, 26, 29, 32].flatMap((x, index) => [
    createLantern(
      `hanabi-lantern-${index}-north`,
      x,
      -18.5,
      index
    ),
    createLantern(
      `hanabi-lantern-${index}-south`,
      x,
      -29.5,
      index + 1
    )
  ]),
  {
    id: "hanabi-torii",
    kind: "torii",
    zoneId: "hanabi",
    position: [33, 2.5, -32],
    size: [4, 5, 1],
    color: "#a63f36",
    accent: "#241f25",
    blocksMovement: true
  },
  {
    id: "hanabi-street-torii",
    kind: "torii",
    zoneId: "hanabi",
    position: [22, 2.5, -12.6],
    size: [4.4, 5, 1],
    color: "#b0453a",
    accent: "#2a2229",
    blocksMovement: true
  },
  {
    id: "sakura-garden-torii",
    kind: "torii",
    zoneId: "sakura",
    position: [5.5, 2.4, -29.2],
    size: [4.2, 4.8, 1],
    color: "#a8433c",
    accent: "#272026",
    blocksMovement: true
  },
  createNpc(
    "npc-airport-traveler",
    "airport",
    [-26.8, 0.83, 1.5],
    "#526f86",
    "#dfbf80",
    0
  ),
  createNpc(
    "npc-tokyo-worker",
    "tokyo",
    [-10, 0.83, 20],
    "#4f596f",
    "#e3d7be",
    1
  ),
  createNpc(
    "npc-gyukatsu-chef",
    "gyukatsu",
    [2, 0.83, 0],
    "#ddd4c6",
    "#a94842",
    2
  ),
  createNpc(
    "npc-sakura-visitor",
    "sakura",
    [9, 0.83, -30.5],
    "#b75877",
    "#f1c0cd",
    3
  ),
  createNpc(
    "npc-hanabi-child",
    "hanabi",
    [21, 0.83, -24],
    "#4e8191",
    "#f4bd57",
    4
  ),
  createNpc(
    "npc-hanabi-yukata",
    "hanabi",
    [27, 0.83, -24],
    "#654f84",
    "#f5a0bd",
    5
  ),
  createNpc(
    "npc-hanabi-vendor",
    "hanabi",
    [32, 0.83, -24],
    "#7f4944",
    "#ebcf91",
    6
  ),
  {
    id: "hanabi-coral-burst",
    kind: "hanabi",
    zoneId: "hanabi",
    position: [24, 10.7, -17],
    size: [3.4, 3.4, 0.15],
    color: "#ff706c",
    accent: "#ffd568",
    blocksMovement: false,
    variant: 0
  },
  {
    id: "hanabi-sky-burst",
    kind: "hanabi",
    zoneId: "hanabi",
    position: [31, 13.2, -19],
    size: [4, 4, 0.15],
    color: "#75caff",
    accent: "#efa7ff",
    blocksMovement: false,
    variant: 1
  }
] as const;

export const RPG_WORLD_LANDMARKS = RPG_WORLD_SCENE_LANDMARKS;

const canonicalLandmarkById = new Map(
  RPG_WORLD_LANDMARKS.map((landmark) => [landmark.id, landmark])
);

const arrival = (
  zoneId: DestinationId,
  position: WorldPoint3,
  primaryLandmarkId: string,
  approvedReferenceFoot: WorldArrival["approvedReferenceFoot"]
): WorldArrival => {
  const landmark = canonicalLandmarkById.get(primaryLandmarkId)!;
  const headingX = landmark.position[0] - position[0];
  const headingZ = landmark.position[2] - position[2];
  const length = Math.hypot(headingX, headingZ);
  return {
    id: `${zoneId}-arrival`,
    zoneId,
    position,
    heading: [headingX / length, headingZ / length],
    approvedReferenceFoot
  };
};

export const RPG_WORLD_ARRIVALS: readonly WorldArrival[] = [
  arrival("airport", [-30, 0, 0], "airport-limousine-bus", {
    pixel: [430, 600],
    maximumProjectionErrorPixels: 0.5,
    spriteHeightRangePixels: [135, 150]
  }),
  arrival("tokyo", [-8, 0, 20], "tokyo-blue-tower", {
    pixel: [760, 455],
    maximumProjectionErrorPixels: 0.5,
    spriteHeightRangePixels: [120, 135]
  }),
  arrival("gyukatsu", [8, 0, 0], "gyukatsu-main-machiya", {
    pixel: [1035, 610],
    maximumProjectionErrorPixels: 0.5,
    spriteHeightRangePixels: [130, 145]
  }),
  arrival("sakura", [9, 0, -20], "sakura-tree-01", {
    pixel: [1260, 595],
    maximumProjectionErrorPixels: 0.5,
    spriteHeightRangePixels: [135, 150]
  }),
  arrival("hanabi", [26, 0, -18], "hanabi-apple-stall", {
    pixel: [1570, 640],
    maximumProjectionErrorPixels: 0.5,
    spriteHeightRangePixels: [105, 125]
  })
];
export const RPG_PLAYER_COLLISION_RADIUS = 0.3;

export const RPG_WORLD_STATIC_BLOCKERS = [
  {
    id: "tokyo-service-blocker",
    collision: {
      id: "tokyo-service-blocker-collision",
      sourceId: "tokyo-service-blocker",
      kind: "orientedRect" as const,
      center: [-8, 14] as const,
      halfSize: [0, 0] as const,
      rotationRadians: 0
    }
  }
] as const;

export const RPG_WORLD_COLLISIONS: readonly WorldCollisionShape[] = [
  ...RPG_WORLD_LANDMARKS
    .filter(({ blocksMovement }) => blocksMovement)
    .map((landmark) => ({
      id: `${landmark.id}-collision`,
      sourceId: landmark.id,
      kind: "orientedRect" as const,
      center: [landmark.position[0], landmark.position[2]] as const,
      halfSize: [
        landmark.size[0] / 2 + (landmark.collisionPadding?.[0] ?? 0),
        landmark.size[2] / 2 + (landmark.collisionPadding?.[1] ?? 0)
      ] as const,
      rotationRadians: landmark.rotationY ?? 0
    })),
  ...RPG_WORLD_STATIC_BLOCKERS.map(({ collision }) => collision)
];

function rectangleContainsPoint(polygon: WorldPolygon, [x, z]: WorldPoint2) {
  const xs = polygon.map(([pointX]) => pointX);
  const zs = polygon.map(([, pointZ]) => pointZ);
  return x >= Math.min(...xs) && x <= Math.max(...xs) && z >= Math.min(...zs) && z <= Math.max(...zs);
}

function modelTransitionAt(position: WorldPoint2) {
  return RPG_WORLD_TRANSITIONS
    .filter(({ polygon }) => rectangleContainsPoint(polygon, position))
    .reduce<WorldTransition | null>(
      (owner, candidate) =>
        owner === null ||
        candidate.ownershipPriority < owner.ownershipPriority ||
        (candidate.ownershipPriority === owner.ownershipPriority && candidate.id < owner.id)
          ? candidate
          : owner,
      null
    );
}

function distanceToZonePolygon(
  { polygon }: WorldZone,
  [x, z]: WorldPoint2
) {
  const xs = polygon.map(([pointX]) => pointX);
  const zs = polygon.map(([, pointZ]) => pointZ);
  const minimumX = Math.min(...xs);
  const maximumX = Math.max(...xs);
  const minimumZ = Math.min(...zs);
  const maximumZ = Math.max(...zs);
  return Math.hypot(
    Math.max(minimumX - x, 0, x - maximumX),
    Math.max(minimumZ - z, 0, z - maximumZ)
  );
}

export function getRpgWorldModelNavigationZoneId(
  position: WorldPoint2
): DestinationId | null {
  const [x, z] = position;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(z) ||
    x < RPG_WORLD_BOUNDS.minimumX ||
    x > RPG_WORLD_BOUNDS.maximumX ||
    z < RPG_WORLD_BOUNDS.minimumZ ||
    z > RPG_WORLD_BOUNDS.maximumZ
  ) {
    return null;
  }
  const zoneOwner = RPG_WORLD_ZONES.find(({ polygon }) =>
    rectangleContainsPoint(polygon, position)
  );
  if (zoneOwner) return zoneOwner.id;
  return [...RPG_WORLD_ZONES]
    .sort(
      (first, second) =>
        distanceToZonePolygon(first, position) -
          distanceToZonePolygon(second, position) ||
        RPG_WORLD_ZONE_IDS.indexOf(first.id) -
          RPG_WORLD_ZONE_IDS.indexOf(second.id)
    )[0].id;
}

function modelRegionAt(position: WorldPoint2) {
  const transitionOwner = modelTransitionAt(position);
  if (transitionOwner) return { kind: "transition" as const, regionId: transitionOwner.id };
  const regionId = getRpgWorldModelNavigationZoneId(position);
  return regionId ? { kind: "zone" as const, regionId } : null;
}

function sceneSurfaceContainsPoint(
  surface: WorldSceneSurface,
  [x, z]: WorldPoint2
) {
  const halfWidth = surface.size[0] / 2;
  const halfDepth = surface.size[2] / 2;
  if (surface.shape === "circle") {
    const normalizedX = (x - surface.position[0]) / halfWidth;
    const normalizedZ = (z - surface.position[2]) / halfDepth;
    return normalizedX ** 2 + normalizedZ ** 2 <= 1;
  }
  return (
    Math.abs(x - surface.position[0]) <= halfWidth &&
    Math.abs(z - surface.position[2]) <= halfDepth
  );
}

function collisionContainsPoint(
  { center, halfSize, rotationRadians }: WorldCollisionShape,
  [x, z]: WorldPoint2
) {
  const dx = x - center[0];
  const dz = z - center[1];
  const cosine = Math.cos(rotationRadians);
  const sine = Math.sin(rotationRadians);
  const localX = cosine * dx - sine * dz;
  const localZ = sine * dx + cosine * dz;
  return (
    Math.abs(localX) <= halfSize[0] + RPG_PLAYER_COLLISION_RADIUS &&
    Math.abs(localZ) <= halfSize[1] + RPG_PLAYER_COLLISION_RADIUS
  );
}

export function isRpgWorldModelWalkable(position: WorldPoint2) {
  const [x, z] = position;
  if (
    x < RPG_WORLD_BOUNDS.minimumX ||
    x > RPG_WORLD_BOUNDS.maximumX ||
    z < RPG_WORLD_BOUNDS.minimumZ ||
    z > RPG_WORLD_BOUNDS.maximumZ
  ) return false;
  const onBridge = rectangleContainsPoint(RPG_WORLD_BRIDGE.polygon, position);
  const onAuthoredSurface = RPG_WORLD_SCENE_SURFACES.some(
    (surface) =>
      surface.kind !== "water" && sceneSurfaceContainsPoint(surface, position)
  );
  if (!onBridge && !onAuthoredSurface) {
    return false;
  }
  if (!onBridge && rectangleContainsPoint(RPG_WORLD_CANAL.polygon, position)) {
    return false;
  }
  return !RPG_WORLD_COLLISIONS.some((collision) =>
    collisionContainsPoint(collision, position)
  );
}

const canonicalCoordinate = (value: number) => Math.round(value * 1e9) / 1e9;
const topologyXCoordinates = new Set<number>([
  RPG_WORLD_BOUNDS.minimumX,
  RPG_WORLD_BOUNDS.maximumX,
  ...RPG_WORLD_CANAL.polygon.map(([x]) => canonicalCoordinate(x)),
  ...RPG_WORLD_BRIDGE.polygon.map(([x]) => canonicalCoordinate(x))
]);
const topologyZCoordinates = new Set<number>([
  RPG_WORLD_BOUNDS.minimumZ,
  RPG_WORLD_BOUNDS.maximumZ,
  ...RPG_WORLD_CANAL.polygon.map(([, z]) => canonicalCoordinate(z)),
  ...RPG_WORLD_BRIDGE.polygon.map(([, z]) => canonicalCoordinate(z))
]);

for (const { polygon } of [
  ...RPG_WORLD_ZONES,
  ...RPG_WORLD_TRANSITIONS,
  ...RPG_WORLD_ROUTES
]) {
  for (const [x, z] of polygon) {
    topologyXCoordinates.add(canonicalCoordinate(x));
    topologyZCoordinates.add(canonicalCoordinate(z));
  }
}
for (const transitionDefinition of RPG_WORLD_TRANSITIONS) {
  const [start, end] = transitionDefinition.centerline;
  for (const progress of transitionDefinition.dualProtectionRange) {
    topologyXCoordinates.add(
      canonicalCoordinate(start[0] + (end[0] - start[0]) * progress)
    );
    topologyZCoordinates.add(
      canonicalCoordinate(start[1] + (end[1] - start[1]) * progress)
    );
  }
}
for (const { center, halfSize } of RPG_WORLD_COLLISIONS) {
  topologyXCoordinates.add(canonicalCoordinate(Math.max(RPG_WORLD_BOUNDS.minimumX, center[0] - halfSize[0] - RPG_PLAYER_COLLISION_RADIUS)));
  topologyXCoordinates.add(canonicalCoordinate(Math.min(RPG_WORLD_BOUNDS.maximumX, center[0] + halfSize[0] + RPG_PLAYER_COLLISION_RADIUS)));
  topologyZCoordinates.add(canonicalCoordinate(Math.max(RPG_WORLD_BOUNDS.minimumZ, center[1] - halfSize[1] - RPG_PLAYER_COLLISION_RADIUS)));
  topologyZCoordinates.add(canonicalCoordinate(Math.min(RPG_WORLD_BOUNDS.maximumZ, center[1] + halfSize[1] + RPG_PLAYER_COLLISION_RADIUS)));
}

export const RPG_WORLD_TOPOLOGY_X = [...topologyXCoordinates]
  .filter((value) => value >= RPG_WORLD_BOUNDS.minimumX && value <= RPG_WORLD_BOUNDS.maximumX)
  .sort((a, b) => a - b);
export const RPG_WORLD_TOPOLOGY_Z = [...topologyZCoordinates]
  .filter((value) => value >= RPG_WORLD_BOUNDS.minimumZ && value <= RPG_WORLD_BOUNDS.maximumZ)
  .sort((a, b) => a - b);

export const RPG_WORLD_ATOMIC_CELLS = RPG_WORLD_TOPOLOGY_X.slice(0, -1).flatMap(
  (minimumX, xIndex) =>
    RPG_WORLD_TOPOLOGY_Z.slice(0, -1).map((minimumZ, zIndex) => {
      const maximumX = RPG_WORLD_TOPOLOGY_X[xIndex + 1];
      const maximumZ = RPG_WORLD_TOPOLOGY_Z[zIndex + 1];
      const center: WorldPoint2 = [(minimumX + maximumX) / 2, (minimumZ + maximumZ) / 2];
      const region = modelRegionAt(center);
      const walkable = isRpgWorldModelWalkable(center);
      if (!region && walkable) {
        throw new Error(`Walkable world gap at ${center[0]},${center[1]}`);
      }
      return {
        id: `world-cell-${xIndex}-${zIndex}`,
        ...(region ?? {
          kind: "outside-navigation" as const,
          regionId: "outside-navigation"
        }),
        polygon: rectangle(minimumX, maximumX, minimumZ, maximumZ),
        walkable
      };
    })
);

export const RPG_WORLD_CELLS = RPG_WORLD_ATOMIC_CELLS.filter(({ walkable }) => walkable);

export function getReferenceCalibrationSourceWorldXZ(
  source: ReferenceWorldFeatureSource
): WorldPoint2 {
  if (source.kind === "landmark") {
    const position = canonicalLandmarkById.get(source.id)!.position;
    return [position[0], position[2]];
  }
  if (source.kind === "arrival") {
    const position = RPG_WORLD_ARRIVALS.find(({ id }) => id === source.id)!.position;
    return [position[0], position[2]];
  }
  if (source.kind === "scene-surface") {
    const position = RPG_WORLD_SCENE_SURFACES.find(({ id }) => id === source.id)!.position;
    return [position[0], position[2]];
  }
  if (source.kind === "route-vertex") {
    return RPG_WORLD_ROUTES.find(({ id }) => id === source.id)!.polygon[source.vertexIndex];
  }
  if (source.kind === "transition-centerline") {
    return RPG_WORLD_TRANSITIONS.find(({ id }) => id === source.id)!.centerline[source.pointIndex];
  }
  if (source.kind === "coastline-vertex") {
    return RPG_WORLD_COASTLINE[source.vertexIndex];
  }
  if (source.kind === "canal-vertex") {
    return RPG_WORLD_CANAL.polygon[source.vertexIndex];
  }
  return RPG_WORLD_BRIDGE.polygon[source.vertexIndex];
}

const measuredCalibrationControl = (
  id: string,
  source: ReferenceWorldFeatureSource,
  referencePixel: readonly [number, number],
  spriteScale: number,
  depthKey: number,
  measurementRole: ReferenceCalibrationControl["measurementRole"] = "approved-feature"
): ReferenceCalibrationControl => ({
  id,
  source,
  worldXZ: getReferenceCalibrationSourceWorldXZ(source),
  referencePixel,
  spriteScale,
  depthKey,
  measurementRole
});

const retainedReferenceCalibrationControls: readonly ReferenceCalibrationControl[] = [
  measuredCalibrationControl("calibration-coast-northwest", { kind: "coastline-vertex", id: "town-coastline", vertexIndex: 3 }, [40, 300], 0.64, 0.16),
  measuredCalibrationControl("calibration-tokyo-tower-base", { kind: "landmark", id: "tokyo-blue-tower" }, [495, 320], 0.72, 0.28),
  measuredCalibrationControl("calibration-coast-northeast", { kind: "coastline-vertex", id: "town-coastline", vertexIndex: 2 }, [1728, 300], 0.64, 0.16, "navigable-boundary-inset"),
  measuredCalibrationControl("calibration-gyukatsu-base", { kind: "landmark", id: "gyukatsu-main-machiya" }, [975, 600], 1, 0.62),
  measuredCalibrationControl("calibration-coast-southwest", { kind: "coastline-vertex", id: "town-coastline", vertexIndex: 0 }, [20, 840], 1.22, 0.97),
  measuredCalibrationControl("calibration-sakura-tree-base", { kind: "landmark", id: "sakura-tree-01" }, [1245, 740], 1.17, 0.85),
  measuredCalibrationControl("calibration-coast-southeast", { kind: "coastline-vertex", id: "town-coastline", vertexIndex: 1 }, [1728, 840], 1.22, 0.97, "navigable-boundary-inset"),
  measuredCalibrationControl("calibration-sakura-road-west", { kind: "route-vertex", id: "sakura-festival-road", vertexIndex: 0 }, [1010, 650], 1.12, 0.76),
  measuredCalibrationControl("calibration-gyukatsu-sakura-transition", { kind: "transition-centerline", id: "gyukatsu-to-sakura", pointIndex: 0 }, [1100, 620], 1.05, 0.66),
  measuredCalibrationControl("calibration-canal-southwest-bank", { kind: "canal-vertex", id: "sakura-canal", vertexIndex: 0 }, [1390, 840], 1.22, 0.97),
  measuredCalibrationControl("calibration-bridge-west-end", { kind: "bridge-vertex", id: "sakura-bridge", vertexIndex: 0 }, [1370, 640], 1.13, 0.8)
] as const;

export const RPG_REFERENCE_CALIBRATION_OBSERVATIONS: readonly ReferenceCalibrationControl[] = [
  measuredCalibrationControl(
    "calibration-airport-bus-base",
    { kind: "landmark", id: "airport-limousine-bus" },
    [345, 590],
    1.08,
    0.61
  )
];

type MeshControlKind = "arrival" | "spawn" | "route" | "steiner";
type MeshControlTuple = readonly [
  id: string,
  worldX: number,
  worldZ: number,
  referenceX: number,
  referenceY: number,
  kind: MeshControlKind
];

const meshControl = (
  [id, worldX, worldZ, referenceX, referenceY, kind]: MeshControlTuple
): ReferenceCalibrationControl => ({
  id,
  worldXZ: [worldX, worldZ],
  referencePixel: [referenceX, referenceY],
  spriteScale:
    kind === "arrival"
      ? 1
      : kind === "spawn"
        ? 1.0990495818120238
        : 0.75 + (referenceY / 866) * 0.5,
  depthKey:
    kind === "spawn" ? 0.7159372207341148 : referenceY / 866,
  measurementRole:
    kind === "arrival"
      ? "arrival-affine-control"
      : kind === "spawn"
        ? "spawn-control"
      : kind === "route"
        ? "route-control"
        : "mesh-steiner"
});

const generatedReferenceMeshControlTuples = [
  ["spawn-airport-center", -26.304534009865293, -2.973191261452298, 455, 620, "spawn"],
  ["arrival-airport-v0", -29.5, 0, 440, 600, "arrival"],
  ["arrival-airport-v1", -30.25, 0.4330127018922193, 425, 594.8038475772934, "arrival"],
  ["arrival-airport-v2", -30.25, -0.4330127018922193, 425, 605.1961524227066, "arrival"],
  ["arrival-tokyo-tower-v0", -7.5, 20, 770, 455, "arrival"],
  ["arrival-tokyo-tower-v1", -8.25, 20.43301270189222, 755, 449.80384757729337, "arrival"],
  ["arrival-tokyo-tower-v2", -8.25, 19.56698729810778, 755, 460.19615242270663, "arrival"],
  ["arrival-gyukatsu-v0", 8.5, 0, 1045, 610, "arrival"],
  ["arrival-gyukatsu-v1", 7.75, 0.4330127018922193, 1030, 604.8038475772934, "arrival"],
  ["arrival-gyukatsu-v2", 7.75, -0.4330127018922193, 1030, 615.1961524227066, "arrival"],
  ["arrival-sakura-v0", 9.5, -20, 1270, 595, "arrival"],
  ["arrival-sakura-v1", 8.75, -19.56698729810778, 1255, 589.8038475772934, "arrival"],
  ["arrival-sakura-v2", 8.75, -20.43301270189222, 1255, 600.1961524227066, "arrival"],
  ["arrival-hanabi-v0", 26.5, -18, 1580, 640, "arrival"],
  ["arrival-hanabi-v1", 25.75, -17.56698729810778, 1565, 634.8038475772934, "arrival"],
  ["arrival-hanabi-v2", 25.75, -18.43301270189222, 1565, 645.1961524227066, "arrival"],
  ["route-airport-tokyo-0", -30, 6, 430, 565, "route"],
  ["route-airport-tokyo-1", -30, 13, 510, 535, "route"],
  ["route-airport-tokyo-2", -29, 20, 600, 500, "route"],
  ["route-airport-tokyo-3", -18, 20, 690, 470, "route"],
  ["route-airport-gyukatsu-0", -25, 0, 500, 600, "route"],
  ["route-airport-gyukatsu-1", -17, 0, 630, 580, "route"],
  ["route-airport-gyukatsu-2", -8, 0, 780, 555, "route"],
  ["route-airport-gyukatsu-3", 0, 0, 910, 570, "route"],
  ["route-airport-gyukatsu-4", 5, 0, 990, 590, "route"],
  ["route-tokyo-gyukatsu-0", -8, 17, 800, 465, "route"],
  ["route-tokyo-gyukatsu-1", -8, 12, 850, 495, "route"],
  ["route-tokyo-gyukatsu-2", -8, 7, 910, 530, "route"],
  ["route-tokyo-gyukatsu-3", -8, 2, 970, 565, "route"],
  ["route-gyukatsu-sakura-0", 8, -4, 1080, 635, "route"],
  ["route-gyukatsu-sakura-1", 7.5, -10, 1150, 640, "route"],
  ["route-gyukatsu-sakura-2", 8, -14, 1210, 620, "route"],
  ["route-gyukatsu-sakura-3", 8, -18, 1230, 610, "route"],
  ["route-sakura-hanabi-0", 12, -18, 1338, 570, "route"],
  ["route-sakura-hanabi-1", 14.3, -17, 1390, 565, "route"],
  ["route-sakura-hanabi-2", 16.6, -17, 1442, 580, "route"],
  ["route-sakura-hanabi-3", 18.9, -17, 1495, 610, "route"],
  ["route-sakura-hanabi-4", 24, -18, 1545, 640, "route"],
  ["steiner-gyukatsu-west", 6.3224126502031535, 0.16962639343054645, 645.1351961916068, 686.5123016709084, "steiner"],
  ["steiner-airport-west", -33.23498231206866, 4.148036344963342, 133.58061595054286, 614.9900360020146, "steiner"],
  ["steiner-gyukatsu-northeast", -5.003045557812182, 6.888153672019132, 1303.8369139085692, 448.4235775147184, "steiner"],
  ["steiner-sakura-south", 1.0379752695378153, -20.335408772057725, 1192.2426545383748, 679.50660151133, "steiner"]
] as const satisfies readonly MeshControlTuple[];

const retainedControlById = new Map(
  retainedReferenceCalibrationControls.map((control) => [control.id, control])
);
const referenceMeshControlOrder = [
  "calibration-coast-northwest",
  "calibration-coast-northeast",
  "calibration-coast-southeast",
  "calibration-canal-southwest-bank",
  "calibration-coast-southwest",
  "calibration-tokyo-tower-base",
  "calibration-gyukatsu-base",
  "calibration-sakura-tree-base",
  "calibration-sakura-road-west",
  "calibration-gyukatsu-sakura-transition",
  "calibration-bridge-west-end"
] as const;

export const RPG_REFERENCE_CALIBRATION_CONTROLS: readonly ReferenceCalibrationControl[] = [
  ...referenceMeshControlOrder.map((id) => retainedControlById.get(id)!),
  ...generatedReferenceMeshControlTuples.map(meshControl)
];

export const RPG_REFERENCE_ROUTE_CONTROL_IDS = {
  "airport-to-tokyo": [
    "route-airport-tokyo-0",
    "route-airport-tokyo-1",
    "route-airport-tokyo-2",
    "route-airport-tokyo-3"
  ],
  "airport-to-gyukatsu": [
    "route-airport-gyukatsu-0",
    "route-airport-gyukatsu-1",
    "route-airport-gyukatsu-2",
    "route-airport-gyukatsu-3",
    "route-airport-gyukatsu-4"
  ],
  "tokyo-to-gyukatsu": [
    "route-tokyo-gyukatsu-0",
    "route-tokyo-gyukatsu-1",
    "route-tokyo-gyukatsu-2",
    "route-tokyo-gyukatsu-3"
  ],
  "gyukatsu-to-sakura": [
    "route-gyukatsu-sakura-0",
    "route-gyukatsu-sakura-1",
    "route-gyukatsu-sakura-2",
    "route-gyukatsu-sakura-3"
  ],
  "sakura-to-hanabi": [
    "route-sakura-hanabi-0",
    "route-sakura-hanabi-1",
    "route-sakura-hanabi-2",
    "route-sakura-hanabi-3",
    "route-sakura-hanabi-4"
  ]
} as const;

const referenceMeshTriangleSeedControlIds = [
  ["route-sakura-hanabi-0","route-sakura-hanabi-1","calibration-coast-northeast"],["route-sakura-hanabi-1","route-sakura-hanabi-0","arrival-sakura-v0"],["calibration-coast-southwest","calibration-sakura-road-west","arrival-gyukatsu-v1"],["calibration-sakura-road-west","calibration-coast-southwest","calibration-canal-southwest-bank"],["calibration-coast-southeast","route-sakura-hanabi-4","route-sakura-hanabi-3"],["route-sakura-hanabi-4","calibration-coast-southeast","arrival-hanabi-v2"],["route-airport-tokyo-2","route-airport-gyukatsu-1","route-airport-tokyo-3"],["route-airport-gyukatsu-1","route-airport-tokyo-2","route-airport-tokyo-1"],["arrival-gyukatsu-v0","route-sakura-hanabi-0","calibration-coast-northeast"],["route-sakura-hanabi-0","arrival-gyukatsu-v0","calibration-gyukatsu-sakura-transition"],["calibration-sakura-tree-base","calibration-sakura-road-west","calibration-canal-southwest-bank"],["route-gyukatsu-sakura-0","route-gyukatsu-sakura-1","calibration-gyukatsu-sakura-transition"],["route-gyukatsu-sakura-1","route-gyukatsu-sakura-0","calibration-sakura-road-west"],["calibration-coast-northwest","calibration-tokyo-tower-base","calibration-coast-northeast"],["calibration-tokyo-tower-base","calibration-coast-northwest","arrival-tokyo-tower-v1"],["arrival-airport-v2","route-airport-gyukatsu-0","arrival-airport-v0"],["route-airport-gyukatsu-0","arrival-airport-v2","calibration-coast-southwest"],["arrival-tokyo-tower-v2","route-airport-tokyo-3","route-tokyo-gyukatsu-0"],["route-airport-tokyo-3","arrival-tokyo-tower-v2","calibration-coast-northwest"],["arrival-sakura-v1","route-sakura-hanabi-0","calibration-gyukatsu-sakura-transition"],["route-sakura-hanabi-0","arrival-sakura-v1","arrival-sakura-v0"],["calibration-coast-southeast","calibration-bridge-west-end","calibration-canal-southwest-bank"],["calibration-bridge-west-end","calibration-coast-southeast","route-sakura-hanabi-1"],["route-gyukatsu-sakura-3","arrival-sakura-v2","arrival-sakura-v1"],["calibration-coast-northeast","arrival-tokyo-tower-v0","route-tokyo-gyukatsu-0"],["arrival-tokyo-tower-v0","calibration-coast-northeast","arrival-tokyo-tower-v1"],["arrival-hanabi-v0","arrival-hanabi-v2","calibration-coast-southeast"],["arrival-hanabi-v2","arrival-hanabi-v0","arrival-hanabi-v1"],["route-gyukatsu-sakura-1","route-gyukatsu-sakura-2","arrival-sakura-v1"],["calibration-coast-northeast","arrival-hanabi-v0","calibration-coast-southeast"],["arrival-hanabi-v0","calibration-coast-northeast","arrival-hanabi-v1"],["route-airport-tokyo-3","route-tokyo-gyukatsu-3","route-tokyo-gyukatsu-2"],["route-tokyo-gyukatsu-3","route-airport-tokyo-3","route-airport-gyukatsu-2"],
  ["arrival-gyukatsu-v0","arrival-gyukatsu-v1","arrival-gyukatsu-v2"],["arrival-gyukatsu-v1","arrival-gyukatsu-v0","calibration-coast-northeast"],["calibration-gyukatsu-base","arrival-gyukatsu-v1","calibration-coast-northeast"],["calibration-sakura-tree-base","calibration-bridge-west-end","route-sakura-hanabi-1"],["calibration-bridge-west-end","calibration-sakura-tree-base","calibration-canal-southwest-bank"],["arrival-gyukatsu-v1","calibration-sakura-road-west","arrival-gyukatsu-v2"],["arrival-tokyo-tower-v1","calibration-coast-northwest","arrival-tokyo-tower-v2"],["calibration-coast-southwest","route-airport-gyukatsu-1","route-airport-gyukatsu-0"],["route-airport-gyukatsu-1","calibration-coast-southwest","route-airport-gyukatsu-2"],["arrival-tokyo-tower-v0","arrival-tokyo-tower-v1","arrival-tokyo-tower-v2"],["calibration-airport-bus-base","arrival-airport-v1","route-airport-gyukatsu-1"],["route-sakura-hanabi-3","route-sakura-hanabi-4","arrival-hanabi-v1"],["route-gyukatsu-sakura-2","route-gyukatsu-sakura-3","arrival-sakura-v1"],["calibration-coast-southwest","route-airport-gyukatsu-3","route-airport-gyukatsu-2"],["route-airport-gyukatsu-3","calibration-coast-southwest","route-airport-gyukatsu-4"],["arrival-sakura-v1","calibration-gyukatsu-sakura-transition","route-gyukatsu-sakura-1"],["route-airport-tokyo-3","calibration-coast-northwest","route-airport-tokyo-2"],["route-gyukatsu-sakura-0","calibration-gyukatsu-sakura-transition","arrival-gyukatsu-v0"],["calibration-coast-northeast","route-tokyo-gyukatsu-1","route-tokyo-gyukatsu-2"],["route-tokyo-gyukatsu-1","calibration-coast-northeast","route-tokyo-gyukatsu-0"],["calibration-coast-northeast","route-sakura-hanabi-2","route-sakura-hanabi-3"],["route-sakura-hanabi-2","calibration-coast-northeast","route-sakura-hanabi-1"],["arrival-airport-v0","arrival-airport-v1","arrival-airport-v2"],["arrival-airport-v1","arrival-airport-v0","route-airport-gyukatsu-0"],["route-sakura-hanabi-3","arrival-hanabi-v1","calibration-coast-northeast"],["route-sakura-hanabi-1","calibration-coast-southeast","route-sakura-hanabi-2"],["arrival-sakura-v1","arrival-sakura-v2","arrival-sakura-v0"],["route-airport-tokyo-0","calibration-airport-bus-base","route-airport-gyukatsu-1"],["calibration-tokyo-tower-base","arrival-tokyo-tower-v1","calibration-coast-northeast"],["route-sakura-hanabi-4","arrival-hanabi-v2","arrival-hanabi-v1"],["arrival-airport-v2","arrival-airport-v1","calibration-coast-southwest"],["route-tokyo-gyukatsu-0","route-airport-tokyo-3","route-tokyo-gyukatsu-1"],["calibration-sakura-tree-base","route-sakura-hanabi-1","arrival-sakura-v0"],
  ["calibration-coast-southeast","route-sakura-hanabi-3","route-sakura-hanabi-2"],["route-airport-gyukatsu-3","route-tokyo-gyukatsu-3","route-airport-gyukatsu-2"],["route-tokyo-gyukatsu-3","route-airport-gyukatsu-3","route-airport-gyukatsu-4"],["route-airport-gyukatsu-1","route-airport-tokyo-1","route-airport-tokyo-0"],["route-airport-tokyo-3","route-tokyo-gyukatsu-2","route-tokyo-gyukatsu-1"],["calibration-coast-northwest","route-airport-tokyo-0","route-airport-tokyo-1"],["route-tokyo-gyukatsu-0","arrival-tokyo-tower-v0","arrival-tokyo-tower-v2"],["route-airport-gyukatsu-0","route-airport-gyukatsu-1","arrival-airport-v1"],["route-airport-gyukatsu-2","route-airport-tokyo-3","route-airport-gyukatsu-1"],["route-airport-tokyo-2","calibration-coast-northwest","route-airport-tokyo-1"],["calibration-sakura-road-west","arrival-gyukatsu-v0","arrival-gyukatsu-v2"],["arrival-gyukatsu-v0","calibration-sakura-road-west","route-gyukatsu-sakura-0"],["calibration-sakura-tree-base","arrival-sakura-v0","arrival-sakura-v2"],["steiner-gyukatsu-west","calibration-coast-southwest","arrival-gyukatsu-v1"],["steiner-gyukatsu-west","route-airport-gyukatsu-4","calibration-coast-southwest"],["steiner-gyukatsu-west","calibration-gyukatsu-base","route-airport-gyukatsu-4"],["steiner-gyukatsu-west","arrival-gyukatsu-v1","calibration-gyukatsu-base"],["steiner-airport-west","arrival-airport-v1","calibration-airport-bus-base"],["steiner-airport-west","calibration-airport-bus-base","route-airport-tokyo-0"],["steiner-airport-west","route-airport-tokyo-0","calibration-coast-northwest"],["steiner-airport-west","calibration-coast-northwest","calibration-coast-southwest"],["steiner-airport-west","calibration-coast-southwest","arrival-airport-v1"],["steiner-gyukatsu-northeast","calibration-gyukatsu-base","calibration-coast-northeast"],["steiner-gyukatsu-northeast","route-airport-gyukatsu-4","calibration-gyukatsu-base"],["steiner-gyukatsu-northeast","route-tokyo-gyukatsu-3","route-airport-gyukatsu-4"],["steiner-gyukatsu-northeast","route-tokyo-gyukatsu-2","route-tokyo-gyukatsu-3"],["steiner-gyukatsu-northeast","calibration-coast-northeast","route-tokyo-gyukatsu-2"],["steiner-sakura-south","calibration-sakura-tree-base","arrival-sakura-v2"],["steiner-sakura-south","calibration-sakura-road-west","calibration-sakura-tree-base"],["steiner-sakura-south","route-gyukatsu-sakura-1","calibration-sakura-road-west"],["steiner-sakura-south","route-gyukatsu-sakura-2","route-gyukatsu-sakura-1"],["steiner-sakura-south","route-gyukatsu-sakura-3","route-gyukatsu-sakura-2"],["steiner-sakura-south","arrival-sakura-v2","route-gyukatsu-sakura-3"]
] as const satisfies readonly (readonly [string, string, string])[];

type ReferenceMeshTriangleControlIds = readonly [string, string, string];

const triangleControlKey = (controlPointIds: readonly string[]) =>
  [...controlPointIds].sort().join("|");

const airportRouteAlignedTriangleReplacements = new Map<
  string,
  ReferenceMeshTriangleControlIds
>([
  [
    triangleControlKey([
      "calibration-airport-bus-base",
      "arrival-airport-v1",
      "route-airport-gyukatsu-1"
    ]),
    [
      "arrival-airport-v0",
      "route-airport-gyukatsu-0",
      "route-airport-tokyo-0"
    ]
  ],
  [
    triangleControlKey([
      "arrival-airport-v1",
      "arrival-airport-v0",
      "route-airport-gyukatsu-0"
    ]),
    [
      "arrival-airport-v1",
      "arrival-airport-v0",
      "route-airport-tokyo-0"
    ]
  ],
  [
    triangleControlKey([
      "route-airport-gyukatsu-0",
      "route-airport-gyukatsu-1",
      "arrival-airport-v1"
    ]),
    [
      "route-airport-gyukatsu-0",
      "route-airport-gyukatsu-1",
      "route-airport-tokyo-0"
    ]
  ],
  [
    triangleControlKey([
      "steiner-airport-west",
      "arrival-airport-v1",
      "calibration-airport-bus-base"
    ]),
    [
      "steiner-airport-west",
      "arrival-airport-v1",
      "route-airport-tokyo-0"
    ]
  ]
]);

const removedAirportBusTriangleKeys = new Set([
  triangleControlKey([
    "route-airport-tokyo-0",
    "calibration-airport-bus-base",
    "route-airport-gyukatsu-1"
  ]),
  triangleControlKey([
    "steiner-airport-west",
    "calibration-airport-bus-base",
    "route-airport-tokyo-0"
  ])
]);

const referenceMeshTriangleControlIds: readonly ReferenceMeshTriangleControlIds[] =
  referenceMeshTriangleSeedControlIds.flatMap((controlPointIds) => {
    const key = triangleControlKey(controlPointIds);
    if (removedAirportBusTriangleKeys.has(key)) return [];
    const routeAligned =
      airportRouteAlignedTriangleReplacements.get(key) ?? controlPointIds;
    if (
      triangleControlKey(routeAligned) ===
      triangleControlKey([
        "route-airport-gyukatsu-0",
        "arrival-airport-v2",
        "calibration-coast-southwest"
      ])
    ) {
      return [
        [
          "route-airport-gyukatsu-0",
          "arrival-airport-v2",
          "spawn-airport-center"
        ],
        [
          "arrival-airport-v2",
          "calibration-coast-southwest",
          "spawn-airport-center"
        ],
        [
          "calibration-coast-southwest",
          "route-airport-gyukatsu-0",
          "spawn-airport-center"
        ]
      ];
    }
    return [routeAligned];
  });

export const RPG_REFERENCE_CALIBRATION_TRIANGLES: readonly ReferenceCalibrationTriangle[] =
  referenceMeshTriangleControlIds.map((controlPointIds, index) => ({
    id: `reference-mesh-triangle-${String(index).padStart(2, "0")}`,
    controlPointIds
  }));

export const RPG_REFERENCE_CALIBRATION_INPUT = {
  imageSize: [1817, 866] as const,
  measurementMethod: "manual-approved-image" as const,
  nonAffine: true,
  controlPoints: RPG_REFERENCE_CALIBRATION_CONTROLS,
  triangles: RPG_REFERENCE_CALIBRATION_TRIANGLES
} as const;

export const RPG_REFERENCE_LANDMARK_ANCHORS: readonly ReferenceAnchor[] = [
  { id: "airport-primary-landmark-anchor", sourceId: "airport-limousine-bus", role: "landmark", worldXZ: primaryLandmarkXZ("airport"), referencePixel: [353.305556, 420.972222], spriteScale: 0.993055556, depthKey: 0.486111111 },
  { id: "tokyo-primary-landmark-anchor", sourceId: "tokyo-blue-tower", role: "landmark", worldXZ: primaryLandmarkXZ("tokyo"), referencePixel: [479.486111, 84.194444], spriteScale: 0.798611111, depthKey: 0.097222222 },
  { id: "gyukatsu-primary-landmark-anchor", sourceId: "gyukatsu-main-machiya", role: "landmark", worldXZ: primaryLandmarkXZ("gyukatsu"), referencePixel: [883.263889, 336.777778], spriteScale: 0.944444444, depthKey: 0.388888889 },
  { id: "sakura-primary-landmark-anchor", sourceId: "sakura-tree-01", role: "landmark", worldXZ: primaryLandmarkXZ("sakura"), referencePixel: [1228.998611, 825.105556], spriteScale: 1.226388889, depthKey: 0.952777778 },
  { id: "hanabi-primary-landmark-anchor", sourceId: "hanabi-apple-stall", role: "landmark", worldXZ: primaryLandmarkXZ("hanabi"), referencePixel: [1463.694444, 625.444444], spriteScale: 1.111111111, depthKey: 0.722222222 }
];

export const RPG_REFERENCE_ARRIVAL_ANCHORS: readonly ReferenceAnchor[] =
  RPG_WORLD_ARRIVALS.map((arrival) => ({
    id: `${arrival.id}-reference-foot-anchor`,
    sourceId: arrival.id,
    role: "arrival",
    worldXZ: [arrival.position[0], arrival.position[2]],
    referencePixel: arrival.approvedReferenceFoot.pixel,
    spriteScale: 1,
    depthKey: arrival.approvedReferenceFoot.pixel[1] / 866
  }));

export const RPG_REFERENCE_REGISTRATION: ReferenceRegistration = {
  id: "rpg-world-reference-registration",
  imageSize: [1817, 866],
  orientation: RPG_WORLD_ORIENTATION,
  anchors: [...RPG_REFERENCE_LANDMARK_ANCHORS, ...RPG_REFERENCE_ARRIVAL_ANCHORS],
  controlPoints: RPG_REFERENCE_CALIBRATION_CONTROLS,
  triangles: RPG_REFERENCE_CALIBRATION_TRIANGLES.map((triangle) => ({
    ...triangle,
    cellId: "reference-domain"
  }))
} as const;

export const RPG_WORLD_MODEL = {
  bounds: RPG_WORLD_BOUNDS,
  orientation: RPG_WORLD_ORIENTATION,
  coastline: RPG_WORLD_COASTLINE,
  water: RPG_WORLD_WATER,
  canal: RPG_WORLD_CANAL,
  bridge: RPG_WORLD_BRIDGE,
  zones: RPG_WORLD_ZONES,
  transitions: RPG_WORLD_TRANSITIONS,
  routes: RPG_WORLD_ROUTES,
  sceneSurfaces: RPG_WORLD_SCENE_SURFACES,
  landmarks: RPG_WORLD_LANDMARKS,
  collisions: RPG_WORLD_COLLISIONS,
  staticBlockers: RPG_WORLD_STATIC_BLOCKERS,
  spawn: RPG_WORLD_SPAWN,
  arrivals: RPG_WORLD_ARRIVALS,
  cells: RPG_WORLD_CELLS,
  atomicCells: RPG_WORLD_ATOMIC_CELLS,
  referenceRegistration: RPG_REFERENCE_REGISTRATION,
  referenceCalibrationInput: RPG_REFERENCE_CALIBRATION_INPUT,
  referenceZoneAnchors: RPG_REFERENCE_ZONE_ANCHORS,
  referenceProtectedRectangles: RPG_REFERENCE_PROTECTED_RECTANGLES,
  referenceCameraFocusRectangles: RPG_REFERENCE_CAMERA_FOCUS_RECTANGLES,
  referenceTransitionProtectedRectangles: RPG_REFERENCE_TRANSITION_PROTECTED_RECTANGLES,
  transitionProtectedPairs: RPG_TRANSITION_PROTECTED_PAIRS
} as const;
