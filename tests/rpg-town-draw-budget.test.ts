import { describe, expect, it } from "vitest";
import {
  getRpgTownRenderStats,
  RPG_TOWN_RENDER_GROUP_IDS
} from "../app/world/RpgTownRenderStats";

describe("RPG town render budget", () => {
  it("measures every expanded runtime group from one production source", () => {
    const stats = getRpgTownRenderStats("high");

    expect(stats.groups.map(({ id }) => id)).toEqual(
      RPG_TOWN_RENDER_GROUP_IDS
    );
    expect(stats.groups.every(({ drawUnits, triangleCount }) =>
      drawUnits > 0 && triangleCount > 0
    )).toBe(true);
    expect(stats.drawUnits).toBe(
      stats.groups.reduce((sum, group) => sum + group.drawUnits, 0)
    );
    expect(stats.triangleCount).toBe(
      stats.groups.reduce((sum, group) => sum + group.triangleCount, 0)
    );
  });

  it("counts the expanded bridge rails and posts through their real batches", () => {
    const bridge = getRpgTownRenderStats("high").groups.find(
      ({ id }) => id === "signature-bridge"
    );

    expect(bridge).toEqual({
      id: "signature-bridge",
      drawUnits: 2,
      triangleCount: 8 * 12
    });
  });

  it("stays inside draw and triangle budgets at both quality tiers", () => {
    const high = getRpgTownRenderStats("high");
    const low = getRpgTownRenderStats("low");

    expect(high.drawUnits).toBeLessThanOrEqual(120);
    expect(high.triangleCount).toBeLessThanOrEqual(150_000);
    expect(low.triangleCount).toBeLessThanOrEqual(90_000);
    expect(low.triangleCount).toBeLessThan(high.triangleCount);
  });
});
