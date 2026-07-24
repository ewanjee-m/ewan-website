import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_ROOT = path.join(ROOT, "test-results/visual-fidelity");
const PRODUCER_ID = "rpg-world-verification.mjs";
const REVIEW_PROTOCOL = "rpg-visual-review";
const CAPTURE_IDS = [
  "airport",
  "tokyo",
  "gyukatsu",
  "sakura",
  "hanabi",
  "narrow-camera",
  "obstacle-camera",
  "mini-map",
  "full-map",
  "npc-interaction"
];
const VIEWPORTS = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false
  },
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true
  }
};
const CAMERA_FIXTURES = {
  airport: { yawOffsetDegrees: -25, pitchDegrees: 28, desktopDistance: 7.8, mobileDistance: 6.864 },
  tokyo: { yawOffsetDegrees: 30, pitchDegrees: 34, desktopDistance: 6.6, mobileDistance: 5.808 },
  gyukatsu: { yawOffsetDegrees: -20, pitchDegrees: 38, desktopDistance: 5.6, mobileDistance: 4.928 },
  sakura: { yawOffsetDegrees: 25, pitchDegrees: 32, desktopDistance: 6.8, mobileDistance: 5.984 },
  hanabi: { yawOffsetDegrees: -30, pitchDegrees: 28, desktopDistance: 8, mobileDistance: 7.04 }
};
const ROUTE = [
  [-26.304534009865293, -2.973191261452298],
  [-27, -2.973191261452298],
  [-29, -2.973191261452298],
  [-29, 20],
  [-8, 20],
  [-7, 20],
  [-7, 9],
  [-8, 9],
  [-8, 0],
  [8, 0],
  [8, -11],
  [9, -20],
  [14.3, -18],
  [18.9, -18],
  [26, -18]
];
const ARRIVAL_BY_POINT = new Map([
  ["-8,20", "tokyo"],
  ["8,0", "gyukatsu"],
  ["9,-20", "sakura"],
  ["26,-18", "hanabi"]
]);
const LANDMARKS = {
  airport: ["airport-limousine-bus"],
  tokyo: ["tokyo-blue-tower"],
  gyukatsu: ["gyukatsu-main-machiya"],
  sakura: ["sakura-tree-01", "sakura-bridge"],
  hanabi: ["hanabi-apple-stall", "hanabi-street-torii"],
  "narrow-camera": ["gyukatsu-main-machiya"],
  "obstacle-camera": ["gyukatsu-main-machiya"],
  "mini-map": ["airport-limousine-bus", "tokyo-blue-tower", "gyukatsu-main-machiya", "sakura-tree-01", "hanabi-apple-stall"],
  "full-map": ["airport-limousine-bus", "tokyo-blue-tower", "gyukatsu-main-machiya", "sakura-tree-01", "hanabi-apple-stall"],
  "npc-interaction": ["npc-hanabi-child", "hanabi-street-torii"]
};
const REFERENCES = {
  male: {
    character: "male",
    front: "public/assets/characters/player-male.png",
    back: "public/assets/characters/player-male-back.png"
  },
  female: {
    character: "female",
    front: "public/assets/characters/player-female.png",
    back: "public/assets/characters/player-female-back.png"
  }
};

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function expectedIds() {
  return Object.keys(VIEWPORTS).flatMap((viewport) =>
    CAPTURE_IDS.map((id) => `${viewport}/${id}`)
  );
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function sha256File(filename) {
  return sha256(await readFile(filename));
}

function parseArguments(argv) {
  if (argv.length === 1 && argv[0] === "--capture") {
    return { mode: "capture" };
  }
  if (argv.length === 1 && argv[0] === "--self-test") {
    return { mode: "self-test" };
  }
  if (
    argv.length === 3 &&
    argv[0] === "--finalize" &&
    argv[1] === "--evidence-dir" &&
    argv[2]
  ) {
    return { mode: "finalize", evidenceDir: argv[2] };
  }
  fail(
    "E_ARGUMENTS",
    "Use exactly --capture, --self-test, or --finalize --evidence-dir <path>"
  );
}

function resolveEvidenceDirectory(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function assertExactIds(rows, label) {
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) {
    fail("E_DUPLICATE_ROW", `${label} contains duplicate row IDs`);
  }
  const expected = expectedIds().sort();
  const actual = [...ids].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail("E_ROW_SET", `${label} does not contain the exact 20 capture IDs`);
  }
}

