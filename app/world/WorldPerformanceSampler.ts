export interface WorldPerformanceSample {
  averageFps: number;
  p5Fps: number;
  longFrameCount: number;
  frameCount: number;
}

export function createWorldPerformanceSampler() {
  const frameSeconds: number[] = [];

  return {
    recordFrame(deltaSeconds: number) {
      if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
        frameSeconds.push(deltaSeconds);
      }
    },
    read(): Readonly<WorldPerformanceSample> {
      const sorted = [...frameSeconds].sort((a, b) => a - b);
      const total = frameSeconds.reduce((sum, value) => sum + value, 0);
      const p95Frame =
        sorted[
          Math.max(
            0,
            Math.min(
              sorted.length - 1,
              Math.ceil(sorted.length * 0.95) - 1
            )
          )
        ] ?? Number.POSITIVE_INFINITY;

      return Object.freeze({
        averageFps: total > 0 ? frameSeconds.length / total : 0,
        p5Fps: Number.isFinite(p95Frame) ? 1 / p95Frame : 0,
        longFrameCount: frameSeconds.filter((value) => value > 0.25).length,
        frameCount: frameSeconds.length
      });
    }
  };
}
