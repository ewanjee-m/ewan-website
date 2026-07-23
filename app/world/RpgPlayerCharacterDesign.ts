import type { PlayerCharacterId } from "./CharacterAssets";
import { RPG_CHARACTER_NATIVE_HEIGHTS } from "./RpgCharacterNativeHeights";

export type RpgPlayerCharacterJoint =
  | "pelvis"
  | "chest"
  | "leftHip"
  | "rightHip"
  | "leftKnee"
  | "rightKnee"
  | "leftShoulder"
  | "rightShoulder"
  | "leftElbow"
  | "rightElbow"
  | "hair"
  | "leftSleeve"
  | "rightSleeve"
  | "kimonoHem";

export interface RpgPlayerCharacterDesign {
  renderer: "rigged-toon-glb";
  forwardAxis: "+z";
  surfaceTechnique: "smooth-vertex-color-toon";
  modelAsset: string;
  referenceAssets: {
    front: string;
    back: string;
  };
  rigId: "ewan-humanoid-v1";
  maxPrimitives: 1;
  height: number;
  nativeHeight: number;
  minimumDepth: number;
  garment: "navy-happi" | "pink-kimono";
  hairStyle: "short-layered" | "long-flowing";
  palette: {
    skin: string;
    hair: string;
    outerwear: string;
    outerwearLight: string;
    innerwear: string;
    sash: string;
    trousers: string;
    footwear: string;
  };
  accessories: readonly string[];
  articulatedJoints: readonly RpgPlayerCharacterJoint[];
}

const COMMON_JOINTS = [
  "pelvis",
  "chest",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow"
] as const satisfies readonly RpgPlayerCharacterJoint[];

export const RPG_PLAYER_CHARACTER_DESIGNS: Readonly<
  Record<PlayerCharacterId, RpgPlayerCharacterDesign>
> = {
  male: {
    renderer: "rigged-toon-glb",
    forwardAxis: "+z",
    surfaceTechnique: "smooth-vertex-color-toon",
    modelAsset: "/assets/models/characters/player-male.glb",
    referenceAssets: {
      front: "/assets/characters/player-male.png",
      back: "/assets/characters/player-male-back.png"
    },
    rigId: "ewan-humanoid-v1",
    maxPrimitives: 1,
    height: 2.58,
    nativeHeight: RPG_CHARACTER_NATIVE_HEIGHTS["player-male"],
    minimumDepth: 0.56,
    garment: "navy-happi",
    hairStyle: "short-layered",
    palette: {
      skin: "#f3bfa0",
      hair: "#242635",
      outerwear: "#18385e",
      outerwearLight: "#29517c",
      innerwear: "#f6edda",
      sash: "#c94d38",
      trousers: "#252b35",
      footwear: "#f7f1e4"
    },
    accessories: ["gold-omamori"],
    articulatedJoints: [...COMMON_JOINTS, "leftSleeve", "rightSleeve"]
  },
  female: {
    renderer: "rigged-toon-glb",
    forwardAxis: "+z",
    surfaceTechnique: "smooth-vertex-color-toon",
    modelAsset: "/assets/models/characters/player-female.glb",
    referenceAssets: {
      front: "/assets/characters/player-female.png",
      back: "/assets/characters/player-female-back.png"
    },
    rigId: "ewan-humanoid-v1",
    maxPrimitives: 1,
    height: 2.62,
    nativeHeight: RPG_CHARACTER_NATIVE_HEIGHTS["player-female"],
    minimumDepth: 0.58,
    garment: "pink-kimono",
    hairStyle: "long-flowing",
    palette: {
      skin: "#f3bfa0",
      hair: "#242635",
      outerwear: "#e97898",
      outerwearLight: "#f096ae",
      innerwear: "#f8eedc",
      sash: "#92264e",
      trousers: "#6b2845",
      footwear: "#f6edda"
    },
    accessories: ["sakura-hair-ornament", "gold-omamori"],
    articulatedJoints: [
      ...COMMON_JOINTS,
      "hair",
      "leftSleeve",
      "rightSleeve",
      "kimonoHem"
    ]
  }
};

export function getRpgPlayerCharacterDesign(character: PlayerCharacterId) {
  return RPG_PLAYER_CHARACTER_DESIGNS[character];
}
