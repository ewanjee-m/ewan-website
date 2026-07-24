import type { DestinationId } from "../guide/GuideContract";
import type { WorldPoint3 } from "./RpgWorldModel";
import { RPG_LANDMARKS } from "./RpgTownSceneLayout";

export type WorldInteractionEntryId =
  | "world-design"
  | "character-controls"
  | "ai-guide";

export interface WorldInteractionTarget {
  id: string;
  zoneId: DestinationId;
  position: WorldPoint3;
  radius: number;
  entryId: WorldInteractionEntryId;
  actorId?: string;
}

const ENTRY_BY_ZONE = {
  airport: "world-design",
  tokyo: "world-design",
  gyukatsu: "character-controls",
  sakura: "character-controls",
  hanabi: "ai-guide"
} as const satisfies Readonly<Record<DestinationId, WorldInteractionEntryId>>;

const ENTRANCE_INTERACTION_TARGETS = [
  {
    id: "airport-terminal-entry",
    zoneId: "airport",
    position: [-30, 0, 0],
    radius: 2.5,
    entryId: "world-design"
  },
  {
    id: "tokyo-boulevard-entry",
    zoneId: "tokyo",
    position: [-8, 0, 20],
    radius: 2.5,
    entryId: "world-design"
  },
  {
    id: "gyukatsu-shop-entry",
    zoneId: "gyukatsu",
    position: [8, 0, 0],
    radius: 2.5,
    entryId: "character-controls"
  },
  {
    id: "sakura-bridge-entry",
    zoneId: "sakura",
    position: [9, 0, -20],
    radius: 2.5,
    entryId: "character-controls"
  },
  {
    id: "hanabi-torii-entry",
    zoneId: "hanabi",
    position: [26, 0, -18],
    radius: 2.5,
    entryId: "ai-guide"
  }
] as const satisfies readonly WorldInteractionTarget[];

const NPC_INTERACTION_TARGETS = RPG_LANDMARKS
  .filter((landmark) => landmark.kind === "npc")
  .map(
    (landmark) =>
      ({
        id: landmark.id,
        actorId: landmark.id,
        zoneId: landmark.zoneId,
        position: landmark.position,
        radius: 2.1,
        entryId: ENTRY_BY_ZONE[landmark.zoneId]
      }) satisfies WorldInteractionTarget
  );

export const WORLD_INTERACTION_TARGETS: readonly WorldInteractionTarget[] =
  Object.freeze([
    ...ENTRANCE_INTERACTION_TARGETS,
    ...NPC_INTERACTION_TARGETS
  ]);

const EMPTY_TARGET_SET: ReadonlySet<string> = new Set();

export function getWorldInteractionTarget(
  targetId: string | null
): WorldInteractionTarget | null {
  if (!targetId) return null;
  return (
    WORLD_INTERACTION_TARGETS.find((target) => target.id === targetId) ?? null
  );
}

export function findWorldInteractionTarget({
  position,
  heading,
  unavailableTargetIds = EMPTY_TARGET_SET
}: {
  position: WorldPoint3;
  heading: WorldPoint3;
  unavailableTargetIds?: ReadonlySet<string>;
}): WorldInteractionTarget | null {
  for (const target of WORLD_INTERACTION_TARGETS) {
    if (unavailableTargetIds.has(target.id)) continue;
    const dx = target.position[0] - position[0];
    const dz = target.position[2] - position[2];
    const distance = Math.hypot(dx, dz);
    if (distance > target.radius || distance < 1e-6) continue;
    const facing = (dx * heading[0] + dz * heading[2]) / distance;
    if (facing + 1e-12 >= Math.cos(Math.PI / 3)) return target;
  }
  return null;
}