function validIsoTimestamp(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

async function referenceAssetsWithHashes() {
  return Promise.all(
    Object.values(REFERENCES).map(async (reference) => ({
      ...reference,
      frontSha256: await sha256File(path.join(ROOT, reference.front)),
      backSha256: await sha256File(path.join(ROOT, reference.back))
    }))
  );
}

function referenceAssetsMatch(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    return false;
  }
  const byCharacter = new Map(
    actual.map((reference) => [reference?.character, reference])
  );
  if (byCharacter.size !== actual.length) {
    return false;
  }
  const fields = [
    "character",
    "front",
    "back",
    "frontSha256",
    "backSha256"
  ];
  return expected.every((reference) => {
    const candidate = byCharacter.get(reference.character);
    return (
      candidate &&
      fields.every((field) => candidate[field] === reference[field])
    );
  });
}

async function validateFinalize(evidenceDirectory) {
  const manifestPath = path.join(evidenceDirectory, "capture-manifest.json");
  const reviewPath = path.join(evidenceDirectory, "visual-review.json");
  const [manifestBytes, review, browserErrors, networkErrors] = await Promise.all([
    readFile(manifestPath),
    readFile(reviewPath, "utf8").then(JSON.parse),
    readFile(path.join(evidenceDirectory, "browser-errors.json"), "utf8").then(JSON.parse),
    readFile(path.join(evidenceDirectory, "network-errors.json"), "utf8").then(JSON.parse)
  ]);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assertExactIds(manifest.rows, "capture manifest");
  assertExactIds(review.rows, "visual review");
  if (manifest.phase !== "AWAITING_VISUAL_REVIEW") {
    fail("E_PHASE", "capture manifest is not awaiting visual review");
  }
  if (
    !manifest.captureProducer ||
    manifest.captureProducer.id !== PRODUCER_ID ||
    !validIsoTimestamp(manifest.captureProducer.capturedAt)
  ) {
    fail(
      "E_CAPTURE_PRODUCER",
      "capture producer identity or timestamp is invalid"
    );
  }
  if (
    review.protocol !== REVIEW_PROTOCOL ||
    review.evidenceDirectory !== path.basename(evidenceDirectory) ||
    review.commitSha !== manifest.commitSha ||
    review.captureManifestSha256 !== sha256(manifestBytes)
  ) {
    fail("E_REVIEW_BINDING", "visual review is not bound to this evidence");
  }
  if (
    !review.reviewer ||
    typeof review.reviewer.id !== "string" ||
    review.reviewer.id.trim() === "" ||
    review.reviewer.id === manifest.captureProducer.id ||
    !validIsoTimestamp(review.reviewer.reviewedAt)
  ) {
    fail("E_REVIEWER", "independent reviewer identity or timestamp is invalid");
  }
  for (const row of review.rows) {
    if (
      row.characterCorrect !== true ||
      row.requiredLandmarksVisible !== true ||
      row.cameraNatural !== true ||
      row.mapAligned !== true ||
      row.uiUsable !== true ||
      row.decision !== "APPROVE"
    ) {
      fail("E_REVIEW_DECISION", `capture ${row.id} is not fully approved`);
    }
  }
  const expectedReferences = await referenceAssetsWithHashes();
  if (!referenceAssetsMatch(review.referenceAssets, expectedReferences)) {
    fail("E_REFERENCE_HASH", "character reference paths or hashes changed");
  }
  for (const row of manifest.rows) {
    const actual = await sha256File(path.join(evidenceDirectory, row.path));
    if (actual !== row.sha256) {
      fail("E_PNG_HASH", `capture hash changed: ${row.id}`);
    }
  }
  if (
    !Array.isArray(browserErrors) ||
    !Array.isArray(networkErrors) ||
    browserErrors.length !== 0 ||
    networkErrors.length !== 0
  ) {
    fail("E_RUNTIME_ERRORS", "browser and network error files must both be empty");
  }
  return { manifest, review, manifestSha256: sha256(manifestBytes) };
}

