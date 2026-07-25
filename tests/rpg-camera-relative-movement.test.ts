import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("walks toward the camera's right hand for right input", () => {
    for (const yaw of YAWS) {
      const basis = getChaseOrbitCameraBasis(yaw);
      const direction = resolveCameraRelativeDirection(
        { x: 1, y: 0, runRequested: false },
        yaw
      );
      expect(direction.x).toBeCloseTo(basis.rightX, 10);
      expect(direction.z).toBeCloseTo(basis.rightZ, 10);
    }
  });

  it("walks toward the camera's left hand for left input", () => {
    for (const yaw of YAWS) {
      const basis = getChaseOrbitCameraBasis(yaw);
      const direction = resolveCameraRelativeDirection(
        { x: -1, y: 0, runRequested: false },
        yaw
      );
      const alongRight = direction.x * basis.rightX + direction.z * basis.rightZ;
      expect(alongRight).toBeCloseTo(-1, 10);
    }
  });

  it("moves the runtime to the camera's left when the left key is held", () => {
    const yaw = 0;
    const basis = getChaseOrbitCameraBasis(yaw);
    const runtime = createWorldRuntime();
    const before = runtime.getNavigationSnapshot().position;
    runtime.setMovement({ x: -1, y: 0, runRequested: false });
    runtime.advance(0.2, yaw);
    const after = runtime.getNavigationSnapshot().position;

    const alongRight =
      (after[0] - before[0]) * basis.rightX +
      (after[2] - before[2]) * basis.rightZ;
    expect(alongRight).toBeLessThan(0);
  });
});

