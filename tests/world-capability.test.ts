import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { createInputController } from "../app/world/InputController";
import { supportsWebGl } from "../app/world/WorldCapability";
import SeamlessWorldCanvas from "../app/world/SeamlessWorldCanvas";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => children,
  useFrame: vi.fn()
}));

vi.mock("../app/world/RpgPlayerActor", () => ({
  RpgPlayerActor: () => null
}));
vi.mock("../app/world/RpgSceneRuntime", () => ({
  RpgSceneRuntime: () => null
}));
vi.mock("../app/world/ChaseOrbitCamera3d", () => ({
  ChaseOrbitCamera3d: () => null
}));
vi.mock("../app/world/AdaptiveQualityMonitor", () => ({
  AdaptiveQualityMonitor: () => null
}));
vi.mock("../app/world/WorldPerformanceMonitor", () => ({
  WorldPerformanceMonitor: () => null
}));

describe("world WebGL capability", () => {
  it("rejects missing WebGL", () => {
    expect(supportsWebGl(() => null)).toBe(false);
  });

  it("does not construct runtime state before an unsupported retry", async () => {
    const user = userEvent.setup();
    const createRuntime = vi.fn();
    const onRetry = vi.fn();
    const capability = vi.fn(() => false);
    window.__RPG_PERFORMANCE__ = Object.freeze({
      averageFps: 60,
      p5Fps: 55,
      longFrameCount: 0,
      frameCount: 120,
      qualityStage: "full"
    });

    render(
      createElement(SeamlessWorldCanvas, {
        character: "male",
        input: createInputController(),
        inputLocked: false,
        activeDestinationId: null,
        onInteractionRequest: vi.fn(),
        onNavigationChange: vi.fn(),
        onRetry,
        dependencies: {
          createRuntime,
          supportsWebGl: capability
        }
      })
    );

    expect(createRuntime).not.toHaveBeenCalled();
    expect(capability).toHaveBeenCalledOnce();
    expect(window.__RPG_PERFORMANCE__).toBeUndefined();
    expect(screen.queryByText("Loading 3D world")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(createRuntime).not.toHaveBeenCalled();
  });
});
