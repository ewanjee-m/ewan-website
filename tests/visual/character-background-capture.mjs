import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:4180";
const outputDirectory =
  process.env.VISUAL_OUTPUT_DIR ?? "/private/tmp/ewan-character-background";
const requestedViewport = process.env.VISUAL_VIEWPORT;
const requestedCharacter = process.env.VISUAL_CHARACTER;
const viewports = [
  {
    id: "mobile",
    viewport: { width: 390, height: 667 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true
  },
  {
    id: "desktop",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false
  }
];
const characters = [
  { id: "male", label: "Select male character" },
  { id: "female", label: "Select female character" }
];
const manifest = {
  schemaVersion: 1,
  baseURL,
  generatedAt: new Date().toISOString(),
  selectionScreenshots: [],
  viewportChecks: [],
  turnChecks: [],
  characterTelemetryChecks: [],
  captures: []
};

const MAX_SETTLED_TURN_ERROR = 0.12;
const MIN_DISTINCT_HEADING_RADIANS = 0.35;
const MAX_SCENE_DRAW_CALLS = 160;
// 90k was the pre-geometry-world limit. The carved island terrain, canal
// masonry and 1,542 windows measure 155k-167k on their own, and the anime
// pass adds inverted-hull outlines (~+55k peak) plus richer hanabi, so the
// ceiling that actually guards regressions is 280k. Draw calls stay at 160.
const MAX_SCENE_TRIANGLES = 280_000;

function normalizeRadians(value) {
  const fullTurn = Math.PI * 2;
  return ((value + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
}

function angularDistance(first, second) {
  return Math.abs(normalizeRadians(first - second));
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function openCharacterSelection(page) {
  await page.goto(`${baseURL}/en`);
  await page.getByRole("button", { name: "START" }).click();
  await page.waitForFunction(() => {
    const images = Array.from(
      document.querySelectorAll(".character-option img")
    );
    return (
      images.length === 2 &&
      images.every(
        (image) =>
          image instanceof HTMLImageElement &&
          image.complete &&
          image.naturalWidth > 0 &&
          Math.abs(image.naturalHeight / image.naturalWidth - 1.5) < 0.01
      )
    );
  });
  await page.waitForTimeout(500);
}

async function waitForWorldTelemetry(page) {
  await page.waitForFunction(
    () => {
      const world = document.querySelector(".world-shell");
      const canvas = world?.querySelector("canvas");
      return Boolean(
        world?.getAttribute("data-player-position") &&
          canvas instanceof HTMLCanvasElement
      );
    },
    undefined,
    { timeout: 30_000 }
  );
}

async function installCharacterTelemetryAudit(page) {
  await page.evaluate(() => {
    const samples = [];
    const audit = {
      samples,
      minimumScaleX: Number.POSITIVE_INFINITY,
      maximumScaleX: Number.NEGATIVE_INFINITY,
      invalidSamples: 0,
      nonPositiveScaleSamples: 0,
      active: true
    };
    window.__character3dVisualAudit = audit;

    const sample = () => {
      if (!audit.active) {
        return;
      }
      const canvas = document.querySelector(".world-shell canvas");
      const yaw = Number(canvas?.getAttribute("data-character-yaw"));
      const targetYaw = Number(
        canvas?.getAttribute("data-character-target-yaw")
      );
      const turnError = Number(
        canvas?.getAttribute("data-character-turn-error")
      );
      const scaleX = Number(canvas?.getAttribute("data-character-scale-x"));
      const stridePhase = Number(
        canvas?.getAttribute("data-stride-phase")
      );
      const locomotionState = canvas?.getAttribute(
        "data-locomotion-state"
      );
      const values = [yaw, targetYaw, turnError, scaleX, stridePhase];

      if (values.every(Number.isFinite) && locomotionState !== null) {
        audit.minimumScaleX = Math.min(audit.minimumScaleX, scaleX);
        audit.maximumScaleX = Math.max(audit.maximumScaleX, scaleX);
        if (scaleX <= 0) {
          audit.nonPositiveScaleSamples += 1;
        }
        samples.push({
          yaw,
          targetYaw,
          turnError,
          scaleX,
          stridePhase,
          locomotionState
        });
        if (samples.length > 12_000) {
          samples.shift();
        }
      } else {
        audit.invalidSamples += 1;
      }
      requestAnimationFrame(sample);
    };

    requestAnimationFrame(sample);
  });
}

async function readCharacterAudit(page, fromSample = 0) {
  return page.evaluate((startIndex) => {
    const audit = window.__character3dVisualAudit;
    if (!audit) {
      throw new Error("3D character telemetry audit is not installed");
    }
    return {
      sampleCount: audit.samples.length,
      minimumScaleX: audit.minimumScaleX,
      maximumScaleX: audit.maximumScaleX,
      invalidSamples: audit.invalidSamples,
      nonPositiveScaleSamples: audit.nonPositiveScaleSamples,
      samples: audit.samples.slice(startIndex)
    };
  }, fromSample);
}

async function readWorldTelemetry(page) {
  return page.locator(".world-shell").evaluate((world) => {
    const canvas = world.querySelector("canvas");
    const renderer = world.querySelector("[data-world-renderer]");
    const miniMap = world.querySelector(".rpg-mini-map");
    const miniMapToggle = miniMap?.querySelector(".rpg-mini-map-toggle");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("RPG world canvas is not available");
    }

    const rawPosition = world.getAttribute("data-player-position");
    const position = rawPosition?.split(",").map(Number) ?? [];
    if (position.length !== 3 || position.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid world player position: ${rawPosition}`);
    }

    return {
      world: {
        "data-current-zone": world.getAttribute("data-current-zone"),
        "data-player-position": rawPosition,
        playerPosition: position
      },
      renderer: {
        "data-world-renderer": renderer?.getAttribute("data-world-renderer"),
        "data-camera-mode": renderer?.getAttribute("data-camera-mode"),
        "data-scene-quality": renderer?.getAttribute("data-scene-quality")
      },
      miniMap: miniMap
        ? {
            expanded: miniMap.getAttribute("data-expanded"),
            toggleExpanded: miniMapToggle?.getAttribute("aria-expanded"),
            bounds: (() => {
              const bounds = miniMap.getBoundingClientRect();
              return {
                left: bounds.left,
                top: bounds.top,
                right: bounds.right,
                bottom: bounds.bottom,
                width: bounds.width,
                height: bounds.height
              };
            })()
          }
        : null,
      canvas: {
        "data-moving": canvas.getAttribute("data-moving"),
        "data-character-renderer": canvas.getAttribute(
          "data-character-renderer"
        ),
        "data-character-yaw": canvas.getAttribute("data-character-yaw"),
        "data-character-target-yaw": canvas.getAttribute(
          "data-character-target-yaw"
        ),
        "data-character-turn-error": canvas.getAttribute(
          "data-character-turn-error"
        ),
        "data-character-scale-x": canvas.getAttribute(
          "data-character-scale-x"
        ),
        "data-stride-phase": canvas.getAttribute("data-stride-phase"),
        "data-locomotion-state": canvas.getAttribute(
          "data-locomotion-state"
        ),
        "data-camera-yaw": canvas.getAttribute("data-camera-yaw"),
        "data-camera-pitch": canvas.getAttribute("data-camera-pitch"),
        "data-camera-collision-ratio": canvas.getAttribute(
          "data-camera-collision-ratio"
        ),
        "data-camera-lateral-escape": canvas.getAttribute(
          "data-camera-lateral-escape"
        ),
        "data-fps": canvas.getAttribute("data-fps"),
        "data-draw-calls": canvas.getAttribute("data-draw-calls"),
        "data-triangles": canvas.getAttribute("data-triangles")
      }
    };
  });
}

async function waitForWorldState(
  page,
  {
    zone,
    moving,
    locomotionState,
    maxTurnError,
    targetYawDifferentFrom,
    stridePhaseDifferentFrom
  }
) {
  await page.waitForFunction(
    (expected) => {
      const world = document.querySelector(".world-shell");
      const canvas = world?.querySelector("canvas");
      if (!world || !canvas) {
        return false;
      }
      const normalize = (value) => {
        const fullTurn = Math.PI * 2;
        return ((value + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;
      };
      const targetYaw = Number(
        canvas.getAttribute("data-character-target-yaw")
      );
      const turnError = Number(
        canvas.getAttribute("data-character-turn-error")
      );
      const stridePhase = Number(
        canvas.getAttribute("data-stride-phase")
      );
      return (
        (expected.zone === undefined ||
          world.getAttribute("data-current-zone") === expected.zone) &&
        (expected.moving === undefined ||
          canvas.getAttribute("data-moving") === String(expected.moving)) &&
        (expected.locomotionState === undefined ||
          canvas.getAttribute("data-locomotion-state") ===
            expected.locomotionState) &&
        (expected.maxTurnError === undefined ||
          (Number.isFinite(turnError) &&
            Math.abs(turnError) <= expected.maxTurnError)) &&
        (expected.targetYawDifferentFrom === undefined ||
          (Number.isFinite(targetYaw) &&
            Math.abs(
              normalize(targetYaw - expected.targetYawDifferentFrom)
            ) >= expected.minimumDistinctHeadingRadians)) &&
        (expected.stridePhaseDifferentFrom === undefined ||
          (Number.isFinite(stridePhase) &&
            Math.abs(
              normalize(stridePhase - expected.stridePhaseDifferentFrom)
            ) >= expected.minimumDistinctHeadingRadians))
      );
    },
    {
      zone,
      moving,
      locomotionState,
      maxTurnError,
      targetYawDifferentFrom,
      stridePhaseDifferentFrom,
      minimumDistinctHeadingRadians: MIN_DISTINCT_HEADING_RADIANS
    },
    { timeout: 30_000 }
  );
}

async function waitForPlayerX(page, target, comparison = "atLeast") {
  await waitForPlayerCoordinate(page, 0, target, comparison);
}

async function waitForPlayerCoordinate(
  page,
  coordinateIndex,
  target,
  comparison = "atLeast"
) {
  await page.waitForFunction(
    ({ axisIndex, minimumOrMaximum, expectedCoordinate }) => {
      const rawPosition = document
        .querySelector(".world-shell")
        ?.getAttribute("data-player-position");
      const coordinate = Number(rawPosition?.split(",")[axisIndex]);
      return (
        Number.isFinite(coordinate) &&
        (minimumOrMaximum === "atLeast"
          ? coordinate >= expectedCoordinate
          : coordinate <= expectedCoordinate)
      );
    },
    {
      axisIndex: coordinateIndex,
      minimumOrMaximum: comparison,
      expectedCoordinate: target
    },
    { timeout: 30_000 }
  );
}

async function waitForPlayerAxisDelta(page, axis, origin, minimumDelta) {
  await page.waitForFunction(
    ({ coordinateIndex, start, delta }) => {
      const rawPosition = document
        .querySelector(".world-shell")
        ?.getAttribute("data-player-position");
      const value = Number(rawPosition?.split(",")[coordinateIndex]);
      return Number.isFinite(value) && Math.abs(value - start) >= delta;
    },
    { coordinateIndex: axis, start: origin, delta: minimumDelta },
    { timeout: 10_000 }
  );
}

async function captureWorldState(
  page,
  { viewportId, characterId, scene, fileName, movementKey, expected }
) {
  let telemetry;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await waitForWorldState(page, expected);
    const candidate = await readWorldTelemetry(page);
    const matches =
      (expected.zone === undefined ||
        candidate.world["data-current-zone"] === expected.zone) &&
      (expected.moving === undefined ||
        candidate.canvas["data-moving"] === String(expected.moving)) &&
      (expected.locomotionState === undefined ||
        candidate.canvas["data-locomotion-state"] ===
          expected.locomotionState) &&
      (expected.maxTurnError === undefined ||
        Math.abs(
          Number(candidate.canvas["data-character-turn-error"])
        ) <= expected.maxTurnError) &&
      (expected.targetYawDifferentFrom === undefined ||
        angularDistance(
          Number(candidate.canvas["data-character-target-yaw"]),
          expected.targetYawDifferentFrom
        ) >= MIN_DISTINCT_HEADING_RADIANS) &&
      (expected.stridePhaseDifferentFrom === undefined ||
        angularDistance(
          Number(candidate.canvas["data-stride-phase"]),
          expected.stridePhaseDifferentFrom
        ) >= MIN_DISTINCT_HEADING_RADIANS);
    if (matches) {
      telemetry = candidate;
      break;
    }
  }
  if (!telemetry) {
    throw new Error(
      `Capture state changed before telemetry was recorded: ${scene}`
    );
  }
  const characterYaw = Number(telemetry.canvas["data-character-yaw"]);
  const characterTargetYaw = Number(
    telemetry.canvas["data-character-target-yaw"]
  );
  const characterTurnError = Number(
    telemetry.canvas["data-character-turn-error"]
  );
  const characterScaleX = Number(
    telemetry.canvas["data-character-scale-x"]
  );
  const stridePhase = Number(telemetry.canvas["data-stride-phase"]);
  const expectedTurnError = normalizeRadians(
    characterTargetYaw - characterYaw
  );
  if (
    ![
      characterYaw,
      characterTargetYaw,
      characterTurnError,
      characterScaleX,
      stridePhase
    ].every(Number.isFinite) ||
    characterScaleX <= 0 ||
    angularDistance(characterTurnError, expectedTurnError) > 0.02 ||
    !["idle", "run", "jump"].includes(
      telemetry.canvas["data-locomotion-state"]
    )
  ) {
    throw new Error(
      `Invalid articulated character telemetry: ${JSON.stringify(telemetry.canvas)}`
    );
  }
  const finiteMetrics = [
    Number(telemetry.canvas["data-fps"]),
    Number(telemetry.canvas["data-draw-calls"]),
    Number(telemetry.canvas["data-triangles"]),
    Number(telemetry.canvas["data-camera-collision-ratio"])
  ];
  if (
    finiteMetrics.some((value) => !Number.isFinite(value) || value < 0) ||
    finiteMetrics[0] <= 0 ||
    finiteMetrics[1] <= 0 ||
    finiteMetrics[2] <= 0 ||
    finiteMetrics[1] > MAX_SCENE_DRAW_CALLS ||
    finiteMetrics[2] > MAX_SCENE_TRIANGLES ||
    finiteMetrics[3] > 1
  ) {
    throw new Error(`Invalid renderer metrics: ${JSON.stringify(telemetry.canvas)}`);
  }
  if (
    !["true", "false"].includes(
      telemetry.canvas["data-camera-lateral-escape"]
    )
  ) {
    throw new Error(
      `Invalid camera escape telemetry: ${JSON.stringify(telemetry.canvas)}`
    );
  }
  const mapBounds = telemetry.miniMap?.bounds;
  const expectedMapExpanded = viewportId === "desktop";
  if (
    telemetry.miniMap?.expanded !== String(expectedMapExpanded) ||
    telemetry.miniMap?.toggleExpanded !== String(expectedMapExpanded) ||
    !mapBounds ||
    mapBounds.left < -1 ||
    mapBounds.top < -1 ||
    mapBounds.right > (viewportId === "mobile" ? 391 : 1441) ||
    mapBounds.bottom > (viewportId === "mobile" ? 668 : 901)
  ) {
    throw new Error(`Invalid minimap telemetry: ${JSON.stringify(telemetry.miniMap)}`);
  }
  await page.screenshot({ path: join(outputDirectory, fileName) });
  manifest.captures.push({
    viewport: viewportId,
    character: characterId,
    scene,
    file: fileName,
    movementKey: movementKey ?? null,
    expected,
    telemetry
  });
  return telemetry;
}

async function captureSettledTurnEvidence(
  page,
  {
    viewportId,
    characterId,
    scene,
    baseline,
    auditStartSample,
    minimumHeadingChange = MIN_DISTINCT_HEADING_RADIANS
  }
) {
  try {
    await waitForWorldState(page, {
      moving: true,
      locomotionState: "run",
      maxTurnError: MAX_SETTLED_TURN_ERROR,
      targetYawDifferentFrom: baseline.targetYaw
    });
  } catch (error) {
    const telemetry = await readWorldTelemetry(page);
    throw new Error(
      `Timed out waiting for settled 3D turn: ${JSON.stringify({
        scene,
        baseline,
        current: telemetry.canvas,
        playerPosition: telemetry.world.playerPosition
      })}`,
      { cause: error }
    );
  }
  const settled = await readWorldTelemetry(page);
  const audit = await readCharacterAudit(page, auditStartSample);
  const settledYaw = Number(settled.canvas["data-character-yaw"]);
  const settledTargetYaw = Number(
    settled.canvas["data-character-target-yaw"]
  );
  const settledTurnError = Number(
    settled.canvas["data-character-turn-error"]
  );
  const headingChange = angularDistance(
    settledTargetYaw,
    baseline.targetYaw
  );
  const yawTravel = angularDistance(settledYaw, baseline.yaw);
  const samplesForSettledTarget = audit.samples.filter(
    (sample) =>
      angularDistance(sample.targetYaw, settledTargetYaw) < 0.05
  );
  const firstTargetSample = samplesForSettledTarget.at(0);
  const maximumObservedTurnError = samplesForSettledTarget.reduce(
    (maximum, sample) => Math.max(maximum, Math.abs(sample.turnError)),
    0
  );

  if (
    headingChange < minimumHeadingChange ||
    yawTravel < minimumHeadingChange * 0.5 ||
    Math.abs(settledTurnError) > MAX_SETTLED_TURN_ERROR ||
    audit.nonPositiveScaleSamples > 0 ||
    samplesForSettledTarget.length === 0 ||
    (firstTargetSample &&
      Math.abs(firstTargetSample.turnError) > MAX_SETTLED_TURN_ERROR &&
      maximumObservedTurnError <= Math.abs(settledTurnError) + 0.01)
  ) {
    throw new Error(
      `Character turn did not converge as a positive-scale 3D rotation: ${JSON.stringify({
        scene,
        baseline,
        settledYaw,
        settledTargetYaw,
        settledTurnError,
        headingChange,
        yawTravel,
        maximumObservedTurnError,
        sampleCount: samplesForSettledTarget.length,
        minimumScaleX: audit.minimumScaleX,
        nonPositiveScaleSamples: audit.nonPositiveScaleSamples
      })}`
    );
  }

  const evidence = {
    viewport: viewportId,
    character: characterId,
    scene,
    baselineYaw: baseline.yaw,
    baselineTargetYaw: baseline.targetYaw,
    settledYaw,
    settledTargetYaw,
    settledTurnError,
    headingChange,
    yawTravel,
    maximumObservedTurnError,
    sampleCount: samplesForSettledTarget.length,
    minimumScaleX: audit.minimumScaleX,
    passed: true
  };
  manifest.turnChecks.push(evidence);
  return evidence;
}

function readCharacterAngles(telemetry) {
  return {
    yaw: Number(telemetry.canvas["data-character-yaw"]),
    targetYaw: Number(telemetry.canvas["data-character-target-yaw"]),
    stridePhase: Number(telemetry.canvas["data-stride-phase"])
  };
}

try {
  for (const viewportCase of viewports.filter(
    ({ id }) => !requestedViewport || id === requestedViewport
  )) {
    const context = await browser.newContext({
      viewport: viewportCase.viewport,
      deviceScaleFactor: viewportCase.deviceScaleFactor,
      hasTouch: viewportCase.hasTouch,
      isMobile: viewportCase.isMobile
    });
    const page = await context.newPage();
    const browserErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    await page.addInitScript(() => localStorage.clear());

    await openCharacterSelection(page);
    const selectionFile = `${viewportCase.id}-character-selection.png`;
    await page.screenshot({
      path: join(outputDirectory, selectionFile)
    });
    manifest.selectionScreenshots.push({
      viewport: viewportCase.id,
      file: selectionFile
    });

    for (const character of characters.filter(
      ({ id }) => !requestedCharacter || id === requestedCharacter
    )) {
      await openCharacterSelection(page);
      await page.getByRole("button", { name: character.label }).click();
      await page.getByRole("button", { name: "ENTER WORLD" }).click();
      await page.locator('[data-world-ready="true"]').waitFor({
        state: "visible",
        timeout: 30_000
      });
      await page.locator("canvas").first().waitFor({
        state: "visible",
        timeout: 30_000
      });
      await waitForWorldTelemetry(page);
      await installCharacterTelemetryAudit(page);
      await page.waitForTimeout(1_200);
      const worldEnteredAt = Date.now();

      const worldMetrics = await page.locator(".world-shell").evaluate((world) => {
        const bounds = world.getBoundingClientRect();
        const shell = world.closest(".start-screen");
        return {
          left: bounds.left,
          top: bounds.top,
          width: bounds.width,
          height: bounds.height,
          shellScrollLeft: shell?.scrollLeft ?? -1,
          shellScrollTop: shell?.scrollTop ?? -1
        };
      });
      if (
        Math.abs(worldMetrics.left) > 1 ||
        Math.abs(worldMetrics.top) > 1 ||
        worldMetrics.width < viewportCase.viewport.width - 1 ||
        worldMetrics.height < viewportCase.viewport.height - 1 ||
        worldMetrics.shellScrollLeft !== 0 ||
        worldMetrics.shellScrollTop !== 0
      ) {
        throw new Error(
          `${viewportCase.id} ${character.id} world does not fill the viewport: ${JSON.stringify(worldMetrics)}`
        );
      }
      manifest.viewportChecks.push({
        viewport: viewportCase.id,
        character: character.id,
        expected: viewportCase.viewport,
        actual: worldMetrics,
        passed: true
      });

      await captureWorldState(page, {
        viewportId: viewportCase.id,
        characterId: character.id,
        scene: "airport-idle",
        fileName: `${viewportCase.id}-${character.id}-airport-idle.png`,
        expected: {
          zone: "airport",
          moving: false,
          locomotionState: "idle",
          maxTurnError: MAX_SETTLED_TURN_ERROR
        }
      });

      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
      // Follow the connected square-town streets: north from the airport,
      // east through Tokyo, south to the central cross street, then east and
      // south again before crossing the sakura bridge into Hanabi.
      await page.keyboard.down("ArrowRight");
      try {
        await waitForPlayerCoordinate(page, 2, 19.4);
      } finally {
        await page.keyboard.up("ArrowRight");
      }
      await waitForWorldState(page, {
        moving: false,
        locomotionState: "idle"
      });

      await page.keyboard.down("ArrowUp");
      try {
        await waitForPlayerX(page, -18);
        await captureWorldState(page, {
          viewportId: viewportCase.id,
          characterId: character.id,
          scene: "tokyo-forward-back",
          fileName: `${viewportCase.id}-${character.id}-tokyo-forward-back.png`,
          movementKey: "ArrowUp",
          expected: {
            zone: "tokyo",
            moving: true,
            locomotionState: "run",
            maxTurnError: MAX_SETTLED_TURN_ERROR
          }
        });
        await waitForPlayerX(page, -8.5);
      } finally {
        await page.keyboard.up("ArrowUp");
      }
      await waitForWorldState(page, {
        moving: false,
        locomotionState: "idle"
      });

      await page.keyboard.down("ArrowLeft");
      try {
        await waitForPlayerCoordinate(page, 2, 2, "atMost");
        await captureWorldState(page, {
          viewportId: viewportCase.id,
          characterId: character.id,
          scene: "gyukatsu-forward-back",
          fileName: `${viewportCase.id}-${character.id}-gyukatsu-forward-back.png`,
          movementKey: "ArrowLeft",
          expected: {
            zone: "gyukatsu",
            moving: true,
            locomotionState: "run",
            maxTurnError: MAX_SETTLED_TURN_ERROR
          }
        });
        await waitForPlayerCoordinate(page, 2, 0.5, "atMost");
      } finally {
        await page.keyboard.up("ArrowLeft");
      }
      await waitForWorldState(page, {
        moving: false,
        locomotionState: "idle"
      });

      await page.keyboard.down("ArrowUp");
      try {
        await waitForPlayerX(page, 7.5);
      } finally {
        await page.keyboard.up("ArrowUp");
      }
      await waitForWorldState(page, {
        moving: false,
        locomotionState: "idle"
      });

      await page.keyboard.down("ArrowLeft");
      try {
        await waitForPlayerCoordinate(page, 2, -23.5, "atMost");
      } finally {
        await page.keyboard.up("ArrowLeft");
      }
      await waitForWorldState(page, {
        zone: "sakura",
        moving: false,
        locomotionState: "idle"
      });

      await page.keyboard.down("ArrowUp");
      try {
        await waitForPlayerX(page, 16.2);
        await captureWorldState(page, {
          viewportId: viewportCase.id,
          characterId: character.id,
          scene: "sakura-bridge-back",
          fileName: `${viewportCase.id}-${character.id}-sakura-bridge-back.png`,
          movementKey: "ArrowUp",
          expected: {
            zone: "hanabi",
            moving: true,
            locomotionState: "run",
            maxTurnError: MAX_SETTLED_TURN_ERROR
          }
        });
      } finally {
        await page.keyboard.up("ArrowUp");
      }
      await waitForWorldState(page, {
        moving: false,
        locomotionState: "idle"
      });

      await page.keyboard.down("ArrowUp");
      try {
        await waitForPlayerX(page, 26);
      } finally {
        await page.keyboard.up("ArrowUp");
      }
      await waitForWorldState(page, {
        zone: "hanabi",
        moving: false,
        locomotionState: "idle"
      });
      const remainingNightDelay = 10_500 - (Date.now() - worldEnteredAt);
      if (remainingNightDelay > 0) {
        await page.waitForTimeout(remainingNightDelay);
      }

      const hanabiPosition = await readWorldTelemetry(page);
      const leftBaseline = readCharacterAngles(hanabiPosition);
      const leftAuditStart = (await readCharacterAudit(page)).sampleCount;
      await page.keyboard.down("ArrowLeft");
      try {
        await waitForPlayerAxisDelta(
          page,
          2,
          hanabiPosition.world.playerPosition[2],
          0.7
        );
        await captureSettledTurnEvidence(page, {
          viewportId: viewportCase.id,
          characterId: character.id,
          scene: "hanabi-left-turn",
          baseline: leftBaseline,
          auditStartSample: leftAuditStart
        });
        await captureWorldState(page, {
          viewportId: viewportCase.id,
          characterId: character.id,
          scene: "hanabi-left-turn",
          fileName: `${viewportCase.id}-${character.id}-hanabi-left-turn.png`,
          movementKey: "ArrowLeft",
          expected: {
            zone: "hanabi",
            moving: true,
            locomotionState: "run",
            maxTurnError: MAX_SETTLED_TURN_ERROR,
            targetYawDifferentFrom: leftBaseline.targetYaw
          }
        });
      } finally {
        await page.keyboard.up("ArrowLeft");
      }
      await waitForWorldState(page, {
        moving: false,
        locomotionState: "idle"
      });

      const rightPosition = await readWorldTelemetry(page);
      const rightBaseline = readCharacterAngles(rightPosition);
      const rightAuditStart = (await readCharacterAudit(page)).sampleCount;
      await page.keyboard.down("ArrowRight");
      try {
        await waitForPlayerAxisDelta(
          page,
          2,
          rightPosition.world.playerPosition[2],
          0.7
        );
        await captureSettledTurnEvidence(page, {
          viewportId: viewportCase.id,
          characterId: character.id,
          scene: "hanabi-right-turn",
          baseline: rightBaseline,
          auditStartSample: rightAuditStart
        });
        await captureWorldState(page, {
          viewportId: viewportCase.id,
          characterId: character.id,
          scene: "hanabi-right-turn",
          fileName: `${viewportCase.id}-${character.id}-hanabi-right-turn.png`,
          movementKey: "ArrowRight",
          expected: {
            zone: "hanabi",
            moving: true,
            locomotionState: "run",
            maxTurnError: MAX_SETTLED_TURN_ERROR,
            targetYawDifferentFrom: rightBaseline.targetYaw
          }
        });
      } finally {
        await page.keyboard.up("ArrowRight");
      }
      await waitForWorldState(page, {
        moving: false,
        locomotionState: "idle"
      });

      const diagonalPosition = await readWorldTelemetry(page);
      const diagonalBaseline = readCharacterAngles(diagonalPosition);
      const diagonalAuditStart = (await readCharacterAudit(page)).sampleCount;
      await page.keyboard.down("ArrowUp");
      await page.keyboard.down("ArrowLeft");
      try {
        await captureSettledTurnEvidence(page, {
          viewportId: viewportCase.id,
          characterId: character.id,
          scene: "hanabi-forward-left-diagonal",
          baseline: diagonalBaseline,
          auditStartSample: diagonalAuditStart
        });
        await captureWorldState(page, {
          viewportId: viewportCase.id,
          characterId: character.id,
          scene: "hanabi-forward-left-diagonal",
          fileName: `${viewportCase.id}-${character.id}-hanabi-forward-left-diagonal.png`,
          movementKey: "ArrowUp+ArrowLeft",
          expected: {
            zone: "hanabi",
            moving: true,
            locomotionState: "run",
            maxTurnError: MAX_SETTLED_TURN_ERROR,
            targetYawDifferentFrom: diagonalBaseline.targetYaw
          }
        });
      } finally {
        await page.keyboard.up("ArrowLeft");
        await page.keyboard.up("ArrowUp");
      }
      await waitForWorldState(page, {
        moving: false,
        locomotionState: "idle",
        maxTurnError: MAX_SETTLED_TURN_ERROR
      });

      const completedAudit = await readCharacterAudit(page);
      const runningSamples = completedAudit.samples.filter(
        (sample) => sample.locomotionState === "run"
      );
      const firstRunningStridePhase = runningSamples.at(0)?.stridePhase;
      const maximumStrideExcursion = Number.isFinite(firstRunningStridePhase)
        ? runningSamples.reduce(
            (maximum, sample) =>
              Math.max(
                maximum,
                angularDistance(sample.stridePhase, firstRunningStridePhase)
              ),
            0
          )
        : 0;
      if (
        completedAudit.sampleCount < 10 ||
        completedAudit.invalidSamples > 0 ||
        completedAudit.nonPositiveScaleSamples > 0 ||
        !Number.isFinite(completedAudit.minimumScaleX) ||
        completedAudit.minimumScaleX <= 0 ||
        runningSamples.length < 2 ||
        maximumStrideExcursion < MIN_DISTINCT_HEADING_RADIANS
      ) {
        throw new Error(
          `3D character telemetry audit failed: ${JSON.stringify({
            sampleCount: completedAudit.sampleCount,
            invalidSamples: completedAudit.invalidSamples,
            nonPositiveScaleSamples: completedAudit.nonPositiveScaleSamples,
            minimumScaleX: completedAudit.minimumScaleX,
            maximumScaleX: completedAudit.maximumScaleX,
            runningSampleCount: runningSamples.length,
            maximumStrideExcursion
          })}`
        );
      }
      manifest.characterTelemetryChecks.push({
        viewport: viewportCase.id,
        character: character.id,
        sampleCount: completedAudit.sampleCount,
        invalidSamples: completedAudit.invalidSamples,
        nonPositiveScaleSamples: completedAudit.nonPositiveScaleSamples,
        minimumScaleX: completedAudit.minimumScaleX,
        maximumScaleX: completedAudit.maximumScaleX,
        runningSampleCount: runningSamples.length,
        maximumStrideExcursion,
        passed: true
      });
    }

    if (browserErrors.length > 0) {
      throw new Error(
        `${viewportCase.id} browser errors:\n${browserErrors.join("\n")}`
      );
    }
    await context.close();
  }

  await writeFile(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
} finally {
  await browser.close();
}
