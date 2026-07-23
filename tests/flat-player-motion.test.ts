import { describe, expect, it } from "vitest";
import {
  advanceFlatPlayerMotion,
  createFlatPlayerMotionState,
  getPlayerDirectionalWidthScale
} from "../app/world/FlatPlayerMotion";
import { getSelectedPlayerRuntimeManifest } from "../app/world/CharacterAssets";

describe("flat player motion", () => {
  it("keeps both feet on the ground while idle", () => {
    const state = createFlatPlayerMotionState();
    const pose = advanceFlatPlayerMotion(state, {
      deltaSeconds: 1 / 60,
      moving: false,
      horizontalIntent: 0,
      jumpHeight: 0
    });

    expect(pose.spriteOffsetY).toBe(0);
    expect(pose.heightScale).toBe(1);
    expect(pose.rotation).toBe(0);
    expect(pose.dustOpacity).toBe(0);
    expect(pose.facingScale).toBe(1);
    expect(pose.strideFrame).toBe(0);
  });

  it("animates a grounded run without lifting the foot anchor", () => {
    const state = createFlatPlayerMotionState();
    const poses = Array.from({ length: 20 }, () =>
      advanceFlatPlayerMotion(state, {
        deltaSeconds: 1 / 60,
        moving: true,
        horizontalIntent: 1,
        jumpHeight: 0
      })
    );

    expect(poses.every((pose) => pose.spriteOffsetY === 0)).toBe(true);
    expect(poses.some((pose) => pose.heightScale < 0.99)).toBe(true);
    expect(poses.some((pose) => Math.abs(pose.rotation) > 0.01)).toBe(true);
    expect(poses.some((pose) => pose.dustOpacity > 0.3)).toBe(true);
  });

  it("alternates both stride frames repeatedly while running", () => {
    const state = createFlatPlayerMotionState();
    const frames = Array.from({ length: 90 }, () =>
      advanceFlatPlayerMotion(state, {
        deltaSeconds: 1 / 60,
        moving: true,
        horizontalIntent: 1,
        jumpHeight: 0
      }).strideFrame
    );
    const transitions = frames.slice(1).filter((frame, index) => frame !== frames[index]);

    expect(new Set(frames)).toEqual(new Set([0, 1]));
    expect(transitions.length).toBeGreaterThanOrEqual(8);
  });

  it("returns to the neutral stride frame as soon as movement stops", () => {
    const state = createFlatPlayerMotionState();
    let runningFrame: 0 | 1 = 0;
    for (let frame = 0; frame < 30 && runningFrame === 0; frame += 1) {
      runningFrame = advanceFlatPlayerMotion(state, {
        deltaSeconds: 1 / 60,
        moving: true,
        horizontalIntent: 1,
        jumpHeight: 0
      }).strideFrame;
    }

    const idlePose = advanceFlatPlayerMotion(state, {
      deltaSeconds: 1 / 60,
      moving: false,
      horizontalIntent: 0,
      jumpHeight: 0
    });

    expect(runningFrame).toBe(1);
    expect(idlePose.strideFrame).toBe(0);
  });

  it("selects the same stride frame for a large elapsed time regardless of frame splits", () => {
    const singleStepState = createFlatPlayerMotionState();
    const splitStepState = createFlatPlayerMotionState();
    const singleStepPose = advanceFlatPlayerMotion(singleStepState, {
      deltaSeconds: 120.375,
      moving: true,
      horizontalIntent: 1,
      jumpHeight: 0
    });
    advanceFlatPlayerMotion(splitStepState, {
      deltaSeconds: 60.125,
      moving: true,
      horizontalIntent: 1,
      jumpHeight: 0
    });
    const splitStepPose = advanceFlatPlayerMotion(splitStepState, {
      deltaSeconds: 60.25,
      moving: true,
      horizontalIntent: 1,
      jumpHeight: 0
    });

    expect(singleStepPose.strideFrame).toBe(splitStepPose.strideFrame);
    expect([0, 1]).toContain(singleStepPose.strideFrame);
    expect(singleStepState.runTime).toBeCloseTo(splitStepState.runTime, 8);
    expect(
      Object.values(singleStepPose)
        .filter((value): value is number => typeof value === "number")
        .every(Number.isFinite)
    ).toBe(true);
  });

  it("compresses through zero before facing left and can turn right again", () => {
    const state = createFlatPlayerMotionState();
    const leftScales: number[] = [];
    for (let frame = 0; frame < 30; frame += 1) {
      leftScales.push(
        advanceFlatPlayerMotion(state, {
          deltaSeconds: 1 / 60,
          moving: true,
          horizontalIntent: -1,
          jumpHeight: 0
        }).facingScale
      );
    }

    expect(leftScales.some((scale) => Math.abs(scale) < 0.2)).toBe(true);
    expect(leftScales.at(-1)).toBe(-1);

    for (let frame = 0; frame < 30; frame += 1) {
      advanceFlatPlayerMotion(state, {
        deltaSeconds: 1 / 60,
        moving: true,
        horizontalIntent: 1,
        jumpHeight: 0
      });
    }
    expect(state.facingScale).toBe(1);
  });

  it("preserves the signed turn compression for side sprites only", () => {
    expect(getPlayerDirectionalWidthScale("side", 0.42)).toBe(0.42);
    expect(getPlayerDirectionalWidthScale("side", -0.18)).toBe(-0.18);
    expect(getPlayerDirectionalWidthScale("front", -0.18)).toBe(0.18);
    expect(getPlayerDirectionalWidthScale("back", -0.18)).toBe(0.18);
  });

  it("keeps the last facing direction during vertical movement", () => {
    const state = createFlatPlayerMotionState();
    for (let frame = 0; frame < 30; frame += 1) {
      advanceFlatPlayerMotion(state, {
        deltaSeconds: 1 / 60,
        moving: true,
        horizontalIntent: -1,
        jumpHeight: 0
      });
    }

    const verticalRun = advanceFlatPlayerMotion(state, {
      deltaSeconds: 1 / 60,
      moving: true,
      horizontalIntent: 0,
      jumpHeight: 0
    });

    expect(verticalRun.facingScale).toBe(-1);
    expect(verticalRun.dustOpacity).toBeGreaterThan(0);
  });

  it("moves the foot anchor only for a real jump and fades the contact shadow", () => {
    const state = createFlatPlayerMotionState();
    const grounded = advanceFlatPlayerMotion(state, {
      deltaSeconds: 1 / 60,
      moving: true,
      horizontalIntent: 1,
      jumpHeight: 0
    });
    const airborne = advanceFlatPlayerMotion(state, {
      deltaSeconds: 1 / 60,
      moving: true,
      horizontalIntent: 1,
      jumpHeight: 1.5
    });

    expect(airborne.spriteOffsetY).toBe(1.5);
    expect(airborne.dustOpacity).toBe(0);
    expect(airborne.shadowOpacity).toBeLessThan(grounded.shadowOpacity);
    expect(airborne.shadowScale).toBeLessThan(grounded.shadowScale);
  });

  it("selects idle and deterministic 0 -> 1 -> 0 runtime frame descriptors", () => {
    const runtimeManifest = getSelectedPlayerRuntimeManifest("female");
    const state = createFlatPlayerMotionState();
    const frame = (moving: boolean, deltaSeconds: number) =>
      advanceFlatPlayerMotion(state, {
        deltaSeconds,
        moving,
        horizontalIntent: 0,
        jumpHeight: 0,
        direction: "front",
        runtimeManifest,
        sideFacing: 1
      });

    const idle = frame(false, 0);
    const strideZero = frame(true, 0.01);
    const strideOne = frame(true, 0.13);
    const strideZeroAgain = frame(true, 0.14);

    expect(idle.selectedFrame).toBe(runtimeManifest.idle.front);
    expect([strideZero.strideFrame, strideOne.strideFrame, strideZeroAgain.strideFrame]).toEqual([
      0,
      1,
      0
    ]);
    expect(strideZero.selectedFrame).toBe(runtimeManifest.run.front[0]);
    expect(strideOne.selectedFrame).toBe(runtimeManifest.run.front[1]);
    expect(strideZeroAgain.selectedFrame).toBe(runtimeManifest.run.front[0]);
  });

  it("uses one side-facing sign and the selected frame's exact foot anchor", () => {
    const runtimeManifest = getSelectedPlayerRuntimeManifest("male");
    const state = createFlatPlayerMotionState();
    const left = advanceFlatPlayerMotion(state, {
      deltaSeconds: 1 / 60,
      moving: true,
      horizontalIntent: -1,
      jumpHeight: 0,
      direction: "side",
      runtimeManifest,
      sideFacing: -1
    });
    const front = advanceFlatPlayerMotion(state, {
      deltaSeconds: 1 / 60,
      moving: true,
      horizontalIntent: -1,
      jumpHeight: 0,
      direction: "front",
      runtimeManifest,
      sideFacing: -1
    });

    expect(left.spriteScaleX).toBe(-1);
    expect(front.spriteScaleX).toBe(1);
    expect(left.selectedFrame?.asset).toBe(runtimeManifest.run.side[0].asset);
    expect(left.footAnchorOffset).toBe(left.selectedFrame?.footOffset);
  });
});
