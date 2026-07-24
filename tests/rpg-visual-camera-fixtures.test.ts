import { describe, expect, it } from "vitest";
import { getRegionCameraProfile } from "../app/world/ChaseOrbitCamera";
import {
  RPG_LANDMARKS,
  isRpgWalkablePosition
} from "../app/world/RpgTownSceneLayout";
import {
  RPG_VISUAL_CAMERA_FIXTURES,
  resolveRpgVisualCameraYaw
} from "./fixtures/rpg-visual-camera-fixtures";

function averageLandmarkXZ(ids: readonly string[]) {
  const landmarks = ids.map((id) => {
    const landmark = RPG_LANDMARKS.find((candidate) => candidate.id === id);
    if (!landmark) throw new Error(`Unknown landmark ${id}`);
    return landmark;
  });
  return [
    landmarks.reduce((sum, landmark) => sum + landmark.position[0], 0) /
      landmarks.length,
    landmarks.reduce((sum, landmark) => sum + landmark.position[2], 0) /
      landmarks.length
  ] as const;
}

describe("RPG visual camera fixtures", () => {
  it("keeps visual proof distances and pitches synchronized with the live camera", () => {
    for (const [zoneId, fixture] of Object.entries(
      RPG_VISUAL_CAMERA_FIXTURES
    )) {
      const desktop = getRegionCameraProfile(
        zoneId as keyof typeof RPG_VISUAL_CAMERA_FIXTURES,
        "desktop"
      );
      const mobile = getRegionCameraProfile(
        zoneId as keyof typeof RPG_VISUAL_CAMERA_FIXTURES,
        "mobile"
      );

      if (zoneId === "hanabi") {
        expect(fixture.pitchDegrees).toBe(0);
        expect(fixture.pitchDegrees).toBeLessThan(desktop.pitchDegrees);
      } else {
        expect(fixture.pitchDegrees, zoneId).toBe(desktop.pitchDegrees);
      }
      expect(fixture.desktopDistance, zoneId).toBe(desktop.distance);
      expect(fixture.mobileDistance, zoneId).toBeCloseTo(mobile.distance, 10);
    }
  });

  it("derives multi-landmark scenic focus points from the canonical model", () => {
    for (const zoneId of ["tokyo", "gyukatsu", "sakura", "hanabi"] as const) {
      const fixture = RPG_VISUAL_CAMERA_FIXTURES[zoneId];
      expect(fixture.focusWorldXZ).toEqual(
        averageLandmarkXZ(fixture.focusLandmarkIds)
      );
    }
  });

  it("resolves yaw from the player to the scenic focus instead of route heading", () => {
    const fixture = RPG_VISUAL_CAMERA_FIXTURES.hanabi;
    const player = [27, 0, -22] as const;
    const expected =
      Math.atan2(
        fixture.focusWorldXZ[0] - player[0],
        fixture.focusWorldXZ[1] - player[2]
      ) +
      fixture.screenOffsetDegrees * Math.PI / 180;

    expect(resolveRpgVisualCameraYaw(fixture, player)).toBeCloseTo(expected, 10);
  });

  it("uses reachable scenic routes and positions for landmark captures", () => {
    for (const zoneId of ["tokyo", "gyukatsu", "sakura", "hanabi"] as const) {
      const fixture = RPG_VISUAL_CAMERA_FIXTURES[zoneId];
      const position = fixture.capturePosition;
      expect(position, zoneId).toBeDefined();
      for (const point of [...(fixture.captureRoute ?? []), position!]) {
        expect(
          isRpgWalkablePosition(point[0], point[1]),
          `${zoneId}:${point}`
        ).toBe(true);
      }
      const mobilePosition = fixture.mobileCapturePosition;
      for (const point of [
        ...(fixture.mobileCaptureRoute ?? []),
        ...(mobilePosition ? [mobilePosition] : [])
      ]) {
        expect(
          isRpgWalkablePosition(point[0], point[1]),
          `${zoneId}:mobile:${point}`
        ).toBe(true);
      }
    }
  });

  it("approaches both Sakura frames through collision-free routes", () => {
    const fixture = RPG_VISUAL_CAMERA_FIXTURES.sakura;
    expect(fixture.captureRoute).toEqual([
      [10, -18],
      [8, -20],
      [0, -20],
      [0, -24],
      [-4, -24],
      [-4, -30]
    ]);
    expect(fixture.capturePosition).toEqual([-4, -30]);
    expect(fixture.mobileCaptureRoute).toEqual([
      [10, -18],
      [8, -20],
      [8, -30],
      [2, -30],
      [2, -36],
      [8, -36]
    ]);
    expect(fixture.mobileCapturePosition).toEqual([8, -36]);
  });

  it("frames the Tokyo tower from the open center connector", () => {
    const fixture = RPG_VISUAL_CAMERA_FIXTURES.tokyo;
    expect(fixture.capturePosition).toEqual([-8, 12]);
    expect(fixture.captureRoute).toEqual([
      [-7, 20],
      [-7, 12],
      [-8, 12]
    ]);
    expect(fixture.screenOffsetDegrees).toBe(0);
    expect(fixture.pitchDegrees).toBe(18);
  });

  it("approaches Hanabi from the north so the market and fireworks share the frame", () => {
    const fixture = RPG_VISUAL_CAMERA_FIXTURES.hanabi;
    expect(fixture.captureRoute).toEqual([
      [18, -18],
      [18, -12],
      [18, -8],
      [18, -4],
      [18, 0],
      [22, 0]
    ]);
    expect(fixture.capturePosition).toEqual([22, 0]);
    expect(fixture.pitchDegrees).toBe(0);
    expect(fixture.screenOffsetDegrees).toBe(-6);
    expect(fixture.mobileScreenOffsetDegrees).toBe(-8);
  });

  it("fits both Sakura landmarks inside the portrait mobile field of view", () => {
    const fixture = RPG_VISUAL_CAMERA_FIXTURES.sakura;
    const player = [
      fixture.mobileCapturePosition![0],
      0,
      fixture.mobileCapturePosition![1]
    ] as const;
    const yaw = resolveRpgVisualCameraYaw(
      fixture,
      player,
      fixture.focusWorldXZ,
      fixture.mobileScreenOffsetDegrees
    );
    const verticalFov =
      getRegionCameraProfile("sakura", "mobile").fovDegrees *
      Math.PI / 180;
    const horizontalFov =
      2 * Math.atan(Math.tan(verticalFov / 2) * (390 / 844));

    for (const landmarkId of fixture.focusLandmarkIds) {
      const landmark = RPG_LANDMARKS.find(({ id }) => id === landmarkId)!;
      const landmarkYaw = Math.atan2(
        landmark.position[0] - player[0],
        landmark.position[2] - player[2]
      );
      const offset = Math.abs(
        Math.atan2(
          Math.sin(landmarkYaw - yaw),
          Math.cos(landmarkYaw - yaw)
        )
      );
      expect(
        offset,
        `${landmarkId} must retain at least one degree of horizontal margin`
      ).toBeLessThan(horizontalFov / 2 - Math.PI / 180);
    }
  });
});
