import { describe, expect, it } from "vitest";
import { deriveNpcPatrolRoute } from "../app/world/NpcPatrolMotion";
import {
  WORLD_RUN_SPEED,
  WORLD_WALK_SPEED
} from "../app/world/WorldRuntime";
import { RPG_LANDMARKS } from "../app/world/RpgTownSceneLayout";

const NPC_IDS = RPG_LANDMARKS.filter(
  (landmark) => landmark.kind === "npc"
).map((landmark) => landmark.id);

describe("crowd pace against the visitor", () => {
  /**
   * The crowd is what tells the visitor how fast they are going. If everybody
   * else is a fifth of their speed the town reads as frozen and the walk feels
   * wrong however well it is tuned. The crowd should stroll: slower than the
   * visitor's walk, but the same order of pace.
   */
  it("keeps the crowd strolling rather than standing still", () => {
    for (const npcId of NPC_IDS) {
      for (const variant of [0, 1, 2]) {
        const route = deriveNpcPatrolRoute(npcId, variant);
        expect(route.speed).toBeGreaterThanOrEqual(WORLD_WALK_SPEED * 0.3);
        expect(route.speed).toBeLessThan(WORLD_WALK_SPEED);
      }
    }
  });

  it("never lets an onlooker outpace a running visitor", () => {
    for (const npcId of NPC_IDS) {
      const route = deriveNpcPatrolRoute(npcId, 2);
      expect(route.speed).toBeLessThan(WORLD_RUN_SPEED);
    }
  });

  it("varies the pace between neighbours so the crowd is not a machine", () => {
    const speeds = new Set(
      [0, 1, 2].map((variant) => deriveNpcPatrolRoute(NPC_IDS[0], variant).speed)
    );
    expect(speeds.size).toBe(3);
  });
});
