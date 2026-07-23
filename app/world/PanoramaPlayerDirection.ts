import type { PlayerSpriteDirection } from "./CharacterAssets";
import type { MovementIntent } from "./WorldSession";

export interface PanoramaPlayerDirectionState {
  direction: PlayerSpriteDirection;
  sideFacing: -1 | 1;
}

export const PLAYER_DIRECTION_SWITCH_RATIO = 1.16;
const MOVEMENT_DIRECTION_DEAD_ZONE = 0.001;

export function createPanoramaPlayerDirectionState(): PanoramaPlayerDirectionState {
  return {
    direction: "back",
    sideFacing: 1
  };
}

export function updatePanoramaPlayerDirection(
  state: PanoramaPlayerDirectionState,
  movement: Readonly<MovementIntent>,
  moving: boolean
): PanoramaPlayerDirectionState {
  if (!moving) {
    return state;
  }

  const horizontalStrength = Math.abs(movement.x);
  const verticalStrength = Math.abs(movement.y);

  if (state.direction === "side") {
    if (
      verticalStrength >
      horizontalStrength * PLAYER_DIRECTION_SWITCH_RATIO
    ) {
      state.direction = movement.y > 0 ? "back" : "front";
    } else if (horizontalStrength > MOVEMENT_DIRECTION_DEAD_ZONE) {
      state.sideFacing = movement.x < 0 ? -1 : 1;
    }
    return state;
  }

  if (
    horizontalStrength >
    verticalStrength * PLAYER_DIRECTION_SWITCH_RATIO
  ) {
    state.direction = "side";
    state.sideFacing = movement.x < 0 ? -1 : 1;
  } else if (verticalStrength > MOVEMENT_DIRECTION_DEAD_ZONE) {
    state.direction = movement.y > 0 ? "back" : "front";
  }
  return state;
}
