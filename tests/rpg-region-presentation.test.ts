import { describe, expect, it, vi } from "vitest";
import {
  applyRpgRegionAudioGains,
  createRpgRegionAudioGraph
} from "../app/world/RpgRegionAudio";
import {
  createRpgRegionPresentation,
  resolveRpgRegionPresentation,
  RPG_REGION_PRESENTATION_PROFILES
} from "../app/world/RpgRegionPresentation";
import type { NavigationRegion } from "../app/world/RpgWorldGeometry";

const transition = (progress: number): NavigationRegion => ({
  kind: "transition",
  regionId: "airport-to-tokyo",
  transitionId: "airport-to-tokyo",
  fromZoneId: "airport",
  toZoneId: "tokyo",
  progress,
  displayZoneId: progress < 0.5 ? "airport" : "tokyo",
  highlightedZoneIds: ["airport", "tokyo"]
});

describe("RPG region presentation", () => {
  it("uses smoothstep to blend every transition channel", () => {
    const target = createRpgRegionPresentation();

    resolveRpgRegionPresentation(transition(0.5), target);

    expect(target.zoneWeights).toEqual({
      airport: 0.5,
      tokyo: 0.5,
      gyukatsu: 0,
      sakura: 0,
      hanabi: 0
    });
    expect(target.decorationDensity).toBeCloseTo((0.55 + 1) / 2);
    expect(target.vegetationDensity).toBeCloseTo((0.15 + 0.25) / 2);
    expect(target.effectIntensity).toBeCloseTo((0.05 + 0.12) / 2);
    expect(target.ambienceVolume).toBeCloseTo((0.18 + 0.24) / 2);
    expect(target.audioGains.airport).toBeCloseTo(0.18 / 2);
    expect(target.audioGains.tokyo).toBeCloseTo(0.24 / 2);
    expect(target.audioGains.gyukatsu).toBe(0);
  });

  it("keeps all channels continuous at both transition endpoints", () => {
    for (const [progress, expectedZone] of [
      [0, "airport"],
      [1, "tokyo"]
    ] as const) {
      const target = createRpgRegionPresentation();
      resolveRpgRegionPresentation(transition(progress), target);
      const profile = RPG_REGION_PRESENTATION_PROFILES[expectedZone];

      expect(target.zoneWeights[expectedZone]).toBe(1);
      expect(target.sky.getHexString()).toBe(profile.sky.slice(1));
      expect(target.fog.getHexString()).toBe(profile.fog.slice(1));
      expect(target.decorationDensity).toBe(profile.decorationDensity);
      expect(target.vegetationDensity).toBe(profile.vegetationDensity);
      expect(target.effectIntensity).toBe(profile.effectIntensity);
      expect(target.ambienceVolume).toBe(profile.ambienceVolume);
      expect(target.audioGains[expectedZone]).toBe(profile.ambienceVolume);
    }
  });

  it("gives a zone full ownership and silences every unrelated channel", () => {
    const target = createRpgRegionPresentation();
    resolveRpgRegionPresentation(
      {
        kind: "zone",
        regionId: "sakura",
        displayZoneId: "sakura",
        highlightedZoneIds: ["sakura"]
      },
      target
    );

    expect(target.zoneWeights).toEqual({
      airport: 0,
      tokyo: 0,
      gyukatsu: 0,
      sakura: 1,
      hanabi: 0
    });
    expect(target.audioGains.sakura).toBe(
      RPG_REGION_PRESENTATION_PROFILES.sakura.ambienceVolume
    );
  });

  it("builds one procedural five-band graph and follows presentation gains", () => {
    const gainNodes: Array<{
      gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> };
      connect: ReturnType<typeof vi.fn>;
    }> = [];
    const filters: Array<{
      type: BiquadFilterType;
      frequency: { value: number };
      connect: ReturnType<typeof vi.fn>;
    }> = [];
    const sources: Array<{
      buffer: AudioBuffer | null;
      loop: boolean;
      connect: ReturnType<typeof vi.fn>;
      start: ReturnType<typeof vi.fn>;
      stop: ReturnType<typeof vi.fn>;
    }> = [];
    const samples = new Float32Array(96_000);
    const context = {
      sampleRate: 48_000,
      currentTime: 12,
      destination: {},
      createBuffer: vi.fn(() => ({
        getChannelData: () => samples
      })),
      createGain: vi.fn(() => {
        const node = {
          gain: { value: 0, setTargetAtTime: vi.fn() },
          connect: vi.fn()
        };
        gainNodes.push(node);
        return node;
      }),
      createBiquadFilter: vi.fn(() => {
        const node = {
          type: "lowpass" as BiquadFilterType,
          frequency: { value: 0 },
          connect: vi.fn()
        };
        filters.push(node);
        return node;
      }),
      createBufferSource: vi.fn(() => {
        const node = {
          buffer: null as AudioBuffer | null,
          loop: false,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn()
        };
        sources.push(node);
        return node;
      })
    } as unknown as AudioContext;

    const graph = createRpgRegionAudioGraph(context);
    const presentation = createRpgRegionPresentation();
    resolveRpgRegionPresentation(transition(0.5), presentation);
    applyRpgRegionAudioGains(graph, presentation);

    expect(context.createBuffer).toHaveBeenCalledWith(1, 96_000, 48_000);
    expect(filters.map(({ frequency }) => frequency.value)).toEqual([
      180, 260, 340, 520, 760
    ]);
    expect(sources).toHaveLength(5);
    expect(sources.every(({ loop, start }) => loop && start.mock.calls.length === 1))
      .toBe(true);
    expect(gainNodes[0].gain.value).toBe(0.35);
    expect(graph.gains.airport.gain.setTargetAtTime).toHaveBeenCalledWith(
      0.09, 12, 0.08
    );
    expect(graph.gains.tokyo.gain.setTargetAtTime).toHaveBeenCalledWith(
      0.12, 12, 0.08
    );
    expect(graph.gains.gyukatsu.gain.setTargetAtTime).toHaveBeenCalledWith(
      0, 12, 0.08
    );
  });
});
