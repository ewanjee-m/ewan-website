import { describe, expect, it } from "vitest";
import { createAirportBus } from "../app/world/AirportBus";
import {
  advanceRpgBusRuntime,
  createRpgBusRuntime
} from "../app/world/RpgBusRuntime";
import {
  RPG_BUS_ROUTE_BOUNDS,
  RPG_BUS_ROUTE_LENGTH,
  RPG_BUS_WHEEL_RADIUS,
  createRpgBusMotionPose,
  evaluateRpgBusMotionInto,
  getRpgBusAdvanceSeconds,
  isRpgPositionOutsideMovingBus,
  sampleRpgBusRoute
} from "../app/world/RpgBusMotion";
import {
  RPG_BRIDGE_CROSSING,
  RPG_LANDMARKS,
  RPG_MAIN_ROUTE,
  RPG_PLAYER_COLLISION_RADIUS,
  RPG_TOWN_SURFACES,
  RPG_TOWN_ZONES,
  isRpgWalkablePosition
} from "../app/world/RpgTownSceneLayout";
import { deriveNpcPatrolRoute } from "../app/world/NpcPatrolMotion";

describe("RPG airport bus route motion", () => {
  it("advances one shared runtime for rendering, player collision, and camera collision", () => {
    const runtime = createRpgBusRuntime();
    const sharedPose = runtime.pose;
    const sharedSnapshot = runtime.snapshot;

    expect(advanceRpgBusRuntime(runtime, 1.25, false)).toBe(runtime);
    expect(runtime.pose).toBe(sharedPose);
    expect(runtime.snapshot).toBe(sharedSnapshot);
    expect(runtime.snapshot.routeProgress).toBeGreaterThan(0);
    expect(runtime.pose.position).not.toEqual([-33, 1.075, -4]);

    const frozen = [...runtime.pose.position];
    advanceRpgBusRuntime(runtime, 10, true);
    expect(runtime.pose.position).toEqual(frozen);
  });

  it("maps normalized route progress to a reusable world pose", () => {
    const pose = createRpgBusMotionPose();

    expect(
      evaluateRpgBusMotionInto(
        { routeProgress: 0, completedLoops: 0 },
        pose
      )
    ).toBe(pose);
    expect(pose.position).toEqual([-33, 1.075, -4]);
    expect(pose.yaw).toBe(0);
    expect(pose.wheelRotation).toBe(0);
  });

  it("follows two road lanes joined by continuous turnarounds", () => {
    const straightLength = 22;
    const halfTurnLength = Math.PI * 2;
    const checkpoints = [
      {
        distance: straightLength,
        position: [-33, 1.075, 18],
        yaw: 0
      },
      {
        distance: straightLength + halfTurnLength / 2,
        position: [-31, 1.075, 20],
        yaw: Math.PI / 2
      },
      {
        distance: straightLength + halfTurnLength,
        position: [-29, 1.075, 18],
        yaw: Math.PI
      },
      {
        distance: straightLength * 2 + halfTurnLength,
        position: [-29, 1.075, -4],
        yaw: Math.PI
      },
      {
        distance: RPG_BUS_ROUTE_LENGTH,
        position: [-33, 1.075, -4],
        yaw: Math.PI * 2
      }
    ];

    for (const checkpoint of checkpoints) {
      const pose = evaluateRpgBusMotionInto(
        {
          routeProgress: checkpoint.distance / RPG_BUS_ROUTE_LENGTH,
          completedLoops: 0
        },
        createRpgBusMotionPose()
      );

      expect(pose.position[0]).toBeCloseTo(checkpoint.position[0], 8);
      expect(pose.position[1]).toBeCloseTo(checkpoint.position[1], 8);
      expect(pose.position[2]).toBeCloseTo(checkpoint.position[2], 8);
      expect(pose.yaw).toBeCloseTo(checkpoint.yaw, 8);
      expect(pose.wheelRotation).toBeCloseTo(
        -checkpoint.distance / RPG_BUS_WHEEL_RADIUS,
        8
      );
    }
  });

  it("keeps the ambient bus stationary when reduced motion is requested", () => {
    const bus = createAirportBus();
    const initial = bus.getSnapshot();

    bus.advance(getRpgBusAdvanceSeconds(30, true), {
      crosswalkOccupied: false
    });

    expect(bus.getSnapshot()).toEqual(initial);
  });

  it("produces the same world pose for one frame or equivalent smaller frames", () => {
    const runFrames = (frameSeconds: readonly number[]) => {
      const bus = createAirportBus();
      for (const deltaSeconds of frameSeconds) {
        bus.advance(getRpgBusAdvanceSeconds(deltaSeconds, false), {
          crosswalkOccupied: false
        });
      }
      const snapshot = bus.getSnapshot();
      return evaluateRpgBusMotionInto(
        {
          routeProgress: snapshot.routeProgress,
          completedLoops: snapshot.completedLoops
        },
        createRpgBusMotionPose()
      );
    };

    const smallFrames = Array.from({ length: 183 }, () => 0.1);
    smallFrames.push(0.05);

    expect(runFrames(smallFrames)).toEqual(runFrames([18.35]));
  });

  it("stays continuous across the loop seam without resetting wheels or yaw", () => {
    const epsilon = 1e-6;
    const beforeSeam = evaluateRpgBusMotionInto(
      {
        routeProgress: 1 - epsilon,
        completedLoops: 0
      },
      createRpgBusMotionPose()
    );
    const afterSeam = evaluateRpgBusMotionInto(
      {
        routeProgress: epsilon,
        completedLoops: 1
      },
      createRpgBusMotionPose()
    );

    expect(
      Math.hypot(
        afterSeam.position[0] - beforeSeam.position[0],
        afterSeam.position[2] - beforeSeam.position[2]
      )
    ).toBeLessThan(RPG_BUS_ROUTE_LENGTH * epsilon * 2.1);
    expect(afterSeam.yaw - beforeSeam.yaw).toBeLessThan(
      (RPG_BUS_ROUTE_LENGTH * epsilon * 2.1) / 2
    );
    expect(
      Math.abs(afterSeam.wheelRotation - beforeSeam.wheelRotation)
    ).toBeLessThan(
      (RPG_BUS_ROUTE_LENGTH * epsilon * 2.1) / RPG_BUS_WHEEL_RADIUS
    );
  });

  it("keeps every route sample on the approved left-side airport road or apron", () => {
    const samples = sampleRpgBusRoute(720);
    const airportRoad = RPG_MAIN_ROUTE.find(
      ({ id }) => id === "airport-arrival-road"
    )!;
    const airportApron = RPG_TOWN_SURFACES.find(
      ({ id }) => id === "airport-coastal-apron"
    )!;
    const airportZone = RPG_TOWN_ZONES.find(({ id }) => id === "airport")!;
    const canal = RPG_LANDMARKS.find(
      ({ id }) => id === RPG_BRIDGE_CROSSING.canalId
    )!;
    const movingBus = RPG_LANDMARKS.find(
      ({ id }) => id === "airport-limousine-bus"
    )!;
    const inside = (
      x: number,
      z: number,
      rectangle: {
        minimumX: number;
        maximumX: number;
        minimumZ: number;
        maximumZ: number;
      }
    ) =>
      x >= rectangle.minimumX &&
      x <= rectangle.maximumX &&
      z >= rectangle.minimumZ &&
      z <= rectangle.maximumZ;
    const surfaceBounds = {
      minimumX: airportApron.position[0] - airportApron.size[0] / 2,
      maximumX: airportApron.position[0] + airportApron.size[0] / 2,
      minimumZ: airportApron.position[2] - airportApron.size[2] / 2,
      maximumZ: airportApron.position[2] + airportApron.size[2] / 2
    };
    const canalBounds = {
      minimumX: canal.position[0] - canal.size[0] / 2,
      maximumX: canal.position[0] + canal.size[0] / 2,
      minimumZ: canal.position[2] - canal.size[2] / 2,
      maximumZ: canal.position[2] + canal.size[2] / 2
    };
    const busPhysicalHalfLength = movingBus.size[0] / 2;
    const busPhysicalHalfWidth = movingBus.size[2] / 2;
    const busCollisionHalfLength =
      busPhysicalHalfLength + RPG_PLAYER_COLLISION_RADIUS;
    const busCollisionHalfWidth =
      busPhysicalHalfWidth + RPG_PLAYER_COLLISION_RADIUS;
    const busOverlapsRectangle = (
      x: number,
      z: number,
      yaw: number,
      rectangle: {
        minimumX: number;
        maximumX: number;
        minimumZ: number;
        maximumZ: number;
      }
    ) => {
      const heading = [Math.sin(yaw), Math.cos(yaw)] as const;
      const side = [Math.cos(yaw), -Math.sin(yaw)] as const;
      const rectangleCenterX =
        (rectangle.minimumX + rectangle.maximumX) / 2;
      const rectangleCenterZ =
        (rectangle.minimumZ + rectangle.maximumZ) / 2;
      const rectangleHalfX =
        (rectangle.maximumX - rectangle.minimumX) / 2;
      const rectangleHalfZ =
        (rectangle.maximumZ - rectangle.minimumZ) / 2;
      return [heading, side, [1, 0] as const, [0, 1] as const].every(
        ([axisX, axisZ]) => {
          const centerDistance = Math.abs(
            (x - rectangleCenterX) * axisX +
              (z - rectangleCenterZ) * axisZ
          );
          const busRadius =
            busCollisionHalfLength *
              Math.abs(heading[0] * axisX + heading[1] * axisZ) +
            busCollisionHalfWidth *
              Math.abs(side[0] * axisX + side[1] * axisZ);
          const rectangleRadius =
            rectangleHalfX * Math.abs(axisX) +
            rectangleHalfZ * Math.abs(axisZ);
          return centerDistance <= busRadius + rectangleRadius;
        }
      );
    };

    for (const sample of samples) {
      const [x, , z] = sample.position;
      expect(
        inside(x, z, airportRoad) || inside(x, z, surfaceBounds),
        `route sample ${sample.routeProgress}`
      ).toBe(true);
      expect(inside(x, z, airportZone)).toBe(true);
      expect(isRpgWalkablePosition(x, z)).toBe(true);
      expect(inside(x, z, canalBounds)).toBe(false);

      const heading = [Math.sin(sample.yaw), Math.cos(sample.yaw)] as const;
      const side = [Math.cos(sample.yaw), -Math.sin(sample.yaw)] as const;
      for (const along of [
        -busPhysicalHalfLength,
        busPhysicalHalfLength
      ]) {
        for (const across of [
          -busPhysicalHalfWidth,
          busPhysicalHalfWidth
        ]) {
          const cornerX = x + heading[0] * along + side[0] * across;
          const cornerZ = z + heading[1] * along + side[1] * across;
          expect(inside(cornerX, cornerZ, surfaceBounds)).toBe(true);
          expect(inside(cornerX, cornerZ, airportZone)).toBe(true);
        }
      }

      for (const landmark of RPG_LANDMARKS.filter(
        ({ blocksMovement, id }) =>
          blocksMovement && id !== movingBus.id
      )) {
        expect(
          busOverlapsRectangle(x, z, sample.yaw, {
            minimumX: landmark.position[0] - landmark.size[0] / 2,
            maximumX: landmark.position[0] + landmark.size[0] / 2,
            minimumZ: landmark.position[2] - landmark.size[2] / 2,
            maximumZ: landmark.position[2] + landmark.size[2] / 2
          }),
          `${movingBus.id} footprint at ${sample.routeProgress} overlaps ${landmark.id}`
        ).toBe(false);
      }
      expect(
        busOverlapsRectangle(x, z, sample.yaw, canalBounds)
      ).toBe(false);
    }

    const xs = samples.map(({ position }) => position[0]);
    const zs = samples.map(({ position }) => position[2]);
    expect(Math.min(...xs)).toBeCloseTo(RPG_BUS_ROUTE_BOUNDS.minimumX, 5);
    expect(Math.max(...xs)).toBeCloseTo(RPG_BUS_ROUTE_BOUNDS.maximumX, 5);
    expect(Math.min(...zs)).toBeCloseTo(RPG_BUS_ROUTE_BOUNDS.minimumZ, 5);
    expect(Math.max(...zs)).toBeCloseTo(RPG_BUS_ROUTE_BOUNDS.maximumZ, 5);
  });

  it("falls back to the safe route start for invalid animation telemetry", () => {
    const pose = evaluateRpgBusMotionInto(
      {
        routeProgress: Number.NaN,
        completedLoops: Number.POSITIVE_INFINITY
      },
      createRpgBusMotionPose()
    );

    expect(pose).toEqual({
      position: [-33, 1.075, -4],
      yaw: 0,
      wheelRotation: 0
    });
    expect(getRpgBusAdvanceSeconds(Number.NaN, false)).toBe(0);
    expect(getRpgBusAdvanceSeconds(-1, false)).toBe(0);
  });

  it("leaves the airport traveler's patrol corridor clear between both bus lanes", () => {
    const npcRoute = deriveNpcPatrolRoute("npc-airport-traveler", 0);
    const busSamples = sampleRpgBusRoute(1440);
    const busHalfLength = 3;
    const busHalfWidth = 1.1;
    const actorClearance = 0.3;

    for (const sample of busSamples) {
      const heading = [Math.sin(sample.yaw), Math.cos(sample.yaw)] as const;
      const side = [heading[1], -heading[0]] as const;
      for (const [npcX, npcZ] of npcRoute.waypoints) {
        const deltaX = npcX - sample.position[0];
        const deltaZ = npcZ - sample.position[2];
        const along = Math.abs(deltaX * heading[0] + deltaZ * heading[1]);
        const across = Math.abs(deltaX * side[0] + deltaZ * side[1]);

        expect(
          along > busHalfLength + actorClearance ||
            across > busHalfWidth + actorClearance,
          `bus ${sample.routeProgress} overlaps airport NPC at ${npcX},${npcZ}`
        ).toBe(true);
      }
    }
  });

  it("blocks the live bus footprint but releases the parked layout position", () => {
    const pose = evaluateRpgBusMotionInto(
      { routeProgress: 0.25, completedLoops: 0 },
      createRpgBusMotionPose()
    );
    const bus = RPG_LANDMARKS.find(
      ({ id }) => id === "airport-limousine-bus"
    )!;

    expect(
      isRpgPositionOutsideMovingBus(
        pose.position[0],
        pose.position[2],
        pose,
        bus.size
      )
    ).toBe(false);
    expect(
      isRpgPositionOutsideMovingBus(
        pose.position[0] + 3.31,
        pose.position[2],
        pose,
        bus.size
      )
    ).toBe(true);
    expect(bus.blocksMovement).toBe(false);
    expect(isRpgWalkablePosition(bus.position[0], bus.position[2])).toBe(true);
  });

  it("uses the oriented bus footprint while it turns", () => {
    const turnPose = evaluateRpgBusMotionInto(
      {
        routeProgress: (22 + Math.PI) / RPG_BUS_ROUTE_LENGTH,
        completedLoops: 0
      },
      createRpgBusMotionPose()
    );

    expect(turnPose.yaw).toBeCloseTo(Math.PI / 2, 8);
    expect(
      isRpgPositionOutsideMovingBus(
        turnPose.position[0] + 2.9,
        turnPose.position[2],
        turnPose
      )
    ).toBe(false);
    expect(
      isRpgPositionOutsideMovingBus(
        turnPose.position[0],
        turnPose.position[2] + 1.41,
        turnPose
      )
    ).toBe(true);
  });
});