async function finalize(evidenceDirectory) {
  await access(evidenceDirectory);
  const validated = await validateFinalize(evidenceDirectory);
  const result = {
    protocol: "rpg-visual-verification",
    status: "PASS",
    phase: "finalize_complete",
    evidenceDirectory: path.basename(evidenceDirectory),
    commitSha: validated.manifest.commitSha,
    captureManifestSha256: validated.manifestSha256,
    reviewer: validated.review.reviewer,
    finalizedAt: new Date().toISOString()
  };
  await writeFile(
    path.join(evidenceDirectory, "rpg-visual-verification.json"),
    `${JSON.stringify(result, null, 2)}\n`
  );
  return result;
}

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code ?? signal}\n${stdout}\n${stderr}`));
    });
  });
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail("E_SERVER", `capture server exited with ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail("E_SERVER_TIMEOUT", "capture server did not become ready");
}

async function startCaptureServer() {
  await run("npm", ["run", "build"], {
    env: { ...process.env, PUBLIC_GUIDE_MODE: "disabled" }
  });
  const child = spawn(
    "npm",
    ["run", "start", "--", "--port", "4173", "--hostname", "127.0.0.1"],
    {
      cwd: ROOT,
      env: { ...process.env, PUBLIC_GUIDE_MODE: "disabled" },
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  await waitForServer("http://127.0.0.1:4173/en", child);
  return {
    stop() {
      if (child.pid && child.exitCode === null) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
    }
  };
}

function parseTuple(value, label) {
  const tuple = String(value ?? "").split(",").map(Number);
  if (tuple.length !== 3 || tuple.some((number) => !Number.isFinite(number))) {
    fail("E_TELEMETRY", `${label} is unavailable`);
  }
  return tuple;
}

async function telemetry(page) {
  const data = await page.locator(".seamless-world-renderer").evaluate((renderer) => {
    const world = document.querySelector('[data-testid="world-view"]');
    return {
      position: renderer.getAttribute("data-player-position"),
      heading:
        renderer.getAttribute("data-player-heading") ??
        world?.getAttribute("data-player-heading"),
      yaw: renderer.getAttribute("data-camera-yaw"),
      pitch: renderer.getAttribute("data-camera-pitch"),
      boom: renderer.getAttribute("data-camera-boom"),
      safe: renderer.getAttribute("data-camera-safe"),
      safeViolationMs: renderer.getAttribute("data-camera-safe-violation-ms"),
      diagnostic: renderer.getAttribute("data-camera-diagnostic"),
      revision: renderer.getAttribute("data-navigation-revision"),
      zone: world?.getAttribute("data-current-zone"),
      navigationRegion: renderer.getAttribute("data-navigation-region")
    };
  });
  const parsed = {
    position: parseTuple(data.position, "player position"),
    heading: parseTuple(data.heading, "player heading"),
    cameraYaw: Number(data.yaw),
    cameraPitch: Number(data.pitch),
    cameraBoom: Number(data.boom),
    cameraSafe: data.safe,
    cameraSafeViolationMs: Number(data.safeViolationMs),
    cameraDiagnostic: data.diagnostic,
    navigationRevision: data.revision,
    zone: data.zone,
    navigationRegion: data.navigationRegion
  };
  if (
    ![parsed.cameraYaw, parsed.cameraPitch, parsed.cameraBoom, parsed.cameraSafeViolationMs].every(Number.isFinite) ||
    parsed.cameraBoom < 2.6 ||
    parsed.cameraSafeViolationMs > 250 ||
    parsed.cameraDiagnostic !== "ok"
  ) {
    fail("E_CAMERA", `unsafe camera telemetry: ${JSON.stringify(parsed)}`);
  }
  return parsed;
}

function yawError(current, target) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

async function drag(page, deltaX, deltaY) {
  const box = await page.locator(".world-camera-input").boundingBox();
  if (!box) fail("E_INPUT", "camera input is unavailable");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 3 });
  await page.mouse.up();
}

