export type WorldPointerKind = "mouse" | "touch" | "pen";

export interface WorldMovementIntent {
  x: number;
  y: number;
  runRequested: boolean;
}

export interface WorldCameraDragIntent {
  deltaX: number;
  deltaY: number;
  pointerKind: WorldPointerKind;
}
