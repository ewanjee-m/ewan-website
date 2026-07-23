export interface ArrivalFacadeLayout {
  id: string;
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  body: string;
  roof: string;
  accent: string;
  mirrored: boolean;
}

export const ARRIVAL_FACADE_LAYOUT: readonly ArrivalFacadeLayout[] = [
  {
    id: "vermillion-machiya",
    x: -5.35,
    z: 0.35,
    width: 1.65,
    height: 1.6,
    depth: 1.15,
    body: "#6b4035",
    roof: "#2f3945",
    accent: "#f0a068",
    mirrored: false
  },
  {
    id: "indigo-machiya",
    x: 5.35,
    z: 0.35,
    width: 1.7,
    height: 1.55,
    depth: 1.18,
    body: "#29475b",
    roof: "#273541",
    accent: "#76c0b8",
    mirrored: true
  }
] as const;

export interface TokyoBuildingLayout {
  id: string;
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: string;
  signColor: string;
}

export const TOKYO_BUILDING_LAYOUT: readonly TokyoBuildingLayout[] = [
  {
    id: "navy-tower",
    x: -3.9,
    z: -0.95,
    width: 1.95,
    height: 3.3,
    depth: 1.7,
    color: "#273f59",
    signColor: "#ee7f82"
  },
  {
    id: "plum-shop",
    x: 3.95,
    z: -0.65,
    width: 2.1,
    height: 2.7,
    depth: 1.75,
    color: "#66555f",
    signColor: "#62b9b0"
  },
  {
    id: "clay-house",
    x: -3.65,
    z: 2.25,
    width: 1.8,
    height: 2.2,
    depth: 1.5,
    color: "#74645e",
    signColor: "#f2b057"
  },
  {
    id: "teal-tower",
    x: 3.7,
    z: 2.3,
    width: 1.7,
    height: 3.45,
    depth: 1.5,
    color: "#294a55",
    signColor: "#e981a6"
  }
] as const;

export const SKY_GRADIENT_PROFILE = {
  lowerStart: -0.82,
  lowerEnd: -0.12,
  upperStart: -0.12,
  upperEnd: 0.34
} as const;

function smoothstep(edge0: number, edge1: number, value: number) {
  const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return amount * amount * (3 - 2 * amount);
}

export function calculateSkyUpperBlend(height: number) {
  return smoothstep(
    SKY_GRADIENT_PROFILE.upperStart,
    SKY_GRADIENT_PROFILE.upperEnd,
    height
  );
}
