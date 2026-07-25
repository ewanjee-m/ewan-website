import {
  expect,
  type Locator,
  type Page
} from "@playwright/test";
import {
  RPG_CANONICAL_ROUTE,
  RPG_CANONICAL_ROUTE_STEERING,
  RPG_CANONICAL_ROUTE_TOLERANCE
} from "./rpg-canonical-route.ts";
import {
  WORLD_RUN_SPEED,
  WORLD_WALK_SPEED
} from "../../app/world/WorldRuntime.ts";
import {
  getRpgRouteBrakeRadius,
  medianRpgRoutePulse,
  mergeRpgRoutePulseFeedback,
  planRpgRoutePulse,
  runBalancedRpgRouteKeyboardPulse,
  RPG_ROUTE_STALL_FRAME_LIMIT
} from "./rpg-route-steering.ts";

const WORLD_SELECTOR = '[data-testid="world-view"]';
const RENDERER_SELECTOR = ".seamless-world-renderer";
const CAMERA_INPUT_SELECTOR = ".world-camera-input";
const cameraInputBounds = new WeakMap<
  Page,
  { x: number; y: number; width: number; height: number }
>();
const routeStopBindingPages = new WeakSet<Page>();
const routeTransitionBindingPages = new WeakSet<Page>();
const routePressedKeys = new WeakMap<Page, Set<string>>();
const routePointerStates = new WeakMap<
  Page,
  {
    active: boolean;
    x: number;
    y: number;
    minimumX: number;
    maximumX: number;
  }
>();
const EXPECTED_ZONE_ORDER = [
  "airport",
  "tokyo",
  "gyukatsu",
  "sakura",
  "hanabi"
] as const;

export interface WorldTelemetry {
  readonly positionRaw: string;
  readonly position: readonly [number, number, number];
  readonly headingRaw: string;
  readonly heading: readonly [number, number, number];
  readonly revision: string;
  readonly zone: string;
  readonly navigationRegion: string;
  readonly inputLocked: boolean;
  readonly movement: readonly [number, number];
  readonly movementStrength: number;
  readonly runRequested: boolean;
  readonly playerMoving: boolean;
  readonly playerLocomotion: string;
  readonly cameraYaw: number;
  readonly cameraPitch: number;
  readonly cameraBoom: number;
  readonly cameraFacingDot: number;
  readonly cameraCollisionAdjusted: boolean;
  readonly cameraCollisionAdjustment: number;
  readonly cameraLateralCollisionEscape: boolean;
  readonly cameraSafeViolationMs: number;
  readonly cameraDiagnostic: string;
}

export interface CanonicalRouteResult {
  readonly firstKeydownAt: number;
  readonly finishedAt: number;
  readonly traversalMs: number;
  readonly navigationRegions: readonly string[];
  readonly zones: readonly string[];
  readonly keyboardTrust: {
    readonly keydownCount: number;
    readonly keyupCount: number;
    readonly untrustedCount: number;
    readonly pointerDownCount: number;
    readonly pointerUpCount: number;
    readonly pointerMoveCount: number;
    readonly untrustedPointerCount: number;
    readonly maximumPointerStrokePixels: number;
  };
  readonly rafTiming: {
    readonly minimumIntervalMs: number;
    readonly maximumIntervalMs: number;
  };
  readonly arrivals: Readonly<
    Record<
      (typeof EXPECTED_ZONE_ORDER)[number],
      {
        readonly position: readonly [number, number, number];
        readonly heading: readonly [number, number, number];
        readonly revision: string;
      }
    >
  >;
}

async function ensureTrustedRouteStopBinding(page: Page) {
  if (routeStopBindingPages.has(page)) return;
  await page.exposeBinding(
    "__rpgStopTrustedKeys",
    async (_, keys: string[]) => {
      for (const key of [...keys].reverse()) {
        await trustedRouteKeyUp(page, key);
      }
    }
  );
  routeStopBindingPages.add(page);
}

async function ensureTrustedRouteTransitionBinding(page: Page) {
  if (routeTransitionBindingPages.has(page)) return;
  await page.exposeBinding(
    "__rpgTrustedRouteTransition",
    async (
      _,
      action:
        | {
            kind: "keys";
            down?: string[];
            up?: string[];
          }
        | {
            kind: "drag";
            startX: number;
            startY: number;
            endX: number;
            endY: number;
          }
        | {
            kind: "pointer-move";
            endX: number;
            endY: number;
          }
        | {
            kind: "pointer-reposition";
            x: number;
            y: number;
          }
        | {
            kind: "turn";
            currentYaw: number;
            detectedPositionRaw: string;
            minimumZ?: number;
            target: [number, number];
            targetYaw: number;
            tolerance: number;
            pointerMoveLimit: number;
          }
    ) => {
      if (action.kind === "drag") {
        const stroke = Math.hypot(
          action.endX - action.startX,
          action.endY - action.startY
        );
        if (!Number.isFinite(stroke) || stroke > 420.001) {
          throw new RangeError(`route camera gesture exceeded 420px: ${stroke}`);
        }
        await page.mouse.move(action.startX, action.startY);
        await page.mouse.down();
        await page.mouse.move(action.endX, action.endY, {
          steps: Math.max(1, Math.ceil(stroke / 140))
        });
        await page.mouse.up();
        return;
      }
      if (action.kind === "pointer-move") {
        const pointer = routePointerStates.get(page);
        if (!pointer?.active) {
          throw new Error("route pointer drag is not active");
        }
        const stroke = Math.hypot(
          action.endX - pointer.x,
          action.endY - pointer.y
        );
        if (!Number.isFinite(stroke) || stroke > 600.001) {
          throw new RangeError(
            `route pointer move exceeded 600px: ${stroke}`
          );
        }
        await page.mouse.move(action.endX, action.endY, {
          steps: Math.max(1, Math.ceil(stroke / 140))
        });
        Object.assign(pointer, { x: action.endX, y: action.endY });
        return;
      }
      if (action.kind === "pointer-reposition") {
        const pointer = routePointerStates.get(page);
        if (!pointer?.active) {
          throw new Error("route pointer drag is not active");
        }
        await page.mouse.up();
        await page.mouse.move(action.x, action.y);
        await page.mouse.down();
        Object.assign(pointer, { x: action.x, y: action.y });
        return;
      }
      if (action.kind === "turn") {
        const turnStartedAt = performance.now();
        const detectedPosition = action.detectedPositionRaw
          .split(",")
          .map(Number);
        const detectedWithinTolerance =
          detectedPosition.length === 3 &&
          detectedPosition.every(Number.isFinite) &&
          Math.hypot(
            detectedPosition[0] - action.target[0],
            detectedPosition[2] - action.target[1]
          ) <= action.tolerance &&
          (action.minimumZ === undefined ||
            detectedPosition[2] >= action.minimumZ);
        let keyUpFinishedAt = turnStartedAt;
        let pointerFinishedAt = turnStartedAt;
        const stopForwardInput = (async () => {
          await trustedRouteKeyUp(page, "w");
          keyUpFinishedAt = performance.now();
        })();
        const rotatePointer = (async () => {
          const yawError = shortestYawError(
            action.currentYaw,
            action.targetYaw
          );
          if (Math.abs(yawError) > 0.004) {
            await moveTrustedRoutePointerBy(
              page,
              -yawError / 0.004,
              action.pointerMoveLimit,
              false
            );
          }
          pointerFinishedAt = performance.now();
        })();
        await Promise.all([stopForwardInput, rotatePointer]);
        if (detectedWithinTolerance) {
          await trustedRouteKeyDown(page, "w");
        }
        const keyDownFinishedAt = performance.now();
        return {
          arrivalPositionRaw: action.detectedPositionRaw,
          resumed: detectedWithinTolerance,
          targetYaw: action.targetYaw,
          timings: {
            keyUpMs: keyUpFinishedAt - turnStartedAt,
            captureMs: 0,
            pointerMs: pointerFinishedAt - turnStartedAt,
            keyDownMs:
              keyDownFinishedAt -
              Math.max(keyUpFinishedAt, pointerFinishedAt)
          },
          pointerX: routePointerStates.get(page)?.x ?? Number.NaN
        };
      }
      for (const key of [...(action.up ?? [])].reverse()) {
        await trustedRouteKeyUp(page, key);
      }
      for (const key of action.down ?? []) {
        await trustedRouteKeyDown(page, key);
      }
    }
  );
  routeTransitionBindingPages.add(page);
}

async function startTrustedRoutePointerDrag(page: Page) {
  const bounds = await getCameraInputBounds(page);
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  routePointerStates.set(page, {
    active: true,
    x,
    y,
    minimumX: bounds.x + bounds.width * 0.05,
    maximumX: bounds.x + bounds.width * 0.95
  });
}

async function stopTrustedRoutePointerDrag(page: Page) {
  const pointer = routePointerStates.get(page);
  try {
    if (pointer?.active && !page.isClosed()) {
      await page.mouse.up();
    }
  } catch (error) {
    if (!page.isClosed()) throw error;
  } finally {
    if (pointer) pointer.active = false;
    routePointerStates.delete(page);
  }
}

async function moveTrustedRoutePointerBy(
  page: Page,
  requestedDeltaX: number,
  moveLimit: number,
  waitForCameraFrame = true
) {
  const pointer = routePointerStates.get(page);
  if (!pointer?.active) {
    throw new Error("route pointer drag is not active");
  }
  let remainingPixels = requestedDeltaX;
  let actualYaw = Number.NaN;
  while (Math.abs(remainingPixels) > 0.01) {
    const direction = Math.sign(remainingPixels);
    let availablePixels =
      direction < 0
        ? pointer.x - pointer.minimumX
        : pointer.maximumX - pointer.x;
    if (availablePixels < 0.5) {
      pointer.x =
        direction < 0 ? pointer.maximumX : pointer.minimumX;
      await page.mouse.up();
      await page.mouse.move(pointer.x, pointer.y);
      await page.mouse.down();
      availablePixels =
        direction < 0
          ? pointer.x - pointer.minimumX
          : pointer.maximumX - pointer.x;
    }
    const deltaX =
      direction *
      Math.min(
        Math.abs(remainingPixels),
        moveLimit,
        availablePixels
      );
    const startX = pointer.x;
    const endX = startX + deltaX;
    const steps = Math.max(1, Math.ceil(Math.abs(deltaX) / 140));
    await page.mouse.move(endX, pointer.y, { steps });
    pointer.x = endX;
    if (waitForCameraFrame) {
      actualYaw = await page.evaluate(
        (rendererSelector) =>
          new Promise<number>((resolve) =>
            requestAnimationFrame(() =>
              resolve(
                Number(
                  document.querySelector<HTMLElement>(rendererSelector)
                    ?.dataset.cameraYaw
                )
              )
            )
          ),
        RENDERER_SELECTOR
      );
    }
    remainingPixels -= deltaX;
  }
  return actualYaw;
}

async function trustedRouteKeyDown(page: Page, key: string) {
  const pressed = routePressedKeys.get(page) ?? new Set<string>();
  routePressedKeys.set(page, pressed);
  if (pressed.has(key)) return;
  await page.keyboard.down(key);
  pressed.add(key);
}

async function trustedRouteKeyUp(page: Page, key: string) {
  const pressed = routePressedKeys.get(page);
  if (!pressed?.has(key)) return;
  await page.keyboard.up(key);
  pressed.delete(key);
}

async function releaseAllTrustedRouteKeys(page: Page) {
  const pressed = routePressedKeys.get(page);
  if (!pressed) return;
  for (const key of [...pressed].reverse()) {
    await trustedRouteKeyUp(page, key);
  }
}

