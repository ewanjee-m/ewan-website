import { describe, expect, it } from "vitest";
import {
  createNpcMotionPose,
  evaluateNpcMotionInto
} from "../app/world/NpcMotion";

function sampleNpcMotion(
  variant: number,
  elapsedSeconds: number,
  reducedMotion = false
) {
  return {
    ...evaluateNpcMotionInto(
      variant,
      elapsedSeconds,
      reducedMotion,
      createNpcMotionPose()
    )
  };
}

describe("RPG town NPC motion", () => {
  it.each([0, 3, 6])(
    "walk variant %i travels a short out-and-back route and faces both directions",
    (variant) => {
      const samples = Array.from({ length: 9 }, (_, index) =>
        sampleNpcMotion(variant, index * 0.6)
      );
      const offsets = samples.map(({ offsetX }) => offsetX);

      expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(0.3);
      expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(0.8);
      expect(new Set(samples.map(({ facing }) => facing))).toEqual(
        new Set([-1, 1])
      );
      expect(samples.at(-1)?.offsetX).toBeCloseTo(samples[0].offsetX, 8);
      expect(samples.at(-1)?.facing).toBe(samples[0].facing);
    }
  );

  it.each([1, 4])(
    "breathing variant %i stays in place while breathing and swaying",
    (variant) => {
      const samples = Array.from({ length: 9 }, (_, index) =>
        sampleNpcMotion(variant, index * 0.45)
      );
      const scales = samples.map(({ scaleY }) => scaleY);
      const rotations = samples.map(({ rotationZ }) => rotationZ);

      expect(samples.every(({ offsetX }) => offsetX === 0)).toBe(true);
      expect(Math.max(...scales) - Math.min(...scales)).toBeGreaterThan(0.01);
      expect(Math.max(...scales) - Math.min(...scales)).toBeLessThan(0.03);
      expect(Math.max(...rotations) - Math.min(...rotations)).toBeGreaterThan(
        0.015
      );
      expect(Math.max(...rotations) - Math.min(...rotations)).toBeLessThan(0.05);
      expect(samples.at(-1)?.scaleY).toBeCloseTo(samples[0].scaleY, 8);
      expect(samples.at(-1)?.rotationZ).toBeCloseTo(samples[0].rotationZ, 8);
      expect(new Set(samples.map(({ facing }) => facing))).toEqual(
        new Set([variant % 2 === 0 ? 1 : -1])
      );
    }
  );

  it.each([2, 5])(
    "greeting variant %i repeatedly dips its head and returns upright",
    (variant) => {
      const samples = Array.from({ length: 13 }, (_, index) =>
        sampleNpcMotion(variant, index * 0.45)
      );
      const scales = samples.map(({ scaleY }) => scaleY);
      const rotations = samples.map(({ rotationZ }) => rotationZ);

      expect(samples.every(({ offsetX }) => offsetX === 0)).toBe(true);
      expect(Math.min(...scales)).toBeLessThan(0.95);
      expect(Math.max(...scales)).toBeGreaterThan(0.995);
      expect(Math.max(...rotations.map(Math.abs))).toBeGreaterThan(0.015);
      expect(samples.at(-1)?.scaleY).toBeCloseTo(samples[0].scaleY, 8);
      expect(samples.at(-1)?.rotationZ).toBeCloseTo(samples[0].rotationZ, 8);
      expect(new Set(samples.map(({ facing }) => facing))).toEqual(
        new Set([variant % 2 === 0 ? 1 : -1])
      );
    }
  );

  it.each([0, 1, 2, 3, 4, 5, 6])(
    "reduced motion keeps variant %i stationary with only a very subtle idle pose",
    (variant) => {
      const samples = [0, 1.5, 3, 4.5, 6].map((elapsedSeconds) =>
        sampleNpcMotion(variant, elapsedSeconds, true)
      );
      const scales = samples.map(({ scaleY }) => scaleY);

      expect(samples.every(({ offsetX }) => offsetX === 0)).toBe(true);
      expect(samples.every(({ rotationZ }) => rotationZ === 0)).toBe(true);
      expect(Math.max(...scales) - Math.min(...scales)).toBeGreaterThan(0);
      expect(Math.max(...scales) - Math.min(...scales)).toBeLessThanOrEqual(
        0.004
      );
      expect(samples.at(-1)?.scaleY).toBeCloseTo(samples[0].scaleY, 8);
      expect(samples.at(-1)?.offsetX).toBe(samples[0].offsetX);
      expect(samples.at(-1)?.rotationZ).toBe(samples[0].rotationZ);
      expect(samples.at(-1)?.facing).toBe(samples[0].facing);
    }
  );
});