async function setCamera(page, targetYaw, targetPitchDegrees) {
  for (let index = 0; index < 20; index += 1) {
    const current = await telemetry(page);
    const yawDelta = yawError(current.cameraYaw, targetYaw);
    const pitchDelta = targetPitchDegrees * Math.PI / 180 - current.cameraPitch;
    if (Math.abs(yawDelta) <= 0.004 && Math.abs(pitchDelta) <= 0.004) return;
    await drag(
      page,
      Math.max(-240, Math.min(240, -yawDelta / 0.004)),
      Math.max(-160, Math.min(160, pitchDelta / 0.004))
    );
    await page.waitForTimeout(20);
  }
  fail("E_CAMERA_FIXTURE", "camera fixture did not converge");
}

async function driveTo(page, target, { run = true, tolerance = 0.05 } = {}) {
  const before = await telemetry(page);
  const yaw = Math.atan2(
    target[0] - before.position[0],
    target[1] - before.position[2]
  );
  await setCamera(page, yaw, before.cameraPitch * 180 / Math.PI);
  if (run) await page.keyboard.down("Shift");
  await page.keyboard.down("w");
  try {
    const started = performance.now();
    while (performance.now() - started < 40_000) {
      const current = await telemetry(page);
      if (
        Math.hypot(
          current.position[0] - target[0],
          current.position[2] - target[1]
        ) <= tolerance
      ) {
        return current;
      }
      await page.waitForTimeout(4);
    }
    fail("E_ROUTE", `could not reach ${target.join(",")}`);
  } finally {
    await page.keyboard.up("w");
    if (run) await page.keyboard.up("Shift");
  }
}

async function enterWorld(page, character) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("http://127.0.0.1:4173/en");
  await page.getByRole("button", { name: "START" }).click();
  await page.getByRole("button", { name: `Select ${character} character` }).click();
  await page.getByRole("button", { name: "ENTER WORLD" }).click();
  await page
    .locator(
      '.seamless-world-renderer[data-world-ready="true"]' +
      '[data-world-renderer="seamless-rpg"]' +
      '[data-renderer-technology="webgl3d"]'
    )
    .waitFor({ state: "visible", timeout: 30_000 });
  await telemetry(page);
}

