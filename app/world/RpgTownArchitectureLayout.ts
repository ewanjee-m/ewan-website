import type { DestinationId } from "../guide/GuideContract";
import { getRpgLandmarkRenderTier } from "./RpgTownRenderTier";
import {
  RPG_LANDMARKS,
  type RpgLandmarkKind
} from "./RpgTownSceneLayout";

export type RpgArchitectureSide = "north" | "east" | "south" | "west";
export type RpgArchitectureRoofStyle =
  | "gable"
  | "hip"
  | "terrace"
  | "stepped";

/**
 * Kawara roof tile. Real tile is a low-chroma dark grey with a blue or violet
 * cast, never a per-building accent hue — a street reads as Japanese partly
 * because every roof on it is the same handful of greys while the walls vary.
 * Every entry is kept under 0.36 relative luminance so a roof always reads as
 * a dark cap against both a bright morning sky and a night one.
 */
export const RPG_KAWARA_ROOF_COLORS = [
  "#39414c",
  "#2f3439",
  "#454f58",
  "#343c42",
  "#4a4a52"
] as const;

/**
 * Machiya townhouse walls: off-white shikkui plaster against dark charred
 * timber, with a warm ochre plaster between them. Plaster entries sit above
 * 0.7 luminance and timber entries below 0.3 so the contrast survives the
 * evening zones' lower key light.
 */
export const RPG_MACHIYA_PLASTER_COLORS = [
  "#efe9dc",
  "#e3dccb",
  "#d8cfba"
] as const;

export const RPG_MACHIYA_TIMBER_COLORS = [
  "#463a30",
  "#3b2f28",
  "#302722"
] as const;

export const RPG_MACHIYA_WALL_COLORS = [
  ...RPG_MACHIYA_PLASTER_COLORS,
  ...RPG_MACHIYA_TIMBER_COLORS
] as const;

/**
 * Above this wall height a building is plastered rather than boarded. Charred
 * timber is right for a single-storey shopfront and wrong for a whole tall
 * elevation — at chase distance a tall timber wall loses all its detail and
 * reads as one black slab, which is the opposite of the intended contrast.
 */
export const RPG_TIMBER_WALL_MAX_HEIGHT = 6;

/** Dark timber for eave fascia, verge boards and window frames. */
export const RPG_MACHIYA_TRIM_COLORS = [
  "#3a2f28",
  "#2c2320",
  "#443a31",
  "#31292a"
] as const;

export interface RpgDistrictArchitecture {
  id: string;
  zoneId: DestinationId;
  kind: RpgLandmarkKind;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
  accent: string;
  roofColor: string;
  rotationY: number;
  variant: number;
  roofStyle: RpgArchitectureRoofStyle;
  detailLevel: 2 | 3;
  blocksMovement: true;
}

export interface RpgArchitectureFacadeDetail {
  id: string;
  structureId: string;
  zoneId: DestinationId;
  side: RpgArchitectureSide;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  rotationY: number;
  rowCount: number;
  columnCount: number;
  color: string;
}

export type RpgArchitecturePropKind =
  | "bollard"
  | "streetLamp"
  | "vendingMachine"
  | "outdoorUnit"
  | "bambooFence"
  | "festivalBanner"
  | "bench"
  | "menuStand"
  | "luggageCart"
  | "stoneLantern";

export interface RpgArchitectureStreetProp {
  id: string;
  zoneId: DestinationId;
  kind: RpgArchitecturePropKind;
  position: readonly [number, number, number];
  rotationY: number;
  color: string;
  accent: string;
  blocksMovement: false;
}

export interface RpgPerimeterBuilding {
  id: string;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  rotationY: number;
  color: string;
  accent: string;
  roofColor: string;
  roofStyle: RpgArchitectureRoofStyle;
  windowRows: number;
  windowColumns: number;
}

function getRoofStyle(kind: RpgLandmarkKind): RpgArchitectureRoofStyle {
  if (kind === "machiya") return "gable";
  if (kind === "stall") return "hip";
  if (kind === "terminal") return "stepped";
  return "terrace";
}

