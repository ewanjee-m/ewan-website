import { describe, expect, it } from "vitest";
import {
  calculateHanabiFrame,
  calculateHanabiFrameInto,
  calculateHanabiReflectionFrameInto,
  createFireworkParticlePositions,
  createFireworkRaySegmentPositions,
  type HanabiBurstFrame,
  type HanabiReflectionFrame
} from "../app/world/WorldEffects";
import { getSceneQuality } from "../app/world/SceneQuality";
import { Vector3 } from "three";

describe("hanabi finale", () => {
  it.each([28, 48, 72])(
    "draws %i particles as a camera-facing radial bloom instead of an indistinct cloud",
    (particles) => {
      const positions = createFireworkParticlePositions(particles, 1701);
      const occupiedSectors = new Set<number>();

      expect(positions).toHaveLength(particles * 3);
      for (let ray = 0; ray < Math.floor(particles / 3); ray += 1) {
        const inner = new Vector3().fromArray(positions, ray * 9);
        const middle = new Vector3().fromArray(positions, ray * 9 + 3);
        const outer = new Vector3().fromArray(positions, ray * 9 + 6);

        expect(inner.length()).toBeLessThan(middle.length());
        expect(middle.length()).toBeLessThan(outer.length());
        expect(inner.length()).toBeLessThan(0.2);
        expect(inner.clone().normalize().dot(outer.clone().normalize())).toBeGreaterThan(
          0.999
        );
        expect(outer.length() - inner.length()).toBeGreaterThan(0.4);
        expect(Math.abs(outer.z)).toBeLessThan(0.18);
        const angle = Math.atan2(outer.y, outer.x);
        occupiedSectors.add(
          Math.floor((((angle + Math.PI) / (Math.PI * 2)) * 8) % 8)
        );
      }
      expect(occupiedSectors.size).toBe(8);
    }
  );

  it("connects every complete particle trail into a bright radial ray", () => {
    const particles = createFireworkParticlePositions(28, 1701);
    const segments = createFireworkRaySegmentPositions(particles);

    expect(segments).toHaveLength(Math.floor(28 / 3) * 6);
    for (let ray = 0; ray < Math.floor(28 / 3); ray += 1) {
      expect(Array.from(segments.slice(ray * 6, ray * 6 + 3))).toEqual(
        Array.from(particles.slice(ray * 9, ray * 9 + 3))
      );
      expect(Array.from(segments.slice(ray * 6 + 3, ray * 6 + 6))).toEqual(
        Array.from(particles.slice(ray * 9 + 6, ray * 9 + 9))
      );
    }
  });

  it("skips burst calculations while the night intensity is zero", () => {
    expect(
      calculateHanabiFrame({
        elapsedSeconds: 2,
        intensity: 0,
        trailSeconds: 1.15,
        reducedMotion: false
      })
    ).toEqual([]);
  });

  it("reuses one frame buffer across animation frames", () => {
    const buffer: HanabiBurstFrame[] = [];
    const first = calculateHanabiFrameInto(
      {
        elapsedSeconds: 11.2,
        intensity: 1,
        trailSeconds: 1.15,
        reducedMotion: false
      },
      buffer
    );
    const firstBurst = first[0];
    const second = calculateHanabiFrameInto(
      {
        elapsedSeconds: 11.3,
        intensity: 1,
        trailSeconds: 1.15,
        reducedMotion: false
      },
      buffer
    );

    expect(second).toBe(first);
    expect(second[0]).toBe(firstBurst);
  });

  it("overlaps six to ten visible bursts once full night is established", () => {
    const frame = calculateHanabiFrame({
      elapsedSeconds: 11.2,
      intensity: 1,
      trailSeconds: 1.15,
      reducedMotion: false
    });
    const visibleBursts = frame.filter((burst) => burst.opacity > 0);

    expect(visibleBursts.length).toBeGreaterThanOrEqual(6);
    expect(visibleBursts.length).toBeLessThanOrEqual(10);
  });

  it("holds at least six recognizable mobile bursts together for one second", () => {
    const medium = getSceneQuality({ level: "medium", reducedMotion: false });
    let currentStreak = 0;
    let longestStreak = 0;

    for (let elapsedSeconds = 10; elapsedSeconds < 15; elapsedSeconds += 0.05) {
      const visibleBursts = calculateHanabiFrame({
        elapsedSeconds,
        intensity: 1,
        trailSeconds: medium.fireworks.trailSeconds,
        reducedMotion: false
      }).filter((burst) => burst.opacity >= 0.08).length;
      currentStreak = visibleBursts >= 6 ? currentStreak + 0.05 : 0;
      longestStreak = Math.max(longestStreak, currentStreak);
    }

    expect(longestStreak).toBeGreaterThanOrEqual(1);
  });

  it("keeps expanded bursts small enough to remain separate on a mobile sky", () => {
    for (let elapsedSeconds = 10; elapsedSeconds < 15; elapsedSeconds += 0.05) {
      const frame = calculateHanabiFrame({
        elapsedSeconds,
        intensity: 1,
        trailSeconds: 1.15,
        reducedMotion: false
      });

      expect(Math.max(...frame.map((burst) => burst.scale))).toBeLessThanOrEqual(
        1.75
      );
    }
  });

  it("keeps at least one burst visible throughout the full-night cycle", () => {
    for (const trailSeconds of [0.35, 1.15]) {
      for (let elapsedSeconds = 10; elapsedSeconds < 15; elapsedSeconds += 0.05) {
        const frame = calculateHanabiFrame({
          elapsedSeconds,
          intensity: 1,
          trailSeconds,
          reducedMotion: false
        });

        expect(
          frame.some((burst) => burst.opacity > 0.01),
          `no visible burst at ${elapsedSeconds.toFixed(2)}s with ${trailSeconds}s trails`
        ).toBe(true);
      }
    }
  });

  it("keeps the overlapping finale within its additive brightness budget", () => {
    const frame = calculateHanabiFrame({
      elapsedSeconds: 11.2,
      intensity: 1,
      trailSeconds: 1.15,
      reducedMotion: false
    });
    const combinedOpacity = frame.reduce(
      (total, burst) => total + burst.opacity,
      0
    );

    expect(combinedOpacity).toBeLessThanOrEqual(3.6);
  });

  it("projects the four main burst colors onto the river without cloning every particle", () => {
    const bursts = calculateHanabiFrame({
      elapsedSeconds: 11.2,
      intensity: 1,
      trailSeconds: 1.15,
      reducedMotion: false
    });
    const buffer: HanabiReflectionFrame[] = [];
    const first = calculateHanabiReflectionFrameInto(bursts, buffer);
    const firstReflection = first[0];
    const second = calculateHanabiReflectionFrameInto(bursts, buffer);

    expect(first).toBe(buffer);
    expect(second).toBe(first);
    expect(second[0]).toBe(firstReflection);
    expect(second).toHaveLength(4);
    expect(second.map((reflection) => reflection.color)).toEqual([
      "#f6bd55",
      "#ff786d",
      "#f39abc",
      "#9dd9ff"
    ]);
    expect(second.filter((reflection) => reflection.opacity > 0)).toHaveLength(4);
    expect(second.every((reflection) => reflection.opacity <= 0.32)).toBe(true);
  });

  it("uses only a soft scale pulse when reduced motion is requested", () => {
    const early = calculateHanabiFrame({
      elapsedSeconds: 10.1,
      intensity: 1,
      trailSeconds: 0.35,
      reducedMotion: true
    }).find((burst) => burst.id === "gold-crown-left");
    const later = calculateHanabiFrame({
      elapsedSeconds: 10.8,
      intensity: 1,
      trailSeconds: 0.35,
      reducedMotion: true
    }).find((burst) => burst.id === "gold-crown-left");

    expect(Math.abs((later?.scale ?? 0) - (early?.scale ?? 0))).toBeLessThan(
      0.3
    );
  });

  it("fades reduced-motion bursts in without a first-frame flash", () => {
    const opacityAt = (elapsedSeconds: number) =>
      calculateHanabiFrame({
        elapsedSeconds,
        intensity: 1,
        trailSeconds: 0.35,
        reducedMotion: true
      }).find((burst) => burst.id === "gold-crown-left")?.opacity ?? 0;

    expect(opacityAt(10)).toBe(0);
    expect(opacityAt(10.1)).toBeGreaterThan(0);
    expect(opacityAt(10.1)).toBeLessThan(opacityAt(10.4));
  });

  it("keeps the finale sequence at every quality while quality trims each burst", () => {
    const high = getSceneQuality({ level: "high", reducedMotion: false });
    const low = getSceneQuality({ level: "low", reducedMotion: false });
    const highFrame = calculateHanabiFrame({
      elapsedSeconds: 11.2,
      intensity: 1,
      trailSeconds: high.fireworks.trailSeconds,
      reducedMotion: false
    });
    const lowFrame = calculateHanabiFrame({
      elapsedSeconds: 11.2,
      intensity: 1,
      trailSeconds: low.fireworks.trailSeconds,
      reducedMotion: false
    });

    expect(lowFrame.map((burst) => burst.id)).toEqual(
      highFrame.map((burst) => burst.id)
    );
    expect(lowFrame.filter((burst) => burst.opacity > 0).length).toBeGreaterThanOrEqual(2);
    expect(lowFrame.filter((burst) => burst.opacity > 0).length).toBeLessThanOrEqual(
      highFrame.filter((burst) => burst.opacity > 0).length
    );
    expect(low.fireworks.particlesPerBurst).toBeLessThan(
      high.fireworks.particlesPerBurst
    );
    expect(low.fireworks.trailSeconds).toBeLessThan(
      high.fireworks.trailSeconds
    );
  });
});
