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

export interface RpgDistrictArchitecture {
  id: string;
  zoneId: DestinationId;
  kind: RpgLandmarkKind;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
  accent: string;
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

export const RPG_DISTRICT_ARCHITECTURE: readonly RpgDistrictArchitecture[] =
  RPG_LANDMARKS.filter(
    (landmark) => getRpgLandmarkRenderTier(landmark) === "batched"
  ).map((landmark) => ({
    id: landmark.id,
    zoneId: landmark.zoneId,
    kind: landmark.kind,
    position: landmark.position,
    size: landmark.size,
    color: landmark.color,
    accent: landmark.accent,
    rotationY: landmark.rotationY ?? 0,
    variant: landmark.variant ?? 0,
    roofStyle: getRoofStyle(landmark.kind),
    detailLevel:
      landmark.kind === "tower" || landmark.kind === "machiya" ? 3 : 2,
    blocksMovement: true
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
  createStreetProp("gyukatsu-lamp-a", "gyukatsu", "streetLamp", [5, 1.65, 5.8], "#3e4c4c", "#ffd48b"),
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

const PERIMETER_COLORS = [
  ["#8f9099", "#3c4a56"],
  ["#7f8f92", "#2f515c"],
  ["#94818a", "#5c414c"],
  ["#8b8d79", "#4a4c3c"],
  ["#7d8b9a", "#36506a"]
] as const;
const SKYLINE_COLORS = [
  ["#67707f", "#2c3a4b"],
  ["#5d6b76", "#27414f"],
  ["#6f6873", "#3d3243"],
  ["#616f74", "#2b4148"]
] as const;
const PERIMETER_ROOFS: readonly RpgArchitectureRoofStyle[] = [
  "gable",
  "hip",
  "terrace",
  "stepped"
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
    const [color, accent] = PERIMETER_COLORS[index % PERIMETER_COLORS.length];

    return {
      id: `perimeter-neighborhood-${index}`,
      position: [x, height / 2 - 0.08, z],
      size: [width, height, depth],
      rotationY:
        side === 0 ? 0 : side === 1 ? -Math.PI / 2 : side === 2 ? Math.PI : Math.PI / 2,
      color,
      accent,
      roofStyle: PERIMETER_ROOFS[index % PERIMETER_ROOFS.length],
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
    const [color, accent] = SKYLINE_COLORS[(index + 2) % SKYLINE_COLORS.length];

    return {
      id: `perimeter-mid-${index}`,
      position: [x, height / 2 - 0.08, z],
      size: [width, height, depth],
      rotationY:
        side === 0 ? 0 : side === 1 ? -Math.PI / 2 : side === 2 ? Math.PI : Math.PI / 2,
      color,
      accent,
      roofStyle: index % 2 === 0 ? "terrace" : "stepped",
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
