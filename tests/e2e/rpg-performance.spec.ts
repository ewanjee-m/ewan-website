import { cpus, arch, platform, release } from "node:os";
import { writeFile } from "node:fs/promises";
import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
  type TestInfo
} from "@playwright/test";
import {
  RPG_QUALITY_DEGRADATION_ORDER,
  type RpgQualityDegradationStage
} from "../../app/world/AdaptiveQuality";
import {
  dragCamera,
  driveCanonicalRoute,
  enterRpgWorld
} from "../fixtures/rpg-playwright-world";

interface RpgPerformanceTrial {
  durationMs: number;
  targetDurationMs: number;
  traversalMs: number;
  orbitMs: number;
  orbitDragCount: number;
  orbitYawTravelRadians: number;
  averageFps: number;
  p5Fps: number;
  maximumRafIntervalMs: number;
  frameSampleCount: number;
  rafIntervalTailMs: number[];
  longFrameCount: number;
  transitionRequestCount: number;
  requestFailureCount: number;
  pageErrorCount: number;
  consoleErrorCount: number;
  httpErrorCount: number;
  coreAssetErrorCount: number;
  requestFailures: Array<{
    url: string;
    resourceType: string;
    errorText: string | null;
  }>;
  httpErrors: Array<{
    url: string;
    status: number;
    resourceType: string;
    coreAsset: boolean;
  }>;
  pageErrors: string[];
  consoleErrors: string[];
  diagnostics: {
    canvasMounts: number;
    runtimeCreates: number;
    sceneMounts: number;
  } | null;
  startQualityStage: RpgQualityDegradationStage;
  endQualityStage: RpgQualityDegradationStage;
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function isQualityStage(value: string): value is RpgQualityDegradationStage {
  return RPG_QUALITY_DEGRADATION_ORDER.includes(
    value as RpgQualityDegradationStage
  );
}

async function readQualityStage(page: Page) {
  const value = await page
    .locator(".seamless-world-renderer")
    .getAttribute("data-quality-stage");
  if (!value || !isQualityStage(value)) {
    throw new Error(`invalid RPG quality stage: ${value}`);
  }
  return value;
}

async function environmentAttachment(page: Page, testInfo: TestInfo) {
  const hostCpus = cpus();
  const environment = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".seamless-world-renderer canvas"
    );
    const gl =
      canvas?.getContext("webgl2") ?? canvas?.getContext("webgl") ?? null;
    const extension = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory:
        "deviceMemory" in navigator
          ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory
          : null,
      devicePixelRatio: window.devicePixelRatio,
      webglRenderer:
        gl && extension
          ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
          : gl?.getParameter(gl.RENDERER) ?? "unavailable",
      qualityStage: document
        .querySelector<HTMLElement>(".seamless-world-renderer")
        ?.getAttribute("data-quality-stage")
    };
  });
  await testInfo.attach(`environment-${testInfo.project.name}.json`, {
    body: Buffer.from(
      JSON.stringify(
        {
          browser: {
            name: testInfo.project.use.browserName,
            version: await page.context().browser()?.version()
          },
          host: {
            os: {
              platform: platform(),
              release: release(),
              architecture: arch()
            },
            cpu: {
              model: hostCpus[0]?.model ?? "unavailable",
              logicalCoreCount: hostCpus.length
            }
          },
          runtime: {
            name: process.release.name,
            nodeVersion: process.version,
            v8Version: process.versions.v8,
            architecture: process.arch
          },
          browserHardwareConcurrency: environment.hardwareConcurrency,
          browserDeviceMemoryGiB: environment.deviceMemory,
          dpr: environment.devicePixelRatio,
          webglRenderer: environment.webglRenderer,
          qualityLevels: RPG_QUALITY_DEGRADATION_ORDER,
          activeQualityStage: environment.qualityStage,
          userAgent: environment.userAgent,
          navigatorPlatform: environment.platform,
          cpuThrottlingRate:
            testInfo.project.name === "mobile-constrained" ? 4 : 1
        },
        null,
        2
      )
    ),
    contentType: "application/json"
  });
}

