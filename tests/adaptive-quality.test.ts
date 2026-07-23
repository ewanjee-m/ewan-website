import { describe, expect, it } from "vitest";
import { createAdaptiveQuality } from "../app/world/AdaptiveQuality";

function runFrames(
  quality: ReturnType<typeof createAdaptiveQuality>,
  fps: number,
  seconds: number
) {
  for (let frame = 0; frame < fps * seconds; frame += 1) {
    quality.recordFrame(1 / fps);
  }
}

describe("adaptive scene quality", () => {
  it("steps down after sustained low FPS and recovers more slowly", () => {
    const quality = createAdaptiveQuality({ initialLevel: "high" });

    runFrames(quality, 30, 4);
    expect(quality.getLevel()).toBe("medium");
    runFrames(quality, 30, 4);
    expect(quality.getLevel()).toBe("low");

    runFrames(quality, 60, 8);
    expect(quality.getLevel()).toBe("medium");
    runFrames(quality, 60, 8);
    expect(quality.getLevel()).toBe("high");
  });

  it("never recovers above the device's initial ceiling", () => {
    const quality = createAdaptiveQuality({ initialLevel: "medium" });

    runFrames(quality, 60, 20);

    expect(quality.getLevel()).toBe("medium");
  });
});
