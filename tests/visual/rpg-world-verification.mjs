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
import {
  driveContinuousTrustedRoute,
  driveForwardToPoint,
  driveWithKeyboardToPoint,
  enterRpgWorld
} from "../fixtures/rpg-playwright-world.ts";
import {
  RPG_CANONICAL_ROUTE,
  RPG_CANONICAL_ROUTE_STEERING
} from "../fixtures/rpg-canonical-route.ts";
import {
  RPG_VISUAL_CAMERA_FIXTURES,
  resolveRpgVisualCameraYaw
} from "../fixtures/rpg-visual-camera-fixtures.ts";
import {
  analyzePngCrop,
  encodeSolidColorPng
} from "../fixtures/rpg-png-evidence.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_ROOT = path.join(ROOT, "test-results/visual-fidelity");
const PRODUCER_ID = "rpg-world-verification.mjs";
const REVIEW_PROTOCOL = "rpg-visual-review";
const CAPTURE_PROTOCOL = "rpg-world-capture";
const MAX_RENDER_BLACK_PIXEL_RATIO = 0.35;
const RENDER_SAMPLE_STEP = 4;
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
const CAMERA_FIXTURES = RPG_VISUAL_CAMERA_FIXTURES;
const ROUTE = RPG_CANONICAL_ROUTE;
const ROUTE_STEERING = RPG_CANONICAL_ROUTE_STEERING;
const ARRIVAL_PREFIXES = [
  { end: 4, id: "tokyo" },
  { end: 9, id: "gyukatsu" },
  { end: 11, id: "sakura" },
  { end: 14, id: "hanabi" }
];
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

function assertCaptureWorktreeStatus(statusOutput) {
  const disallowed = String(statusOutput)
    .split("\0")
    .filter(Boolean)
    .filter((record) => !record.startsWith("?? docs/assets/"));
  if (disallowed.length > 0) {
    fail(
      "E_SOURCE_DIRTY",
      "capture requires a committed source tree; only untracked docs/assets/ " +
        `is allowed (${disallowed.join(", ")})`
    );
  }
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

function resolveCapturePath(evidenceDirectory, row) {
  if (row.path !== `${row.id}.png`) {
    fail("E_ROW_SCHEMA", `capture ${row.id} path does not match its ID`);
  }
  const root = path.resolve(evidenceDirectory);
  const filename = path.resolve(root, row.path);
  if (!filename.startsWith(`${root}${path.sep}`)) {
    fail("E_ROW_PATH", `capture ${row.id} escapes the evidence directory`);
  }
  return filename;
}

function assertFiniteTuple(value, label) {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((entry) => !Number.isFinite(entry))
  ) {
    fail("E_ROW_SCHEMA", `${label} must be a finite three-number tuple`);
  }
}

