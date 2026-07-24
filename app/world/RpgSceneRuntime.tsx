"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import type { InputController } from "./InputController";
import { createWorldNavigationPublisher } from "./WorldNavigationPublisher";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";
import type { WorldMovementIntent } from "./WorldInput";
import type { WorldRuntime } from "./WorldRuntime";

export function RpgSceneRuntime({
  runtime,
  input,
  navigation: navigationRef,
  onNavigationChange,
  telemetry: telemetryRef
}: {
  runtime: WorldRuntime;
  input: InputController;
  navigation: RefObject<WorldNavigationSnapshot>;
  onNavigationChange: (snapshot: WorldNavigationSnapshot) => void;
  telemetry: RefObject<HTMLDivElement | null>;
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
    if (input.consumeReset()) runtime.reset();
    if (input.consumeJump()) runtime.jump();
    runtime.setMovement(input.readMovement(movement.current));
    runtime.advance(delta, runtime.getCameraState().yaw);

    const next = runtime.getNavigationSnapshot();
    navigationRef.current = next;
    const telemetryNode = telemetryRef.current;
    if (telemetryNode) {
      telemetryNode.dataset.playerPosition = next.position.join(",");
      telemetryNode.dataset.navigationRevision = String(next.revision);
      telemetryNode.dataset.navigationRegion = next.navigationRegionId;
    }
    publisher.offer(clock.elapsedTime, next);
  }, -1);

  return null;
}