async function captureRow({
  page,
  evidenceDirectory,
  viewportName,
  id,
  selectedCharacter,
  rows
}) {
  const current = await telemetry(page);
  const fixture = CAMERA_FIXTURES[id];
  if (fixture) {
    const headingYaw = Math.atan2(current.heading[0], current.heading[2]);
    await setCamera(
      page,
      headingYaw + fixture.yawOffsetDegrees * Math.PI / 180,
      fixture.pitchDegrees
    );
    const requestedDistance =
      viewportName === "mobile"
        ? fixture.mobileDistance
        : fixture.desktopDistance;
    const stable = await telemetry(page);
    if (
      Math.abs(stable.cameraPitch * 180 / Math.PI - fixture.pitchDegrees) > 0.5 ||
      Math.abs(stable.cameraBoom - requestedDistance) > 0.25
    ) {
      fail("E_CAMERA_FIXTURE", `${viewportName}/${id} fixture telemetry differs`);
    }
  }
  const stable = await telemetry(page);
  const relativePath = `${viewportName}/${id}.png`;
  const absolutePath = path.join(evidenceDirectory, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await page.screenshot({ path: absolutePath, fullPage: true });
  const characterReferenceAssets =
    id === "airport"
      ? [REFERENCES.male.front, REFERENCES.male.back]
      : id === "npc-interaction"
        ? [REFERENCES.female.front, REFERENCES.female.back]
        : [];
  rows.push({
    id: `${viewportName}/${id}`,
    path: relativePath,
    sha256: await sha256File(absolutePath),
    viewport: {
      ...VIEWPORTS[viewportName].viewport,
      deviceScaleFactor: VIEWPORTS[viewportName].deviceScaleFactor
    },
    selectedCharacter,
    playerPosition: stable.position,
    playerHeading: stable.heading,
    camera: {
      yaw: stable.cameraYaw,
      pitch: stable.cameraPitch,
      boom: stable.cameraBoom
    },
    navigationRevision: stable.navigationRevision,
    navigationZone: stable.zone,
    requiredLandmarks: LANDMARKS[id],
    characterReferenceAssets
  });
}

async function captureViewport(browser, evidenceDirectory, viewportName, rows, performanceRows, errors) {
  const context = await browser.newContext({
    ...VIEWPORTS[viewportName],
    locale: "en-US",
    timezoneId: "Asia/Seoul",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  page.on("pageerror", (error) =>
    errors.browser.push({ viewport: viewportName, type: "pageerror", message: error.message })
  );
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.browser.push({ viewport: viewportName, type: "console", message: message.text() });
    }
  });
  page.on("requestfailed", (request) =>
    errors.network.push({
      viewport: viewportName,
      type: "requestfailed",
      url: request.url(),
      message: request.failure()?.errorText ?? "unknown"
    })
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.network.push({
        viewport: viewportName,
        type: "response",
        url: response.url(),
        status: response.status()
      });
    }
  });

  const startedAt = Date.now();
  try {
    await enterWorld(page, "male");
    await captureRow({
      page, evidenceDirectory, viewportName, id: "airport", selectedCharacter: "male", rows
    });
    const miniMap = page.locator(".rpg-mini-map");
    if ((await miniMap.getAttribute("data-expanded")) === "false") {
      await page.getByRole("button", { name: "Expand mini-map" }).click();
    }
    await page.locator('.rpg-mini-map[data-expanded="true"]').waitFor();
    await captureRow({
      page, evidenceDirectory, viewportName, id: "mini-map", selectedCharacter: "male", rows
    });
    await page.getByRole("button", { name: "Open world map (M key)" }).click();
    await page.getByRole("dialog", { name: "World map" }).waitFor();
    await captureRow({
      page, evidenceDirectory, viewportName, id: "full-map", selectedCharacter: "male", rows
    });
    await page.keyboard.press("Escape");

    for (let index = 1; index < ROUTE.length; index += 1) {
      const target = ROUTE[index];
      await driveTo(page, target);
      const id = ARRIVAL_BY_POINT.get(target.join(","));
      if (id) {
        await captureRow({
          page, evidenceDirectory, viewportName, id, selectedCharacter: "male", rows
        });
      }
      if (id === "gyukatsu") {
        await driveTo(page, [5.05, 7]);
        await driveTo(page, [5, 7], { run: false, tolerance: 0.02 });
        const narrow = await telemetry(page);
        if (
          Math.hypot(narrow.position[0] - 5, narrow.position[2] - 7) > 0.05 ||
          narrow.zone !== "gyukatsu" ||
          narrow.cameraSafe !== "true" ||
          narrow.cameraDiagnostic !== "ok"
        ) {
          fail("E_NARROW_CAMERA", "narrow-camera predicate failed");
        }
        await setCamera(
          page,
          Math.atan2(narrow.heading[0], narrow.heading[2]) - 20 * Math.PI / 180,
          38
        );
        await captureRow({
          page, evidenceDirectory, viewportName, id: "narrow-camera", selectedCharacter: "male", rows
        });

        await driveTo(page, [4.95, 7], { run: false, tolerance: 0.02 });
        await driveTo(page, [5, 7], { run: false, tolerance: 0.02 });
        await setCamera(page, 0, 38);
        const obstacle = await telemetry(page);
        const requestedDistance =
          viewportName === "mobile"
            ? CAMERA_FIXTURES.gyukatsu.mobileDistance
            : CAMERA_FIXTURES.gyukatsu.desktopDistance;
        if (
          obstacle.cameraBoom < 2.6 ||
          obstacle.cameraBoom > requestedDistance - 0.1 ||
          obstacle.cameraSafeViolationMs > 250 ||
          obstacle.cameraDiagnostic !== "ok"
        ) {
          fail("E_OBSTACLE_CAMERA", "obstacle-camera predicate failed");
        }
        await captureRow({
          page, evidenceDirectory, viewportName, id: "obstacle-camera", selectedCharacter: "male", rows
        });
        await driveTo(page, [8, 0]);
      }
    }

    await enterWorld(page, "female");
    for (let index = 1; index < ROUTE.length; index += 1) {
      await driveTo(page, ROUTE[index]);
    }
    await driveTo(page, [21, -21.9]);
    await driveTo(page, [21, -22], { run: false, tolerance: 0.02 });
    const prompt = page.locator(
      'button.world-interaction-prompt[data-target-id="npc-hanabi-child"]'
    );
    await prompt.waitFor({ state: "visible" });
    await prompt.click();
    await page.getByRole("dialog").waitFor();
    await captureRow({
      page, evidenceDirectory, viewportName, id: "npc-interaction", selectedCharacter: "female", rows
    });
  } finally {
    performanceRows.push({
      viewport: viewportName,
      captureDurationMs: Date.now() - startedAt
    });
    await context.close();
  }
}

