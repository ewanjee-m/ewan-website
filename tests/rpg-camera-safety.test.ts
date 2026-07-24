import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  advanceRpgCameraSafetyOffset,
  advanceRpgCameraSafetyViolation,
  calculateRpgCameraSafetyCorrection,
  getRpgCameraSafeArea
} from "../app/world/RpgCameraSafety";

const desktop = getRpgCameraSafeArea("desktop", {
  x: 0,
  y: 0,
  width: 1440,
  height: 900
});

const mobile = getRpgCameraSafeArea("mobile", {
  x: 0,
  y: 64,
  width: 390,
  height: 780
});

describe("RPG camera screen safety", () => {
  it("returns the exact desktop and mobile safe rectangles", () => {
    expect(desktop).toEqual({
      minimumX: 216,
      maximumX: 1224,
      minimumY: 90,
      maximumY: 828,
      width: 1008,
      height: 738
    });
    expect(mobile).toEqual({
      minimumX: 39,
      maximumX: 351,
      minimumY: 126.4,
      maximumY: 797.2,
      width: 312,
      height: 670.8
    });
  });

  it("returns zero while the projected body bounds stay inside", () => {
    expect(
      calculateRpgCameraSafetyCorrection(
        {
          minimumX: desktop.minimumX,
          maximumX: desktop.maximumX,
          minimumY: desktop.minimumY,
          maximumY: desktop.maximumY
        },
        desktop
      )
    ).toEqual({ x: 0, y: 0 });
  });

  it("returns signed normalized overflow for every edge", () => {
    expect(
      calculateRpgCameraSafetyCorrection(
        {
          minimumX: desktop.minimumX - 100.8,
          maximumX: desktop.minimumX,
          minimumY: desktop.minimumY,
          maximumY: desktop.minimumY
        },
        desktop
      )
    ).toEqual({ x: -0.1, y: 0 });
    expect(
      calculateRpgCameraSafetyCorrection(
        {
          minimumX: desktop.maximumX,
          maximumX: desktop.maximumX + 201.6,
          minimumY: desktop.maximumY,
          maximumY: desktop.maximumY
        },
        desktop
      )
    ).toEqual({ x: 0.2, y: 0 });
    expect(
      calculateRpgCameraSafetyCorrection(
        {
          minimumX: desktop.minimumX,
          maximumX: desktop.minimumX,
          minimumY: desktop.minimumY - 73.8,
          maximumY: desktop.minimumY
        },
        desktop
      ).y
    ).toBeCloseTo(-0.1);
    expect(
      calculateRpgCameraSafetyCorrection(
        {
          minimumX: desktop.maximumX,
          maximumX: desktop.maximumX,
          minimumY: desktop.maximumY,
          maximumY: desktop.maximumY + 147.6
        },
        desktop
      ).y
    ).toBeCloseTo(0.2);
  });

  it("clamps corrections to one safe-rectangle span", () => {
    expect(
      calculateRpgCameraSafetyCorrection(
        {
          minimumX: desktop.minimumX - desktop.width * 2,
          maximumX: desktop.maximumX + desktop.width * 3,
          minimumY: desktop.minimumY - desktop.height * 4,
          maximumY: desktop.maximumY + desktop.height * 2
        },
        desktop
      )
    ).toEqual({ x: 1, y: -1 });
  });

  it("tracks a continuous 250ms violation and resets when safe", () => {
    const outside = { x: 0.1, y: 0 };
    let violationSeconds = advanceRpgCameraSafetyViolation(
      0,
      outside,
      0.249
    );
    expect(violationSeconds).toBe(0.249);
    violationSeconds = advanceRpgCameraSafetyViolation(
      violationSeconds,
      outside,
      0.001
    );
    expect(violationSeconds).toBe(0.25);
    expect(
      advanceRpgCameraSafetyViolation(
        violationSeconds,
        { x: 0, y: 0 },
        1 / 60
      )
    ).toBe(0);
  });

  it("clamps the world-space safety target to 2.2 and smooths with a 0.08s half-life", () => {
    const current = new Vector3();
    const target = new Vector3();

    advanceRpgCameraSafetyOffset({
      distance: 8,
      correction: { x: 1, y: 1 },
      cameraRight: new Vector3(1, 0, 0),
      cameraUp: new Vector3(0, 1, 0),
      currentOffset: current,
      targetOffset: target,
      deltaSeconds: 0.08
    });

    expect(target.length()).toBeCloseTo(2.2);
    expect(target.x).toBeCloseTo(1.76);
    expect(target.y).toBeCloseTo(-1.32);
    expect(current.length()).toBeCloseTo(1.1);
    expect(current.x).toBeCloseTo(0.88);
    expect(current.y).toBeCloseTo(-0.66);
  });

  it("derives each safety target from the current screen correction", () => {
    const current = new Vector3(0.5, 0, 0);
    const target = new Vector3();

    advanceRpgCameraSafetyOffset({
      distance: 8,
      correction: { x: 0.1, y: 0 },
      cameraRight: new Vector3(1, 0, 0),
      cameraUp: new Vector3(0, 1, 0),
      currentOffset: current,
      targetOffset: target,
      deltaSeconds: 0
    });

    expect(target.toArray()).toEqual([0.2, 0, 0]);
    expect(current.toArray()).toEqual([0.5, 0, 0]);
  });

  it("decays the current safety offset toward zero when the body is safe", () => {
    const current = new Vector3(1.6, -0.8, 0.4);
    const target = new Vector3(9, 9, 9);

    advanceRpgCameraSafetyOffset({
      distance: 4,
      correction: { x: 0, y: 0 },
      cameraRight: new Vector3(1, 0, 0),
      cameraUp: new Vector3(0, 1, 0),
      currentOffset: current,
      targetOffset: target,
      deltaSeconds: 0.08
    });

    expect(target.toArray()).toEqual([0, 0, 0]);
    expect(current.toArray()).toEqual([0.8, -0.4, 0.2]);
  });
});