/** Deterministic index into a palette, so a rebuild never reshuffles the town. */
function pickKawara(seed: number): string {
  return RPG_KAWARA_ROOF_COLORS[
    Math.abs(seed) % RPG_KAWARA_ROOF_COLORS.length
  ];
}

/**
 * Picks a wall from the machiya palette, forcing plaster once the elevation is
 * tall enough that a boarded wall would flatten into a silhouette.
 */
function pickMachiyaWall(seed: number, height: number): string {
  const index = Math.abs(seed) % PERIMETER_WALL_PAIRS.length;
  const [wall] = PERIMETER_WALL_PAIRS[index];
  if (
    height > RPG_TIMBER_WALL_MAX_HEIGHT &&
    (RPG_MACHIYA_TIMBER_COLORS as readonly string[]).includes(wall)
  ) {
    return RPG_MACHIYA_PLASTER_COLORS[
      index % RPG_MACHIYA_PLASTER_COLORS.length
    ];
  }
  return wall;
}

export const RPG_DISTRICT_ARCHITECTURE: readonly RpgDistrictArchitecture[] =
  RPG_LANDMARKS.filter(
    (landmark) => getRpgLandmarkRenderTier(landmark) === "batched"
  ).map((landmark, index) => ({
    id: landmark.id,
    zoneId: landmark.zoneId,
    kind: landmark.kind,
    position: landmark.position,
    size: landmark.size,
    color: landmark.color,
    accent: landmark.accent,
    roofColor: pickKawara(index * 3 + landmark.id.length),
    rotationY: landmark.rotationY ?? 0,
    variant: landmark.variant ?? 0,
    roofStyle: getRoofStyle(landmark.kind),
    detailLevel:
      landmark.kind === "tower" || landmark.kind === "machiya" ? 3 : 2,
    blocksMovement: true
  }));

export interface RpgArchitectureGroundSkirt {
  readonly id: string;
  readonly structureId: string;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotationY: number;
  readonly color: string;
}

/**
 * A thin darker slab under each building footprint. Shadow maps are switched
 * off on the low quality tier, so without this nothing grounds a building
 * there — it reads as intersecting the plaza rather than standing on it. The
 * top sits clear of every surface layer so it never z-fights the paving.
 */
export const RPG_ARCHITECTURE_GROUND_SKIRT_TOP = 0.028;
export const RPG_ARCHITECTURE_GROUND_SKIRT_THICKNESS = 0.026;
export const RPG_ARCHITECTURE_GROUND_SKIRT_SPREAD = 1.18;
export const RPG_ARCHITECTURE_GROUND_SKIRT_COLOR = "#5f584f";

export const RPG_ARCHITECTURE_GROUND_SKIRTS:
  readonly RpgArchitectureGroundSkirt[] = RPG_DISTRICT_ARCHITECTURE.filter(
    ({ kind }) => kind !== "sakuraTree"
  ).map((structure) => ({
    id: `${structure.id}-ground-skirt`,
    structureId: structure.id,
    position: [
      structure.position[0],
      RPG_ARCHITECTURE_GROUND_SKIRT_TOP -
        RPG_ARCHITECTURE_GROUND_SKIRT_THICKNESS / 2,
      structure.position[2]
    ] as const,
    size: [
      structure.size[0] * RPG_ARCHITECTURE_GROUND_SKIRT_SPREAD,
      RPG_ARCHITECTURE_GROUND_SKIRT_THICKNESS,
      structure.size[2] * RPG_ARCHITECTURE_GROUND_SKIRT_SPREAD
    ] as const,
    rotationY: structure.rotationY,
    color: RPG_ARCHITECTURE_GROUND_SKIRT_COLOR
  }));

const ARCHITECTURE_SIDES: readonly RpgArchitectureSide[] = [
  "north",
  "east",
  "south",
  "west"
];

