import { describe, expect, it } from "vitest";
import { RPG_HANABI_BURSTS } from "../app/world/RpgHanabiLayout";
import { calculateActiveRpgFireworkFrame } from "../app/world/RpgWorldEffects";

describe("active RPG world effects", () => {
  it("expires a reduced trail before the full trail at the same active frame", () => {
    const burst = RPG_HANABI_BURSTS[0];
    const reduced = calculateActiveRpgFireworkFrame({
      elapsedSeconds: 0.95,
      burst,
      intensity: 1,
      trailSeconds: 0.5
    });
    const full = calculateActiveRpgFireworkFrame({
      elapsedSeconds: 0.95,
      burst,
      intensity: 1,
      trailSeconds: 1.15
    });

    expect(reduced).toEqual({ visible: false, opacity: 0 });
    expect(full.visible).toBe(true);
    expect(full.opacity).toBeGreaterThan(0);
  });
});