async function startMovementTrustObservation(page: Page) {
  await page.evaluate((cameraInputSelector) => {
    type TrustObservation = {
      keydownCount: number;
      keyupCount: number;
      untrustedCount: number;
      pointerDownCount: number;
      pointerUpCount: number;
      pointerMoveCount: number;
      untrustedPointerCount: number;
      maximumPointerStrokePixels: number;
      pointerActive: boolean;
      pointerX: number;
      onKeydown: (event: KeyboardEvent) => void;
      onKeyup: (event: KeyboardEvent) => void;
      onPointerDown: (event: PointerEvent) => void;
      onPointerMove: (event: PointerEvent) => void;
      onPointerUp: (event: PointerEvent) => void;
      cameraInput: HTMLElement;
    };
    const observedWindow = window as typeof window & {
      __RPG_MOVEMENT_TRUST__?: TrustObservation;
    };
    const isMovementKey = (key: string) =>
      ["w", "a", "s", "d", "shift"].includes(key.toLowerCase());
    const observation: TrustObservation = {
      keydownCount: 0,
      keyupCount: 0,
      untrustedCount: 0,
      pointerDownCount: 0,
      pointerUpCount: 0,
      pointerMoveCount: 0,
      untrustedPointerCount: 0,
      maximumPointerStrokePixels: 0,
      pointerActive: false,
      pointerX: 0,
      onKeydown: () => {},
      onKeyup: () => {},
      onPointerDown: () => {},
      onPointerMove: () => {},
      onPointerUp: () => {},
      cameraInput: document.querySelector<HTMLElement>(cameraInputSelector)!
    };
    if (!observation.cameraInput) {
      throw new Error("camera input is missing for trust observation");
    }
    observation.onKeydown = (event) => {
      if (!isMovementKey(event.key)) return;
      observation.keydownCount += 1;
      if (!event.isTrusted) observation.untrustedCount += 1;
    };
    observation.onKeyup = (event) => {
      if (!isMovementKey(event.key)) return;
      observation.keyupCount += 1;
      if (!event.isTrusted) observation.untrustedCount += 1;
    };
    observation.onPointerDown = (event) => {
      if (event.button !== 0) return;
      observation.pointerActive = true;
      observation.pointerX = event.clientX;
      observation.pointerDownCount += 1;
      if (!event.isTrusted) observation.untrustedPointerCount += 1;
    };
    observation.onPointerMove = (event) => {
      if (!observation.pointerActive || (event.buttons & 1) === 0) return;
      observation.pointerMoveCount += 1;
      observation.maximumPointerStrokePixels = Math.max(
        observation.maximumPointerStrokePixels,
        Math.abs(event.clientX - observation.pointerX)
      );
      observation.pointerX = event.clientX;
      if (!event.isTrusted) observation.untrustedPointerCount += 1;
    };
    observation.onPointerUp = (event) => {
      if (!observation.pointerActive || event.button !== 0) return;
      observation.pointerActive = false;
      observation.pointerUpCount += 1;
      if (!event.isTrusted) observation.untrustedPointerCount += 1;
    };
    observedWindow.__RPG_MOVEMENT_TRUST__ = observation;
    window.addEventListener("keydown", observation.onKeydown);
    window.addEventListener("keyup", observation.onKeyup);
    observation.cameraInput.addEventListener(
      "pointerdown",
      observation.onPointerDown
    );
    observation.cameraInput.addEventListener(
      "pointermove",
      observation.onPointerMove
    );
    observation.cameraInput.addEventListener(
      "pointerup",
      observation.onPointerUp
    );
  }, CAMERA_INPUT_SELECTOR);
}

async function stopMovementTrustObservation(page: Page) {
  return page.evaluate(() => {
    const observedWindow = window as typeof window & {
      __RPG_MOVEMENT_TRUST__?: {
        keydownCount: number;
        keyupCount: number;
        untrustedCount: number;
        pointerDownCount: number;
        pointerUpCount: number;
        pointerMoveCount: number;
        untrustedPointerCount: number;
        maximumPointerStrokePixels: number;
        onKeydown: (event: KeyboardEvent) => void;
        onKeyup: (event: KeyboardEvent) => void;
        onPointerDown: (event: PointerEvent) => void;
        onPointerMove: (event: PointerEvent) => void;
        onPointerUp: (event: PointerEvent) => void;
        cameraInput: HTMLElement;
      };
    };
    const observation = observedWindow.__RPG_MOVEMENT_TRUST__;
    if (!observation) throw new Error("movement trust observation is missing");
    window.removeEventListener("keydown", observation.onKeydown);
    window.removeEventListener("keyup", observation.onKeyup);
    observation.cameraInput.removeEventListener(
      "pointerdown",
      observation.onPointerDown
    );
    observation.cameraInput.removeEventListener(
      "pointermove",
      observation.onPointerMove
    );
    observation.cameraInput.removeEventListener(
      "pointerup",
      observation.onPointerUp
    );
    delete observedWindow.__RPG_MOVEMENT_TRUST__;
    return {
      keydownCount: observation.keydownCount,
      keyupCount: observation.keyupCount,
      untrustedCount: observation.untrustedCount,
      pointerDownCount: observation.pointerDownCount,
      pointerUpCount: observation.pointerUpCount,
      pointerMoveCount: observation.pointerMoveCount,
      untrustedPointerCount: observation.untrustedPointerCount,
      maximumPointerStrokePixels: observation.maximumPointerStrokePixels
    };
  });
}

export async function observeTrustedMovementDuring<T>(
  page: Page,
  action: () => Promise<T>
) {
  let actionResult: T | undefined;
  let actionError: unknown;
  let trust:
    | Awaited<ReturnType<typeof stopMovementTrustObservation>>
    | undefined;
  await startMovementTrustObservation(page);
  try {
    actionResult = await action();
  } catch (error) {
    actionError = error;
  } finally {
    await releaseAllTrustedRouteKeys(page).catch(() => undefined);
    trust = await stopMovementTrustObservation(page).catch(() => undefined);
  }
  if (actionError) {
    throw actionError;
  }
  expect(trust).toBeDefined();
  expect(trust!.untrustedCount).toBe(0);
  expect(trust!.untrustedPointerCount).toBe(0);
  expect(trust!.keydownCount).toBeGreaterThan(0);
  expect(trust!.keyupCount).toBe(trust!.keydownCount);
  expect(trust!.pointerUpCount).toBe(trust!.pointerDownCount);
  expect(trust!.maximumPointerStrokePixels).toBeLessThanOrEqual(140.001);
  expect(routePressedKeys.get(page)?.size ?? 0).toBe(0);
  return {
    result: actionResult as T,
    trust: trust!
  };
}