export const RPG_ARCHITECTURE_FACADE_DETAILS: readonly RpgArchitectureFacadeDetail[] =
  RPG_DISTRICT_ARCHITECTURE.filter(
    ({ kind }) => kind !== "sakuraTree"
  ).flatMap((structure) => {
    const [x, y, z] = structure.position;
    const [width, height, depth] = structure.size;
    const facadeHeight =
      structure.kind === "stall"
        ? Math.max(0.5, height * 0.28)
        : Math.max(0.72, height * 0.58);
    const facadeY =
      structure.kind === "stall" ? y - height * 0.12 : y - height * 0.02;
    const rowCount =
      structure.kind === "tower"
        ? Math.max(4, Math.floor(height / 0.78))
        : structure.kind === "terminal"
          ? 3
          : 2;

    return ARCHITECTURE_SIDES.map((side, sideIndex) => {
      const isDepthSide = side === "north" || side === "south";
      const sideSign = side === "north" || side === "east" ? 1 : -1;
      const position: readonly [number, number, number] = isDepthSide
        ? [x, facadeY, z + sideSign * (depth / 2 + 0.035)]
        : [x + sideSign * (width / 2 + 0.035), facadeY, z];
      const facadeWidth = isDepthSide ? width : depth;
      const size: readonly [number, number, number] = isDepthSide
        ? [facadeWidth * 0.82, facadeHeight, 0.07]
        : [0.07, facadeHeight, facadeWidth * 0.82];

      return {
        id: `${structure.id}-facade-${side}`,
        structureId: structure.id,
        zoneId: structure.zoneId,
        side,
        position,
        size,
        rotationY: isDepthSide ? 0 : Math.PI / 2,
        rowCount,
        columnCount:
          structure.kind === "stall"
            ? Math.max(2, Math.floor(facadeWidth / 0.9))
            : Math.max(3, Math.floor(facadeWidth / 0.62)),
        color:
          sideIndex % 2 === 0 ? structure.accent : structure.zoneId === "tokyo"
            ? "#7bcbd2"
            : structure.accent
      };
    });
  });

function createStreetProp(
  id: string,
  zoneId: DestinationId,
  kind: RpgArchitecturePropKind,
  position: readonly [number, number, number],
  color: string,
  accent: string,
  rotationY = 0
): RpgArchitectureStreetProp {
  return {
    id,
    zoneId,
    kind,
    position,
    color,
    accent,
    rotationY,
    blocksMovement: false
  };
}

const AIRPORT_PROPS = [
  ...[-7, -3, 1, 5, 9, 13].map((z, index) =>
    createStreetProp(
      `airport-bollard-${index}`,
      "airport",
      "bollard",
      [-26.4, 0.42, z],
      "#d9d3c4",
      index % 2 === 0 ? "#e96e58" : "#5d8d9e"
    )
  ),
  createStreetProp("airport-lamp-north", "airport", "streetLamp", [-26, 1.65, 18], "#394f58", "#ffd88f"),
  createStreetProp("airport-lamp-south", "airport", "streetLamp", [-34, 1.65, -5], "#394f58", "#ffd88f"),
  createStreetProp("airport-cart-a", "airport", "luggageCart", [-34, 0.42, 8], "#7ba1aa", "#f2be58", Math.PI / 2),
  createStreetProp("airport-cart-b", "airport", "luggageCart", [-34, 0.42, 12], "#86a9b0", "#ea735f", Math.PI / 2),
  createStreetProp("airport-vending-stop", "airport", "vendingMachine", [-24.1, 1, 5.2], "#e9e7de", "#ef6f66", -Math.PI / 2)
];

const TOKYO_PROPS = [
  ...[-17, -11, -5, 1].map((x, index) =>
    createStreetProp(
      `tokyo-street-lamp-${index}`,
      "tokyo",
      "streetLamp",
      [x, 1.65, 24.2],
      "#314d57",
      index % 2 === 0 ? "#ffd786" : "#8edce2"
    )
  ),
  createStreetProp("tokyo-vending-a", "tokyo", "vendingMachine", [-19, 1, 31], "#e7e6df", "#ef6f66"),
  createStreetProp("tokyo-vending-b", "tokyo", "vendingMachine", [2.3, 1, 31], "#e7e6df", "#62cbd3", Math.PI),
  createStreetProp("tokyo-outdoor-unit-a", "tokyo", "outdoorUnit", [-15, 0.62, 35], "#c9cbc6", "#72858b"),
  createStreetProp("tokyo-outdoor-unit-b", "tokyo", "outdoorUnit", [-9, 0.62, 35], "#c9cbc6", "#72858b"),
  createStreetProp("tokyo-outdoor-unit-c", "tokyo", "outdoorUnit", [-1, 0.62, 13], "#c9cbc6", "#72858b", Math.PI),
  createStreetProp("tokyo-bench", "tokyo", "bench", [-4.5, 0.45, 24.7], "#765448", "#d3b37c", Math.PI / 2),
  createStreetProp("tokyo-vending-crossing", "tokyo", "vendingMachine", [-15.5, 1, 24.9], "#e9e7de", "#ef6f66"),
  createStreetProp("tokyo-vending-corner", "tokyo", "vendingMachine", [-9.6, 1, 24.9], "#e4ece9", "#5fc7d6")
];

