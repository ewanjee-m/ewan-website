const NPC_SPRITE_ASSETS = {
  "npc-airport-traveler": {
    source: "/assets/npcs/npc-airport-traveler.png",
    footOffset: 141 / 1536
  },
  "npc-tokyo-worker": {
    source: "/assets/npcs/npc-sakura-visitor.png",
    footOffset: 128 / 1536
  },
  "npc-gyukatsu-chef": {
    source: "/assets/npcs/npc-gyukatsu-chef.png",
    footOffset: 84 / 1536
  },
  "npc-sakura-visitor": {
    source: "/assets/npcs/npc-sakura-visitor.png",
    footOffset: 128 / 1536
  },
  "npc-hanabi-child": {
    source: "/assets/npcs/npc-airport-traveler.png",
    footOffset: 141 / 1536
  },
  "npc-hanabi-yukata": {
    source: "/assets/npcs/npc-hanabi-yukata.png",
    footOffset: 80 / 1536
  },
  "npc-hanabi-vendor": {
    source: "/assets/npcs/npc-gyukatsu-chef.png",
    footOffset: 84 / 1536
  }
} as const;

export type NpcSpriteId = keyof typeof NPC_SPRITE_ASSETS;

function isNpcSpriteId(npcId: string): npcId is NpcSpriteId {
  return npcId in NPC_SPRITE_ASSETS;
}

export function getNpcSourceAsset(npcId: string) {
  if (!isNpcSpriteId(npcId)) {
    throw new Error(`Unknown RPG town NPC: ${npcId}`);
  }
  return NPC_SPRITE_ASSETS[npcId].source;
}

export function getNpcRuntimeAsset(npcId: string) {
  const sourceAsset = getNpcSourceAsset(npcId);
  const fileName = sourceAsset.slice(sourceAsset.lastIndexOf("/") + 1);
  return `/assets/npcs/runtime/${fileName.replace(/\.png$/, ".webp")}`;
}

export function getNpcSpriteFootOffset(npcId: string) {
  if (!isNpcSpriteId(npcId)) {
    throw new Error(`Unknown RPG town NPC: ${npcId}`);
  }
  return NPC_SPRITE_ASSETS[npcId].footOffset;
}

export function getNpcDisplayHeight(npcId: string, variant: number) {
  if (!isNpcSpriteId(npcId)) {
    throw new Error(`Unknown RPG town NPC: ${npcId}`);
  }
  void variant;
  const targetVisibleHeight =
    npcId === "npc-hanabi-child" ? 2.2 : 2.525;
  return targetVisibleHeight / (1 - getNpcSpriteFootOffset(npcId));
}

export const RPG_NPC_RUNTIME_ASSETS = Array.from(
  new Set(Object.keys(NPC_SPRITE_ASSETS).map(getNpcRuntimeAsset))
);
