import { act, render } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { createWorldPerformanceSampler } from "../app/world/WorldPerformanceSampler";
import { WorldPerformanceMonitor } from "../app/world/WorldPerformanceMonitor";

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn()
}));

import { useFrame } from "@react-three/fiber";

describe("world performance sampler", () => {
  it("computes average, p5 FPS, and long frames", () => {
    const sampler = createWorldPerformanceSampler();
    for (let index = 0; index < 120; index += 1) {
      sampler.recordFrame(1 / 60);
    }
    sampler.recordFrame(0.3);

    const sample = sampler.read();
    expect(sample).toMatchObject({
      averageFps: expect.any(Number),
      p5Fps: expect.any(Number),
      longFrameCount: 1,
      frameCount: 121
    });
    expect(Object.isFrozen(sample)).toBe(true);
  });

  it("ignores invalid frame durations", () => {
    const sampler = createWorldPerformanceSampler();
    sampler.recordFrame(0);
    sampler.recordFrame(Number.NaN);
    sampler.recordFrame(Number.POSITIVE_INFINITY);

    expect(sampler.read()).toEqual({
      averageFps: 0,
      p5Fps: 0,
      longFrameCount: 0,
      frameCount: 0
    });
  });

  it("publishes one frozen cumulative sample only after two seconds", () => {
    const onSample = vi.fn();
    render(createElement(WorldPerformanceMonitor, { onSample }));
    const frame = vi.mocked(useFrame).mock.calls.at(-1)?.[0];
    expect(frame).toBeTypeOf("function");

    act(() => {
      for (let index = 0; index < 119; index += 1) {
        frame!({} as never, 1 / 60);
      }
    });
    expect(onSample).not.toHaveBeenCalled();

    act(() => {
      frame!({} as never, 1 / 60);
    });
    expect(onSample).toHaveBeenCalledOnce();
    expect(Object.isFrozen(onSample.mock.calls[0][0])).toBe(true);
    expect(onSample.mock.calls[0][0].frameCount).toBe(120);
  });
});