describe("chase camera recentering", () => {
  /**
   * Movement is resolved against the camera and the camera swings toward the
   * heading, so a lateral hold used to feed itself: the heading led the camera
   * by a quarter turn, the camera chased it, and the walk direction rotated
   * with it. The visitor spun on the spot instead of walking sideways.
   */
  function driveHeldInput(
    movement: { x: number; y: number },
    seconds: number
  ) {
    const runtime = createWorldRuntime();
    const camera = runtime.getCameraState();
    const startYaw = camera.yaw;
    const before = runtime.getNavigationSnapshot().position;
    const step = 1 / 60;
    let elapsed = 0;
    let arcLength = 0;
    let previous = before;

    runtime.setMovement({ ...movement, runRequested: false });
    for (let frame = 0; frame < Math.round(seconds / step); frame += 1) {
      elapsed += step;
      const snapshot = runtime.getNavigationSnapshot();
      advanceChaseOrbitCamera(camera, {
        deltaSeconds: step,
        elapsedSeconds: elapsed,
        drag: restingDrag(),
        moving: snapshot.moving,
        movementIntent: movement,
        headingYaw: Math.atan2(snapshot.heading[0], snapshot.heading[2]),
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

  /**
   * A chase camera's whole job is to keep the visitor's back to the viewer, so
   * it has to swing in behind them however they walk, not only when they walk
   * straight ahead. It just has to do it slowly: movement is resolved against
   * the camera, so a fast chase turns the walk with the view and the visitor
   * pirouettes instead of travelling. Slow enough and the same coupling reads
   * as a wide, natural curve.
   */
  /**
   * Movement is resolved against the camera, so a camera that chases the
   * heading can never catch it while a lateral key is held: the heading stays
   * a quarter turn ahead for as long as the key is down. Fast, that is a
   * pirouette. Slow, it is a circle. Either way the visitor ends up back where
   * they started, which is useless in a world they have to cross. Sideways
   * means sideways: the view holds still and the walk is a straight line.
   */
  it("walks a straight line when a lateral key is held", () => {
    for (const seconds of [2, 8]) {
      const held = driveHeldInput({ x: -1, y: 0 }, seconds);
      expect(held.yawWind).toBeLessThan((5 * Math.PI) / 180);
      // A straight walk covers its arc; a circle folds back on itself.
      expect(held.travelled / (held.arcLength ?? 1)).toBeGreaterThan(0.98);
    }
  });

  it("walks a straight line on a held diagonal too", () => {
    const held = driveHeldInput(
      { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
      8
    );
    expect(held.yawWind).toBeLessThan((5 * Math.PI) / 180);
    expect(held.travelled / (held.arcLength ?? 1)).toBeGreaterThan(0.98);
  });

  it("swings in behind the visitor once they walk straight ahead again", () => {
    // The camera is left pointing somewhere else, as a drag would leave it,
    // and the heading is derived from it exactly as the runtime does.
    const runtime = createWorldRuntime();
    const camera = runtime.getCameraState();
    camera.yaw = 1.2;
    camera.lastManualInputSeconds = 0;
    const movement = { x: 0, y: 1 };
    const step = 1 / 60;
    let elapsed = 0;

    runtime.setMovement({ ...movement, runRequested: false });
    for (let frame = 0; frame < 600; frame += 1) {
      elapsed += step;
      const snapshot = runtime.getNavigationSnapshot();
      advanceChaseOrbitCamera(camera, {
        deltaSeconds: step,
        elapsedSeconds: elapsed,
        drag: restingDrag(),
        moving: snapshot.moving,
        movementIntent: movement,
        headingYaw: Math.atan2(snapshot.heading[0], snapshot.heading[2]),
        navigationRegion: snapshot.navigationRegion,
        viewport: "desktop"
      });
      runtime.advance(step, camera.yaw);
    }

    const snapshot = runtime.getNavigationSnapshot();
    const headingYaw = Math.atan2(snapshot.heading[0], snapshot.heading[2]);
    expect(Math.abs(headingYaw - camera.yaw)).toBeLessThan(
      (5 * Math.PI) / 180
    );
  });

  it("still swings in behind the visitor when they walk forward", () => {
    const runtime = createWorldRuntime();
    const camera = runtime.getCameraState();
    camera.yaw = 1.2;
    const step = 1 / 60;
    let elapsed = 0;
    const movement = { x: 0, y: 1 };

    runtime.setMovement({ ...movement, runRequested: false });
    for (let frame = 0; frame < 180; frame += 1) {
      elapsed += step;
      const snapshot = runtime.getNavigationSnapshot();
      advanceChaseOrbitCamera(camera, {
        deltaSeconds: step,
        elapsedSeconds: elapsed,
        drag: restingDrag(),
        moving: snapshot.moving,
        movementIntent: movement,
        headingYaw: Math.atan2(snapshot.heading[0], snapshot.heading[2]),
        navigationRegion: snapshot.navigationRegion,
        viewport: "desktop"
      });
      runtime.advance(step, camera.yaw);
    }

    const snapshot = runtime.getNavigationSnapshot();
    const headingYaw = Math.atan2(snapshot.heading[0], snapshot.heading[2]);
    expect(Math.abs(camera.yaw - headingYaw)).toBeLessThan(
      (5 * Math.PI) / 180
    );
  });

  it("leaves a dragged view alone while the visitor is not walking on", () => {
    // Dragging is the visitor saying where they want to look. Pulling the view
    // back a heartbeat later takes the camera off them again.
    const state = createChaseOrbitCameraState();
    const drag = () =>
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        elapsedSeconds: 1,
        drag: { deltaX: -160, deltaY: 0, pointerKind: "mouse" },
        moving: true,
        movementIntent: { x: 0, y: 1 },
        headingYaw: 0,
        navigationRegion: airportRegion,
        viewport: "desktop"
      });
    drag();
    const chosenYaw = state.yaw;
    expect(Math.abs(chosenYaw)).toBeGreaterThan((20 * Math.PI) / 180);

    // Two seconds of standing and stepping sideways must not undo the choice.
    // Walking straight ahead is what asks for the view back, and it has its own
    // test below.
    for (let frame = 0; frame < 120; frame += 1) {
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        elapsedSeconds: 1 + (frame + 1) / 60,
        drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
        moving: true,
        movementIntent: { x: -1, y: 0 },
        headingYaw: 0,
        navigationRegion: airportRegion,
        viewport: "desktop"
      });
    }
    expect(state.yaw).toBeCloseTo(chosenYaw, 10);
  });

  it("lets the visitor look further up and down than a shallow sweep", () => {
    const state = createChaseOrbitCameraState();
    for (let frame = 0; frame < 90; frame += 1) {
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        elapsedSeconds: (frame + 1) / 60,
        drag: { deltaX: 0, deltaY: 40, pointerKind: "mouse" },
        moving: false,
        movementIntent: { x: 0, y: 0 },
        headingYaw: 0,
        navigationRegion: airportRegion,
        viewport: "desktop"
      });
    }
    // High enough to look down over the town, which a 55 degree ceiling cannot.
    expect((state.pitch * 180) / Math.PI).toBeGreaterThan(66);
  });

  it("hands the live camera the key being held", () => {
    // The gate is worthless if the component never tells the camera what is
    // pressed: an absent intent reads as "no reason not to follow" and the
    // visitor is walked in a circle again. Every unit test here passes an
    // intent explicitly, so only reading the wiring catches this.
    const source = readFileSync(
      resolve(process.cwd(), "app/world/ChaseOrbitCamera3d.tsx"),
      "utf8"
    );
    expect(source).toMatch(/movementIntent:\s*input\.readMovement\(/);
  });

  it("starts the visitor with their back to the camera", () => {
    // Standing still never recentres, so the spawn heading has to already
    // agree with the spawn camera or the visitor opens on their own profile.
    const runtime = createWorldRuntime();
    const camera = runtime.getCameraState();
    const basis = getChaseOrbitCameraBasis(camera.yaw);
    const heading = runtime.getNavigationSnapshot().heading;
    expect(heading[0]).toBeCloseTo(basis.forwardX, 10);
    expect(heading[2]).toBeCloseTo(basis.forwardZ, 10);
  });

  it("leaves the resting state untouched when nothing is held", () => {
    const state = createChaseOrbitCameraState();
    const yaw = state.yaw;
    advanceChaseOrbitCamera(state, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 5,
      drag: restingDrag(),
      moving: false,
      movementIntent: { x: 0, y: 0 },
      headingYaw: 2.4,
      navigationRegion: {
        kind: "zone",
        regionId: "airport",
        displayZoneId: "airport",
        highlightedZoneIds: ["airport"]
      },
      viewport: "desktop"
    });
    expect(state.yaw).toBe(yaw);
  });
});

