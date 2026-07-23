"use client";

import { Instance, Instances } from "@react-three/drei";
import { memo, useMemo } from "react";
import type { SceneQualityLevel } from "./SceneQuality";
import {
  RPG_ARCHITECTURE_FACADE_DETAILS,
  RPG_ARCHITECTURE_STREET_PROPS,
  RPG_DISTRICT_ARCHITECTURE,
  RPG_PERIMETER_NEIGHBORHOOD,
  type RpgArchitectureFacadeDetail,
  type RpgArchitectureStreetProp,
  type RpgDistrictArchitecture,
  type RpgPerimeterBuilding
} from "./RpgTownArchitectureLayout";
import {
  getRpgStreetFacingRotation,
  RPG_BUS_STOP_SIGNS,
  RPG_BUS_STOP_STRUCTURES,
  RPG_CROSSWALK_PADS,
  RPG_EXTRA_CROSSWALK_STRIPES,
  RPG_HEDGE_BLOCKS,
  RPG_LANTERN_STRING_WIRES,
  RPG_PALM_FRONDS,
  RPG_PALM_TRUNKS,
  RPG_PLANTER_FOLIAGE,
  RPG_PLANTER_WALLS,
  RPG_PLAZA_PAVING,
  RPG_ROOFTOP_CLUTTER,
  RPG_SHOPFRONT_SHADES,
  RPG_SHOPFRONT_SIGNS,
  RPG_STALL_GRILL_BODIES,
  RPG_STALL_GRILL_EMBERS,
  RPG_UTILITY_CROSSARMS,
  RPG_UTILITY_POLES,
  RPG_UTILITY_WIRES,
  type RpgStreetLifeInstance
} from "./RpgTownStreetLifeLayout";

interface ArchitectureInstance {
  id: string;
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  color: string;
  lit?: boolean;
}

interface RpgTownArchitectureProps {
  qualityLevel?: SceneQualityLevel;
}

const districtBuildings = RPG_DISTRICT_ARCHITECTURE.filter(
  ({ kind }) => kind !== "sakuraTree"
);
const districtTrees = RPG_DISTRICT_ARCHITECTURE.filter(
  ({ kind }) => kind === "sakuraTree"
);

const shellInstances: readonly ArchitectureInstance[] = districtBuildings.map(
  (structure) => {
    const [width, height, depth] = structure.size;
    const isStall = structure.kind === "stall";
    return {
      id: `${structure.id}-shell`,
      position: [
        structure.position[0],
        isStall ? structure.position[1] - height * 0.28 : structure.position[1],
        structure.position[2]
      ],
      scale: [width, isStall ? height * 0.42 : height, depth],
      rotation: [0, structure.rotationY, 0],
      color: structure.color
    };
  }
);

function createSlopedRoofs(
  structure: RpgDistrictArchitecture | RpgPerimeterBuilding
): ArchitectureInstance[] {
  const [x, y, z] = structure.position;
  const [width, height, depth] = structure.size;
  const roofY = y + height / 2 + 0.17;

  if (structure.roofStyle === "gable") {
    return [-1, 1].map((side) => ({
      id: `${structure.id}-gable-${side}`,
      position: [x, roofY, z + side * depth * 0.235],
      scale: [width + 0.55, 0.15, depth * 0.6 + 0.24],
      rotation: [side * 0.34, structure.rotationY, 0],
      color: structure.accent
    }));
  }

  return [];
}

function createRoofCaps(
  structure: RpgDistrictArchitecture | RpgPerimeterBuilding
): ArchitectureInstance[] {
  if (structure.roofStyle === "gable" || structure.roofStyle === "hip") {
    return [];
  }
  const [x, y, z] = structure.position;
  const [width, height, depth] = structure.size;
  const capCount = structure.roofStyle === "stepped" ? 2 : 1;
  return Array.from({ length: capCount }, (_, index) => ({
    id: `${structure.id}-roof-cap-${index}`,
    position: [x, y + height / 2 + 0.12 + index * 0.18, z],
    scale: [
      width + 0.38 - index * 0.34,
      0.18,
      depth + 0.38 - index * 0.34
    ],
    rotation: [0, structure.rotationY, 0],
    color: index === 0 ? structure.accent : "#e8dfcc"
  }));
}

