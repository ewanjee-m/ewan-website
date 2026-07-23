import { describe, expect, it } from "vitest";
import {
  projectWorldToReference,
  referenceToScene,
  sceneToWorld
} from "../app/world/RpgWorldGeometry";
import {
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_ORIENTATION,
  RPG_WORLD_TRANSITIONS,
  type WorldPoint2
} from "../app/world/RpgWorldModel";
import {
  RPG_WORLD_ROTATION_RADIANS,
  createRpgScreenDirection,
  createRpgWorldPoint,
  normalizeRpgReferenceDirectionInto,
  projectRpgWorldDirectionToScreenInto,
  rotateRpgWorldPointInto,
  unprojectRpgScreenDirectionToWorldInto,
  unrotateRpgWorldPointInto
} from "../app/world/RpgWorldTransform";

const REGION_POINTS = [
  ...RPG_WORLD_ARRIVALS.map(
    (arrival) =>
      [
        arrival.zoneId,
        [arrival.position[0], arrival.position[2]] as WorldPoint2
      ] as const
  ),
  ...RPG_WORLD_TRANSITIONS.map((transition) => {
    const [start, end] = transition.centerline;
    return [
      transition.id,
      [
        (start[0] + end[0]) / 2,
        (start[1] + end[1]) / 2
      ] as WorldPoint2
    ] as const;
  })
];

const CARDINAL_AND_DIAGONAL_DIRECTIONS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1]
] as const satisfies readonly WorldPoint2[];

function angleDifferenceDegrees(first: number, second: number) {
  const difference = Math.abs(first - second) % 360;
  return Math.min(difference, 360 - difference);
}

