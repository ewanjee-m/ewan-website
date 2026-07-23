import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:4180";
const outputDirectory =
  process.env.VISUAL_OUTPUT_DIR ?? "/private/tmp/ewan-female-reference";
const angles = [
  { id: "00-back", yaw: 0 },
  { id: "01-angle", yaw: 45 },
  { id: "02-side", yaw: 90 },
  { id: "03-front", yaw: -180 }
];
const scaleComparison = {
  player: {
    position: { x: -30, z: 1.5 },
    visibleHeight: 2.53
  },
  npc: {
    id: "npc-airport-traveler",
    position: { x: -26.8, z: 1.5 },
    displayHeight: 2.78,
    transparentFootRatio: 141 / 1536
  },
  maximumDepthDelta: 0.16,
  lateralSeparationRange: [3.1, 3.3]
};

function angularDelta(target, current) {
  return ((target - current + 180) % 360 + 360) % 360 - 180;
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "reduce"
});
const page = await context.newPage();
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));
await page.addInitScript(() => localStorage.clear());

async function readTelemetry() {
  return page.locator(".world-shell canvas").evaluate((canvas) => ({
    cameraYaw: Number(canvas.getAttribute("data-camera-yaw")),
    cameraPitch: Number(canvas.getAttribute("data-camera-pitch")),
    characterYaw: Number(canvas.getAttribute("data-character-yaw")),
    characterTurnError: Number(
      canvas.getAttribute("data-character-turn-error")
    ),
    drawCalls: Number(canvas.getAttribute("data-draw-calls")),
    triangles: Number(canvas.getAttribute("data-triangles")),
    fps: Number(canvas.getAttribute("data-fps")),
    sceneQuality:
      canvas.closest(".flat-world-renderer")?.getAttribute("data-scene-quality") ??
      null,
    npcRenderer: canvas.getAttribute("data-npc-renderer"),
    npcAnimationKinds: canvas.getAttribute("data-npc-animation-kinds"),
    npcVisibleHeights: canvas.getAttribute("data-npc-visible-heights")
  }));
}

function parsePlayerPosition(rawPosition) {
  const position = rawPosition?.split(",").map(Number);
  if (
    !position ||
    position.length !== 3 ||
    position.some((value) => !Number.isFinite(value))
  ) {
    throw new Error(`Invalid player position telemetry: ${rawPosition}`);
  }
  return { x: position[0], y: position[1], z: position[2] };
}

async function readPlayerPosition() {
  const rawPosition = await page
    .locator(".world-shell")
    .getAttribute("data-player-position");
  return parsePlayerPosition(rawPosition);
}

function createScaleComparisonMetrics(playerPosition, canvasBounds) {
  const npcVisibleHeight =
    scaleComparison.npc.displayHeight *
    (1 - scaleComparison.npc.transparentFootRatio);
  const depthDelta = Math.abs(
    playerPosition.z - scaleComparison.npc.position.z
  );
  const lateralSeparation = Math.abs(
    playerPosition.x - scaleComparison.npc.position.x
  );
  const expectedScreenHeightRatio =
    scaleComparison.player.visibleHeight / npcVisibleHeight;

  return {
    playerPosition,
    npc: {
      id: scaleComparison.npc.id,
      position: scaleComparison.npc.position
    },
    cameraDepthAxis: "z",
    lateralScreenAxis: "x",
    depthDelta,
    lateralSeparation,
    visibleWorldHeight: {
      player: scaleComparison.player.visibleHeight,
      npc: npcVisibleHeight
    },
    expectedScreenHeightRatioAtMatchedDepth: expectedScreenHeightRatio,
    canvasPixels: {
      width: canvasBounds.width,
      height: canvasBounds.height
    }
  };
}

function assertComparableScaleCapture(metrics) {
  if (metrics.depthDelta > scaleComparison.maximumDepthDelta) {
    throw new Error(
      `Player and NPC are not at comparable camera depth: ${JSON.stringify(metrics)}`
    );
  }

  const [minimumSeparation, maximumSeparation] =
    scaleComparison.lateralSeparationRange;
  if (
    metrics.lateralSeparation < minimumSeparation ||
    metrics.lateralSeparation > maximumSeparation
  ) {
    throw new Error(
      `Player and NPC are not separated side by side: ${JSON.stringify(metrics)}`
    );
  }

  if (
    metrics.expectedScreenHeightRatioAtMatchedDepth < 0.97 ||
    metrics.expectedScreenHeightRatioAtMatchedDepth > 1.03
  ) {
    throw new Error(
      `Player and adult NPC visible heights do not match: ${JSON.stringify(metrics)}`
    );
  }
}

async function rotateCameraTo(targetYaw) {
  const zone = page.locator(".camera-drag-zone");
  const bounds = await zone.boundingBox();
  if (!bounds) throw new Error("Camera drag zone is not visible");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await readTelemetry();
    const deltaDegrees = angularDelta(targetYaw, current.cameraYaw);
    if (Math.abs(deltaDegrees) <= 0.35) return;
    const deltaPixels = deltaDegrees / 0.18;
    const startX = bounds.x + bounds.width / 2;
    const startY = bounds.y + bounds.height * 0.45;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + deltaPixels, startY, { steps: 14 });
    await page.mouse.up();
    await page.waitForTimeout(650);
  }

  const current = await readTelemetry();
  if (Math.abs(angularDelta(targetYaw, current.cameraYaw)) > 0.5) {
    throw new Error(
      `Camera did not settle at ${targetYaw}: ${JSON.stringify(current)}`
    );
  }
}

try {
  await page.goto(`${baseURL}/en`);
  await page.getByRole("button", { name: "START" }).click();
  await page.getByRole("button", { name: "Select female character" }).click();
  await page.getByRole("button", { name: "ENTER WORLD" }).click();
  await page.locator('[data-world-ready="true"]').waitFor({
    state: "visible",
    timeout: 30_000
  });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".world-shell canvas")
        ?.getAttribute("data-camera-yaw") !== null,
    undefined,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(1_200);

  const captures = [];
  for (const angle of angles) {
    await rotateCameraTo(angle.yaw);
    const telemetry = await readTelemetry();
    const file = `${angle.id}.png`;
    await page.screenshot({ path: join(outputDirectory, file) });
    captures.push({ ...angle, file, telemetry });
  }

  // At yaw 90 the camera depth follows world Z, so the player and airport
  // traveler (matching Z) are truly side by side without perspective bias.
  await rotateCameraTo(90);
  await page.waitForTimeout(900);
  const playerPosition = await readPlayerPosition();
  const canvasBounds = await page.locator(".world-shell canvas").boundingBox();
  if (!canvasBounds) {
    throw new Error("World canvas is not visible for the NPC scale capture");
  }
  const comparisonMetrics = createScaleComparisonMetrics(
    playerPosition,
    canvasBounds
  );
  assertComparableScaleCapture(comparisonMetrics);
  const npcScaleFile = "04-npc-scale.png";
  const npcScaleTelemetry = await readTelemetry();
  await page.screenshot({ path: join(outputDirectory, npcScaleFile) });
  captures.push({
    id: "04-npc-scale",
    yaw: 90,
    file: npcScaleFile,
    telemetry: npcScaleTelemetry,
    comparisonMetrics
  });

  if (browserErrors.length > 0) {
    throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
  }
  await writeFile(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify({ baseURL, captures }, null, 2)}\n`
  );
} finally {
  await context.close();
  await browser.close();
}
