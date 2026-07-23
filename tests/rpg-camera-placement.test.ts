import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { stepFlatCameraSourceOffset } from "../app/world/CameraRig";
import {
  FLAT_CAMERA_MAX_STEP_CSS_PX,
  calculateFlatCameraPlacement,
  type FlatCameraPlacement,
  type FlatCameraProfileId
} from "../app/world/FlatCameraPlacement";
import { getSelectedPlayerRuntimeManifest } from "../app/world/CharacterAssets";
import {
  getNavigationRegionAt,
  isWalkable,
  projectWorldToReference,
  RPG_RUNTIME_REFERENCE_REGISTRATION,
  type NavigationRegion
} from "../app/world/RpgWorldGeometry";
import {
  RPG_CAMERA_REGION_PROGRESS_TOLERANCE,
  RPG_PLAYER_CANONICAL_MAX_SPRITE_SCALE,
  RPG_PLAYER_CANONICAL_MIN_SPRITE_SCALE,
  RPG_PLAYER_INTRINSIC_BASE_REFERENCE_HEIGHT,
  RPG_PLAYER_MAXIMUM_FOOT_OFFSET,
  RPG_PLAYER_MINIMUM_FOOT_OFFSET,
  RPG_PLAYER_PROFILE_SAFE_RECTANGLES,
  RPG_PLAYER_SPRITE_ASPECT_RATIO,
  advanceRpgCameraPoseInto,
  advanceRpgCameraFollowYaw,
  calculateRpgCameraFootingHeight,
  calculateRpgCameraPlacement,
  calculateRpgCameraPlacementInto,
  calculateRpgReferenceCameraPlacement,
  createRpgCameraPlacementBuffer,
  createRpgCameraFollowState,
  resolveRpgPlayerCameraReferenceBounds,
  resolveRpgPlayerViewportProjection,
  smoothstepRpgCameraProgress,
  translateRpgCameraWithPlayer,
  type RpgCameraRegionSelection
} from "../app/world/RpgCameraPlacement";
import {
  RPG_REFERENCE_ZONE_ANCHORS,
  RPG_TRANSITION_PROTECTED_PAIRS,
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_ROUTES,
  RPG_WORLD_SPAWN,
  RPG_WORLD_TRANSITIONS,
  type WorldPoint2,
  type WorldPolygon,
  type WorldTransition
} from "../app/world/RpgWorldModel";
import {
  resolveRpgReferenceViewportTransform
} from "../app/world/RpgReferenceSceneComposition";

const profileIds = ["desktop", "mobile"] as const;

const expectSourceOffsetClose = (
  actual: Readonly<{ x: number; y: number }>,
  expected: Readonly<{ x: number; y: number }>,
  label: string
) => {
  expect(actual.x, `${label}:source-offset-x`).toBeCloseTo(expected.x, 10);
  expect(actual.y, `${label}:source-offset-y`).toBeCloseTo(expected.y, 10);
};

const polygonSamples = (polygon: WorldPolygon) => {
  const centroid = [
    polygon.reduce((sum, [x]) => sum + x, 0) / polygon.length,
    polygon.reduce((sum, [, z]) => sum + z, 0) / polygon.length
  ] as const;
  return [
    ...polygon.map((point, index) => ({ label: `vertex-${index}`, point })),
    ...polygon.map((point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return {
        label: `edge-midpoint-${index}`,
        point: [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2] as const
      };
    }),
    { label: "centroid", point: centroid }
  ];
};

const transitionPoint = (transition: WorldTransition, progress: number) => {
  const [start, end] = transition.centerline;
  return [
    start[0] + (end[0] - start[0]) * progress,
    start[1] + (end[1] - start[1]) * progress
  ] as const;
};

interface CanonicalPlayerProjectionSample {
  readonly label: string;
  readonly point: WorldPoint2;
}

const canonicalPlayerProjectionSamples = () => {
  const candidates: CanonicalPlayerProjectionSample[] =
    RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints.map(({ id, worldXZ }) => ({
      label: `affine-vertex:${id}`,
      point: worldXZ
    }));
  for (const arrival of RPG_WORLD_ARRIVALS) {
    candidates.push({
      label: `arrival:${arrival.id}`,
      point: [arrival.position[0], arrival.position[2]]
    });
  }
  for (const route of RPG_WORLD_ROUTES) {
    for (const sample of polygonSamples(route.polygon)) {
      candidates.push({
        label: `route:${route.id}:${sample.label}`,
        point: sample.point
      });
    }
  }
  for (const transition of RPG_WORLD_TRANSITIONS) {
    for (const sample of polygonSamples(transition.polygon)) {
      candidates.push({
        label: `transition:${transition.id}:${sample.label}`,
        point: sample.point
      });
    }
    const progresses = [
      ...Array.from({ length: 21 }, (_, index) => index / 20),
      ...transition.dualProtectionRange
    ];
    for (const progress of [...new Set(progresses)].sort((a, b) => a - b)) {
      candidates.push({
        label: `transition:${transition.id}:progress=${progress}`,
        point: transitionPoint(transition, progress)
      });
    }
  }
  const unique = new Map<string, CanonicalPlayerProjectionSample>();
  for (const sample of candidates) {
    const key = sample.point.map((value) => value.toFixed(12)).join(",");
    if (!unique.has(key)) unique.set(key, sample);
  }
  return [...unique.values()];
};

