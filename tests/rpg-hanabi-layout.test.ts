import { describe, expect, it } from "vitest";
import {
  RPG_HANABI_BURSTS,
  RPG_HANABI_PHASES,
  RPG_HANABI_SHELL_FLOOR,
  calculateRpgFireworkFrame,
  calculateRpgFireworkFrameInto,
  calculateRpgHanabiDroop,
  calculateRpgHanabiExpansion,
  calculateRpgHanabiSizeEnvelope,
  calculateRpgHanabiTwinkle,
  createRpgHanabiShell,
  easeOutCubic,
  getRpgHanabiRenderBudget,
  remapProgress
} from "../app/world/RpgHanabiLayout";

describe("RPG hanabi skyline", () => {
  it("reduces complete bursts and particles by quality without removing the mobile finale", () => {
    const high = getRpgHanabiRenderBudget("high");
    const medium = getRpgHanabiRenderBudget("medium");
    const low = getRpgHanabiRenderBudget("low");

    expect(high.bursts).toHaveLength(8);
    expect(medium.bursts).toHaveLength(6);
    expect(low.bursts).toHaveLength(4);
    expect(high.particlesPerBurst).toBe(220);
    expect(medium.particlesPerBurst).toBe(140);
    expect(low.particlesPerBurst).toBe(80);
    expect(high.shellLayers).toBeGreaterThanOrEqual(medium.shellLayers);
    expect(medium.shellLayers).toBeGreaterThanOrEqual(low.shellLayers);
  });

  it("keeps every quality tier inside two draw calls per burst", () => {
    for (const qualityLevel of ["high", "medium", "low"] as const) {
      const budget = getRpgHanabiRenderBudget(qualityLevel);

      expect(budget.shellLayers).toBeGreaterThanOrEqual(1);
      expect(budget.shellLayers).toBeLessThanOrEqual(2);
      expect(budget.bursts.length * budget.shellLayers).toBeLessThanOrEqual(16);
    }
  });

  it("updates a caller-owned frame instead of allocating animation results", () => {
    const input = {
      elapsedSeconds: 8.25,
      burst: RPG_HANABI_BURSTS[3],
      intensity: 0.8,
      reducedMotion: false
    };
    const target = calculateRpgFireworkFrame({ ...input, intensity: 0 });
    const animated = calculateRpgFireworkFrameInto(input, target);

    expect(animated).toBe(target);
    expect(animated.visible).toBe(true);

    input.intensity = 0;
    const hidden = calculateRpgFireworkFrameInto(input, target);

    expect(hidden).toBe(animated);
    expect(hidden.visible).toBe(false);
    expect(hidden.opacity).toBe(0);
    expect(hidden.expansion).toBe(0);
    expect(hidden.sizeEnvelope).toBe(0);
  });

  it("fills the festival sky with wide, colorful shells", () => {
    expect(RPG_HANABI_BURSTS).toHaveLength(8);
    expect(new Set(RPG_HANABI_BURSTS.map(({ color }) => color)).size).toBeGreaterThanOrEqual(6);
    for (const burst of RPG_HANABI_BURSTS) {
      expect(burst.radius * 2, burst.id).toBeGreaterThanOrEqual(16);
      expect(burst.radius * 2, burst.id).toBeLessThanOrEqual(36);
      expect(burst.position[1], burst.id).toBeGreaterThanOrEqual(12);
      expect(burst.position[1], burst.id).toBeLessThanOrEqual(24);
    }
    expect(
      Math.max(...RPG_HANABI_BURSTS.map(({ position }) => position[2])) -
        Math.min(...RPG_HANABI_BURSTS.map(({ position }) => position[2]))
    ).toBeGreaterThanOrEqual(8);
    expect(RPG_HANABI_BURSTS.filter(({ persistent }) => persistent)).toHaveLength(2);
    // The concept art shows two dominant shells over one small satellite, so
    // the largest burst must stay clearly bigger than the smallest.
    const diameters = RPG_HANABI_BURSTS.map(({ radius }) => radius * 2);
    expect(Math.max(...diameters) / Math.min(...diameters)).toBeGreaterThanOrEqual(1.5);
  });

  it("hangs the shells where a standing visitor can see them", () => {
    // The festival street, and the widest the camera's own view reaches above
    // level: half of the 52 degree vertical angle it opens with.
    const street = { x: 28, z: -24 };
    const halfFieldOfView = 26;
    const elevations = RPG_HANABI_BURSTS.map(({ position, id }) => {
      const distance = Math.hypot(position[0] - street.x, position[2] - street.z);
      return {
        id,
        degrees: (Math.atan2(position[1], distance) * 180) / Math.PI,
        // How much of that view one shell spans, corner to corner.
        spanDegrees:
          (Math.atan2(
            RPG_HANABI_BURSTS.find((burst) => burst.id === id)!.radius,
            distance
          ) *
            2 *
            180) /
          Math.PI
      };
    });

    // Overhead shells sat around fifty degrees up and never entered the frame.
    for (const shell of elevations) {
      expect(shell.degrees, shell.id).toBeLessThanOrEqual(halfFieldOfView + 6);
      expect(shell.degrees, shell.id).toBeGreaterThan(0);
    }
    // And they still have to read as fireworks, not sparks on the horizon.
    expect(Math.max(...elevations.map(({ spanDegrees }) => spanDegrees))).toBeGreaterThanOrEqual(
      20
    );

    // Nothing may sit outside the distant backdrop cylinder, which would put
    // it behind the painted horizon.
    for (const burst of RPG_HANABI_BURSTS) {
      expect(
        Math.hypot(burst.position[0], burst.position[2]),
        burst.id
      ).toBeLessThan(55.5);
    }
  });

  it("remaps and eases phase inputs without leaving the unit range", () => {
    expect(remapProgress(0.05, 0, 0.1)).toBeCloseTo(0.5, 6);
    expect(remapProgress(-1, 0, 0.1)).toBe(0);
    expect(remapProgress(4, 0, 0.1)).toBe(1);
    expect(remapProgress(0.5, 0.5, 0.5)).toBe(0);
    expect(remapProgress(Number.NaN, 0, 1)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
    expect(easeOutCubic(0.25)).toBeGreaterThan(0.25);
  });

  it("pops open, then droops, then twinkles inside the documented windows", () => {
    expect(calculateRpgHanabiExpansion(0)).toBe(0);
    expect(calculateRpgHanabiExpansion(RPG_HANABI_PHASES.explodeEnd)).toBe(1);
    expect(calculateRpgHanabiExpansion(0.05)).toBeGreaterThan(0.5);
    expect(calculateRpgHanabiExpansion(0.9)).toBe(1);

    expect(calculateRpgHanabiDroop(RPG_HANABI_PHASES.fallStart)).toBe(0);
    expect(calculateRpgHanabiDroop(0.55)).toBeGreaterThan(0);
    expect(calculateRpgHanabiDroop(1)).toBe(1);
    expect(calculateRpgHanabiDroop(0.4)).toBeLessThan(calculateRpgHanabiDroop(0.8));

    expect(calculateRpgHanabiSizeEnvelope(0)).toBe(0);
    expect(calculateRpgHanabiSizeEnvelope(RPG_HANABI_PHASES.sizeOpenEnd)).toBe(1);
    expect(calculateRpgHanabiSizeEnvelope(1)).toBe(0);
    expect(calculateRpgHanabiSizeEnvelope(0.5)).toBeGreaterThan(0);

    expect(calculateRpgHanabiTwinkle(0.1)).toBe(0);
    expect(calculateRpgHanabiTwinkle(0.5)).toBe(1);
    expect(calculateRpgHanabiTwinkle(1)).toBe(0);
  });

  it("samples a thick spherical shell with finite per-particle attributes", () => {
    const shell = createRpgHanabiShell(220, 7401);

    expect(shell.positions).toHaveLength(220 * 3);
    expect(shell.sizes).toHaveLength(220);
    expect(shell.falls).toHaveLength(220);
    expect(shell.seeds).toHaveLength(220);
    expect(Array.from(shell.positions).every(Number.isFinite)).toBe(true);

    const radii: number[] = [];
    for (let index = 0; index < 220; index += 1) {
      const x = shell.positions[index * 3];
      const y = shell.positions[index * 3 + 1];
      const z = shell.positions[index * 3 + 2];
      radii.push(Math.sqrt(x * x + y * y + z * z));
    }

    expect(Math.min(...radii)).toBeGreaterThanOrEqual(RPG_HANABI_SHELL_FLOOR - 1e-6);
    expect(Math.max(...radii)).toBeLessThanOrEqual(1 + 1e-6);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.1);
    expect(Array.from(shell.sizes).every((size) => size > 0)).toBe(true);
    expect(Array.from(shell.falls).every((fall) => fall >= 0 && fall <= 1)).toBe(true);
    expect(Array.from(shell.seeds).every((seed) => seed >= 0 && seed <= 1)).toBe(true);

    // The stars sit on a spread of directions with a trail behind each, which
    // is what reads as a chrysanthemum instead of a cloud of dots. Group the
    // particles by direction and check the groups are real rays: several
    // particles sharing one heading at different depths.
    const directions: Array<{ x: number; y: number; z: number }> = [];
    for (let index = 0; index < 220; index += 1) {
      const radius = radii[index];
      directions.push({
        x: shell.positions[index * 3] / radius,
        y: shell.positions[index * 3 + 1] / radius,
        z: shell.positions[index * 3 + 2] / radius
      });
    }
    const rays: Array<Array<number>> = [];
    for (let index = 0; index < directions.length; index += 1) {
      const here = directions[index];
      const found = rays.find((ray) => {
        const other = directions[ray[0]];
        return here.x * other.x + here.y * other.y + here.z * other.z > 0.985;
      });
      if (found) found.push(index);
      else rays.push([index]);
    }

    expect(rays.length).toBeGreaterThanOrEqual(14);
    expect(rays.length).toBeLessThanOrEqual(40);
    const trails = rays.filter((ray) => ray.length >= 4);
    expect(trails.length).toBeGreaterThanOrEqual(10);
    for (const ray of trails) {
      const depths = ray.map((index) => radii[index]);
      expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.3);
    }

    const repeated = createRpgHanabiShell(220, 7401);
    expect(Array.from(repeated.positions)).toEqual(Array.from(shell.positions));
  });

  it("never leaves the night sky without several active bursts", () => {
    for (let elapsedSeconds = 0; elapsedSeconds <= 30; elapsedSeconds += 0.1) {
      const visibleCount = RPG_HANABI_BURSTS.filter((burst) =>
        calculateRpgFireworkFrame({
          elapsedSeconds,
          burst,
          intensity: 1,
          reducedMotion: false
        }).visible
      ).length;

      expect(visibleCount, `elapsed=${elapsedSeconds.toFixed(1)}`).toBeGreaterThanOrEqual(4);
    }
  });

  it("keeps at least four active bursts at every quality throughout the night", () => {
    for (const qualityLevel of ["high", "medium", "low"] as const) {
      const { bursts } = getRpgHanabiRenderBudget(qualityLevel);

      for (let elapsedSeconds = 0; elapsedSeconds <= 30; elapsedSeconds += 0.1) {
        const visibleCount = bursts.filter((burst) =>
          calculateRpgFireworkFrame({
            elapsedSeconds,
            burst,
            intensity: 1,
            reducedMotion: false
          }).visible
        ).length;

        expect(
          visibleCount,
          `quality=${qualityLevel} elapsed=${elapsedSeconds.toFixed(1)}`
        ).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it("always leaves bright shells on screen, not merely visible groups", () => {
    for (let elapsedSeconds = 0; elapsedSeconds <= 30; elapsedSeconds += 0.1) {
      const brightCount = RPG_HANABI_BURSTS.filter((burst) => {
        const animated = calculateRpgFireworkFrame({
          elapsedSeconds,
          burst,
          intensity: 1,
          reducedMotion: false
        });
        return animated.visible && animated.sizeEnvelope * animated.opacity > 0.12;
      }).length;

      expect(brightCount, `elapsed=${elapsedSeconds.toFixed(1)}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("keeps every animation value finite and honors reduced motion", () => {
    const animated = calculateRpgFireworkFrame({
      elapsedSeconds: 8.25,
      burst: RPG_HANABI_BURSTS[3],
      intensity: 0.8,
      reducedMotion: false
    });
    const reduced = calculateRpgFireworkFrame({
      elapsedSeconds: 8.25,
      burst: RPG_HANABI_BURSTS[3],
      intensity: 0.8,
      reducedMotion: true
    });

    expect(
      Object.values(animated)
        .filter((value) => typeof value === "number")
        .every(Number.isFinite)
    ).toBe(true);
    expect(reduced.visible).toBe(true);
    expect(reduced.expansion).toBe(1);
    expect(reduced.droop).toBe(0);
    expect(reduced.twinkle).toBe(0);
    expect(reduced.sizeEnvelope).toBeGreaterThan(0);
    expect(reduced.opacity).toBeGreaterThan(0);
  });

  it("survives non-finite clock and cycle inputs", () => {
    const broken = calculateRpgFireworkFrame({
      elapsedSeconds: Number.NaN,
      burst: { ...RPG_HANABI_BURSTS[1], cycle: Number.NaN },
      intensity: Number.NaN,
      reducedMotion: false
    });

    expect(broken.visible).toBe(false);
    expect(
      Object.values(broken)
        .filter((value) => typeof value === "number")
        .every(Number.isFinite)
    ).toBe(true);
  });

  it("hides every burst before night intensity arrives", () => {
    for (const burst of RPG_HANABI_BURSTS) {
      const hidden = calculateRpgFireworkFrame({
        elapsedSeconds: 12,
        burst,
        intensity: 0,
        reducedMotion: false
      });

      expect(hidden.visible).toBe(false);
      expect(hidden.opacity).toBe(0);
      expect(hidden.expansion).toBe(0);
      expect(hidden.droop).toBe(0);
      expect(hidden.sizeEnvelope).toBe(0);
      expect(hidden.twinkle).toBe(0);
    }
  });
});
