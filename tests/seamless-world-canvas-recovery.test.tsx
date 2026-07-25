import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import {
  type ComponentType,
  type ReactNode,
  useEffect,
  useState
} from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";
import { createInputController } from "../app/world/InputController";
import { RpgOptionalDecoration } from "../app/world/RpgOptionalDecoration";
import type { RpgTownSceneProps } from "../app/world/RpgTownScene";
import { getSceneQuality } from "../app/world/SceneQuality";
import SeamlessWorldCanvas, {
  type SeamlessWorldDependencies
} from "../app/world/SeamlessWorldCanvas";
import { WorldErrorBoundary } from "../app/world/WorldErrorBoundary";
import { createWorldRuntime } from "../app/world/WorldRuntime";

let mockCanvasMountCount = 0;
let mockAssetPending = false;
let mockPerformanceSample:
  | {
      averageFps: number;
      p5Fps: number;
      longFrameCount: number;
      frameCount: number;
    }
  | null = null;
let mockSettingsStage: "full" | "pixel-ratio" = "full";
const neverResolvingAsset = new Promise<never>(() => undefined);

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: ReactNode }) => {
    const [childrenReady, setChildrenReady] = useState(false);
    useEffect(() => {
      mockCanvasMountCount += 1;
      setChildrenReady(true);
    }, []);
    return childrenReady ? <>{children}</> : null;
  },
  useFrame: (callback: () => void) => {
    useEffect(() => {
      callback();
      callback();
    }, [callback]);
  },
  useLoader: () => {
    if (mockAssetPending) throw neverResolvingAsset;
    return {};
  }
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
  AdaptiveQualityMonitor: ({
    initialLevel,
    reducedMotion,
    coarsePointer,
    onSettingsChange
  }: {
    initialLevel: "high" | "medium" | "low";
    reducedMotion: boolean;
    coarsePointer: boolean;
    onSettingsChange: (settings: ReturnType<typeof getSceneQuality>) => void;
  }) => {
    useEffect(() => {
      if (mockSettingsStage === "full") return;
      onSettingsChange(
        getSceneQuality({
          level: initialLevel,
          reducedMotion,
          coarsePointer,
          degradationStage: mockSettingsStage
        })
      );
    }, [
      coarsePointer,
      initialLevel,
      onSettingsChange,
      reducedMotion
    ]);
    return null;
  }
}));
vi.mock("../app/world/WorldPerformanceMonitor", () => ({
  WorldPerformanceMonitor: ({
    onSample
  }: {
    onSample: (sample: NonNullable<typeof mockPerformanceSample>) => void;
  }) => {
    useEffect(() => {
      if (mockPerformanceSample) onSample(mockPerformanceSample);
    }, [onSample]);
    return null;
  }
}));

const unhandledErrors: unknown[] = [];
const captureError = (event: ErrorEvent) => unhandledErrors.push(event.error);
const captureRejection = (event: PromiseRejectionEvent) =>
  unhandledErrors.push(event.reason);

beforeEach(() => {
  mockCanvasMountCount = 0;
  mockAssetPending = false;
  mockPerformanceSample = null;
  mockSettingsStage = "full";
  unhandledErrors.length = 0;
  window.addEventListener("error", captureError);
  window.addEventListener("unhandledrejection", captureRejection);
});

afterEach(() => {
  window.removeEventListener("error", captureError);
  window.removeEventListener("unhandledrejection", captureRejection);
  vi.unstubAllGlobals();
});

function RecoveryHarness({
  dependencies,
  beforeRetry
}: {
  dependencies: Partial<SeamlessWorldDependencies>;
  beforeRetry: () => void;
}) {
  const [resetKey, setResetKey] = useState(0);
  const [input] = useState(createInputController);
  const retry = () => {
    beforeRetry();
    input.reset();
    setResetKey((current) => current + 1);
  };

  return (
    <WorldErrorBoundary
      resetKey={resetKey}
      onRetry={retry}
      fallback={({ retry: retryBoundary }) => (
        <button type="button" onClick={retryBoundary}>
          Retry
        </button>
      )}
    >
      <SeamlessWorldCanvas
        key={resetKey}
        character="male"
        input={input}
        inputLocked={false}
        activeDestinationId={null}
        onInteractionRequest={vi.fn()}
        onNavigationChange={vi.fn()}
        onRetry={retry}
        dependencies={dependencies}
      />
    </WorldErrorBoundary>
  );
}

