import { describe, expect, it } from "vitest";
import {
  createPanoramaPlayerDirectionState,
  PLAYER_DIRECTION_SWITCH_RATIO,
  updatePanoramaPlayerDirection
} from "../app/world/PanoramaPlayerDirection";

describe("panorama player direction", () => {
  it("uses the side sprite and flips it for left and right travel", () => {
    const state = createPanoramaPlayerDirectionState();

    updatePanoramaPlayerDirection(state, { x: 1, y: 0 }, true);
    expect(state).toEqual({ direction: "side", sideFacing: 1 });

    updatePanoramaPlayerDirection(state, { x: -1, y: 0 }, true);
    expect(state).toEqual({ direction: "side", sideFacing: -1 });
  });

  it("shows the back while entering the image and the front while returning", () => {
    const state = createPanoramaPlayerDirectionState();

    updatePanoramaPlayerDirection(state, { x: 0, y: 1 }, true);
    expect(state.direction).toBe("back");

    updatePanoramaPlayerDirection(state, { x: 0, y: -1 }, true);
    expect(state.direction).toBe("front");
  });

  it("keeps the last direction when input is released instead of snapping", () => {
    const state = createPanoramaPlayerDirectionState();
    updatePanoramaPlayerDirection(state, { x: -1, y: 0 }, true);
    updatePanoramaPlayerDirection(state, { x: 0, y: 0 }, false);

    expect(state).toEqual({ direction: "side", sideFacing: -1 });
  });

  it("uses the dominant axis for diagonal input", () => {
    const state = createPanoramaPlayerDirectionState();

    updatePanoramaPlayerDirection(state, { x: 0.8, y: 0.4 }, true);
    expect(state.direction).toBe("side");

    updatePanoramaPlayerDirection(state, { x: 0.2, y: 0.9 }, true);
    expect(state.direction).toBe("back");
  });

  it("keeps the current pose near diagonal boundaries instead of flickering", () => {
    const sideState = createPanoramaPlayerDirectionState();
    updatePanoramaPlayerDirection(sideState, { x: 1, y: 0 }, true);
    updatePanoramaPlayerDirection(sideState, { x: 0.65, y: 0.68 }, true);
    expect(sideState.direction).toBe("side");

    const backState = createPanoramaPlayerDirectionState();
    updatePanoramaPlayerDirection(backState, { x: 0, y: 1 }, true);
    updatePanoramaPlayerDirection(backState, { x: 0.68, y: 0.65 }, true);
    expect(backState.direction).toBe("back");
  });

  it("switches only after the competing camera-relative axis exceeds 1.16", () => {
    const sideState = createPanoramaPlayerDirectionState();
    updatePanoramaPlayerDirection(sideState, { x: 1, y: 0 }, true);
    updatePanoramaPlayerDirection(
      sideState,
      { x: 1, y: PLAYER_DIRECTION_SWITCH_RATIO },
      true
    );
    expect(sideState.direction).toBe("side");

    updatePanoramaPlayerDirection(sideState, { x: 1, y: 1.161 }, true);
    expect(sideState.direction).toBe("back");

    updatePanoramaPlayerDirection(
      sideState,
      { x: PLAYER_DIRECTION_SWITCH_RATIO, y: 1 },
      true
    );
    expect(sideState.direction).toBe("back");

    updatePanoramaPlayerDirection(sideState, { x: -1.161, y: 1 }, true);
    expect(sideState).toEqual({ direction: "side", sideFacing: -1 });
  });

  it("does not double-flip or jitter its single side-facing sign", () => {
    const state = createPanoramaPlayerDirectionState();
    updatePanoramaPlayerDirection(state, { x: -1, y: 0 }, true);

    for (const movement of [
      { x: -0.68, y: 0.65 },
      { x: -0.65, y: 0.68 },
      { x: -0.67, y: 0.66 }
    ]) {
      updatePanoramaPlayerDirection(state, movement, true);
      expect(state).toEqual({ direction: "side", sideFacing: -1 });
    }

    updatePanoramaPlayerDirection(state, { x: 0, y: 0 }, false);
    expect(state).toEqual({ direction: "side", sideFacing: -1 });
  });
});