const districtSlopedRoofs = districtBuildings.flatMap(createSlopedRoofs);
const districtRoofCaps = districtBuildings.flatMap(createRoofCaps);
const districtCanopies: readonly ArchitectureInstance[] = districtBuildings
  .filter(({ roofStyle }) => roofStyle === "hip")
  .map((structure) => ({
    id: `${structure.id}-canopy`,
    position: [
      structure.position[0],
      structure.position[1] + structure.size[1] * 0.47,
      structure.position[2]
    ],
    scale: [structure.size[0] * 0.83, structure.size[1] * 0.26, structure.size[2] * 0.83],
    rotation: [0, Math.PI / 4 + structure.rotationY, 0],
    color: structure.accent
  }));

const parapetInstances: readonly ArchitectureInstance[] = districtBuildings
  .filter(({ roofStyle }) =>
    roofStyle === "terrace" || roofStyle === "stepped"
  )
  .flatMap((structure) => {
    const [x, y, z] = structure.position;
    const [width, height, depth] = structure.size;
    const parapetY = y + height / 2 + 0.34;
    return [
      {
        id: `${structure.id}-parapet-north`,
        position: [x, parapetY, z + depth / 2],
        scale: [width + 0.28, 0.34, 0.1],
        color: structure.accent
      },
      {
        id: `${structure.id}-parapet-south`,
        position: [x, parapetY, z - depth / 2],
        scale: [width + 0.28, 0.34, 0.1],
        color: structure.accent
      },
      {
        id: `${structure.id}-parapet-east`,
        position: [x + width / 2, parapetY, z],
        scale: [0.1, 0.34, depth + 0.28],
        color: structure.accent
      },
      {
        id: `${structure.id}-parapet-west`,
        position: [x - width / 2, parapetY, z],
        scale: [0.1, 0.34, depth + 0.28],
        color: structure.accent
      }
    ];
  });

const balconyInstances: readonly ArchitectureInstance[] = districtBuildings
  .filter(({ kind }) => kind === "tower" || kind === "terminal")
  .flatMap((structure) => {
    const [x, y, z] = structure.position;
    const [width, height, depth] = structure.size;
    const levels = structure.kind === "tower" ? [0.08, 0.29] : [0.12];
    return levels.flatMap((heightRatio, levelIndex) => [
      {
        id: `${structure.id}-balcony-south-${levelIndex}`,
        position: [x, y + height * heightRatio, z + depth / 2 + 0.2],
        scale: [width * 0.78, 0.11, 0.38],
        color: "#d5d2c8"
      },
      {
        id: `${structure.id}-balcony-north-${levelIndex}`,
        position: [x, y + height * heightRatio, z - depth / 2 - 0.2],
        scale: [width * 0.78, 0.11, 0.38],
        color: "#d5d2c8"
      }
    ]);
  });

function createFacadeWindows(
  detail: RpgArchitectureFacadeDetail
): ArchitectureInstance[] {
  const isDepthSide = detail.side === "north" || detail.side === "south";
  const majorLength = isDepthSide ? detail.size[0] : detail.size[2];
  const windowWidth = Math.min(0.46, majorLength / (detail.columnCount * 1.4));
  const windowHeight = Math.min(
    0.42,
    detail.size[1] / (detail.rowCount * 1.4)
  );
  const majorStep = majorLength / detail.columnCount;
  const verticalStep = detail.size[1] / detail.rowCount;

  return Array.from({ length: detail.rowCount }).flatMap((_, row) =>
    Array.from({ length: detail.columnCount }, (__, column) => {
      const majorOffset =
        -majorLength / 2 + majorStep * (column + 0.5);
      const verticalOffset =
        -detail.size[1] / 2 + verticalStep * (row + 0.5);
      const litSeed = (row * 3 + column * 5 + detail.rowCount) % 7;
      const lit = litSeed < 4;
      return {
        id: `${detail.id}-window-${row}-${column}`,
        position: isDepthSide
          ? [
              detail.position[0] + majorOffset,
              detail.position[1] + verticalOffset,
              detail.position[2] +
                (detail.side === "north" ? 0.018 : -0.018)
            ]
          : [
              detail.position[0] +
                (detail.side === "east" ? 0.018 : -0.018),
              detail.position[1] + verticalOffset,
              detail.position[2] + majorOffset
            ],
        scale: isDepthSide
          ? [windowWidth, windowHeight, 0.055]
          : [0.055, windowHeight, windowWidth],
        color: lit
          ? litSeed % 2 === 0
            ? "#ffd9a0"
            : "#ffc06b"
          : detail.zoneId === "tokyo"
            ? "#33424f"
            : "#3b3a3c",
        lit
      } satisfies ArchitectureInstance;
    })
  );
}

