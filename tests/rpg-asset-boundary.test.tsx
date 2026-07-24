import { render, screen, waitFor } from "@testing-library/react";
import { forwardRef } from "react";
import { DefaultLoadingManager, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RpgCameraDynamicObstacle } from "../app/world/RpgCameraCollision";
import {
  RpgAssetAvailabilityGate,
  RpgAssetBoundary,
  clearRpgAssetAvailabilityCacheForTests
} from "../app/world/RpgAssetBoundary";
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

afterEach(() => {
  clearRpgAssetAvailabilityCacheForTests();
  vi.unstubAllGlobals();
});

describe("RPG asset recovery", () => {
  it("maps one original request to one cached object URL for the loader", async () => {
    const src = "/assets/models/characters/player-male.glb";
    const fetchMock = vi.fn(async () =>
      new Response(new Blob(["glb"]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:rpg-player"),
      revokeObjectURL: vi.fn()
    });

    render(
      <RpgAssetAvailabilityGate
        assetId="player-male"
        src={src}
        fallback={<p>Loading</p>}
      >
        <p>Loaded</p>
      </RpgAssetAvailabilityGate>
    );

    expect(await screen.findByText("Loaded")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(DefaultLoadingManager.resolveURL(src)).toBe("blob:rpg-player");
  });

  it("evicts a failed request so a remount can recover", async () => {
    const src = "/assets/world/recoverable.svg";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(new Blob(["svg"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:recovered"),
      revokeObjectURL: vi.fn()
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const first = render(
      <RpgAssetAvailabilityGate
        assetId="recoverable"
        src={src}
        fallback={<p>Fallback</p>}
      >
        <p>Loaded</p>
      </RpgAssetAvailabilityGate>
    );
    await waitFor(() => expect(consoleError).toHaveBeenCalledOnce());
    first.unmount();

    render(
      <RpgAssetAvailabilityGate
        assetId="recoverable"
        src={src}
        fallback={<p>Fallback</p>}
      >
        <p>Recovered</p>
      </RpgAssetAvailabilityGate>
    );

    expect(await screen.findByText("Recovered")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  it("aborts an in-flight request when its last subscriber unmounts", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_src: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      })
    );

    const first = render(
      <RpgAssetAvailabilityGate
        assetId="pending"
        src="/assets/pending.glb"
        fallback={null}
      >
        <p>Loaded</p>
      </RpgAssetAvailabilityGate>
    );
    const second = render(
      <RpgAssetAvailabilityGate
        assetId="pending-copy"
        src="/assets/pending.glb"
        fallback={null}
      >
        <p>Loaded copy</p>
      </RpgAssetAvailabilityGate>
    );
    await waitFor(() => expect(signal).toBeDefined());
    first.unmount();
    expect(signal?.aborted).toBe(false);
    second.unmount();

    expect(signal?.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("handles an expected network failure before mounting the throwing loader", async () => {
    clearRpgAssetAvailabilityCacheForTests();
    const loader = vi.fn(() => <p>GLTF loader mounted</p>);
    const Loader = () => loader();
    const onError = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 404 }))
    );

    render(
      <RpgAssetAvailabilityGate
        assetId="player-male"
        src="https://example.invalid/private/player-male.glb"
        fallback={<p>Fallback character</p>}
        onError={onError}
      >
        <Loader />
      </RpgAssetAvailabilityGate>
    );

    expect(await screen.findByText("Fallback character")).toBeVisible();
    expect(loader).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith({
      assetId: "player-male",
      errorName: "AssetHttpError"
    });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
      "example.invalid"
    );
    expect(JSON.stringify(onError.mock.calls)).not.toContain(
      "example.invalid"
    );
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  });

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
    clearRpgAssetAvailabilityCacheForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 200 }))
    );
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:npc"),
      revokeObjectURL: vi.fn()
    });
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
    vi.unstubAllGlobals();
  });
});
