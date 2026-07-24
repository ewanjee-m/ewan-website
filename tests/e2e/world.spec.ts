import { expect, test, type Page } from "@playwright/test";
import {
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_CANAL,
  RPG_WORLD_SPAWN
} from "../../app/world/RpgWorldModel";
import { projectRpgReferenceMapPoint } from "../../app/world/RpgMiniMapProjection";
import {
  dragCamera,
  driveCanonicalRoute,
  driveForwardToPoint,
  driveTrustedRouteProbe,
  driveWithKeyboardToPoint,
  enterRpgWorld,
  monitorCameraSafetyDuring,
  observeTrustedMovementDuring,
  readWorldTelemetry,
  rotateCameraToYaw
} from "../fixtures/rpg-playwright-world";
import { RPG_VISUAL_CAMERA_FIXTURES } from "../fixtures/rpg-visual-camera-fixtures";

const WORLD = '[data-testid="world-view"]';
const RENDERER = ".seamless-world-renderer";
const CHROMIUM_RESOURCE_404 =
  "Failed to load resource: the server responded with a status of 404 (Not Found)";

function withinFivePercent(actual: number, expected: number) {
  expect(actual).toBeGreaterThanOrEqual(expected * 0.95);
  expect(actual).toBeLessThanOrEqual(expected * 1.05);
}

function collectErrors(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

async function exactNavigationState(page: Page) {
  const telemetry = await readWorldTelemetry(page);
  return {
    position: telemetry.positionRaw,
    heading: telemetry.headingRaw,
    revision: telemetry.revision,
    cameraYaw: telemetry.cameraYaw,
    cameraPitch: telemetry.cameraPitch
  };
}

async function readScreenshotBlackPixelRatio(page: Page) {
  const screenshot = await page.screenshot();
  return page.evaluate(async (encoded) => {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0)
    );
    const bitmap = await createImageBitmap(
      new Blob([bytes.buffer as ArrayBuffer], { type: "image/png" })
    );
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D screenshot context is unavailable");
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    ).data;
    let black = 0;
    let sampled = 0;
    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = 0; x < canvas.width; x += 4) {
        const index = (y * canvas.width + x) * 4;
        if (
          pixels[index] < 12 &&
          pixels[index + 1] < 12 &&
          pixels[index + 2] < 12 &&
          pixels[index + 3] > 240
        ) {
          black += 1;
        }
        sampled += 1;
      }
    }
    return black / sampled;
  }, screenshot.toString("base64"));
}

test.describe("desktop fine-pointer rendering", () => {
  test.use({
    viewport: { width: 768, height: 858 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false
  });

  test("selected male and female GLBs appear in the seamless WebGL renderer", async ({
    page
  }) => {
    const requested = new Set<string>();
    page.on("request", (request) => {
      const filename = new URL(request.url()).pathname.split("/").at(-1);
      if (filename) requested.add(filename);
    });

    for (const character of ["male", "female"] as const) {
      const renderer = await enterRpgWorld(page, character);
      await expect(renderer).toHaveAttribute(
        "data-character-fallback",
        "false"
      );
      await expect(page.locator(WORLD)).toHaveAttribute(
        "data-character",
        character
      );
      expect(requested.has(`player-${character}.glb`)).toBe(true);
      expect(await readScreenshotBlackPixelRatio(page)).toBeLessThan(0.35);
      await page.reload();
    }
  });
});

test("the active Canvas and maps do not initiate the concept image", async ({
  page
}) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/en");
  await page.getByRole("button", { name: "START" }).click();
  await page
    .getByRole("button", { name: "Select female character" })
    .click();

  const afterEntryRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("world-environment-concept.png")) {
      afterEntryRequests.push(request.url());
    }
  });
  await page.getByRole("button", { name: "ENTER WORLD" }).click();
  await expect(
    page.locator(
      `${RENDERER}[data-world-ready="true"]` +
        '[data-world-renderer="seamless-rpg"]' +
        '[data-renderer-technology="webgl3d"]'
    )
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Open world map (M key)" }).click();
  await expect(page.getByRole("dialog", { name: "World map" })).toBeVisible();
  await page.keyboard.press("Escape");
  expect(afterEntryRequests).toEqual([]);
});

