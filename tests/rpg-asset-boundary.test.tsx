import { render, screen, waitFor } from "@testing-library/react";
import { forwardRef } from "react";
import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import type { RpgCameraDynamicObstacle } from "../app/world/RpgCameraCollision";
import { RpgAssetBoundary } from "../app/world/RpgAssetBoundary";
import { createWorldRuntime } from "../app/world/WorldRuntime";

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn()
}));

vi.mock("../app/world/RpgNpcCharacter3d", () => ({
  RpgNpcCharacter3d: forwardRef(function InjectedNpcAsset(
    { npcId }: { npcId: string },
    ref
  ) {
    void ref;
    if (npcId === "npc-hanabi-yukata") {
      throw new Error("https://example.invalid/private/model.glb");
    }
    return <div data-testid={npcId} data-npc-id={npcId} />;
  })
}));

import { RpgNpcCrowd } from "../app/world/RpgNpcCrowd";

function BrokenAsset(): never {
  throw new TypeError("asset failed");
}

describe("RPG asset recovery", () => {
  it("renders a local fallback and logs only assetId and errorName", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <RpgAssetBoundary
        assetId="player-male"
        fallback={<p>Fallback character</p>}
      >
        <BrokenAsset />
      </RpgAssetBoundary>
    );

    expect(screen.getByText("Fallback character")).toBeVisible();
    expect(consoleError).toHaveBeenCalledWith({
      assetId: "player-male",
      errorName: "TypeError"
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "example.invalid"
    );
    consoleError.mockRestore();
  })

  it("isolates one failed NPC obstacle and runtime interaction target", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const runtime = createWorldRuntime();
    const availability = vi.spyOn(runtime, "setInteractionTargetAvailable");
    const dynamicObstacles = {
      current: new Map<string, RpgCameraDynamicObstacle>()
    };

    render(
      <RpgNpcCrowd
        playerPosition={{ current: new Vector3() }}
        dynamicObstacles={dynamicObstacles}
        reducedMotion={false}
        npcSecondaryMotion
        runtime={runtime}
      />
    );

    await waitFor(() => {
      expect(
        dynamicObstacles.current.has("npc-hanabi-yukata")
      ).toBe(false);
    });
    expect(availability).toHaveBeenCalledWith("npc-hanabi-yukata", false);
    expect(dynamicObstacles.current.size).toBeGreaterThan(0);
    expect(
      dynamicObstacles.current.has("npc-hanabi-child")
    ).toBe(true);
    expect(
      screen.getByTestId("npc-hanabi-child")
    ).toBeInTheDocument();

    const freshRuntime = createWorldRuntime();
    expect(freshRuntime).not.toBe(runtime);
    expect(
      vi.spyOn(freshRuntime, "setInteractionTargetAvailable")
    ).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