const GYUKATSU_PROPS = [
  createStreetProp("gyukatsu-menu-a", "gyukatsu", "menuStand", [-3.2, 0.65, 5.8], "#6e4639", "#f0ca7c"),
  createStreetProp("gyukatsu-menu-b", "gyukatsu", "menuStand", [10.5, 0.65, 4.8], "#5c463d", "#e7b15b", Math.PI),
  createStreetProp("gyukatsu-vending", "gyukatsu", "vendingMachine", [19, 1, 2.8], "#efe8dc", "#da6459", Math.PI / 2),
  ...[-5.5, -2.5, 3.5, 6.5].map((z, index) =>
    createStreetProp(
      `gyukatsu-outdoor-unit-${index}`,
      "gyukatsu",
      "outdoorUnit",
      [index < 2 ? 18.8 : -3.5, 0.62, z],
      "#c8c7bd",
      "#6c7777",
      index < 2 ? Math.PI / 2 : -Math.PI / 2
    )
  ),
  createStreetProp("gyukatsu-lamp-a", "gyukatsu", "streetLamp", [2.2, 1.65, 5.8], "#3e4c4c", "#ffd48b"),
  createStreetProp("gyukatsu-lamp-b", "gyukatsu", "streetLamp", [15, 1.65, -3.8], "#3e4c4c", "#ffd48b"),
  createStreetProp("gyukatsu-bench", "gyukatsu", "bench", [4, 0.45, -8.2], "#704b3b", "#d4af72"),
  createStreetProp("gyukatsu-vending-plaza", "gyukatsu", "vendingMachine", [12.9, 1, 2.4], "#efe8dc", "#da6459", Math.PI / 2)
];

const SAKURA_PROPS = [
  ...[-10.5, -14.5, -18.5, -24.5, -28.5].map((z, index) =>
    createStreetProp(
      `sakura-bamboo-fence-${index}`,
      "sakura",
      "bambooFence",
      [2.5, 0.58, z],
      "#8b8058",
      "#c6bb78",
      Math.PI / 2
    )
  ),
  createStreetProp("sakura-stone-lantern-a", "sakura", "stoneLantern", [2.9, 0.9, -29.2], "#8c918b", "#ffd19a"),
  createStreetProp("sakura-stone-lantern-b", "sakura", "stoneLantern", [8.2, 0.9, -29.2], "#8c918b", "#ffd19a"),
  createStreetProp("sakura-bench-a", "sakura", "bench", [14.9, 0.45, -24], "#74584b", "#c7a67b", Math.PI / 2),
  createStreetProp("sakura-bench-b", "sakura", "bench", [14.9, 0.45, -11.5], "#74584b", "#c7a67b", Math.PI / 2),
  createStreetProp("sakura-lamp", "sakura", "streetLamp", [2.4, 1.65, -32], "#495555", "#ffc7d5")
];