function parseTuple(raw: string, label: string) {
  const values = raw.split(",").map(Number);
  if (values.length !== 3 || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label} telemetry is invalid: ${raw}`);
  }
  return values as [number, number, number];
}

function shortestYawError(current: number, target: number) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}

async function getCameraInputBounds(page: Page) {
  const cached = cameraInputBounds.get(page);
  if (cached) return cached;
  const bounds = await page.locator(CAMERA_INPUT_SELECTOR).boundingBox();
  if (!bounds) throw new Error("camera input bounds are unavailable");
  cameraInputBounds.set(page, bounds);
  return bounds;
}

async function readCameraYaw(page: Page) {
  return page.evaluate(() =>
    Number(
      document.querySelector<HTMLElement>(
        ".seamless-world-renderer"
      )?.dataset.cameraYaw
    )
  );
}

export async function readWorldTelemetry(
  page: Page,
  {
    assertSafe = true,
    requireFacing = true
  }: {
    assertSafe?: boolean;
    requireFacing?: boolean;
  } = {}
): Promise<WorldTelemetry> {
  const raw = await page
    .locator(`${WORLD_SELECTOR}, ${RENDERER_SELECTOR}`)
    .evaluateAll((nodes) => {
      const world = nodes.find((node) =>
        (node as HTMLElement).matches('[data-testid="world-view"]')
      ) as HTMLElement | undefined;
      const renderer = nodes.find((node) =>
        (node as HTMLElement).matches(".seamless-world-renderer")
      ) as HTMLElement | undefined;
      if (!world || !renderer) throw new Error("world telemetry nodes are missing");
      return {
        positionRaw: renderer.dataset.playerPosition ?? "",
        headingRaw:
          renderer.dataset.playerHeading ?? world.dataset.playerHeading ?? "",
        revision:
          renderer.dataset.navigationRevision ??
          world.dataset.navigationRevision ??
          "",
        zone: world.dataset.currentZone ?? "",
        navigationRegion:
          renderer.dataset.navigationRegion ??
          world.dataset.navigationRegion ??
          "",
        inputLocked: renderer.dataset.inputLocked ?? "",
        movementX: renderer.dataset.movementX ?? "",
        movementY: renderer.dataset.movementY ?? "",
        movementStrength: renderer.dataset.movementStrength ?? "",
        runRequested: renderer.dataset.runRequested ?? "",
        playerMoving: renderer.dataset.playerMoving ?? "",
        playerLocomotion: renderer.dataset.playerLocomotion ?? "",
        cameraYaw: renderer.dataset.cameraYaw ?? "",
        cameraPitch: renderer.dataset.cameraPitch ?? "",
        cameraBoom: renderer.dataset.cameraBoom ?? "",
        cameraFacingDot: renderer.dataset.cameraFacingDot ?? "",
        cameraCollisionAdjusted:
          renderer.dataset.cameraCollisionAdjusted ?? "",
        cameraCollisionAdjustment:
          renderer.dataset.cameraCollisionAdjustment ?? "",
        cameraLateralCollisionEscape:
          renderer.dataset.cameraLateralCollisionEscape ?? "",
        cameraSafeViolationMs:
          renderer.dataset.cameraSafeViolationMs ?? "",
        cameraDiagnostic: renderer.dataset.cameraDiagnostic ?? ""
      };
    });
  const telemetry: WorldTelemetry = {
    positionRaw: raw.positionRaw,
    position: parseTuple(raw.positionRaw, "position"),
    headingRaw: raw.headingRaw,
    heading: parseTuple(raw.headingRaw, "heading"),
    revision: raw.revision,
    zone: raw.zone,
    navigationRegion: raw.navigationRegion,
    inputLocked: raw.inputLocked === "true",
    movement: [
      Number.parseFloat(raw.movementX),
      Number.parseFloat(raw.movementY)
    ],
    movementStrength: Number.parseFloat(raw.movementStrength),
    runRequested: raw.runRequested === "true",
    playerMoving: raw.playerMoving === "true",
    playerLocomotion: raw.playerLocomotion,
    cameraYaw: Number(raw.cameraYaw),
    cameraPitch: Number(raw.cameraPitch),
    cameraBoom: Number(raw.cameraBoom),
    cameraFacingDot: Number(raw.cameraFacingDot),
    cameraCollisionAdjusted: raw.cameraCollisionAdjusted === "true",
    cameraCollisionAdjustment: Number(raw.cameraCollisionAdjustment),
    cameraLateralCollisionEscape:
      raw.cameraLateralCollisionEscape === "true",
    cameraSafeViolationMs: Number(raw.cameraSafeViolationMs),
    cameraDiagnostic: raw.cameraDiagnostic
  };
  if (assertSafe) {
    assertSafeCameraTelemetry(telemetry, { requireFacing });
  }
  return telemetry;
}

export function assertSafeCameraTelemetry(
  telemetry: WorldTelemetry,
  { requireFacing = true }: { requireFacing?: boolean } = {}
) {
  if (
    telemetry.movement.some((value) => !Number.isFinite(value)) ||
    !Number.isFinite(telemetry.movementStrength)
  ) {
    throw new Error(
      `movement telemetry is missing or invalid: ` +
        `${telemetry.movement.join(",")};${telemetry.movementStrength}`
    );
  }
  if (
    !["idle", "walk", "run", "jump"].includes(
      telemetry.playerLocomotion
    )
  ) {
    throw new Error(
      `player locomotion telemetry is invalid: ` +
        telemetry.playerLocomotion
    );
  }
  if (!Number.isFinite(telemetry.cameraYaw)) {
    throw new Error("data-camera-yaw is missing or non-finite");
  }
  if (!Number.isFinite(telemetry.cameraPitch)) {
    throw new Error("data-camera-pitch is missing or non-finite");
  }
  if (!Number.isFinite(telemetry.cameraBoom) || telemetry.cameraBoom < 2.6) {
    throw new Error(`unsafe camera boom: ${telemetry.cameraBoom}`);
  }
  if (
    !Number.isFinite(telemetry.cameraFacingDot) ||
    (requireFacing && telemetry.cameraFacingDot < 0.98)
  ) {
    throw new Error(
      `camera is not facing the player focus: ${telemetry.cameraFacingDot}`
    );
  }
  if (
    !Number.isFinite(telemetry.cameraCollisionAdjustment) ||
    telemetry.cameraCollisionAdjustment < 0
  ) {
    throw new Error(
      `camera collision adjustment is invalid: ` +
        telemetry.cameraCollisionAdjustment
    );
  }
  if (
    !Number.isFinite(telemetry.cameraSafeViolationMs) ||
    telemetry.cameraSafeViolationMs > 250
  ) {
    throw new Error(
      `camera safe-area violation exceeded 250ms: ${telemetry.cameraSafeViolationMs}; ` +
        `position=${telemetry.positionRaw}; boom=${telemetry.cameraBoom}; ` +
        `yaw=${telemetry.cameraYaw}; pitch=${telemetry.cameraPitch}; ` +
        `region=${telemetry.navigationRegion}`
    );
  }
  if (telemetry.cameraDiagnostic !== "ok") {
    throw new Error(`camera diagnostic failed: ${telemetry.cameraDiagnostic}`);
  }
}

/**
 * Waits until the navigation revision stops moving on its own, then returns the
 * settled telemetry.
 *
 * The world keeps bumping the revision for a moment after it reports ready: as
 * each character GLB resolves, its interaction target flips availability and
 * the runtime counts that as a change. Measured on the live build the revision
 * climbs from 7 to 14 in the first few hundred milliseconds and then holds. A
 * baseline captured inside that window makes any later comparison read as if
 * something moved the player, which is exactly the accusation the map tests are
 * supposed to be able to make truthfully. This waits for quiet rather than
 * relaxing what the comparison demands.
 */
export async function readSettledWorldTelemetry(
  page: Page,
  { quietMs = 250, timeoutMs = 10_000 } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let previous = await readWorldTelemetry(page);
  for (;;) {
    await page.waitForTimeout(quietMs);
    const current = await readWorldTelemetry(page);
    if (current.revision === previous.revision) return current;
    if (Date.now() >= deadline) {
      throw new Error(
        `navigation revision never settled: ${previous.revision} -> ` +
          `${current.revision}`
      );
    }
    previous = current;
  }
}

export async function enterRpgWorld(
  page: Page,
  character: "male" | "female" = "female",
  { navigate = true } = {}
) {
  cameraInputBounds.delete(page);
  routePressedKeys.delete(page);
  if (navigate) {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/en");
  }
  await page.getByRole("button", { name: "START" }).click();
  await page
    .getByRole("button", { name: `Select ${character} character` })
    .click();
  await page.getByRole("button", { name: "ENTER WORLD" }).click();
  const renderer = page.locator(
    `${RENDERER_SELECTOR}[data-world-ready="true"]` +
      '[data-world-renderer="seamless-rpg"]' +
      '[data-renderer-technology="webgl3d"]'
  );
  await expect(renderer).toBeVisible({ timeout: 30_000 });
  expect(
    await page.evaluate(
      () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
  ).toBe(true);
  await expect
    .poll(
      async () => {
        const telemetry = await readWorldTelemetry(page, {
          assertSafe: false
        });
        return (
          telemetry.cameraBoom >= 2.6 &&
          telemetry.cameraFacingDot >= 0.98 &&
          telemetry.cameraSafeViolationMs === 0 &&
          telemetry.cameraDiagnostic === "ok"
        );
      },
      { timeout: 10_000 }
    )
    .toBe(true);
  return renderer;
}

export async function rotateCameraToYaw(page: Page, targetYaw: number) {
  const bounds = await getCameraInputBounds(page);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await readCameraYaw(page);
    if (!Number.isFinite(current)) {
      throw new Error("data-camera-yaw is missing or non-finite");
    }
    const error = shortestYawError(current, targetYaw);
    if (Math.abs(error) <= 0.004) return;
    const maximumStroke = 140;
    let remainingPixels = -error / 0.004;
    while (Math.abs(remainingPixels) > 0.5) {
      const deltaX = Math.max(
        -maximumStroke,
        Math.min(maximumStroke, remainingPixels)
      );
      const startX = centerX;
      await page.mouse.move(startX, centerY);
      await page.mouse.down();
      await page.mouse.move(startX + deltaX, centerY);
      await page.mouse.up();
      await page.evaluate(
        () =>
          new Promise<void>((resolve, reject) =>
            requestAnimationFrame(function sampleSafety() {
              const renderer = document.querySelector<HTMLElement>(
                ".seamless-world-renderer"
              );
              const boom = Number(renderer?.dataset.cameraBoom);
              const violation = Number(
                renderer?.dataset.cameraSafeViolationMs
              );
              const diagnostic = renderer?.dataset.cameraDiagnostic;
              if (
                !Number.isFinite(boom) ||
                boom < 2.6 ||
                !Number.isFinite(violation) ||
                violation > 250 ||
                diagnostic !== "ok"
              ) {
                reject(
                  new Error(
                    `camera turn safety failed: boom=${boom}; ` +
                      `violation=${violation}; diagnostic=${diagnostic}; ` +
                      `facing=${renderer?.dataset.cameraFacingDot}; ` +
                      `collision=${renderer?.dataset.cameraCollisionAdjustment}; ` +
                      `lateral=${renderer?.dataset.cameraLateralCollisionEscape}; ` +
                      `transitionFallback=${renderer?.dataset.cameraTransitionCollisionFallback}; ` +
                      `finalFallback=${renderer?.dataset.cameraFinalCollisionFallback}; ` +
                      `correction=${renderer?.dataset.cameraSafetyCorrection}; ` +
                      `offset=${renderer?.dataset.cameraSafetyOffset}`
                  )
                );
                return;
              }
              if (violation > 0) {
                requestAnimationFrame(sampleSafety);
                return;
              }
              resolve();
            })
          )
      );
      remainingPixels -= deltaX;
    }
  }
  const actual = await readCameraYaw(page);
  if (Math.abs(shortestYawError(actual, targetYaw)) <= 0.004) return;
  throw new Error(
    `camera yaw did not converge: target=${targetYaw}, actual=${actual}`
  );
}

export async function driveTrustedRouteProbe(page: Page) {
  let routeObservationActive = false;
  let trustObservationActive = false;
  let observation:
    | Awaited<ReturnType<typeof stopRouteObservation>>
    | undefined;
  let trust:
    | Awaited<ReturnType<typeof stopMovementTrustObservation>>
    | undefined;
  await startMovementTrustObservation(page);
  trustObservationActive = true;
  await startRouteObservation(page);
  routeObservationActive = true;
  const before = await readWorldTelemetry(page);
  try {
    const route = [
      [before.position[0], before.position[2]],
      [-27, -2.973191261452298],
      [-29, -2.973191261452298],
      [-29, 4]
    ] as const;
    const result = await driveContinuousTrustedRoute(page, route, {
      runRequested: true
    });
    if (process.env.RPG_ROUTE_DEBUG === "1") {
      console.log(
        "RPG_ROUTE_PROBE_DEBUG",
        JSON.stringify(result.diagnostics)
      );
    }
    const after = await readWorldTelemetry(page);
    observation = await stopRouteObservation(page);
    routeObservationActive = false;
    trust = await stopMovementTrustObservation(page);
    trustObservationActive = false;
    return {
      moved: Math.hypot(
        after.position[0] - before.position[0],
        after.position[2] - before.position[2]
      ),
      vertexCount: result.vertexSnapshots.length,
      observation,
      get trust() {
        return trust!;
      },
      get pressedKeyCount() {
        return routePressedKeys.get(page)?.size ?? 0;
      }
    };
  } finally {
    await releaseAllTrustedRouteKeys(page).catch(() => undefined);
    if (routeObservationActive) {
      observation = await stopRouteObservation(page).catch(() => undefined);
    }
    if (trustObservationActive) {
      trust = await stopMovementTrustObservation(page).catch(() => undefined);
    }
  }
}

export async function monitorCameraSafetyDuring(
  page: Page,
  action: () => Promise<void>
) {
  type CameraTimelineSample = {
    cameraYaw: number;
    cameraFacingDot: number;
    heading: readonly [number, number, number];
    elapsedMs: number;
  };
  type CameraSafetyResult = {
    maximumViolationMs: number;
    minimumBoom: number;
    safetyFailure: string | null;
    manual: CameraTimelineSample | null;
    beforeRecentering: CameraTimelineSample | null;
    afterRecentering: CameraTimelineSample | null;
  };
  let result: CameraSafetyResult | undefined;
  let actionError: unknown;
  await page.evaluate((cameraInputSelector) => {
    type TimelineSample = {
      cameraYaw: number;
      cameraFacingDot: number;
      heading: readonly [number, number, number];
      elapsedMs: number;
    };
    const observedWindow = window as typeof window & {
      __RPG_CAMERA_SAFETY_OBSERVATION__?: {
        active: boolean;
        frame: number;
        maximumViolationMs: number;
        minimumBoom: number;
        safetyFailure: string | null;
        manualInputAt: number | null;
        manual: TimelineSample | null;
        beforeRecentering: TimelineSample | null;
        afterRecentering: TimelineSample | null;
        beforeTimer: number;
        afterTimer: number;
        cameraInput: HTMLElement;
        onPointerUp: (event: PointerEvent) => void;
      };
    };
    const cameraInput = document.querySelector<HTMLElement>(
      cameraInputSelector
    );
    if (!cameraInput) {
      throw new Error("camera input is missing for safety observation");
    }
    const observation = {
      active: true,
      frame: 0,
      maximumViolationMs: 0,
      minimumBoom: Number.POSITIVE_INFINITY,
      safetyFailure: null as string | null,
      manualInputAt: null as number | null,
      manual: null as TimelineSample | null,
      beforeRecentering: null as TimelineSample | null,
      afterRecentering: null as TimelineSample | null,
      beforeTimer: 0,
      afterTimer: 0,
      cameraInput,
      onPointerUp: (() => {}) as (event: PointerEvent) => void
    };
    const captureTimeline = (scheduledElapsedMs: number) => {
      const renderer = document.querySelector<HTMLElement>(
        ".seamless-world-renderer"
      );
      const cameraYaw = Number(renderer?.dataset.cameraYaw);
      const cameraFacingDot = Number(renderer?.dataset.cameraFacingDot);
      const heading = (renderer?.dataset.playerHeading ?? "")
        .split(",")
        .map(Number);
      if (
        observation.manualInputAt === null ||
        !Number.isFinite(cameraYaw) ||
        !Number.isFinite(cameraFacingDot) ||
        cameraFacingDot < 0.98 ||
        heading.length !== 3 ||
        heading.some((value) => !Number.isFinite(value))
      ) {
        observation.safetyFailure ??=
          `camera timeline sample failed at ${scheduledElapsedMs}ms`;
        return null;
      }
      return {
        cameraYaw,
        cameraFacingDot,
        heading: heading as [number, number, number],
        elapsedMs: performance.now() - observation.manualInputAt
      };
    };
    observation.onPointerUp = (event) => {
      if (event.button !== 0 || !event.isTrusted) return;
      clearTimeout(observation.beforeTimer);
      clearTimeout(observation.afterTimer);
      observation.manualInputAt = performance.now();
      observation.manual = null;
      observation.beforeRecentering = null;
      observation.afterRecentering = null;
      observation.beforeTimer = window.setTimeout(() => {
        observation.beforeRecentering = captureTimeline(799);
      }, 799);
      observation.afterTimer = window.setTimeout(() => {
        observation.afterRecentering = captureTimeline(2_000);
      }, 2_000);
    };
    cameraInput.addEventListener("pointerup", observation.onPointerUp);
    observedWindow.__RPG_CAMERA_SAFETY_OBSERVATION__ = observation;
    const sample = (now: number) => {
      const renderer = document.querySelector<HTMLElement>(
        ".seamless-world-renderer"
      );
      const boom = Number(renderer?.dataset.cameraBoom);
      const violation = Number(renderer?.dataset.cameraSafeViolationMs);
      const diagnostic = renderer?.dataset.cameraDiagnostic;
      const cameraYaw = Number(renderer?.dataset.cameraYaw);
      const cameraFacingDot = Number(renderer?.dataset.cameraFacingDot);
      const heading = (renderer?.dataset.playerHeading ?? "")
        .split(",")
        .map(Number);
      if (Number.isFinite(boom)) {
        observation.minimumBoom = Math.min(observation.minimumBoom, boom);
      }
      if (Number.isFinite(violation)) {
        observation.maximumViolationMs = Math.max(
          observation.maximumViolationMs,
          violation
        );
      }
      if (
        observation.safetyFailure === null &&
        (!Number.isFinite(boom) ||
          boom < 2.6 ||
          !Number.isFinite(violation) ||
          violation > 250 ||
          !Number.isFinite(cameraFacingDot) ||
          cameraFacingDot < 0.98 ||
          diagnostic !== "ok")
      ) {
        observation.safetyFailure =
          `camera safety failed: boom=${boom}; violation=${violation}; ` +
          `facingDot=${cameraFacingDot}; diagnostic=${diagnostic}`;
      }
      if (
        observation.manualInputAt !== null &&
        Number.isFinite(cameraYaw) &&
        Number.isFinite(cameraFacingDot) &&
        cameraFacingDot >= 0.98 &&
        heading.length === 3 &&
        heading.every(Number.isFinite)
      ) {
        const elapsedMs = now - observation.manualInputAt;
        const timelineSample = {
          cameraYaw,
          cameraFacingDot,
          heading: heading as [number, number, number],
          elapsedMs
        };
        observation.manual ??= timelineSample;
      }
      if (observation.active) {
        observation.frame = requestAnimationFrame(sample);
      }
    };
    observation.frame = requestAnimationFrame(sample);
  }, CAMERA_INPUT_SELECTOR);
  try {
    await action();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve())
          )
        )
    );
  } catch (error) {
    actionError = error;
  } finally {
    result = await page.evaluate(() => {
      const observedWindow = window as typeof window & {
        __RPG_CAMERA_SAFETY_OBSERVATION__?: {
          active: boolean;
          frame: number;
          maximumViolationMs: number;
          minimumBoom: number;
          safetyFailure: string | null;
          manual: CameraTimelineSample | null;
          beforeRecentering: CameraTimelineSample | null;
          afterRecentering: CameraTimelineSample | null;
          beforeTimer: number;
          afterTimer: number;
          cameraInput: HTMLElement;
          onPointerUp: (event: PointerEvent) => void;
        };
      };
      const observation =
        observedWindow.__RPG_CAMERA_SAFETY_OBSERVATION__;
      if (!observation) {
        throw new Error("camera safety observation is missing");
      }
      observation.active = false;
      cancelAnimationFrame(observation.frame);
      clearTimeout(observation.beforeTimer);
      clearTimeout(observation.afterTimer);
      observation.cameraInput.removeEventListener(
        "pointerup",
        observation.onPointerUp
      );
      delete observedWindow.__RPG_CAMERA_SAFETY_OBSERVATION__;
      return {
        maximumViolationMs: observation.maximumViolationMs,
        minimumBoom: observation.minimumBoom,
        safetyFailure: observation.safetyFailure,
        manual: observation.manual,
        beforeRecentering: observation.beforeRecentering,
        afterRecentering: observation.afterRecentering
      };
    });
  }
  if (actionError) {
    throw actionError;
  }
  if (!result) {
    throw new Error("camera safety observation did not return a result");
  }
  return result;
}

function recordTelemetryState(
  telemetry: WorldTelemetry,
  navigationRegions: string[],
  zones: string[]
) {
  if (
    telemetry.navigationRegion &&
    navigationRegions.at(-1) !== telemetry.navigationRegion
  ) {
    navigationRegions.push(telemetry.navigationRegion);
  }
  if (telemetry.zone && zones.at(-1) !== telemetry.zone) {
    zones.push(telemetry.zone);
  }
}

async function startRouteObservation(
  page: Page,
  { requireMapObservation = true } = {}
) {
  await page.evaluate(({ requireMapObservation }) => {
    type RouteObservation = {
      active: boolean;
      frame: number;
      navigationRegions: string[];
      zones: string[];
      safetyFailure: string | null;
      maximumViolationMs: number;
      minimumBoom: number;
      previousFrameAt: number | null;
      minimumRafIntervalMs: number;
      maximumRafIntervalMs: number;
      mapObserver: MutationObserver | null;
      mapRevisionRecords: Map<
        string,
        { at: number; position: string; anchor: string }
      >;
      mapUpdateFailure: string | null;
      mapUpdateLatencies: number[];
      mapUpdateTimes: number[];
      mapObservationStartedAt: number;
      mapMovementStartedAt: number | null;
    };
    const observedWindow = window as typeof window & {
      __RPG_ROUTE_OBSERVATION__?: RouteObservation;
    };
    const observation: RouteObservation = {
      active: true,
      frame: 0,
      navigationRegions: [],
      zones: [],
      safetyFailure: null,
      maximumViolationMs: 0,
      minimumBoom: Number.POSITIVE_INFINITY,
      previousFrameAt: null,
      minimumRafIntervalMs: Number.POSITIVE_INFINITY,
      maximumRafIntervalMs: 0,
      mapObserver: null,
      mapRevisionRecords: new Map<
        string,
        { at: number; position: string; anchor: string }
      >(),
      mapUpdateFailure: null as string | null,
      mapUpdateLatencies: [] as number[],
      mapUpdateTimes: [] as number[],
      mapObservationStartedAt: performance.now(),
      mapMovementStartedAt: null
    };
    const recordRendererRevision = (renderer: HTMLElement) => {
      if (observation.mapUpdateFailure !== null) return;
      const revision = renderer.dataset.navigationRevision ?? "";
      const position = renderer.dataset.playerPosition ?? "";
      const anchor = renderer.dataset.mapAnchorReference ?? "";
      const positionValues = position.split(",").map(Number);
      const anchorValues = anchor.split(",").map(Number);
      if (
        !revision ||
        positionValues.length !== 3 ||
        positionValues.some((value) => !Number.isFinite(value)) ||
        anchorValues.length !== 2 ||
        anchorValues.some((value) => !Number.isFinite(value))
      ) {
        observation.mapUpdateFailure =
          `invalid renderer map telemetry: revision=${revision}; ` +
          `position=${position}; anchor=${anchor}`;
        return;
      }
      observation.mapRevisionRecords.set(revision, {
        at: performance.now(),
        position,
        anchor
      });
    };
    const recordMarkerRevision = (marker: HTMLElement) => {
      if (observation.mapUpdateFailure !== null) return;
      const revision = marker.dataset.navigationRevision ?? "";
      const actualAnchor = marker.dataset.anchorReference ?? "";
      const rendererRecord = observation.mapRevisionRecords.get(revision);
      if (!revision || !rendererRecord) {
        observation.mapUpdateFailure =
          `map revision ${revision || "<missing>"} has no renderer sample`;
        return;
      }
      if (rendererRecord.anchor !== actualAnchor) {
        observation.mapUpdateFailure =
          `map projection mismatch for ${revision}: ` +
          `${rendererRecord.anchor} !== ${actualAnchor}`;
        return;
      }
      const pairedAt = performance.now();
      observation.mapUpdateLatencies.push(pairedAt - rendererRecord.at);
      observation.mapUpdateTimes.push(pairedAt);
    };
    const mapObserver = new MutationObserver((mutations) => {
      const renderers = new Set<HTMLElement>();
      const markers = new Set<HTMLElement>();
      for (const mutation of mutations) {
        const target = mutation.target as HTMLElement;
        if (target.matches(".seamless-world-renderer")) {
          renderers.add(target);
        } else if (target.matches(".rpg-mini-map-player")) {
          markers.add(target);
        }
      }
      for (const renderer of renderers) {
        recordRendererRevision(renderer);
      }
      for (const marker of markers) {
        recordMarkerRevision(marker);
      }
    });
    observation.mapObserver = mapObserver;
    const initialRenderer = document.querySelector<HTMLElement>(
      ".seamless-world-renderer"
    );
    const initialMarker = document.querySelector<HTMLElement>(
      ".rpg-mini-map-player"
    );
    if (!initialRenderer) {
      throw new Error("renderer telemetry is missing for route observation");
    }
    recordRendererRevision(initialRenderer);
    if (requireMapObservation) {
      if (!initialMarker) {
        throw new Error("map telemetry is missing for route observation");
      }
      mapObserver.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-navigation-revision"]
      });
    }
    observedWindow.__RPG_ROUTE_OBSERVATION__ = observation;
    const sample = (now: number) => {
      const world = document.querySelector<HTMLElement>(
        '[data-testid="world-view"]'
      );
      const renderer = document.querySelector<HTMLElement>(
        ".seamless-world-renderer"
      );
      if (observation.previousFrameAt !== null) {
        const interval = now - observation.previousFrameAt;
        observation.minimumRafIntervalMs = Math.min(
          observation.minimumRafIntervalMs,
          interval
        );
        observation.maximumRafIntervalMs = Math.max(
          observation.maximumRafIntervalMs,
          interval
        );
      }
      observation.previousFrameAt = now;
      const navigationRegion = world?.dataset.navigationRegion ?? "";
      const zone = world?.dataset.currentZone ?? "";
      if (
        navigationRegion &&
        observation.navigationRegions.at(-1) !== navigationRegion
      ) {
        observation.navigationRegions.push(navigationRegion);
      }
      if (zone && observation.zones.at(-1) !== zone) {
        observation.zones.push(zone);
      }
      const boom = Number(renderer?.dataset.cameraBoom);
      const violation = Number(renderer?.dataset.cameraSafeViolationMs);
      const diagnostic = renderer?.dataset.cameraDiagnostic;
      if (Number.isFinite(boom)) {
        observation.minimumBoom = Math.min(observation.minimumBoom, boom);
      }
      if (Number.isFinite(violation)) {
        observation.maximumViolationMs = Math.max(
          observation.maximumViolationMs,
          violation
        );
      }
      if (
        observation.safetyFailure === null &&
        (!Number.isFinite(boom) ||
          boom < 2.6 ||
          !Number.isFinite(violation) ||
          violation > 250 ||
          diagnostic !== "ok")
      ) {
        observation.safetyFailure =
          `camera safety failed: boom=${boom}; violation=${violation}; ` +
          `diagnostic=${diagnostic}`;
      }
      if (observation.active) {
        observation.frame = requestAnimationFrame(sample);
      }
    };
    observation.frame = requestAnimationFrame(sample);
  }, { requireMapObservation });
}

async function stopRouteObservation(page: Page) {
  return page.evaluate(() => {
    const observedWindow = window as typeof window & {
      __RPG_ROUTE_OBSERVATION__?: {
        active: boolean;
        frame: number;
        navigationRegions: string[];
        zones: string[];
        safetyFailure: string | null;
        maximumViolationMs: number;
        minimumBoom: number;
        minimumRafIntervalMs: number;
        maximumRafIntervalMs: number;
        mapObserver: MutationObserver | null;
        mapUpdateFailure: string | null;
        mapUpdateLatencies: number[];
        mapUpdateTimes: number[];
        mapObservationStartedAt: number;
        mapMovementStartedAt: number | null;
      };
    };
    const observation = observedWindow.__RPG_ROUTE_OBSERVATION__;
    if (!observation) {
      throw new Error("route observation is missing");
    }
    observation.active = false;
    cancelAnimationFrame(observation.frame);
    observation.mapObserver?.disconnect();
    delete observedWindow.__RPG_ROUTE_OBSERVATION__;
    const stoppedAt = performance.now();
    const mapMovementStartedAt =
      observation.mapMovementStartedAt ??
      observation.mapObservationStartedAt;
    const movementMapUpdateTimes = observation.mapUpdateTimes.filter(
      (at) => at >= mapMovementStartedAt
    );
    const mapObservationDurationMs = stoppedAt - mapMovementStartedAt;
    return {
      navigationRegions: observation.navigationRegions,
      zones: observation.zones,
      safetyFailure: observation.safetyFailure,
      maximumViolationMs: observation.maximumViolationMs,
      minimumBoom: observation.minimumBoom,
      minimumRafIntervalMs: Number.isFinite(
        observation.minimumRafIntervalMs
      )
        ? observation.minimumRafIntervalMs
        : 0,
      maximumRafIntervalMs: observation.maximumRafIntervalMs,
      mapUpdateFailure: observation.mapUpdateFailure,
      mapUpdateCount: movementMapUpdateTimes.length,
      maximumMapUpdateLatencyMs:
        observation.mapUpdateLatencies.length > 0
          ? Math.max(...observation.mapUpdateLatencies)
          : 0,
      averageMapUpdateIntervalMs:
        movementMapUpdateTimes.length > 0
          ? mapObservationDurationMs / movementMapUpdateTimes.length
          : Number.POSITIVE_INFINITY,
      maximumMapUpdateGapMs:
        movementMapUpdateTimes.length > 1
          ? Math.max(
              ...movementMapUpdateTimes.slice(1).map(
                (at, index) => at - movementMapUpdateTimes[index]
              )
            )
          : Number.POSITIVE_INFINITY,
      firstMovementMapUpdateDelayMs:
        movementMapUpdateTimes.length > 0
          ? movementMapUpdateTimes[0] - mapMovementStartedAt
          : Number.POSITIVE_INFINITY,
      lastMapUpdateAgeMs:
        movementMapUpdateTimes.length > 0
          ? stoppedAt - movementMapUpdateTimes.at(-1)!
          : Number.POSITIVE_INFINITY
    };
  });
}

interface ContinuousRouteVertexSnapshot {
  readonly vertexIndex: number;
  readonly positionRaw: string;
  readonly position: readonly [number, number, number];
  readonly headingRaw: string;
  readonly heading: readonly [number, number, number];
  readonly revision: string;
  readonly zone: string;
  readonly navigationRegion: string;
}

export async function driveContinuousTrustedRoute(
  page: Page,
  route: readonly (readonly [number, number])[],
  {
    runRequested,
    steeringRoute = route,
    tolerance = RPG_CANONICAL_ROUTE_TOLERANCE,
    onPrepared
  }: {
    runRequested: boolean;
    steeringRoute?: readonly (readonly [number, number])[];
    tolerance?: number;
    onPrepared?: () => Promise<void>;
  }
) {
  if (route.length < 2) {
    throw new RangeError("continuous route requires at least two points");
  }
  if (steeringRoute.length !== route.length) {
    throw new RangeError("continuous steering route length must match");
  }
  await ensureTrustedRouteTransitionBinding(page);
  const firstDeltaX = steeringRoute[1][0] - steeringRoute[0][0];
  const firstDeltaZ = steeringRoute[1][1] - steeringRoute[0][1];
  await rotateCameraToYaw(page, Math.atan2(firstDeltaX, firstDeltaZ));
  await startTrustedRoutePointerDrag(page);

  try {
    await onPrepared?.();
    return await page.evaluate(
    async ({
      route,
      steeringRoute,
      runRequested,
      tolerance,
      maximumStroke,
      nominalSpeed,
      brakedSpeed
    }) => {
      type TrustedRouteKeyAction = {
        kind: "keys";
        down?: string[];
        up?: string[];
      };
      type TrustedRouteDragAction = {
        kind: "drag";
        startX: number;
        startY: number;
        endX: number;
        endY: number;
      };
      type TrustedRouteAction =
        | TrustedRouteKeyAction
        | TrustedRouteDragAction
        | {
            kind: "pointer-move";
            endX: number;
            endY: number;
          }
        | {
            kind: "pointer-reposition";
            x: number;
            y: number;
          }
        | {
            kind: "turn";
            currentYaw: number;
            detectedPositionRaw: string;
            minimumZ?: number;
            target: [number, number];
            targetYaw: number;
            tolerance: number;
            pointerMoveLimit: number;
          };
      type TrustedRouteTransitionResult = {
        arrivalPositionRaw: string;
        resumed: boolean;
        targetYaw: number;
        timings: {
          keyUpMs: number;
          captureMs: number;
          pointerMs: number;
          keyDownMs: number;
        };
        pointerX: number;
      };
      type RouteObservation = {
        safetyFailure: string | null;
        mapMovementStartedAt: number | null;
      };
      const observedWindow = window as typeof window & {
        __rpgTrustedRouteTransition: (
          action: TrustedRouteAction
        ) => Promise<TrustedRouteTransitionResult | undefined>;
        __RPG_ROUTE_OBSERVATION__?: RouteObservation;
      };
      const transition = observedWindow.__rpgTrustedRouteTransition;
      const renderer = document.querySelector<HTMLElement>(
        ".seamless-world-renderer"
      );
      const world = document.querySelector<HTMLElement>(
        '[data-testid="world-view"]'
      );
      const cameraInput = document.querySelector<HTMLElement>(
        ".world-camera-input"
      );
      if (!renderer || !world || !cameraInput || !transition) {
        throw new Error("continuous route browser dependencies are missing");
      }
      const parseTriple = (raw: string, label: string) => {
        const values = raw.split(",").map(Number);
        if (
          values.length !== 3 ||
          values.some((value) => !Number.isFinite(value))
        ) {
          throw new Error(`${label} telemetry is invalid: ${raw}`);
        }
        return values as [number, number, number];
      };
      const readPosition = () =>
        parseTriple(renderer.dataset.playerPosition ?? "", "position");
      const distanceTo = (
        position: readonly [number, number, number],
        target: readonly [number, number]
      ) => Math.hypot(position[0] - target[0], position[2] - target[1]);
      const shortestYawError = (current: number, target: number) =>
        Math.atan2(Math.sin(target - current), Math.cos(target - current));
      const assertSafety = () => {
        const failure =
          observedWindow.__RPG_ROUTE_OBSERVATION__?.safetyFailure;
        if (failure) throw new Error(failure);
      };
      const readRuntimeState = () =>
        [
          `inputLocked=${renderer.dataset.inputLocked}`,
          `movement=${renderer.dataset.movementX},${renderer.dataset.movementY}`,
          `strength=${renderer.dataset.movementStrength}`,
          `run=${renderer.dataset.runRequested}`,
          `moving=${renderer.dataset.playerMoving}`,
          `locomotion=${renderer.dataset.playerLocomotion}`
        ].join(";");
      const readSnapshot = (
        vertexIndex: number,
        positionRawOverride?: string
      ): ContinuousRouteVertexSnapshot => {
        const positionRaw =
          positionRawOverride ?? renderer.dataset.playerPosition ?? "";
        const headingRaw =
          renderer.dataset.playerHeading ??
          world.dataset.playerHeading ??
          "";
        return {
          vertexIndex,
          positionRaw,
          position: parseTriple(positionRaw, "position"),
          headingRaw,
          heading: parseTriple(headingRaw, "heading"),
          revision:
            renderer.dataset.navigationRevision ??
            world.dataset.navigationRevision ??
            "",
          zone: world.dataset.currentZone ?? "",
          navigationRegion: world.dataset.navigationRegion ?? ""
        };
      };
      const diagnostics = {
        inputBindingMs: 0,
        rotationMs: 0,
        correctionMs: 0,
        vertexPauseMs: 0,
        keyActionCount: 0,
        dragActionCount: 0,
        correctionCount: 0,
        inputRefreshCount: 0,
        lastRafIntervalMs: 0,
        maximumRafIntervalMs: 0,
        turnKeyUpMs: 0,
        turnCaptureMs: 0,
        turnPointerMs: 0,
        turnKeyDownMs: 0,
        correctionEvents: [] as {
          position: readonly [number, number, number];
          target: readonly [number, number];
        }[]
      };
      let previousFrameAt = performance.now();
      // How far the visitor travels between two of this loop's samples, from
      // the frame time this run is actually getting rather than from a number
      // written when the pace was different. The runtime moves speed x delta
      // with no acceleration, so a step is exactly that product; a median over
      // the last few frames keeps one stalled frame from inflating it.
      const recentFrameSeconds: number[] = [];
      const medianFrameSeconds = () => {
        if (recentFrameSeconds.length === 0) return 0;
        const sorted = [...recentFrameSeconds].sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)];
      };
      const predictedStep = (speed: number) => speed * medianFrameSeconds();
      const nextFrame = () =>
        new Promise<number>((resolve, reject) => {
          const requestedAt = performance.now();
          let timeoutId = 0;
          const frameRequest = requestAnimationFrame((timestamp) => {
            window.clearTimeout(timeoutId);
            const frameAt = performance.now();
            diagnostics.lastRafIntervalMs = frameAt - previousFrameAt;
            diagnostics.maximumRafIntervalMs = Math.max(
              diagnostics.maximumRafIntervalMs,
              diagnostics.lastRafIntervalMs
            );
            recentFrameSeconds.push(diagnostics.lastRafIntervalMs / 1_000);
            if (recentFrameSeconds.length > 5) recentFrameSeconds.shift();
            previousFrameAt = frameAt;
            resolve(timestamp);
          });
          timeoutId = window.setTimeout(() => {
            cancelAnimationFrame(frameRequest);
            reject(
              new Error(
                `E_RAF_STALL: no animation frame for ` +
                  `${Math.round(performance.now() - requestedAt)}ms; ` +
                  `hidden=${document.hidden}; ` +
                  `focused=${document.hasFocus()}; ` +
                  `lastRafIntervalMs=${diagnostics.lastRafIntervalMs}; ` +
                  `maximumRafIntervalMs=${diagnostics.maximumRafIntervalMs}; ` +
                  readRuntimeState()
              )
            );
          }, 4_000);
        });
      const performTransition = async (action: TrustedRouteAction) => {
        const startedAt = performance.now();
        const result = await transition(action);
        diagnostics.inputBindingMs += performance.now() - startedAt;
        if (
          action.kind === "drag" ||
          action.kind === "pointer-move" ||
          action.kind === "pointer-reposition" ||
          action.kind === "turn"
        ) {
          diagnostics.dragActionCount += 1;
        } else {
          diagnostics.keyActionCount += 1;
        }
        return result;
      };
      const keyTransition = (action: {
        down?: string[];
        up?: string[];
      }) => performTransition({ kind: "keys", ...action });
      const pointerBounds = cameraInput.getBoundingClientRect();
      const pointerMinimumX =
        pointerBounds.left + pointerBounds.width * 0.05;
      const pointerMaximumX =
        pointerBounds.right - pointerBounds.width * 0.05;
      const pointerY = pointerBounds.top + pointerBounds.height / 2;
      let pointerX = pointerBounds.left + pointerBounds.width / 2;
      const moveActivePointerBy = async (
        requestedDeltaX: number,
        moveLimit = maximumStroke
      ) => {
        let remainingPixels = requestedDeltaX;
        while (Math.abs(remainingPixels) > 0.5) {
          const direction = Math.sign(remainingPixels);
          let availablePixels =
            direction < 0
              ? pointerX - pointerMinimumX
              : pointerMaximumX - pointerX;
          if (availablePixels < 0.5) {
            pointerX =
              direction < 0 ? pointerMaximumX : pointerMinimumX;
            await performTransition({
              kind: "pointer-reposition",
              x: pointerX,
              y: pointerY
            });
            availablePixels =
              direction < 0
                ? pointerX - pointerMinimumX
                : pointerMaximumX - pointerX;
          }
          const deltaX =
            direction *
            Math.min(
              Math.abs(remainingPixels),
              moveLimit,
              availablePixels
            );
          pointerX += deltaX;
          await performTransition({
            kind: "pointer-move",
            endX: pointerX,
            endY: pointerY
          });
          await nextFrame();
          assertSafety();
          remainingPixels -= deltaX;
        }
      };
      const rotateToYaw = async (
        targetYaw: number,
        moveLimit = maximumStroke
      ) => {
        const startedAt = performance.now();
        try {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const currentYaw = Number(renderer.dataset.cameraYaw);
            if (!Number.isFinite(currentYaw)) {
              throw new Error("data-camera-yaw is missing or non-finite");
            }
            const error = shortestYawError(currentYaw, targetYaw);
            if (Math.abs(error) <= 0.004) return;
            await moveActivePointerBy(-error / 0.004, moveLimit);
          }
          const actualYaw = Number(renderer.dataset.cameraYaw);
          if (
            !Number.isFinite(actualYaw) ||
            Math.abs(shortestYawError(actualYaw, targetYaw)) > 0.004
          ) {
            throw new Error(
              `camera yaw did not converge: target=${targetYaw}, ` +
                `actual=${actualYaw}`
            );
          }
        } finally {
          diagnostics.rotationMs += performance.now() - startedAt;
        }
      };
      const correctToTarget = async (
        target: readonly [number, number]
      ) => {
        const correctionStartedAt = performance.now();
        diagnostics.correctionCount += 1;
        diagnostics.correctionEvents.push({
          position: readPosition(),
          target
        });
        try {
          for (let attempt = 0; attempt < 48; attempt += 1) {
            const position = readPosition();
            if (distanceTo(position, target) <= tolerance) {
              return performance.now();
            }
            const directYaw = Math.atan2(
              target[0] - position[0],
              target[1] - position[2]
            );
            await rotateToYaw(directYaw, 140);
            const beforeRaw = renderer.dataset.playerPosition ?? "";
            await keyTransition({ down: ["w"] });
            let moved = false;
            for (let frame = 0; frame < 2; frame += 1) {
              await nextFrame();
              if ((renderer.dataset.playerPosition ?? "") !== beforeRaw) {
                moved = true;
                break;
              }
            }
            await keyTransition({ up: ["w"] });
            assertSafety();
            if (!moved) {
              throw new Error(
                `continuous route correction did not move toward ` +
                  `${target.join(",")}`
              );
            }
          }
          const position = readPosition();
          throw new Error(
            `continuous route correction failed at ${position.join(",")}; ` +
              `target=${target.join(",")}`
          );
        } finally {
          diagnostics.correctionMs +=
            performance.now() - correctionStartedAt;
        }
      };

      const vertexSnapshots: ContinuousRouteVertexSnapshot[] = [];
      const startedAt = performance.now();
      if (observedWindow.__RPG_ROUTE_OBSERVATION__) {
        observedWindow.__RPG_ROUTE_OBSERVATION__.mapMovementStartedAt =
          startedAt;
      }
      await keyTransition({
        down: runRequested ? ["Shift", "w"] : ["w"]
      });
      let runActive = runRequested;
      let vertexIndex = 1;
      let previousPosition = readPosition();
      let progressAnchor = previousPosition;
      let progressStartedAt = performance.now();
      let stalledRefreshes = 0;
      let pendingTargetYaw: number | null = null;
      const routeDistance = route.slice(1).reduce(
        (sum, target, index) =>
          sum +
          Math.hypot(
            target[0] - route[index][0],
            target[1] - route[index][1]
          ),
        0
      );
      const deadline =
        startedAt +
        Math.max(120_000, (routeDistance / nominalSpeed) * 2_000);

      while (vertexIndex < route.length) {
        await nextFrame();
        assertSafety();
        if (pendingTargetYaw !== null) {
          const actualYaw = Number(renderer.dataset.cameraYaw);
          if (
            !Number.isFinite(actualYaw) ||
            Math.abs(
              shortestYawError(actualYaw, pendingTargetYaw)
            ) > 0.004
          ) {
            await keyTransition({ up: ["w"] });
            await rotateToYaw(pendingTargetYaw);
            await keyTransition({ down: ["w"] });
          }
          pendingTargetYaw = null;
        }
        const position = readPosition();
        const target = route[vertexIndex];
        const steeringTarget = steeringRoute[vertexIndex];
        const previousTarget = steeringRoute[vertexIndex - 1];
        const deltaX = steeringTarget[0] - previousTarget[0];
        const deltaZ = steeringTarget[1] - previousTarget[1];
        const length = Math.hypot(deltaX, deltaZ);
        const directionX = deltaX / length;
        const directionZ = deltaZ / length;
        const targetDistance = distanceTo(position, target);
        const passed =
          (position[0] - steeringTarget[0]) * directionX +
            (position[2] - steeringTarget[1]) * directionZ >
          0;
        const frameStep = Math.hypot(
          position[0] - previousPosition[0],
          position[2] - previousPosition[2]
        );
        previousPosition = position;
        const progressDistance = Math.hypot(
          position[0] - progressAnchor[0],
          position[2] - progressAnchor[2]
        );
        if (progressDistance >= 0.05) {
          progressAnchor = position;
          progressStartedAt = performance.now();
          stalledRefreshes = 0;
        }

        if (
          targetDistance > tolerance * 2 &&
          performance.now() - progressStartedAt >= 2_000
        ) {
          if (stalledRefreshes >= 3) {
            throw new Error(
              `continuous route made no progress at ${position.join(",")}; ` +
                `target=${target.join(",")}; ` +
                `cameraYaw=${renderer.dataset.cameraYaw}; ` +
                `heading=${renderer.dataset.playerHeading}; ` +
                `region=${renderer.dataset.navigationRegion}; ` +
                readRuntimeState()
            );
          }
          await keyTransition({ up: ["w"] });
          await keyTransition({ down: ["w"] });
          diagnostics.inputRefreshCount += 1;
          stalledRefreshes += 1;
          progressAnchor = readPosition();
          previousPosition = progressAnchor;
          progressStartedAt = performance.now();
          continue;
        }

        // Drop out of the run before the arrival window, not a fixed 0.75 units
        // before it. A run step is wider than the arrival tolerance, so a vertex
        // sampled at running pace can be jumped clean over; walking the last bit
        // puts a sample inside it. The lead is three run steps -- the release
        // goes out over a binding round trip, so it can miss a frame or two
        // before it takes effect -- plus one walked step, all measured from the
        // frame time this run is getting. The constant it replaced was sized
        // when a walk was 1.61 units a second and a run 1.9, where the two paces
        // cost nearly the same; at 3 and 7 it spent two seconds of a
        // seventeen-second run crawling, which is 11% of the route on its own.
        const brakeRadius = Math.max(
          tolerance * 2,
          predictedStep(nominalSpeed) * 3 + predictedStep(brakedSpeed)
        );
        if (runActive && targetDistance <= brakeRadius && !passed) {
          await keyTransition({ up: ["Shift"] });
          runActive = false;
        }

        const steeringAdjustedZ =
          Math.abs(steeringTarget[1] - target[1]) >
          Number.EPSILON;
        const insideRequiredSteeringZ =
          !steeringAdjustedZ ||
          position[2] >= target[1] - tolerance;
        if (
          targetDistance <= tolerance &&
          insideRequiredSteeringZ
        ) {
          const vertexPauseStartedAt = performance.now();
          const latchedVertexIndex = vertexIndex;
          vertexIndex += 1;
          if (vertexIndex >= route.length) {
            await keyTransition({ up: ["w"] });
            if (runRequested) {
              await keyTransition({ up: ["Shift"] });
            }
            await nextFrame();
            assertSafety();
            let finalPosition = readPosition();
            if (distanceTo(finalPosition, target) > tolerance) {
              await correctToTarget(target);
              await nextFrame();
              assertSafety();
              finalPosition = readPosition();
              if (distanceTo(finalPosition, target) > tolerance) {
                throw new Error(
                  `trusted final correction missed vertex ` +
                    `${latchedVertexIndex}: stopped=${finalPosition.join(",")}; ` +
                    `target=${target.join(",")}; ` +
                    `detected=${position.join(",")}; ` +
                    `distance=${targetDistance}`
                );
              }
            }
            vertexSnapshots.push(readSnapshot(latchedVertexIndex));
            const finishedAt = performance.now();
            diagnostics.vertexPauseMs +=
              performance.now() - vertexPauseStartedAt;
            return {
              firstKeydownAt: startedAt,
              finishedAt,
              vertexSnapshots,
              diagnostics
            };
          }

          const nextTarget = steeringRoute[vertexIndex];
          const currentYaw = Number(renderer.dataset.cameraYaw);
          const predictedTurnOriginX =
            position[0] + (directionX * frameStep) / 2;
          const predictedTurnOriginZ =
            position[2] + (directionZ * frameStep) / 2;
          const targetYaw = Math.atan2(
            nextTarget[0] - predictedTurnOriginX,
            nextTarget[1] - predictedTurnOriginZ
          );
          if (![currentYaw, targetYaw].every(Number.isFinite)) {
            throw new Error("camera yaw is invalid before route turn");
          }
          const turnStartedAt = performance.now();
          const turnResult = await performTransition({
            kind: "turn",
            currentYaw,
            detectedPositionRaw:
              renderer.dataset.playerPosition ?? "",
            minimumZ: steeringAdjustedZ
              ? target[1] - tolerance
              : undefined,
            target: [target[0], target[1]],
            targetYaw,
            tolerance,
            pointerMoveLimit: maximumStroke
          });
          diagnostics.rotationMs +=
            performance.now() - turnStartedAt;
          assertSafety();
          if (!turnResult) {
            throw new Error(
              `route turn did not return vertex ${latchedVertexIndex}`
            );
          }
          diagnostics.turnKeyUpMs += turnResult.timings.keyUpMs;
          diagnostics.turnCaptureMs += turnResult.timings.captureMs;
          diagnostics.turnPointerMs += turnResult.timings.pointerMs;
          diagnostics.turnKeyDownMs += turnResult.timings.keyDownMs;
          if (Number.isFinite(turnResult.pointerX)) {
            pointerX = turnResult.pointerX;
          }
          if (!turnResult.resumed) {
            throw new Error(
              `trusted keyup missed vertex ${latchedVertexIndex}: ` +
                `target=${target.join(",")}; ` +
                `detected=${position.join(",")}; ` +
                `distance=${targetDistance}`
            );
          } else {
            const arrivalPosition = parseTriple(
              turnResult.arrivalPositionRaw,
              "arrival position"
            );
            if (distanceTo(arrivalPosition, target) > tolerance) {
              throw new Error(
                `route turn resumed outside vertex ${latchedVertexIndex}: ` +
                  `${arrivalPosition.join(",")}`
              );
            }
            vertexSnapshots.push(
              readSnapshot(
                latchedVertexIndex,
                turnResult.arrivalPositionRaw
              )
            );
            pendingTargetYaw = turnResult.targetYaw;
            if (runRequested && !runActive) {
              await keyTransition({ down: ["Shift"] });
              runActive = true;
            }
          }
          diagnostics.vertexPauseMs +=
            performance.now() - vertexPauseStartedAt;
          previousPosition = readPosition();
          progressAnchor = previousPosition;
          progressStartedAt = performance.now();
          stalledRefreshes = 0;
          continue;
        }

        if (passed) {
          const correctionStartedAt = performance.now();
          const latchedVertexIndex = vertexIndex;
          await keyTransition({
            up: runRequested ? ["w", "Shift"] : ["w"]
          });
          await correctToTarget(target);
          await nextFrame();
          assertSafety();
          const correctedPosition = readPosition();
          if (distanceTo(correctedPosition, target) > tolerance) {
            throw new Error(
              `continuous route correction missed vertex ` +
                `${latchedVertexIndex}: stopped=${correctedPosition.join(",")}; ` +
                `target=${target.join(",")}; detected=${position.join(",")}; ` +
                `distance=${targetDistance}`
            );
          }
          vertexSnapshots.push(readSnapshot(latchedVertexIndex));
          vertexIndex += 1;
          diagnostics.vertexPauseMs +=
            performance.now() - correctionStartedAt;
          if (vertexIndex >= route.length) {
            const finishedAt = performance.now();
            return {
              firstKeydownAt: startedAt,
              finishedAt,
              vertexSnapshots,
              diagnostics
            };
          }
          const nextTarget = steeringRoute[vertexIndex];
          await rotateToYaw(
            Math.atan2(
              nextTarget[0] - correctedPosition[0],
              nextTarget[1] - correctedPosition[2]
            )
          );
          await keyTransition({
            down: runRequested ? ["Shift", "w"] : ["w"]
          });
          runActive = runRequested;
          previousPosition = readPosition();
          progressAnchor = previousPosition;
          progressStartedAt = performance.now();
          stalledRefreshes = 0;
          continue;
        }

        if (performance.now() >= deadline) {
          throw new Error(
            `continuous route timed out at ${position.join(",")}; ` +
              `target=${target.join(",")}; ` +
              `steeringTarget=${steeringTarget.join(",")}; ` +
              `cameraYaw=${renderer.dataset.cameraYaw}; ` +
              `heading=${renderer.dataset.playerHeading}; ` +
              `region=${renderer.dataset.navigationRegion}; ` +
              readRuntimeState()
          );
        }
      }
      throw new Error("continuous route exited without a final arrival");
    },
    {
      route,
      steeringRoute,
      runRequested,
      tolerance,
      maximumStroke: 500,
      // Computed here, not in the page: an evaluate callback is stringified
      // and sent across, so a module import is not in scope inside it. Read
      // from the runtime so a pace change carries into the driver's deadline
      // and into how early it stops running at a vertex.
      nominalSpeed: runRequested ? WORLD_RUN_SPEED : WORLD_WALK_SPEED,
      brakedSpeed: WORLD_WALK_SPEED
    }
    );
  } finally {
    await stopTrustedRoutePointerDrag(page);
  }
}

export async function driveWithKeyboardToPoint(
  page: Page,
  target: readonly [number, number],
  {
    runRequested = false,
    tolerance = 0.05,
    timeoutMs = 30_000,
    navigationRegions = [],
    zones = [],
    requireCameraFacing = true,
    onFirstKeydown
  }: {
    runRequested?: boolean;
    tolerance?: number;
    timeoutMs?: number;
    navigationRegions?: string[];
    zones?: string[];
    requireCameraFacing?: boolean;
    onFirstKeydown?: () => Promise<void>;
  } = {}
) {
  await ensureTrustedRouteStopBinding(page);
  const deadline = Date.now() + timeoutMs;
  // What one frame of travel is worth at the pace being driven, used only until
  // a real step has been measured. Written as speed x frame time so a pace
  // change carries into it; the literal it replaced was sized for a 1.61 unit a
  // second walk and predicted a step four times too long at the current pace,
  // which made the approach brake far earlier than it needed to.
  const nominalFrameSeconds = 1 / 60;
  const nominalStep =
    (runRequested ? WORLD_RUN_SPEED : WORLD_WALK_SPEED) * nominalFrameSeconds;
  const recentSteps: number[] = [];
  let mirrorSign: -1 | 1 = 1;
  let pendingFirstKeydown = onFirstKeydown;
  const markFirstKeydown = async () => {
    if (!pendingFirstKeydown) return;
    const mark = pendingFirstKeydown;
    pendingFirstKeydown = undefined;
    await mark();
  };
  const advanceOneObservedFrame = async (
    keys: readonly ("a" | "d" | "s" | "w")[],
    initial: WorldTelemetry
  ) => {
    await markFirstKeydown();
    const moved = await runBalancedRpgRouteKeyboardPulse({
      keys,
      keyDown: (key) => trustedRouteKeyDown(page, key),
      keyUp: (key) => trustedRouteKeyUp(page, key),
      observe: () =>
        page.evaluate(
        ({ previousPosition, keys }) =>
          new Promise<boolean>((resolve, reject) => {
            const stopTrustedKeys = (
              window as typeof window & {
                __rpgStopTrustedKeys: (
                  keys: readonly string[]
                ) => Promise<void>;
              }
            ).__rpgStopTrustedKeys;
            let stopping = false;
            const release = () => {
              if (stopping) return;
              stopping = true;
              void stopTrustedKeys(keys).then(
                () => resolve(true),
                reject
              );
            };
            let frames = 0;
            const sample = () => {
              const current =
                document.querySelector<HTMLElement>(
                  ".seamless-world-renderer"
                )?.dataset.playerPosition ?? "";
              if (current !== previousPosition) {
                release();
                return;
              }
              frames += 1;
              if (frames >= 2) {
                if (stopping) return;
                stopping = true;
                void stopTrustedKeys(keys).then(
                  () => resolve(false),
                  reject
                );
                return;
              }
              requestAnimationFrame(sample);
            };
            const current =
              document.querySelector<HTMLElement>(
                ".seamless-world-renderer"
              )?.dataset.playerPosition ?? "";
            if (current !== previousPosition) {
              release();
              return;
            }
            requestAnimationFrame(sample);
          }),
        { previousPosition: initial.positionRaw, keys }
        )
    });
    const telemetry = await readWorldTelemetry(page, {
      requireFacing: requireCameraFacing
    });
    if (!moved || telemetry.positionRaw === initial.positionRaw) {
      return null;
    }
    const step = Math.hypot(
      telemetry.position[0] - initial.position[0],
      telemetry.position[2] - initial.position[2]
    );
    recentSteps.push(step);
    if (recentSteps.length > 3) recentSteps.shift();
    return telemetry;
  };
  for (let attempt = 0; attempt < 48; attempt += 1) {
    if (Date.now() >= deadline) break;
    const initial = await readWorldTelemetry(page, {
      requireFacing: requireCameraFacing
    });
    const deltaX = target[0] - initial.position[0];
    const deltaZ = target[1] - initial.position[2];
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance <= tolerance) {
      recordTelemetryState(initial, navigationRegions, zones);
      return initial;
    }
    const directionX = deltaX / distance;
    const directionZ = deltaZ / distance;
    const directYaw = Math.atan2(directionX, directionZ);
    const brakeRadius = getRpgRouteBrakeRadius(recentSteps);
    if (recentSteps.length > 0 && distance <= brakeRadius) {
      const predictedStep = medianRpgRoutePulse(recentSteps, nominalStep);
      const plan = planRpgRoutePulse({
        distance,
        predictedStep,
        tolerance,
        directYaw,
        mirrorSign
      });
      mirrorSign = mirrorSign === 1 ? -1 : 1;
      const currentCameraYaw = await readCameraYaw(page);
      if (!Number.isFinite(currentCameraYaw)) {
        throw new Error("data-camera-yaw is missing or non-finite");
      }
      // The visitor travels along the way they face, so each candidate bearing
      // is turned toward and then stepped along. Pressing a sideways key here
      // would swing them rather than nudge them off the line.
      let advanced = false;
      for (const candidateYaw of plan.candidates) {
        await rotateCameraToYaw(page, candidateYaw);
        if (await advanceOneObservedFrame(["w"], initial)) {
          advanced = true;
          break;
        }
      }
      if (!advanced) {
        throw new Error(
          `keyboard pulse candidates were blocked at ${initial.positionRaw}; ` +
            `target=${target.join(",")} cameraYaw=${currentCameraYaw}`
        );
      }
      continue;
    }
    await rotateCameraToYaw(page, directYaw);
    await markFirstKeydown();
    if (runRequested) await trustedRouteKeyDown(page, "Shift");
    await trustedRouteKeyDown(page, "w");
    let outcome: unknown;
    try {
      const cruiseResult = await page.evaluate(
        async ({
          x,
          z,
          acceptedDistance,
          directionX,
          directionZ,
          stall,
          runRequested,
          timeoutMs
        }) => {
          const stopTrustedKeys = (
            window as typeof window & {
              __rpgStopTrustedKeys: (
                keys: readonly string[]
              ) => Promise<void>;
            }
          ).__rpgStopTrustedKeys;
          const stop = async <T,>(value: T) => {
            await stopTrustedKeys(
              runRequested ? ["w", "Shift"] : ["w"]
            );
            return value;
          };
          const timeoutAt = performance.now() + timeoutMs;
          for (;;) {
            const renderer = document.querySelector<HTMLElement>(
              ".seamless-world-renderer"
            );
            if (!renderer) throw new Error("world renderer is missing");
            const position = (renderer.dataset.playerPosition ?? "")
              .split(",")
              .map(Number);
            const boom = Number(renderer.dataset.cameraBoom);
            const violation = Number(
              renderer.dataset.cameraSafeViolationMs
            );
            if (!Number.isFinite(boom) || boom < 2.6) {
              throw new Error(`unsafe camera boom: ${boom}`);
            }
            if (!Number.isFinite(violation) || violation > 250) {
              throw new Error(
                `camera safe-area violation: ${violation}; ` +
                  `position=${position.join(",")}; ` +
                  `yaw=${renderer.dataset.cameraYaw}; ` +
                  `pitch=${renderer.dataset.cameraPitch}; ` +
                  `boom=${renderer.dataset.cameraBoom}; ` +
                  `facing=${renderer.dataset.cameraFacingDot}; ` +
                  `collision=${renderer.dataset.cameraCollisionAdjustment}; ` +
                  `lateral=${renderer.dataset.cameraLateralCollisionEscape}; ` +
                  `transitionFallback=${renderer.dataset.cameraTransitionCollisionFallback}; ` +
                  `finalFallback=${renderer.dataset.cameraFinalCollisionFallback}; ` +
                  `correction=${renderer.dataset.cameraSafetyCorrection}; ` +
                  `offset=${renderer.dataset.cameraSafetyOffset}; ` +
                  `region=${renderer.dataset.navigationRegion}`
              );
            }
            if (renderer.dataset.cameraDiagnostic !== "ok") {
              throw new Error(
                `camera diagnostic failed: ${renderer.dataset.cameraDiagnostic}`
              );
            }
            if (
              position.length === 3 &&
              position.every(Number.isFinite)
            ) {
              const positionRaw = position.join(",");
              const step = Math.hypot(
                position[0] - stall.previousX,
                position[2] - stall.previousZ
              );
              if (step > Number.EPSILON) {
                stall.recentSteps.push(step);
                if (stall.recentSteps.length > 3) {
                  stall.recentSteps.shift();
                }
              }
              stall.previousX = position[0];
              stall.previousZ = position[2];
              if (positionRaw === stall.position) {
                stall.unchangedFrames += 1;
                if (stall.unchangedFrames >= stall.limit) {
                  return stop({
                    outcome: "stalled" as const,
                    recentSteps: stall.recentSteps
                  });
                }
              } else {
                stall.position = positionRaw;
                stall.unchangedFrames = 0;
              }
              const remainingX = position[0] - x;
              const remainingZ = position[2] - z;
              if (
                Math.hypot(remainingX, remainingZ) <= acceptedDistance
              ) {
                return stop({
                  outcome: "near" as const,
                  recentSteps: stall.recentSteps
                });
              }
              if (
                remainingX * directionX + remainingZ * directionZ > 0
              ) {
                return stop({
                outcome: "passed" as const,
                recentSteps: stall.recentSteps
                });
              }
            }
            if (performance.now() >= timeoutAt) {
              throw new Error("keyboard cruise timed out");
            }
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => resolve())
            );
          }
        },
        {
          x: target[0],
          z: target[1],
          acceptedDistance: tolerance,
          directionX,
          directionZ,
          stall: {
            position: initial.positionRaw,
            unchangedFrames: 0,
            limit: RPG_ROUTE_STALL_FRAME_LIMIT,
            previousX: initial.position[0],
            previousZ: initial.position[2],
            recentSteps: [] as number[]
          },
          runRequested,
          timeoutMs: Math.max(1, deadline - Date.now())
        }
      );
      outcome = cruiseResult.outcome;
      const feedback = mergeRpgRoutePulseFeedback(
        recentSteps,
        cruiseResult.recentSteps
      );
      recentSteps.splice(0, recentSteps.length, ...feedback);
    } catch (error) {
      if (Date.now() < deadline) throw error;
    } finally {
      await trustedRouteKeyUp(page, "w");
      if (runRequested) await trustedRouteKeyUp(page, "Shift");
    }
    if (outcome === "near") {
      const arrived = await readWorldTelemetry(page, {
        requireFacing: requireCameraFacing
      });
      if (
        Math.hypot(
          arrived.position[0] - target[0],
          arrived.position[2] - target[1]
        ) <= tolerance
      ) {
        recordTelemetryState(arrived, navigationRegions, zones);
        return arrived;
      }
    } else if (recentSteps.length === 0) {
      recentSteps.push(nominalStep);
    }
    if (Date.now() >= deadline) break;
  }
  let current: WorldTelemetry;
  try {
    current = await readWorldTelemetry(page, {
      requireFacing: requireCameraFacing
    });
  } catch (error) {
    throw new Error(
      `keyboard route failed before target=${target.join(",")}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  throw new Error(
    `keyboard route timed out at ${current.positionRaw}; target=${target.join(",")}`
  );
}