const facadePanelInstances: readonly ArchitectureInstance[] =
  RPG_ARCHITECTURE_FACADE_DETAILS.map((detail) => ({
    id: detail.id,
    position: detail.position,
    scale: detail.size,
    color: detail.zoneId === "gyukatsu" ? "#493c36" : "#314d56"
  }));
const facadeWindowInstances =
  RPG_ARCHITECTURE_FACADE_DETAILS.flatMap(createFacadeWindows);
const litFacadeWindowInstances = facadeWindowInstances.filter(
  ({ lit }) => lit
);
const darkFacadeWindowInstances = facadeWindowInstances.filter(
  ({ lit }) => !lit
);

const floorBandInstances: readonly ArchitectureInstance[] = districtBuildings
  .filter(({ kind }) => kind === "tower" || kind === "terminal")
  .flatMap((structure) => {
    const [x, y, z] = structure.position;
    const [width, height, depth] = structure.size;
    const bandCount = Math.max(2, Math.round(height / 2.1));
    return Array.from({ length: bandCount }, (_, index) => ({
      id: `${structure.id}-floor-band-${index}`,
      position: [
        x,
        y - height / 2 + ((index + 1) * height) / (bandCount + 1),
        z
      ] as const,
      scale: [width + 0.14, 0.14, depth + 0.14] as const,
      rotation: [0, structure.rotationY, 0] as const,
      color: index % 2 === 0 ? "#cfc9bb" : "#b8b2a4"
    }));
  });

const shopfrontStoreyInstances: readonly ArchitectureInstance[] =
  districtBuildings
    .filter(({ kind }) => kind !== "stall")
    .map((structure) => {
      const [width, height, depth] = structure.size;
      const groundY = structure.position[1] - height / 2;
      return {
        id: `${structure.id}-shop-storey`,
        position: [
          structure.position[0],
          groundY + Math.min(1.2, height * 0.28),
          structure.position[2]
        ] as const,
        scale: [width + 0.08, Math.min(1.3, height * 0.34), depth + 0.08] as const,
        rotation: [0, structure.rotationY, 0] as const,
        color:
          structure.zoneId === "tokyo"
            ? "#5b4a4a"
            : structure.zoneId === "gyukatsu"
              ? "#4a352c"
              : "#4b4a46"
      };
    });

const doorInstances: readonly ArchitectureInstance[] = districtBuildings.map(
  (structure) => {
    const [x, y, z] = structure.position;
    const [width, height, depth] = structure.size;
    const facing = getRpgStreetFacingRotation(structure);
    return {
      id: `${structure.id}-door`,
      position: [
        x + Math.sin(facing) * (depth / 2 + 0.078),
        y - height / 2 + Math.min(0.72, height * 0.3),
        z + Math.cos(facing) * (depth / 2 + 0.078)
      ],
      scale: [Math.min(0.82, width * 0.32), Math.min(1.4, height * 0.56), 0.09],
      rotation: [0, facing, 0],
      color: structure.kind === "machiya" ? "#2f2928" : structure.accent
    };
  }
);

