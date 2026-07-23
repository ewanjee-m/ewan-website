import { describe, expect, it } from "vitest";
import {
  FLAT_CAMERA_PROFILES,
  FLAT_CAMERA_REFERENCE_IMAGE,
  calculateFlatCameraPlacement,
  projectFlatCameraReferenceBounds,
  projectFlatCameraReferencePoint,
  type FlatCameraProfileId,
  type FlatCameraProtectedRectangle,
  type FlatCameraReferenceBounds,
  type FlatCameraReferenceProjectionInput
} from "../app/world/FlatCameraPlacement";

const protectedRectangle: FlatCameraProtectedRectangle = {
  id: "gyukatsu-main-machiya-protected",
  sourceId: "gyukatsu-main-machiya",
  minimumX: 815,
  maximumX: 1135,
  minimumY: 285,
  maximumY: 615
};

const profileIds = ["desktop", "mobile"] as const;

const cssSafeRectangles = {
  desktop: {
    player: { x: 96, y: 48, width: 1248, height: 804 },
    foot: { x: 120, y: 120, width: 1200, height: 720 }
  },
  mobile: {
    player: { x: 0, y: 64, width: 390, height: 420 },
    foot: { x: 32, y: 104, width: 326, height: 284 }
  }
} as const;

function placementInput(
  profile: FlatCameraProfileId,
  playerReferenceBounds: FlatCameraReferenceBounds = {
    minimumX: 840,
    maximumX: 960,
    minimumY: 440,
    maximumY: 630
  },
  footReferenceBounds: FlatCameraReferenceBounds = {
    minimumX: 900,
    maximumX: 900,
    minimumY: 600,
    maximumY: 600
  }
) {
  return {
    profile,
    playerReferenceBounds,
    footReferenceBounds,
    playerCssSafeRectangle: cssSafeRectangles[profile].player,
    footCssSafeRectangle: cssSafeRectangles[profile].foot
  };
}

function referenceProjection(
  profileId: FlatCameraProfileId,
  sourceOffsetX = 0
): FlatCameraReferenceProjectionInput {
  const profile = FLAT_CAMERA_PROFILES[profileId];
  return {
    sourceOffsetX,
    backdropScale:
      profile.safeFrame.height / FLAT_CAMERA_REFERENCE_IMAGE.height,
    safeFrame: profile.safeFrame
  };
}