test("the trusted route binding balances a short two-point drive", async ({
  page
}) => {
  await enterRpgWorld(page);
  const result = await driveTrustedRouteProbe(page);
  expect(result.moved).toBeGreaterThan(2);
  expect(result.vertexCount).toBe(3);
  expect(result.pressedKeyCount).toBe(0);
  expect(result.trust.untrustedCount).toBe(0);
  expect(result.trust.untrustedPointerCount).toBe(0);
  expect(result.trust.keydownCount).toBeGreaterThan(0);
  expect(result.trust.keyupCount).toBe(result.trust.keydownCount);
  expect(result.trust.pointerDownCount).toBeGreaterThan(0);
  expect(result.trust.pointerUpCount).toBe(result.trust.pointerDownCount);
  expect(result.trust.maximumPointerStrokePixels).toBeLessThanOrEqual(140.001);
  expect(result.observation?.safetyFailure).toBeNull();
  expect(result.observation?.maximumViolationMs).toBeLessThanOrEqual(250);
  expect(result.observation?.mapUpdateFailure).toBeNull();
  expect(result.observation?.maximumMapUpdateLatencyMs).toBeLessThanOrEqual(
    100
  );
  expect(result.observation?.averageMapUpdateIntervalMs).toBeLessThanOrEqual(
    100
  );
  expect(result.observation?.maximumMapUpdateGapMs).toBeLessThanOrEqual(100);
  expect(result.observation?.firstMovementMapUpdateDelayMs)
    .toBeLessThanOrEqual(100);
  expect(result.observation?.lastMapUpdateAgeMs).toBeLessThanOrEqual(100);
});

test("walks the canonical route in 75.8 seconds and only reset returns to the airport", async ({
  page
}) => {
  test.setTimeout(120_000);
  await enterRpgWorld(page);
  const result = await driveCanonicalRoute(page, { runRequested: false });
  withinFivePercent(result.traversalMs, 75_800);
  await expect(page.locator(WORLD)).toHaveAttribute("data-current-zone", "hanabi");
  await page.getByRole("button", { name: "Return to start" }).click();
  await expect.poll(async () => {
    const telemetry = await readWorldTelemetry(page, {
      assertSafe: false
    });
    return {
      ...telemetry,
      cameraFacingReady: telemetry.cameraFacingDot >= 0.98
    };
  }).toEqual(
    expect.objectContaining({
      zone: "airport",
      position: RPG_WORLD_SPAWN,
      cameraFacingReady: true
    })
  );
});