const treeTrunkInstances: readonly ArchitectureInstance[] = districtTrees.map(
  (tree) => ({
    id: `${tree.id}-trunk`,
    position: [
      tree.position[0],
      tree.position[1] - tree.size[1] * 0.26,
      tree.position[2]
    ],
    scale: [tree.size[0] * 0.11, tree.size[1] * 0.54, tree.size[0] * 0.11],
    rotation: [0, tree.rotationY, 0],
    color: "#6f4c43"
  })
);
const treeBranchInstances: readonly ArchitectureInstance[] = districtTrees.flatMap(
  (tree) =>
    Array.from({ length: 5 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 5 + tree.variant * 0.23;
      const branchLength = tree.size[0] * (0.38 + (index % 2) * 0.08);
      return {
        id: `${tree.id}-branch-${index}`,
        position: [
          tree.position[0] + Math.cos(angle) * branchLength * 0.25,
          tree.position[1] + tree.size[1] * (0.03 + (index % 3) * 0.045),
          tree.position[2] + Math.sin(angle) * branchLength * 0.25
        ],
        scale: [tree.size[0] * 0.055, branchLength, tree.size[0] * 0.055],
        rotation: [Math.PI / 2 - 0.28, 0, -angle],
        color: "#755047"
      };
    })
);
const treeCrownInstances: readonly ArchitectureInstance[] = districtTrees.flatMap(
  (tree) =>
    Array.from({ length: 5 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 5 + tree.variant * 0.17;
      const radialOffset = index === 0 ? 0 : tree.size[0] * 0.23;
      const radius = tree.size[0] * (index === 0 ? 0.38 : 0.27);
      return {
        id: `${tree.id}-crown-${index}`,
        position: [
          tree.position[0] + Math.cos(angle) * radialOffset,
          tree.position[1] + tree.size[1] * (0.12 + (index % 2) * 0.045),
          tree.position[2] + Math.sin(angle) * radialOffset
        ],
        scale: [radius * 1.12, radius * 0.82, radius],
        rotation: [0, angle, 0],
        color: index % 2 === 0 ? "#ffd2df" : tree.accent
      };
    })
);

function createPropPost(prop: RpgArchitectureStreetProp): ArchitectureInstance[] {
  if (
    ![
      "bollard",
      "streetLamp",
      "bambooFence",
      "festivalBanner",
      "stoneLantern"
    ].includes(prop.kind)
  ) {
    return [];
  }
  const height =
    prop.kind === "streetLamp"
      ? 3.1
      : prop.kind === "festivalBanner"
        ? 3.2
        : prop.kind === "bambooFence"
          ? 1.05
          : prop.kind === "stoneLantern"
            ? 1.35
            : 0.72;
  const radius = prop.kind === "streetLamp" ? 0.065 : 0.09;
  return [
    {
      id: `${prop.id}-post`,
      position: prop.position,
      scale: [radius, height, radius],
      rotation: [0, prop.rotationY, 0],
      color: prop.color
    }
  ];
}

const propPostInstances = RPG_ARCHITECTURE_STREET_PROPS.flatMap(createPropPost);
const propHeadInstances: readonly ArchitectureInstance[] =
  RPG_ARCHITECTURE_STREET_PROPS.filter(({ kind }) =>
    kind === "streetLamp" || kind === "stoneLantern" || kind === "bollard"
  ).map((prop) => ({
    id: `${prop.id}-head`,
    position: [
      prop.position[0],
      prop.position[1] +
        (prop.kind === "streetLamp" ? 1.58 : prop.kind === "stoneLantern" ? 0.64 : 0.36),
      prop.position[2]
    ],
    scale:
      prop.kind === "streetLamp"
        ? [0.22, 0.28, 0.22]
        : prop.kind === "stoneLantern"
          ? [0.32, 0.28, 0.32]
          : [0.13, 0.12, 0.13],
    rotation: [0, prop.rotationY, 0],
    color: prop.accent
  }));

function createBoxProp(prop: RpgArchitectureStreetProp): ArchitectureInstance[] {
  const dimensions: Partial<
    Record<RpgArchitectureStreetProp["kind"], readonly [number, number, number]>
  > = {
    vendingMachine: [0.78, 1.85, 0.62],
    outdoorUnit: [0.9, 0.72, 0.58],
    bench: [1.7, 0.2, 0.48],
    menuStand: [0.62, 0.92, 0.16],
    luggageCart: [1.15, 0.52, 0.62]
  };
  const scale = dimensions[prop.kind];
  if (!scale) return [];
  return [
    {
      id: `${prop.id}-body`,
      position: prop.position,
      scale,
      rotation: [0, prop.rotationY, 0],
      color: prop.color
    }
  ];
}

const propBoxInstances = RPG_ARCHITECTURE_STREET_PROPS.flatMap(createBoxProp);
const propAccentInstances: readonly ArchitectureInstance[] =
  RPG_ARCHITECTURE_STREET_PROPS.filter(({ kind }) =>
    ["vendingMachine", "outdoorUnit", "menuStand", "luggageCart"].includes(kind)
  ).map((prop) => {
    const scale: readonly [number, number, number] =
      prop.kind === "vendingMachine"
        ? [0.58, 0.82, 0.04]
        : prop.kind === "outdoorUnit"
          ? [0.38, 0.38, 0.04]
          : prop.kind === "luggageCart"
            ? [0.7, 0.08, 0.68]
            : [0.48, 0.58, 0.04];
    const forwardX = Math.sin(prop.rotationY) * 0.34;
    const forwardZ = Math.cos(prop.rotationY) * 0.34;
    return {
      id: `${prop.id}-accent`,
      position: [
        prop.position[0] + forwardX,
        prop.position[1] + (prop.kind === "outdoorUnit" ? 0.02 : 0.14),
        prop.position[2] + forwardZ
      ],
      scale,
      rotation: [0, prop.rotationY, 0],
      color: prop.accent
    };
  });