const HANABI_PROPS = [
  ...[19, 22, 25, 28, 31, 34].map((x, index) =>
    createStreetProp(
      `hanabi-banner-${index}`,
      "hanabi",
      "festivalBanner",
      [x, 1.7, index % 2 === 0 ? -20 : -28],
      index % 3 === 0 ? "#d64f55" : index % 3 === 1 ? "#476e8a" : "#765182",
      index % 2 === 0 ? "#ffd269" : "#f5a6bf"
    )
  ),
  createStreetProp("hanabi-lamp-a", "hanabi", "streetLamp", [19, 1.65, -31], "#4c3f43", "#ffb664"),
  createStreetProp("hanabi-lamp-b", "hanabi", "streetLamp", [35, 1.65, -20], "#4c3f43", "#ffb664"),
  createStreetProp("hanabi-bench-a", "hanabi", "bench", [20, 0.45, -29.5], "#6f4c40", "#e3b76a"),
  createStreetProp("hanabi-bench-b", "hanabi", "bench", [34, 0.45, -29.5], "#6f4c40", "#e3b76a")
];

export const RPG_ARCHITECTURE_STREET_PROPS: readonly RpgArchitectureStreetProp[] = [
  ...AIRPORT_PROPS,
  ...TOKYO_PROPS,
  ...GYUKATSU_PROPS,
  ...SAKURA_PROPS,
  ...HANABI_PROPS
];

/**
 * Wall / trim pairs for the two tiled-roof rings. Plaster and timber
 * alternate along a run the way a machiya street does, rather than each
 * building being its own city grey.
 */
const PERIMETER_WALL_PAIRS = [
  [RPG_MACHIYA_WALL_COLORS[0], RPG_MACHIYA_TRIM_COLORS[0]],
  [RPG_MACHIYA_WALL_COLORS[3], RPG_MACHIYA_TRIM_COLORS[1]],
  [RPG_MACHIYA_WALL_COLORS[1], RPG_MACHIYA_TRIM_COLORS[2]],
  [RPG_MACHIYA_WALL_COLORS[4], RPG_MACHIYA_TRIM_COLORS[0]],
  [RPG_MACHIYA_WALL_COLORS[2], RPG_MACHIYA_TRIM_COLORS[3]],
  [RPG_MACHIYA_WALL_COLORS[5], RPG_MACHIYA_TRIM_COLORS[1]]
] as const;
/** The far ring stays a modern city — Japanese towns do sit under one. */
const SKYLINE_COLORS = [
  ["#67707f", "#2c3a4b"],
  ["#5d6b76", "#27414f"],
  ["#6f6873", "#3d3243"],
  ["#616f74", "#2b4148"]
] as const;
/**
 * The two near rings carry pitched tile only. Alternating gable and hip gives
 * the horizon a ridge-and-hip rhythm instead of a row of flat caps, which was
 * the single largest generic surface in every zone capture.
 */
const TILED_PERIMETER_ROOFS: readonly RpgArchitectureRoofStyle[] = [
  "gable",
  "hip"
];

const PERIMETER_NEIGHBORHOOD_RING: readonly RpgPerimeterBuilding[] =
  Array.from({ length: 32 }, (_, index) => {
    const side = index % 4;
    const slot = Math.floor(index / 4);
    const along = -31.5 + slot * 9;
    const height = 4.1 + ((index * 7) % 6) * 1.36;
    const width = 4.6 + (index % 3) * 0.62;
    const depth = 4.2 + ((index + 1) % 3) * 0.58;
    const x = side === 1 ? 41.5 : side === 3 ? -41.5 : along;
    const z = side === 0 ? -41.5 : side === 2 ? 41.5 : along;
    const [, accent] =
      PERIMETER_WALL_PAIRS[index % PERIMETER_WALL_PAIRS.length];
    const color = pickMachiyaWall(index, height);

    return {
      id: `perimeter-neighborhood-${index}`,
      position: [x, height / 2 - 0.08, z],
      size: [width, height, depth],
      rotationY:
        side === 0 ? 0 : side === 1 ? -Math.PI / 2 : side === 2 ? Math.PI : Math.PI / 2,
      color,
      accent,
      roofColor: pickKawara(index * 2 + 1),
      roofStyle: TILED_PERIMETER_ROOFS[index % TILED_PERIMETER_ROOFS.length],
      windowRows: Math.max(2, Math.floor(height / 1.6)),
      windowColumns: Math.max(2, Math.floor(width / 1.4))
    } satisfies RpgPerimeterBuilding;
  });

