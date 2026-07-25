import { expect, test, type Page } from "@playwright/test";
import {
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_CANAL,
  RPG_WORLD_SPAWN
} from "../../app/world/RpgWorldModel";
import {
  RPG_MAP_PIXELS_PER_WORLD_UNIT,
  projectRpgMapWorldPoint
} from "../../app/world/RpgMiniMapProjection";
import {
  dragCamera,
  driveCanonicalRoute,
  driveForwardToPoint,
  driveTrustedRouteProbe,
  driveWithKeyboardToPoint,
  enterRpgWorld,
  monitorCameraSafetyDuring,
  observeTrustedMovementDuring,
  readSettledWorldTelemetry,
  readWorldTelemetry,
  rotateCameraToYaw
} from "../fixtures/rpg-playwright-world";
import { RPG_VISUAL_CAMERA_FIXTURES } from "../fixtures/rpg-visual-camera-fixtures";
import { RPG_CANONICAL_ROUTE } from "../fixtures/rpg-canonical-route";
import {
  WORLD_RUN_SPEED,
  WORLD_WALK_SPEED
} from "../../app/world/WorldRuntime";

// Derived from the speeds rather than written beside them, so a pace change
// moves the expectation instead of failing a number nobody can trace.
const RPG_CANONICAL_ROUTE_LENGTH = RPG_CANONICAL_ROUTE.reduce(
  (total, point, index) =>
    index === 0
      ? total
      : total +
        Math.hypot(
          point[0] - RPG_CANONICAL_ROUTE[index - 1][0],
          point[1] - RPG_CANONICAL_ROUTE[index - 1][1]
        ),
  0
);

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

/**
 * How much of the frame the renderer actually drew came out black, read from
 * the drawing buffer the visitor is looking at rather than from a screenshot of
 * it.
 *
 * page.screenshot() goes through the browser's compositor, and a WebGL surface
 * that the compositor cannot hand back — no GPU process, a lost context, a
 * drawing buffer already recycled — comes back as an opaque black rectangle
 * with the HTML chrome composited over it perfectly. That failure reads as "the
 * world rendered black", which is the one thing this check exists to catch, so
 * the check could not tell its own blind spot from the defect it was hunting.
 * gl.readPixels asks the context that did the drawing, inside the animation
 * frame it drew in, so there is no compositor in the path at all.
 *
 * Measured over the canvas alone, so a bright HUD cannot dilute a black scene:
 * the ratio this returns is strictly harder to keep under the threshold than
 * the whole-viewport ratio it replaces. Anything that stops the buffer being
 * readable throws rather than returning a number.
 */
async function readRenderedBlackPixelRatio(page: Page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    if (!canvas) throw new Error("the world canvas is missing");
    const gl =
      (canvas.getContext("webgl2") as WebGL2RenderingContext | null) ??
      (canvas.getContext("webgl") as WebGLRenderingContext | null);
    if (!gl) throw new Error("the world canvas has no WebGL context to read");
    if (gl.isContextLost()) throw new Error("the world WebGL context is lost");
    const width = canvas.width;
    const height = canvas.height;
    if (width < 1 || height < 1) {
      throw new Error(`the world drawing buffer is ${width}x${height}`);
    }
    // Read inside an animation frame: the buffer is still the frame that was
    // just drawn, before the compositor takes it away.
    const pixels = await new Promise<Uint8Array>((resolve) =>
      requestAnimationFrame(() => {
        const buffer = new Uint8Array(width * height * 4);
        gl.readPixels(
          0,
          0,
          width,
          height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          buffer
        );
        resolve(buffer);
      })
    );
    let black = 0;
    let sampled = 0;
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const index = (y * width + x) * 4;
        if (
          pixels[index] < 12 &&
          pixels[index + 1] < 12 &&
          pixels[index + 2] < 12
        ) {
          black += 1;
        }
        sampled += 1;
      }
    }
    if (sampled === 0) throw new Error("no drawing buffer pixels were sampled");
    return black / sampled;
  });
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
      expect(await readRenderedBlackPixelRatio(page)).toBeLessThan(0.35);
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