const fenceRailInstances: readonly ArchitectureInstance[] =
  RPG_ARCHITECTURE_STREET_PROPS.filter(({ kind }) => kind === "bambooFence")
    .flatMap((prop) =>
      [0.35, 0.68].map((height, index) => ({
        id: `${prop.id}-rail-${index}`,
        position: [prop.position[0], prop.position[1] - 0.5 + height, prop.position[2]],
        scale: [0.055, 2.1, 0.055],
        rotation: [0, 0, Math.PI / 2] as const,
        color: index === 0 ? prop.color : prop.accent
      }))
    );
const bannerInstances: readonly ArchitectureInstance[] =
  RPG_ARCHITECTURE_STREET_PROPS.filter(({ kind }) => kind === "festivalBanner")
    .map((prop) => ({
      id: `${prop.id}-cloth`,
      position: [prop.position[0] + 0.38, prop.position[1] + 0.62, prop.position[2]],
      scale: [0.68, 1.25, 0.055],
      rotation: [0, prop.rotationY, -0.035],
      color: prop.accent
    }));

const perimeterShellInstances: readonly ArchitectureInstance[] =
  RPG_PERIMETER_NEIGHBORHOOD.map((building) => ({
    id: `${building.id}-shell`,
    position: building.position,
    scale: building.size,
    rotation: [0, building.rotationY, 0],
    color: building.color
  }));
const perimeterSlopedRoofs = RPG_PERIMETER_NEIGHBORHOOD.flatMap(createSlopedRoofs);
const perimeterRoofCaps = RPG_PERIMETER_NEIGHBORHOOD.flatMap(createRoofCaps);
const perimeterHipRoofs: readonly ArchitectureInstance[] =
  RPG_PERIMETER_NEIGHBORHOOD.filter(({ roofStyle }) => roofStyle === "hip")
    .map((building) => ({
      id: `${building.id}-hip-roof`,
      position: [
        building.position[0],
        building.position[1] + building.size[1] / 2 + 0.34,
        building.position[2]
      ],
      scale: [building.size[0] * 0.72, 0.72, building.size[2] * 0.72],
      rotation: [0, Math.PI / 4 + building.rotationY, 0],
      color: building.accent
    }));

const perimeterWindowSource: readonly ArchitectureInstance[] =
  RPG_PERIMETER_NEIGHBORHOOD.flatMap((building) => {
    const [x, y, z] = building.position;
    const [width, height, depth] = building.size;
    const facesAlongZ = Math.abs(z) > Math.abs(x);
    const faceSign = facesAlongZ ? (z > 0 ? -1 : 1) : x > 0 ? -1 : 1;
    const rowStep = height / (building.windowRows + 1);
    const columnStep = width / (building.windowColumns + 1);
    return Array.from({ length: building.windowRows }).flatMap((_, row) =>
      Array.from({ length: building.windowColumns }, (__, column) => {
        const horizontal =
          -width / 2 + columnStep * (column + 1);
        return {
          id: `${building.id}-window-${row}-${column}`,
          position: facesAlongZ
            ? [
                x + horizontal,
                y - height / 2 + rowStep * (row + 1),
                z + faceSign * (depth / 2 + 0.04)
              ]
            : [
                x + faceSign * (width / 2 + 0.04),
                y - height / 2 + rowStep * (row + 1),
                z + horizontal
              ],
          scale: facesAlongZ ? [0.42, 0.36, 0.06] : [0.06, 0.36, 0.42],
          color:
            (row * 2 + column) % 3 === 0
              ? "#ffd08a"
              : (row + column) % 3 === 0
                ? "#ffb774"
                : building.accent,
          lit: (row * 2 + column) % 3 === 0 || (row + column) % 3 === 0
        } satisfies ArchitectureInstance;
      })
    );
  });

