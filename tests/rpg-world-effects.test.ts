import { describe, expect, it } from "vitest";
import {
  RPG_HANABI_BURSTS,
  calculateRpgFireworkFrame,
  getRpgHanabiRenderBudget
} from "../app/world/RpgHanabiLayout";
import {
  calculateActiveRpgFireworkFrame,
  calculateActiveRpgFireworkFrameInto,
  calculateActiveRpgFireworkTrailFrame,
  createRpgFireworkSparkTexture
} from "../app/world/RpgWorldEffects";

describe("active RPG world effects", () => {
  it("renders fireworks with a circular soft spark instead of square points", () => {
    const texture = createRpgFireworkSparkTexture(16);
    const data = texture.image.data as Uint8Array;
    const alphaAt = (x: number, y: number) =>
      data[(y * texture.image.width + x) * 4 + 3];

    expect(texture.image.width).toBe(16);
    expect(texture.image.height).toBe(16);
    expect(alphaAt(8, 8)).toBeGreaterThan(240);
    expect(alphaAt(0, 0)).toBe(0);
    expect(alphaAt(8, 2)).toBeGreaterThan(alphaAt(8, 0));
  });

  it.each(["high", "medium", "low"] as const)(
    "keeps at least four canonical %s base shells visible from 0 through 30 seconds",
    (level) => {
      const budget = getRpgHanabiRenderBudget(level);
      for (let elapsedSeconds = 0; elapsedSeconds <= 30; elapsedSeconds += 0.05) {
        const frames = budget.bursts.map((burst) =>
          calculateActiveRpgFireworkFrame({
            elapsedSeconds,
            burst,
            intensity: 1,
            reducedMotion: false
          })
        );
        expect(
          frames.filter(({ visible }) => visible).length,
          `${level} at ${elapsedSeconds.toFixed(2)}s`
        ).toBeGreaterThanOrEqual(4);
      }
    }
  );

  it("preserves canonical wrapping at low 0.95s and high 23.2s", () => {
    for (const [level, elapsedSeconds] of [
      ["low", 0.95],
      ["high", 23.2]
    ] as const) {
      const visible = getRpgHanabiRenderBudget(level).bursts.filter(
        (burst) =>
          calculateActiveRpgFireworkFrame({
            elapsedSeconds,
            burst,
            intensity: 1,
            reducedMotion: false
          }).visible
      );
      expect(visible.length, `${level} at ${elapsedSeconds}s`)
        .toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps persistent base shells visible beyond the normal hide phase", () => {
    for (const burst of RPG_HANABI_BURSTS.filter(
      ({ persistent }) => persistent
    )) {
      const elapsedSeconds = burst.delay + burst.cycle * 0.95;
      const active = calculateActiveRpgFireworkFrame({
        elapsedSeconds,
        burst,
        intensity: 1,
        reducedMotion: false
      });
      const canonical = calculateRpgFireworkFrame({
        elapsedSeconds,
        burst,
        intensity: 1,
        reducedMotion: false
      });

      expect(active).toEqual(canonical);
      expect(active.visible, burst.id).toBe(true);
    }
  });

  it("shortens only the active trail envelope while preserving its base shell", () => {
    const burst = RPG_HANABI_BURSTS[0];
    const base = calculateActiveRpgFireworkFrame({
      elapsedSeconds: 0.7,
      burst,
      intensity: 1,
      reducedMotion: false
    });
    const reducedTrail = calculateActiveRpgFireworkTrailFrame({
      base,
      burst,
      trailSeconds: 0.5
    });
    const fullTrail = calculateActiveRpgFireworkTrailFrame({
      base,
      burst,
      trailSeconds: 1.15
    });

    expect(base.visible).toBe(true);
    expect(reducedTrail).toEqual({ visible: false, opacity: 0 });
    expect(fullTrail.visible).toBe(true);
    expect(fullTrail.opacity).toBeGreaterThan(0);
  });

  it("keeps the active production frame seam finite for invalid cycle and trail values", () => {
    const burst = {
      ...RPG_HANABI_BURSTS[0],
      cycle: Number.NaN
    };
    const target = {
      visible: false,
      progress: 0,
      expansion: 0,
      droop: 0,
      sizeEnvelope: 0,
      twinkle: 0,
      opacity: 0
    };
    const base = calculateActiveRpgFireworkFrameInto(
      {
        elapsedSeconds: 0.7,
        burst,
        intensity: 1,
        reducedMotion: false
      },
      target
    );
    const trail = calculateActiveRpgFireworkTrailFrame({
      base,
      burst,
      trailSeconds: Number.NaN
    });

    expect(base).toBe(target);
    expect(
      Object.values(base)
        .filter((value): value is number => typeof value === "number")
        .every(Number.isFinite)
    ).toBe(true);
    expect(trail).toEqual({ visible: false, opacity: 0 });
    expect(Number.isFinite(trail.opacity)).toBe(true);
  });
});
