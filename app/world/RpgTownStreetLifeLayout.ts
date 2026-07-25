import type { DestinationId } from "../guide/GuideContract";
import {
  RPG_DISTRICT_ARCHITECTURE,
  RPG_KAWARA_ROOF_COLORS,
  type RpgDistrictArchitecture
} from "./RpgTownArchitectureLayout";
import {
  FLAT_WORLD_HALF_WIDTH,
  getDestinationPosition
} from "../guide/WorldNavigation";
import {
  RPG_TOWN_BOUNDS,
  isRpgWalkablePosition
} from "./RpgTownSceneLayout";

export type RpgStreetLifeVector3 = readonly [number, number, number];

export interface RpgStreetLifeInstance {
  id: string;
  position: RpgStreetLifeVector3;
  size: RpgStreetLifeVector3;
  rotation: RpgStreetLifeVector3;
  color: string;
}

export interface RpgStreetLifeRock {
  id: string;
  position: RpgStreetLifeVector3;
  rotation: RpgStreetLifeVector3;
  scale: RpgStreetLifeVector3;
  color: string;
  blocksMovement: false;
}

export interface RpgHangingLantern {
  id: string;
  position: RpgStreetLifeVector3;
  scale: RpgStreetLifeVector3;
  color: string;
  blocksMovement: false;
}

const NO_ROTATION: RpgStreetLifeVector3 = [0, 0, 0];

export const RPG_TOWN_SPAWN_POINT: readonly [x: number, z: number] = [
  getDestinationPosition("airport", FLAT_WORLD_HALF_WIDTH)[0],
  1.5
];

export const RPG_TOWN_SPAWN_CLEARANCE_RADIUS = 4;

export function isOutsideRpgSpawnClearance(x: number, z: number): boolean {
  return (
    Math.hypot(x - RPG_TOWN_SPAWN_POINT[0], z - RPG_TOWN_SPAWN_POINT[1]) >=
    RPG_TOWN_SPAWN_CLEARANCE_RADIUS
  );
}

