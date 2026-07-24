import type { WorldNavigationSnapshot } from "./WorldNavigationState";

export function createWorldNavigationPublisher(
  publish: (atSeconds: number, snapshot: WorldNavigationSnapshot) => void,
  intervalSeconds = 0.1
) {
  let lastAt = Number.NEGATIVE_INFINITY;
  let lastRegionId = "";
  let lastInteractionId: string | null = null;

  return {
    offer(atSeconds: number, snapshot: WorldNavigationSnapshot) {
      const urgent =
        snapshot.navigationRegionId !== lastRegionId ||
        snapshot.nearInteractionId !== lastInteractionId;
      if (!urgent && atSeconds - lastAt + 1e-9 < intervalSeconds) {
        return false;
      }

      lastAt = atSeconds;
      lastRegionId = snapshot.navigationRegionId;
      lastInteractionId = snapshot.nearInteractionId;
      publish(atSeconds, snapshot);
      return true;
    }
  };
}