const perimeterWindowInstances = perimeterWindowSource.filter(
  ({ lit }) => !lit
);
const litPerimeterWindowInstances = perimeterWindowSource.filter(
  ({ lit }) => lit
);

function toArchitectureInstances(
  instances: readonly RpgStreetLifeInstance[]
): ArchitectureInstance[] {
  return instances.map((instance) => ({
    id: instance.id,
    position: instance.position,
    scale: instance.size,
    rotation: instance.rotation,
    color: instance.color
  }));
}

const streetLevelBoxInstances: readonly ArchitectureInstance[] = [
  ...doorInstances,
  ...shopfrontStoreyInstances,
  ...toArchitectureInstances(RPG_SHOPFRONT_SHADES),
  ...toArchitectureInstances(RPG_UTILITY_CROSSARMS),
  ...toArchitectureInstances(RPG_STALL_GRILL_BODIES),
  ...toArchitectureInstances(RPG_BUS_STOP_STRUCTURES),
  ...toArchitectureInstances(RPG_ROOFTOP_CLUTTER)
];

const groundDressingInstances: readonly ArchitectureInstance[] = [
  ...districtRoofCaps,
  ...floorBandInstances,
  ...toArchitectureInstances(RPG_PLANTER_WALLS),
  ...toArchitectureInstances(RPG_CROSSWALK_PADS),
  ...toArchitectureInstances(RPG_EXTRA_CROSSWALK_STRIPES),
  ...toArchitectureInstances(RPG_PLAZA_PAVING)
];

const hedgeInstances = toArchitectureInstances(RPG_HEDGE_BLOCKS);
const litSignInstances: readonly ArchitectureInstance[] = [
  ...toArchitectureInstances(RPG_SHOPFRONT_SIGNS),
  ...toArchitectureInstances(RPG_STALL_GRILL_EMBERS),
  ...toArchitectureInstances(RPG_BUS_STOP_SIGNS)
];
const overheadCableInstances: readonly ArchitectureInstance[] = [
  ...toArchitectureInstances(RPG_UTILITY_POLES),
  ...toArchitectureInstances(RPG_UTILITY_WIRES),
  ...toArchitectureInstances(RPG_LANTERN_STRING_WIRES),
  ...toArchitectureInstances(RPG_PALM_TRUNKS)
];
const palmFrondInstances = toArchitectureInstances(RPG_PALM_FRONDS);
const planterFoliageInstances = toArchitectureInstances(RPG_PLANTER_FOLIAGE);
const canopyInstances: readonly ArchitectureInstance[] = [
  ...districtCanopies,
  ...palmFrondInstances
];

export type RpgTownBatchGeometry =
  | "box"
  | "cone4"
  | "cylinder7"
  | "cylinder8"
  | "icosahedron1";

export interface RpgTownBatchStat {
  id: string;
  geometry: RpgTownBatchGeometry;
  instanceCount: number;
}

function getQualityStride(level: SceneQualityLevel): number {
  return level === "high" ? 1 : level === "medium" ? 2 : 3;
}

function strideFilter<Item>(
  instances: readonly Item[],
  stride: number
): readonly Item[] {
  return stride <= 1
    ? instances
    : instances.filter((_, index) => index % stride === 0);
}

function getVisiblePropIds(stride: number): ReadonlySet<string> {
  return new Set(
    strideFilter(RPG_ARCHITECTURE_STREET_PROPS, stride).map(({ id }) => id)
  );
}

function filterPropInstances(
  instances: readonly ArchitectureInstance[],
  visiblePropIds: ReadonlySet<string>
): ArchitectureInstance[] {
  return instances.filter((instance) =>
    [...visiblePropIds].some((id) => instance.id.startsWith(id))
  );
}

