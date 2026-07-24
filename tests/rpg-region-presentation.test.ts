import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Color, MeshStandardMaterial } from "three";

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn()
}));

import {
  applyRpgRegionAudioGains,
  createRpgRegionAudioGraph,
  RpgRegionAudio
} from "../app/world/RpgRegionAudio";
import {
  createRpgRegionPresentation,
  resolveRpgRegionPresentation,
  RPG_REGION_PRESENTATION_COLORS,
  RPG_REGION_PRESENTATION_PROFILES
} from "../app/world/RpgRegionPresentation";
import { applyRpgSakuraVisibility } from "../app/world/RpgSignatureLandmarks";
import type { NavigationRegion } from "../app/world/RpgWorldGeometry";

const ZONE_IDS = ["airport", "tokyo", "gyukatsu", "sakura", "hanabi"] as const;

const originalAudioContext = Object.getOwnPropertyDescriptor(
  window,
  "AudioContext"
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  FakeAudioContext.instances.length = 0;
  if (originalAudioContext) {
    Object.defineProperty(window, "AudioContext", originalAudioContext);
  } else {
    Reflect.deleteProperty(window, "AudioContext");
  }
});

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

class FakeAudioParam {
  value = 0;
  readonly setTargetAtTime = vi.fn();
}

class FakeGainNode {
  readonly gain = new FakeAudioParam();
  readonly connect = vi.fn();
}

class FakeBiquadFilterNode {
  type: BiquadFilterType = "lowpass";
  readonly frequency = new FakeAudioParam();
  readonly connect = vi.fn();
}

class FakeAudioBuffer {
  readonly samples: Float32Array;

  constructor(length: number) {
    this.samples = new Float32Array(length);
  }

  getChannelData() {
    return this.samples;
  }
}

class FakeAudioBufferSourceNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  readonly connect = vi.fn();
  readonly start = vi.fn();
  readonly stop = vi.fn();
}

