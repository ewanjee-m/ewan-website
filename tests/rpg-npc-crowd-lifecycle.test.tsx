import { forwardRef, type RefObject } from "react";
import { render, waitFor } from "@testing-library/react";
import { Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpgCameraDynamicObstacle } from "../app/world/RpgCameraCollision";
import { clearRpgAssetAvailabilityCacheForTests } from "../app/world/RpgAssetBoundary";
import { createWorldRuntime } from "../app/world/WorldRuntime";

const npcAssetHarness = vi.hoisted(() => ({ fail: true }));

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn()
}));

vi.mock("../app/world/RpgNpcCharacter3d", () => ({
  RpgNpcCharacter3d: forwardRef(function FailingNpcAsset() {
    if (npcAssetHarness.fail) {
      throw new Error("npc-glb-load-failed");
    }
    return null;
  })
}));

import { RpgNpcCrowd } from "../app/world/RpgNpcCrowd";

afterEach(() => {
  clearRpgAssetAvailabilityCacheForTests();
  vi.unstubAllGlobals();
});

describe("RPG NPC crowd asset lifecycle", () => {
  it("disables pending interactions and enables them only after fetch success", async () => {
    npcAssetHarness.fail = false;
    clearRpgAssetAvailabilityCacheForTests();
    let resolveFetch!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        pending.then(
          () => new Response(new Blob(["glb"]), { status: 200 })
        )
      )
    );
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:npc"),
      revokeObjectURL: vi.fn()
    });
    const runtime = createWorldRuntime();
    const availability = vi.spyOn(runtime, "setInteractionTargetAvailable");

    render(
      <RpgNpcCrowd
        playerPosition={{ current: new Vector3() }}
        dynamicObstacles={{ current: new Map() }}
        reducedMotion={false}
        runtime={runtime}
      />
    );

    expect(availability).toHaveBeenCalledWith(
      "npc-hanabi-child",
      false
    );
    expect(availability).not.toHaveBeenCalledWith(
      "npc-hanabi-child",
      true
    );

    resolveFetch();
    await waitFor(() => {
      expect(availability).toHaveBeenCalledWith(
        "npc-hanabi-child",
        true
      );
    });
  });

  it("never registers a camera obstacle when the GLB fails during initial render", () => {
    npcAssetHarness.fail = true;
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
