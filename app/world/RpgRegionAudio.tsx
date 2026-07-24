"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import type { DestinationId } from "../guide/GuideContract";
import type { RpgRegionPresentationState } from "./RpgRegionPresentation";

const ZONE_IDS: readonly DestinationId[] = [
  "airport",
  "tokyo",
  "gyukatsu",
  "sakura",
  "hanabi"
];
const FILTER_FREQUENCIES = [180, 260, 340, 520, 760] as const;

export interface RpgRegionAudioGraph {
  readonly context: AudioContext;
  readonly sources: readonly AudioBufferSourceNode[];
  readonly gains: Readonly<Record<DestinationId, GainNode>>;
  readonly master: GainNode;
}

export function createRpgRegionAudioGraph(context: AudioContext): RpgRegionAudioGraph {
  const frameCount = context.sampleRate * 2;
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x12345678;
  for (let index = 0; index < samples.length; index += 1) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    samples[index] = (seed / 0xffffffff) * 2 - 1;
  }

  const master = context.createGain();
  master.gain.value = 0.35;
  master.connect(context.destination);
  const gains = {} as Record<DestinationId, GainNode>;
  const sources = ZONE_IDS.map((zoneId, index) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = FILTER_FREQUENCIES[index];
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    gains[zoneId] = gain;
    return source;
  });
  return { context, sources, gains, master };
}

export function applyRpgRegionAudioGains(
  graph: RpgRegionAudioGraph,
  presentation: RpgRegionPresentationState
) {
  for (const zoneId of ZONE_IDS) {
    graph.gains[zoneId].gain.setTargetAtTime(
      presentation.audioGains[zoneId],
      graph.context.currentTime,
      0.08
    );
  }
}

export function RpgRegionAudio({
  presentation
}: {
  presentation: RefObject<RpgRegionPresentationState>;
}) {
  const graph = useRef<RpgRegionAudioGraph | null>(null);

  useEffect(() => {
    let disposed = false;
    const start = () => {
      if (disposed || graph.current || typeof window === "undefined") return;
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      graph.current = createRpgRegionAudioGraph(new AudioContextConstructor());
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      disposed = true;
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      const active = graph.current;
      graph.current = null;
      if (active) {
        for (const source of active.sources) source.stop();
        void active.context.close();
      }
    };
  }, []);

  useFrame(() => {
    if (graph.current) {
      applyRpgRegionAudioGains(graph.current, presentation.current);
    }
  }, -1);

  return null;
}