describe("walking forward brings the view back", () => {
  /**
   * A drag is the visitor choosing where to look, and standing still or
   * stepping sideways it keeps that choice. But pressing forward is the
   * visitor saying "this way now", and waiting three and a half seconds
   * before the view agrees reads as the camera ignoring the key.
   */
  it("starts returning as soon as the visitor walks forward", () => {
    const state = createChaseOrbitCameraState();
    state.yaw = 1;
    state.lastManualInputSeconds = 10;
    const before = state.yaw;

    advanceChaseOrbitCamera(state, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 10.2,
      drag: restingDrag(),
      moving: true,
      movementIntent: { x: 0, y: 1 },
      headingYaw: 0,
      navigationRegion: airportRegion,
      viewport: "desktop"
    });

    expect(state.yaw).toBeLessThan(before);
  });

  it("still holds a dragged view while the visitor stands still", () => {
    const state = createChaseOrbitCameraState();
    state.yaw = 1;
    state.lastManualInputSeconds = 10;

    advanceChaseOrbitCamera(state, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 10.2,
      drag: restingDrag(),
      moving: false,
      movementIntent: { x: 0, y: 0 },
      headingYaw: 0,
      navigationRegion: airportRegion,
      viewport: "desktop"
    });

    expect(state.yaw).toBe(1);
  });

  it("still holds a dragged view while the visitor steps sideways", () => {
    const state = createChaseOrbitCameraState();
    state.yaw = 1;
    state.lastManualInputSeconds = 10;

    advanceChaseOrbitCamera(state, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 10.2,
      drag: restingDrag(),
      moving: true,
      movementIntent: { x: -1, y: 0 },
      headingYaw: 0,
      navigationRegion: airportRegion,
      viewport: "desktop"
    });

    expect(state.yaw).toBe(1);
  });
});
