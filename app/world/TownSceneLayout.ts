import type { DestinationId } from "../guide/GuideContract";

export interface TownZoneLayout {
  id: DestinationId;
  minimumX: number;
  maximumX: number;
  centerX: number;
}

export interface TownWalkCorridor {
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}

export const TOWN_BOUNDS = {
  minimumX: -26.4,
  maximumX: 26.4,
  minimumZ: -10,
  maximumZ: 10
} as const;

export const TOWN_BACKDROP = {
  asset: "/assets/world/world-environment-concept.png",
  position: [0, 14, -34] as const,
  size: [72, (72 * 866) / 1817] as const
} as const;

export interface TownStructureLayout {
  id: string;
  kind:
    | "building"
    | "bus"
    | "shop"
    | "tree"
    | "canal"
    | "bridge"
    | "stall"
    | "lantern"
    | "hanabi";
  zoneId: DestinationId;
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
  accent: string;
  blocksMovement: boolean;
  rotationY?: number;
}

export interface TownSurfaceLayout {
  id: string;
  kind: "ground" | "road" | "sidewalk";
  position: readonly [number, number, number];
  size: readonly [number, number, number];
  color: string;
}

export const TOWN_ZONES: readonly TownZoneLayout[] = [
  { id: "airport", minimumX: -26.4, maximumX: -16, centerX: -21.2 },
  { id: "tokyo", minimumX: -16, maximumX: -5.5, centerX: -10.75 },
  { id: "gyukatsu", minimumX: -5.5, maximumX: 5.5, centerX: 0 },
  { id: "sakura", minimumX: 5.5, maximumX: 16, centerX: 10.75 },
  { id: "hanabi", minimumX: 16, maximumX: 26.4, centerX: 21.2 }
] as const;

export const TOWN_WALK_CORRIDOR: TownWalkCorridor = {
  minimumX: TOWN_BOUNDS.minimumX,
  maximumX: TOWN_BOUNDS.maximumX,
  minimumZ: -4.5,
  maximumZ: 4.5
} as const;

const TOWN_WIDTH = TOWN_BOUNDS.maximumX - TOWN_BOUNDS.minimumX;
const TOWN_DEPTH = TOWN_BOUNDS.maximumZ - TOWN_BOUNDS.minimumZ;

export const TOWN_SURFACES: readonly TownSurfaceLayout[] = [
  {
    id: "town-ground",
    kind: "ground",
    position: [0, -0.075, 0],
    size: [TOWN_WIDTH, 0.15, TOWN_DEPTH],
    color: "#73805f"
  },
  {
    id: "stone-main-road",
    kind: "road",
    position: [0, 0.035, 0],
    size: [TOWN_WIDTH, 0.07, 7.7],
    color: "#b4a895"
  },
  {
    id: "north-sidewalk",
    kind: "sidewalk",
    position: [0, 0.07, -4.45],
    size: [TOWN_WIDTH, 0.14, 1.2],
    color: "#d0c3ad"
  },
  {
    id: "south-sidewalk",
    kind: "sidewalk",
    position: [0, 0.07, 4.45],
    size: [TOWN_WIDTH, 0.14, 1.2],
    color: "#d0c3ad"
  }
] as const;

