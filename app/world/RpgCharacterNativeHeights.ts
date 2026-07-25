// Written by scripts/generate-character-models.mjs. Each value is the real
// height of the exported mesh, so the renderer can scale it to the height the
// design asks for. Do not edit by hand.
export const RPG_CHARACTER_NATIVE_HEIGHTS = {
  "npc-airport-traveler": 2.5263,
  "npc-gyukatsu-chef": 2.5263,
  "npc-hanabi-yukata": 2.5263,
  "npc-sakura-visitor": 2.5263,
  "player-female": 2.6213,
  "player-male": 2.5813
} as const;

export type RpgCharacterIdentity = keyof typeof RPG_CHARACTER_NATIVE_HEIGHTS;
