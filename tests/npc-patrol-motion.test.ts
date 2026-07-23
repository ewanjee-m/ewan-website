import { describe, expect, it } from "vitest";
import {
  RPG_LANDMARKS,
  isRpgWalkablePosition
} from "../app/world/RpgTownSceneLayout";
import {
  NPC_ENDPOINT_ACTION_SECONDS,
  createNpcPatrolPose,
  deriveNpcPatrolRoute,
  evaluateNpcPatrolMotionInto,
  isNpcPatrolRouteWalkable
} from "../app/world/NpcPatrolMotion";

describe("deterministic NPC patrol motion", () => {
  it("keeps endpoint gestures visible long enough to read on low-frame-rate devices", () => {
    expect(NPC_ENDPOINT_ACTION_SECONDS).toBeGreaterThanOrEqual(1.2);
  });

  it("derives two to four local, walkable waypoints for every town NPC", () => {
    const npcLayouts = RPG_LANDMARKS.filter(({ kind }) => kind === "npc");

    for (const npc of npcLayouts) {
      const route = deriveNpcPatrolRoute(npc.id, npc.variant ?? 0);

      expect(route.waypoints.length, npc.id).toBeGreaterThanOrEqual(2);
      expect(route.waypoints.length, npc.id).toBeLessThanOrEqual(4);
      expect(route.waypoints[0], npc.id).toEqual([
        npc.position[0],
        npc.position[2]
      ]);
      expect(new Set(route.waypoints.map(([x, z]) => `${x},${z}`)).size).toBe(
        route.waypoints.length
      );
      expect(isNpcPatrolRouteWalkable(route.waypoints), npc.id).toBe(true);
      for (const [x, z] of route.waypoints) {
        expect(isRpgWalkablePosition(x, z), `${npc.id}: ${x},${z}`).toBe(true);
        expect(Math.hypot(x - npc.position[0], z - npc.position[2])).toBeLessThanOrEqual(
          2
        );
      }
    }
  });

  it("keeps each patrol aligned with its approved zone role", () => {
    const expectations = [
      ["npc-airport-traveler", 0, 1, 1],
      ["npc-tokyo-worker", 1, 0, 1],
      ["npc-gyukatsu-chef", 2, 1, 1],
      ["npc-sakura-visitor", 3, 0, -1],
      ["npc-hanabi-child", 4, 1, 1],
      ["npc-hanabi-yukata", 5, 1, 1],
      ["npc-hanabi-vendor", 6, 1, 1]
    ] as const;

    for (const [npcId, variant, axis, sign] of expectations) {
      const { waypoints } = deriveNpcPatrolRoute(npcId, variant);
      const start = waypoints[0];
      const end = waypoints.at(-1)!;
      const primaryDelta = end[axis] - start[axis];
      const crossDelta = end[axis === 0 ? 1 : 0] - start[axis === 0 ? 1 : 0];

      expect(Math.sign(primaryDelta), npcId).toBe(sign);
      expect(Math.abs(crossDelta), npcId).toBeLessThan(1e-8);
    }
  });

  it("accepts an explicit local route for authored zone-specific movement", () => {
    const authoredRoute = [
      [-26.8, 1.5],
      [-26.8, 2.25],
      [-26.3, 2.75]
    ] as const;

    expect(
      deriveNpcPatrolRoute("npc-airport-traveler", 0, authoredRoute).waypoints
    ).toEqual(authoredRoute);
  });

  it("rejects a segment whose endpoints are walkable but whose path crosses the canal", () => {
    const acrossUnbridgedCanal = [
      [14.5, 0],
      [18.5, 0]
    ] as const;

    expect(
      acrossUnbridgedCanal.every(([x, z]) => isRpgWalkablePosition(x, z))
    ).toBe(true);
    expect(isNpcPatrolRouteWalkable(acrossUnbridgedCanal)).toBe(false);
  });

  it("rejects an authored route that enters a blocking landmark", () => {
    expect(() =>
      deriveNpcPatrolRoute("npc-airport-traveler", 0, [
        [-26.8, 1.5],
        [-29, 28]
      ])
    ).toThrow(/walkable/i);
  });

  it("keeps an authored route local to the NPC's zone role", () => {
    expect(() =>
      deriveNpcPatrolRoute("npc-airport-traveler", 0, [
        [-26.8, 1.5],
        [-26.8, 3.6]
      ])
    ).toThrow(/local/i);
  });

  it("moves continuously along the route and exposes a walk pose", () => {
    const route = deriveNpcPatrolRoute("npc-airport-traveler", 0);
    const start = {
      ...evaluateNpcPatrolMotionInto(
        route,
        0,
        false,
        createNpcPatrolPose()
      )
    };
    const walking = evaluateNpcPatrolMotionInto(
      route,
      NPC_ENDPOINT_ACTION_SECONDS + 0.5,
      false,
      createNpcPatrolPose()
    );

    expect([start.x, start.z]).toEqual(route.waypoints[0]);
    expect(walking.animationKind).toBe("walk");
    expect(Math.hypot(walking.x - start.x, walking.z - start.z)).toBeGreaterThan(
      0
    );
    expect(Number.isFinite(walking.yaw)).toBe(true);
    expect(Number.isFinite(walking.stride)).toBe(true);
    expect(Math.abs(walking.bob)).toBeLessThanOrEqual(0.04);
  });

  it("keeps every NPC safely idle at its authored origin in reduced-motion mode", () => {
    const npcLayouts = RPG_LANDMARKS.filter(({ kind }) => kind === "npc");

    for (const npc of npcLayouts) {
      const route = deriveNpcPatrolRoute(npc.id, npc.variant ?? 0);
      const poses = [0, 1, 3.5, 9].map((elapsedSeconds) => ({
        ...evaluateNpcPatrolMotionInto(
          route,
          elapsedSeconds,
          true,
          createNpcPatrolPose()
        )
      }));

      expect(
        poses.every(
          ({ x, z }) => x === npc.position[0] && z === npc.position[2]
        ),
        npc.id
      ).toBe(true);
      expect(poses.every(({ moving }) => !moving), npc.id).toBe(true);
      expect(
        poses.every(({ animationKind }) => animationKind === "idle"),
        npc.id
      ).toBe(true);
      expect(poses.every(({ stride, bob }) => stride === 0 && bob === 0)).toBe(
        true
      );
    }
  });

  it("gives the seven smiling NPCs varied human gestures between walks", () => {
    const npcLayouts = RPG_LANDMARKS.filter(({ kind }) => kind === "npc");
    const restingPoses = npcLayouts.map((npc) =>
      evaluateNpcPatrolMotionInto(
        deriveNpcPatrolRoute(npc.id, npc.variant ?? 0),
        0.3,
        false,
        createNpcPatrolPose()
      )
    );
    const walkingPoses = npcLayouts.map((npc) =>
      evaluateNpcPatrolMotionInto(
        deriveNpcPatrolRoute(npc.id, npc.variant ?? 0),
        NPC_ENDPOINT_ACTION_SECONDS + 0.5,
        false,
        createNpcPatrolPose()
      )
    );
    const gestureKinds = new Set(
      restingPoses.map(({ animationKind }) => animationKind)
    );

    expect(gestureKinds).toEqual(
      new Set(["wave", "talk", "nod", "look-around", "pause"])
    );
    expect(walkingPoses.every(({ animationKind }) => animationKind === "walk"))
      .toBe(true);
    expect(
      restingPoses.filter(
        ({ animationKind, bob, rotation }) =>
          animationKind !== "pause" && (bob !== 0 || rotation !== 0)
      ).length
    ).toBeGreaterThanOrEqual(4);
  });

  it("is frame-rate independent and never teleports between sampled frames", () => {
    const route = deriveNpcPatrolRoute("npc-gyukatsu-chef", 2);
    const direct = {
      ...evaluateNpcPatrolMotionInto(
        route,
        7.25,
        false,
        createNpcPatrolPose()
      )
    };
    const steppedTarget = createNpcPatrolPose();
    for (let elapsedSeconds = 0; elapsedSeconds <= 7.25; elapsedSeconds += 0.05) {
      evaluateNpcPatrolMotionInto(
        route,
        Math.min(7.25, elapsedSeconds),
        false,
        steppedTarget
      );
    }
    evaluateNpcPatrolMotionInto(route, 7.25, false, steppedTarget);
    expect(steppedTarget).toEqual(direct);

    const frameSeconds = 1 / 240;
    let previous = evaluateNpcPatrolMotionInto(
      route,
      0,
      false,
      createNpcPatrolPose()
    );
    for (let frame = 1; frame <= 3_600; frame += 1) {
      const next = evaluateNpcPatrolMotionInto(
        route,
        frame * frameSeconds,
        false,
        createNpcPatrolPose()
      );
      expect(Math.hypot(next.x - previous.x, next.z - previous.z)).toBeLessThanOrEqual(
        route.speed * frameSeconds + 1e-8
      );
      expect(isRpgWalkablePosition(next.x, next.z)).toBe(true);
      previous = next;
    }
  });
});