describe("RPG logical-to-rendered world transform", () => {
  it("uses the canonical world orientation for scene rotation", () => {
    const origin = rotateRpgWorldPointInto(
      [0, 0, 0],
      createRpgWorldPoint()
    );
    const routeRight = rotateRpgWorldPointInto(
      [1, 0, 0],
      createRpgWorldPoint()
    );

    expect(RPG_WORLD_ROTATION_RADIANS).toBe(
      RPG_WORLD_ORIENTATION.rotationRadians
    );
    expect(origin).toEqual([0, 0, 0]);
    expect(routeRight[0]).toBeCloseTo(
      Math.cos(RPG_WORLD_ORIENTATION.rotationRadians),
      8
    );
    expect(routeRight[2]).toBeCloseTo(
      -Math.sin(RPG_WORLD_ORIENTATION.rotationRadians),
      8
    );
  });

  it("preserves height and reuses a caller-owned point", () => {
    const point = createRpgWorldPoint();
    const result = rotateRpgWorldPointInto([-22, 1.4, 1.5], point);

    expect(result).toBe(point);
    expect(result[1]).toBe(1.4);
    expect(result.every(Number.isFinite)).toBe(true);
  });

  it("round-trips rendered camera points back into the logical town", () => {
    const logical = [-21.2, 2.8, 6.75] as const;
    const rendered = rotateRpgWorldPointInto(logical, createRpgWorldPoint());
    const restored = unrotateRpgWorldPointInto(
      rendered,
      createRpgWorldPoint()
    );

    expect(restored[0]).toBeCloseTo(logical[0], 8);
    expect(restored[1]).toBeCloseTo(logical[1], 8);
    expect(restored[2]).toBeCloseTo(logical[2], 8);
  });

  it("round-trips world, reference, and screen directions in every zone and transition", () => {
    for (const [label, point] of REGION_POINTS) {
      const projection = projectWorldToReference(point);
      expect(projection, label).not.toBeNull();
      const scene = referenceToScene(projection!.pixel);
      expect(scene, label).not.toBeNull();
      const restoredPoint = sceneToWorld(scene!);
      expect(
        Math.hypot(restoredPoint[0] - point[0], restoredPoint[2] - point[1]),
        `${label}:world-reference-round-trip`
      ).toBeLessThanOrEqual(1e-6);

      for (const direction of CARDINAL_AND_DIAGONAL_DIRECTIONS) {
        const screen = projectRpgWorldDirectionToScreenInto(
          point,
          direction,
          createRpgScreenDirection()
        );
        expect(screen, `${label}:${direction}:world-to-screen`).not.toBeNull();
        expect(
          Math.hypot(screen!.x, screen!.y),
          `${label}:${direction}:screen-normalized`
        ).toBeCloseTo(1, 8);
        const restoredDirection = unprojectRpgScreenDirectionToWorldInto(
          point,
          screen!,
          createRpgWorldPoint()
        );
        expect(
          restoredDirection,
          `${label}:${direction}:screen-to-world`
        ).not.toBeNull();
        const directionLength = Math.hypot(direction[0], direction[1]);
        const alignment =
          (restoredDirection![0] * direction[0] +
            restoredDirection![2] * direction[1]) /
          directionLength;
        expect(
          alignment,
          `${label}:${direction}:direction-round-trip`
        ).toBeGreaterThan(0.98);
      }
    }
  });

  it("keeps image-space +x right and +y down", () => {
    const current = RPG_WORLD_ARRIVALS[2].position;
    for (const direction of [
      [1, 0],
      [0, 1]
    ] as const) {
      const currentProjection = projectWorldToReference(current)!;
      const nextProjection = projectWorldToReference([
        current[0] + direction[0] * 0.1,
        current[2] + direction[1] * 0.1
      ])!;
      const expected = normalizeRpgReferenceDirectionInto(
        currentProjection.pixel,
        nextProjection.pixel,
        createRpgScreenDirection()
      );
      const actual = projectRpgWorldDirectionToScreenInto(
        current,
        direction,
        createRpgScreenDirection()
      );
      expect(actual).toEqual(expected);
    }
  });

  it("does not let reference crop translation change direction", () => {
    const current = projectWorldToReference(RPG_WORLD_ARRIVALS[1].position)!;
    const next = projectWorldToReference([
      RPG_WORLD_ARRIVALS[1].position[0] + 0.1,
      RPG_WORLD_ARRIVALS[1].position[2] - 0.1
    ])!;
    const uncropped = normalizeRpgReferenceDirectionInto(
      current.pixel,
      next.pixel,
      createRpgScreenDirection()
    );
    const cropTranslation = [-318.25, 64.5] as const;
    const cropped = normalizeRpgReferenceDirectionInto(
      [
        current.pixel[0] + cropTranslation[0],
        current.pixel[1] + cropTranslation[1]
      ],
      [
        next.pixel[0] + cropTranslation[0],
        next.pixel[1] + cropTranslation[1]
      ],
      createRpgScreenDirection()
    );

    expect(cropped!.x).toBeCloseTo(uncropped!.x, 12);
    expect(cropped!.y).toBeCloseTo(uncropped!.y, 12);
  });

  it("uses the same approved arrival Jacobian for the same world heading", () => {
    const directions = RPG_WORLD_ARRIVALS.map((arrival) =>
      projectRpgWorldDirectionToScreenInto(
        arrival.position,
        [1, 0],
        createRpgScreenDirection()
      )!
    );
    const uniqueDirections = new Set(
      directions.map(({ x, y }) => `${x.toFixed(4)},${y.toFixed(4)}`)
    );

    expect(uniqueDirections.size).toBe(1);
  });

  it("keeps every approved arrival inside one continuous local affine neighborhood", () => {
    const epsilon = 1e-4;
    for (const arrival of RPG_WORLD_ARRIVALS) {
      const center = projectWorldToReference(arrival.position)!;
      expect(center.triangleId, `${arrival.id}:mesh-authority`).not.toMatch(
        /^(?:anchor|calibration):/
      );
      expect(center.pixel, `${arrival.id}:approved-foot`).toEqual(
        arrival.approvedReferenceFoot.pixel
      );

      for (const [offsetX, offsetZ] of [
        [epsilon, 0],
        [-epsilon, 0],
        [0, epsilon],
        [0, -epsilon]
      ] as const) {
        const neighbor = projectWorldToReference([
          arrival.position[0] + offsetX,
          arrival.position[2] + offsetZ
        ])!;
        expect(
          Math.hypot(
            neighbor.pixel[0] - center.pixel[0],
            neighbor.pixel[1] - center.pixel[1]
          ),
          `${arrival.id}:${offsetX},${offsetZ}`
        ).toBeLessThanOrEqual(0.01);
      }
    }
  });

  it("keeps the arrival heading Jacobian stable throughout a radius-0.1 neighborhood", () => {
    for (const arrival of RPG_WORLD_ARRIVALS) {
      const angles = Array.from({ length: 32 }, (_, index) => {
        const angle = (index / 32) * Math.PI * 2;
        const direction = projectRpgWorldDirectionToScreenInto(
          [
            arrival.position[0] + Math.cos(angle) * 0.1,
            arrival.position[2] + Math.sin(angle) * 0.1
          ],
          [1, 0],
          createRpgScreenDirection()
        )!;
        return Math.atan2(direction.y, direction.x) * 180 / Math.PI;
      });
      expect(
        Math.max(
          ...angles.flatMap((first) =>
            angles.map((second) => angleDifferenceDegrees(first, second))
          )
        ),
        arrival.id
      ).toBeLessThanOrEqual(1);
    }
  });

  it("fails closed for nonfinite and unregistered points and clears zero directions", () => {
    const screen = { x: 9, y: -4 };
    const world = [9, 4, -2] as [number, number, number];
    expect(
      projectRpgWorldDirectionToScreenInto(
        [Number.NaN, 0],
        [1, 0],
        screen
      )
    ).toBeNull();
    expect(screen).toEqual({ x: 0, y: 0 });
    expect(
      projectRpgWorldDirectionToScreenInto([1000, 1000], [1, 0], screen)
    ).toBeNull();
    expect(
      unprojectRpgScreenDirectionToWorldInto(
        RPG_WORLD_ARRIVALS[0].position,
        { x: Number.POSITIVE_INFINITY, y: 0 },
        world
      )
    ).toBeNull();
    expect(world).toEqual([0, 0, 0]);
    expect(
      unprojectRpgScreenDirectionToWorldInto(
        [1000, 1000],
        { x: 1, y: 0 },
        world
      )
    ).toBeNull();
    expect(
      projectRpgWorldDirectionToScreenInto(
        RPG_WORLD_ARRIVALS[0].position,
        [0, 0],
        screen
      )
    ).toBe(screen);
    expect(screen).toEqual({ x: 0, y: 0 });
    expect(
      unprojectRpgScreenDirectionToWorldInto(
        RPG_WORLD_ARRIVALS[0].position,
        { x: 0, y: 0 },
        world
      )
    ).toBe(world);
    expect(world).toEqual([0, 0, 0]);
  });
});
