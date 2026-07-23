import { RPG_CHARACTER_NATIVE_HEIGHTS } from "./RpgCharacterNativeHeights";
import type { NpcSpriteId } from "./NpcAssets";

export type NpcCharacterModelRole =
  | "airport-traveler"
  | "gyukatsu-chef"
  | "hanabi-yukata"
  | "sakura-visitor";

interface NpcCharacterRoleModel {
  role: NpcCharacterModelRole;
  modelAsset: `/assets/models/characters/npc-${string}.glb`;
  nativeHeight: number;
}

export interface NpcCharacterModelDefinition extends NpcCharacterRoleModel {
  visibleHeight: number;
  renderBudget: NpcCharacterModelRenderBudget;
}

export interface NpcCharacterModelLodBudget {
  level: 0 | 1;
  maximumDistance: number | null;
  maxTriangles: number;
}

export interface NpcCharacterModelRenderBudget {
  maxPrimitives: number;
  lods: readonly NpcCharacterModelLodBudget[];
}

export const NPC_CHARACTER_NATIVE_HEIGHTS = RPG_CHARACTER_NATIVE_HEIGHTS;
export const NPC_ADULT_VISIBLE_HEIGHT = 2.525;
export const NPC_CHILD_VISIBLE_HEIGHT = 2.2;
export const NPC_CHARACTER_MODEL_BUDGET = {
  maxPrimitives: 1,
  lods: [
    { level: 0, maximumDistance: 14, maxTriangles: 8_000 },
    { level: 1, maximumDistance: null, maxTriangles: 2_500 }
  ]
} as const satisfies NpcCharacterModelRenderBudget;

const AIRPORT_TRAVELER_MODEL = {
  role: "airport-traveler",
  modelAsset: "/assets/models/characters/npc-airport-traveler.glb",
  nativeHeight: NPC_CHARACTER_NATIVE_HEIGHTS["npc-airport-traveler"]
} as const satisfies NpcCharacterRoleModel;

const GYUKATSU_CHEF_MODEL = {
  role: "gyukatsu-chef",
  modelAsset: "/assets/models/characters/npc-gyukatsu-chef.glb",
  nativeHeight: NPC_CHARACTER_NATIVE_HEIGHTS["npc-gyukatsu-chef"]
} as const satisfies NpcCharacterRoleModel;

const HANABI_YUKATA_MODEL = {
  role: "hanabi-yukata",
  modelAsset: "/assets/models/characters/npc-hanabi-yukata.glb",
  nativeHeight: NPC_CHARACTER_NATIVE_HEIGHTS["npc-hanabi-yukata"]
} as const satisfies NpcCharacterRoleModel;

const SAKURA_VISITOR_MODEL = {
  role: "sakura-visitor",
  modelAsset: "/assets/models/characters/npc-sakura-visitor.glb",
  nativeHeight: NPC_CHARACTER_NATIVE_HEIGHTS["npc-sakura-visitor"]
} as const satisfies NpcCharacterRoleModel;

const ADULT_SIZE = {
  visibleHeight: NPC_ADULT_VISIBLE_HEIGHT,
  renderBudget: NPC_CHARACTER_MODEL_BUDGET
} as const;

const CHILD_SIZE = {
  visibleHeight: NPC_CHILD_VISIBLE_HEIGHT,
  renderBudget: NPC_CHARACTER_MODEL_BUDGET
} as const;

export const NPC_CHARACTER_MODELS = {
  "npc-airport-traveler": { ...AIRPORT_TRAVELER_MODEL, ...ADULT_SIZE },
  "npc-tokyo-worker": { ...SAKURA_VISITOR_MODEL, ...ADULT_SIZE },
  "npc-gyukatsu-chef": { ...GYUKATSU_CHEF_MODEL, ...ADULT_SIZE },
  "npc-sakura-visitor": { ...SAKURA_VISITOR_MODEL, ...ADULT_SIZE },
  "npc-hanabi-child": { ...AIRPORT_TRAVELER_MODEL, ...CHILD_SIZE },
  "npc-hanabi-yukata": { ...HANABI_YUKATA_MODEL, ...ADULT_SIZE },
  "npc-hanabi-vendor": { ...GYUKATSU_CHEF_MODEL, ...ADULT_SIZE }
} as const satisfies Readonly<
  Record<NpcSpriteId, NpcCharacterModelDefinition>
>;