const expectPlacementContained = (
  placement: FlatCameraPlacement,
  label: string
) => {
  const sourceLeft = placement.sourceOffset.x;
  const sourceRight = sourceLeft + placement.sourceWindow.width;
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

  expect(sourceLeft, `${label}:source-min`).toBeGreaterThanOrEqual(
    placement.feasibleInterval.minimumX
  );
  expect(sourceLeft, `${label}:source-max`).toBeLessThanOrEqual(
    placement.feasibleInterval.maximumX
  );
  expect(placement.sourceOffset.y, `${label}:source-y`).toBe(0);
  expect(placement.playerProjectedBounds.reference.minimumX, `${label}:player-left`)
    .toBeGreaterThanOrEqual(sourceLeft - 1e-9);
  expect(placement.playerProjectedBounds.reference.maximumX, `${label}:player-right`)
    .toBeLessThanOrEqual(sourceRight + 1e-9);
  expect(placement.playerProjectedBounds.safeFrame.minimumX, `${label}:player-safe-left`)
    .toBeGreaterThanOrEqual(placement.playerCssSafeRectangle.x - 1e-9);
  expect(placement.playerProjectedBounds.safeFrame.maximumX, `${label}:player-safe-right`)
    .toBeLessThanOrEqual(playerSafeRight + 1e-9);
  expect(placement.playerProjectedBounds.safeFrame.minimumY, `${label}:player-safe-top`)
    .toBeGreaterThanOrEqual(placement.playerCssSafeRectangle.y - 1e-9);
  expect(placement.playerProjectedBounds.safeFrame.maximumY, `${label}:player-safe-bottom`)
    .toBeLessThanOrEqual(playerSafeBottom + 1e-9);
  expect(placement.footProjectedBounds.safeFrame.minimumX, `${label}:foot-safe-left`)
    .toBeGreaterThanOrEqual(placement.footCssSafeRectangle.x - 1e-9);
  expect(placement.footProjectedBounds.safeFrame.maximumX, `${label}:foot-safe-right`)
    .toBeLessThanOrEqual(footSafeRight + 1e-9);
  expect(placement.footProjectedBounds.safeFrame.minimumY, `${label}:foot-safe-top`)
    .toBeGreaterThanOrEqual(placement.footCssSafeRectangle.y - 1e-9);
  expect(placement.footProjectedBounds.safeFrame.maximumY, `${label}:foot-safe-bottom`)
    .toBeLessThanOrEqual(footSafeBottom + 1e-9);

  for (const rectangle of placement.selectedProtectedRectangles) {
    expect(rectangle.minimumX, `${label}:${rectangle.sourceId}:left`)
      .toBeGreaterThanOrEqual(sourceLeft - 1e-9);
    expect(rectangle.maximumX, `${label}:${rectangle.sourceId}:right`)
      .toBeLessThanOrEqual(sourceRight + 1e-9);
    expect(rectangle.minimumY, `${label}:${rectangle.sourceId}:top`)
      .toBeGreaterThanOrEqual(0);
    expect(rectangle.maximumY, `${label}:${rectangle.sourceId}:bottom`)
      .toBeLessThanOrEqual(866);
  }
};

const expectedTransitionProtectedIds = (
  pair: (typeof RPG_TRANSITION_PROTECTED_PAIRS)[number],
  progress: number
) =>
  progress < 0.4
    ? [pair.fromId]
    : progress <= 0.6
      ? [pair.fromId, pair.toId]
      : [pair.toId];

const immutableRegionSnapshot = (region: NavigationRegion) => Object.freeze({
  ...region,
  highlightedZoneIds: Object.freeze([...region.highlightedZoneIds])
}) as RpgCameraRegionSelection;

const calculatePureSamplePlacement = (
  point: WorldPoint2,
  profile: FlatCameraProfileId
) => {
  const projection = projectWorldToReference(point);
  const region = getNavigationRegionAt(point);
  if (!projection || !region) return null;
  const viewportProjection = resolveRpgPlayerViewportProjection(
    projection,
    profile
  );
  const cameraBounds = viewportProjection
    ? resolveRpgPlayerCameraReferenceBounds(projection, viewportProjection)
    : null;
  const safeRectangles = RPG_PLAYER_PROFILE_SAFE_RECTANGLES[profile];
  if (!cameraBounds || !safeRectangles) return null;
  if (region.kind === "zone") {
    return calculateFlatCameraPlacement({
      profile,
      ...cameraBounds,
      playerCssSafeRectangle: safeRectangles.player,
      footCssSafeRectangle: safeRectangles.foot,
      protectedRectangles: [
        RPG_REFERENCE_ZONE_ANCHORS[region.regionId].cameraFocusRectangle
      ]
    });
  }
  const pair = RPG_TRANSITION_PROTECTED_PAIRS.find(
    ({ transitionId }) => transitionId === region.transitionId
  );
  const eased = smoothstepRpgCameraProgress(region.progress);
  if (!pair || eased === null) return null;
  const fromCenter =
    (pair.fromRectangle.minimumX + pair.fromRectangle.maximumX) / 2;
  const toCenter =
    (pair.toRectangle.minimumX + pair.toRectangle.maximumX) / 2;
  return calculateFlatCameraPlacement({
    profile,
    ...cameraBounds,
    playerCssSafeRectangle: safeRectangles.player,
    footCssSafeRectangle: safeRectangles.foot,
    protectedRectangles:
      region.progress < 0.4
        ? [pair.fromRectangle]
        : region.progress <= 0.6
          ? [pair.fromRectangle, pair.toRectangle]
          : [pair.toRectangle],
    trackingReferenceX: fromCenter + (toCenter - fromCenter) * eased
  });
};