class FakeAudioContext {
  static readonly instances: FakeAudioContext[] = [];
  readonly sampleRate = 48_000;
  readonly currentTime = 12;
  readonly destination = {};
  readonly buffers: FakeAudioBuffer[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly sources: FakeAudioBufferSourceNode[] = [];
  readonly close = vi.fn().mockResolvedValue(undefined);

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createBuffer(_channels: number, length: number, _sampleRate: number) {
    void _sampleRate;
    const buffer = new FakeAudioBuffer(length);
    this.buffers.push(buffer);
    return buffer as unknown as AudioBuffer;
  }

  createGain() {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createBiquadFilter() {
    const filter = new FakeBiquadFilterNode();
    this.filters.push(filter);
    return filter as unknown as BiquadFilterNode;
  }

  createBufferSource() {
    const source = new FakeAudioBufferSourceNode();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}

function expectedColor(from: string, to: string, amount: number) {
  return new Color(from).lerp(new Color(to), amount).getHexString();
}

describe("RPG region presentation", () => {
  it("uses smoothstep at 0.25 for every color, light, scalar, weight, and gain", () => {
    const target = createRpgRegionPresentation();
    const from = RPG_REGION_PRESENTATION_PROFILES.airport;
    const to = RPG_REGION_PRESENTATION_PROFILES.tokyo;
    const t = 0.25 * 0.25 * (3 - 2 * 0.25);

    resolveRpgRegionPresentation(transition(0.25), target);

    expect(t).toBe(0.15625);
    for (const zoneId of ZONE_IDS) {
      const expectedWeight =
        zoneId === "airport" ? 1 - t : zoneId === "tokyo" ? t : 0;
      expect(target.zoneWeights[zoneId], `${zoneId}:weight`).toBeCloseTo(
        expectedWeight
      );
      expect(target.audioGains[zoneId], `${zoneId}:gain`).toBeCloseTo(
        expectedWeight *
          RPG_REGION_PRESENTATION_PROFILES[zoneId].ambienceVolume
      );
    }
    expect(target.sky.getHexString()).toBe(expectedColor(from.sky, to.sky, t));
    expect(target.fog.getHexString()).toBe(expectedColor(from.fog, to.fog, t));
    expect(target.key.getHexString()).toBe(expectedColor(from.key, to.key, t));
    expect(target.fill.getHexString()).toBe(expectedColor(from.fill, to.fill, t));
    expect(target.keyIntensity).toBeCloseTo(
      from.keyIntensity + (to.keyIntensity - from.keyIntensity) * t
    );
    expect(target.fillIntensity).toBeCloseTo(
      from.fillIntensity + (to.fillIntensity - from.fillIntensity) * t
    );
    expect(target.decorationDensity).toBeCloseTo(
      from.decorationDensity + (to.decorationDensity - from.decorationDensity) * t
    );
    expect(target.vegetationDensity).toBeCloseTo(
      from.vegetationDensity + (to.vegetationDensity - from.vegetationDensity) * t
    );
    expect(target.effectIntensity).toBeCloseTo(
      from.effectIntensity + (to.effectIntensity - from.effectIntensity) * t
    );
    expect(target.ambienceVolume).toBeCloseTo(
      from.ambienceVolume + (to.ambienceVolume - from.ambienceVolume) * t
    );
    expect(target.audioGains.airport).toBeCloseTo((1 - t) * from.ambienceVolume);
    expect(target.audioGains.tokyo).toBeCloseTo(t * to.ambienceVolume);
  });

  it("matches every source and destination channel at transition endpoints", () => {
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
      expect(target.key.getHexString()).toBe(profile.key.slice(1));
      expect(target.fill.getHexString()).toBe(profile.fill.slice(1));
      expect(target.keyIntensity).toBe(profile.keyIntensity);
      expect(target.fillIntensity).toBe(profile.fillIntensity);
      expect(target.decorationDensity).toBe(profile.decorationDensity);
      expect(target.vegetationDensity).toBe(profile.vegetationDensity);
      expect(target.effectIntensity).toBe(profile.effectIntensity);
      expect(target.ambienceVolume).toBe(profile.ambienceVolume);
      for (const zoneId of ZONE_IDS) {
        const expectedWeight = zoneId === expectedZone ? 1 : 0;
        expect(
          target.zoneWeights[zoneId],
          `${progress}:${zoneId}:weight`
        ).toBe(expectedWeight);
        expect(
          target.audioGains[zoneId],
          `${progress}:${zoneId}:gain`
        ).toBe(
          expectedWeight *
            RPG_REGION_PRESENTATION_PROFILES[zoneId].ambienceVolume
        );
      }
    }
  });

  it("reuses caller-owned and precomputed Color identities across frames", () => {
    const target = createRpgRegionPresentation();
    const targetColors = [target.sky, target.fog, target.key, target.fill];
    const profileColors = RPG_REGION_PRESENTATION_COLORS.airport;
    const profileIdentities = [
      profileColors.sky,
      profileColors.fog,
      profileColors.key,
      profileColors.fill
    ];
    const profileHex = profileIdentities.map((color) => color.getHexString());

    for (const progress of [0.1, 0.25, 0.6, 0.9]) {
      resolveRpgRegionPresentation(transition(progress), target);
    }

    expect(target.sky).toBe(targetColors[0]);
    expect(target.fog).toBe(targetColors[1]);
    expect(target.key).toBe(targetColors[2]);
    expect(target.fill).toBe(targetColors[3]);
    expect(profileColors.sky).toBe(profileIdentities[0]);
    expect(profileColors.fog).toBe(profileIdentities[1]);
    expect(profileColors.key).toBe(profileIdentities[2]);
    expect(profileColors.fill).toBe(profileIdentities[3]);
    expect(profileIdentities.map((color) => color.getHexString())).toEqual(profileHex);
  });

  it("sets Sakura trunk and canopy opacity to the exact presentation visibility", () => {
    const trunk = new MeshStandardMaterial();
    const canopy = new MeshStandardMaterial();
    const presentation = createRpgRegionPresentation();

    applyRpgSakuraVisibility([trunk, canopy], presentation);
    expect(trunk.opacity).toBe(0);
    expect(canopy.opacity).toBe(0);
    expect(trunk.transparent).toBe(true);
    expect(canopy.transparent).toBe(true);

    resolveRpgRegionPresentation(
      {
        kind: "zone",
        regionId: "sakura",
        displayZoneId: "sakura",
        highlightedZoneIds: ["sakura"]
      },
      presentation
    );
    applyRpgSakuraVisibility([trunk, canopy], presentation);
    expect(trunk.opacity).toBe(1);
    expect(canopy.opacity).toBe(1);
    expect(trunk.transparent).toBe(false);
    expect(canopy.transparent).toBe(false);
  });

  it("builds one deterministic five-band graph and applies smoothstep gains", () => {
    const context = new FakeAudioContext();
    const graph = createRpgRegionAudioGraph(context as unknown as AudioContext);
    const presentation = createRpgRegionPresentation();
    resolveRpgRegionPresentation(transition(0.25), presentation);
    applyRpgRegionAudioGains(graph, presentation);

    expect(context.buffers[0].samples).toHaveLength(96_000);
    expect(context.filters.map(({ frequency }) => frequency.value)).toEqual([
      180, 260, 340, 520, 760
    ]);
    expect(context.sources.every(({ loop, start }) =>
      loop && start.mock.calls.length === 1
    )).toBe(true);
    expect(context.gains[0].gain.value).toBe(0.35);
    expect(graph.gains.airport.gain.setTargetAtTime).toHaveBeenCalledWith(
      presentation.audioGains.airport, 12, 0.08
    );
    expect(graph.gains.tokyo.gain.setTargetAtTime).toHaveBeenCalledWith(
      presentation.audioGains.tokyo, 12, 0.08
    );
  });

  it("stays silent before a gesture and stops/closes the graph on unmount", () => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: FakeAudioContext
    });
    const presentation = createRpgRegionPresentation();
    const view = render(
      createElement(RpgRegionAudio, {
        presentation: { current: presentation }
      })
    );

    expect(FakeAudioContext.instances).toHaveLength(0);
    fireEvent.pointerDown(window);
    expect(FakeAudioContext.instances).toHaveLength(1);
    const context = FakeAudioContext.instances[0];
    expect(context.sources).toHaveLength(5);

    view.unmount();
    expect(context.sources.every(({ stop }) => stop.mock.calls.length === 1))
      .toBe(true);
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it("removes both gesture listeners when unmounted before activation", () => {
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: FakeAudioContext
    });
    const remove = vi.spyOn(window, "removeEventListener");
    const view = render(
      createElement(RpgRegionAudio, {
        presentation: { current: createRpgRegionPresentation() }
      })
    );

    view.unmount();
    expect(remove).toHaveBeenCalledWith("pointerdown", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
    fireEvent.keyDown(window, { key: "Enter" });
    expect(FakeAudioContext.instances).toHaveLength(0);
  });
});
