import { describe, expect, it } from "vitest";
import {
  advanceChaseOrbitCamera,
  createChaseOrbitCameraState,
  getChaseOrbitCameraDiagnostic,
  getRegionCameraProfile,
  shortestCameraYawError
} from "../app/world/ChaseOrbitCamera";

const airportRegion = {
  kind: "zone",
  regionId: "airport",
  displayZoneId: "airport",
  highlightedZoneIds: ["airport"]
} as const;

const gyukatsuRegion = {
  kind: "zone",
  regionId: "gyukatsu",
  displayZoneId: "gyukatsu",
  highlightedZoneIds: ["gyukatsu"]
} as const;

describe("chase orbit camera", () => {
  it("clamps pitch and applies pointer-specific sensitivity", () => {
    const mouse = createChaseOrbitCameraState();
    advanceChaseOrbitCamera(mouse, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 1,
      drag: { deltaX: 100, deltaY: 1000, pointerKind: "mouse" },
      moving: false,
      headingYaw: 0,
      navigationRegion: airportRegion
    });
    expect(mouse.yaw).toBeCloseTo(-0.4);
    expect(mouse.pitch).toBeCloseTo((55 * Math.PI) / 180);

    const touch = createChaseOrbitCameraState();
    advanceChaseOrbitCamera(touch, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 1,
      drag: { deltaX: 100, deltaY: -1000, pointerKind: "touch" },
      moving: false,
      headingYaw: 0,
      navigationRegion: airportRegion
    });
    expect(touch.yaw).toBeCloseTo(-0.6);
    expect(touch.pitch).toBeCloseTo((18 * Math.PI) / 180);
  });

  it("waits 0.8s then returns within 5 degrees in 1.2s", () => {
    const state = createChaseOrbitCameraState();
    state.yaw = Math.PI / 2;
    state.lastManualInputSeconds = 0;
    advanceChaseOrbitCamera(state, {
      deltaSeconds: 0.799,
      elapsedSeconds: 0.799,
      drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
      moving: true,
      headingYaw: 0,
      navigationRegion: gyukatsuRegion
    });
    expect(state.yaw).toBeCloseTo(Math.PI / 2, 10);

    for (let frame = 0; frame < 72; frame += 1) {
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        elapsedSeconds: 0.8 + (frame + 1) / 60,
        drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
        moving: true,
        headingYaw: 0,
        navigationRegion: gyukatsuRegion
      });
    }

    expect(0.8 + 72 / 60).toBe(2);
    expect(Math.abs(state.yaw)).toBeLessThanOrEqual((5 * Math.PI) / 180);
  });

  it("uses exact region camera profiles", () => {
    expect(getRegionCameraProfile("airport", "desktop")).toMatchObject({
      distance: 8.4,
      pitchDegrees: 22,
      fovDegrees: 45
    });
    expect(getRegionCameraProfile("gyukatsu", "mobile").distance).toBeCloseTo(
      6.3
    );
    expect(getRegionCameraProfile("sakura", "mobile").fovDegrees).toBe(70);
  });

  it("smoothsteps camera values through a transition", () => {
    const profile = getRegionCameraProfile(
      {
        kind: "transition",
        regionId: "gyukatsu-to-sakura",
        transitionId: "gyukatsu-to-sakura",
        fromZoneId: "gyukatsu",
        toZoneId: "sakura",
        progress: 0.5,
        displayZoneId: "sakura",
        highlightedZoneIds: ["gyukatsu", "sakura"]
      },
      "desktop"
    );
    expect(profile.distance).toBeCloseTo(7.5);
    expect(profile.pitchDegrees).toBeCloseTo(23);
  });

  it("returns the signed shortest yaw error across the wrap boundary", () => {
    expect(
      shortestCameraYawError(Math.PI - 0.1, -Math.PI + 0.1)
    ).toBeCloseTo(0.2);
  });

  it("reports non-finite collision before persistent batched occlusion", () => {
    expect(
      getChaseOrbitCameraDiagnostic({
        collisionIsFinite: false,
        batchedOcclusionSeconds: 0.25
      })
    ).toBe("non-finite-collision");
    expect(
      getChaseOrbitCameraDiagnostic({
        collisionIsFinite: true,
        batchedOcclusionSeconds: 0.25
      })
    ).toBe("batched-occlusion");
    expect(
      getChaseOrbitCameraDiagnostic({
        collisionIsFinite: true,
        batchedOcclusionSeconds: 0.249
      })
    ).toBe("ok");
  });
});