describe("canonical player viewport projection", () => {
  it("maps every resulting affine vertex without changing raw registration", () => {
    const samples = canonicalPlayerProjectionSamples();
    const sampleCoordinates = new Set(
      samples.map(({ point }) => point.map((value) => value.toFixed(12)).join(","))
    );
    for (const controlPoint of RPG_RUNTIME_REFERENCE_REGISTRATION.controlPoints) {
      expect(sampleCoordinates).toContain(
        controlPoint.worldXZ.map((value) => value.toFixed(12)).join(",")
      );
    }
    const runtimeFrames = (["male", "female"] as const).flatMap(
      (character) => getSelectedPlayerRuntimeManifest(character).frames
    );
    expect(new Set(runtimeFrames.map(({ aspectRatio }) => aspectRatio))).toEqual(
      new Set([RPG_PLAYER_SPRITE_ASPECT_RATIO])
    );
    expect(Math.min(...runtimeFrames.map(({ footOffset }) => footOffset))).toBe(
      RPG_PLAYER_MINIMUM_FOOT_OFFSET
    );
    expect(Math.max(...runtimeFrames.map(({ footOffset }) => footOffset))).toBe(
      RPG_PLAYER_MAXIMUM_FOOT_OFFSET
    );
    const results = samples.map(({ label, point }) => {
      const raw = projectWorldToReference(point);
      expect(raw, label).not.toBeNull();
      const rawSnapshot = {
        ...raw!,
        pixel: [...raw!.pixel],
        uv: [...raw!.uv]
      };
      const desktop = resolveRpgPlayerViewportProjection(raw!, "desktop");
      const mobile = resolveRpgPlayerViewportProjection(raw!, "mobile");
      expect(desktop, `${label}:desktop`).not.toBeNull();
      expect(mobile, `${label}:mobile`).not.toBeNull();
      expect(raw, `${label}:raw`).toEqual(rawSnapshot);

      for (const resolved of [desktop!, mobile!]) {
        expect(resolved.intrinsicSpriteScale, label).toBe(raw!.spriteScale);
        expect(resolved.depthKey, label).toBe(raw!.depthKey);
        expect(resolved.intrinsicReferenceHeight, label).toBe(
          RPG_PLAYER_INTRINSIC_BASE_REFERENCE_HEIGHT * raw!.spriteScale
        );
      }
      expect(desktop!.displayReferenceHeight, label).toBe(
        RPG_PLAYER_INTRINSIC_BASE_REFERENCE_HEIGHT * raw!.spriteScale
      );
      expect(desktop!.displayCssHeight, label).toBe(
        desktop!.displayReferenceHeight * (900 / 866)
      );
      expect(mobile!.displayCssHeight, label).toBe(
        72 +
          (raw!.spriteScale - RPG_PLAYER_CANONICAL_MIN_SPRITE_SCALE) *
            (40 / 0.58)
      );
      expect(mobile!.displayReferenceHeight, label).toBe(
        mobile!.displayCssHeight / (420 / 866)
      );
      expect(mobile!.displayCssHeight, label).toBeGreaterThanOrEqual(
        72 - 1e-10
      );
      expect(mobile!.displayCssHeight, label).toBeLessThanOrEqual(
        112 + 1e-10
      );

      for (const profile of profileIds) {
        const viewportProjection =
          profile === "desktop" ? desktop! : mobile!;
        const cameraBounds = resolveRpgPlayerCameraReferenceBounds(
          raw!,
          viewportProjection
        );
        expect(cameraBounds, `${label}:${profile}:camera-bounds`).not.toBeNull();
        const height = viewportProjection.displayReferenceHeight;
        expect(cameraBounds!.playerReferenceBounds, `${label}:${profile}:envelope`)
          .toEqual({
            minimumX:
              raw!.pixel[0] - (height * RPG_PLAYER_SPRITE_ASPECT_RATIO) / 2,
            maximumX:
              raw!.pixel[0] + (height * RPG_PLAYER_SPRITE_ASPECT_RATIO) / 2,
            minimumY:
              raw!.pixel[1] -
              height * (1 - RPG_PLAYER_MINIMUM_FOOT_OFFSET),
            maximumY:
              raw!.pixel[1] + height * RPG_PLAYER_MAXIMUM_FOOT_OFFSET
          });
        expect(cameraBounds!.footReferenceBounds).toEqual({
          minimumX: raw!.pixel[0],
          maximumX: raw!.pixel[0],
          minimumY: raw!.pixel[1],
          maximumY: raw!.pixel[1]
        });
        for (const frame of runtimeFrames) {
          const frameBounds = {
            minimumX:
              raw!.pixel[0] - (height * frame.aspectRatio) / 2,
            maximumX:
              raw!.pixel[0] + (height * frame.aspectRatio) / 2,
            minimumY: raw!.pixel[1] - height * (1 - frame.footOffset),
            maximumY: raw!.pixel[1] + height * frame.footOffset
          };
          expect(
            frameBounds.minimumX,
            `${label}:${profile}:${frame.asset}:left`
          ).toBeGreaterThanOrEqual(
            cameraBounds!.playerReferenceBounds.minimumX - 1e-12
          );
          expect(
            frameBounds.maximumX,
            `${label}:${profile}:${frame.asset}:right`
          ).toBeLessThanOrEqual(
            cameraBounds!.playerReferenceBounds.maximumX + 1e-12
          );
          expect(
            frameBounds.minimumY,
            `${label}:${profile}:${frame.asset}:top`
          ).toBeGreaterThanOrEqual(
            cameraBounds!.playerReferenceBounds.minimumY - 1e-12
          );
          expect(
            frameBounds.maximumY,
            `${label}:${profile}:${frame.asset}:bottom`
          ).toBeLessThanOrEqual(
            cameraBounds!.playerReferenceBounds.maximumY + 1e-12
          );
        }

        const purePlacement = calculatePureSamplePlacement(point, profile);
        const placement = calculateRpgReferenceCameraPlacement({
          player: point,
          profile
        });
        if (!isWalkable(point) || !purePlacement) {
          expect(placement, `${label}:${profile}:placement`).toBeNull();
          continue;
        }
        expect(purePlacement, `${label}:${profile}:pure-placement`).not.toBeNull();
        expectPlacementContained(
          purePlacement!,
          `${label}:${profile}:pure-placement`
        );
        expect(placement, `${label}:${profile}:placement`).not.toBeNull();
        expect(placement!.playerReferenceProjection).toEqual(raw);
        expect(placement!.playerViewportProjection).toEqual(viewportProjection);
        expect(placement!.playerReferenceBounds).toEqual(
          cameraBounds!.playerReferenceBounds
        );
        expect(placement!.footReferenceBounds).toEqual(
          cameraBounds!.footReferenceBounds
        );
        expect(placement!.playerProjectedBounds.reference).toBe(
          placement!.playerReferenceBounds
        );
        expect(placement!.footProjectedBounds.reference).toBe(
          placement!.footReferenceBounds
        );
      }
      return { label, point, raw: raw!, desktop: desktop!, mobile: mobile! };
    });

    const ordered = [...results].sort(
      (left, right) => left.raw.spriteScale - right.raw.spriteScale
    );
    expect(ordered[0].raw.spriteScale).toBeGreaterThanOrEqual(
      RPG_PLAYER_CANONICAL_MIN_SPRITE_SCALE - Number.EPSILON
    );
    expect(ordered.at(-1)!.raw.spriteScale).toBeLessThanOrEqual(
      RPG_PLAYER_CANONICAL_MAX_SPRITE_SCALE
    );

    const distinctScales = [
      ...new Map(
        ordered.map((result) => [result.raw.spriteScale, result] as const)
      ).values()
    ];
    for (let index = 1; index < distinctScales.length; index += 1) {
      expect(distinctScales[index].raw.spriteScale).toBeGreaterThan(
        distinctScales[index - 1].raw.spriteScale
      );
      expect(distinctScales[index].mobile.displayCssHeight).toBeGreaterThan(
        distinctScales[index - 1].mobile.displayCssHeight
      );
    }
  });

  it("maps exact endpoints and fails closed instead of clamping", () => {
    expect(RPG_PLAYER_PROFILE_SAFE_RECTANGLES).toEqual({
      desktop: {
        player: { x: 96, y: 48, width: 1248, height: 804 },
        foot: { x: 120, y: 120, width: 1200, height: 720 }
      },
      mobile: {
        player: { x: 0, y: 64, width: 390, height: 420 },
        foot: { x: 32, y: 104, width: 326, height: 284 }
      }
    });
    const projection = { spriteScale: 0.64, depthKey: 0.25 };
    expect(resolveRpgPlayerViewportProjection(projection, "mobile")).toEqual({
      profile: "mobile",
      intrinsicSpriteScale: 0.64,
      depthKey: 0.25,
      intrinsicReferenceHeight: 115.2,
      displayReferenceHeight: 72 / (420 / 866),
      displayCssHeight: 72
    });
    expect(resolveRpgPlayerViewportProjection(
      { ...projection, spriteScale: 1.22 },
      "mobile"
    )).toEqual({
      profile: "mobile",
      intrinsicSpriteScale: 1.22,
      depthKey: 0.25,
      intrinsicReferenceHeight: 219.6,
      displayReferenceHeight: 112 / (420 / 866),
      displayCssHeight: 112
    });

    for (const spriteScale of [
      0.64 - Number.EPSILON,
      0.64 - 1e-6,
      1.22 + Number.EPSILON,
      1.22 + 1e-6,
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY
    ]) {
      expect(resolveRpgPlayerViewportProjection(
        { ...projection, spriteScale },
        "mobile"
      )).toBeNull();
    }
    for (const depthKey of [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY
    ]) {
      expect(resolveRpgPlayerViewportProjection(
        { ...projection, depthKey },
        "desktop"
      )).toBeNull();
    }
    expect(resolveRpgPlayerViewportProjection(
      projection,
      "unsupported" as FlatCameraProfileId
    )).toBeNull();
  });

  it("keeps airborne sprite displacement telemetry-only", () => {
    const rawProjection = {
      pixel: [900, 500] as const,
      spriteScale: 1,
      depthKey: 0.5
    };
    const firstJumpHeight = (6 - 15 / 60) / 60;
    for (const profile of profileIds) {
      const viewportProjection = resolveRpgPlayerViewportProjection(
        rawProjection,
        profile
      )!;
      const groundedBounds = resolveRpgPlayerCameraReferenceBounds(
        rawProjection,
        viewportProjection
      )!;
      const groupScale =
        viewportProjection.displayReferenceHeight /
        (2.1 * rawProjection.spriteScale);
      const airborneTop =
        groundedBounds.playerReferenceBounds.minimumY -
        firstJumpHeight * groupScale;

      expect(airborneTop, profile).toBeLessThan(
        groundedBounds.playerReferenceBounds.minimumY
      );
      expect(calculateFlatCameraPlacement({
        profile,
        ...groundedBounds,
        playerCssSafeRectangle:
          RPG_PLAYER_PROFILE_SAFE_RECTANGLES[profile].player,
        footCssSafeRectangle: RPG_PLAYER_PROFILE_SAFE_RECTANGLES[profile].foot
      }), profile).not.toBeNull();
    }

    const canvasSource = readFileSync(
      resolve(process.cwd(), "app/world/FlatWorldCanvas.tsx"),
      "utf8"
    );
    expect(canvasSource).toContain(
      "playerActualReferenceBounds: formatBounds(referenceBounds)"
    );
    expect(canvasSource).toContain("playerGrounded: String(navigation.grounded)");
    expect(canvasSource).not.toContain('failClosed("sprite-envelope-subset-failed")');
  });
});