const PERIMETER_SKYLINE_RING: readonly RpgPerimeterBuilding[] = Array.from(
  { length: 24 },
  (_, index) => {
    const side = index % 4;
    const slot = Math.floor(index / 4);
    const along = -38 + slot * 15.5 + (index % 3) * 2.4;
    const outward = 53 + (index % 4) * 3.4;
    const height = 8.6 + ((index * 5) % 7) * 2.35;
    const width = 5.4 + (index % 4) * 1.45;
    const depth = 5.1 + ((index + 2) % 3) * 1.2;
    const x = side === 1 ? outward : side === 3 ? -outward : along;
    const z = side === 0 ? -outward : side === 2 ? outward : along;
    const [color, accent] = SKYLINE_COLORS[index % SKYLINE_COLORS.length];

    return {
      id: `perimeter-skyline-${index}`,
      position: [x, height / 2 - 0.08, z],
      size: [width, height, depth],
      rotationY:
        side === 0 ? 0 : side === 1 ? -Math.PI / 2 : side === 2 ? Math.PI : Math.PI / 2,
      color,
      accent,
      roofColor: pickKawara(index + 4),
      roofStyle: index % 3 === 0 ? "stepped" : "terrace",
      windowRows: Math.max(3, Math.floor(height / 2.4)),
      windowColumns: Math.max(2, Math.floor(width / 2.2))
    } satisfies RpgPerimeterBuilding;
  }
);

const PERIMETER_MID_RING: readonly RpgPerimeterBuilding[] = Array.from(
  { length: 20 },
  (_, index) => {
    const side = index % 4;
    const slot = Math.floor(index / 4);
    const along = -34 + slot * 17 + (index % 3) * 1.8;
    const outward = 45.5 + (index % 3) * 2.2;
    const height = 6.2 + ((index * 3) % 5) * 1.9;
    const width = 5 + (index % 3) * 1.1;
    const depth = 4.8 + ((index + 1) % 3) * 0.9;
    const x = side === 1 ? outward : side === 3 ? -outward : along;
    const z = side === 0 ? -outward : side === 2 ? outward : along;
    const [, accent] =
      PERIMETER_WALL_PAIRS[(index + 2) % PERIMETER_WALL_PAIRS.length];
    const color = pickMachiyaWall(index + 2, height);

    return {
      id: `perimeter-mid-${index}`,
      position: [x, height / 2 - 0.08, z],
      size: [width, height, depth],
      rotationY:
        side === 0 ? 0 : side === 1 ? -Math.PI / 2 : side === 2 ? Math.PI : Math.PI / 2,
      color,
      accent,
      roofColor: pickKawara(index * 3 + 2),
      roofStyle: TILED_PERIMETER_ROOFS[(index + 1) % TILED_PERIMETER_ROOFS.length],
      windowRows: Math.max(3, Math.floor(height / 2)),
      windowColumns: Math.max(2, Math.floor(width / 1.8))
    } satisfies RpgPerimeterBuilding;
  }
);

export const RPG_PERIMETER_NEIGHBORHOOD: readonly RpgPerimeterBuilding[] = [
  ...PERIMETER_NEIGHBORHOOD_RING,
  ...PERIMETER_MID_RING,
  ...PERIMETER_SKYLINE_RING
];

export const RPG_PERIMETER_NEAR_RING_IDS: readonly string[] =
  PERIMETER_NEIGHBORHOOD_RING.map(({ id }) => id);
export const RPG_PERIMETER_MID_RING_IDS: readonly string[] =
  PERIMETER_MID_RING.map(({ id }) => id);
export const RPG_PERIMETER_SKYLINE_RING_IDS: readonly string[] =
  PERIMETER_SKYLINE_RING.map(({ id }) => id);

/**
 * How far a tiled roof projects past the wall below it, per side. Deep eaves
 * are the single strongest silhouette cue for a Japanese roof: the shadow
 * line they throw is what separates a machiya from a box with a coloured cap.
 * 0.62 world units is roughly a third of a storey at this town's scale.
 */
export const RPG_TILED_ROOF_EAVE_OVERHANG = 0.62;
/** Height of the ridge above the eave line, as a share of the footprint. */
export const RPG_TILED_ROOF_PITCH = 0.3;
/** Thickness of one tiled roof slab. */
export const RPG_TILED_ROOF_THICKNESS = 0.17;

