export type WorldTimePhase =
  | "lateAfternoon"
  | "sunset"
  | "blueEvening"
  | "night";

export interface WorldTimelineSnapshot {
  phase: WorldTimePhase;
  progress: number;
  fireworksIntensity: number;
}

export interface WorldTimeline {
  advance(deltaSeconds: number): void;
  readSnapshot(target: WorldTimelineSnapshot): WorldTimelineSnapshot;
  getSnapshot(): WorldTimelineSnapshot;
}

export function createWorldTimelineSnapshot(): WorldTimelineSnapshot {
  return {
    phase: "lateAfternoon",
    progress: 0,
    fireworksIntensity: 0
  };
}

export function createWorldTimeline(): WorldTimeline {
  let elapsedSeconds = 0;
  const readSnapshot = (target: WorldTimelineSnapshot) => {
    if (elapsedSeconds < 2) {
      target.phase = "lateAfternoon";
      target.progress = elapsedSeconds / 2;
      target.fireworksIntensity = 0;
      return target;
    }
    if (elapsedSeconds < 4) {
      target.phase = "sunset";
      target.progress = (elapsedSeconds - 2) / 2;
      target.fireworksIntensity = 0;
      return target;
    }
    if (elapsedSeconds < 6) {
      target.phase = "blueEvening";
      target.progress = (elapsedSeconds - 4) / 2;
      target.fireworksIntensity = 0;
      return target;
    }
    const nightProgress = Math.min(1, (elapsedSeconds - 6) / 4);
    target.phase = "night";
    target.progress = nightProgress;
    target.fireworksIntensity = nightProgress;
    return target;
  };

  return {
    advance(deltaSeconds) {
      if (deltaSeconds <= 0) {
        return;
      }
      elapsedSeconds += deltaSeconds;
    },

    readSnapshot,

    getSnapshot() {
      return readSnapshot(createWorldTimelineSnapshot());
    }
  };
}
