export type PlayerCharacterId = "male" | "female";
export type PlayerSpriteDirection = "front" | "back" | "side";
export type PlayerRunFrame = 0 | 1;
export type PlayerLocomotion = "idle" | "run" | "idle-run";

export interface PlayerRuntimeFrameDescriptor {
  readonly asset: string;
  readonly character: PlayerCharacterId;
  readonly direction: PlayerSpriteDirection;
  readonly frame: "idle" | PlayerRunFrame;
  readonly locomotion: PlayerLocomotion;
  readonly nativeWidth: 768;
  readonly nativeHeight: 1152;
  readonly aspectRatio: number;
  readonly footOffset: number;
}

export interface PlayerRuntimeManifest {
  readonly character: PlayerCharacterId;
  readonly frames: readonly PlayerRuntimeFrameDescriptor[];
  readonly idle: Readonly<Record<PlayerSpriteDirection, PlayerRuntimeFrameDescriptor>>;
  readonly run: Readonly<
    Record<
      PlayerSpriteDirection,
      readonly [PlayerRuntimeFrameDescriptor, PlayerRuntimeFrameDescriptor]
    >
  >;
}

interface PlayerSpriteAsset {
  asset: string;
  footOffset: number;
}

export const PLAYER_CHARACTER_ASSETS: Record<PlayerCharacterId, string> = {
  male: "/assets/characters/player-male.png",
  female: "/assets/characters/player-female.png"
};

const PLAYER_CHARACTER_SPRITES: Record<
  PlayerCharacterId,
  Record<PlayerSpriteDirection, PlayerSpriteAsset>
> = {
  male: {
    front: {
      asset: PLAYER_CHARACTER_ASSETS.male,
      footOffset: 259 / 1536
    },
    back: {
      asset: "/assets/characters/player-male-back.png",
      footOffset: 258 / 1536
    },
    side: {
      asset: "/assets/characters/player-male-run-right.png",
      footOffset: 272 / 1536
    }
  },
  female: {
    front: {
      asset: PLAYER_CHARACTER_ASSETS.female,
      footOffset: 134 / 1536
    },
    back: {
      asset: "/assets/characters/player-female-back.png",
      footOffset: 135 / 1536
    },
    side: {
      asset: "/assets/characters/player-female-run-right.png",
      footOffset: 207 / 1536
    }
  }
};

const PLAYER_RUN_SPRITES: Record<
  PlayerCharacterId,
  Record<PlayerSpriteDirection, readonly [PlayerSpriteAsset, PlayerSpriteAsset]>
> = {
  male: {
    front: [
      {
        asset: "/assets/characters/player-male-run-front-a.png",
        footOffset: 305 / 1536
      },
      {
        asset: "/assets/characters/player-male-run-front-b.png",
        footOffset: 306 / 1536
      }
    ],
    back: [
      {
        asset: "/assets/characters/player-male-run-back-a.png",
        footOffset: 202 / 1536
      },
      {
        asset: "/assets/characters/player-male-run-back-b.png",
        footOffset: 190 / 1536
      }
    ],
    side: [
      {
        asset: "/assets/characters/player-male-run-right.png",
        footOffset: 272 / 1536
      },
      {
        asset: "/assets/characters/player-male-run-right-b.png",
        footOffset: 234 / 1536
      }
    ]
  },
  female: {
    front: [
      {
        asset: "/assets/characters/player-female-run-front-a.png",
        footOffset: 191 / 1536
      },
      {
        asset: "/assets/characters/player-female-run-front-b.png",
        footOffset: 194 / 1536
      }
    ],
    back: [
      {
        asset: "/assets/characters/player-female-run-back-a.png",
        footOffset: 143 / 1536
      },
      {
        asset: "/assets/characters/player-female-run-back-b.png",
        footOffset: 144 / 1536
      }
    ],
    side: [
      {
        asset: "/assets/characters/player-female-run-right.png",
        footOffset: 207 / 1536
      },
      {
        asset: "/assets/characters/player-female-run-right-b.png",
        footOffset: 274 / 1536
      }
    ]
  }
};

export function getPlayerCharacterAsset(character: PlayerCharacterId) {
  return PLAYER_CHARACTER_ASSETS[character];
}

export function getPlayerCharacterSprite(
  character: PlayerCharacterId,
  direction: PlayerSpriteDirection
) {
  return PLAYER_CHARACTER_SPRITES[character][direction].asset;
}

export function getPlayerSpriteFootOffset(
  character: PlayerCharacterId,
  direction: PlayerSpriteDirection
) {
  return PLAYER_CHARACTER_SPRITES[character][direction].footOffset;
}

export function getPlayerRunSprite(
  character: PlayerCharacterId,
  direction: PlayerSpriteDirection,
  frame: PlayerRunFrame
) {
  return PLAYER_RUN_SPRITES[character][direction][frame].asset;
}