export async function driveForwardToPoint(
  page: Page,
  target: readonly [number, number],
  headingYaw: number,
  {
    tolerance = RPG_CANONICAL_ROUTE_TOLERANCE,
    timeoutMs = 5_000,
    requireCameraFacing = true
  }: {
    tolerance?: number;
    timeoutMs?: number;
    requireCameraFacing?: boolean;
  } = {}
) {
  await ensureTrustedRouteStopBinding(page);
  await rotateCameraToYaw(page, headingYaw);
  await trustedRouteKeyDown(page, "w");
  try {
    await page.evaluate(
      async ({ x, z, headingYaw, tolerance, timeoutMs }) => {
        const stopTrustedKeys = (
          window as typeof window & {
            __rpgStopTrustedKeys: (
              keys: readonly string[]
            ) => Promise<void>;
          }
        ).__rpgStopTrustedKeys;
        const renderer = document.querySelector<HTMLElement>(
          ".seamless-world-renderer"
        );
        if (!renderer) throw new Error("world renderer is missing");
        const directionX = Math.sin(headingYaw);
        const directionZ = Math.cos(headingYaw);
        const deadline = performance.now() + timeoutMs;

        for (;;) {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
          );
          const position = (renderer.dataset.playerPosition ?? "")
            .split(",")
            .map(Number);
          const boom = Number(renderer.dataset.cameraBoom);
          const violation = Number(
            renderer.dataset.cameraSafeViolationMs
          );
          if (
            position.length !== 3 ||
            !position.every(Number.isFinite)
          ) {
            throw new Error("player position is missing or non-finite");
          }
          if (!Number.isFinite(boom) || boom < 2.6) {
            throw new Error(`unsafe camera boom: ${boom}`);
          }
          if (!Number.isFinite(violation) || violation > 250) {
            throw new Error(
              `camera safe-area violation: ${violation}`
            );
          }
          if (renderer.dataset.cameraDiagnostic !== "ok") {
            throw new Error(
              `camera diagnostic failed: ` +
                `${renderer.dataset.cameraDiagnostic}`
            );
          }

          const distance = Math.hypot(
            position[0] - x,
            position[2] - z
          );
          if (distance <= tolerance) {
            await stopTrustedKeys(["w"]);
            return;
          }
          const passed =
            (position[0] - x) * directionX +
              (position[2] - z) * directionZ >
            0;
          if (passed) {
            await stopTrustedKeys(["w"]);
            throw new Error(
              `straight keyboard drive passed ${x},${z}: ` +
                `${position.join(",")}`
            );
          }
          if (performance.now() >= deadline) {
            await stopTrustedKeys(["w"]);
            throw new Error(
              `straight keyboard drive timed out at ` +
                `${position.join(",")}`
            );
          }
        }
      },
      {
        x: target[0],
        z: target[1],
        headingYaw,
        tolerance,
        timeoutMs
      }
    );
  } finally {
    await trustedRouteKeyUp(page, "w");
  }
  return readWorldTelemetry(page, {
    requireFacing: requireCameraFacing
  });
}