test("runs the canonical route in 64.3 seconds and preserves the Hanabi child interaction", async ({
  page
}) => {
  test.setTimeout(120_000);
  const errors = collectErrors(page);
  let missingNpcRequests = 0;
  await page.route("**/npc-hanabi-yukata.glb", (route) => {
    missingNpcRequests += 1;
    return route.fulfill({ status: 404, body: "" });
  });
  const renderer = await enterRpgWorld(page);

  const route = await driveCanonicalRoute(page, { runRequested: true });
  expect(route.keyboardTrust.untrustedCount).toBe(0);
  expect(route.keyboardTrust.keydownCount).toBeGreaterThan(0);
  expect(route.keyboardTrust.keyupCount).toBeGreaterThan(0);
  withinFivePercent(route.traversalMs, 64_300);
  expect(route.zones).toEqual([
    "airport",
    "tokyo",
    "gyukatsu",
    "sakura",
    "hanabi"
  ]);
  await expect(renderer).toHaveAttribute(
    "data-unavailable-npc-ids",
    "npc-hanabi-yukata"
  );
  expect(missingNpcRequests).toBe(1);

  const postRoute = await observeTrustedMovementDuring(page, async () => {
    await driveWithKeyboardToPoint(page, [21, -21.9], {
      runRequested: true,
      tolerance: 0.03
    });
    const approach = await driveForwardToPoint(
      page,
      [21, -22],
      Math.PI
    );

    const prompt = page.locator(
      'button.world-interaction-prompt[data-target-id="npc-hanabi-child"]'
    );
    await expect(prompt).toBeVisible();
    const beforeInteraction = await exactNavigationState(page);
    await prompt.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await exactNavigationState(page)).toEqual(beforeInteraction);

    await driveWithKeyboardToPoint(page, [19, -22], {
      runRequested: true,
      tolerance: 0.03
    });
    await rotateCameraToYaw(page, -Math.PI / 2);
    const beforeCanal = await readWorldTelemetry(page);
    await page.keyboard.down("w");
    try {
      await page.waitForTimeout(1_500);
    } finally {
      await page.keyboard.up("w");
    }
    const canalBlocked = await readWorldTelemetry(page);
    return { approach, beforeCanal, canalBlocked };
  });
  const { approach, beforeCanal, canalBlocked } = postRoute.result;
  expect(postRoute.trust.untrustedCount).toBe(0);
  expect(postRoute.trust.untrustedPointerCount).toBe(0);
  expect(postRoute.trust.keyupCount).toBe(postRoute.trust.keydownCount);
  expect(Math.hypot(approach.position[0] - 21, approach.position[2] + 22))
    .toBeLessThanOrEqual(0.05);
  const approachHeadingError =
    Math.abs(
      Math.atan2(
        Math.sin(
          Math.atan2(approach.heading[0], approach.heading[2]) -
            Math.PI
        ),
        Math.cos(
          Math.atan2(approach.heading[0], approach.heading[2]) -
            Math.PI
        )
      )
    ) *
    180 /
    Math.PI;
  expect(approachHeadingError).toBeLessThanOrEqual(2);

  const canalEastBankX = Math.max(
    ...RPG_WORLD_CANAL.polygon.map(([x]) => x)
  );
  expect(beforeCanal.position[0]).toBeGreaterThanOrEqual(18.9);
  expect(beforeCanal.position[0] - canalBlocked.position[0])
    .toBeGreaterThan(0.5);
  expect(canalBlocked.position[0]).toBeGreaterThanOrEqual(
    canalEastBankX - 0.01
  );
  expect(canalBlocked.position[0]).toBeLessThanOrEqual(
    canalEastBankX + 0.05
  );
  expect(route.navigationRegions).toContain("sakura-to-hanabi");

  expect(errors.pageErrors).toEqual([]);
  const browserResourceErrors = errors.consoleErrors.filter(
    (message) => message === CHROMIUM_RESOURCE_404
  );
  const applicationErrors = errors.consoleErrors.filter(
    (message) => message !== CHROMIUM_RESOURCE_404
  );
  expect(browserResourceErrors.length).toBeLessThanOrEqual(1);
  expect(applicationErrors).toHaveLength(1);
  expect(applicationErrors[0]).toContain("npc-hanabi-yukata");
  expect(applicationErrors[0]).toContain("AssetHttpError");
  expect(applicationErrors[0]).not.toContain(".glb");
  expect(applicationErrors[0]).not.toContain("http://");
  expect(applicationErrors[0]).not.toContain("https://");
  expect(applicationErrors[0]).not.toMatch(/\n\s+at\s/);
});

