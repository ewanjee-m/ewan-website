import { describe, expect, it } from "vitest";
import {
  advanceChaseOrbitCamera,
  createChaseOrbitCameraState,
  getChaseOrbitCameraBasis,
  getChaseOrbitCameraOffset
} from "../app/world/ChaseOrbitCamera";
import {
  createWorldRuntime,
  resolveCameraRelativeDirection
} from "../app/world/WorldRuntime";

const YAWS = [0, 0.7, -1.3, 2.9, Math.PI, -Math.PI / 2];

const airportRegion = {
  kind: "zone",
  regionId: "airport",
  displayZoneId: "airport",
  highlightedZoneIds: ["airport"]
} as const;

function restingDrag() {
  return { deltaX: 0, deltaY: 0, pointerKind: "mouse" as const };
}

describe("chase camera basis", () => {
  it("places the camera behind the focus along its own forward direction", () => {
    for (const yaw of YAWS) {
      const pitch = 0.38;
      const distance = 8.4;
      const offset = getChaseOrbitCameraOffset(yaw, pitch, distance);
      const basis = getChaseOrbitCameraBasis(yaw);
      const horizontal = Math.cos(pitch) * distance;

      expect(offset[0]).toBeCloseTo(-basis.forwardX * horizontal, 10);
      expect(offset[2]).toBeCloseTo(-basis.forwardZ * horizontal, 10);
      expect(offset[1]).toBeCloseTo(Math.sin(pitch) * distance, 10);
    }
  });

  it("derives the right hand from the forward direction and world up", () => {
    for (const yaw of YAWS) {
      const basis = getChaseOrbitCameraBasis(yaw);
      // right = normalize(forward x up) with up = +Y, which for a direction on
      // the ground plane is (-forwardZ, 0, forwardX).
      expect(basis.rightX).toBeCloseTo(-basis.forwardZ, 10);
      expect(basis.rightZ).toBeCloseTo(basis.forwardX, 10);
      expect(
        basis.forwardX * basis.rightX + basis.forwardZ * basis.rightZ
      ).toBeCloseTo(0, 10);
      expect(Math.hypot(basis.forwardX, basis.forwardZ)).toBeCloseTo(1, 10);
      expect(Math.hypot(basis.rightX, basis.rightZ)).toBeCloseTo(1, 10);
    }
  });

  it("matches the three.js default view when the camera looks down -Z", () => {
    // A camera looking along -Z has +X on its right. The basis has to agree,
    // otherwise every left and right input in the world is mirrored.
    const basis = getChaseOrbitCameraBasis(Math.PI);
    expect(basis.forwardX).toBeCloseTo(0, 10);
    expect(basis.forwardZ).toBeCloseTo(-1, 10);
    expect(basis.rightX).toBeCloseTo(1, 10);
    expect(basis.rightZ).toBeCloseTo(0, 10);
  });
});

describe("camera relative movement", () => {
  it("walks away from the camera for forward input", () => {
    for (const yaw of YAWS) {
      const basis = getChaseOrbitCameraBasis(yaw);
      const direction = resolveCameraRelativeDirection(
        { x: 0, y: 1, runRequested: false },
        yaw
      );
      expect(direction.x).toBeCloseTo(basis.forwardX, 10);
      expect(direction.z).toBeCloseTo(basis.forwardZ, 10);
    }
  });

  it("carries a half-pushed stick at half pace", () => {
    // The stick is analogue, so a gentle push has to be a gentle walk rather
    // than the same stride at a different angle.
    const gentle = resolveCameraRelativeDirection(
      { x: 0, y: 0.5, runRequested: false },
      0.4
    );
    expect(gentle.strength).toBeCloseTo(0.5, 10);
    const full = resolveCameraRelativeDirection(
      { x: 0, y: 1, runRequested: false },
      0.4
    );
    expect(gentle.x).toBeCloseTo(full.x, 10);
    expect(gentle.z).toBeCloseTo(full.z, 10);
  });
});

/**
 * The visitor turns to face where they want to go and then walks there, and
 * the view sits behind their eyes throughout. What this replaced was a camera
 * that chased a heading which was itself derived from the camera: a sideways
 * key fed that loop and walked the visitor round a closed circle instead of
 * across the town.
 */