export async function driveCanonicalRoute(
  page: Page,
  {
    runRequested,
    requireMapObservation = true,
    onPrepared
  }: {
    runRequested: boolean;
    requireMapObservation?: boolean;
    onPrepared?: () => Promise<void>;
  }
): Promise<CanonicalRouteResult> {
  const arrivals = {} as Record<
    (typeof EXPECTED_ZONE_ORDER)[number],
    {
      position: readonly [number, number, number];
      heading: readonly [number, number, number];
      revision: string;
    }
  >;
  let routeObservationActive = false;
  let trustObservationActive = false;
  let observation:
    | Awaited<ReturnType<typeof stopRouteObservation>>
    | undefined;
  let keyboardTrust:
    | Awaited<ReturnType<typeof stopMovementTrustObservation>>
    | undefined;
  await startMovementTrustObservation(page);
  trustObservationActive = true;
  await startRouteObservation(page, { requireMapObservation });
  routeObservationActive = true;
  let continuous:
    | Awaited<ReturnType<typeof driveContinuousTrustedRoute>>
    | undefined;
  try {
    continuous = await driveContinuousTrustedRoute(
      page,
      RPG_CANONICAL_ROUTE,
      {
        runRequested,
        steeringRoute: RPG_CANONICAL_ROUTE_STEERING,
        tolerance: RPG_CANONICAL_ROUTE_TOLERANCE,
        onPrepared
      }
    );
    observation = await stopRouteObservation(page);
    routeObservationActive = false;
    keyboardTrust = await stopMovementTrustObservation(page);
    trustObservationActive = false;
    for (const snapshot of continuous.vertexSnapshots) {
      const zone = snapshot.zone as (typeof EXPECTED_ZONE_ORDER)[number];
      if (EXPECTED_ZONE_ORDER.includes(zone) && !arrivals[zone]) {
        arrivals[zone] = {
          position: snapshot.position,
          heading: snapshot.heading,
          revision: snapshot.revision
        };
      }
    }
  } finally {
    await releaseAllTrustedRouteKeys(page).catch(() => undefined);
    if (routeObservationActive) {
      observation = await stopRouteObservation(page).catch(() => undefined);
    }
    if (trustObservationActive) {
      keyboardTrust = await stopMovementTrustObservation(page).catch(
        () => undefined
      );
    }
  }
  expect(continuous).toBeDefined();
  expect(observation).toBeDefined();
  expect(observation!.safetyFailure).toBeNull();
  expect(observation!.minimumBoom).toBeGreaterThanOrEqual(2.6);
  expect(observation!.maximumViolationMs).toBeLessThanOrEqual(250);
  if (requireMapObservation) {
    expect(observation!.mapUpdateFailure).toBeNull();
    expect(observation!.mapUpdateCount).toBeGreaterThan(0);
    expect(observation!.maximumMapUpdateLatencyMs).toBeLessThanOrEqual(100);
    expect(observation!.averageMapUpdateIntervalMs).toBeLessThanOrEqual(100);
    expect(observation!.maximumMapUpdateGapMs).toBeLessThanOrEqual(100);
    expect(observation!.firstMovementMapUpdateDelayMs).toBeLessThanOrEqual(
      100
    );
    expect(observation!.lastMapUpdateAgeMs).toBeLessThanOrEqual(100);
  }
  expect(observation!.zones).toEqual(EXPECTED_ZONE_ORDER);
  expect(observation!.minimumRafIntervalMs).toBeGreaterThan(0);
  expect(observation!.maximumRafIntervalMs).toBeGreaterThan(
    observation!.minimumRafIntervalMs
  );
  expect(keyboardTrust).toBeDefined();
  expect(keyboardTrust!.untrustedCount).toBe(0);
  expect(keyboardTrust!.untrustedPointerCount).toBe(0);
  expect(keyboardTrust!.keydownCount).toBeGreaterThan(0);
  expect(keyboardTrust!.keyupCount).toBe(keyboardTrust!.keydownCount);
  expect(keyboardTrust!.pointerDownCount).toBeGreaterThan(0);
  expect(keyboardTrust!.pointerUpCount).toBe(
    keyboardTrust!.pointerDownCount
  );
  expect(keyboardTrust!.pointerMoveCount).toBeGreaterThan(0);
  expect(keyboardTrust!.maximumPointerStrokePixels).toBeLessThanOrEqual(
    140.001
  );
  expect(routePressedKeys.get(page)?.size ?? 0).toBe(0);
  expect(continuous!.vertexSnapshots).toHaveLength(
    RPG_CANONICAL_ROUTE.length - 1
  );
  expect(
    continuous!.diagnostics.inputRefreshCount,
    "canonical route must not recover a dropped movement input"
  ).toBe(0);
  expect(
    continuous!.diagnostics.correctionCount,
    "canonical route must reach every vertex without corrective movement"
  ).toBe(0);
  for (const snapshot of continuous!.vertexSnapshots) {
    const canonical = RPG_CANONICAL_ROUTE[snapshot.vertexIndex];
    expect(
      Math.hypot(
        snapshot.position[0] - canonical[0],
        snapshot.position[2] - canonical[1]
      ),
      `canonical vertex ${snapshot.vertexIndex}`
    ).toBeLessThanOrEqual(RPG_CANONICAL_ROUTE_TOLERANCE);
  }
  for (const zone of EXPECTED_ZONE_ORDER) {
    if (!arrivals[zone]) {
      throw new Error(`canonical route did not record ${zone} arrival`);
    }
  }
  const traversalMs =
    continuous!.finishedAt - continuous!.firstKeydownAt;
  if (process.env.RPG_ROUTE_DEBUG === "1") {
    console.log(
      "RPG_ROUTE_DEBUG",
      JSON.stringify({
        traversalMs,
        minimumRafIntervalMs: observation!.minimumRafIntervalMs,
        maximumRafIntervalMs: observation!.maximumRafIntervalMs,
        vertexCount: continuous!.vertexSnapshots.length,
        diagnostics: continuous!.diagnostics
      })
    );
  }
  return {
    firstKeydownAt: continuous!.firstKeydownAt,
    finishedAt: continuous!.finishedAt,
    traversalMs,
    navigationRegions: observation!.navigationRegions,
    zones: observation!.zones,
    keyboardTrust: keyboardTrust!,
    rafTiming: {
      minimumIntervalMs: observation!.minimumRafIntervalMs,
      maximumIntervalMs: observation!.maximumRafIntervalMs
    },
    arrivals
  };
}

export async function dragCamera(
  page: Page,
  deltaX: number,
  deltaY: number
) {
  const input: Locator = page.locator(CAMERA_INPUT_SELECTOR);
  const bounds = await input.boundingBox();
  if (!bounds) throw new Error("camera input bounds are unavailable");
  const x = bounds.x + bounds.width * 0.65;
  const y = bounds.y + bounds.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 4 });
  await page.mouse.up();
}