async function capture() {
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const evidenceDirectory = path.join(
    OUTPUT_ROOT,
    `rpg-${stamp}-${process.pid}`
  );
  await mkdir(evidenceDirectory, { recursive: true });
  const server = await startCaptureServer();
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  const rows = [];
  const performanceRows = [];
  const errors = { browser: [], network: [] };
  try {
    for (const viewportName of Object.keys(VIEWPORTS)) {
      await captureViewport(
        browser,
        evidenceDirectory,
        viewportName,
        rows,
        performanceRows,
        errors
      );
    }
  } finally {
    await browser.close();
    server.stop();
  }
  assertExactIds(rows, "capture manifest");
  const commitSha = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
  const manifest = {
    protocol: "rpg-world-capture",
    phase: "AWAITING_VISUAL_REVIEW",
    commitSha,
    captureProducer: {
      id: PRODUCER_ID,
      capturedAt: new Date().toISOString()
    },
    rows
  };
  await Promise.all([
    writeFile(
      path.join(evidenceDirectory, "capture-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`
    ),
    writeFile(
      path.join(evidenceDirectory, "browser-errors.json"),
      `${JSON.stringify(errors.browser, null, 2)}\n`
    ),
    writeFile(
      path.join(evidenceDirectory, "network-errors.json"),
      `${JSON.stringify(errors.network, null, 2)}\n`
    ),
    writeFile(
      path.join(evidenceDirectory, "performance-summary.json"),
      `${JSON.stringify(performanceRows, null, 2)}\n`
    )
  ]);
  return {
    status: "AWAITING_VISUAL_REVIEW",
    evidenceDirectory: path.relative(ROOT, evidenceDirectory),
    captureCount: rows.length
  };
}

async function buildSelfTestFixture(root) {
  const rows = [];
  for (const id of expectedIds()) {
    const relative = `${id}.png`;
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, `png:${id}`);
    rows.push({
      id,
      path: relative,
      sha256: await sha256File(absolute)
    });
  }
  const manifest = {
    protocol: "rpg-world-capture",
    phase: "AWAITING_VISUAL_REVIEW",
    commitSha: "a".repeat(40),
    captureProducer: {
      id: PRODUCER_ID,
      capturedAt: new Date().toISOString()
    },
    rows
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(root, "capture-manifest.json"), manifestBytes);
  await writeFile(path.join(root, "browser-errors.json"), "[]\n");
  await writeFile(path.join(root, "network-errors.json"), "[]\n");
  const review = {
    protocol: REVIEW_PROTOCOL,
    evidenceDirectory: path.basename(root),
    commitSha: manifest.commitSha,
    captureManifestSha256: sha256(manifestBytes),
    reviewer: {
      id: "independent-self-test-reviewer",
      reviewedAt: new Date().toISOString()
    },
    referenceAssets: await referenceAssetsWithHashes(),
    rows: expectedIds().map((id) => ({
      id,
      characterCorrect: true,
      requiredLandmarksVisible: true,
      cameraNatural: true,
      mapAligned: true,
      uiUsable: true,
      decision: "APPROVE"
    }))
  };
  await writeFile(
    path.join(root, "visual-review.json"),
    `${JSON.stringify(review, null, 2)}\n`
  );
}

