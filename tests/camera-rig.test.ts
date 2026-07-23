import { describe, expect, it } from "vitest";
import {
  createCameraRig,
  stepFlatCameraSourceOffset
} from "../app/world/CameraRig";
import {
  FLAT_CAMERA_MAX_STEP_CSS_PX,
  FLAT_CAMERA_PROFILES,
  FLAT_CAMERA_REFERENCE_IMAGE,
  calculateFlatCameraPlacement,
  projectFlatCameraReferenceBounds,
  projectFlatCameraReferencePoint
} from "../app/world/FlatCameraPlacement";

describe("fixed-backdrop camera rig", () => {
  it("keeps pointer drag and reset from rotating or pitching the camera", () => {
    const camera = createCameraRig({
      initialYaw: 120,
      initialPitch: 70,
      degreesPerPixel: 0.2
    });
    const target = { yaw: Number.NaN, pitch: Number.NaN };

    expect(camera.isDragging()).toBe(false);
    camera.beginDrag();
    camera.drag({ deltaX: 10_000, deltaY: -10_000 });
    expect(camera.isDragging()).toBe(true);
    expect(camera.readSnapshot(target)).toBe(target);
    expect(target).toEqual({ yaw: 0, pitch: 0 });
    camera.reset();
    expect(camera.getSnapshot()).toEqual({ yaw: 0, pitch: 0 });
    expect(camera.consumeReset()).toBe(false);
    camera.endDrag();
    expect(camera.isDragging()).toBe(false);
  });

  it.each(["desktop", "mobile"] as const)(
    "limits %s crop movement to 24 CSS pixels and stays in the next interval",
    (profileId) => {
      const profile = FLAT_CAMERA_PROFILES[profileId];
      const backdropScale = profile.safeFrame.height / 866;
      const step = stepFlatCameraSourceOffset({
        currentSourceOffsetX: 100,
        targetSourceOffsetX: 500,
        backdropScale,
        nextFeasibleInterval: { minimumX: 0, maximumX: 800 }
      })!;

      expect(step.sourceOffsetX).toBeGreaterThanOrEqual(
        step.feasibleIntersection.minimumX
      );
      expect(step.sourceOffsetX).toBeLessThanOrEqual(
        step.feasibleIntersection.maximumX
      );
      expect(step.movementCssPixels).toBeCloseTo(
        FLAT_CAMERA_MAX_STEP_CSS_PX,
        12
      );
      expect(Math.abs(step.sourceOffsetX - 100) * backdropScale)
        .toBeLessThanOrEqual(24 + 1e-10);
    }
  );

  it("chooses the target inside the reachable-next-feasible intersection", () => {
    expect(stepFlatCameraSourceOffset({
      currentSourceOffsetX: 100,
      targetSourceOffsetX: 115,
      backdropScale: 1,
      nextFeasibleInterval: { minimumX: 110, maximumX: 120 }
    })).toEqual({
      sourceOffsetX: 115,
      movementCssPixels: 15,
      feasibleIntersection: { minimumX: 110, maximumX: 120 }
    });

    expect(stepFlatCameraSourceOffset({
      currentSourceOffsetX: 100,
      targetSourceOffsetX: 500,
      backdropScale: 1,
      nextFeasibleInterval: { minimumX: 110, maximumX: 120 }
    })!.sourceOffsetX).toBe(120);
  });

  it("rebases backdrop, player, foot, and foreground through the same live stepped crop", () => {
    const foregroundReferenceMask = {
      minimumX: 815,
      maximumX: 1135,
      minimumY: 285,
      maximumY: 615
    };
    const placement = calculateFlatCameraPlacement({
      profile: "desktop",
      playerReferenceBounds: {
        minimumX: 840,
        maximumX: 960,
        minimumY: 440,
        maximumY: 630
      },
      footReferenceBounds: {
        minimumX: 900,
        maximumX: 900,
        minimumY: 600,
        maximumY: 600
      },
      playerCssSafeRectangle: { x: 96, y: 48, width: 1248, height: 804 },
      footCssSafeRectangle: { x: 120, y: 120, width: 1200, height: 720 },
      protectedRectangles: [
        {
          id: "foreground-mask",
          sourceId: "foreground-mask",
          ...foregroundReferenceMask
        }
      ]
    })!;
    const step = stepFlatCameraSourceOffset({
      currentSourceOffsetX: 100,
      targetSourceOffsetX: placement.sourceOffset.x,
      backdropScale: placement.backdropScale,
      nextFeasibleInterval: placement.feasibleInterval
    })!;
    const liveProjection = {
      sourceOffsetX: step.sourceOffsetX,
      backdropScale: placement.backdropScale,
      safeFrame: placement.safeFrame
    };
    const targetProjection = {
      ...liveProjection,
      sourceOffsetX: placement.sourceOffset.x
    };
    const liveBackdrop = projectFlatCameraReferenceBounds(
      {
        minimumX: step.sourceOffsetX,
        maximumX: step.sourceOffsetX + placement.sourceWindow.width,
        minimumY: 0,
        maximumY: FLAT_CAMERA_REFERENCE_IMAGE.height
      },
      liveProjection
    );
    const livePlayerFoot = projectFlatCameraReferencePoint(
      [900, 600],
      liveProjection
    );
    const livePlayerBounds = projectFlatCameraReferenceBounds(
      placement.playerProjectedBounds.reference,
      liveProjection
    );
    const liveFootBounds = projectFlatCameraReferenceBounds(
      placement.footProjectedBounds.reference,
      liveProjection
    );
    const liveForeground = projectFlatCameraReferenceBounds(
      foregroundReferenceMask,
      liveProjection
    );

    expect(step.sourceOffsetX).not.toBe(placement.sourceOffset.x);
    expect(liveBackdrop).not.toBeNull();
    expect(livePlayerFoot).not.toBeNull();
    expect(livePlayerBounds).not.toBeNull();
    expect(liveFootBounds).not.toBeNull();
    expect(liveForeground).not.toBeNull();
    expect(liveBackdrop!.minimumX).toBeCloseTo(placement.safeFrame.x, 12);
    expect(liveBackdrop!.maximumX).toBeCloseTo(
      placement.safeFrame.x + placement.safeFrame.width,
      12
    );
    expect(liveBackdrop!.minimumY).toBeCloseTo(placement.safeFrame.y, 12);
    expect(liveBackdrop!.maximumY).toBeCloseTo(
      placement.safeFrame.y + placement.safeFrame.height,
      12
    );
    expect(liveFootBounds).toEqual({
      minimumX: livePlayerFoot![0],
      maximumX: livePlayerFoot![0],
      minimumY: livePlayerFoot![1],
      maximumY: livePlayerFoot![1]
    });

    const expectedLiveShift =
      (placement.sourceOffset.x - step.sourceOffsetX) *
      placement.backdropScale;
    for (const referenceBounds of [
      placement.playerProjectedBounds.reference,
      placement.footProjectedBounds.reference,
      foregroundReferenceMask
    ]) {
      const live = projectFlatCameraReferenceBounds(
        referenceBounds,
        liveProjection
      )!;
      const target = projectFlatCameraReferenceBounds(
        referenceBounds,
        targetProjection
      )!;
      expect(live.minimumX - target.minimumX).toBeCloseTo(
        expectedLiveShift,
        12
      );
      expect(live.maximumX - target.maximumX).toBeCloseTo(
        expectedLiveShift,
        12
      );
      expect(live.minimumY).toBe(target.minimumY);
      expect(live.maximumY).toBe(target.maximumY);
    }
  });

  it("fails closed when the next feasible interval cannot be reached in one frame", () => {
    expect(stepFlatCameraSourceOffset({
      currentSourceOffsetX: 0,
      targetSourceOffsetX: 200,
      backdropScale: 1,
      nextFeasibleInterval: { minimumX: 100, maximumX: 200 }
    })).toBeNull();
  });

  it("fails closed for invalid temporal input", () => {
    for (const input of [
      {
        currentSourceOffsetX: Number.NaN,
        targetSourceOffsetX: 0,
        backdropScale: 1,
        nextFeasibleInterval: { minimumX: 0, maximumX: 1 }
      },
      {
        currentSourceOffsetX: 0,
        targetSourceOffsetX: 0,
        backdropScale: 0,
        nextFeasibleInterval: { minimumX: 0, maximumX: 1 }
      },
      {
        currentSourceOffsetX: 0,
        targetSourceOffsetX: 0,
        backdropScale: 1,
        nextFeasibleInterval: { minimumX: 2, maximumX: 1 }
      }
    ]) {
      expect(stepFlatCameraSourceOffset(input)).toBeNull();
    }
  });
});