describe("fixed reference-image camera placement", () => {
  it("uses the exact desktop and mobile safe frames", () => {
    expect(FLAT_CAMERA_REFERENCE_IMAGE).toEqual({ width: 1817, height: 866 });
    expect(FLAT_CAMERA_PROFILES.desktop).toEqual({
      id: "desktop",
      viewportWidth: 1440,
      viewportHeight: 900,
      safeFrame: { x: 0, y: 0, width: 1440, height: 900 }
    });
    expect(FLAT_CAMERA_PROFILES.mobile).toEqual({
      id: "mobile",
      viewportWidth: 390,
      viewportHeight: 844,
      safeFrame: { x: 0, y: 64, width: 390, height: 420 }
    });

    const desktop = calculateFlatCameraPlacement({
      ...placementInput("desktop")
    })!;
    expect(desktop.backdropScale).toBeCloseTo(900 / 866, 12);
    expect(desktop.sourceWindow).toEqual({ width: 1385.6, height: 866 });
    expect(desktop.sourceClamp.minimumX).toBe(0);
    expect(desktop.sourceClamp.maximumX).toBeCloseTo(431.4, 12);
    expect(desktop.sourceOffset.y).toBe(0);

    const mobile = calculateFlatCameraPlacement({
      ...placementInput("mobile")
    })!;
    expect(mobile.backdropScale).toBeCloseTo(420 / 866, 12);
    expect(mobile.sourceWindow.width).toBeCloseTo(804.1428571428571, 12);
    expect(mobile.sourceWindow.height).toBe(866);
    expect(mobile.sourceClamp.minimumX).toBe(0);
    expect(mobile.sourceClamp.maximumX).toBeCloseTo(1012.857142857143, 12);
    expect(mobile.sourceOffset.y).toBe(0);
  });

  it.each([
    {
      profile: "desktop",
      expected: [291.5151, 629.8698]
    },
    {
      profile: "mobile",
      expected: [136.0404, 357.9393]
    }
  ] as const)(
    "projects the canonical spawn anchor into the exact $profile frame",
    ({ profile, expected }) => {
      const projected = projectFlatCameraReferencePoint(
        [280.5023, 606.0748],
        referenceProjection(profile)
      );

      expect(projected).not.toBeNull();
      expect(projected![0]).toBeCloseTo(expected[0], 3);
      expect(projected![1]).toBeCloseTo(expected[1], 3);
    }
  );

  it.each(profileIds)(
    "maps the live %s crop edges onto the exact safe-frame edges",
    (profileId) => {
      const profile = FLAT_CAMERA_PROFILES[profileId];
      const sourceOffsetX = profileId === "desktop" ? 37 : 200;
      const projection = referenceProjection(profileId, sourceOffsetX);
      const sourceWindowWidth =
        profile.safeFrame.width / projection.backdropScale;
      const topLeft = projectFlatCameraReferencePoint(
        [sourceOffsetX, 0],
        projection
      );
      const bottomRight = projectFlatCameraReferencePoint(
        [sourceOffsetX + sourceWindowWidth, FLAT_CAMERA_REFERENCE_IMAGE.height],
        projection
      );
      const projectedWindow = projectFlatCameraReferenceBounds(
        {
          minimumX: sourceOffsetX,
          maximumX: sourceOffsetX + sourceWindowWidth,
          minimumY: 0,
          maximumY: FLAT_CAMERA_REFERENCE_IMAGE.height
        },
        projection
      );

      expect(topLeft).not.toBeNull();
      expect(bottomRight).not.toBeNull();
      expect(projectedWindow).not.toBeNull();
      expect(topLeft![0]).toBeCloseTo(profile.safeFrame.x, 12);
      expect(topLeft![1]).toBeCloseTo(profile.safeFrame.y, 12);
      expect(bottomRight![0]).toBeCloseTo(
        profile.safeFrame.x + profile.safeFrame.width,
        12
      );
      expect(bottomRight![1]).toBeCloseTo(
        profile.safeFrame.y + profile.safeFrame.height,
        12
      );
      expect(projectedWindow).toEqual({
        minimumX: topLeft![0],
        maximumX: bottomRight![0],
        minimumY: topLeft![1],
        maximumY: bottomRight![1]
      });
    }
  );

  it.each(profileIds)(
    "keeps player, foot, and every selected protected rectangle inside the %s safe frame",
    (profile) => {
      const placement = calculateFlatCameraPlacement({
        ...placementInput(profile),
        protectedRectangles: [protectedRectangle]
      })!;
      const playerSafeRight =
        placement.playerCssSafeRectangle.x +
        placement.playerCssSafeRectangle.width;
      const playerSafeBottom =
        placement.playerCssSafeRectangle.y +
        placement.playerCssSafeRectangle.height;
      const footSafeRight =
        placement.footCssSafeRectangle.x + placement.footCssSafeRectangle.width;
      const footSafeBottom =
        placement.footCssSafeRectangle.y + placement.footCssSafeRectangle.height;

      expect(placement.selectedProtectedIds).toEqual(["gyukatsu-main-machiya"]);
      expect(placement.selectedProtectedRectangles).toEqual([protectedRectangle]);
      expect(placement.playerReferenceBounds).toEqual(
        placementInput(profile).playerReferenceBounds
      );
      expect(placement.footReferenceBounds).toEqual(
        placementInput(profile).footReferenceBounds
      );
      expect(placement.playerProjectedBounds.reference).toEqual(
        placementInput(profile).playerReferenceBounds
      );
      expect(placement.footProjectedBounds.reference).toEqual(
        placementInput(profile).footReferenceBounds
      );
      expect(placement.playerProjectedBounds.safeFrame.minimumX)
        .toBeGreaterThanOrEqual(placement.playerCssSafeRectangle.x);
      expect(placement.playerProjectedBounds.safeFrame.maximumX)
        .toBeLessThanOrEqual(playerSafeRight);
      expect(placement.playerProjectedBounds.safeFrame.minimumY)
        .toBeGreaterThanOrEqual(placement.playerCssSafeRectangle.y);
      expect(placement.playerProjectedBounds.safeFrame.maximumY)
        .toBeLessThanOrEqual(playerSafeBottom);
      expect(placement.footProjectedBounds.safeFrame.minimumX)
        .toBeGreaterThanOrEqual(placement.footCssSafeRectangle.x);
      expect(placement.footProjectedBounds.safeFrame.maximumX)
        .toBeLessThanOrEqual(footSafeRight);
      expect(placement.footProjectedBounds.safeFrame.minimumY)
        .toBeGreaterThanOrEqual(placement.footCssSafeRectangle.y);
      expect(placement.footProjectedBounds.safeFrame.maximumY)
        .toBeLessThanOrEqual(footSafeBottom);

      const projectedProtectedRectangle = projectFlatCameraReferenceBounds(
        protectedRectangle,
        {
          sourceOffsetX: placement.sourceOffset.x,
          backdropScale: placement.backdropScale,
          safeFrame: placement.safeFrame
        }
      );
      expect(projectedProtectedRectangle).not.toBeNull();
      expect(projectedProtectedRectangle!.minimumX)
        .toBeGreaterThanOrEqual(placement.safeFrame.x);
      expect(projectedProtectedRectangle!.maximumX)
        .toBeLessThanOrEqual(
          placement.safeFrame.x + placement.safeFrame.width
        );
    }
  );

  it.each(profileIds)("clamps both horizontal image edges for %s", (profile) => {
    const backdropScale =
      FLAT_CAMERA_PROFILES[profile].safeFrame.height /
      FLAT_CAMERA_REFERENCE_IMAGE.height;
    const sourceWindowWidth =
      FLAT_CAMERA_PROFILES[profile].safeFrame.width / backdropScale;
    const fullFrame = FLAT_CAMERA_PROFILES[profile].safeFrame;
    const left = calculateFlatCameraPlacement({
      profile,
      playerReferenceBounds: {
        minimumX: 0,
        maximumX: 0,
        minimumY: 500,
        maximumY: 500
      },
      footReferenceBounds: {
        minimumX: 0,
        maximumX: 0,
        minimumY: 500,
        maximumY: 500
      },
      playerCssSafeRectangle: fullFrame,
      footCssSafeRectangle: fullFrame,
      trackingReferenceX: -10_000
    })!;
    const right = calculateFlatCameraPlacement({
      profile,
      playerReferenceBounds: {
        minimumX: FLAT_CAMERA_REFERENCE_IMAGE.width,
        maximumX: FLAT_CAMERA_REFERENCE_IMAGE.width,
        minimumY: 500,
        maximumY: 500
      },
      footReferenceBounds: {
        minimumX: FLAT_CAMERA_REFERENCE_IMAGE.width,
        maximumX: FLAT_CAMERA_REFERENCE_IMAGE.width,
        minimumY: 500,
        maximumY: 500
      },
      playerCssSafeRectangle: fullFrame,
      footCssSafeRectangle: fullFrame,
      trackingReferenceX: 10_000
    })!;

    expect(left.feasibleInterval).toEqual({ minimumX: 0, maximumX: 0 });
    expect(left.sourceOffset.x).toBe(0);
    expect(right.feasibleInterval.minimumX).toBeCloseTo(
      FLAT_CAMERA_REFERENCE_IMAGE.width - sourceWindowWidth,
      10
    );
    expect(right.feasibleInterval.maximumX).toBeCloseTo(
      FLAT_CAMERA_REFERENCE_IMAGE.width - sourceWindowWidth,
      10
    );
    expect(right.sourceOffset.x).toBeCloseTo(
      FLAT_CAMERA_REFERENCE_IMAGE.width - sourceWindowWidth,
      10
    );
  });

  it.each(profileIds)("is deterministic for repeated %s inputs", (profile) => {
    const input = {
      ...placementInput(profile),
      protectedRectangles: [protectedRectangle],
      trackingReferenceX: 1200
    };

    expect(calculateFlatCameraPlacement(input)).toEqual(
      calculateFlatCameraPlacement(input)
    );
  });

  it("fails closed for non-finite, out-of-image, malformed, and infeasible input", () => {
    const invalidRectangle = {
      ...protectedRectangle,
      minimumX: 1200,
      maximumX: 1100
    };
    const impossibleRectangle = {
      ...protectedRectangle,
      id: "far-right",
      sourceId: "far-right",
      minimumX: 1700,
      maximumX: 1817
    };
    const valid = placementInput("desktop");

    for (const input of [
      {
        ...valid,
        playerReferenceBounds: {
          ...valid.playerReferenceBounds,
          minimumX: Number.NaN
        }
      },
      {
        ...valid,
        footReferenceBounds: {
          ...valid.footReferenceBounds,
          maximumY: Number.POSITIVE_INFINITY
        }
      },
      {
        ...valid,
        playerReferenceBounds: {
          ...valid.playerReferenceBounds,
          minimumX: -1
        }
      },
      {
        ...valid,
        footReferenceBounds: {
          ...valid.footReferenceBounds,
          maximumY: 867
        }
      },
      {
        ...valid,
        trackingReferenceX: Number.NaN
      },
      {
        ...valid,
        protectedRectangles: [invalidRectangle]
      },
      {
        ...placementInput("mobile"),
        protectedRectangles: [impossibleRectangle]
      },
      {
        ...valid,
        playerCssSafeRectangle: { x: 0, y: 0, width: 2000, height: 10 }
      },
      {
        ...valid,
        footCssSafeRectangle: { x: 0, y: 0, width: 0, height: 10 }
      }
    ] as const) {
      expect(calculateFlatCameraPlacement(input), JSON.stringify(input)).toBeNull();
    }
  });

  it("rejects an unknown profile at runtime", () => {
    expect(calculateFlatCameraPlacement({
      ...placementInput("desktop"),
      profile: "tablet" as FlatCameraProfileId
    })).toBeNull();
  });

  it("fails reference projection closed for invalid crop, point, and bounds input", () => {
    const validProjection = referenceProjection("desktop");
    const validPoint = [900, 500] as const;

    for (const projection of [
      { ...validProjection, sourceOffsetX: Number.NaN },
      { ...validProjection, sourceOffsetX: -1 },
      { ...validProjection, sourceOffsetX: 500 },
      { ...validProjection, backdropScale: 0 },
      { ...validProjection, backdropScale: 1 },
      {
        ...validProjection,
        safeFrame: { ...validProjection.safeFrame, width: 0 }
      },
      {
        ...validProjection,
        safeFrame: { ...validProjection.safeFrame, y: -1 }
      },
      {
        ...validProjection,
        safeFrame: { ...validProjection.safeFrame, height: Number.NaN }
      }
    ]) {
      expect(
        projectFlatCameraReferencePoint(validPoint, projection),
        JSON.stringify(projection)
      ).toBeNull();
    }

    for (const point of [
      [Number.NaN, 0],
      [0, Number.POSITIVE_INFINITY],
      [-0.1, 0],
      [FLAT_CAMERA_REFERENCE_IMAGE.width + 0.1, 0],
      [0, FLAT_CAMERA_REFERENCE_IMAGE.height + 0.1]
    ] as const) {
      expect(
        projectFlatCameraReferencePoint(point, validProjection),
        JSON.stringify(point)
      ).toBeNull();
    }

    for (const bounds of [
      {
        minimumX: Number.NaN,
        maximumX: 100,
        minimumY: 0,
        maximumY: 100
      },
      { minimumX: 100, maximumX: 99, minimumY: 0, maximumY: 100 },
      { minimumX: -0.1, maximumX: 100, minimumY: 0, maximumY: 100 },
      {
        minimumX: 0,
        maximumX: FLAT_CAMERA_REFERENCE_IMAGE.width + 0.1,
        minimumY: 0,
        maximumY: 100
      },
      {
        minimumX: 0,
        maximumX: 100,
        minimumY: 0,
        maximumY: FLAT_CAMERA_REFERENCE_IMAGE.height + 0.1
      }
    ]) {
      expect(
        projectFlatCameraReferenceBounds(bounds, validProjection),
        JSON.stringify(bounds)
      ).toBeNull();
    }
  });
});