async function expectSelfTestFailure(root, mutate, code) {
  await buildSelfTestFixture(root);
  await mutate(root);
  try {
    await validateFinalize(root);
  } catch (error) {
    if (error?.code === code) return;
    throw error;
  }
  fail("E_SELF_TEST", `expected ${code}`);
}

async function selfTest() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "rpg-visual-self-test-"));
  try {
    const positive = path.join(parent, "positive");
    await mkdir(positive);
    await buildSelfTestFixture(positive);
    const result = await finalize(positive);
    if (result.status !== "PASS" || result.phase !== "finalize_complete") {
      fail("E_SELF_TEST", "positive finalize did not pass");
    }
    const reordered = path.join(parent, "positive-reordered-references");
    await mkdir(reordered);
    await buildSelfTestFixture(reordered);
    const reorderedReviewPath = path.join(reordered, "visual-review.json");
    const reorderedReview = JSON.parse(
      await readFile(reorderedReviewPath, "utf8")
    );
    reorderedReview.referenceAssets =
      reorderedReview.referenceAssets.map((reference) => ({
        backSha256: reference.backSha256,
        frontSha256: reference.frontSha256,
        back: reference.back,
        front: reference.front,
        character: reference.character
      }));
    await writeFile(
      reorderedReviewPath,
      `${JSON.stringify(reorderedReview, null, 2)}\n`
    );
    await validateFinalize(reordered);
    const cases = [
      {
        code: "E_DUPLICATE_ROW",
        mutate: async (root) => {
          const filename = path.join(root, "visual-review.json");
          const value = JSON.parse(await readFile(filename, "utf8"));
          value.rows[1].id = value.rows[0].id;
          await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
        }
      },
      {
        code: "E_REVIEWER",
        mutate: async (root) => {
          const filename = path.join(root, "visual-review.json");
          const value = JSON.parse(await readFile(filename, "utf8"));
          value.reviewer.id = PRODUCER_ID;
          await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
        }
      },
      {
        code: "E_CAPTURE_PRODUCER",
        mutate: async (root) => {
          const filename = path.join(root, "capture-manifest.json");
          const value = JSON.parse(await readFile(filename, "utf8"));
          delete value.captureProducer;
          const manifestBytes = Buffer.from(
            `${JSON.stringify(value, null, 2)}\n`
          );
          await writeFile(filename, manifestBytes);
          const reviewFilename = path.join(root, "visual-review.json");
          const review = JSON.parse(
            await readFile(reviewFilename, "utf8")
          );
          review.captureManifestSha256 = sha256(manifestBytes);
          await writeFile(
            reviewFilename,
            `${JSON.stringify(review, null, 2)}\n`
          );
        }
      },
      {
        code: "E_RUNTIME_ERRORS",
        mutate: async (root) => {
          await writeFile(
            path.join(root, "browser-errors.json"),
            `${JSON.stringify([{ message: "boom" }])}\n`
          );
        }
      },
      {
        code: "E_PNG_HASH",
        mutate: async (root) => {
          await writeFile(path.join(root, `${expectedIds()[0]}.png`), "changed");
        }
      }
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const root = path.join(parent, `negative-${index}`);
      await mkdir(root);
      await expectSelfTestFailure(root, cases[index].mutate, cases[index].code);
    }
    return {
      status: "PASS",
      checks: 2 + cases.length,
      captureIds: expectedIds().length
    };
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

export {
  CAPTURE_IDS,
  PRODUCER_ID,
  expectedIds,
  parseArguments,
  validateFinalize,
  finalize,
  selfTest
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = parseArguments(process.argv.slice(2));
    const result =
      command.mode === "capture"
        ? await capture()
        : command.mode === "finalize"
          ? await finalize(resolveEvidenceDirectory(command.evidenceDir))
          : await selfTest();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        status: "FAIL",
        code: error?.code ?? "E_UNEXPECTED",
        message: error instanceof Error ? error.message : String(error)
      })}\n`
    );
    process.exitCode = 1;
  }
}
