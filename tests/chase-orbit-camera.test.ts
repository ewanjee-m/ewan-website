import { describe, expect, it } from "vitest";
import {
  advanceChaseOrbitCamera,
  createChaseOrbitCameraState,
  getChaseOrbitCameraDiagnostic,
  getRegionCameraProfile
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
      drag: { deltaX: 100, deltaY: 1000, pointerKind: "mouse" },
      navigationRegion: airportRegion
    });
    expect(mouse.yaw).toBeCloseTo(-0.4);
    // High enough to look down over the town, short of straight overhead where
    // the up vector would flip.
    expect(mouse.pitch).toBeCloseTo((74 * Math.PI) / 180);

    const touch = createChaseOrbitCameraState();
    advanceChaseOrbitCamera(touch, {
      deltaSeconds: 1 / 60,
      drag: { deltaX: 100, deltaY: -1000, pointerKind: "touch" },
      navigationRegion: airportRegion
    });
    expect(touch.yaw).toBeCloseTo(-0.6);
    expect(touch.pitch).toBeCloseTo(0);
  });

  it("turns where the visitor turns and nowhere else", () => {
    // The view is the visitor's facing rather than a chaser of it, so walking
    // never moves it and only a turn does.
    const state = createChaseOrbitCameraState();
    state.yaw = Math.PI / 2;
    for (let frame = 0; frame < 600; frame += 1) {
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
        turn: 0,
        navigationRegion: gyukatsuRegion
      });
    }
    expect(state.yaw).toBeCloseTo(Math.PI / 2, 10);

    advanceChaseOrbitCamera(state, {
      deltaSeconds: 0.5,
      drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
      turn: -1,
      navigationRegion: gyukatsuRegion
    });
    expect(state.yaw).toBeGreaterThan(Math.PI / 2);
  });

  it("uses exact region camera profiles", () => {
    expect(getRegionCameraProfile("airport", "desktop")).toMatchObject({
      distance: 8.4,
      pitchDegrees: 14,
      fovDegrees: 55
    });
    expect(getRegionCameraProfile("gyukatsu", "mobile").distance).toBeCloseTo(
      6.3
    );
    expect(getRegionCameraProfile("sakura", "mobile").fovDegrees).toBe(70);
    expect(getRegionCameraProfile("hanabi", "desktop").pitchDegrees).toBe(9);
    expect(getRegionCameraProfile("hanabi", "desktop").fovDegrees).toBe(60);
    expect(getRegionCameraProfile("hanabi", "mobile").fovDegrees).toBe(72);
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
    expect(profile.pitchDegrees).toBeCloseTo(14);
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
