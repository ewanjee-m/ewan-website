import { describe, expect, it } from "vitest";
import {
  RPG_CANONICAL_ROUTE,
  RPG_CANONICAL_ROUTE_STEERING,
  RPG_CANONICAL_ROUTE_TOLERANCE
} from "./fixtures/rpg-canonical-route";
import {
  advanceRpgRouteStallState,
  getRpgRouteBrakeRadius,
  getRpgRouteReleaseLeadDistance,
  medianRpgRoutePulse,
  mergeRpgRoutePulseFeedback,
  planRpgRoutePulse,
  rankRpgRouteKeyboardPulses,
  rankRpgRouteKeyboardPulsesByRadius,
  runBalancedRpgRouteKeyboardPulse,
  selectRpgRouteKeyboardPulse,
  RPG_ROUTE_STALL_FRAME_LIMIT
} from "./fixtures/rpg-route-steering";

function resultingDistance(
  distance: number,
  step: number,
  yawOffset: number
) {
  return Math.sqrt(
    distance ** 2 +
      step ** 2 -
      2 * distance * step * Math.cos(yawOffset)
  );
}

describe("RPG route closed-loop steering", () => {
  it("keeps constrained steering inside safe corridors while preserving every canonical vertex", () => {
    expect(RPG_CANONICAL_ROUTE_STEERING).toHaveLength(
      RPG_CANONICAL_ROUTE.length
    );
    for (const [index, steering] of RPG_CANONICAL_ROUTE_STEERING.entries()) {
      const canonical = RPG_CANONICAL_ROUTE[index];
      expect(
        Math.hypot(
          steering[0] - canonical[0],
          steering[1] - canonical[1]
        )
      ).toBeLessThanOrEqual(RPG_CANONICAL_ROUTE_TOLERANCE);
    }
    expect(RPG_CANONICAL_ROUTE_STEERING[2][0]).toBeGreaterThan(-29);
    expect(RPG_CANONICAL_ROUTE_STEERING[3][0]).toBeGreaterThan(-29);
    expect(RPG_CANONICAL_ROUTE_STEERING[3][1]).toBeLessThan(20);
    expect(RPG_CANONICAL_ROUTE_STEERING[4][1]).toBeLessThan(20);
    expect(RPG_CANONICAL_ROUTE_STEERING[7][0]).toBeGreaterThan(-8);
    expect(RPG_CANONICAL_ROUTE_STEERING[8][0]).toBeGreaterThan(-8);
    expect(RPG_CANONICAL_ROUTE_STEERING[12][1]).toBeGreaterThan(-18);
    expect(RPG_CANONICAL_ROUTE_STEERING[13][1]).toBeGreaterThan(-18);
  });

  it.each([
    { distance: 1, step: 0.2, expected: 0.8 },
    { distance: 0.49, step: 0.475, expected: 0.025 },
    { distance: 0.0535, step: 0.475, expected: 0.475 }
  ])(
    "plans the exact circle-law radius for distance=$distance step=$step",
    ({ distance, step, expected }) => {
      const plan = planRpgRoutePulse({
        distance,
        predictedStep: step,
        tolerance: 0.05,
        directYaw: 0,
        mirrorSign: 1
      });
      expect(plan.desiredNextDistance).toBeCloseTo(expected, 12);
      expect(
        resultingDistance(distance, step, plan.candidates[0])
      ).toBeCloseTo(expected, 10);
    }
  );

  it("stages the localized 0.0535 miss before an equal return pulse", () => {
    const first = planRpgRoutePulse({
      distance: 0.0535,
      predictedStep: 0.475,
      tolerance: 0.05,
      directYaw: 0,
      mirrorSign: 1
    });
    const staged = resultingDistance(
      0.0535,
      0.475,
      first.candidates[0]
    );
    const second = planRpgRoutePulse({
      distance: staged,
      predictedStep: 0.475,
      tolerance: 0.05,
      directYaw: 0,
      mirrorSign: -1
    });
    expect(staged).toBeCloseTo(0.475, 10);
    expect(second.desiredNextDistance).toBeLessThanOrEqual(0.025);
  });

  it("feeds actual displacement back into the next prediction and brake radius", () => {
    expect(medianRpgRoutePulse([0.475, 0.02683], 0.1)).toBe(0.475);
    expect(
      medianRpgRoutePulse([0.475, 0.02683, 0.031], 0.1)
    ).toBe(0.031);
    expect(getRpgRouteBrakeRadius([0.475, 0.02683])).toBe(0.95);
    expect(getRpgRouteBrakeRadius([])).toBe(0.6);
  });

  it("waits for the first actual vertex crossing before keyup carry is sampled", () => {
    const lead = getRpgRouteReleaseLeadDistance({
      carrySamples: [],
      lastStep: 0.07087,
      tolerance: 0.05
    });
    expect(lead).toBe(0.05);
    expect(0.120335).toBeGreaterThan(lead);
    expect(0.049465).toBeLessThanOrEqual(lead);
  });

  it("uses cruise feedback instead of the 0.1 fallback after a stalled cruise", () => {
    const fakeCruiseResult = {
      outcome: "stalled",
      recentSteps: [0.02683, 0.02681, 0.02682]
    } as const;
    const feedback = mergeRpgRoutePulseFeedback(
      [],
      fakeCruiseResult.recentSteps
    );
    expect(medianRpgRoutePulse(feedback, 0.1)).toBe(0.02682);
  });

  it("closes the observed 0.075374 miss with the measured Chromium frame step", () => {
    const distance = 0.075374;
    const step = 0.02682;
    const plan = planRpgRoutePulse({
      distance,
      predictedStep: step,
      tolerance: 0.05,
      directYaw: 0,
      mirrorSign: 1
    });
    expect(plan.candidates[0]).toBeCloseTo(0, 6);
    expect(
      resultingDistance(distance, step, plan.candidates[0])
    ).toBeLessThanOrEqual(0.05);
  });

  it("selects the best normalized camera-relative key vector across yaw wraparound", () => {
    const cameraYaw = Math.PI - 0.02;
    const desiredYaw = -Math.PI + Math.PI / 4 - 0.02;
    const pulse = selectRpgRouteKeyboardPulse(cameraYaw, desiredYaw);
    expect(pulse.keys).toEqual(["d", "w"]);
    expect(Math.hypot(pulse.inputX, pulse.inputY)).toBeCloseTo(1, 12);
    expect(pulse.alignment).toBeCloseTo(1, 12);
    expect(pulse).not.toHaveProperty("cameraYaw");
  });

  it("chooses the maximum-dot octant for a direction between cardinal inputs", () => {
    const pulse = selectRpgRouteKeyboardPulse(0, 0.7);
    expect(pulse.keys).toEqual(["d", "w"]);
    expect(pulse.alignment).toBeGreaterThan(Math.cos(0.7));
    expect(pulse.alignment).toBeGreaterThan(Math.sin(0.7));
  });

  it("offers adjacent diagonal pulses after a blocked cardinal without duplicates", () => {
    const ranked = rankRpgRouteKeyboardPulses(0, 0.321);
    expect(ranked.map(({ keys }) => keys.join("+"))).toEqual([
      "w",
      "d+w",
      "a+w",
      "d",
      "a",
      "d+s",
      "a+s",
      "s"
    ]);
    expect(new Set(ranked.map(({ keys }) => keys.join("+"))).size).toBe(8);
  });

  it("converges the final Hanabi lattice miss by predicted radius within 0.05", () => {
    let targetDeltaX = 26 - 26.083183047735368;
    let targetDeltaZ = -18 - -18.057197812818355;
    const cameraYaw = 2.6861551114382047;
    const predictedStep = 1.9 / 24;
    let mirrorSign: -1 | 1 = 1;
    for (let pulse = 0; pulse < 8; pulse += 1) {
      const distance = Math.hypot(targetDeltaX, targetDeltaZ);
      if (distance <= 0.05) break;
      const directYaw = Math.atan2(targetDeltaX, targetDeltaZ);
      const plan = planRpgRoutePulse({
        distance,
        predictedStep,
        tolerance: 0.05,
        directYaw,
        mirrorSign
      });
      mirrorSign = mirrorSign === 1 ? -1 : 1;
      const [best] = rankRpgRouteKeyboardPulsesByRadius({
        cameraYaw,
        desiredWorldYaw: plan.candidates[0],
        targetDeltaX,
        targetDeltaZ,
        predictedStep,
        desiredNextDistance: plan.desiredNextDistance
      });
      targetDeltaX -= best.worldX * predictedStep;
      targetDeltaZ -= best.worldZ * predictedStep;
    }
    expect(Math.hypot(targetDeltaX, targetDeltaZ)).toBeLessThanOrEqual(
      0.05
    );
  });

  it("balances every keydown with keyup when a pulse is blocked or throws", async () => {
    for (const outcome of ["blocked", "error"] as const) {
      const events: string[] = [];
      const observe = async () => {
        if (outcome === "error") throw new Error("observe failed");
        return false;
      };
      const operation = runBalancedRpgRouteKeyboardPulse({
        keys: ["d", "w"],
        keyDown: async (key) => {
          events.push(`down:${key}`);
        },
        keyUp: async (key) => {
          events.push(`up:${key}`);
        },
        observe
      });
      if (outcome === "error") {
        await expect(operation).rejects.toThrow("observe failed");
      } else {
        await expect(operation).resolves.toBe(false);
      }
      expect(events).toEqual([
        "down:d",
        "down:w",
        "up:w",
        "up:d"
      ]);
    }
  });

  it("declares a cruise stall after eight unchanged RAF samples and resets on movement", () => {
    let state = {
      position: "1,0,1",
      unchangedFrames: 0,
      stalled: false
    };
    for (let frame = 0; frame < RPG_ROUTE_STALL_FRAME_LIMIT - 1; frame += 1) {
      state = advanceRpgRouteStallState(
        state.position,
        "1,0,1",
        state.unchangedFrames
      );
      expect(state.stalled).toBe(false);
    }
    state = advanceRpgRouteStallState(
      state.position,
      "1,0,1",
      state.unchangedFrames
    );
    expect(state.stalled).toBe(true);
    expect(
      advanceRpgRouteStallState(
        state.position,
        "1.1,0,1",
        state.unchangedFrames
      )
    ).toEqual({
      position: "1.1,0,1",
      unchangedFrames: 0,
      stalled: false
    });
  });
});
