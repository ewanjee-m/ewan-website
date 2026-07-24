import type {
  WorldCameraDragIntent,
  WorldMovementIntent,
  WorldPointerKind
} from "./WorldInput";

const movementKeys: ReadonlyMap<string, readonly [number, number]> = new Map([
  ["ArrowUp", [0, 1]],
  ["w", [0, 1]],
  ["W", [0, 1]],
  ["ArrowDown", [0, -1]],
  ["s", [0, -1]],
  ["S", [0, -1]],
  ["ArrowLeft", [-1, 0]],
  ["a", [-1, 0]],
  ["A", [-1, 0]],
  ["ArrowRight", [1, 0]],
  ["d", [1, 0]],
  ["D", [1, 0]]
] as const);

export function createInputController() {
  const pressed = new Set<string>();
  let touchMovement: WorldMovementIntent | null = null;
  let jumpHeld = false;
  let jumpQueued = false;
  let resetQueued = false;
  let interactionQueued = false;
  const cameraDrag: WorldCameraDragIntent = {
    deltaX: 0,
    deltaY: 0,
    pointerKind: "mouse"
  };

  return {
    pressKey(key: string) {
      if (movementKeys.has(key) || key === "Shift") pressed.add(key);
      if (key === " " && !jumpHeld) {
        jumpHeld = true;
        jumpQueued = true;
      }
      if (key === "e" || key === "E" || key === "Enter") {
        interactionQueued = true;
      }
      if (key === "r" || key === "R") resetQueued = true;
    },
    releaseKey(key: string) {
      pressed.delete(key);
      if (key === " ") jumpHeld = false;
    },
    reset() {
      pressed.clear();
      touchMovement = null;
      jumpHeld = false;
      jumpQueued = false;
      resetQueued = false;
      interactionQueued = false;
      cameraDrag.deltaX = 0;
      cameraDrag.deltaY = 0;
    },
    setTouchMovement(intent: WorldMovementIntent | null) {
      touchMovement = intent ? { ...intent } : null;
    },
    addCameraDrag(
      deltaX: number,
      deltaY: number,
      pointerKind: WorldPointerKind
    ) {
      if (![deltaX, deltaY].every(Number.isFinite)) return;
      cameraDrag.deltaX += deltaX;
      cameraDrag.deltaY += deltaY;
      cameraDrag.pointerKind = pointerKind;
    },
    readMovement(target: WorldMovementIntent) {
      if (touchMovement) return Object.assign(target, touchMovement);
      let x = 0;
      let y = 0;
      for (const key of pressed) {
        const direction = movementKeys.get(key);
        if (!direction) continue;
        x += direction[0];
        y += direction[1];
      }
      const length = Math.hypot(x, y);
      const scale =
        length === Math.SQRT2 ? Math.SQRT1_2 : length > 1 ? 1 / length : 1;
      target.x = x * scale;
      target.y = y * scale;
      target.runRequested = pressed.has("Shift");
      return target;
    },
    consumeCameraDrag(target: WorldCameraDragIntent) {
      Object.assign(target, cameraDrag);
      cameraDrag.deltaX = 0;
      cameraDrag.deltaY = 0;
      return target;
    },
    queueJump() {
      jumpQueued = true;
    },
    queueReset() {
      resetQueued = true;
    },
    queueInteraction() {
      interactionQueued = true;
    },
    consumeJump() {
      const result = jumpQueued;
      jumpQueued = false;
      return result;
    },
    consumeReset() {
      const result = resetQueued;
      resetQueued = false;
      return result;
    },
    consumeInteraction() {
      const result = interactionQueued;
      interactionQueued = false;
      return result;
    }
  };
}

export type InputController = ReturnType<typeof createInputController>;
