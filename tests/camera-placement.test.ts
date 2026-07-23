import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  calculateCameraPlacement,
  calculateCameraPlacementInto,
  createCameraPlacementBuffer
} from "../app/world/CameraPlacement";

function verticalNdc(
  point: Vector3,
  position: Vector3,
  target: Vector3,
  up: Vector3,
  verticalFovDegrees = 48
) {
  const forward = target.clone().sub(position).normalize();
  const right = forward.clone().cross(up).normalize();
  const cameraUp = right.clone().cross(forward).normalize();
  const relative = point.clone().sub(position);
  const depth = relative.dot(forward);
  const vertical = relative.dot(cameraUp);
  return (
    vertical /
    (depth * Math.tan((verticalFovDegrees * Math.PI) / 360))
  );
}

function horizontalNdc(
  point: Vector3,
  position: Vector3,
  target: Vector3,
  up: Vector3,
  verticalFovDegrees: number,
  aspect: number
) {
  const forward = target.clone().sub(position).normalize();
  const right = forward.clone().cross(up).normalize();
  const relative = point.clone().sub(position);
  const depth = relative.dot(forward);
  const horizontal = relative.dot(right);
  return (
    horizontal /
    (depth * Math.tan((verticalFovDegrees * Math.PI) / 360) * aspect)
  );
}

describe("third-person camera placement", () => {
  it("reuses its vectors across animation frames", () => {
    const buffer = createCameraPlacementBuffer();
    const input = {
      player: new Vector3(0, 12, 0),
      surfaceNormal: new Vector3(0, 1, 0),
      heading: new Vector3(0, 0, -1),
      yaw: 0,
      pitch: -8
    };

    const first = calculateCameraPlacementInto(input, buffer);
    const position = first.position;
    const second = calculateCameraPlacementInto(
      { ...input, yaw: 10 },
      buffer
    );

    expect(second).toBe(first);
    expect(second.position).toBe(position);
  });

  it.each([0, 90, 180, -90])(
    "keeps the player and nearby spherical route visible at maximum sky pitch and yaw %i",
    (yaw) => {
      const player = new Vector3(0, 12, 0);
      const normal = new Vector3(0, 1, 0);
      const heading = new Vector3(0, 0, -1);
      const placement = calculateCameraPlacement({
        player,
        surfaceNormal: normal,
        heading,
        yaw,
        pitch: 70
      });
      const feet = player;
      const shoulders = player.clone().addScaledVector(normal, 1.5);
      const head = player.clone().addScaledVector(normal, 2.2);
      const routeAhead = player
        .clone()
        .applyAxisAngle(heading.clone().cross(normal), -1 / 12);

      for (const visiblePoint of [feet, shoulders, head, routeAhead]) {
        expect(
          verticalNdc(
            visiblePoint,
            placement.position,
            placement.target,
            placement.up,
            placement.fov
          )
        ).toBeGreaterThanOrEqual(-1);
        expect(
          verticalNdc(
            visiblePoint,
            placement.position,
            placement.target,
            placement.up,
            placement.fov
          )
        ).toBeLessThanOrEqual(1);
      }

      expect(
        horizontalNdc(
          routeAhead,
          placement.position,
          placement.target,
          placement.up,
          placement.fov,
          390 / 667
        )
      ).toBeGreaterThanOrEqual(-1);
      expect(
        horizontalNdc(
          routeAhead,
          placement.position,
          placement.target,
          placement.up,
          placement.fov,
          390 / 667
        )
      ).toBeLessThanOrEqual(1);
      const viewElevation =
        (Math.asin(
          placement.target
            .clone()
            .sub(placement.position)
            .normalize()
            .dot(normal)
        ) *
          180) /
        Math.PI;
      expect(viewElevation).toBeGreaterThanOrEqual(30);
      expect(viewElevation).toBeLessThanOrEqual(35);
    }
  );

  it("moves the camera as pitch changes instead of only moving its target", () => {
    const input = {
      player: new Vector3(0, 12, 0),
      surfaceNormal: new Vector3(0, 1, 0),
      heading: new Vector3(0, 0, -1),
      yaw: 30
    };

    const pathView = calculateCameraPlacement({ ...input, pitch: -20 });
    const skyView = calculateCameraPlacement({ ...input, pitch: 70 });

    expect(skyView.position.distanceTo(pathView.position)).toBeGreaterThan(0.3);
    expect(skyView.fov).toBeGreaterThanOrEqual(72);
    expect(skyView.fov).toBeLessThanOrEqual(85);
    expect(pathView.fov).toBe(48);
    const pathDirection = pathView.target
      .clone()
      .sub(pathView.position)
      .normalize();
    const skyDirection = skyView.target
      .clone()
      .sub(skyView.position)
      .normalize();
    expect(
      (Math.asin(pathDirection.dot(input.surfaceNormal)) * 180) / Math.PI
    ).toBeCloseTo(-20, 6);
    expect(
      (Math.asin(skyDirection.dot(input.surfaceNormal)) * 180) / Math.PI
    ).toBeCloseTo(32, 6);
  });
});