function assertManifestRow(row, evidenceDirectory) {
  if (!row || typeof row !== "object") {
    fail("E_ROW_SCHEMA", "capture manifest row must be an object");
  }
  const [viewportName, captureId, ...extra] = String(row.id ?? "").split("/");
  const expectedViewport = VIEWPORTS[viewportName];
  if (!expectedViewport || !CAPTURE_IDS.includes(captureId) || extra.length > 0) {
    fail("E_ROW_SCHEMA", `capture ID is invalid: ${row.id}`);
  }
  resolveCapturePath(evidenceDirectory, row);
  if (!/^[0-9a-f]{64}$/.test(String(row.sha256 ?? ""))) {
    fail("E_ROW_SCHEMA", `capture ${row.id} sha256 is invalid`);
  }
  if (
    row.viewport?.width !== expectedViewport.viewport.width ||
    row.viewport?.height !== expectedViewport.viewport.height ||
    row.viewport?.deviceScaleFactor !== expectedViewport.deviceScaleFactor
  ) {
    fail("E_ROW_SCHEMA", `capture ${row.id} viewport is invalid`);
  }
  const expectedCharacter =
    captureId === "npc-interaction" ? "female" : "male";
  if (row.selectedCharacter !== expectedCharacter) {
    fail("E_ROW_SCHEMA", `capture ${row.id} character is invalid`);
  }
  assertFiniteTuple(row.playerPosition, `${row.id} playerPosition`);
  assertFiniteTuple(row.playerHeading, `${row.id} playerHeading`);
  if (
    !row.camera ||
    ![
      row.camera.yaw,
      row.camera.pitch,
      row.camera.boom,
      row.camera.collisionAdjustment
    ].every(Number.isFinite) ||
    row.camera.collisionAdjustment < 0 ||
    typeof row.camera.collisionAdjusted !== "boolean" ||
    typeof row.camera.lateralCollisionEscape !== "boolean"
  ) {
    fail("E_ROW_SCHEMA", `capture ${row.id} camera is invalid`);
  }
  if (
    typeof row.navigationRevision !== "string" ||
    row.navigationRevision.length === 0 ||
    typeof row.navigationZone !== "string" ||
    row.navigationZone.length === 0 ||
    JSON.stringify(row.requiredLandmarks) !==
      JSON.stringify(LANDMARKS[captureId])
  ) {
    fail("E_ROW_SCHEMA", `capture ${row.id} navigation data is invalid`);
  }
  const evidence = row.renderEvidence;
  const crop = evidence?.pixelCrop;
  if (
    !evidence ||
    !Number.isInteger(evidence.imageWidth) ||
    !Number.isInteger(evidence.imageHeight) ||
    evidence.imageWidth <= 0 ||
    evidence.imageHeight <= 0 ||
    evidence.sampleStep !== RENDER_SAMPLE_STEP ||
    evidence.maxBlackPixelRatio !== MAX_RENDER_BLACK_PIXEL_RATIO ||
    !Number.isFinite(evidence.blackPixelRatio) ||
    evidence.blackPixelRatio < 0 ||
    evidence.blackPixelRatio >= MAX_RENDER_BLACK_PIXEL_RATIO ||
    !Number.isInteger(evidence.sampledPixels) ||
    evidence.sampledPixels <= 0 ||
    !crop ||
    ![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.width <= 0 ||
    crop.height <= 0
  ) {
    fail("E_ROW_SCHEMA", `capture ${row.id} render evidence is invalid`);
  }
  if (
    !Array.isArray(row.characterReferenceAssets) ||
    JSON.stringify(row.characterReferenceAssets) !==
      JSON.stringify(
        captureId === "airport"
          ? [REFERENCES.male.front, REFERENCES.male.back]
          : captureId === "npc-interaction"
            ? [REFERENCES.female.front, REFERENCES.female.back]
            : []
      )
  ) {
    fail("E_ROW_SCHEMA", `capture ${row.id} reference assets are invalid`);
  }
}

async function validatePngEvidence(evidenceDirectory, row) {
  const filename = resolveCapturePath(evidenceDirectory, row);
  const bytes = await readFile(filename);
  const actualHash = sha256(bytes);
  if (actualHash !== row.sha256) {
    fail("E_PNG_HASH", `capture hash changed: ${row.id}`);
  }
  let analysis;
  try {
    analysis = analyzePngCrop(bytes, {
      ...row.renderEvidence.pixelCrop,
      sampleStep: row.renderEvidence.sampleStep
    });
  } catch (error) {
    fail(
      "E_PNG_FORMAT",
      `capture ${row.id} is not a valid supported PNG: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (
    analysis.width !== row.renderEvidence.imageWidth ||
    analysis.height !== row.renderEvidence.imageHeight ||
    analysis.sampledPixels !== row.renderEvidence.sampledPixels
  ) {
    fail("E_PNG_EVIDENCE", `capture ${row.id} render evidence changed`);
  }
  if (analysis.blackPixelRatio >= MAX_RENDER_BLACK_PIXEL_RATIO) {
    fail(
      "E_BLACK_RENDER",
      `capture ${row.id} renderer is mostly black: ${analysis.blackPixelRatio}`
    );
  }
  if (
    Math.abs(
      analysis.blackPixelRatio - row.renderEvidence.blackPixelRatio
    ) > Number.EPSILON
  ) {
    fail("E_PNG_EVIDENCE", `capture ${row.id} render evidence changed`);
  }
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
  if (
    manifest.protocol !== CAPTURE_PROTOCOL ||
    !/^[0-9a-f]{40}$/.test(String(manifest.commitSha ?? ""))
  ) {
    fail("E_MANIFEST", "capture manifest protocol or commit SHA is invalid");
  }
  for (const row of manifest.rows) {
    assertManifestRow(row, evidenceDirectory);
  }
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
    await validatePngEvidence(evidenceDirectory, row);
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

async function telemetry(
  page,
  { requireFacing = true } = {}
) {
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
      facingDot: renderer.getAttribute("data-camera-facing-dot"),
      collisionAdjusted: renderer.getAttribute(
        "data-camera-collision-adjusted"
      ),
      collisionAdjustment: renderer.getAttribute(
        "data-camera-collision-adjustment"
      ),
      lateralCollisionEscape: renderer.getAttribute(
        "data-camera-lateral-collision-escape"
      ),
      safe: renderer.getAttribute("data-camera-safe"),
      safeViolationMs: renderer.getAttribute("data-camera-safe-violation-ms"),
      diagnostic: renderer.getAttribute("data-camera-diagnostic"),
      revision: renderer.getAttribute("data-navigation-revision"),
      zone: world?.getAttribute("data-current-zone"),
      navigationRegion: renderer.getAttribute("data-navigation-region"),
      busPosition: renderer.getAttribute("data-bus-position")
    };
  });
  const parsed = {
    position: parseTuple(data.position, "player position"),
    heading: parseTuple(data.heading, "player heading"),
    cameraYaw: Number(data.yaw),
    cameraPitch: Number(data.pitch),
    cameraBoom: Number(data.boom),
    cameraFacingDot: Number(data.facingDot),
    cameraCollisionAdjusted: data.collisionAdjusted,
    cameraCollisionAdjustment: Number(data.collisionAdjustment),
    cameraLateralCollisionEscape: data.lateralCollisionEscape,
    cameraSafe: data.safe,
    cameraSafeViolationMs: Number(data.safeViolationMs),
    cameraDiagnostic: data.diagnostic,
    navigationRevision: data.revision,
    zone: data.zone,
    navigationRegion: data.navigationRegion,
    busPosition: parseTuple(data.busPosition, "bus position")
  };
  if (
    ![
      parsed.cameraYaw,
      parsed.cameraPitch,
      parsed.cameraBoom,
      parsed.cameraFacingDot,
      parsed.cameraCollisionAdjustment,
      parsed.cameraSafeViolationMs
    ].every(Number.isFinite) ||
    parsed.cameraBoom < 2.6 ||
    parsed.cameraSafeViolationMs > 250 ||
    parsed.cameraDiagnostic !== "ok" ||
    (requireFacing && parsed.cameraFacingDot < 0.98)
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
    const current = await telemetry(page, {
      requireFacing: false
    });
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

async function waitForCameraFixture(
  page,
  targetPitchDegrees,
  targetDistance
) {
  const deadline = performance.now() + 5_000;
  let current = await telemetry(page, { requireFacing: false });
  let previousBoom = current.cameraBoom;
  let stableSamples = 0;
  while (performance.now() < deadline) {
    const pitchMatches =
      Math.abs(
        current.cameraPitch * 180 / Math.PI - targetPitchDegrees
      ) <= 0.5;
    const boomResolved =
      current.cameraBoom >= 2.6 &&
      current.cameraBoom <= targetDistance + 0.25;
    const facingResolved = current.cameraFacingDot >= 0.98;
    if (
      pitchMatches &&
      boomResolved &&
      facingResolved &&
      Math.abs(current.cameraBoom - previousBoom) <= 0.005
    ) {
      stableSamples += 1;
    } else {
      stableSamples = 0;
    }
    if (stableSamples >= 4) {
      return current;
    }
    previousBoom = current.cameraBoom;
    await page.waitForTimeout(25);
    current = await telemetry(page, { requireFacing: false });
  }
  fail(
    "E_CAMERA_FIXTURE",
    `camera fixture telemetry differs: ` +
      `targetPitch=${targetPitchDegrees}; actualPitch=${
        current.cameraPitch * 180 / Math.PI
      }; targetBoom=${targetDistance}; actualBoom=${current.cameraBoom}`
  );
}

async function driveTo(page, target, { run = true, tolerance = 0.05 } = {}) {
  return driveWithKeyboardToPoint(page, target, {
    runRequested: run,
    tolerance,
    timeoutMs: 40_000
  });
}

function assertUninterruptedRoute(result, label) {
  if (
    result.diagnostics.inputRefreshCount !== 0 ||
    result.diagnostics.correctionCount !== 0
  ) {
    fail(
      "E_ROUTE_RECOVERY",
      `${label} required hidden route recovery: ` +
        `inputRefreshCount=${result.diagnostics.inputRefreshCount}; ` +
        `correctionCount=${result.diagnostics.correctionCount}`
    );
  }
  return result;
}

async function driveRoutePrefix(page, end) {
  return assertUninterruptedRoute(
    await driveContinuousTrustedRoute(
      page,
      ROUTE.slice(0, end + 1),
      {
        runRequested: false,
        steeringRoute: ROUTE_STEERING.slice(0, end + 1),
        tolerance: 0.05
      }
    ),
    `arrival prefix ${end}`
  );
}

async function enterWorld(page, character) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("http://127.0.0.1:4173/en");
  await enterRpgWorld(page, character, { navigate: false });
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
    const liveFocusWorldXZ =
      id === "airport"
        ? [current.busPosition[0], current.busPosition[2]]
        : fixture.focusWorldXZ;
    await setCamera(
      page,
      resolveRpgVisualCameraYaw(
        fixture,
        current.position,
        liveFocusWorldXZ,
        viewportName === "mobile"
          ? fixture.mobileScreenOffsetDegrees
          : undefined
      ),
      fixture.pitchDegrees
    );
    const requestedDistance =
      viewportName === "mobile"
        ? fixture.mobileDistance
        : fixture.desktopDistance;
    await waitForCameraFixture(
      page,
      fixture.pitchDegrees,
      requestedDistance
    );
  }
  const stable = await telemetry(page);
  const relativePath = `${viewportName}/${id}.png`;
  const absolutePath = path.join(evidenceDirectory, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const rendererBounds = await page
    .locator(".seamless-world-renderer")
    .boundingBox();
  if (!rendererBounds) {
    fail("E_RENDER_BOUNDS", `${viewportName}/${id} renderer is unavailable`);
  }
  const deviceScaleFactor = VIEWPORTS[viewportName].deviceScaleFactor;
  const screenshot = await page.screenshot({
    path: absolutePath,
    fullPage: false,
    scale: "device"
  });
  const imageWidth =
    VIEWPORTS[viewportName].viewport.width * deviceScaleFactor;
  const imageHeight =
    VIEWPORTS[viewportName].viewport.height * deviceScaleFactor;
  const pixelCrop = {
    x: Math.max(0, Math.floor(rendererBounds.x * deviceScaleFactor)),
    y: Math.max(0, Math.floor(rendererBounds.y * deviceScaleFactor)),
    width: Math.max(
      1,
      Math.min(
        imageWidth -
          Math.max(0, Math.floor(rendererBounds.x * deviceScaleFactor)),
        Math.ceil(rendererBounds.width * deviceScaleFactor)
      )
    ),
    height: Math.max(
      1,
      Math.min(
        imageHeight -
          Math.max(0, Math.floor(rendererBounds.y * deviceScaleFactor)),
        Math.ceil(rendererBounds.height * deviceScaleFactor)
      )
    )
  };
  const renderAnalysis = analyzePngCrop(screenshot, {
    ...pixelCrop,
    sampleStep: RENDER_SAMPLE_STEP
  });
  if (
    renderAnalysis.width !== imageWidth ||
    renderAnalysis.height !== imageHeight
  ) {
    fail(
      "E_PNG_DIMENSIONS",
      `${viewportName}/${id} screenshot dimensions differ`
    );
  }
  if (renderAnalysis.blackPixelRatio >= MAX_RENDER_BLACK_PIXEL_RATIO) {
    fail(
      "E_BLACK_RENDER",
      `${viewportName}/${id} renderer is mostly black: ` +
        renderAnalysis.blackPixelRatio
    );
  }
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
      boom: stable.cameraBoom,
      collisionAdjusted: stable.cameraCollisionAdjusted === "true",
      collisionAdjustment: stable.cameraCollisionAdjustment,
      lateralCollisionEscape:
        stable.cameraLateralCollisionEscape === "true"
    },
    navigationRevision: stable.navigationRevision,
    navigationZone: stable.zone,
    requiredLandmarks: LANDMARKS[id],
    characterReferenceAssets,
    renderEvidence: {
      imageWidth: renderAnalysis.width,
      imageHeight: renderAnalysis.height,
      pixelCrop,
      sampleStep: RENDER_SAMPLE_STEP,
      sampledPixels: renderAnalysis.sampledPixels,
      blackPixelRatio: renderAnalysis.blackPixelRatio,
      maxBlackPixelRatio: MAX_RENDER_BLACK_PIXEL_RATIO
    }
  });
  process.stderr.write(
    `[visual] captured ${viewportName}/${id} ` +
      `(black=${renderAnalysis.blackPixelRatio.toFixed(4)})\n`
  );
}

async function captureViewport(browser, evidenceDirectory, viewportName, rows, performanceRows, errors) {
  let context;
  let page;
  let primaryViewportError;
  const openFreshPage = async () => {
    await context?.close();
    context = await browser.newContext({
      ...VIEWPORTS[viewportName],
      locale: "en-US",
      timezoneId: "Asia/Seoul",
      reducedMotion: "reduce"
    });
    page = await context.newPage();
    page.on("pageerror", (error) =>
      errors.browser.push({
        viewport: viewportName,
        type: "pageerror",
        message: error.message
      })
    );
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.browser.push({
          viewport: viewportName,
          type: "console",
          message: message.text()
        });
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
    return page;
  };

  const startedAt = Date.now();
  try {
    page = await openFreshPage();
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

    for (const { end, id } of ARRIVAL_PREFIXES) {
      page = await openFreshPage();
      await enterWorld(page, "male");
      await driveRoutePrefix(page, end);
      const fixture = CAMERA_FIXTURES[id];
      const captureRoute =
        viewportName === "mobile"
          ? fixture?.mobileCaptureRoute ?? fixture?.captureRoute
          : fixture?.captureRoute;
      for (const waypoint of captureRoute ?? []) {
        await driveTo(page, waypoint);
      }
      const scenicPosition =
        viewportName === "mobile"
          ? fixture?.mobileCapturePosition ?? fixture?.capturePosition
          : fixture?.capturePosition;
      if (scenicPosition) {
        await driveTo(page, scenicPosition);
      }
      await captureRow({
        page, evidenceDirectory, viewportName, id, selectedCharacter: "male", rows
      });
      if (id === "gyukatsu") {
        await driveTo(page, [8, 0]);
        assertUninterruptedRoute(
          await driveContinuousTrustedRoute(
            page,
            [[8, 0], [4, 5]],
            { runRequested: false, tolerance: 0.05 }
          ),
          "gyukatsu narrow-camera route"
        );
        const narrow = await telemetry(page);
        if (
          Math.hypot(narrow.position[0] - 4, narrow.position[2] - 5) > 0.05 ||
          narrow.zone !== "gyukatsu" ||
          narrow.cameraSafe !== "true" ||
          narrow.cameraDiagnostic !== "ok"
        ) {
          fail("E_NARROW_CAMERA", "narrow-camera predicate failed");
        }
        const requestedDistance =
          viewportName === "mobile"
            ? CAMERA_FIXTURES.gyukatsu.mobileDistance
            : CAMERA_FIXTURES.gyukatsu.desktopDistance;
        const narrowYaw = resolveRpgVisualCameraYaw(
          CAMERA_FIXTURES.gyukatsu,
          narrow.position
        );
        await setCamera(
          page,
          narrowYaw,
          CAMERA_FIXTURES.gyukatsu.pitchDegrees
        );
        await waitForCameraFixture(
          page,
          CAMERA_FIXTURES.gyukatsu.pitchDegrees,
          requestedDistance
        );
        const narrowCamera = await telemetry(page);
        if (
          narrowCamera.cameraCollisionAdjusted !== "false" ||
          narrowCamera.cameraCollisionAdjustment > 0.02 ||
          narrowCamera.cameraLateralCollisionEscape !== "false"
        ) {
          fail(
            "E_NARROW_CAMERA",
            `narrow-camera framing was unexpectedly corrected: ` +
              `adjusted=${narrowCamera.cameraCollisionAdjusted}; ` +
              `adjustment=${narrowCamera.cameraCollisionAdjustment}; ` +
              `lateral=${narrowCamera.cameraLateralCollisionEscape}`
          );
        }
        await captureRow({
          page, evidenceDirectory, viewportName, id: "narrow-camera", selectedCharacter: "male", rows
        });

        await setCamera(
          page,
          narrowYaw - 45 * Math.PI / 180,
          CAMERA_FIXTURES.gyukatsu.pitchDegrees
        );
        await waitForCameraFixture(
          page,
          CAMERA_FIXTURES.gyukatsu.pitchDegrees,
          requestedDistance
        );
        const obstacle = await telemetry(page);
        if (
          obstacle.cameraBoom < 2.6 ||
          obstacle.cameraBoom > requestedDistance + 0.1 ||
          obstacle.cameraCollisionAdjusted !== "true" ||
          obstacle.cameraCollisionAdjustment < 2.7 ||
          obstacle.cameraLateralCollisionEscape !== "true" ||
          obstacle.cameraSafeViolationMs > 250 ||
          obstacle.cameraDiagnostic !== "ok"
        ) {
          fail(
            "E_OBSTACLE_CAMERA",
            `obstacle-camera predicate failed: ` +
              `boom=${obstacle.cameraBoom}; requested=${requestedDistance}; ` +
              `adjusted=${obstacle.cameraCollisionAdjusted}; ` +
              `adjustment=${obstacle.cameraCollisionAdjustment}; ` +
              `lateral=${obstacle.cameraLateralCollisionEscape}; ` +
              `violation=${obstacle.cameraSafeViolationMs}; ` +
              `diagnostic=${obstacle.cameraDiagnostic}`
          );
        }
        await captureRow({
          page, evidenceDirectory, viewportName, id: "obstacle-camera", selectedCharacter: "male", rows
        });
      }
    }

    page = await openFreshPage();
    await enterWorld(page, "female");
    assertUninterruptedRoute(
      await driveContinuousTrustedRoute(page, ROUTE, {
        runRequested: false,
        steeringRoute: ROUTE_STEERING,
        tolerance: 0.05
      }),
      "female Hanabi route"
    );
    const hanabiCaptureDistance =
      viewportName === "mobile"
        ? CAMERA_FIXTURES.hanabi.mobileDistance
        : CAMERA_FIXTURES.hanabi.desktopDistance;
    await waitForCameraFixture(
      page,
      CAMERA_FIXTURES.hanabi.pitchDegrees,
      hanabiCaptureDistance
    );
    await driveTo(page, [21, -26.1]);
    await waitForCameraFixture(
      page,
      CAMERA_FIXTURES.hanabi.pitchDegrees,
      hanabiCaptureDistance
    );
    await driveForwardToPoint(page, [21, -26], 0, {
      tolerance: 0.05
    });
    const interactionCamera = await telemetry(page, {
      requireFacing: false
    });
    await setCamera(
      page,
      resolveRpgVisualCameraYaw(
        CAMERA_FIXTURES.hanabi,
        interactionCamera.position
      ),
      CAMERA_FIXTURES.hanabi.pitchDegrees
    );
    await waitForCameraFixture(
      page,
      CAMERA_FIXTURES.hanabi.pitchDegrees,
      hanabiCaptureDistance
    );
    const prompt = page.locator(
      'button.world-interaction-prompt[data-target-id="npc-hanabi-child"]'
    );
    await prompt.waitFor({ state: "visible" });
    await prompt.click();
    await page.getByRole("dialog").waitFor();
    await captureRow({
      page, evidenceDirectory, viewportName, id: "npc-interaction", selectedCharacter: "female", rows
    });
  } catch (error) {
    primaryViewportError = error;
    throw error;
  } finally {
    performanceRows.push({
      viewport: viewportName,
      captureDurationMs: Date.now() - startedAt
    });
    try {
      await context?.close();
    } catch (error) {
      if (!primaryViewportError) throw error;
    }
  }
}

async function capture() {
  const status = await run("git", [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all"
  ]);
  assertCaptureWorktreeStatus(status.stdout);
  const stamp = new Date().toISOString().replace(/[-:.]/g, "");
  const evidenceDirectory = path.join(
    OUTPUT_ROOT,
    `rpg-${stamp}-${process.pid}`
  );
  await mkdir(evidenceDirectory, { recursive: true });
  const server = await startCaptureServer();
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ channel: "chromium" });
  const rows = [];
  const performanceRows = [];
  const errors = { browser: [], network: [] };
  let primaryCaptureError;
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
  } catch (error) {
    primaryCaptureError = error;
    throw error;
  } finally {
    try {
      await browser.close();
    } catch (error) {
      if (!primaryCaptureError) throw error;
    } finally {
      server.stop();
    }
  }
  assertExactIds(rows, "capture manifest");
  const commitSha = (await run("git", ["rev-parse", "HEAD"])).stdout.trim();
  const manifest = {
    protocol: CAPTURE_PROTOCOL,
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
    const png = encodeSolidColorPng({
      width: 24,
      height: 16,
      color: [114, 183, 219, 255]
    });
    await writeFile(absolute, png);
    const renderAnalysis = analyzePngCrop(png, {
      x: 0,
      y: 0,
      width: 24,
      height: 16,
      sampleStep: RENDER_SAMPLE_STEP
    });
    const [viewportName, captureId] = id.split("/");
    const expectedViewport = VIEWPORTS[viewportName];
    const characterReferenceAssets =
      captureId === "airport"
        ? [REFERENCES.male.front, REFERENCES.male.back]
        : captureId === "npc-interaction"
          ? [REFERENCES.female.front, REFERENCES.female.back]
          : [];
    rows.push({
      id,
      path: relative,
      sha256: sha256(png),
      viewport: {
        ...expectedViewport.viewport,
        deviceScaleFactor: expectedViewport.deviceScaleFactor
      },
      selectedCharacter:
        captureId === "npc-interaction" ? "female" : "male",
      playerPosition: [0, 0, 0],
      playerHeading: [0, 0, 1],
      camera: {
        yaw: 0,
        pitch: 0.5,
        boom: 6,
        collisionAdjusted: false,
        collisionAdjustment: 0,
        lateralCollisionEscape: false
      },
      navigationRevision: "self-test",
      navigationZone: "airport",
      requiredLandmarks: LANDMARKS[captureId],
      characterReferenceAssets,
      renderEvidence: {
        imageWidth: renderAnalysis.width,
        imageHeight: renderAnalysis.height,
        pixelCrop: { x: 0, y: 0, width: 24, height: 16 },
        sampleStep: RENDER_SAMPLE_STEP,
        sampledPixels: renderAnalysis.sampledPixels,
        blackPixelRatio: renderAnalysis.blackPixelRatio,
        maxBlackPixelRatio: MAX_RENDER_BLACK_PIXEL_RATIO
      }
    });
  }
  const manifest = {
    protocol: CAPTURE_PROTOCOL,
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

async function updateSelfTestManifest(root, mutate) {
  const manifestPath = path.join(root, "capture-manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await mutate(manifest);
  const manifestBytes = Buffer.from(
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  await writeFile(manifestPath, manifestBytes);
  const reviewPath = path.join(root, "visual-review.json");
  const review = JSON.parse(await readFile(reviewPath, "utf8"));
  review.commitSha = manifest.commitSha;
  review.captureManifestSha256 = sha256(manifestBytes);
  await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
}

async function selfTest() {
  const parent = await mkdtemp(path.join(os.tmpdir(), "rpg-visual-self-test-"));
  try {
    assertCaptureWorktreeStatus("");
    assertCaptureWorktreeStatus("?? docs/assets/reference.png\0");
    try {
      assertCaptureWorktreeStatus(" M app/world/RpgTownScene.tsx\0");
      fail("E_SELF_TEST", "dirty source tree should fail capture preflight");
    } catch (error) {
      if (error?.code !== "E_SOURCE_DIRTY") throw error;
    }
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
        code: "E_ROW_SET",
        mutate: (root) =>
          updateSelfTestManifest(root, (manifest) => {
            manifest.rows.pop();
          })
      },
      {
        code: "E_PHASE",
        mutate: (root) =>
          updateSelfTestManifest(root, (manifest) => {
            manifest.phase = "finalize_complete";
          })
      },
      {
        code: "E_MANIFEST",
        mutate: (root) =>
          updateSelfTestManifest(root, (manifest) => {
            manifest.protocol = "wrong";
          })
      },
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
        code: "E_REVIEW_BINDING",
        mutate: async (root) => {
          const filename = path.join(root, "visual-review.json");
          const value = JSON.parse(await readFile(filename, "utf8"));
          value.commitSha = "b".repeat(40);
          await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
        }
      },
      {
        code: "E_REVIEW_DECISION",
        mutate: async (root) => {
          const filename = path.join(root, "visual-review.json");
          const value = JSON.parse(await readFile(filename, "utf8"));
          value.rows[0].decision = "REJECT";
          await writeFile(filename, `${JSON.stringify(value, null, 2)}\n`);
        }
      },
      {
        code: "E_REFERENCE_HASH",
        mutate: async (root) => {
          const filename = path.join(root, "visual-review.json");
          const value = JSON.parse(await readFile(filename, "utf8"));
          value.referenceAssets[0].frontSha256 = "0".repeat(64);
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
        code: "E_RUNTIME_ERRORS",
        mutate: async (root) => {
          await writeFile(
            path.join(root, "network-errors.json"),
            `${JSON.stringify([{ url: "https://example.invalid" }])}\n`
          );
        }
      },
      {
        code: "E_PNG_HASH",
        mutate: async (root) => {
          await writeFile(path.join(root, `${expectedIds()[0]}.png`), "changed");
        }
      },
      {
        code: "E_PNG_FORMAT",
        mutate: async (root) => {
          const id = expectedIds()[0];
          const bytes = Buffer.from("not-a-png");
          await writeFile(path.join(root, `${id}.png`), bytes);
          await updateSelfTestManifest(root, (manifest) => {
            manifest.rows.find((row) => row.id === id).sha256 =
              sha256(bytes);
          });
        }
      },
      {
        code: "E_BLACK_RENDER",
        mutate: async (root) => {
          const id = expectedIds()[0];
          const png = encodeSolidColorPng({
            width: 24,
            height: 16,
            color: [0, 0, 0, 255]
          });
          await writeFile(path.join(root, `${id}.png`), png);
          await updateSelfTestManifest(root, (manifest) => {
            manifest.rows.find((row) => row.id === id).sha256 =
              sha256(png);
          });
        }
      },
      {
        code: "E_ROW_SCHEMA",
        mutate: (root) =>
          updateSelfTestManifest(root, (manifest) => {
            manifest.rows[0].path = "../escape.png";
          })
      }
    ];
    for (let index = 0; index < cases.length; index += 1) {
      const root = path.join(parent, `negative-${index}`);
      await mkdir(root);
      await expectSelfTestFailure(root, cases[index].mutate, cases[index].code);
    }
    return {
      status: "PASS",
      checks: 3 + cases.length,
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
  assertCaptureWorktreeStatus,
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
