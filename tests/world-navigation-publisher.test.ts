import { describe, expect, it } from "vitest";
import { createWorldNavigationPublisher } from "../app/world/WorldNavigationPublisher";
import type { WorldNavigationSnapshot } from "../app/world/WorldNavigationState";
import { createWorldRuntime } from "../app/world/WorldRuntime";

describe("world navigation publisher", () => {
  it("publishes moved snapshots within 100ms and region changes immediately", () => {
    const published: Array<{ at: number; revision: number }> = [];
    const publisher = createWorldNavigationPublisher((at, snapshot) => {
      published.push({ at, revision: snapshot.revision });
    });
    const runtime = createWorldRuntime();

    publisher.offer(0, runtime.getNavigationSnapshot());
    runtime.setMovement({ x: 1, y: 0, runRequested: false });
    runtime.advance(0.01, 0);
    const moved = runtime.getNavigationSnapshot();

    publisher.offer(0.099, moved);
    expect(published).toHaveLength(1);
    publisher.offer(0.1, moved);
    expect(published.at(-1)).toEqual({ at: 0.1, revision: moved.revision });

    const changedRegion = {
      ...moved,
      revision: moved.revision + 1,
      navigationRegionId: "tokyo",
      currentZoneId: "tokyo"
    } as WorldNavigationSnapshot;
    publisher.offer(0.101, changedRegion);
    expect(published.at(-1)?.at).toBe(0.101);
  });

  it("publishes interaction changes immediately without cloning the snapshot", () => {
    const published: WorldNavigationSnapshot[] = [];
    const publisher = createWorldNavigationPublisher((_, snapshot) => {
      published.push(snapshot);
    });
    const initial = createWorldRuntime().getNavigationSnapshot();
    publisher.offer(0, initial);

    const interaction = {
      ...initial,
      revision: initial.revision + 1,
      nearInteractionId: "airport-terminal"
    } as WorldNavigationSnapshot;

    expect(publisher.offer(0.001, interaction)).toBe(true);
    expect(published.at(-1)).toBe(interaction);
  });
});
