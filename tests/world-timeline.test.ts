import { describe, expect, it } from "vitest";
import {
  createWorldTimeline,
  createWorldTimelineSnapshot
} from "../app/world/WorldTimeline";

describe("world timeline", () => {
  it("reuses a caller-owned snapshot during the animation loop", () => {
    const timeline = createWorldTimeline();
    const snapshot = createWorldTimelineSnapshot();

    expect(timeline.readSnapshot(snapshot)).toBe(snapshot);
    timeline.advance(7);
    expect(timeline.readSnapshot(snapshot)).toBe(snapshot);
    expect(snapshot).toEqual({
      phase: "night",
      progress: 0.25,
      fireworksIntensity: 0.25
    });
  });

  it("moves through the 10-second evening sequence and then holds at full night", () => {
    const timeline = createWorldTimeline();
    const samples = [
      {
        at: 0,
        phase: "lateAfternoon",
        progress: 0,
        fireworksIntensity: 0
      },
      {
        at: 1,
        phase: "lateAfternoon",
        progress: 0.5,
        fireworksIntensity: 0
      },
      { at: 2, phase: "sunset", progress: 0, fireworksIntensity: 0 },
      { at: 3, phase: "sunset", progress: 0.5, fireworksIntensity: 0 },
      { at: 4, phase: "blueEvening", progress: 0, fireworksIntensity: 0 },
      {
        at: 5,
        phase: "blueEvening",
        progress: 0.5,
        fireworksIntensity: 0
      },
      { at: 6, phase: "night", progress: 0, fireworksIntensity: 0 },
      { at: 8, phase: "night", progress: 0.5, fireworksIntensity: 0.5 },
      { at: 10, phase: "night", progress: 1, fireworksIntensity: 1 },
      { at: 30, phase: "night", progress: 1, fireworksIntensity: 1 }
    ] as const;
    let elapsedSeconds = 0;

    for (const sample of samples) {
      timeline.advance(sample.at - elapsedSeconds);
      elapsedSeconds = sample.at;

      expect(timeline.getSnapshot()).toEqual({
        phase: sample.phase,
        progress: sample.progress,
        fireworksIntensity: sample.fireworksIntensity
      });
    }
  });
});