export const TOWN_STRUCTURES: readonly TownStructureLayout[] = [
  {
    id: "airport-terminal",
    kind: "building",
    zoneId: "airport",
    position: [-22.1, 1.6, -7.35],
    size: [5.8, 3.2, 2.7],
    color: "#d7d9d8",
    accent: "#d65445",
    blocksMovement: true
  },
  {
    id: "airport-limousine-bus",
    kind: "bus",
    zoneId: "airport",
    position: [-20.8, 0.9, 6.65],
    size: [3.8, 1.8, 1.6],
    color: "#f4eee2",
    accent: "#d85d44",
    blocksMovement: true
  },
  {
    id: "tokyo-glass-tower",
    kind: "building",
    zoneId: "tokyo",
    position: [-13.8, 3.7, -7.15],
    size: [3.2, 7.4, 3.4],
    color: "#29445c",
    accent: "#78d3da",
    blocksMovement: true
  },
  {
    id: "tokyo-neon-building",
    kind: "building",
    zoneId: "tokyo",
    position: [-10.1, 2.8, 7],
    size: [3.5, 5.6, 3.5],
    color: "#54475e",
    accent: "#f17ca6",
    blocksMovement: true
  },
  {
    id: "tokyo-slim-tower",
    kind: "building",
    zoneId: "tokyo",
    position: [-6.9, 2.4, -7.35],
    size: [2.4, 4.8, 2.8],
    color: "#355867",
    accent: "#f3b358",
    blocksMovement: true
  },
  {
    id: "gyukatsu-main-shop",
    kind: "shop",
    zoneId: "gyukatsu",
    position: [0, 1.5, -7.2],
    size: [5.8, 3, 3.4],
    color: "#70463c",
    accent: "#efb25c",
    blocksMovement: true
  },
  {
    id: "gyukatsu-side-machiya",
    kind: "shop",
    zoneId: "gyukatsu",
    position: [3.9, 1.25, 7.2],
    size: [2.6, 2.5, 3],
    color: "#496061",
    accent: "#e8d1a4",
    blocksMovement: true
  },
  {
    id: "sakura-tree-west-north",
    kind: "tree",
    zoneId: "sakura",
    position: [7.2, 1.9, -5.8],
    size: [2.1, 3.8, 2.1],
    color: "#784e42",
    accent: "#f8adc4",
    blocksMovement: true
  },
  {
    id: "sakura-tree-west-south",
    kind: "tree",
    zoneId: "sakura",
    position: [9.5, 2, 5.8],
    size: [2.15, 4, 2.15],
    color: "#71463c",
    accent: "#f6b6cf",
    blocksMovement: true
  },
  {
    id: "sakura-tree-east-north",
    kind: "tree",
    zoneId: "sakura",
    position: [12, 2.1, -5.85],
    size: [2.2, 4.2, 2.2],
    color: "#765044",
    accent: "#f5a7c2",
    blocksMovement: true
  },
  {
    id: "sakura-tree-east-south",
    kind: "tree",
    zoneId: "sakura",
    position: [14, 1.85, 5.8],
    size: [2, 3.7, 2],
    color: "#70483e",
    accent: "#ffc2d7",
    blocksMovement: true
  },
  {
    id: "sakura-canal",
    kind: "canal",
    zoneId: "sakura",
    position: [14.85, 0.015, 0],
    size: [1.7, 0.03, 19],
    color: "#3b89a3",
    accent: "#9be0e4",
    blocksMovement: false
  },
  {
    id: "sakura-arched-bridge",
    kind: "bridge",
    zoneId: "sakura",
    position: [14.85, 0.1, 0],
    size: [3.3, 0.2, 8.2],
    color: "#b84e3d",
    accent: "#f1b064",
    blocksMovement: false
  },
  {
    id: "hanabi-stall-apple",
    kind: "stall",
    zoneId: "hanabi",
    position: [18.3, 1.05, -6.7],
    size: [2.2, 2.1, 2],
    color: "#a83f45",
    accent: "#f5c66e",
    blocksMovement: true
  },
  {
    id: "hanabi-stall-mask",
    kind: "stall",
    zoneId: "hanabi",
    position: [20.8, 1, 6.7],
    size: [2.2, 2, 2],
    color: "#375f69",
    accent: "#ee8b86",
    blocksMovement: true
  },
  {
    id: "hanabi-stall-goldfish",
    kind: "stall",
    zoneId: "hanabi",
    position: [23.3, 1.05, -6.7],
    size: [2.2, 2.1, 2],
    color: "#76506c",
    accent: "#6bd0c5",
    blocksMovement: true
  },
  ...[17.2, 20.2, 23.2, 25.2].flatMap((x, index) =>
    ([-4.75, 4.75] as const).map(
      (z): TownStructureLayout => ({
        id: `hanabi-lantern-${index}-${z < 0 ? "north" : "south"}`,
        kind: "lantern",
        zoneId: "hanabi",
        position: [x, 1.25, z],
        size: [0.16, 2.5, 0.16],
        color: "#47352f",
        accent: index % 2 === 0 ? "#ff785f" : "#ffd16d",
        blocksMovement: true
      })
    )
  ),
  {
    id: "hanabi-burst-coral",
    kind: "hanabi",
    zoneId: "hanabi",
    position: [19.4, 8.8, -8.8],
    size: [3.4, 3.4, 0.1],
    color: "#ff716c",
    accent: "#ffd56c",
    blocksMovement: false
  },
  {
    id: "hanabi-burst-sky",
    kind: "hanabi",
    zoneId: "hanabi",
    position: [23.4, 10.5, -8.65],
    size: [4, 4, 0.1],
    color: "#75c9ff",
    accent: "#f2a6ff",
    blocksMovement: false
  }
] as const;