function deterministicUnit(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function rotateLocal(
  origin: RpgStreetLifeVector3,
  rotationY: number,
  local: RpgStreetLifeVector3
): RpgStreetLifeVector3 {
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  return [
    origin[0] + local[0] * cos + local[2] * sin,
    origin[1] + local[1],
    origin[2] - local[0] * sin + local[2] * cos
  ];
}

const SHOPFRONT_AWNING_PALETTE: Record<string, readonly string[]> = {
  airport: ["#c9d3d2", "#9fb4bb"],
  tokyo: ["#c65449", "#3f6a80", "#6d5580", "#c98a44"],
  gyukatsu: ["#8f3f3c", "#3f5d5c", "#a15e35"],
  sakura: ["#b05a70", "#7d6a8a"],
  hanabi: ["#a8434b", "#3f5f74"]
};

const SHOPFRONT_SIGN_PALETTE: Record<string, readonly string[]> = {
  airport: ["#ffe0ad", "#ffd08a"],
  tokyo: ["#ffd782", "#8fe4ea", "#ff9fbb", "#ffc06a"],
  gyukatsu: ["#ffc76b", "#ffe1a8", "#ff9a63"],
  sakura: ["#ffd2e0", "#ffe3b5"],
  hanabi: ["#ffbf6a", "#ff8d7a"]
};

function pickPalette(
  palette: Record<string, readonly string[]>,
  zoneId: DestinationId,
  variant: number
): string {
  const entries = palette[zoneId] ?? palette.tokyo;
  return entries[variant % entries.length];
}

const SHOPFRONT_STRUCTURES = RPG_DISTRICT_ARCHITECTURE.filter(
  ({ kind }) => kind === "tower" || kind === "machiya" || kind === "terminal"
);

export function getRpgStreetFacingRotation(
  structure: Pick<RpgDistrictArchitecture, "position" | "rotationY">
): number {
  return structure.rotationY + (structure.position[2] < 0 ? 0 : Math.PI);
}

function createShopfrontShades(
  structure: RpgDistrictArchitecture
): RpgStreetLifeInstance[] {
  const [width, height, depth] = structure.size;
  const groundY = structure.position[1] - height / 2;
  const awningY = groundY + Math.min(2.7, Math.max(1.5, height * 0.52));
  const front = depth / 2;
  const awningColor = pickPalette(
    SHOPFRONT_AWNING_PALETTE,
    structure.zoneId,
    structure.variant
  );
  const timberColor = structure.kind === "machiya" ? "#3f2e2a" : "#4a4842";
  const facing = getRpgStreetFacingRotation(structure);

  return [
    {
      id: `${structure.id}-awning`,
      position: rotateLocal(structure.position, facing, [
        0,
        awningY - structure.position[1],
        front + 0.52
      ]),
      size: [width * 0.88, 0.12, 1.06],
      rotation: [-0.26, facing, 0],
      color: awningColor
    },
    {
      id: `${structure.id}-awning-valance`,
      position: rotateLocal(structure.position, facing, [
        0,
        awningY - structure.position[1] - 0.32,
        front + 0.98
      ]),
      size: [width * 0.88, 0.34, 0.06],
      rotation: [0, facing, 0],
      color: awningColor
    },
    ...[-1, 1].map(
      (side): RpgStreetLifeInstance => ({
        id: `${structure.id}-awning-bracket-${side > 0 ? "east" : "west"}`,
        position: rotateLocal(structure.position, facing, [
          side * width * 0.38,
          awningY - structure.position[1] - 0.36,
          front + 0.14
        ]),
        size: [0.09, 0.72, 0.12],
        rotation: [0, facing, side * 0.18],
        color: timberColor
      })
    ),
    {
      id: `${structure.id}-shop-step`,
      position: rotateLocal(structure.position, facing, [
        0,
        groundY - structure.position[1] + 0.08,
        front + 0.34
      ]),
      size: [width * 0.9, 0.16, 0.74],
      rotation: [0, facing, 0],
      color: "#b3aa9a"
    },
    {
      id: `${structure.id}-shop-pillar-west`,
      position: rotateLocal(structure.position, facing, [
        -width * 0.45,
        groundY - structure.position[1] + Math.min(1.5, height * 0.34),
        front + 0.12
      ]),
      size: [0.16, Math.min(3, height * 0.68), 0.24],
      rotation: [0, facing, 0],
      color: timberColor
    },
    {
      id: `${structure.id}-shop-pillar-east`,
      position: rotateLocal(structure.position, facing, [
        width * 0.45,
        groundY - structure.position[1] + Math.min(1.5, height * 0.34),
        front + 0.12
      ]),
      size: [0.16, Math.min(3, height * 0.68), 0.24],
      rotation: [0, facing, 0],
      color: timberColor
    }
  ];
}

function createShopfrontSigns(
  structure: RpgDistrictArchitecture
): RpgStreetLifeInstance[] {
  const [width, height, depth] = structure.size;
  const groundY = structure.position[1] - height / 2;
  const awningY = groundY + Math.min(2.7, Math.max(1.5, height * 0.52));
  const front = depth / 2;
  const signColor = pickPalette(
    SHOPFRONT_SIGN_PALETTE,
    structure.zoneId,
    structure.variant
  );
  const facing = getRpgStreetFacingRotation(structure);

  const signs: RpgStreetLifeInstance[] = [
    {
      id: `${structure.id}-sign-band`,
      position: rotateLocal(structure.position, facing, [
        0,
        awningY - structure.position[1] + 0.5,
        front + 0.2
      ]),
      size: [width * 0.8, 0.44, 0.1],
      rotation: [0, facing, 0],
      color: signColor
    },
    {
      id: `${structure.id}-shopfront-glazing`,
      position: rotateLocal(structure.position, facing, [
        0,
        groundY - structure.position[1] + 1,
        front + 0.18
      ]),
      size: [width * 0.66, 1.14, 0.07],
      rotation: [0, facing, 0],
      color: structure.kind === "machiya" ? "#ffd9a0" : "#cfeef1"
    }
  ];

  if (height > 4) {
    signs.push({
      id: `${structure.id}-sign-board`,
      position: rotateLocal(structure.position, facing, [
        width * 0.4,
        awningY - structure.position[1] + 1.42,
        front + 0.34
      ]),
      size: [0.3, 1.5, 0.16],
      rotation: [0, facing, 0],
      color: signColor
    });
  }

  return signs;
}

export const RPG_SHOPFRONT_SHADES: readonly RpgStreetLifeInstance[] =
  SHOPFRONT_STRUCTURES.flatMap(createShopfrontShades);

export const RPG_SHOPFRONT_SIGNS: readonly RpgStreetLifeInstance[] =
  SHOPFRONT_STRUCTURES.flatMap(createShopfrontSigns);

/**
 * Noren: the split cloth curtain hung across a shop doorway. Three panels with
 * gaps between them, indigo dyed, hanging from a rail just above head height.
 * It is the cheapest possible signal that a doorway is a Japanese shop rather
 * than a hole in a wall, and it survives at chase-camera distance because the
 * dark cloth reads as a solid block against the lit shopfront behind it.
 */
const NOREN_COLORS = ["#27406b", "#1f3357", "#2f4a78"] as const;
const NOREN_PANEL_COUNT = 3;

function createNorenCurtain(
  structure: RpgDistrictArchitecture,
  index: number
): RpgStreetLifeInstance[] {
  const [width, height, depth] = structure.size;
  const groundY = structure.position[1] - height / 2;
  const facing = getRpgStreetFacingRotation(structure);
  const clothColor = NOREN_COLORS[index % NOREN_COLORS.length];
  // Hang the rail clear of the wall so the curtain never z-fights the facade.
  const front = depth / 2 + 0.46;
  const clothWidth = Math.min(0.66, (width * 0.62) / NOREN_PANEL_COUNT);
  const clothHeight = Math.min(0.78, Math.max(0.5, height * 0.16));
  const railY = groundY + Math.min(2.15, Math.max(1.5, height * 0.34));

  return [
    {
      id: `${structure.id}-noren-rail`,
      position: rotateLocal(structure.position, facing, [
        0,
        railY - structure.position[1] + clothHeight / 2 + 0.05,
        front
      ]),
      size: [clothWidth * NOREN_PANEL_COUNT * 1.22, 0.09, 0.09],
      rotation: [0, facing, 0],
      color: "#2c2320"
    },
    ...Array.from({ length: NOREN_PANEL_COUNT }, (_, panel) => {
      const offset =
        (panel - (NOREN_PANEL_COUNT - 1) / 2) * clothWidth * 1.1;
      return {
        id: `${structure.id}-noren-panel-${panel}`,
        position: rotateLocal(structure.position, facing, [
          offset,
          railY - structure.position[1],
          front
        ]),
        size: [clothWidth, clothHeight, 0.05] as RpgStreetLifeVector3,
        rotation: [0, facing, 0] as RpgStreetLifeVector3,
        color: clothColor
      };
    })
  ];
}

export const RPG_NOREN_CURTAINS: readonly RpgStreetLifeInstance[] =
  SHOPFRONT_STRUCTURES.flatMap(createNorenCurtain);

/**
 * Koushi: the timber lattice that fronts a machiya. A run of thin vertical
 * battens standing proud of the ground storey. At distance it collapses into a
 * dark grained band, which is exactly the read a plain painted panel lacks.
 */
const LATTICE_BATTEN_COUNT = 7;
const LATTICE_COLORS = ["#2c2320", "#31292a", "#3a2f28"] as const;

function createShopfrontLattice(
  structure: RpgDistrictArchitecture,
  index: number
): RpgStreetLifeInstance[] {
  const [width, height, depth] = structure.size;
  const groundY = structure.position[1] - height / 2;
  const facing = getRpgStreetFacingRotation(structure);
  const front = depth / 2 + 0.13;
  const battenHeight = Math.min(1.55, Math.max(0.95, height * 0.3));
  const span = width * 0.72;

  return Array.from({ length: LATTICE_BATTEN_COUNT }, (_, batten) => {
    const offset =
      -span / 2 + (span * batten) / (LATTICE_BATTEN_COUNT - 1);
    return {
      id: `${structure.id}-lattice-${batten}`,
      position: rotateLocal(structure.position, facing, [
        offset,
        groundY - structure.position[1] + battenHeight / 2 + 0.1,
        front
      ]),
      size: [0.075, battenHeight, 0.06] as RpgStreetLifeVector3,
      rotation: [0, facing, 0] as RpgStreetLifeVector3,
      color: LATTICE_COLORS[(index + batten) % LATTICE_COLORS.length]
    };
  });
}

export const RPG_SHOPFRONT_LATTICE: readonly RpgStreetLifeInstance[] =
  SHOPFRONT_STRUCTURES.flatMap(createShopfrontLattice);

const KANBAN_STRUCTURES = RPG_DISTRICT_ARCHITECTURE.filter(
  ({ kind }) => kind === "tower" || kind === "terminal"
);

/**
 * Tate-kanban: the stacked vertical sign blades bolted up the corner of a
 * Japanese city building, one per tenant floor. This is the cue that was
 * missing from the Tokyo zone — the towers there are correctly flat-roofed
 * mid-rise blocks, so the street has to be read from its signage rather than
 * its roofline, and a bare wall of windows reads as any city anywhere.
 */
const KANBAN_COLORS: Record<string, readonly string[]> = {
  airport: ["#ffd9a4", "#cfe6ef"],
  tokyo: ["#ffd782", "#8fe4ea", "#ff9fbb", "#ffb45f"],
  gyukatsu: ["#ffc76b", "#ff9a63"],
  sakura: ["#ffd2e0", "#ffe3b5"],
  hanabi: ["#ffbf6a", "#ff8d7a"]
};

function createVerticalKanban(
  structure: RpgDistrictArchitecture,
  index: number
): RpgStreetLifeInstance[] {
  const [width, height, depth] = structure.size;
  const groundY = structure.position[1] - height / 2;
  const facing = getRpgStreetFacingRotation(structure);
  const palette = KANBAN_COLORS[structure.zoneId] ?? KANBAN_COLORS.tokyo;
  // Blades hang off the leading corner, alternating sides between buildings so
  // a run of towers does not read as a repeated stamp.
  const cornerSign = index % 2 === 0 ? 1 : -1;
  const bladeHeight = Math.min(1.9, Math.max(1.1, height * 0.26));
  const bladeCount = height > 6 ? 3 : 2;
  const lowest = groundY + Math.min(3.1, Math.max(2.4, height * 0.4));

  return Array.from({ length: bladeCount }, (_, blade) => ({
    id: `${structure.id}-kanban-${blade}`,
    position: rotateLocal(structure.position, facing, [
      cornerSign * (width / 2 - 0.24),
      lowest + blade * (bladeHeight + 0.34) - structure.position[1],
      depth / 2 + 0.3
    ]),
    size: [0.42, bladeHeight, 0.1] as RpgStreetLifeVector3,
    rotation: [0, facing, 0] as RpgStreetLifeVector3,
    color: palette[(index + blade) % palette.length]
  }));
}

export const RPG_VERTICAL_KANBAN: readonly RpgStreetLifeInstance[] =
  KANBAN_STRUCTURES.flatMap(createVerticalKanban);

export interface RpgToriiGate {
  readonly id: string;
  readonly zoneId: DestinationId;
  readonly position: RpgStreetLifeVector3;
  readonly rotationY: number;
  readonly height: number;
  readonly span: number;
  readonly color: string;
}

/**
 * Vermilion torii. One stands on the airport approach because that zone is the
 * first thing a visitor sees and had no Japanese cue at all; the other two cap
 * approaches that already have stone lanterns or a festival street behind them,
 * so the gate reads as the entrance to something rather than as scenery.
 */
export const RPG_TORII_GATES: readonly RpgToriiGate[] = [
  {
    id: "airport-approach-torii",
    zoneId: "airport",
    position: [-29, 0, 9],
    rotationY: 0,
    height: 4.5,
    span: 3.5,
    color: "#c1362a"
  },
  {
    id: "tokyo-alley-torii",
    zoneId: "tokyo",
    position: [-21.5, 0, 27.5],
    rotationY: Math.PI / 2,
    height: 3.8,
    span: 2.8,
    color: "#b8332b"
  },
  {
    // Sakura and hanabi already carry landmark torii, so the third gate goes
    // to gyukatsu — the food street had no shrine cue of its own — straddling
    // the east-west walking line so the visitor passes under it.
    id: "gyukatsu-approach-torii",
    zoneId: "gyukatsu",
    position: [2, 0, 0],
    rotationY: Math.PI / 2,
    height: 4.2,
    span: 3.2,
    color: "#c1362a"
  }
];

const TORII_TIMBER = "#2f2320";

function createToriiPillars(gate: RpgToriiGate): RpgStreetLifeInstance[] {
  return [-1, 1].map((side) => ({
    id: `${gate.id}-pillar-${side > 0 ? "east" : "west"}`,
    position: rotateLocal(
      [gate.position[0], 0, gate.position[2]],
      gate.rotationY,
      [(side * gate.span) / 2, gate.height / 2, 0]
    ),
    size: [0.28, gate.height, 0.28] as RpgStreetLifeVector3,
    rotation: [0, gate.rotationY, 0.02 * -side] as RpgStreetLifeVector3,
    color: gate.color
  }));
}

/**
 * Kasagi (the swept top lintel), shimaki under it, nuki tie beam, and the
 * gakuzuka plaque post between them. The kasagi is deliberately wider than the
 * pillar span and given a slight upward roll at each end — the upturned lintel
 * is the part of the silhouette people actually recognise.
 */
function createToriiBeams(gate: RpgToriiGate): RpgStreetLifeInstance[] {
  const kasagiY = gate.height - 0.12;
  const nukiY = gate.height * 0.72;
  const nukiHeight = 0.18;
  const shimakiHeight = 0.22;
  // The gakuzuka is a strut, not an ornament: it has to span from the top of
  // the nuki to the underside of the shimaki with no daylight at either end,
  // or it reads as a dark rectangle floating inside the gate.
  const plaqueBottom = nukiY + nukiHeight / 2;
  const plaqueTop = kasagiY - shimakiHeight / 2;
  const plaqueHeight = Math.max(0.24, plaqueTop - plaqueBottom);
  return [
    {
      id: `${gate.id}-kasagi`,
      position: rotateLocal(
        [gate.position[0], 0, gate.position[2]],
        gate.rotationY,
        [0, kasagiY + 0.24, 0]
      ),
      size: [gate.span + 1.35, 0.2, 0.42] as RpgStreetLifeVector3,
      rotation: [0, gate.rotationY, 0] as RpgStreetLifeVector3,
      color: TORII_TIMBER
    },
    ...[-1, 1].map((side) => ({
      id: `${gate.id}-kasagi-flick-${side > 0 ? "east" : "west"}`,
      position: rotateLocal(
        [gate.position[0], 0, gate.position[2]],
        gate.rotationY,
        [(side * (gate.span + 1.35)) / 2 + side * 0.24, kasagiY + 0.33, 0]
      ),
      size: [0.62, 0.17, 0.4] as RpgStreetLifeVector3,
      rotation: [0, gate.rotationY, side * 0.19] as RpgStreetLifeVector3,
      color: TORII_TIMBER
    })),
    {
      id: `${gate.id}-shimaki`,
      position: rotateLocal(
        [gate.position[0], 0, gate.position[2]],
        gate.rotationY,
        [0, kasagiY, 0]
      ),
      size: [gate.span + 0.95, shimakiHeight, 0.34] as RpgStreetLifeVector3,
      rotation: [0, gate.rotationY, 0] as RpgStreetLifeVector3,
      color: gate.color
    },
    {
      id: `${gate.id}-nuki`,
      position: rotateLocal(
        [gate.position[0], 0, gate.position[2]],
        gate.rotationY,
        [0, nukiY, 0]
      ),
      size: [gate.span + 0.5, nukiHeight, 0.24] as RpgStreetLifeVector3,
      rotation: [0, gate.rotationY, 0] as RpgStreetLifeVector3,
      color: gate.color
    },
    {
      id: `${gate.id}-gakuzuka`,
      position: rotateLocal(
        [gate.position[0], 0, gate.position[2]],
        gate.rotationY,
        [0, plaqueBottom + plaqueHeight / 2, 0]
      ),
      size: [0.3, plaqueHeight, 0.2] as RpgStreetLifeVector3,
      rotation: [0, gate.rotationY, 0] as RpgStreetLifeVector3,
      color: TORII_TIMBER
    }
  ];
}

export const RPG_TORII_PILLARS: readonly RpgStreetLifeInstance[] =
  RPG_TORII_GATES.flatMap(createToriiPillars);

export const RPG_STREET_TORII: readonly RpgStreetLifeInstance[] = [
  ...RPG_TORII_PILLARS,
  ...RPG_TORII_GATES.flatMap(createToriiBeams)
];

interface BoardFenceRun {
  readonly id: string;
  readonly axis: "x" | "z";
  readonly fixed: number;
  readonly from: number;
  readonly to: number;
  readonly panelCount: number;
  readonly height: number;
  readonly color: string;
  readonly capColor: string;
}

/**
 * Itabei: a board fence of close-set vertical planks under a capping rail.
 * These run along the edges the hedges used to soften on their own — a clipped
 * hedge alone reads suburban anywhere, whereas a dark timber fence with a
 * capping rail behind it reads as the back lane of a Japanese block.
 */
const BOARD_FENCE_RUNS: readonly BoardFenceRun[] = [
  {
    id: "tokyo-fence-north",
    axis: "x",
    fixed: 32.6,
    from: -16.5,
    to: -0.5,
    panelCount: 8,
    height: 1.32,
    color: "#4a3a2c",
    capColor: "#332720"
  },
  {
    id: "airport-fence-east",
    axis: "z",
    fixed: -20.8,
    from: 18,
    to: 30,
    panelCount: 7,
    height: 1.24,
    color: "#5b4636",
    capColor: "#3a2d24"
  },
  {
    id: "sakura-fence-west",
    axis: "z",
    fixed: 1.3,
    from: -34,
    to: -24,
    panelCount: 6,
    height: 1.18,
    color: "#4f3d2f",
    capColor: "#31261e"
  },
  {
    id: "gyukatsu-fence-south",
    axis: "x",
    fixed: -10.9,
    from: 10.6,
    to: 15,
    panelCount: 4,
    height: 1.26,
    color: "#54402f",
    capColor: "#352921"
  }
];

export const RPG_BOARD_FENCE_PANELS: readonly RpgStreetLifeInstance[] =
  BOARD_FENCE_RUNS.flatMap((run) => {
    const step = (run.to - run.from) / run.panelCount;
    const panels = Array.from({ length: run.panelCount }, (_, index) => {
      const along = run.from + step * (index + 0.5);
      const position: RpgStreetLifeVector3 =
        run.axis === "x"
          ? [along, run.height / 2, run.fixed]
          : [run.fixed, run.height / 2, along];
      const size: RpgStreetLifeVector3 =
        run.axis === "x"
          ? [Math.abs(step) * 0.94, run.height, 0.13]
          : [0.13, run.height, Math.abs(step) * 0.94];
      return {
        id: `${run.id}-panel-${index}`,
        position,
        size,
        rotation: NO_ROTATION,
        color: run.color
      };
    });
    const span = Math.abs(run.to - run.from);
    const centre = (run.from + run.to) / 2;
    const capPosition: RpgStreetLifeVector3 =
      run.axis === "x"
        ? [centre, run.height + 0.07, run.fixed]
        : [run.fixed, run.height + 0.07, centre];
    const capSize: RpgStreetLifeVector3 =
      run.axis === "x" ? [span, 0.14, 0.27] : [0.27, 0.14, span];
    return [
      ...panels,
      {
        id: `${run.id}-cap`,
        position: capPosition,
        size: capSize,
        rotation: NO_ROTATION,
        color: run.capColor
      }
    ];
  });

interface WireLineDefinition {
  id: string;
  axis: "x" | "z";
  fixed: number;
  stops: readonly number[];
  heights: readonly number[];
  sag: number;
  color: string;
}

const UTILITY_POLE_LINES: readonly WireLineDefinition[] = [
  {
    id: "tokyo-boulevard",
    axis: "x",
    fixed: 24,
    stops: [-24, -18, -12, -6],
    heights: [5.2, 4.6],
    sag: 0.34,
    color: "#5c5951"
  },
  {
    id: "tokyo-connector",
    axis: "z",
    fixed: -4.7,
    stops: [2, 8, 14, 20],
    heights: [5, 4.4],
    sag: 0.3,
    color: "#575549"
  }
];

function createWireSegments(
  line: WireLineDefinition,
  height: number,
  levelIndex: number
): RpgStreetLifeInstance[] {
  const segments: RpgStreetLifeInstance[] = [];
  for (let index = 0; index < line.stops.length - 1; index += 1) {
    const from = line.stops[index];
    const to = line.stops[index + 1];
    const half = (to - from) / 2;
    const length = Math.hypot(half, line.sag);
    const tilt = Math.atan2(Math.abs(half), line.sag);
    for (const side of [-1, 1] as const) {
      const along = from + half + (side * half) / 2;
      const position: RpgStreetLifeVector3 =
        line.axis === "x"
          ? [along, height - line.sag / 2, line.fixed]
          : [line.fixed, height - line.sag / 2, along];
      const rotation: RpgStreetLifeVector3 =
        line.axis === "x"
          ? [0, 0, side * tilt * Math.sign(half)]
          : [-side * tilt * Math.sign(half), 0, 0];
      segments.push({
        id: `${line.id}-wire-${levelIndex}-${index}-${side > 0 ? "b" : "a"}`,
        position,
        size: [0.035, length, 0.035],
        rotation,
        color: "#2f3238"
      });
    }
  }
  return segments;
}

export const RPG_UTILITY_POLES: readonly RpgStreetLifeInstance[] =
  UTILITY_POLE_LINES.flatMap((line) =>
    line.stops.map((along, index) => ({
      id: `${line.id}-pole-${index}`,
      position: (line.axis === "x"
        ? [along, 2.75, line.fixed]
        : [line.fixed, 2.75, along]) as RpgStreetLifeVector3,
      size: [0.13, 5.5, 0.13],
      rotation: NO_ROTATION,
      color: line.color
    }))
  );

export const RPG_UTILITY_CROSSARMS: readonly RpgStreetLifeInstance[] =
  UTILITY_POLE_LINES.flatMap((line) =>
    line.stops.flatMap((along, index) =>
      line.heights.map((height, levelIndex) => ({
        id: `${line.id}-crossarm-${index}-${levelIndex}`,
        position: (line.axis === "x"
          ? [along, height, line.fixed]
          : [line.fixed, height, along]) as RpgStreetLifeVector3,
        size:
          line.axis === "x"
            ? ([0.12, 0.1, 1.5 - levelIndex * 0.32] as RpgStreetLifeVector3)
            : ([1.5 - levelIndex * 0.32, 0.1, 0.12] as RpgStreetLifeVector3),
        rotation: NO_ROTATION,
        color: "#4a4740"
      }))
    )
  );

export const RPG_UTILITY_WIRES: readonly RpgStreetLifeInstance[] =
  UTILITY_POLE_LINES.flatMap((line) =>
    line.heights.flatMap((height, levelIndex) =>
      createWireSegments(line, height, levelIndex)
    )
  );

interface LanternStringDefinition {
  id: string;
  axis: "x" | "z";
  fixed: number;
  from: number;
  to: number;
  height: number;
  sag: number;
  lanternCount: number;
  colors: readonly string[];
}

const LANTERN_STRINGS: readonly LanternStringDefinition[] = [
  {
    id: "hanabi-north-string",
    axis: "z",
    fixed: 19,
    from: -29,
    to: -19,
    height: 4.66,
    sag: 0.26,
    lanternCount: 8,
    colors: ["#ff9264", "#ffd07a", "#ff7f7a"]
  },
  {
    id: "hanabi-south-string",
    axis: "z",
    fixed: 35,
    from: -29,
    to: -19,
    height: 4.66,
    sag: 0.26,
    lanternCount: 8,
    colors: ["#ffd07a", "#ff8f68", "#ffb0c4"]
  },
  {
    id: "hanabi-torii-string",
    axis: "x",
    fixed: -19,
    from: 19,
    to: 35,
    height: 4.66,
    sag: 0.22,
    lanternCount: 8,
    colors: ["#ff9d6c", "#ffd489"]
  },
  {
    id: "gyukatsu-courtyard-string",
    axis: "x",
    fixed: 4.6,
    from: -3.4,
    to: 8.6,
    height: 3.15,
    sag: 0.32,
    lanternCount: 9,
    colors: ["#ffca7a", "#ff9d6b", "#ffe0a6"]
  },
  {
    id: "tokyo-boulevard-string",
    axis: "x",
    fixed: 24,
    from: -23.5,
    to: -6.5,
    height: 3.35,
    sag: 0.34,
    lanternCount: 11,
    colors: ["#ffd583", "#9ee6ea", "#ffa9c0"]
  },
  {
    id: "sakura-riverside-string",
    axis: "x",
    fixed: -26,
    from: 3.2,
    to: 14.2,
    height: 3.05,
    sag: 0.3,
    lanternCount: 10,
    colors: ["#ffc3d6", "#ffe0b5"]
  }
];

function lanternStringPoint(
  line: LanternStringDefinition,
  ratio: number
): RpgStreetLifeVector3 {
  const along = line.from + (line.to - line.from) * ratio;
  const droop = Math.sin(Math.PI * ratio) * line.sag;
  return line.axis === "x"
    ? [along, line.height - droop, line.fixed]
    : [line.fixed, line.height - droop, along];
}

export const RPG_LANTERN_STRING_SUPPORT_ENDPOINTS =
  LANTERN_STRINGS.filter(({ id }) => id.startsWith("hanabi-")).flatMap(
    (line) => [
      {
        id: `${line.id}-from-support`,
        position: lanternStringPoint(line, 0)
      },
      {
        id: `${line.id}-to-support`,
        position: lanternStringPoint(line, 1)
      }
    ]
  );

export const RPG_LANTERN_STRING_WIRES: readonly RpgStreetLifeInstance[] =
  LANTERN_STRINGS.flatMap((line) => {
    const segmentCount = 6;
    return Array.from({ length: segmentCount }, (_, index) => {
      const start = lanternStringPoint(line, index / segmentCount);
      const end = lanternStringPoint(line, (index + 1) / segmentCount);
      const deltaY = end[1] - start[1];
      const deltaAlong =
        line.axis === "x" ? end[0] - start[0] : end[2] - start[2];
      const length = Math.hypot(deltaAlong, deltaY);
      const tilt = Math.atan2(deltaAlong, deltaY);
      return {
        id: `${line.id}-wire-${index}`,
        position: [
          (start[0] + end[0]) / 2,
          (start[1] + end[1]) / 2,
          (start[2] + end[2]) / 2
        ] as RpgStreetLifeVector3,
        size: [0.028, length, 0.028] as RpgStreetLifeVector3,
        rotation: (line.axis === "x"
          ? [0, 0, -tilt]
          : [tilt, 0, 0]) as RpgStreetLifeVector3,
        color: "#33302c"
      };
    });
  });

export const RPG_HANGING_LANTERNS: readonly RpgHangingLantern[] =
  LANTERN_STRINGS.flatMap((line) =>
    Array.from({ length: line.lanternCount }, (_, index) => {
      const ratio = (index + 0.5) / line.lanternCount;
      const anchor = lanternStringPoint(line, ratio);
      const scale = 0.62 + ((index % 3) * 0.09);
      return {
        id: `${line.id}-lantern-${index}`,
        position: [
          anchor[0],
          anchor[1] - 0.26 - scale * 0.16,
          anchor[2]
        ] as RpgStreetLifeVector3,
        scale: [scale, scale, scale] as RpgStreetLifeVector3,
        color: line.colors[index % line.colors.length],
        blocksMovement: false as const
      };
    })
  );

interface PlanterDefinition {
  id: string;
  position: RpgStreetLifeVector3;
  rotationY: number;
  width: number;
  foliageColor: string;
  bloomColor: string;
}

const PLANTERS: readonly PlanterDefinition[] = [
  {
    id: "tokyo-planter-west",
    position: [-21, 0.26, 24.9],
    rotationY: 0,
    width: 2.1,
    foliageColor: "#6d8a5c",
    bloomColor: "#f2d777"
  },
  {
    id: "tokyo-planter-mid",
    position: [-13, 0.26, 24.9],
    rotationY: 0,
    width: 2.1,
    foliageColor: "#63834f",
    bloomColor: "#f0c0d1"
  },
  {
    id: "tokyo-planter-east",
    position: [-6.5, 0.26, 24.9],
    rotationY: 0,
    width: 1.8,
    foliageColor: "#6f8d5f",
    bloomColor: "#f4dd8c"
  },
  {
    id: "airport-planter-north",
    position: [-21.2, 0.26, 7.6],
    rotationY: Math.PI / 2,
    width: 2.4,
    foliageColor: "#6a8a58",
    bloomColor: "#f5e08c"
  },
  {
    id: "airport-planter-south",
    position: [-21.2, 0.26, -5.4],
    rotationY: Math.PI / 2,
    width: 2.4,
    foliageColor: "#5f8253",
    bloomColor: "#f3cf7d"
  },
  {
    id: "gyukatsu-planter-north",
    position: [13.4, 0.26, 3.8],
    rotationY: 0.4,
    width: 1.9,
    foliageColor: "#63864f",
    bloomColor: "#f0b3c5"
  },
  {
    id: "gyukatsu-planter-south",
    position: [12.6, 0.26, -4.2],
    rotationY: -0.4,
    width: 1.9,
    foliageColor: "#6b8a58",
    bloomColor: "#f5d888"
  },
  {
    id: "gyukatsu-planter-west",
    position: [-3.6, 0.26, -4.4],
    rotationY: 0.2,
    width: 1.7,
    foliageColor: "#5e7f4d",
    bloomColor: "#efc7d6"
  },
  {
    id: "sakura-planter-west",
    position: [2.6, 0.26, -21.5],
    rotationY: Math.PI / 2,
    width: 2.2,
    foliageColor: "#68885a",
    bloomColor: "#f6c3d5"
  },
  {
    id: "sakura-planter-east",
    position: [14.9, 0.26, -22],
    rotationY: Math.PI / 2,
    width: 2.2,
    foliageColor: "#628252",
    bloomColor: "#f7d1de"
  },
  {
    id: "hanabi-planter-north",
    position: [19.4, 0.26, -13.6],
    rotationY: 0,
    width: 2,
    foliageColor: "#5c7d4e",
    bloomColor: "#f6c07a"
  },
  {
    id: "hanabi-planter-south",
    position: [34.6, 0.26, -33.4],
    rotationY: 0,
    width: 2,
    foliageColor: "#5a7a4c",
    bloomColor: "#f3b9a0"
  }
];

export const RPG_PLANTER_WALLS: readonly RpgStreetLifeInstance[] =
  PLANTERS.flatMap((planter) => [
    {
      id: `${planter.id}-basin`,
      position: planter.position,
      size: [planter.width, 0.52, 1.05],
      rotation: [0, planter.rotationY, 0],
      color: "#b4ac9c"
    },
    {
      id: `${planter.id}-rim`,
      position: [
        planter.position[0],
        planter.position[1] + 0.3,
        planter.position[2]
      ],
      size: [planter.width + 0.14, 0.1, 1.19],
      rotation: [0, planter.rotationY, 0],
      color: "#8f8778"
    }
  ]);

export const RPG_PLANTER_FOLIAGE: readonly RpgStreetLifeInstance[] =
  PLANTERS.flatMap((planter) =>
    Array.from({ length: 4 }, (_, index) => {
      const spread = (index - 1.5) * (planter.width / 4.2);
      const isBloom = index % 2 === 1;
      const radius = isBloom ? 0.24 : 0.36;
      return {
        id: `${planter.id}-foliage-${index}`,
        position: rotateLocal(
          [
            planter.position[0],
            planter.position[1] + 0.44 + (index % 2) * 0.12,
            planter.position[2]
          ],
          planter.rotationY,
          [spread, 0, (index % 2 === 0 ? 0.16 : -0.16)]
        ),
        size: [radius * 1.15, radius * 0.92, radius],
        rotation: [0, planter.rotationY + index * 0.4, 0],
        color: isBloom ? planter.bloomColor : planter.foliageColor
      };
    })
  );

const HEDGE_ROWS = [
  { id: "tokyo-hedge-north", axis: "x" as const, fixed: 31.4, from: -16, to: 0, count: 6, color: "#5d7c4c" },
  { id: "sakura-hedge-west", axis: "z" as const, fixed: 2.4, from: -34, to: -24, count: 4, color: "#5a7a4a" },
  { id: "gyukatsu-hedge-south", axis: "x" as const, fixed: -9.8, from: 11, to: 14.6, count: 3, color: "#618150" },
  { id: "airport-hedge-east", axis: "z" as const, fixed: -19.6, from: 18, to: 30, count: 5, color: "#638450" }
];

export const RPG_HEDGE_BLOCKS: readonly RpgStreetLifeInstance[] =
  HEDGE_ROWS.flatMap((row) =>
    Array.from({ length: row.count }, (_, index) => {
      const along =
        row.from + ((row.to - row.from) * index) / Math.max(1, row.count - 1);
      const position: RpgStreetLifeVector3 =
        row.axis === "x" ? [along, 0.4, row.fixed] : [row.fixed, 0.4, along];
      return {
        id: `${row.id}-${index}`,
        position,
        size:
          row.axis === "x"
            ? ([1.72, 0.78, 0.72] as RpgStreetLifeVector3)
            : ([0.72, 0.78, 1.72] as RpgStreetLifeVector3),
        rotation: [0, deterministicUnit(index + row.count) * 0.14, 0],
        color: row.color
      };
    })
  );

/**
 * Clipped garden pine (matsu). The airport approach used to be lined with
 * palms, which read as tropical rather than Japanese; a pine is a short leaning
 * trunk carrying two or three wide flat cushions of needle, each one much
 * broader than it is tall. That flat-plate silhouette is the whole cue, so the
 * tier proportions matter more than the count.
 */
const PINE_TREES = [
  { id: "airport-pine-a", position: [-35.1, 0, -6.5] as RpgStreetLifeVector3, height: 3.5, lean: 0.1 },
  { id: "airport-pine-b", position: [-35.3, 0, 1.5] as RpgStreetLifeVector3, height: 4.1, lean: -0.08 },
  { id: "airport-pine-c", position: [-35, 0, 10.5] as RpgStreetLifeVector3, height: 3.7, lean: -0.12 },
  { id: "airport-pine-d", position: [-35.4, 0, 21] as RpgStreetLifeVector3, height: 4.3, lean: -0.11 },
  { id: "airport-pine-e", position: [-35.1, 0, 30.5] as RpgStreetLifeVector3, height: 3.6, lean: 0.09 },
  { id: "gyukatsu-pine-east", position: [19.6, 0, 9.2] as RpgStreetLifeVector3, height: 3.9, lean: -0.1 },
  { id: "hanabi-pine-north", position: [18.4, 0, -14.8] as RpgStreetLifeVector3, height: 3.7, lean: 0.11 },
  { id: "tokyo-pine-plaza", position: [2.6, 0, 13.4] as RpgStreetLifeVector3, height: 4, lean: -0.09 }
];

const PINE_NEEDLE_COLORS = ["#33512f", "#3d5c35", "#476b3c"] as const;

export const RPG_PINE_TRUNKS: readonly RpgStreetLifeInstance[] =
  PINE_TREES.flatMap((pine) =>
    Array.from({ length: 2 }, (_, index) => {
      const segmentHeight = pine.height / 2;
      const lean = pine.lean * (index + 1);
      return {
        id: `${pine.id}-trunk-${index}`,
        position: [
          pine.position[0] + lean * segmentHeight * 1.1,
          segmentHeight * (index + 0.5),
          pine.position[2] + lean * segmentHeight * 0.5
        ] as RpgStreetLifeVector3,
        size: [
          0.28 - index * 0.06,
          segmentHeight + 0.06,
          0.28 - index * 0.06
        ] as RpgStreetLifeVector3,
        rotation: [0, index * 0.4, lean * 1.4] as RpgStreetLifeVector3,
        color: index === 1 ? "#6c5744" : "#5b4738"
      };
    })
  );

export const RPG_PINE_TIERS: readonly RpgStreetLifeInstance[] =
  PINE_TREES.flatMap((pine) =>
    Array.from({ length: 3 }, (_, index) => {
      // Tiers widen downward and step outward on alternating sides, the way a
      // trained pine is cut: no tier sits directly above the one below it.
      const drop = index * 0.62;
      const spread = 1.62 - index * 0.3;
      const sway = deterministicUnit(index + pine.height) - 0.5;
      return {
        id: `${pine.id}-tier-${index}`,
        position: [
          pine.position[0] + pine.lean * pine.height * 0.9 + sway * 0.44,
          pine.height + 0.24 - drop,
          pine.position[2] + pine.lean * pine.height * 0.45 - sway * 0.3
        ] as RpgStreetLifeVector3,
        size: [spread, 0.36, spread * 0.92] as RpgStreetLifeVector3,
        rotation: [0, index * 0.7, 0] as RpgStreetLifeVector3,
        color: PINE_NEEDLE_COLORS[index % PINE_NEEDLE_COLORS.length]
      };
    })
  );

const GRILL_COUNTERS = [
  { id: "gyukatsu-grill-west", position: [-2.9, 0, 4.75] as RpgStreetLifeVector3, rotationY: 0.06 },
  { id: "gyukatsu-grill-east", position: [0.6, 0, 4.75] as RpgStreetLifeVector3, rotationY: -0.04 },
  { id: "gyukatsu-grill-plaza", position: [12.4, 0, -1.4] as RpgStreetLifeVector3, rotationY: -Math.PI / 2 },
  { id: "gyukatsu-grill-south", position: [7.6, 0, -7.4] as RpgStreetLifeVector3, rotationY: Math.PI },
  { id: "hanabi-grill-street", position: [25.4, 0, -20.4] as RpgStreetLifeVector3, rotationY: Math.PI }
];

export const RPG_STALL_GRILL_BODIES: readonly RpgStreetLifeInstance[] =
  GRILL_COUNTERS.flatMap((grill): RpgStreetLifeInstance[] => [
    {
      id: `${grill.id}-counter`,
      position: [grill.position[0], 0.44, grill.position[2]],
      size: [1.62, 0.88, 0.78],
      rotation: [0, grill.rotationY, 0],
      color: "#6b4738"
    },
    {
      id: `${grill.id}-hob`,
      position: [grill.position[0], 0.94, grill.position[2]],
      size: [1.42, 0.14, 0.62],
      rotation: [0, grill.rotationY, 0],
      color: "#3a3733"
    },
    {
      id: `${grill.id}-hood`,
      position: [grill.position[0], 1.66, grill.position[2]],
      size: [1.5, 0.26, 0.68],
      rotation: [0, grill.rotationY, 0],
      color: "#4b4741"
    },
    ...[-0.52, 0.52].map((offset): RpgStreetLifeInstance => ({
      id: `${grill.id}-crate-${offset > 0 ? "east" : "west"}`,
      position: rotateLocal([grill.position[0], 0.2, grill.position[2]], grill.rotationY, [
        offset,
        0,
        0.62
      ]),
      size: [0.42, 0.4, 0.36],
      rotation: [0, grill.rotationY + offset * 0.3, 0],
      color: "#8a6a4a"
    }))
  ]);

export const RPG_STALL_GRILL_EMBERS: readonly RpgStreetLifeInstance[] =
  GRILL_COUNTERS.flatMap((grill) =>
    [-0.44, 0, 0.44].map((offset, index) => ({
      id: `${grill.id}-ember-${index}`,
      position: rotateLocal([grill.position[0], 1.01, grill.position[2]], grill.rotationY, [
        offset,
        0,
        0
      ]),
      size: [0.34, 0.04, 0.42],
      rotation: [0, grill.rotationY, 0],
      color: index === 1 ? "#ff9d54" : "#ffb96a"
    }))
  );

interface CrosswalkDefinition {
  id: string;
  axis: "x" | "z";
  center: RpgStreetLifeVector3;
  stripeCount: number;
  stripeLength: number;
}

const EXTRA_CROSSWALKS: readonly CrosswalkDefinition[] = [
  {
    id: "tokyo-connector-crossing",
    axis: "z",
    center: [-8, 0.122, 16.4],
    stripeCount: 8,
    stripeLength: 5.6
  },
  {
    id: "gyukatsu-street-crossing",
    axis: "x",
    center: [-6.2, 0.122, 0],
    stripeCount: 8,
    stripeLength: 5.6
  }
];

export const RPG_CROSSWALK_PADS: readonly RpgStreetLifeInstance[] =
  EXTRA_CROSSWALKS.map((crossing) => ({
    id: `${crossing.id}-pad`,
    position: [
      crossing.center[0],
      0.098,
      crossing.center[2]
    ] as RpgStreetLifeVector3,
    size: (crossing.axis === "z"
      ? [crossing.stripeLength + 0.5, 0.02, crossing.stripeCount * 0.58 + 0.5]
      : [
          crossing.stripeCount * 0.58 + 0.5,
          0.02,
          crossing.stripeLength + 0.5
        ]) as RpgStreetLifeVector3,
    rotation: NO_ROTATION,
    color: "#6e6960"
  }));

export const RPG_EXTRA_CROSSWALK_STRIPES: readonly RpgStreetLifeInstance[] =
  EXTRA_CROSSWALKS.flatMap((crossing) =>
    Array.from({ length: crossing.stripeCount }, (_, index) => {
      const offset = (index - (crossing.stripeCount - 1) / 2) * 0.58;
      return {
        id: `${crossing.id}-stripe-${index}`,
        position: (crossing.axis === "z"
          ? [crossing.center[0], crossing.center[1], crossing.center[2] + offset]
          : [
              crossing.center[0] + offset,
              crossing.center[1],
              crossing.center[2]
            ]) as RpgStreetLifeVector3,
        size: (crossing.axis === "z"
          ? [crossing.stripeLength, 0.026, 0.42]
          : [0.42, 0.026, crossing.stripeLength]) as RpgStreetLifeVector3,
        rotation: NO_ROTATION,
        color: index % 2 === 0 ? "#fbf8f0" : "#f0eade"
      };
    })
  );

const ROOFTOP_STRUCTURES = RPG_DISTRICT_ARCHITECTURE.filter(
  ({ kind }) => kind === "tower" || kind === "terminal"
);

export const RPG_ROOFTOP_CLUTTER: readonly RpgStreetLifeInstance[] =
  ROOFTOP_STRUCTURES.flatMap((structure): RpgStreetLifeInstance[] => {
    const [width, height, depth] = structure.size;
    const roofY = structure.position[1] + height / 2;
    const anchor: RpgStreetLifeVector3 = [
      structure.position[0],
      roofY,
      structure.position[2]
    ];
    const tankHeight = 0.72 + (structure.variant % 3) * 0.12;

    return [
      {
        id: `${structure.id}-roof-tank-legs`,
        position: rotateLocal(anchor, structure.rotationY, [
          -width * 0.24,
          0.28,
          depth * 0.2
        ]),
        size: [0.78, 0.56, 0.66],
        rotation: [0, structure.rotationY, 0],
        color: "#6d7278"
      },
      {
        id: `${structure.id}-roof-tank`,
        position: rotateLocal(anchor, structure.rotationY, [
          -width * 0.24,
          0.56 + tankHeight / 2,
          depth * 0.2
        ]),
        size: [1, tankHeight, 0.86],
        rotation: [0, structure.rotationY, 0],
        color: "#9aa3a2"
      },
      {
        id: `${structure.id}-roof-stair-hut`,
        position: rotateLocal(anchor, structure.rotationY, [
          width * 0.26,
          0.52,
          -depth * 0.18
        ]),
        size: [1.02, 1.04, 1.02],
        rotation: [0, structure.rotationY + 0.12, 0],
        color: "#7d7f80"
      },
      {
        id: `${structure.id}-roof-unit-a`,
        position: rotateLocal(anchor, structure.rotationY, [
          width * 0.05,
          0.24,
          depth * 0.28
        ]),
        size: [0.72, 0.48, 0.56],
        rotation: [0, structure.rotationY - 0.2, 0],
        color: "#b1b4ae"
      },
      {
        id: `${structure.id}-roof-unit-b`,
        position: rotateLocal(anchor, structure.rotationY, [
          -width * 0.02,
          0.2,
          -depth * 0.3
        ]),
        size: [0.6, 0.4, 0.5],
        rotation: [0, structure.rotationY + 0.28, 0],
        color: "#a5a9a3"
      },
      {
        id: `${structure.id}-roof-mast`,
        position: rotateLocal(anchor, structure.rotationY, [
          width * 0.34,
          1.14,
          depth * 0.3
        ]),
        size: [0.08, 2.3, 0.08],
        rotation: [0, structure.rotationY, 0.05],
        color: "#5b6068"
      }
    ];
  });

interface PavingFieldDefinition {
  id: string;
  center: RpgStreetLifeVector3;
  radius: number;
  rings: readonly { count: number; distance: number; size: number }[];
  colors: readonly string[];
}

const PAVING_FIELDS: readonly PavingFieldDefinition[] = [
  {
    id: "gyukatsu-plaza-paving",
    center: [7, 0.045, 0],
    radius: 9,
    rings: [
      { count: 10, distance: 3.3, size: 1.15 },
      { count: 15, distance: 5.6, size: 1.25 },
      { count: 19, distance: 7.7, size: 1.3 }
    ],
    colors: ["#c2b49b", "#b6a88f", "#cabb9f"]
  },
  {
    id: "hanabi-plaza-paving",
    center: [27, 0.045, -24],
    radius: 7,
    rings: [
      { count: 9, distance: 3.1, size: 1.1 },
      { count: 13, distance: 5.2, size: 1.2 }
    ],
    colors: ["#8d8478", "#9c9084", "#7f776d"]
  }
];

interface PavingGridDefinition {
  id: string;
  center: RpgStreetLifeVector3;
  columns: number;
  rows: number;
  spacingX: number;
  spacingZ: number;
  colors: readonly string[];
}

const PAVING_GRIDS: readonly PavingGridDefinition[] = [
  {
    id: "tokyo-paving-grid",
    center: [-8, 0.05, 24],
    columns: 8,
    rows: 8,
    spacingX: 2.8,
    spacingZ: 2.8,
    colors: ["#9e9d95", "#94938b", "#a8a69c"]
  },
  {
    id: "sakura-paving-grid",
    center: [3.5, 0.05, -22],
    columns: 8,
    rows: 8,
    spacingX: 2.8,
    spacingZ: 2.8,
    colors: ["#a6a496", "#9b9a8d", "#b0aa9c"]
  },
  {
    id: "airport-paving-grid",
    center: [-28, 0.05, 13],
    columns: 5,
    rows: 15,
    spacingX: 2.9,
    spacingZ: 2.9,
    colors: ["#b6bbb5", "#aab0aa", "#c0c4bc"]
  },
  {
    id: "hanabi-paving-grid",
    center: [26.9, 0.05, -24],
    columns: 6,
    rows: 7,
    spacingX: 2.9,
    spacingZ: 3,
    colors: ["#847f79", "#8f8a82", "#78736e"]
  }
];

const PAVING_GRID_SLABS: readonly RpgStreetLifeInstance[] =
  PAVING_GRIDS.flatMap((grid) =>
    Array.from({ length: grid.rows }).flatMap((_, row) =>
      Array.from({ length: grid.columns }, (__, column): RpgStreetLifeInstance => {
        const offsetX = (column - (grid.columns - 1) / 2) * grid.spacingX;
        const offsetZ = (row - (grid.rows - 1) / 2) * grid.spacingZ;
        return {
          id: `${grid.id}-${row}-${column}`,
          position: [
            grid.center[0] + offsetX,
            grid.center[1],
            grid.center[2] + offsetZ
          ],
          size: [grid.spacingX - 0.22, 0.028, grid.spacingZ - 0.22],
          rotation: NO_ROTATION,
          color: grid.colors[(row + column) % grid.colors.length]
        };
      })
    )
  );

export const RPG_PLAZA_PAVING: readonly RpgStreetLifeInstance[] = [
  ...PAVING_GRID_SLABS,
  ...PAVING_FIELDS.flatMap((field) =>
    field.rings.flatMap((ring, ringIndex) =>
      Array.from({ length: ring.count }, (_, index): RpgStreetLifeInstance => {
        const angle =
          (Math.PI * 2 * index) / ring.count + ringIndex * 0.21;
        return {
          id: `${field.id}-${ringIndex}-${index}`,
          position: [
            field.center[0] + Math.cos(angle) * ring.distance,
            field.center[1],
            field.center[2] + Math.sin(angle) * ring.distance
          ],
          size: [ring.size, 0.028, ring.size * 0.86],
          rotation: [0, -angle, 0],
          color:
            field.colors[(index + ringIndex) % field.colors.length]
        };
      })
    )
  )
].filter(({ position }) => isRpgWalkablePosition(position[0], position[2]));

const BUS_SHELTER_ORIGIN: RpgStreetLifeVector3 = [-25, 0, 6.4];

export const RPG_BUS_STOP_STRUCTURES: readonly RpgStreetLifeInstance[] = [
  ...[
    [-0.6, -1.6],
    [-0.6, 1.6],
    [0.55, -1.6],
    [0.55, 1.6]
  ].map(([offsetX, offsetZ], index): RpgStreetLifeInstance => ({
    id: `airport-bus-shelter-post-${index}`,
    position: [
      BUS_SHELTER_ORIGIN[0] + offsetX,
      1.15,
      BUS_SHELTER_ORIGIN[2] + offsetZ
    ],
    size: [0.13, 2.3, 0.13],
    rotation: NO_ROTATION,
    color: "#3a2f28"
  })),
  {
    // Kawara tile on the shelter too, so the very first structure the visitor
    // stands beside belongs to the same town as everything behind it.
    id: "airport-bus-shelter-roof",
    position: [BUS_SHELTER_ORIGIN[0], 2.42, BUS_SHELTER_ORIGIN[2]],
    size: [1.95, 0.14, 4.1],
    rotation: [0, 0, -0.08],
    color: RPG_KAWARA_ROOF_COLORS[0]
  },
  {
    id: "airport-bus-shelter-ridge",
    position: [BUS_SHELTER_ORIGIN[0], 2.56, BUS_SHELTER_ORIGIN[2]],
    size: [0.34, 0.16, 4.1],
    rotation: NO_ROTATION,
    color: RPG_KAWARA_ROOF_COLORS[1]
  },
  {
    id: "airport-bus-shelter-fascia",
    position: [BUS_SHELTER_ORIGIN[0] - 0.94, 2.26, BUS_SHELTER_ORIGIN[2]],
    size: [0.12, 0.26, 4.1],
    rotation: NO_ROTATION,
    color: "#2c2320"
  },
  {
    id: "airport-bus-shelter-back",
    position: [BUS_SHELTER_ORIGIN[0] + 0.58, 1.3, BUS_SHELTER_ORIGIN[2]],
    size: [0.1, 1.5, 3.5],
    rotation: NO_ROTATION,
    color: "#b9c3c4"
  },
  {
    id: "airport-bus-shelter-bench",
    position: [BUS_SHELTER_ORIGIN[0] + 0.3, 0.48, BUS_SHELTER_ORIGIN[2]],
    size: [0.56, 0.13, 2.8],
    rotation: NO_ROTATION,
    color: "#7c5a45"
  },
  ...[-1, 1].map((side): RpgStreetLifeInstance => ({
    id: `airport-bus-shelter-bench-leg-${side > 0 ? "north" : "south"}`,
    position: [
      BUS_SHELTER_ORIGIN[0] + 0.3,
      0.22,
      BUS_SHELTER_ORIGIN[2] + side * 1.1
    ],
    size: [0.46, 0.42, 0.12],
    rotation: NO_ROTATION,
    color: "#6a4b3a"
  })),
  {
    id: "airport-bus-stop-post",
    position: [BUS_SHELTER_ORIGIN[0] - 1.35, 1.1, BUS_SHELTER_ORIGIN[2] - 1.9],
    size: [0.09, 2.2, 0.09],
    rotation: NO_ROTATION,
    color: "#4f5b62"
  }
];

export const RPG_BUS_STOP_SIGNS: readonly RpgStreetLifeInstance[] = [
  {
    id: "airport-bus-stop-sign",
    position: [BUS_SHELTER_ORIGIN[0] - 1.35, 2.28, BUS_SHELTER_ORIGIN[2] - 1.9],
    size: [0.14, 0.62, 0.62],
    rotation: NO_ROTATION,
    color: "#ffe0ad"
  },
  {
    id: "airport-bus-shelter-timetable",
    position: [BUS_SHELTER_ORIGIN[0] + 0.52, 1.52, BUS_SHELTER_ORIGIN[2] + 1.1],
    size: [0.08, 0.72, 0.9],
    rotation: NO_ROTATION,
    color: "#cfe9ec"
  }
];

const COASTLINE_ROCK_COLORS = [
  "#4b5260",
  "#3f4857",
  "#555565",
  "#424b58",
  "#565866",
  "#3c4653",
  "#5a5b68"
];

function createCoastlineSide(
  sideIndex: number,
  rockCount: number
): RpgStreetLifeRock[] {
  const edge = RPG_TOWN_BOUNDS.maximumX;
  return Array.from({ length: rockCount }, (_, index) => {
    const seed = sideIndex * 97 + index * 13;
    const jitterAlong = (deterministicUnit(seed) - 0.5) * 2.4;
    const jitterOut = deterministicUnit(seed + 3) * 2.1;
    const along =
      -edge + 1.4 + ((2 * edge - 2.8) * index) / Math.max(1, rockCount - 1);
    const outward = edge + 0.7 + jitterOut;
    const width = 1 + deterministicUnit(seed + 7) * 1.5;
    const height = 0.9 + deterministicUnit(seed + 11) * 1.5;
    const depth = 0.9 + deterministicUnit(seed + 17) * 1.3;
    const restY = height * 0.34 - 0.46;
    const position: RpgStreetLifeVector3 =
      sideIndex === 0
        ? [along + jitterAlong, restY, outward]
        : sideIndex === 1
          ? [outward, restY, along + jitterAlong]
          : sideIndex === 2
            ? [along + jitterAlong, restY, -outward]
            : [-outward, restY, along + jitterAlong];
    return {
      id: `coastline-rock-${sideIndex}-${index}`,
      position,
      rotation: [
        (deterministicUnit(seed + 23) - 0.5) * 0.5,
        deterministicUnit(seed + 29) * Math.PI,
        (deterministicUnit(seed + 31) - 0.5) * 0.4
      ] as RpgStreetLifeVector3,
      scale: [width, height, depth] as RpgStreetLifeVector3,
      color:
        COASTLINE_ROCK_COLORS[
          Math.floor(deterministicUnit(seed + 37) * COASTLINE_ROCK_COLORS.length)
        ],
      blocksMovement: false as const
    };
  });
}

export const RPG_COASTLINE_RING_ROCKS: readonly RpgStreetLifeRock[] = [
  ...createCoastlineSide(0, 15),
  ...createCoastlineSide(1, 15),
  ...createCoastlineSide(2, 15),
  ...createCoastlineSide(3, 15)
];

export const RPG_TOWN_COLUMN_PROPS: readonly RpgStreetLifeInstance[] = [
  ...RPG_UTILITY_POLES,
  ...RPG_PINE_TRUNKS,
  ...RPG_BUS_STOP_STRUCTURES,
  ...RPG_TORII_PILLARS
];
