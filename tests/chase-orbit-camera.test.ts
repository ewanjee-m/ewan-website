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
    // High enough to look down over the town, short of straight overhead where
    // the up vector would flip.
    expect(mouse.pitch).toBeCloseTo((74 * Math.PI) / 180);

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
    expect(touch.pitch).toBeCloseTo(0);
  });

  it("returns within 5 degrees once the visitor walks on", () => {
    const state = createChaseOrbitCameraState();
    state.yaw = Math.PI / 2;
    state.lastManualInputSeconds = 0;
    // Walking straight ahead ends the grace a drag bought, so the view is
    // already on its way back before the 3.5 seconds are up.
    advanceChaseOrbitCamera(state, {
      deltaSeconds: 3.499,
      elapsedSeconds: 3.499,
      drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
      moving: false,
      movementIntent: { x: 0, y: 0 },
      headingYaw: 0,
      navigationRegion: gyukatsuRegion
    });
    expect(state.yaw).toBeCloseTo(Math.PI / 2, 10);

    for (let frame = 0; frame < 420; frame += 1) {
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        elapsedSeconds: 3.5 + (frame + 1) / 60,
        drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
        moving: true,
        movementIntent: { x: 0, y: 1 },
        headingYaw: 0,
        navigationRegion: gyukatsuRegion
      });
    }

    expect(3.5 + 420 / 60).toBe(10.5);
    expect(Math.abs(state.yaw)).toBeLessThanOrEqual((5 * Math.PI) / 180);
  });

  it("holds the view still while the visitor walks sideways", () => {
    // Modelled the way the runtime actually couples the two: the heading is
    // the camera's yaw plus the angle of the key held, never a fixed bearing.
    // Feeding a constant heading here would assert a convergence the runtime
    // cannot produce, and did — it green-lit a camera that walked the visitor
    // in a closed circle.
    const state = createChaseOrbitCameraState();
    state.lastManualInputSeconds = 0;
    const intent = { x: -1, y: 0 };
    const intentAngle = Math.atan2(intent.x, intent.y);
    const startYaw = state.yaw;

    for (let frame = 0; frame < 480; frame += 1) {
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        elapsedSeconds: 3.5 + (frame + 1) / 60,
        drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
        moving: true,
        movementIntent: intent,
        headingYaw: state.yaw + intentAngle,
        navigationRegion: gyukatsuRegion
      });
    }

    expect(state.yaw).toBeCloseTo(startYaw, 10);
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