describe("measured fixed-backdrop RPG camera", () => {
  it("derives the corrected Airport and Hanabi mobile source crops", () => {
    const expected = {
      airport: { sourceOffsetX: 305, sourceOffsetY: 138 },
      hanabi: { sourceOffsetX: 1420, sourceOffsetY: 178 }
    } as const;

    for (const zoneId of ["airport", "hanabi"] as const) {
      const player = zoneId === "airport"
        ? RPG_WORLD_SPAWN
        : RPG_WORLD_ARRIVALS.find(
            ({ zoneId: candidate }) => candidate === zoneId
          )!.position;
      const placement = calculateRpgReferenceCameraPlacement({
        player,
        profile: "mobile"
      })!;
      const transform = resolveRpgReferenceViewportTransform({
        profile: "mobile",
        referenceFoot: placement.playerReferenceProjection.pixel,
        navigationRegion: placement.region,
        revision: 0,
        navigationRevision: 0
      })!;
      expect(transform.sourceOffsetX, `${zoneId}:source-x`)
        .toBeCloseTo(expected[zoneId].sourceOffsetX, 12);
      expect(transform.sourceOffsetY, `${zoneId}:source-y`)
        .toBeCloseTo(expected[zoneId].sourceOffsetY, 12);
      expect(transform.safeFrame).toEqual({
        x: 0,
        y: 64,
        width: 390,
        height: 780
      });
      expect(transform.scale).toBe(1.3);
    }
  });

  it.each(profileIds)(
    "places all five zone arrivals with the measured camera focus on %s",
    (profile) => {
      for (const arrival of RPG_WORLD_ARRIVALS) {
        const anchor = RPG_REFERENCE_ZONE_ANCHORS[arrival.zoneId];
        const placement = calculateRpgReferenceCameraPlacement({
          player: arrival.position,
          profile
        });
        const canonicalRegion = getNavigationRegionAt(arrival.position)!;
        expect(placement, `${profile}:${arrival.id}`).not.toBeNull();
        expect(placement!.region).toEqual(canonicalRegion);
        expect(placement!.selectedProtectedIds).toEqual([anchor.sourceId]);
        expect(placement!.selectedProtectedRectangles[0].id)
          .toBe(anchor.cameraFocusRectangle.id);
        expect(placement!.trackingReferenceX).toBe(
          placement!.playerReferenceProjection.pixel[0]
        );
        expectPlacementContained(placement!, `${profile}:${arrival.id}`);
        expect(calculateRpgReferenceCameraPlacement({
          player: arrival.position,
          profile,
          region: immutableRegionSnapshot(canonicalRegion)
        })).toEqual(placement);
      }
    }
  );

  it.each(profileIds)(
    "matches pure camera feasibility at every route sample on %s",
    (profile) => {
      for (const route of RPG_WORLD_ROUTES) {
        for (const sample of polygonSamples(route.polygon)) {
          const label = `${profile}:${route.id}:${sample.label}`;
          const purePlacement = calculatePureSamplePlacement(sample.point, profile);
          const placement = calculateRpgReferenceCameraPlacement({
            player: sample.point,
            profile
          });
          if (!isWalkable(sample.point) || !purePlacement) {
            expect(placement, label).toBeNull();
          } else {
            expectPlacementContained(purePlacement, `${label}:pure-crop`);
            expect(placement, label).not.toBeNull();
            expectSourceOffsetClose(
              placement!.sourceOffset,
              purePlacement.sourceOffset,
              label
            );
            expectPlacementContained(placement!, label);
          }
        }
      }
    }
  );

  it.each(profileIds)(
    "uses each explicit transition pair for every polygon sample on %s",
    (profile) => {
      for (const transition of RPG_WORLD_TRANSITIONS) {
        for (const sample of polygonSamples(transition.polygon)) {
          const label = `${profile}:${transition.id}:${sample.label}`;
          const canonicalRegion = getNavigationRegionAt(sample.point)!;
          expect(canonicalRegion.kind, label).toBe("transition");
          if (canonicalRegion.kind !== "transition") {
            throw new Error(`${label}: expected transition`);
          }
          const purePlacement = calculatePureSamplePlacement(sample.point, profile);
          expect(purePlacement, `${label}:pure-crop`).not.toBeNull();
          expectPlacementContained(purePlacement!, `${label}:pure-crop`);
          const placement = calculateRpgReferenceCameraPlacement({
            player: sample.point,
            profile,
            region: immutableRegionSnapshot(canonicalRegion)
          });
          if (!isWalkable(sample.point)) {
            expect(placement, label).toBeNull();
          } else {
            const pair = RPG_TRANSITION_PROTECTED_PAIRS.find(
              ({ transitionId }) =>
                canonicalRegion.kind === "transition" &&
                transitionId === canonicalRegion.transitionId
            )!;
            expect(placement, label).not.toBeNull();
            expect(placement!.selectedProtectedIds, label).toEqual(
              expectedTransitionProtectedIds(pair, canonicalRegion.progress)
            );
            expectSourceOffsetClose(
              placement!.sourceOffset,
              purePlacement!.sourceOffset,
              label
            );
            expectPlacementContained(placement!, label);
          }
        }
      }
    }
  );

  it.each(profileIds)(
    "tracks every transition through 21 smoothstep samples and exact protection boundaries on %s",
    (profile) => {
      for (const transition of RPG_WORLD_TRANSITIONS) {
        const pair = RPG_TRANSITION_PROTECTED_PAIRS.find(
          ({ transitionId }) => transitionId === transition.id
        )!;
        const fromCenter =
          (pair.fromRectangle.minimumX + pair.fromRectangle.maximumX) / 2;
        const toCenter =
          (pair.toRectangle.minimumX + pair.toRectangle.maximumX) / 2;
        const progresses = [
          ...Array.from({ length: 21 }, (_, index) => index / 20),
          ...transition.dualProtectionRange
        ];
        const uniqueProgresses = [...new Set(progresses)].sort((a, b) => a - b);

        for (const progress of uniqueProgresses) {
          const label = `${profile}:${transition.id}:progress=${progress}`;
          const point = transitionPoint(transition, progress);
          const canonicalRegion = getNavigationRegionAt(point)!;
          const purePlacement = calculatePureSamplePlacement(point, profile);
          expect(purePlacement, `${label}:pure-crop`).not.toBeNull();
          expect(purePlacement!.selectedProtectedIds, `${label}:pure-crop`).toEqual(
            expectedTransitionProtectedIds(pair, progress)
          );
          expectPlacementContained(purePlacement!, `${label}:pure-crop`);
          const placement = calculateRpgReferenceCameraPlacement({
            player: point,
            profile,
            region: immutableRegionSnapshot(canonicalRegion)
          });
          const eased = smoothstepRpgCameraProgress(progress)!;
          if (!isWalkable(point)) {
            expect(placement, label).toBeNull();
          } else {
            expect(placement, label).not.toBeNull();
            expect(placement!.selectedProtectedIds, label).toEqual(
              expectedTransitionProtectedIds(pair, progress)
            );
            expect(placement!.trackingReferenceX, label).toBeCloseTo(
              fromCenter + (toCenter - fromCenter) * eased,
              10
            );
            expectSourceOffsetClose(
              placement!.sourceOffset,
              purePlacement!.sourceOffset,
              label
            );
            expectPlacementContained(placement!, label);
          }
        }
      }
    }
  );

  it.each(profileIds)(
    "intersects every pure next interval while limiting 21-sample motion on %s",
    (profile) => {
      for (const transition of RPG_WORLD_TRANSITIONS) {
        const placements = Array.from({ length: 21 }, (_, index) => {
          const progress = index / 20;
          return calculatePureSamplePlacement(
            transitionPoint(transition, progress),
            profile
          )!;
        });
        let currentSourceOffsetX = placements[0].sourceOffset.x;
        for (let index = 1; index < placements.length; index += 1) {
          const next = placements[index];
          const label = `${profile}:${transition.id}:temporal-${index}`;
          const step = stepFlatCameraSourceOffset({
            currentSourceOffsetX,
            targetSourceOffsetX: next.sourceOffset.x,
            backdropScale: next.backdropScale,
            nextFeasibleInterval: next.feasibleInterval
          });
          expect(step, label).not.toBeNull();
          expect(step!.movementCssPixels, label)
            .toBeLessThanOrEqual(FLAT_CAMERA_MAX_STEP_CSS_PX + 1e-9);
          expect(step!.sourceOffsetX, label)
            .toBeGreaterThanOrEqual(next.feasibleInterval.minimumX);
          expect(step!.sourceOffsetX, label)
            .toBeLessThanOrEqual(next.feasibleInterval.maximumX);
          currentSourceOffsetX = step!.sourceOffsetX;
        }
      }
    }
  );

  it("uses an exact smoothstep and fails closed outside its progress domain", () => {
    expect(smoothstepRpgCameraProgress(0)).toBe(0);
    expect(smoothstepRpgCameraProgress(0.25)).toBe(0.15625);
    expect(smoothstepRpgCameraProgress(0.5)).toBe(0.5);
    expect(smoothstepRpgCameraProgress(0.75)).toBe(0.84375);
    expect(smoothstepRpgCameraProgress(1)).toBe(1);
    for (const progress of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(smoothstepRpgCameraProgress(progress)).toBeNull();
    }
  });

  it.each(profileIds)(
    "keeps render projection available but rejects the non-walkable canal player on %s",
    (profile) => {
      const point = [16.6, 0] as const;
      expect(projectWorldToReference(point)).not.toBeNull();
      expect(isWalkable(point)).toBe(false);
      expect(getNavigationRegionAt(point)).toBeNull();
      expect(calculatePureSamplePlacement(point, profile)).toBeNull();
      expect(calculateRpgReferenceCameraPlacement({ player: point, profile }))
        .toBeNull();
    }
  );

  it("fails closed for non-finite and outside player coordinates", () => {
    for (const input of [
      { player: [Number.NaN, 0] as const, profile: "desktop" as const },
      { player: [0, Number.POSITIVE_INFINITY] as const, profile: "mobile" as const },
      { player: [1000, 1000] as const, profile: "desktop" as const }
    ]) {
      expect(calculateRpgReferenceCameraPlacement(input)).toBeNull();
    }
  });

  it("rejects stale zone IDs, display zone, and highlights", () => {
    const airport = RPG_WORLD_ARRIVALS.find(({ zoneId }) => zoneId === "airport")!;
    const tokyo = RPG_WORLD_ARRIVALS.find(({ zoneId }) => zoneId === "tokyo")!;
    const airportRegion = getNavigationRegionAt(airport.position)!;
    const tokyoRegion = getNavigationRegionAt(tokyo.position)!;
    expect(airportRegion.kind).toBe("zone");
    expect(tokyoRegion.kind).toBe("zone");
    expect(calculateRpgReferenceCameraPlacement({
      player: airport.position,
      profile: "desktop",
      region: immutableRegionSnapshot(airportRegion)
    })).not.toBeNull();
    expect(calculateRpgReferenceCameraPlacement({
      player: airport.position,
      profile: "desktop",
      region: immutableRegionSnapshot(tokyoRegion)
    })).toBeNull();
    expect(calculateRpgReferenceCameraPlacement({
      player: airport.position,
      profile: "desktop",
      region: {
        ...airportRegion,
        displayZoneId: "tokyo"
      } as RpgCameraRegionSelection
    })).toBeNull();
    expect(calculateRpgReferenceCameraPlacement({
      player: airport.position,
      profile: "desktop",
      region: {
        ...airportRegion,
        highlightedZoneIds: ["tokyo"]
      } as RpgCameraRegionSelection
    })).toBeNull();
  });

  it.each([0.4, 0.6])(
    "validates immutable transition snapshots and progress tolerance at %s",
    (progress) => {
      const transition = RPG_WORLD_TRANSITIONS.find(
        ({ id }) => id === "airport-to-tokyo"
      )!;
      const point = transitionPoint(transition, progress);
      const canonical = getNavigationRegionAt(point)!;
      expect(isWalkable(point)).toBe(true);
      expect(canonical.kind).toBe("transition");
      if (canonical.kind !== "transition") throw new Error("expected transition");
      const input = { player: point, profile: "mobile" as const };

      expect(calculateRpgReferenceCameraPlacement({
        ...input,
        region: immutableRegionSnapshot(canonical)
      })).not.toBeNull();
      expect(calculateRpgReferenceCameraPlacement({
        ...input,
        region: {
          ...canonical,
          progress: canonical.progress + RPG_CAMERA_REGION_PROGRESS_TOLERANCE / 2
        }
      })).not.toBeNull();
      expect(calculateRpgReferenceCameraPlacement({
        ...input,
        region: {
          ...canonical,
          progress: canonical.progress + RPG_CAMERA_REGION_PROGRESS_TOLERANCE * 2
        }
      })).toBeNull();
      expect(calculateRpgReferenceCameraPlacement({
        ...input,
        region: {
          ...canonical,
          transitionId: "airport-to-gyukatsu"
        }
      })).toBeNull();
      expect(calculateRpgReferenceCameraPlacement({
        ...input,
        region: {
          ...canonical,
          regionId: "airport-to-gyukatsu"
        }
      })).toBeNull();
      expect(calculateRpgReferenceCameraPlacement({
        ...input,
        region: {
          ...canonical,
          displayZoneId:
            canonical.displayZoneId === transition.fromZoneId
              ? transition.toZoneId
              : transition.fromZoneId
        }
      })).toBeNull();
      expect(calculateRpgReferenceCameraPlacement({
        ...input,
        region: {
          ...canonical,
          highlightedZoneIds: [...canonical.highlightedZoneIds].reverse()
        }
      })).toBeNull();
    }
  );

  it("keeps the compatibility bridge deterministic and free of orbit compensation", () => {
    const buffer = createRpgCameraPlacementBuffer();
    const placement = calculateRpgCameraPlacementInto({
      player: [4, 0.3, -8],
      heading: [0, 0, -1],
      camera: { yaw: 0, pitch: -20 }
    }, buffer);
    expect(placement.position.toArray()).toEqual([4, 8.3, -7.999]);
    expect(placement.target.toArray()).toEqual([4, 0.3, -8]);

    const desiredBuffer = createRpgCameraPlacementBuffer();
    buffer.placement.position.set(0, 0, 0);
    buffer.placement.target.set(2, 4, 6);
    desiredBuffer.placement.position.set(10, 20, 30);
    desiredBuffer.placement.target.set(6, 8, 10);
    advanceRpgCameraPoseInto(
      buffer.placement.position,
      buffer.placement.target,
      {
        position: desiredBuffer.placement.position,
        target: desiredBuffer.placement.target,
        fov: 52
      },
      Math.log(2) / 9
    );
    expect(buffer.placement.position.toArray()).toEqual([5, 10, 15]);
    expect(buffer.placement.target.toArray()).toEqual([4, 6, 8]);
    translateRpgCameraWithPlayer(
      buffer.placement.position,
      buffer.placement.target,
      buffer.forward.set(-1, 2, 3)
    );
    expect(buffer.placement.position.toArray()).toEqual([4, 12, 18]);
    expect(buffer.placement.target.toArray()).toEqual([3, 8, 11]);

    const first = calculateRpgCameraPlacement({
      player: [4, 0.3, -8],
      heading: [0, 0, -1],
      camera: { yaw: 0, pitch: -20 }
    });
    const changedAngles = calculateRpgCameraPlacement({
      player: [4, 0.3, -8],
      heading: [1, 0, 0],
      camera: { yaw: 170, pitch: 70 }
    });
    expect(changedAngles.position.toArray()).toEqual(first.position.toArray());
    expect(changedAngles.target.toArray()).toEqual(first.target.toArray());
    expect(changedAngles.fov).toBe(first.fov);

    const follow = createRpgCameraFollowState(170);
    expect(advanceRpgCameraFollowYaw(follow, {
      rigYawDegrees: -170,
      moving: true,
      dragging: true,
      deltaSeconds: 1
    })).toBe(0);
    expect(follow).toEqual({
      orbitYawDegrees: 0,
      rigYawDegrees: 0,
      recentering: false
    });

    const source = readFileSync(
      resolve(process.cwd(), "app/world/RpgCameraPlacement.ts"),
      "utf8"
    );
    expect(source).not.toContain("applyAxisAngle");
    expect(source).not.toContain("SKY_VIEW");
    expect(source).not.toMatch(/\b45\b/);
    expect(source).not.toMatch(
      /^\s*import\s+(?!type\b)[^;\n]*\sfrom\s*["']three["']/m
    );
    expect(source).not.toMatch(
      /\b(?:require|import)\s*\(\s*["']three["']\s*\)/
    );
  });
});

describe("camera footing compatibility", () => {
  it("keeps full ground steps and partial jump height finite", () => {
    expect(calculateRpgCameraFootingHeight(0.49, 0)).toBeCloseTo(0.49, 10);
    expect(calculateRpgCameraFootingHeight(0, 1.2)).toBeCloseTo(0.42, 10);
    expect(calculateRpgCameraFootingHeight(Number.NaN, Number.NaN)).toBe(0);
  });
});