function isCoreAssetRequest(request: Request) {
  const resourceType = request.resourceType();
  const pathname = new URL(request.url()).pathname;
  return (
    ["script", "stylesheet", "font"].includes(resourceType) ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/@vite/")
  );
}

async function releaseTrustedInputs(page: Page) {
  await page.mouse.up().catch(() => undefined);
  for (const key of ["w", "a", "s", "d", "Shift"]) {
    await page.keyboard.up(key).catch(() => undefined);
  }
}

async function runTrial(page: Page): Promise<RpgPerformanceTrial> {
  let measurementRequests = false;
  let transitionRequestCount = 0;
  let requestFailureCount = 0;
  let pageErrorCount = 0;
  let consoleErrorCount = 0;
  const requestFailures: RpgPerformanceTrial["requestFailures"] = [];
  const httpErrors: RpgPerformanceTrial["httpErrors"] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const isMeasuring = () => measurementRequests;
  const onRequest = () => {
    if (isMeasuring()) transitionRequestCount += 1;
  };
  const onRequestFailed = (request: Request) => {
    if (!isMeasuring()) return;
    requestFailureCount += 1;
    requestFailures.push({
      url: request.url(),
      resourceType: request.resourceType(),
      errorText: request.failure()?.errorText ?? null
    });
  };
  const onResponse = (response: Response) => {
    if (!isMeasuring() || response.status() < 400) return;
    const request = response.request();
    httpErrors.push({
      url: response.url(),
      status: response.status(),
      resourceType: request.resourceType(),
      coreAsset: isCoreAssetRequest(request)
    });
  };
  const onPageError = (error: Error) => {
    if (!isMeasuring()) return;
    pageErrorCount += 1;
    pageErrors.push(error.message);
  };
  const onConsole = (message: ConsoleMessage) => {
    if (isMeasuring() && message.type() === "error") {
      consoleErrorCount += 1;
      consoleErrors.push(message.text());
    }
  };
  page.on("request", onRequest);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  try {
    if (page.url() === "about:blank") {
      await page.goto("/en");
    }
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await enterRpgWorld(page, "female", { navigate: false });
    await page.waitForTimeout(5_000);

    transitionRequestCount = 0;
    requestFailureCount = 0;
    pageErrorCount = 0;
    consoleErrorCount = 0;
    requestFailures.length = 0;
    httpErrors.length = 0;
    pageErrors.length = 0;
    consoleErrors.length = 0;
    const startQualityStage = await readQualityStage(page);
    const diagnosticsBaseline = await page.evaluate(
      () => window.__RPG_RUNTIME_DIAGNOSTICS__
    );
    expect(diagnosticsBaseline).toEqual({
      canvasMounts: 1,
      runtimeCreates: 1,
      sceneMounts: 1
    });

    const startMeasurement = async () => {
      measurementRequests = true;
      await page.evaluate(() => {
        const targetDurationMs = 75_000;
        const state = {
          measurementStarted: true,
          start: performance.now(),
          stop: 0,
          targetDurationMs,
          timestamps: [] as number[],
          raf: 0,
          timer: 0,
          diagnostics:
            null as typeof window.__RPG_RUNTIME_DIAGNOSTICS__ | null,
          endQualityStage: null as string | null,
          publishedQualityStage: null as string | null
        };
        const stop = () => {
          if (!state.measurementStarted) return;
          state.stop = performance.now();
          const renderer = document.querySelector<HTMLElement>(
            ".seamless-world-renderer"
          );
          state.diagnostics = window.__RPG_RUNTIME_DIAGNOSTICS__ ?? null;
          state.endQualityStage = renderer?.dataset.qualityStage ?? null;
          state.publishedQualityStage =
            window.__RPG_PERFORMANCE__?.qualityStage ?? null;
          state.measurementStarted = false;
          cancelAnimationFrame(state.raf);
        };
        const sample = (now: number) => {
          if (!state.measurementStarted) return;
          state.timestamps.push(now);
          state.raf = requestAnimationFrame(sample);
        };
        state.raf = requestAnimationFrame(sample);
        state.timer = window.setTimeout(stop, targetDurationMs);
        Object.assign(window, { __RPG_PERF_SAMPLE__: state });
      });
    };

    const route = await driveCanonicalRoute(page, {
      runRequested: true,
      requireMapObservation: false,
      onPrepared: startMeasurement
    });
    expect(route.traversalMs).toBeGreaterThanOrEqual(64_300 * 0.95);
    expect(route.traversalMs).toBeLessThanOrEqual(64_300 * 1.05);

    let orbitDragCount = 0;
    let orbitYawTravelRadians = 0;
    let previousOrbitYaw = await page.evaluate(() =>
      Number(
        document.querySelector<HTMLElement>(".seamless-world-renderer")
          ?.dataset.cameraYaw
      )
    );
    if (!Number.isFinite(previousOrbitYaw)) {
      throw new Error(`invalid orbit start yaw: ${previousOrbitYaw}`);
    }
    while (
      await page.evaluate(() => {
        const state = (
          window as typeof window & {
            __RPG_PERF_SAMPLE__?: {
              measurementStarted: boolean;
              start: number;
              targetDurationMs: number;
            };
          }
        ).__RPG_PERF_SAMPLE__;
        return Boolean(
          state?.measurementStarted
        );
      })
    ) {
      await dragCamera(page, 24, 0);
      const currentOrbitYaw = await page.evaluate(() =>
        Number(
          document.querySelector<HTMLElement>(".seamless-world-renderer")
            ?.dataset.cameraYaw
        )
      );
      if (!Number.isFinite(currentOrbitYaw)) {
        throw new Error(`invalid orbit yaw after drag: ${currentOrbitYaw}`);
      }
      orbitYawTravelRadians += Math.abs(
        Math.atan2(
          Math.sin(currentOrbitYaw - previousOrbitYaw),
          Math.cos(currentOrbitYaw - previousOrbitYaw)
        )
      );
      previousOrbitYaw = currentOrbitYaw;
      orbitDragCount += 1;
      await page.waitForTimeout(80);
    }

    const sample = await page.evaluate(async () => {
      const state = (
        window as typeof window & {
          __RPG_PERF_SAMPLE__?: {
            measurementStarted: boolean;
            start: number;
            stop: number;
            targetDurationMs: number;
            timestamps: number[];
            raf: number;
            timer: number;
            diagnostics:
              | {
                  canvasMounts: number;
                  runtimeCreates: number;
                  sceneMounts: number;
                }
              | null;
            endQualityStage: string | null;
            publishedQualityStage: string | null;
          };
        }
      ).__RPG_PERF_SAMPLE__;
      if (!state) throw new Error("performance sampler is missing");
      while (state.measurementStarted) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      clearTimeout(state.timer);
      cancelAnimationFrame(state.raf);
      const intervals = state.timestamps.map((value, index) =>
        index === 0 ? value - state.start : value - state.timestamps[index - 1]
      );
      const sorted = [...intervals].sort((a, b) => a - b);
      const total = intervals.reduce((sum, value) => sum + value, 0);
      const p95 =
        sorted[
          Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1))
        ] ?? Number.POSITIVE_INFINITY;
      return {
        stop: state.stop,
        durationMs: state.stop - state.start,
        targetDurationMs: state.targetDurationMs,
        maximumRafIntervalMs: Math.max(...intervals),
        frameSampleCount: intervals.length,
        rafIntervalTailMs: intervals.slice(-120),
        averageFps: total > 0 ? intervals.length / (total / 1_000) : 0,
        p5Fps: Number.isFinite(p95) ? 1_000 / p95 : 0,
        longFrameCount: intervals.filter((value) => value > 250).length,
        diagnostics: state.diagnostics,
        endQualityStage: state.endQualityStage,
        publishedQualityStage: state.publishedQualityStage
      };
    });
    measurementRequests = false;

    if (!sample.endQualityStage || !isQualityStage(sample.endQualityStage)) {
      throw new Error(`invalid end quality stage: ${sample.endQualityStage}`);
    }
    expect(sample.publishedQualityStage).toBe(sample.endQualityStage);
    const orbitMs = Math.max(0, sample.stop - route.finishedAt);

    return {
      durationMs: sample.durationMs,
      targetDurationMs: sample.targetDurationMs,
      traversalMs: route.traversalMs,
      orbitMs,
      orbitDragCount,
      orbitYawTravelRadians,
      averageFps: sample.averageFps,
      p5Fps: sample.p5Fps,
      maximumRafIntervalMs: sample.maximumRafIntervalMs,
      frameSampleCount: sample.frameSampleCount,
      rafIntervalTailMs: sample.rafIntervalTailMs,
      longFrameCount: sample.longFrameCount,
      transitionRequestCount,
      requestFailureCount,
      pageErrorCount,
      consoleErrorCount,
      httpErrorCount: httpErrors.length,
      coreAssetErrorCount: httpErrors.filter((error) => error.coreAsset).length,
      requestFailures,
      httpErrors,
      pageErrors,
      consoleErrors,
      diagnostics: sample.diagnostics ?? null,
      startQualityStage,
      endQualityStage: sample.endQualityStage
    };
  } finally {
    measurementRequests = false;
    await page
      .evaluate(() => {
        const observedWindow = window as typeof window & {
          __RPG_PERF_SAMPLE__?: {
            measurementStarted: boolean;
            raf: number;
            timer: number;
          };
        };
        const state = observedWindow.__RPG_PERF_SAMPLE__;
        if (!state) return;
        state.measurementStarted = false;
        clearTimeout(state.timer);
        cancelAnimationFrame(state.raf);
        delete observedWindow.__RPG_PERF_SAMPLE__;
      })
      .catch(() => undefined);
    page.off("request", onRequest);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    await releaseTrustedInputs(page);
  }
}