test("walks the canonical route at the walking speed and only reset returns to the airport", async ({
  page
}) => {
  test.setTimeout(120_000);
  await enterRpgWorld(page);
  const result = await driveCanonicalRoute(page, { runRequested: false });
  withinFivePercent(
    result.traversalMs,
    (RPG_CANONICAL_ROUTE_LENGTH / WORLD_WALK_SPEED) * 1000
  );
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

test("runs the canonical route at the running speed and preserves the Hanabi child interaction", async ({
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
  withinFivePercent(
    route.traversalMs,
    (RPG_CANONICAL_ROUTE_LENGTH / WORLD_RUN_SPEED) * 1000
  );
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

    // Moved 0.2 south of (19, -22) for the same reason the bridge approach
    // moved east. At the 0.53 silhouette radius the chibi rebuild asks for,
    // hanabi-lantern-1-north at (19, -21.5) with a 0.09 half-size holds the
    // visitor out to z -22.12, which puts (19, -22) inside a lantern; -22.2 is
    // clear at that radius and at the narrower one. The canal walk this sets up
    // is unchanged: x is still 19, still east of the 18.9 the assertion below
    // wants, and the corridor west from here reaches the canal's east bank with
    // nothing in the way.
    await driveWithKeyboardToPoint(page, [19, -22.2], {
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
  // Same reason as map-accessibility: let the model loads finish bumping the
  // revision before anything is recorded as the untouched state.
  await readSettledWorldTelemetry(page);
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

test("all five arrival markers sit on their world position and the visitor arrow points where the visitor walks", async ({
  page
}) => {
  await enterRpgWorld(page);
  const markers = page.locator(".rpg-mini-map-destination");
  await expect(markers).toHaveCount(5);
  for (const arrival of RPG_WORLD_ARRIVALS) {
    const marker = page.locator(
      `.rpg-mini-map-destination-${arrival.zoneId}`
    );
    const expected = projectRpgMapWorldPoint(arrival.position);

    // Measured on the rendered dot rather than on the data, so the view box,
    // the panel layout, and the CSS all have to agree for this to pass.
    const placementErrorCssPixels = await marker.evaluate(
      (element, target) => {
        const dot = element.querySelector(".rpg-mini-map-destination-dot");
        const svg = (element as SVGGraphicsElement).ownerSVGElement;
        const svgMatrix = svg?.getScreenCTM();
        if (!dot || !svgMatrix) {
          throw new Error("arrival marker screen transform is missing");
        }
        const box = dot.getBoundingClientRect();
        const drawn = new DOMPoint(target[0], target[1]).matrixTransform(
          svgMatrix
        );
        return Math.hypot(
          (box.left + box.right) / 2 - drawn.x,
          (box.top + box.bottom) / 2 - drawn.y
        );
      },
      [expected.x, expected.y] as const
    );
    expect(placementErrorCssPixels).toBeLessThanOrEqual(0.5);

    const anchor = (await marker.getAttribute("data-anchor-reference"))!
      .split(",")
      .map(Number);
    expect(Math.abs(anchor[0] - expected.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(anchor[1] - expected.y)).toBeLessThanOrEqual(0.5);

  }

  // An arrival also publishes a data-heading-rotation, but no arrival is drawn
  // facing anywhere, and the check that used to stand here read that number
  // back and recomputed it from the same projection that wrote it: it passed
  // whatever the map put on screen. The marker that is drawn facing somewhere
  // is the visitor's, so that is what is measured now — the arrow as drawn
  // against the step the visitor would take next, as drawn.
  const stepWorldUnits = 4;

  const readVisitorArrow = async () =>
    page.evaluate(async () => {
      const nextFrame = () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const renderer = document.querySelector<HTMLElement>(
          ".seamless-world-renderer"
        );
        const marker = document.querySelector<SVGGraphicsElement>(
          ".rpg-mini-map-player"
        );
        const arrow = marker?.querySelector<SVGGraphicsElement>(
          ".rpg-mini-map-player-arrow"
        );
        if (!renderer || !marker || !arrow) {
          throw new Error("visitor marker telemetry is missing");
        }
        const revision = renderer.dataset.navigationRevision ?? "";
        const position = renderer.dataset.playerPosition ?? "";
        const heading = renderer.dataset.playerHeading ?? "";
        // The world and the marker are read in one frame, so the measured
        // arrow belongs to the position and heading it is compared against.
        if (
          !revision ||
          marker.dataset.navigationRevision !== revision ||
          !position ||
          !heading
        ) {
          await nextFrame();
          continue;
        }
        const arrowMatrix = arrow.getScreenCTM();
        const svgMatrix = arrow.ownerSVGElement?.getScreenCTM();
        if (!arrowMatrix || !svgMatrix) {
          throw new Error("visitor marker screen transform is missing");
        }
        // The arrow's own geometry, so nothing here has to know how long it
        // is: the tip is the far end of its box, on its centre line.
        const box = arrow.getBBox();
        const origin = new DOMPoint(0, 0).matrixTransform(arrowMatrix);
        const tip = new DOMPoint(
          box.x + box.width,
          box.y + box.height / 2
        ).matrixTransform(arrowMatrix);
        if (marker.dataset.navigationRevision !== revision) {
          await nextFrame();
          continue;
        }
        return {
          revision,
          position,
          heading,
          drawn: [tip.x - origin.x, tip.y - origin.y] as [number, number],
          canvas: {
            a: svgMatrix.a,
            b: svgMatrix.b,
            c: svgMatrix.c,
            d: svgMatrix.d
          }
        };
      }
      throw new Error("visitor marker never settled on a published revision");
    });

  const measureVisitorArrow = async (pose: string) => {
    const sample = await readVisitorArrow();
    const position = sample.position.split(",").map(Number);
    const heading = sample.heading.split(",").map(Number);
    expect(position.length, pose).toBe(3);
    const headingLength = Math.hypot(heading[0], heading[2]);
    expect(headingLength, pose).toBeGreaterThan(0.5);

    const from = projectRpgMapWorldPoint([
      position[0],
      position[1],
      position[2]
    ]);
    const ahead = projectRpgMapWorldPoint([
      position[0] + (heading[0] / headingLength) * stepWorldUnits,
      position[1],
      position[2] + (heading[2] / headingLength) * stepWorldUnits
    ]);
    // A step into the edge of the world is clamped, and a clamped step points
    // somewhere the visitor is not walking.
    expect(
      Math.hypot(ahead.x - from.x, ahead.y - from.y),
      pose
    ).toBeCloseTo(stepWorldUnits * RPG_MAP_PIXELS_PER_WORLD_UNIT, 1);

    // Both vectors are put through the matrix the browser drew the map with,
    // so the question is the one a visitor asks: does the arrow on my map
    // point at the place my next step is drawn?
    const deltaX = ahead.x - from.x;
    const deltaY = ahead.y - from.y;
    const expectedScreen = [
      sample.canvas.a * deltaX + sample.canvas.c * deltaY,
      sample.canvas.b * deltaX + sample.canvas.d * deltaY
    ];
    const drawnDegrees =
      (Math.atan2(sample.drawn[1], sample.drawn[0]) * 180) / Math.PI;
    const expectedDegrees =
      (Math.atan2(expectedScreen[1], expectedScreen[0]) * 180) / Math.PI;
    expect(
      Math.abs(((drawnDegrees - expectedDegrees + 540) % 360) - 180),
      pose
    ).toBeLessThanOrEqual(2);
    return (Math.atan2(-heading[2], heading[0]) * 180) / Math.PI;
  };

  const spawnDegrees = await measureVisitorArrow("standing where it began");

  await page.keyboard.down("d");
  await page.waitForTimeout(600);
  await page.keyboard.up("d");
  await page.waitForTimeout(500);
  const turnedDegrees = await measureVisitorArrow("after turning");

  // Two poses only count as two if the visitor really turned between them.
  expect(
    Math.abs(((turnedDegrees - spawnDegrees + 540) % 360) - 180)
  ).toBeGreaterThan(10);
});
