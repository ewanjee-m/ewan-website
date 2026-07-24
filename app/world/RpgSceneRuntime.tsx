"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import type { InputController } from "./InputController";
import { createWorldNavigationPublisher } from "./WorldNavigationPublisher";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";
import type { WorldMovementIntent } from "./WorldInput";
import type { WorldRuntime } from "./WorldRuntime";
import {
  getWorldInteractionTarget,
  type WorldInteractionEntryId
} from "./WorldInteraction";

export function RpgSceneRuntime({
  runtime,
  input,
  navigation: navigationRef,
  onNavigationChange,
  telemetry: telemetryRef,
  inputLocked,
  onInteractionRequest
}: {
  runtime: WorldRuntime;
  input: InputController;
  navigation: RefObject<WorldNavigationSnapshot>;
  onNavigationChange: (snapshot: WorldNavigationSnapshot) => void;
  telemetry: RefObject<HTMLDivElement | null>;
  inputLocked: boolean;
  onInteractionRequest: (entryId: WorldInteractionEntryId) => void;
}) {
  const movement = useRef<WorldMovementIntent>({
    x: 0,
    y: 0,
    runRequested: false
  });
  const publisher = useMemo(
    () =>
      createWorldNavigationPublisher((_, snapshot) =>
        onNavigationChange(snapshot)
      ),
    [onNavigationChange]
  );

  useFrame(({ clock }, delta) => {
    if (!inputLocked && input.consumeReset()) runtime.reset();
    if (!inputLocked && input.consumeJump()) runtime.jump();
    const effectiveMovement = inputLocked
      ? Object.assign(movement.current, {
          x: 0,
          y: 0,
          runRequested: false
        })
      : input.readMovement(movement.current);
    runtime.setMovement(effectiveMovement);
    if (!inputLocked) {
      runtime.advance(delta, runtime.getCameraState().yaw);
    }

    const next = runtime.getNavigationSnapshot();
    if (!inputLocked && input.consumeInteraction()) {
      const target = getWorldInteractionTarget(next.nearInteractionId);
      if (target) onInteractionRequest(target.entryId);
    }
    navigationRef.current = next;
    const telemetryNode = telemetryRef.current;
    if (telemetryNode) {
      telemetryNode.dataset.playerPosition = next.position.join(",");
      telemetryNode.dataset.navigationRevision = String(next.revision);
      telemetryNode.dataset.navigationRegion = next.navigationRegionId;
      telemetryNode.dataset.inputLocked = String(inputLocked);
      telemetryNode.dataset.movementX = String(effectiveMovement.x);
      telemetryNode.dataset.movementY = String(effectiveMovement.y);
      telemetryNode.dataset.movementStrength = String(
        Math.hypot(effectiveMovement.x, effectiveMovement.y)
      );
      telemetryNode.dataset.runRequested = String(
        effectiveMovement.runRequested
      );
      telemetryNode.dataset.playerMoving = String(next.moving);
      telemetryNode.dataset.playerLocomotion = next.locomotion;
    }
    publisher.offer(clock.elapsedTime, next);
  }, -1);

  return null;
}