test("samples the seamless RPG route for three exact 75-second trials", async ({
  page
}, testInfo) => {
  const mobile = testInfo.project.name === "mobile-constrained";
  const client = mobile
    ? await page.context().newCDPSession(page)
    : null;
  if (client) {
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  try {
    const trials: RpgPerformanceTrial[] = [];
    for (let index = 0; index < 3; index += 1) {
      trials.push(await runTrial(page));
    }
    await environmentAttachment(page, testInfo);
    const serializedTrials = JSON.stringify(trials, null, 2);
    const trialsPath = testInfo.outputPath(
      `trials-${testInfo.project.name}.json`
    );
    await writeFile(trialsPath, serializedTrials, "utf8");
    await testInfo.attach(`trials-${testInfo.project.name}.json`, {
      path: trialsPath,
      contentType: "application/json"
    });
    for (const trial of trials) {
      expect(Math.abs(trial.durationMs - trial.targetDurationMs))
        .toBeLessThanOrEqual(trial.maximumRafIntervalMs);
      expect(trial.orbitMs).toBeGreaterThan(0);
      expect(
        Math.abs(
          trial.orbitMs - (trial.durationMs - trial.traversalMs)
        )
      ).toBeLessThanOrEqual(trial.maximumRafIntervalMs);
      expect(trial.orbitDragCount).toBeGreaterThan(0);
      expect(trial.orbitYawTravelRadians).toBeGreaterThan(0.05);
      expect(trial.longFrameCount).toBe(0);
      expect(trial.transitionRequestCount).toBe(0);
      expect(trial.requestFailureCount).toBe(0);
      expect(trial.httpErrorCount).toBe(0);
      expect(trial.coreAssetErrorCount).toBe(0);
      expect(trial.pageErrorCount).toBe(0);
      expect(trial.consoleErrorCount).toBe(0);
      expect(trial.diagnostics).toEqual({
        canvasMounts: 1,
        runtimeCreates: 1,
        sceneMounts: 1
      });
    }
    const averageFps = median(trials.map((trial) => trial.averageFps));
    const p5Fps = median(trials.map((trial) => trial.p5Fps));
    console.log(
      "RPG_PERFORMANCE_RESULT",
      JSON.stringify({
        project: testInfo.project.name,
        averageFps,
        p5Fps,
        trials
      })
    );
    expect(averageFps).toBeGreaterThanOrEqual(mobile ? 42 : 55);
    expect(p5Fps).toBeGreaterThanOrEqual(mobile ? 24 : 40);
  } finally {
    if (client) {
      await client.send("Emulation.setCPUThrottlingRate", { rate: 1 });
      await client.detach();
    }
  }
});
