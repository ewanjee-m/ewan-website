import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import {
  calculateTownCameraPlacement,
  calculateTownCameraPlacementInto,
  createTownCameraPlacementBuffer
} from "../app/world/TownCameraPlacement";

function verticalNdc(
  point: Vector3,
  position: Vector3,
  target: Vector3,
  verticalFovDegrees: number
) {
  const forward = target.clone().sub(position).normalize();
  const right = forward.clone().cross(new Vector3(0, 1, 0)).normalize();
  const cameraUp = right.clone().cross(forward).normalize();
  const relative = point.clone().sub(position);
  const depth = relative.dot(forward);
  const vertical = relative.dot(cameraUp);

  return (
    vertical /
    (depth * Math.tan((verticalFovDegrees * Math.PI) / 360))
  );
}

describe("town close-follow camera placement", () => {
  it("stands behind and above the player while looking slightly ahead", () => {
    const player = [4, 0.3, -2] as const;
    const heading = [0, 0, -1] as const;
    const placement = calculateTownCameraPlacement({
      player,
      heading,
      camera: { yaw: 0, pitch: -8 }
    });
    const cameraOffset = placement.position
      .clone()
      .sub({ x: player[0], y: player[1], z: player[2] });
    const targetOffset = placement.target
      .clone()
      .sub({ x: player[0], y: player[1], z: player[2] });

    expect(cameraOffset.y).toBeGreaterThan(2);
    expect(cameraOffset.z).toBeGreaterThan(5);
    expect(targetOffset.z).toBeLessThan(-1);
    expect(placement.target.y).toBeGreaterThan(player[1]);
  });

  it.each([
    { yaw: 90, side: 1 },
    { yaw: -90, side: -1 }
  ])(
    "orbits a quarter turn around the player when yaw is $yaw degrees",
    ({ yaw, side }) => {
      const placement = calculateTownCameraPlacement({
        player: [0, 0, 0],
        heading: [0, 0, -1],
        camera: { yaw, pitch: -8 }
      });

      expect(placement.position.x * side).toBeGreaterThan(5);
      expect(placement.position.z).toBeCloseTo(0, 6);
      expect(placement.target.x * side).toBeLessThan(-1);
      expect(placement.target.z).toBeCloseTo(0, 6);
    }
  );

  it("shows more sky at high pitch and clamps extreme drag values", () => {
    const input = {
      player: [0, 0, 0] as const,
      heading: [0, 0, -1] as const,
      camera: { yaw: 0, pitch: -20 }
    };
    const pathView = calculateTownCameraPlacement(input);
    const skyView = calculateTownCameraPlacement({
      ...input,
      camera: { yaw: 0, pitch: 70 }
    });
    const extremeSkyView = calculateTownCameraPlacement({
      ...input,
      camera: { yaw: 0, pitch: Number.POSITIVE_INFINITY }
    });

    const pathDirection = pathView.target
      .clone()
      .sub(pathView.position)
      .normalize();
    const skyDirection = skyView.target
      .clone()
      .sub(skyView.position)
      .normalize();

    expect(skyDirection.y).toBeGreaterThan(pathDirection.y);
    expect(skyView.fov).toBeGreaterThan(pathView.fov);
    expect(extremeSkyView.position.toArray()).toEqual(
      skyView.position.toArray()
    );
    expect(extremeSkyView.target.toArray()).toEqual(skyView.target.toArray());
    for (const value of [
      ...skyView.position.toArray(),
      ...skyView.target.toArray(),
      skyView.fov
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it.each([-8, 70])(
    "keeps the full character visible at pitch %i",
    (pitch) => {
      const placement = calculateTownCameraPlacement({
        player: [0, 0, 0],
        heading: [0, 0, -1],
        camera: { yaw: 0, pitch }
      });

      for (const point of [
        new Vector3(0, 0, 0),
        new Vector3(0, 2.4, 0)
      ]) {
        expect(
          verticalNdc(
            point,
            placement.position,
            placement.target,
            placement.fov
          )
        ).toBeGreaterThanOrEqual(-1);
        expect(
          verticalNdc(
            point,
            placement.position,
            placement.target,
            placement.fov
          )
        ).toBeLessThanOrEqual(1);
      }
    }
  );

  it("reuses caller-owned output vectors across animation frames", () => {
    const buffer = createTownCameraPlacementBuffer();
    const input = {
      player: [0, 0, 0] as const,
      heading: [0, 0, -1] as const,
      camera: { yaw: 0, pitch: -8 }
    };
    const first = calculateTownCameraPlacementInto(input, buffer);
    const firstPosition = first.position;
    const firstTarget = first.target;
    const second = calculateTownCameraPlacementInto(
      { ...input, camera: { yaw: 35, pitch: 20 } },
      buffer
    );

    expect(second).toBe(first);
    expect(second.position).toBe(firstPosition);
    expect(second.target).toBe(firstTarget);
  });
});