describe("turning and walking together", () => {
  function driveHeldInput(
    movement: { x: number; y: number },
    seconds: number
  ) {
    const runtime = createWorldRuntime();
    const camera = runtime.getCameraState();
    const startYaw = camera.yaw;
    const before = runtime.getNavigationSnapshot().position;
    const step = 1 / 60;
    let arcLength = 0;
    let previous = before;

    runtime.setMovement({ ...movement, runRequested: false });
    for (let frame = 0; frame < Math.round(seconds / step); frame += 1) {
      const snapshot = runtime.getNavigationSnapshot();
      advanceChaseOrbitCamera(camera, {
        deltaSeconds: step,
        drag: restingDrag(),
        turn: movement.x,
        navigationRegion: snapshot.navigationRegion,
        viewport: "desktop"
      });
      runtime.advance(step, camera.yaw);
      const now = runtime.getNavigationSnapshot().position;
      arcLength += Math.hypot(now[0] - previous[0], now[2] - previous[2]);
      previous = now;
    }

    const after = runtime.getNavigationSnapshot().position;
    return {
      yawWind: Math.abs(camera.yaw - startYaw),
      arcLength,
      travelled: Math.hypot(after[0] - before[0], after[2] - before[2])
    };
  }

  it("turns on the spot without carrying the visitor anywhere", () => {
    const held = driveHeldInput({ x: -1, y: 0 }, 1);
    expect(held.yawWind).toBeGreaterThan((100 * Math.PI) / 180);
    expect(held.arcLength).toBe(0);
    expect(held.travelled).toBe(0);
  });

  it("walks a straight line when only forward is held", () => {
    const held = driveHeldInput({ x: 0, y: 1 }, 2);
    expect(held.yawWind).toBe(0);
    expect(held.travelled).toBeGreaterThan(5);
    expect(held.travelled / held.arcLength).toBeGreaterThan(0.999);
  });

  it("curves rather than pirouettes when both are held", () => {
    // Holding forward and a turn together is how a visitor rounds a corner.
    // It has to cover ground, not spin them where they stand.
    const held = driveHeldInput({ x: 1, y: 1 }, 1);
    expect(held.arcLength).toBeGreaterThan(2);
    expect(held.yawWind).toBeGreaterThan((100 * Math.PI) / 180);
  });

  it("keeps the visitor's eyes and the view pointing the same way throughout", () => {
    const runtime = createWorldRuntime();
    const camera = runtime.getCameraState();
    const step = 1 / 60;

    for (const movement of [
      { x: 0, y: 1 },
      { x: -1, y: 0 },
      { x: 0.6, y: -1 },
      { x: 0, y: 0 }
    ]) {
      runtime.setMovement({ ...movement, runRequested: false });
      for (let frame = 0; frame < 40; frame += 1) {
        const snapshot = runtime.getNavigationSnapshot();
        advanceChaseOrbitCamera(camera, {
          deltaSeconds: step,
          drag: restingDrag(),
          turn: movement.x,
          navigationRegion: snapshot.navigationRegion,
          viewport: "desktop"
        });
        runtime.advance(step, camera.yaw);
        const heading = runtime.getNavigationSnapshot().heading;
        const basis = getChaseOrbitCameraBasis(camera.yaw);
        expect(heading[0]).toBeCloseTo(basis.forwardX, 10);
        expect(heading[2]).toBeCloseTo(basis.forwardZ, 10);
      }
    }
  });

  it("starts the visitor with their back to the camera", () => {
    const runtime = createWorldRuntime();
    const camera = runtime.getCameraState();
    const basis = getChaseOrbitCameraBasis(camera.yaw);
    const heading = runtime.getNavigationSnapshot().heading;
    expect(heading[0]).toBeCloseTo(basis.forwardX, 10);
    expect(heading[2]).toBeCloseTo(basis.forwardZ, 10);
  });

  it("lets the visitor look further up and down than a shallow sweep", () => {
    const state = createChaseOrbitCameraState();
    for (let frame = 0; frame < 90; frame += 1) {
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        drag: { deltaX: 0, deltaY: 40, pointerKind: "mouse" },
        navigationRegion: airportRegion,
        viewport: "desktop"
      });
    }
    // High enough to look down over the town, which a 55 degree ceiling cannot.
    expect((state.pitch * 180) / Math.PI).toBeGreaterThan(66);
  });

  it("leaves the resting state untouched when nothing is held", () => {
    const state = createChaseOrbitCameraState();
    const yaw = state.yaw;
    advanceChaseOrbitCamera(state, {
      deltaSeconds: 1 / 60,
      drag: restingDrag(),
      turn: 0,
      navigationRegion: airportRegion,
      viewport: "desktop"
    });
    expect(state.yaw).toBe(yaw);
  });
});