export function getRpgTownArchitectureBatchStats(
  level: SceneQualityLevel
): readonly RpgTownBatchStat[] {
  const stride = getQualityStride(level);
  const visiblePropIds = getVisiblePropIds(stride);
  const propCount = (instances: readonly ArchitectureInstance[]) =>
    filterPropInstances(instances, visiblePropIds).length;

  return [
  { id: "district-shells", geometry: "box", instanceCount: shellInstances.length },
  { id: "district-sloped-roofs", geometry: "box", instanceCount: districtSlopedRoofs.length },
  { id: "ground-dressing", geometry: "box", instanceCount: groundDressingInstances.length },
  { id: "canopies", geometry: "cone4", instanceCount: canopyInstances.length },
  { id: "parapets", geometry: "box", instanceCount: parapetInstances.length },
  { id: "balconies", geometry: "box", instanceCount: balconyInstances.length },
  { id: "facade-panels", geometry: "box", instanceCount: facadePanelInstances.length },
  {
    id: "facade-windows-lit",
    geometry: "box",
    instanceCount: strideFilter(litFacadeWindowInstances, stride).length
  },
  {
    id: "facade-windows-dark",
    geometry: "box",
    instanceCount: strideFilter(darkFacadeWindowInstances, stride).length
  },
  { id: "lit-signs", geometry: "box", instanceCount: litSignInstances.length },
  { id: "street-level", geometry: "box", instanceCount: streetLevelBoxInstances.length },
  { id: "tree-trunks", geometry: "cylinder8", instanceCount: treeTrunkInstances.length },
  { id: "tree-branches", geometry: "cylinder8", instanceCount: treeBranchInstances.length },
  {
    id: "foliage",
    geometry: "icosahedron1",
    instanceCount:
      treeCrownInstances.length +
      strideFilter(planterFoliageInstances, stride).length +
      strideFilter(hedgeInstances, stride).length
  },
  {
    id: "posts-and-cables",
    geometry: "cylinder8",
    instanceCount:
      propCount(propPostInstances) + overheadCableInstances.length
  },
  {
    id: "prop-heads",
    geometry: "icosahedron1",
    instanceCount: propCount(propHeadInstances)
  },
  { id: "prop-boxes", geometry: "box", instanceCount: propCount(propBoxInstances) },
  {
    id: "prop-accents",
    geometry: "box",
    instanceCount: propCount(propAccentInstances)
  },
  {
    id: "fence-rails",
    geometry: "cylinder7",
    instanceCount: propCount(fenceRailInstances)
  },
  { id: "banners", geometry: "box", instanceCount: propCount(bannerInstances) },
  { id: "perimeter-shells", geometry: "box", instanceCount: perimeterShellInstances.length },
  { id: "perimeter-sloped-roofs", geometry: "box", instanceCount: perimeterSlopedRoofs.length },
  { id: "perimeter-roof-caps", geometry: "box", instanceCount: perimeterRoofCaps.length },
  { id: "perimeter-hip-roofs", geometry: "cone4", instanceCount: perimeterHipRoofs.length },
  {
    id: "perimeter-windows",
    geometry: "box",
    instanceCount: strideFilter(perimeterWindowInstances, stride).length
  },
  {
    id: "perimeter-windows-lit",
    geometry: "box",
    instanceCount: strideFilter(litPerimeterWindowInstances, stride).length
  }
  ];
}

export const RPG_TOWN_ARCHITECTURE_BATCH_STATS: readonly RpgTownBatchStat[] =
  getRpgTownArchitectureBatchStats("high");

function InstanceBatch({
  instances,
  geometry,
  material
}: {
  instances: readonly ArchitectureInstance[];
  geometry: React.ReactNode;
  material: React.ReactNode;
}) {
  if (instances.length === 0) return null;
  return (
    <Instances limit={instances.length} frames={1} castShadow receiveShadow>
      {geometry}
      {material}
      {instances.map((instance) => (
        <Instance
          key={instance.id}
          position={instance.position}
          rotation={instance.rotation}
          scale={instance.scale}
          color={instance.color}
        />
      ))}
    </Instances>
  );
}