export function getPlayerRunSpriteFootOffset(
  character: PlayerCharacterId,
  direction: PlayerSpriteDirection,
  frame: PlayerRunFrame
) {
  return PLAYER_RUN_SPRITES[character][direction][frame].footOffset;
}

function getRuntimeAsset(asset: string) {
  const filename = asset.slice(asset.lastIndexOf("/") + 1).replace(/\.png$/, ".webp");
  return `/assets/characters/runtime/${filename}`;
}

function createRuntimeFrame(
  character: PlayerCharacterId,
  direction: PlayerSpriteDirection,
  frame: "idle" | PlayerRunFrame,
  locomotion: PlayerLocomotion,
  asset: string,
  footOffset: number
): PlayerRuntimeFrameDescriptor {
  return Object.freeze({
    asset,
    character,
    direction,
    frame,
    locomotion,
    nativeWidth: 768,
    nativeHeight: 1152,
    aspectRatio: 2 / 3,
    footOffset
  });
}

function createRuntimeManifest(
  character: PlayerCharacterId
): PlayerRuntimeManifest {
  const idleFront = createRuntimeFrame(
    character,
    "front",
    "idle",
    "idle",
    getPlayerRuntimeSprite(character, "front"),
    getPlayerSpriteFootOffset(character, "front")
  );
  const idleBack = createRuntimeFrame(
    character,
    "back",
    "idle",
    "idle",
    getPlayerRuntimeSprite(character, "back"),
    getPlayerSpriteFootOffset(character, "back")
  );
  const runFront = Object.freeze([
    createRuntimeFrame(
      character,
      "front",
      0,
      "run",
      getPlayerRuntimeRunSprite(character, "front", 0),
      getPlayerRunSpriteFootOffset(character, "front", 0)
    ),
    createRuntimeFrame(
      character,
      "front",
      1,
      "run",
      getPlayerRuntimeRunSprite(character, "front", 1),
      getPlayerRunSpriteFootOffset(character, "front", 1)
    )
  ] as const);
  const runBack = Object.freeze([
    createRuntimeFrame(
      character,
      "back",
      0,
      "run",
      getPlayerRuntimeRunSprite(character, "back", 0),
      getPlayerRunSpriteFootOffset(character, "back", 0)
    ),
    createRuntimeFrame(
      character,
      "back",
      1,
      "run",
      getPlayerRuntimeRunSprite(character, "back", 1),
      getPlayerRunSpriteFootOffset(character, "back", 1)
    )
  ] as const);
  const sideA = createRuntimeFrame(
    character,
    "side",
    0,
    "idle-run",
    getPlayerRuntimeRunSprite(character, "side", 0),
    getPlayerRunSpriteFootOffset(character, "side", 0)
  );
  const sideB = createRuntimeFrame(
    character,
    "side",
    1,
    "run",
    getPlayerRuntimeRunSprite(character, "side", 1),
    getPlayerRunSpriteFootOffset(character, "side", 1)
  );
  const frozenRunSide = Object.freeze([sideA, sideB] as const);
  const frames = Object.freeze([
    idleFront,
    idleBack,
    runFront[0],
    runFront[1],
    runBack[0],
    runBack[1],
    sideA,
    sideB
  ]);

  return Object.freeze({
    character,
    frames,
    idle: Object.freeze({ front: idleFront, back: idleBack, side: sideA }),
    run: Object.freeze({
      front: runFront,
      back: runBack,
      side: frozenRunSide
    })
  });
}

let maleRuntimeManifest: PlayerRuntimeManifest | undefined;
let femaleRuntimeManifest: PlayerRuntimeManifest | undefined;

export function getPlayerRuntimeSprite(
  character: PlayerCharacterId,
  direction: PlayerSpriteDirection
) {
  return getRuntimeAsset(getPlayerCharacterSprite(character, direction));
}

export function getPlayerRuntimeRunSprite(
  character: PlayerCharacterId,
  direction: PlayerSpriteDirection,
  frame: PlayerRunFrame
) {
  return getRuntimeAsset(getPlayerRunSprite(character, direction, frame));
}

export function getSelectedPlayerRuntimeManifest(
  character: PlayerCharacterId
): PlayerRuntimeManifest {
  if (character === "male") {
    maleRuntimeManifest ??= createRuntimeManifest(character);
    return maleRuntimeManifest;
  }
  femaleRuntimeManifest ??= createRuntimeManifest(character);
  return femaleRuntimeManifest;
}

export function selectPlayerRuntimeFrame(
  manifest: PlayerRuntimeManifest,
  direction: PlayerSpriteDirection,
  moving: boolean,
  strideFrame: PlayerRunFrame
): PlayerRuntimeFrameDescriptor {
  return moving ? manifest.run[direction][strideFrame] : manifest.idle[direction];
}
