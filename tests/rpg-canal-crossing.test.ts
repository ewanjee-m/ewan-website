import { describe, expect, it } from "vitest";
import { RPG_WORLD_BRIDGE, RPG_WORLD_CANAL } from "../app/world/RpgWorldModel";
import { getTransitionAt, isWalkable } from "../app/world/RpgWorldGeometry";

/**
 * The canal runs the full depth of the town, so the bridge is the only way
 * between the sakura festival and the fireworks. A two-unit deck meant a
 * visitor walking the direct line between the two zones met the water and had
 * nowhere to step, which read as the world being fenced off rather than as a
 * river being crossed at a bridge.
 *
 * What matters is not the deck's size but that every lane of it carries a
 * visitor over the water, in both directions, and that the water still stops
 * them everywhere else.
 */
const bridgeZs = RPG_WORLD_BRIDGE.polygon.map(([, z]) => z);
const BRIDGE_MINIMUM_Z = Math.min(...bridgeZs);
const BRIDGE_MAXIMUM_Z = Math.max(...bridgeZs);
const CANAL_MINIMUM_X = RPG_WORLD_CANAL.polygon[0][0];
const CANAL_MAXIMUM_X = RPG_WORLD_CANAL.polygon[1][0];

const lanes = () => {
  const values: number[] = [];
  for (let z = BRIDGE_MINIMUM_Z; z <= BRIDGE_MAXIMUM_Z + 1e-9; z += 0.25) {
    values.push(Number(z.toFixed(4)));
  }
  return values;
};

describe("crossing the sakura canal", () => {
  it("carries a visitor over the water on every lane of the deck", () => {
    for (const z of lanes()) {
      for (let step = 0; step <= 44; step += 1) {
        const x = Number(
          (
            CANAL_MINIMUM_X +
            ((CANAL_MAXIMUM_X - CANAL_MINIMUM_X) * step) / 44
          ).toFixed(4)
        );
        expect(isWalkable([x, z]), `(${x}, ${z})`).toBe(true);
      }
    }
  });

  it("keeps a clear line from bank to bank at the deck's own depth", () => {
    // Walking the crossing means reaching land on the far side, not just
    // standing over the water, so this sweeps a unit of bank at each end.
    const crosses = (z: number) => {
      for (let step = 0; step <= 40; step += 1) {
        const x = Number((CANAL_MINIMUM_X - 1 + step * 0.05).toFixed(4));
        if (!isWalkable([x, z])) return false;
      }
      return true;
    };

    // Named lanes rather than a count. Counting how many of the twenty-five
    // lanes are clear passes just as happily when the clear ones are all at
    // one edge, which is the failure this test exists to catch: street
    // furniture on the banks narrows the outer lanes, and a visitor walking
    // the direct line between the two zones uses the middle.
    expect(crosses(-17), "the transition centerline").toBe(true);
    expect(crosses(-19), "a lane in the southern third").toBe(true);
    expect(crosses(-15.5), "a lane in the northern third").toBe(true);
  });

  it("leaves the canal impassable everywhere the deck does not reach", () => {
    const midX = (CANAL_MINIMUM_X + CANAL_MAXIMUM_X) / 2;
    for (const z of [
      BRIDGE_MINIMUM_Z - 0.5,
      BRIDGE_MINIMUM_Z - 4,
      BRIDGE_MAXIMUM_Z + 0.5,
      BRIDGE_MAXIMUM_Z + 4,
      0,
      20
    ]) {
      expect(isWalkable([midX, z]), `(${midX}, ${z})`).toBe(false);
    }
  });

  it("hands the visitor to the fireworks wherever they cross", () => {
    // The deck and the zone boundary have to agree. When only the middle of a
    // wide deck triggered the change, a visitor crossing at its southern edge
    // arrived at the festival while the world still called it sakura.
    for (const z of lanes()) {
      expect(getTransitionAt([16, z])?.id, `(16, ${z})`).toBe(
        "sakura-to-hanabi"
      );
    }
  });
});