test("camera telemetry includes live pitch and recenters after the grace period", async ({
  page
}) => {
  const renderer = await enterRpgWorld(page);
  const initial = await readWorldTelemetry(page);
  expect(initial.cameraPitch * 180 / Math.PI).toBeCloseTo(
    RPG_VISUAL_CAMERA_FIXTURES.airport.pitchDegrees,
    1
  );

  const cameraSafety = await monitorCameraSafetyDuring(page, async () => {
    await dragCamera(page, 140, 40);
    await page.keyboard.down("w");
    try {
      await page.waitForTimeout(2_050);
    } finally {
      await page.keyboard.up("w");
    }
  });
  expect(cameraSafety.safetyFailure).toBeNull();
  expect(cameraSafety.minimumBoom).toBeGreaterThanOrEqual(2.6);
  expect(cameraSafety.maximumViolationMs).toBeLessThanOrEqual(250);
  expect(cameraSafety.manual).not.toBeNull();
  expect(cameraSafety.beforeRecentering).not.toBeNull();
  expect(cameraSafety.afterRecentering).not.toBeNull();
  const manual = cameraSafety.manual!;
  const beforeRecentering = cameraSafety.beforeRecentering!;
  const afterRecentering = cameraSafety.afterRecentering!;
  expect(Math.abs(beforeRecentering.elapsedMs - 799))
    .toBeLessThanOrEqual(25);
  expect(Math.abs(afterRecentering.elapsedMs - 2_000))
    .toBeLessThanOrEqual(50);
  const unchangedYawDegrees =
    Math.abs(
      Math.atan2(
        Math.sin(beforeRecentering.cameraYaw - manual.cameraYaw),
        Math.cos(beforeRecentering.cameraYaw - manual.cameraYaw)
      )
    ) *
    180 /
    Math.PI;
  expect(unchangedYawDegrees).toBeLessThanOrEqual(1);
  const targetYaw = Math.atan2(
    afterRecentering.heading[0],
    afterRecentering.heading[2]
  );
  const errorDegrees =
    Math.abs(
      Math.atan2(
        Math.sin(targetYaw - afterRecentering.cameraYaw),
        Math.cos(targetYaw - afterRecentering.cameraYaw)
      )
    ) *
    180 /
    Math.PI;
  expect(errorDegrees).toBeLessThanOrEqual(5);
  expect(afterRecentering.cameraFacingDot).toBeGreaterThanOrEqual(0.98);
  await expect(renderer).toHaveAttribute("data-camera-diagnostic", "ok");
});

test.describe("mobile controls", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    hasTouch: true,
    isMobile: true
  });

  test("joystick moves and the right-side drag changes camera yaw", async ({
    page
  }) => {
    await enterRpgWorld(page);
    const movement = page.getByRole("region", {
      name: "Mobile movement control"
    });
    const box = await movement.boundingBox();
    expect(box).not.toBeNull();
    const before = await readWorldTelemetry(page);
    const x = box!.x + box!.width / 2;
    const y = box!.y + box!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - box!.height * 0.4, { steps: 5 });
    await expect
      .poll(async () => {
        const current = await readWorldTelemetry(page);
        return Math.hypot(
          current.position[0] - before.position[0],
          current.position[2] - before.position[2]
        );
      })
      .toBeGreaterThan(0.5);
    await page.mouse.up();

    const yawBefore = (await readWorldTelemetry(page)).cameraYaw;
    const dragSafety = await monitorCameraSafetyDuring(
      page,
      () => dragCamera(page, -80, 0)
    );
    expect(dragSafety.safetyFailure).toBeNull();
    expect(dragSafety.minimumBoom).toBeGreaterThanOrEqual(2.6);
    expect(dragSafety.maximumViolationMs).toBeLessThanOrEqual(250);
    const yawAfter = (await readWorldTelemetry(page)).cameraYaw;
    expect(yawAfter).not.toBeCloseTo(yawBefore, 2);
  });
});

test("map inspection and interaction consume Escape without mutating navigation", async ({
  page
}) => {
  await enterRpgWorld(page);
  const beforeMap = await exactNavigationState(page);
  await page.getByRole("button", { name: "Open world map (M key)" }).click();
  const map = page.getByRole("dialog", { name: "World map" });
  await expect(map).toBeVisible();
  await map.getByRole("button", { name: "Inspect: Hanabi" }).click();
  await page.keyboard.down("w");
  await page.keyboard.press(" ");
  await page.keyboard.press("r");
  await page.keyboard.press("e");
  await dragCamera(page, 60, 30);
  await page.keyboard.up("w");
  await page.keyboard.press("Escape");
  await expect(map).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(await exactNavigationState(page)).toEqual(beforeMap);

  await page.getByRole("button", { name: "Return to start" }).click();
  const prompt = page.locator("button.world-interaction-prompt");
  await page.keyboard.down("w");
  try {
    await expect(prompt).toBeVisible({ timeout: 5_000 });
  } finally {
    await page.keyboard.up("w");
  }
  const beforeInteraction = await exactNavigationState(page);
  await prompt.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  expect(await exactNavigationState(page)).toEqual(beforeInteraction);
});

