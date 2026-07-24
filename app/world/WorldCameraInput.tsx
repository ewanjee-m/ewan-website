"use client";

import { useRef, type PointerEvent } from "react";
import type { WorldPointerKind } from "./WorldInput";

const WORLD_CAMERA_INPUT_BLOCK_SELECTOR = [
  "[data-world-input-block]",
  "button",
  "a",
  "[role='dialog']",
  ".rpg-world-map",
  ".rpg-mini-map",
  ".mobile-move-zone"
].join(",");

export interface WorldCameraInputProps {
  label: string;
  onDrag: (
    deltaX: number,
    deltaY: number,
    pointerKind: WorldPointerKind
  ) => void;
}

export function WorldCameraInput({ label, onDrag }: WorldCameraInputProps) {
  const active = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (active.current !== event.pointerId) return;
    onDrag(
      event.clientX - last.current.x,
      event.clientY - last.current.y,
      event.pointerType === "touch"
        ? "touch"
        : event.pointerType === "pen"
          ? "pen"
          : "mouse"
    );
    last.current = { x: event.clientX, y: event.clientY };
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (active.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    active.current = null;
  };

  return (
    <div
      className="world-camera-input"
      aria-label={label}
      onPointerDown={(event) => {
        const target = event.target;
        if (
          !event.isPrimary ||
          active.current !== null ||
          (target instanceof Element &&
            target.closest(WORLD_CAMERA_INPUT_BLOCK_SELECTOR) !== null)
        ) {
          return;
        }
        active.current = event.pointerId;
        last.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={(event) => {
        if (active.current === event.pointerId) active.current = null;
      }}
    />
  );
}