export interface RpgTiledRoof {
  readonly id: string;
  readonly structureId: string;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotationY: number;
  readonly style: "gable" | "hip";
  readonly roofColor: string;
  readonly trimColor: string;
  readonly eaveWidth: number;
  readonly eaveDepth: number;
  readonly eaveY: number;
  readonly ridgeRise: number;
  readonly cornerFlickCount: 4;
  readonly hasRidge: true;
}

function createTiledRoof(
  structure: RpgDistrictArchitecture | RpgPerimeterBuilding,
  index: number
): RpgTiledRoof {
  const [width, height, depth] = structure.size;
  const eaveWidth = width + RPG_TILED_ROOF_EAVE_OVERHANG * 2;
  const eaveDepth = depth + RPG_TILED_ROOF_EAVE_OVERHANG * 2;
  return {
    id: `${structure.id}-tiled-roof`,
    structureId: structure.id,
    position: structure.position,
    size: structure.size,
    rotationY: structure.rotationY,
    style: structure.roofStyle === "hip" ? "hip" : "gable",
    roofColor: structure.roofColor,
    trimColor:
      RPG_MACHIYA_TRIM_COLORS[index % RPG_MACHIYA_TRIM_COLORS.length],
    eaveWidth,
    eaveDepth,
    eaveY: structure.position[1] + height / 2 + 0.06,
    ridgeRise: Math.min(1.35, Math.max(0.62, eaveDepth * RPG_TILED_ROOF_PITCH)),
    cornerFlickCount: 4,
    hasRidge: true
  };
}

/**
 * Every structure that gets a full pitched tile roof: both near perimeter
 * rings plus the machiya. Towers keep their flat tops — mid-rise Japanese
 * city blocks really are flat-roofed — and pick up a tiled shop eave instead.
 */
export const RPG_TILED_ROOF_STRUCTURES: readonly RpgTiledRoof[] = [
  ...PERIMETER_NEIGHBORHOOD_RING,
  ...PERIMETER_MID_RING,
  ...RPG_DISTRICT_ARCHITECTURE.filter(({ kind }) => kind === "machiya")
].map(createTiledRoof);

export interface RpgShopfrontEave {
  readonly id: string;
  readonly structureId: string;
  readonly zoneId: DestinationId;
  readonly position: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly rotationY: number;
  readonly roofColor: string;
  readonly trimColor: string;
  readonly eaveY: number;
  readonly reach: number;
}

/**
 * The deep tiled pent roof that runs over the ground-floor shop on a Japanese
 * street. It is what makes a flat-topped mid-rise block read as Tokyo rather
 * than as anywhere: the eave line sits at first-floor height and throws a
 * hard shadow across the shopfront on all four sides.
 */
export const RPG_SHOPFRONT_EAVE_REACH = 0.86;

/**
 * The chase camera's eye sits roughly 2.3 to 3.6 units up depending on boom and
 * pitch. Holding the shop eave below that band means the camera looks down onto
 * the tiles instead of having a beam swipe across the frame at eye level.
 */
export const RPG_SHOPFRONT_EAVE_MAX_HEIGHT = 2.15;

export const RPG_SHOPFRONT_EAVES: readonly RpgShopfrontEave[] =
  RPG_DISTRICT_ARCHITECTURE.filter(
    ({ kind }) => kind === "tower" || kind === "terminal"
  ).map((structure, index) => {
    const [, height] = structure.size;
    const groundY = structure.position[1] - height / 2;
    return {
      id: `${structure.id}-shop-eave`,
      structureId: structure.id,
      zoneId: structure.zoneId,
      position: structure.position,
      size: structure.size,
      rotationY: structure.rotationY,
      roofColor: structure.roofColor,
      trimColor:
        RPG_MACHIYA_TRIM_COLORS[index % RPG_MACHIYA_TRIM_COLORS.length],
      eaveY:
        groundY +
        Math.min(
          RPG_SHOPFRONT_EAVE_MAX_HEIGHT,
          Math.max(1.55, height * 0.31)
        ),
      reach: RPG_SHOPFRONT_EAVE_REACH
    };
  });