test("all five arrival markers use the registered anchors and headings", async ({
  page
}) => {
  await enterRpgWorld(page);
  const markers = page.locator(".rpg-mini-map-destination");
  await expect(markers).toHaveCount(5);
  for (const arrival of RPG_WORLD_ARRIVALS) {
    const marker = page.locator(
      `.rpg-mini-map-destination-${arrival.zoneId}`
    );
    const placementErrorCssPixels = await marker.evaluate(
      (element, referencePixel) => {
        const destination = element as SVGGraphicsElement;
        const svg = destination.ownerSVGElement;
        const destinationMatrix = destination.getScreenCTM();
        const svgMatrix = svg?.getScreenCTM();
        if (!destinationMatrix || !svgMatrix) {
          throw new Error("arrival marker screen transform is missing");
        }
        const actual = new DOMPoint(0, 0).matrixTransform(
          destinationMatrix
        );
        const expected = new DOMPoint(
          referencePixel[0],
          referencePixel[1]
        ).matrixTransform(svgMatrix);
        return Math.hypot(
          actual.x - expected.x,
          actual.y - expected.y
        );
      },
      arrival.approvedReferenceFoot.pixel
    );
    expect(placementErrorCssPixels).toBeLessThanOrEqual(0.5);
    const anchor = (await marker.getAttribute("data-anchor-reference"))!
      .split(",")
      .map(Number);
    expect(Math.abs(anchor[0] - arrival.approvedReferenceFoot.pixel[0]))
      .toBeLessThanOrEqual(0.5);
    expect(Math.abs(anchor[1] - arrival.approvedReferenceFoot.pixel[1]))
      .toBeLessThanOrEqual(0.5);
    const headingLength = Math.hypot(
      arrival.heading[0],
      arrival.heading[1]
    );
    const headingSample = projectRpgReferenceMapPoint([
      arrival.position[0] +
        (arrival.heading[0] / headingLength) * 0.25,
      arrival.position[1],
      arrival.position[2] +
        (arrival.heading[1] / headingLength) * 0.25
    ]);
    const headingError = await marker.evaluate(
      (element, { anchor, next }) => {
        const destination = element as SVGGraphicsElement;
        const svg = destination.ownerSVGElement;
        const destinationMatrix = destination.getScreenCTM();
        const svgMatrix = svg?.getScreenCTM();
        if (!destinationMatrix || !svgMatrix) {
          throw new Error("arrival heading screen transform is missing");
        }
        const actualOrigin = new DOMPoint(0, 0).matrixTransform(
          destinationMatrix
        );
        const actualForward = new DOMPoint(1, 0).matrixTransform(
          destinationMatrix
        );
        const expectedOrigin = new DOMPoint(
          anchor[0],
          anchor[1]
        ).matrixTransform(svgMatrix);
        const expectedForward = new DOMPoint(
          next[0],
          next[1]
        ).matrixTransform(svgMatrix);
        const actualAngle = Math.atan2(
          actualForward.y - actualOrigin.y,
          actualForward.x - actualOrigin.x
        );
        const expectedAngle = Math.atan2(
          expectedForward.y - expectedOrigin.y,
          expectedForward.x - expectedOrigin.x
        );
        return (
          Math.abs(
            Math.atan2(
              Math.sin(actualAngle - expectedAngle),
              Math.cos(actualAngle - expectedAngle)
            )
          ) *
          180 /
          Math.PI
        );
      },
      {
        anchor: arrival.approvedReferenceFoot.pixel,
        next: [headingSample.x, headingSample.y] as const
      }
    );
    expect(headingError).toBeLessThanOrEqual(2);
  }
});
