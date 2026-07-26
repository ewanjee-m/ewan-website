import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  advanceChaseOrbitCamera,
  createChaseOrbitCameraState,
  getChaseOrbitCameraBasis
} from "../app/world/ChaseOrbitCamera";
import { resolveCameraRelativeDirection } from "../app/world/WorldRuntime";

const airportRegion = {
  kind: "zone",
  regionId: "airport",
  displayZoneId: "airport",
  highlightedZoneIds: ["airport"]
} as const;

const hanabiRegion = {
  kind: "zone",
  regionId: "hanabi",
  displayZoneId: "hanabi",
  highlightedZoneIds: ["hanabi"]
} as const;

const still = { deltaX: 0, deltaY: 0, pointerKind: "mouse" } as const;

const turnFor = (seconds: number, turn: number) => {
  const state = createChaseOrbitCameraState();
  const startYaw = state.yaw;
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) {
    advanceChaseOrbitCamera(state, {
      deltaSeconds: 1 / 60,
      drag: still,
      turn,
      navigationRegion: airportRegion
    });
  }
  return state.yaw - startYaw;
};

describe("body-relative controls", () => {
  it("turns the same way for the arrow key and for the drag", () => {
    // The lateral axis in this world was mirrored once, and it survived
    // because each place restated the maths instead of sharing it. A key and
    // a drag that disagree about which way is right is the same bug wearing a
    // different hat, so the two are pinned against each other here.
    const keyRight = turnFor(0.5, 1);
    const keyLeft = turnFor(0.5, -1);
    expect(Math.sign(keyRight)).toBe(-Math.sign(keyLeft));

    const dragged = createChaseOrbitCameraState();
    const before = dragged.yaw;
    advanceChaseOrbitCamera(dragged, {
      deltaSeconds: 1 / 60,
      drag: { deltaX: 100, deltaY: 0, pointerKind: "mouse" },
      navigationRegion: airportRegion
    });
    expect(Math.sign(dragged.yaw - before)).toBe(Math.sign(keyRight));

    // And "right" has to mean the visitor's right, not its mirror: turning
    // right swings the camera's forward toward where its right hand was.
    const start = getChaseOrbitCameraBasis(0);
    const turned = getChaseOrbitCameraBasis(turnFor(0.2, 1));
    expect(
      turned.forwardX * start.rightX + turned.forwardZ * start.rightZ
    ).toBeGreaterThan(0);
  });

  it("turns a half circle in a second and a bit", () => {
    // Measured rather than asserted loosely: held down, the visitor comes
    // about in a step of walking, not in a pirouette and not in a slow crawl.
    expect(Math.abs(turnFor(1.2, 1))).toBeCloseTo(Math.PI, 2);
  });

  it("walks along the way it is facing and never sideways", () => {
    for (const yaw of [0, 0.7, -1.9, 2.8]) {
      const basis = getChaseOrbitCameraBasis(yaw);
      const forward = resolveCameraRelativeDirection(
        { x: 0, y: 1, runRequested: false },
        yaw
      );
      expect(forward.x).toBeCloseTo(basis.forwardX, 10);
      expect(forward.z).toBeCloseTo(basis.forwardZ, 10);

      // Back is not a reverse gear: it turns the visitor round, and by the
      // time travel is resolved they are already facing the other way. So it
      // walks along the facing exactly as forward does.
      const back = resolveCameraRelativeDirection(
        { x: 0, y: -1, runRequested: false },
        yaw
      );
      expect(back.x).toBeCloseTo(basis.forwardX, 10);
      expect(back.z).toBeCloseTo(basis.forwardZ, 10);

      // The left and right keys turn the body; they move nobody anywhere.
      for (const sideways of [-1, 1]) {
        const step = resolveCameraRelativeDirection(
          { x: sideways, y: 0, runRequested: false },
          yaw
        );
        expect(step).toEqual({ x: 0, z: 0, strength: 0 });
      }
    }
  });

  it("keeps a sky view through a walk and through a zone change", () => {
    // The visitor drags up to watch the fireworks. Walking on used to ease
    // the pitch back to the zone's framing, which took the sky away from
    // them mid-stride; the drag is now an offset from that framing rather
    // than a value competing with it.
    const state = createChaseOrbitCameraState();
    advanceChaseOrbitCamera(state, {
      deltaSeconds: 1 / 60,
      drag: { deltaX: 0, deltaY: 120, pointerKind: "mouse" },
      navigationRegion: airportRegion
    });
    const lookedUp = state.pitch;
    expect(lookedUp).toBeGreaterThan((14 * Math.PI) / 180);

    for (let frame = 0; frame < 240; frame += 1) {
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        drag: still,
        turn: 0,
        navigationRegion: airportRegion
      });
    }
    expect(state.pitch).toBeCloseTo(lookedUp, 10);

    // Crossing into the fireworks lowers the framing under them, and their
    // own offset rides along rather than being thrown away.
    advanceChaseOrbitCamera(state, {
      deltaSeconds: 1 / 60,
      drag: still,
      navigationRegion: hanabiRegion
    });
    expect(state.pitch).toBeCloseTo(
      lookedUp - ((14 - 9) * Math.PI) / 180,
      10
    );
  });

  it("drives the turn from the movement axis in the live camera", () => {
    // A unit test cannot see wiring. The last time this went unchecked, a
    // camera gate passed every test and was dead in the running app.
    const source = readFileSync(
      resolve(process.cwd(), "app/world/ChaseOrbitCamera3d.tsx"),
      "utf8"
    );
    // Turning takes its own unscaled axis: sharing readMovement's diagonal
    // scale made the visitor turn 30 per cent slower whenever they also held
    // forward, which is the case they turn in most.
    expect(source).toMatch(/turn:[^\n]*input\.readTurn\(\)/);
    // Turning is movement, so it stops when a dialog takes the keyboard.
    expect(source).toMatch(/turn:\s*inputLocked \? 0 :/);
    expect(source).toMatch(/aboutFace:/);
    // Nothing chases a heading any more; the view is the heading.
    expect(source).not.toMatch(/headingYaw/);
  });
});
