import { forwardRef, type RefObject } from "react";
import { render } from "@testing-library/react";
import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type { RpgCameraDynamicObstacle } from "../app/world/RpgCameraCollision";

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn()
}));

vi.mock("../app/world/RpgNpcCharacter3d", () => ({
  RpgNpcCharacter3d: forwardRef(function FailingNpcAsset() {
    throw new Error("npc-glb-load-failed");
  })
}));

import { RpgNpcCrowd } from "../app/world/RpgNpcCrowd";

describe("RPG NPC crowd asset lifecycle", () => {
  it("never registers a camera obstacle when the GLB fails during initial render", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const playerPosition = {
      current: new Vector3()
    } satisfies RefObject<Vector3>;
    const dynamicObstacles = {
      current: new Map<string, RpgCameraDynamicObstacle>()
    } satisfies RefObject<Map<string, RpgCameraDynamicObstacle>>;

    const view = render(
      <RpgNpcCrowd
        playerPosition={playerPosition}
        dynamicObstacles={dynamicObstacles}
        reducedMotion={false}
      />
    );

    expect(dynamicObstacles.current.size).toBe(0);

    view.rerender(
      <RpgNpcCrowd
        playerPosition={playerPosition}
        dynamicObstacles={dynamicObstacles}
        reducedMotion
      />
    );

    expect(dynamicObstacles.current.size).toBe(0);
    consoleError.mockRestore();
  });
});
