export type RpgTownDetailVector3 = readonly [
  x: number,
  y: number,
  z: number
];

export interface RpgCoastalRockDetail {
  id: string;
  position: RpgTownDetailVector3;
  rotation: RpgTownDetailVector3;
  scale: RpgTownDetailVector3;
  color: string;
  blocksMovement: false;
}

export interface RpgCrosswalkStripeDetail {
  id: string;
  position: RpgTownDetailVector3;
  size: RpgTownDetailVector3;
  color: string;
  blocksMovement: false;
}

export interface RpgGyukatsuOutdoorDetail {
  id: string;
  position: RpgTownDetailVector3;
  rotationY: number;
  seatOffsets: readonly (readonly [x: number, z: number])[];
  woodColor: string;
  parasolColor: string;
  blocksMovement: false;
}

export const RPG_COASTAL_ROCK_DETAILS: readonly RpgCoastalRockDetail[] = [
  {
    id: "coast-rock-north-01",
    position: [-35.2, 0.52, 34],
    rotation: [0.18, 0.42, -0.11],
    scale: [1.22, 0.72, 0.94],
    color: "#4b5260",
    blocksMovement: false
  },
  {
    id: "coast-rock-north-02",
    position: [-34.45, 0.38, 29.7],
    rotation: [-0.14, 1.08, 0.16],
    scale: [0.82, 0.52, 1.16],
    color: "#3f4857",
    blocksMovement: false
  },
  {
    id: "coast-rock-north-03",
    position: [-35.35, 0.44, 25],
    rotation: [0.24, 1.74, -0.08],
    scale: [1.05, 0.61, 0.78],
    color: "#555565",
    blocksMovement: false
  },
  {
    id: "coast-rock-mid-01",
    position: [-34.6, 0.31, 20.2],
    rotation: [-0.2, 2.31, 0.13],
    scale: [0.74, 0.43, 0.92],
    color: "#424b58",
    blocksMovement: false
  },
  {
    id: "coast-rock-mid-02",
    position: [-35.45, 0.57, 15.1],
    rotation: [0.16, 2.82, -0.19],
    scale: [1.28, 0.79, 1.08],
    color: "#565866",
    blocksMovement: false
  },
  {
    id: "coast-rock-mid-03",
    position: [-34.35, 0.36, 9.7],
    rotation: [-0.09, 0.71, 0.21],
    scale: [0.91, 0.5, 0.7],
    color: "#3c4653",
    blocksMovement: false
  },
  {
    id: "coast-rock-mid-04",
    position: [-35.55, 0.48, 4.6],
    rotation: [0.28, 1.36, -0.12],
    scale: [1.12, 0.68, 0.86],
    color: "#505361",
    blocksMovement: false
  },
  {
    id: "coast-rock-south-01",
    position: [-34.5, 0.29, -1.3],
    rotation: [-0.23, 2.02, 0.1],
    scale: [0.68, 0.4, 1.01],
    color: "#434b57",
    blocksMovement: false
  },
  {
    id: "coast-rock-south-02",
    position: [-35.3, 0.51, -7.2],
    rotation: [0.11, 2.68, -0.2],
    scale: [1.18, 0.73, 0.82],
    color: "#595a67",
    blocksMovement: false
  },
  {
    id: "coast-rock-south-03",
    position: [-34.25, 0.35, -14.5],
    rotation: [-0.17, 0.34, 0.15],
    scale: [0.76, 0.48, 1.14],
    color: "#3d4654",
    blocksMovement: false
  },
  {
    id: "coast-rock-south-04",
    position: [-35.45, 0.55, -23.1],
    rotation: [0.22, 1.51, -0.09],
    scale: [1.31, 0.76, 1.02],
    color: "#515563",
    blocksMovement: false
  },
  {
    id: "coast-rock-south-05",
    position: [-34.55, 0.41, -32.6],
    rotation: [-0.12, 2.44, 0.19],
    scale: [0.94, 0.58, 0.76],
    color: "#444c59",
    blocksMovement: false
  }
];

export const RPG_TOKYO_CROSSWALK_PAD: RpgCrosswalkStripeDetail = {
  id: "tokyo-crosswalk-pad",
  position: [-10.35, 0.098, 20],
  size: [6, 0.02, 4.9],
  color: "#6e6960",
  blocksMovement: false
};

export const RPG_TOKYO_CROSSWALK_DETAILS: readonly RpgCrosswalkStripeDetail[] =
  Array.from({ length: 9 }, (_, index) => ({
    id: `tokyo-crosswalk-stripe-${index + 1}`,
    position: [-11.9 + index * 0.62, 0.122, 20] as const,
    size: [0.42, 0.026, 4.6] as const,
    color: index % 2 === 0 ? "#fbf8f0" : "#f2ece0",
    blocksMovement: false as const
  }));

export const RPG_GYUKATSU_OUTDOOR_DETAILS: readonly RpgGyukatsuOutdoorDetail[] =
  [
    {
      id: "gyukatsu-outdoor-table-west",
      position: [4.15, 0, 5.15],
      rotationY: 0.08,
      seatOffsets: [
        [-0.9, 0],
        [0.9, 0],
        [0, -0.76]
      ],
      woodColor: "#74473b",
      parasolColor: "#b83e43",
      blocksMovement: false
    },
    {
      id: "gyukatsu-outdoor-table-east",
      position: [6.85, 0, 5.3],
      rotationY: -0.12,
      seatOffsets: [
        [-0.9, 0],
        [0.9, 0],
        [0, 0.76]
      ],
      woodColor: "#684137",
      parasolColor: "#c44742",
      blocksMovement: false
    },
    {
      id: "gyukatsu-outdoor-table-court",
      position: [9.6, 0, 4.6],
      rotationY: 0.22,
      seatOffsets: [
        [-0.88, 0],
        [0.88, 0],
        [0, -0.78]
      ],
      woodColor: "#71453a",
      parasolColor: "#bf4144",
      blocksMovement: false
    },
    {
      id: "gyukatsu-outdoor-table-south-west",
      position: [4.4, 0, -5.2],
      rotationY: -0.18,
      seatOffsets: [
        [-0.9, 0],
        [0.9, 0],
        [0, 0.76]
      ],
      woodColor: "#6d4234",
      parasolColor: "#c1443f",
      blocksMovement: false
    },
    {
      id: "gyukatsu-outdoor-table-south-east",
      position: [6.4, 0, -5.6],
      rotationY: 0.14,
      seatOffsets: [
        [-0.88, 0],
        [0.88, 0],
        [0, 0.74]
      ],
      woodColor: "#77493c",
      parasolColor: "#b93f46",
      blocksMovement: false
    },
    {
      id: "gyukatsu-outdoor-table-plaza",
      position: [9.5, 0, -4.8],
      rotationY: -0.26,
      seatOffsets: [
        [-0.9, 0],
        [0.9, 0],
        [0, -0.74]
      ],
      woodColor: "#6a4036",
      parasolColor: "#c4483f",
      blocksMovement: false
    }
  ];
