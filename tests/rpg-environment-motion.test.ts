import { describe, expect, it } from "vitest";
import {
  createRpgEnvironmentMotionFrame,
  evaluateRpgEnvironmentMotionInto
} from "../app/world/RpgEnvironmentMotion";

const CLOUD_ROUTE = {
  baseX: 39,
  minX: -40,
  maxX: 40,
  speed: 2
} as const;

describe("RPG environment motion", () => {
  it("drifts clouds from elapsed time and wraps them inside the configured range", () => {
    const target = createRpgEnvironmentMotionFrame();

    expect(
      evaluateRpgEnvironmentMotionInto(0, 0, false, CLOUD_ROUTE, target)
        .cloudX
    ).toBe(39);
    expect(
      evaluateRpgEnvironmentMotionInto(0.5, 0, false, CLOUD_ROUTE, target)
        .cloudX
    ).toBe(-40);
    expect(
      evaluateRpgEnvironmentMotionInto(1, 0, false, CLOUD_ROUTE, target)
        .cloudX
    ).toBe(-39);

    for (let elapsedSeconds = 0; elapsedSeconds <= 120; elapsedSeconds += 0.37) {
      const { cloudX } = evaluateRpgEnvironmentMotionInto(
        elapsedSeconds,
        0,
        false,
        CLOUD_ROUTE,
        target
      );
      expect(cloudX).toBeGreaterThanOrEqual(CLOUD_ROUTE.minX);
      expect(cloudX).toBeLessThan(CLOUD_ROUTE.maxX);
    }
  });

  it("gives the airport bus a subtle suspension bob and a soft headlight pulse", () => {
    const direct = createRpgEnvironmentMotionFrame();
    const reused = createRpgEnvironmentMotionFrame();
    const samples = Array.from({ length: 65 }, (_, index) => ({
      ...evaluateRpgEnvironmentMotionInto(
        index * 0.1,
        2,
        false,
        CLOUD_ROUTE,
        reused
      )
    }));
    const bob = samples.map(({ busBobY }) => busBobY);
    const lights = samples.map(
      ({ busHeadlightIntensity }) => busHeadlightIntensity
    );

    expect(Math.min(...bob)).toBeLessThan(-0.015);
    expect(Math.max(...bob)).toBeGreaterThan(0.015);
    expect(Math.max(...bob.map(Math.abs))).toBeLessThanOrEqual(0.026);
    expect(Math.min(...lights)).toBeGreaterThanOrEqual(0.5);
    expect(Math.max(...lights)).toBeLessThanOrEqual(0.82);
    expect(Math.max(...lights) - Math.min(...lights)).toBeGreaterThan(0.2);

    const directFinal = {
      ...evaluateRpgEnvironmentMotionInto(
        6.4,
        2,
        false,
        CLOUD_ROUTE,
        direct
      )
    };
    expect(reused).toEqual(directFinal);
  });

  it("lets festival lanterns glow and sway gently with staggered phases", () => {
    const first = createRpgEnvironmentMotionFrame();
    const second = createRpgEnvironmentMotionFrame();
    const firstSamples = Array.from({ length: 81 }, (_, index) => ({
      ...evaluateRpgEnvironmentMotionInto(
        index * 0.1,
        0,
        false,
        CLOUD_ROUTE,
        first
      )
    }));
    evaluateRpgEnvironmentMotionInto(1.25, 1, false, CLOUD_ROUTE, second);
    evaluateRpgEnvironmentMotionInto(1.25, 0, false, CLOUD_ROUTE, first);
    const glow = firstSamples.map(
      ({ lanternGlowIntensity }) => lanternGlowIntensity
    );
    const sway = firstSamples.map(({ lanternSwayZ }) => lanternSwayZ);

    expect(Math.min(...glow)).toBeGreaterThanOrEqual(0.62);
    expect(Math.max(...glow)).toBeLessThanOrEqual(0.96);
    expect(Math.max(...glow) - Math.min(...glow)).toBeGreaterThan(0.2);
    expect(Math.max(...sway.map(Math.abs))).toBeLessThanOrEqual(0.03);
    expect(Math.max(...sway) - Math.min(...sway)).toBeGreaterThan(0.04);
    expect(second.lanternGlowIntensity).not.toBeCloseTo(
      first.lanternGlowIntensity,
      5
    );
    expect(second.lanternSwayZ).not.toBeCloseTo(first.lanternSwayZ, 5);
  });

  it("varies Tokyo window emission slowly without hard flashes", () => {
    const target = createRpgEnvironmentMotionFrame();
    const samples = Array.from({ length: 121 }, (_, index) =>
      evaluateRpgEnvironmentMotionInto(
        index * 0.1,
        3,
        false,
        CLOUD_ROUTE,
        target
      ).cityWindowEmissiveIntensity
    );
    const largestStep = Math.max(
      ...samples.slice(1).map((value, index) => Math.abs(value - samples[index]))
    );

    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0.28);
    expect(Math.max(...samples)).toBeLessThanOrEqual(0.74);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.3);
    expect(largestStep).toBeLessThan(0.05);
  });

  it("moves stall canopies and hanging banners with small independent sways", () => {
    const target = createRpgEnvironmentMotionFrame();
    const samples = Array.from({ length: 105 }, (_, index) => ({
      ...evaluateRpgEnvironmentMotionInto(
        index * 0.05,
        4,
        false,
        CLOUD_ROUTE,
        target
      )
    }));
    const canopy = samples.map(({ stallCanopySwayX }) => stallCanopySwayX);
    const banner = samples.map(({ stallBannerSwayZ }) => stallBannerSwayZ);

    expect(Math.max(...canopy.map(Math.abs))).toBeLessThanOrEqual(0.018);
    expect(Math.max(...canopy) - Math.min(...canopy)).toBeGreaterThan(0.025);
    expect(Math.max(...banner.map(Math.abs))).toBeLessThanOrEqual(0.05);
    expect(Math.max(...banner) - Math.min(...banner)).toBeGreaterThan(0.07);
    expect(
      samples.some(
        ({ stallCanopySwayX, stallBannerSwayZ }) =>
          Math.abs(stallCanopySwayX - stallBannerSwayZ) > 0.02
      )
    ).toBe(true);
  });

  it("keeps spatial motion neutral and lighting static when reduced motion is requested", () => {
    const target = createRpgEnvironmentMotionFrame();
    const samples = [0, 0.5, 7.25, 10_000].map((elapsedSeconds, variant) => ({
      ...evaluateRpgEnvironmentMotionInto(
        elapsedSeconds,
        variant,
        true,
        CLOUD_ROUTE,
        target
      )
    }));

    for (const sample of samples) {
      expect(sample.cloudX).toBe(CLOUD_ROUTE.baseX);
      expect(sample.busBobY).toBe(0);
      expect(sample.lanternSwayZ).toBe(0);
      expect(sample.stallCanopySwayX).toBe(0);
      expect(sample.stallBannerSwayZ).toBe(0);
      expect(sample.busHeadlightIntensity).toBeGreaterThan(0);
      expect(sample.busHeadlightIntensity).toBeLessThanOrEqual(0.65);
      expect(sample.lanternGlowIntensity).toBeGreaterThan(0);
      expect(sample.lanternGlowIntensity).toBeLessThanOrEqual(0.8);
      expect(sample.cityWindowEmissiveIntensity).toBeGreaterThan(0);
      expect(sample.cityWindowEmissiveIntensity).toBeLessThanOrEqual(0.55);
    }
    expect(
      new Set(samples.map(({ busHeadlightIntensity }) => busHeadlightIntensity))
        .size
    ).toBe(1);
    expect(
      new Set(samples.map(({ lanternGlowIntensity }) => lanternGlowIntensity))
        .size
    ).toBe(1);
    expect(
      new Set(
        samples.map(
          ({ cityWindowEmissiveIntensity }) => cityWindowEmissiveIntensity
        )
      ).size
    ).toBe(1);
  });

  it("reuses the caller frame and stays finite for extreme or invalid clock values", () => {
    const target = createRpgEnvironmentMotionFrame();
    const clocks = [
      Number.MAX_VALUE,
      1e300,
      -1e300,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY
    ];

    clocks.forEach((elapsedSeconds, index) => {
      const result = evaluateRpgEnvironmentMotionInto(
        elapsedSeconds,
        index === 0 ? Number.MAX_VALUE : index,
        false,
        CLOUD_ROUTE,
        target
      );
      expect(result).toBe(target);
      expect(Object.values(result).every(Number.isFinite)).toBe(true);
    });
  });
});
