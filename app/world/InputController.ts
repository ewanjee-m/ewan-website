import type { DestinationId } from "../guide/GuideContract";
import type { MovementIntent } from "./WorldSession";

const movementKeys = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight"
]);

export function createInputController() {
  const pressed = new Set<string>();
  let touchMovement: MovementIntent | null = null;
  let jumpHeld = false;
  let jumpQueued = false;
  let resetQueued = false;
  let travelQueued: DestinationId | null = null;

  return {
    pressKey(key: string) {
      if (key === " " && !jumpHeld) {
        jumpHeld = true;
        jumpQueued = true;
      }
      if (movementKeys.has(key)) {
        pressed.add(key);
      }
    },
    releaseKey(key: string) {
      pressed.delete(key);
      if (key === " ") {
        jumpHeld = false;
      }
    },
    reset() {
      pressed.clear();
      touchMovement = null;
      jumpHeld = false;
      jumpQueued = false;
      resetQueued = false;
      travelQueued = null;
    },
    setTouchMovement(intent: MovementIntent | null) {
      touchMovement = intent ? { ...intent } : null;
    },
    queueJump() {
      jumpQueued = true;
    },
    queueReset() {
      resetQueued = true;
    },
    queueTravel(destinationId: DestinationId) {
      travelQueued = destinationId;
    },
    readMovement(target: MovementIntent): MovementIntent {
      if (touchMovement) {
        target.x = touchMovement.x;
        target.y = touchMovement.y;
        return target;
      }
      target.x =
        Number(pressed.has("ArrowRight")) - Number(pressed.has("ArrowLeft"));
      target.y =
        Number(pressed.has("ArrowUp")) - Number(pressed.has("ArrowDown"));
      return target;
    },
    getMovement(): MovementIntent {
      return this.readMovement({ x: 0, y: 0 });
    },
    consumeJump() {
      const queued = jumpQueued;
      jumpQueued = false;
      return queued;
    },
    consumeReset() {
      const queued = resetQueued;
      resetQueued = false;
      return queued;
    },
    consumeTravel() {
      const queued = travelQueued;
      travelQueued = null;
      return queued;
    }
  };
}