export const RpgTownArchitecture = memo(function RpgTownArchitecture({
  qualityLevel = "high"
}: RpgTownArchitectureProps) {
  const detailStride = getQualityStride(qualityLevel);
  const visibleLitFacadeWindows = useMemo(
    () => strideFilter(litFacadeWindowInstances, detailStride),
    [detailStride]
  );
  const visibleDarkFacadeWindows = useMemo(
    () => strideFilter(darkFacadeWindowInstances, detailStride),
    [detailStride]
  );
  const visiblePropIds = useMemo(
    () => getVisiblePropIds(detailStride),
    [detailStride]
  );
  const filterProps = (instances: readonly ArchitectureInstance[]) =>
    filterPropInstances(instances, visiblePropIds);
  const visiblePerimeterWindows = useMemo(
    () => strideFilter(perimeterWindowInstances, detailStride),
    [detailStride]
  );
  const visibleLitPerimeterWindows = useMemo(
    () => strideFilter(litPerimeterWindowInstances, detailStride),
    [detailStride]
  );
  const visibleFoliage = useMemo(
    () => [
      ...treeCrownInstances,
      ...strideFilter(planterFoliageInstances, detailStride),
      ...strideFilter(hedgeInstances, detailStride)
    ],
    [detailStride]
  );

  return (
    <group name="direct-rendered-japanese-town">
      <InstanceBatch
        instances={shellInstances}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.87} />}
      />
      <InstanceBatch
        instances={districtSlopedRoofs}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.91} />}
      />
      <InstanceBatch
        instances={groundDressingInstances}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.82} />}
      />
      <InstanceBatch
        instances={canopyInstances}
        geometry={<coneGeometry args={[1, 1, 4]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.88} />}
      />
      <InstanceBatch
        instances={parapetInstances}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.9} />}
      />
      <InstanceBatch
        instances={balconyInstances}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" metalness={0.12} roughness={0.72} />}
      />
      <InstanceBatch
        instances={facadePanelInstances}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.62} />}
      />
      <InstanceBatch
        instances={visibleLitFacadeWindows}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ff9c4e"
            emissiveIntensity={0.72}
            roughness={0.34}
          />
        }
      />
      <InstanceBatch
        instances={visibleDarkFacadeWindows}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            color="#ffffff"
            emissive="#1d2a35"
            emissiveIntensity={0.12}
            metalness={0.24}
            roughness={0.22}
          />
        }
      />
      <InstanceBatch
        instances={litSignInstances}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            color="#ffffff"
            emissive="#c76a34"
            emissiveIntensity={0.62}
            roughness={0.42}
          />
        }
      />
      <InstanceBatch
        instances={streetLevelBoxInstances}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.78} />}
      />
      <InstanceBatch
        instances={treeTrunkInstances}
        geometry={<cylinderGeometry args={[0.72, 1, 1, 8]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={1} flatShading />}
      />
      <InstanceBatch
        instances={treeBranchInstances}
        geometry={<cylinderGeometry args={[0.72, 1, 1, 7]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={1} flatShading />}
      />
      <InstanceBatch
        instances={visibleFoliage}
        geometry={<icosahedronGeometry args={[1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.94} flatShading />}
      />
      <InstanceBatch
        instances={[
          ...filterProps(propPostInstances),
          ...overheadCableInstances
        ]}
        geometry={<cylinderGeometry args={[1, 1, 1, 8]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.92} />}
      />
      <InstanceBatch
        instances={filterProps(propHeadInstances)}
        geometry={<icosahedronGeometry args={[1, 1]} />}
        material={
          <meshStandardMaterial
            color="#ffffff"
            emissive="#6d4028"
            emissiveIntensity={0.18}
            roughness={0.76}
          />
        }
      />
      <InstanceBatch
        instances={filterProps(propBoxInstances)}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.8} />}
      />
      <InstanceBatch
        instances={filterProps(propAccentInstances)}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.45} />}
      />
      <InstanceBatch
        instances={filterProps(fenceRailInstances)}
        geometry={<cylinderGeometry args={[1, 1, 1, 7]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.96} />}
      />
      <InstanceBatch
        instances={filterProps(bannerInstances)}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.82} />}
      />
      <InstanceBatch
        instances={perimeterShellInstances}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.9} />}
      />
      <InstanceBatch
        instances={perimeterSlopedRoofs}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.92} />}
      />
      <InstanceBatch
        instances={perimeterRoofCaps}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.88} />}
      />
      <InstanceBatch
        instances={perimeterHipRoofs}
        geometry={<coneGeometry args={[1, 1, 4]} />}
        material={<meshStandardMaterial color="#ffffff" roughness={0.92} />}
      />
      <InstanceBatch
        instances={visiblePerimeterWindows}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            color="#ffffff"
            emissive="#22303c"
            emissiveIntensity={0.1}
            roughness={0.44}
          />
        }
      />
      <InstanceBatch
        instances={visibleLitPerimeterWindows}
        geometry={<boxGeometry args={[1, 1, 1]} />}
        material={
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffa759"
            emissiveIntensity={0.66}
            roughness={0.4}
          />
        }
      />
    </group>
  );
});