describe("seamless world recovery", () => {
  it("rebuilds exactly one Canvas/runtime pair after a bootstrap error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let failRuntime = true;
    const createRuntime = vi.fn(() => {
      if (failRuntime) {
        throw new Error("injected runtime bootstrap failure");
      }
      return createWorldRuntime();
    });
    const SceneComponent: ComponentType<RpgTownSceneProps> = () => null;
    const supportsWebGl = vi.fn(() => true);
    const { container } = render(
      <RecoveryHarness
        dependencies={{
          createRuntime,
          SceneComponent,
          supportsWebGl
        }}
        beforeRetry={() => {
          failRuntime = false;
        }}
      />
    );

    expect(
      await screen.findByRole("button", { name: "Retry" })
    ).toBeVisible();
    expect(createRuntime).toHaveBeenCalledTimes(1);
    expect(mockCanvasMountCount).toBe(1);
    expect(unhandledErrors).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => {
      expect(container.querySelector(".seamless-world-renderer"))
        .toHaveAttribute("data-world-ready", "true");
    });
    expect(createRuntime).toHaveBeenCalledTimes(2);
    expect(supportsWebGl).toHaveBeenCalledTimes(2);
    expect(mockCanvasMountCount).toBe(2);
    expect(unhandledErrors).toEqual([]);
    consoleError.mockRestore();
  });

  it("clears one stable input before mount and again before readiness", async () => {
    const input = createInputController();
    const reset = vi.spyOn(input, "reset");
    const SceneComponent: ComponentType<RpgTownSceneProps> = () => null;

    const { container } = render(
      <SeamlessWorldCanvas
        character="male"
        input={input}
        inputLocked={false}
        activeDestinationId={null}
        onInteractionRequest={vi.fn()}
        onNavigationChange={vi.fn()}
        onRetry={vi.fn()}
        dependencies={{
          createRuntime: () => createWorldRuntime(),
          SceneComponent,
          supportsWebGl: () => true
        }}
      />
    );

    await waitFor(() => {
      expect(container.querySelector(".seamless-world-renderer"))
        .toHaveAttribute("data-world-ready", "true");
    });
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it("reaches ready while the optional decoration remains pending", async () => {
    mockAssetPending = true;
    vi.stubGlobal("fetch", () => neverResolvingAsset);
    const SceneComponent: ComponentType<RpgTownSceneProps> = ({
      telemetry
    }) => <RpgOptionalDecoration telemetry={telemetry} />;

    const { container } = render(
      <SeamlessWorldCanvas
        character="male"
        input={createInputController()}
        inputLocked={false}
        activeDestinationId={null}
        onInteractionRequest={vi.fn()}
        onNavigationChange={vi.fn()}
        onRetry={vi.fn()}
        dependencies={{
          createRuntime: () => createWorldRuntime(),
          SceneComponent,
          supportsWebGl: () => true
        }}
      />
    );

    await waitFor(() => {
      expect(container.querySelector(".seamless-world-renderer"))
        .toHaveAttribute("data-world-ready", "true");
    });
    expect(container.querySelector(".seamless-world-renderer"))
      .toHaveAttribute("data-optional-decoration", "pending");
  });

  it("gives the festival sign a whole-pixel intrinsic size", () => {
    // Without width and height an SVG has no intrinsic size, so the browser
    // rasterises it at the 300px replaced-element default and the viewBox
    // ratio decides the rest. 512:192 lands on 112.5px, which the image
    // reports as 113 while the decoded bitmap is not that tall. Three sizes
    // immutable texture storage from the reported height and then uploads the
    // real bitmap, which the desktop console showed as
    // "texSubImage2D: bad image data" followed by "Texture is immutable".
    const markup = readFileSync(
      resolve(process.cwd(), "public/assets/world/hanabi-festival-sign.svg"),
      "utf8"
    );
    const viewBox = markup.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(viewBox).not.toBeNull();
    const width = markup.match(/<svg[^>]*\swidth="(\d+)"/);
    const height = markup.match(/<svg[^>]*\sheight="(\d+)"/);
    expect(width?.[1]).toBe(viewBox![1]);
    expect(height?.[1]).toBe(viewBox![2]);
  });

  it("keeps frozen performance telemetry and DOM quality stage synchronized", async () => {
    mockPerformanceSample = {
      averageFps: 57.126,
      p5Fps: 43.812,
      longFrameCount: 0,
      frameCount: 120
    };
    mockSettingsStage = "pixel-ratio";
    const SceneComponent: ComponentType<RpgTownSceneProps> = () => null;

    const { container } = render(
      <SeamlessWorldCanvas
        character="male"
        input={createInputController()}
        inputLocked={false}
        activeDestinationId={null}
        onInteractionRequest={vi.fn()}
        onNavigationChange={vi.fn()}
        onRetry={vi.fn()}
        dependencies={{
          createRuntime: () => createWorldRuntime(),
          SceneComponent,
          supportsWebGl: () => true
        }}
      />
    );

    await waitFor(() => {
      expect(container.querySelector(".seamless-world-renderer"))
        .toHaveAttribute("data-quality-stage", "pixel-ratio");
    });
    const renderer = container.querySelector(".seamless-world-renderer");
    expect(renderer).toHaveAttribute("data-average-fps", "57.13");
    expect(renderer).toHaveAttribute("data-p5-fps", "43.81");
    expect(window.__RPG_PERFORMANCE__?.qualityStage).toBe("pixel-ratio");
    expect(Object.isFrozen(window.__RPG_PERFORMANCE__)).toBe(true);
  });

  it("rebuilds exactly one Canvas/runtime pair after a WorldScene render error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const createRuntime = vi.fn(() => createWorldRuntime());
    const supportsWebGl = vi.fn(() => true);
    let failScene = true;
    const InjectedScene: ComponentType<RpgTownSceneProps> = (props) => {
      void props;
      if (failScene) throw new Error("injected WorldScene render failure");
      return null;
    };

    const { container } = render(
      <RecoveryHarness
        dependencies={{
          createRuntime,
          SceneComponent: InjectedScene,
          supportsWebGl
        }}
        beforeRetry={() => {
          failScene = false;
        }}
      />
    );
    expect(
      await screen.findByRole("button", { name: "Retry" })
    ).toBeVisible();
    expect(unhandledErrors).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(
      () => {
        expect(container.querySelector(".seamless-world-renderer"))
          .toHaveAttribute("data-world-ready", "true");
      },
      { timeout: 10_000 }
    );
    expect(createRuntime).toHaveBeenCalledTimes(2);
    expect(supportsWebGl).toHaveBeenCalledTimes(2);
    expect(mockCanvasMountCount).toBe(2);
    expect(unhandledErrors).toEqual([]);
    consoleError.mockRestore();
  }, 10_000);
});
