import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  expect,
  test,
  type Browser,
  type Page
} from "@playwright/test";

const PREFLIGHT = process.env.ARCHITECTURE_PREFLIGHT === "1";
const STRICT_EVIDENCE = process.env.ARCHITECTURE_STRICT_EVIDENCE === "1";
const BASE_URL =
  process.env.ARCHITECTURE_BASE_URL ?? "http://127.0.0.1:4180";
const EVIDENCE_DIRECTORY = resolve(
  process.env.ARCHITECTURE_EVIDENCE_DIR ??
    (PREFLIGHT
      ? `test-results/visual-fidelity/preflight/${new Date()
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}Z$/, "Z")}-${process.pid}`
      : "test-results/visual-fidelity/unmanaged")
);
const DESKTOP_DIRECTORY = join(EVIDENCE_DIRECTORY, "desktop");
const MOBILE_DIRECTORY = join(EVIDENCE_DIRECTORY, "mobile");
const APPROVED_SOURCE = "/assets/world/world-environment-concept.png";
const REFERENCE_IMAGE = { width: 1817, height: 866 } as const;
const AUTHORIZED_PATH_COUNT = 39;
const DESKTOP_VIEWPORT = { width: 1440, height: 900 } as const;
const MOBILE_VIEWPORT = { width: 390, height: 844 } as const;
const DESKTOP_ROWS = [
  "start",
  "selection-male",
  "selection-female",
  "world-male",
  "world-female",
  "zone-airport",
  "zone-tokyo",
  "zone-gyukatsu",
  "zone-sakura",
  "zone-hanabi",
  "mini-map",
  "full-map"
] as const;
const MOBILE_ROWS = [
  "start",
  "selection-female",
  "world-female",
  "expanded-mini-map",
  "full-map"
] as const;
const PREFLIGHT_ROWS = [
  "zone-airport",
  "zone-hanabi",
  "world-female",
  "full-map"
] as const;
const ZONE_FOOT_TARGETS = {
  airport: { x: [450, 460], y: [615, 625], height: [144, 144] },
  tokyo: { x: [740, 780], y: [440, 470], height: [120, 135] },
  gyukatsu: { x: [1005, 1065], y: [595, 625], height: [130, 145] },
  sakura: { x: [1235, 1285], y: [580, 610], height: [135, 150] },
  hanabi: { x: [1565, 1575], y: [635, 645], height: [128, 128] }
} as const;

const references = {
  start: ["docs/assets/start-character-selection-concept.png"],
  "selection-male": ["public/assets/characters/player-male.png"],
  "selection-female": ["public/assets/characters/player-female.png"],
  "world-male": [
    "public/assets/characters/player-male.png",
    "public/assets/world/world-environment-concept.png"
  ],
  "world-female": [
    "public/assets/characters/player-female.png",
    "public/assets/world/world-environment-concept.png"
  ],
  "zone-airport": [
    "public/assets/world/world-environment-concept.png",
    "docs/assets/airport-coach-motion-storyboard.png"
  ],
  "zone-tokyo": [
    "public/assets/world/world-environment-concept.png",
    "docs/assets/tokyo-city-sakura-concept.png"
  ],
  "zone-gyukatsu": [
    "public/assets/world/world-environment-concept.png",
    "docs/assets/gyukatsu-ambient-interaction-storyboard.png"
  ],
  "zone-sakura": [
    "public/assets/world/world-environment-concept.png",
    "docs/assets/sakura-canal-promenade-concept.png"
  ],
  "zone-hanabi": [
    "public/assets/world/world-environment-concept.png",
    "docs/assets/world-time-hanabi-concept.png"
  ],
  "mini-map": ["public/assets/world/world-environment-concept.png"],
  "full-map": ["public/assets/world/world-environment-concept.png"]
} as const;

type Character = "male" | "female";
type DesktopRowId = (typeof DESKTOP_ROWS)[number];
type MobileRowId = (typeof MOBILE_ROWS)[number];
type RuntimeAssetMeasurement = {
  asset: string;
  naturalWidth: number;
  naturalHeight: number;
};
type ApprovedSourceDomMeasurement = {
  backdropSource: string | null;
  backdropComplete: boolean;
  backdropNaturalWidth: number;
  backdropNaturalHeight: number;
  foregroundSource: string | null;
  foregroundComplete: boolean;
  foregroundNaturalWidth: number;
  foregroundNaturalHeight: number;
};
type RequestLedgerIdentity =
  | "desktop-male"
  | "desktop-female"
  | "mobile-female";
type RequestLedger = {
  identity: RequestLedgerIdentity;
  profile: "desktop" | "mobile";
  viewport: { width: number; height: number };
  character: Character;
  requests: string[];
  runtimeAssets: string[];
  approvedSourceRequests: string[];
  approvedSourceDom: ApprovedSourceDomMeasurement;
  runtimeAssetMeasurements: RuntimeAssetMeasurement[];
  errors: string[];
};

const numbers = (value: string | null | undefined) =>
  (value ?? "").split(",").filter(Boolean).map(Number);

async function snapshotEvidenceFiles(paths: readonly string[]) {
  return Promise.all(
    paths.map(async (path) => {
      const absolutePath = join(EVIDENCE_DIRECTORY, path);
      const metadata = await stat(absolutePath);
      return {
        path,
        sha256: createHash("sha256")
          .update(await readFile(absolutePath))
          .digest("hex"),
        size: metadata.size,
        mtimeMs: metadata.mtimeMs
      };
    })
  );
}

type OcclusionPoint = readonly [number, number];
type OcclusionPolygon = readonly OcclusionPoint[];
type OcclusionFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};
type OcclusionHelpers = {
  parseNormalizedPolygons: typeof parseNormalizedPolygons;
  parseSourcePolygons: typeof parseSourcePolygons;
  polygonPointBounds: typeof polygonPointBounds;
  provePolygonEquivalence: typeof provePolygonEquivalence;
  playerPixelCenterCoordinates: typeof playerPixelCenterCoordinates;
  pointInPolygonUnion: typeof pointInPolygonUnion;
};

function parseNormalizedPolygons(value: unknown): OcclusionPolygon[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Normalized foreground polygons are missing.");
  }
  return value.map((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      throw new Error(
        `Normalized foreground polygon ${polygonIndex} has fewer than three points.`
      );
    }
    return polygon.map((point, pointIndex) => {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        !point.every(
          (coordinate) =>
            typeof coordinate === "number" &&
            Number.isFinite(coordinate) &&
            coordinate >= 0 &&
            coordinate <= 1
        )
      ) {
        throw new Error(
          `Normalized foreground point ${polygonIndex}:${pointIndex} is invalid.`
        );
      }
      return [point[0], point[1]] as const;
    });
  });
}

function parseSourcePolygons(value: unknown): OcclusionPolygon[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Source foreground polygons are missing.");
  }
  return value.map((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || polygon.length < 3) {
      throw new Error(
        `Source foreground polygon ${polygonIndex} has fewer than three points.`
      );
    }
    return polygon.map((point, pointIndex) => {
      if (
        !Array.isArray(point) ||
        point.length !== 2 ||
        typeof point[0] !== "number" ||
        typeof point[1] !== "number" ||
        !Number.isFinite(point[0]) ||
        !Number.isFinite(point[1]) ||
        point[0] < 0 ||
        point[0] > 1817 ||
        point[1] < 0 ||
        point[1] > 866
      ) {
        throw new Error(
          `Source foreground point ${polygonIndex}:${pointIndex} is invalid.`
        );
      }
      return [point[0], point[1]] as const;
    });
  });
}

function polygonPointBounds(polygons: readonly OcclusionPolygon[]) {
  const points = polygons.flat();
  return {
    minimumX: Math.min(...points.map(([x]) => x)),
    minimumY: Math.min(...points.map(([, y]) => y)),
    maximumX: Math.max(...points.map(([x]) => x)),
    maximumY: Math.max(...points.map(([, y]) => y))
  };
}

function provePolygonEquivalence(
  normalizedPolygons: readonly OcclusionPolygon[],
  sourcePolygons: readonly OcclusionPolygon[]
) {
  if (normalizedPolygons.length !== sourcePolygons.length) {
    throw new Error("Normalized/source polygon count mismatch.");
  }
  let pointCount = 0;
  for (
    let polygonIndex = 0;
    polygonIndex < normalizedPolygons.length;
    polygonIndex += 1
  ) {
    const normalizedPolygon = normalizedPolygons[polygonIndex];
    const sourcePolygon = sourcePolygons[polygonIndex];
    if (normalizedPolygon.length !== sourcePolygon.length) {
      throw new Error(
        `Normalized/source point count mismatch at polygon ${polygonIndex}.`
      );
    }
    for (
      let pointIndex = 0;
      pointIndex < normalizedPolygon.length;
      pointIndex += 1
    ) {
      const [normalizedX, normalizedY] = normalizedPolygon[pointIndex];
      const [sourceX, sourceY] = sourcePolygon[pointIndex];
      if (normalizedX !== sourceX / 1817) {
        throw new Error(
          `normalizedX !== sourceX / 1817 at ${polygonIndex}:${pointIndex}.`
        );
      }
      if (normalizedY !== sourceY / 866) {
        throw new Error(
          `normalizedY !== sourceY / 866 at ${polygonIndex}:${pointIndex}.`
        );
      }
      pointCount += 1;
    }
  }
  return {
    passed: true,
    equivalenceTolerance: 0,
    polygonCount: normalizedPolygons.length,
    pointCount
  } as const;
}

function playerPixelCenterCoordinates({
  column,
  row,
  deviceScale,
  safeFrame,
  imageFrame
}: {
  column: number;
  row: number;
  deviceScale: number;
  safeFrame: OcclusionFrame;
  imageFrame: OcclusionFrame;
}) {
  if (!Number.isFinite(deviceScale) || deviceScale <= 0) {
    throw new Error("Player occlusion device scale must be positive.");
  }
  for (const [name, frame] of [
    ["safe", safeFrame],
    ["image", imageFrame]
  ] as const) {
    if (
      ![frame.x, frame.y, frame.width, frame.height].every(Number.isFinite) ||
      frame.width <= 0 ||
      frame.height <= 0
    ) {
      throw new Error(`Player occlusion ${name} frame is invalid.`);
    }
  }
  if (
    !Number.isFinite(column) ||
    !Number.isFinite(row) ||
    column < 0 ||
    row < 0
  ) {
    throw new Error("Player occlusion pixel coordinate is invalid.");
  }
  const canvasX = safeFrame.x + (column + 0.5) / deviceScale;
  const canvasY = safeFrame.y + (row + 0.5) / deviceScale;
  const normalizedX = (canvasX - imageFrame.x) / imageFrame.width;
  const normalizedY = (canvasY - imageFrame.y) / imageFrame.height;
  return {
    canvasX,
    canvasY,
    normalizedX,
    normalizedY,
    sourceX: normalizedX * 1817,
    sourceY: normalizedY * 866
  };
}

function pointInPolygonUnion(
  point: OcclusionPoint,
  polygons: readonly OcclusionPolygon[]
) {
  const [x, y] = point;
  return polygons.some((polygon) => {
    let inside = false;
    for (
      let current = 0, previous = polygon.length - 1;
      current < polygon.length;
      previous = current++
    ) {
      const [currentX, currentY] = polygon[current];
      const [previousX, previousY] = polygon[previous];
      if (
        currentY > y !== previousY > y &&
        x <
          ((previousX - currentX) * (y - currentY)) /
            (previousY - currentY) +
            currentX
      ) {
        inside = !inside;
      }
    }
    return inside;
  });
}

function measureNormalizedPlayerOcclusion(
  input: {
    alphaPixels: readonly OcclusionPoint[];
    canvasWidth: number;
    canvasHeight: number;
    deviceScale: number;
    safeFrame: OcclusionFrame;
    imageFrame: OcclusionFrame;
    playerScreenFoot: OcclusionPoint;
    normalizedPolygons: unknown;
    sourcePolygons: unknown;
  },
  helpers: OcclusionHelpers = {
    parseNormalizedPolygons,
    parseSourcePolygons,
    polygonPointBounds,
    provePolygonEquivalence,
    playerPixelCenterCoordinates,
    pointInPolygonUnion
  }
) {
  const normalizedPolygons = helpers.parseNormalizedPolygons(
    input.normalizedPolygons
  );
  const sourcePolygons = helpers.parseSourcePolygons(input.sourcePolygons);
  const equivalence = helpers.provePolygonEquivalence(
    normalizedPolygons,
    sourcePolygons
  );
  if (
    !Number.isInteger(input.canvasWidth) ||
    input.canvasWidth <= 0 ||
    !Number.isInteger(input.canvasHeight) ||
    input.canvasHeight <= 0
  ) {
    throw new Error("Player occlusion canvas pixels are invalid.");
  }
  let playerAlphaPixels = 0;
  let intersectionAlphaPixels = 0;
  let maximumAlphaCanvasY = -1;
  let classificationParityMismatchCount = 0;
  let measuredMinimumX = Number.POSITIVE_INFINITY;
  let measuredMinimumY = Number.POSITIVE_INFINITY;
  let measuredMaximumX = Number.NEGATIVE_INFINITY;
  let measuredMaximumY = Number.NEGATIVE_INFINITY;
  for (const [column, row] of input.alphaPixels) {
    if (
      !Number.isInteger(column) ||
      !Number.isInteger(row) ||
      column < 0 ||
      column >= input.canvasWidth ||
      row < 0 ||
      row >= input.canvasHeight
    ) {
      throw new Error("Player alpha pixel coordinate is invalid.");
    }
    playerAlphaPixels += 1;
    const coordinates = helpers.playerPixelCenterCoordinates({
      column,
      row,
      deviceScale: input.deviceScale,
      safeFrame: input.safeFrame,
      imageFrame: input.imageFrame
    });
    maximumAlphaCanvasY = Math.max(
      maximumAlphaCanvasY,
      coordinates.canvasY - input.safeFrame.y
    );
    measuredMinimumX = Math.min(measuredMinimumX, coordinates.normalizedX);
    measuredMinimumY = Math.min(measuredMinimumY, coordinates.normalizedY);
    measuredMaximumX = Math.max(measuredMaximumX, coordinates.normalizedX);
    measuredMaximumY = Math.max(measuredMaximumY, coordinates.normalizedY);
    const normalizedInside = helpers.pointInPolygonUnion(
      [coordinates.normalizedX, coordinates.normalizedY],
      normalizedPolygons
    );
    const sourceInside = helpers.pointInPolygonUnion(
      [coordinates.sourceX, coordinates.sourceY],
      sourcePolygons
    );
    if (normalizedInside !== sourceInside) {
      classificationParityMismatchCount += 1;
    }
    if (normalizedInside) intersectionAlphaPixels += 1;
  }
  const classificationParity = {
    passed: classificationParityMismatchCount === 0,
    comparedAlphaPixels: playerAlphaPixels,
    mismatchCount: classificationParityMismatchCount
  };
  const failedPredicates = [
    ...(playerAlphaPixels === 0 ? ["playerAlphaPixels>0"] : []),
    ...(classificationParity.passed
      ? []
      : ["normalizedSourceClassificationParity"])
  ];
  return {
    coordinateSpace: "normalized-image-frame" as const,
    imageFrame: input.imageFrame,
    safeFrame: input.safeFrame,
    deviceScale: input.deviceScale,
    normalizedPolygonCount: normalizedPolygons.length,
    normalizedPointBounds: helpers.polygonPointBounds(normalizedPolygons),
    sourcePolygonCount: sourcePolygons.length,
    sourcePointBounds: helpers.polygonPointBounds(sourcePolygons),
    measuredNormalizedPlayerBounds:
      playerAlphaPixels === 0
        ? null
        : {
            minimumX: measuredMinimumX,
            minimumY: measuredMinimumY,
            maximumX: measuredMaximumX,
            maximumY: measuredMaximumY
          },
    equivalence,
    classificationParity,
    playerAlphaPixels,
    intersectionAlphaPixels,
    intersectionRatio:
      playerAlphaPixels === 0
        ? 0
        : intersectionAlphaPixels / playerAlphaPixels,
    ratioConsistencyTolerance: Number.EPSILON,
    playerRemainingRatio:
      playerAlphaPixels === 0
        ? 0
        : 1 - intersectionAlphaPixels / playerAlphaPixels,
    alphaBottomToFootCssPixels:
      maximumAlphaCanvasY < 0
        ? null
        : Math.abs(
            input.playerScreenFoot[1] -
              (maximumAlphaCanvasY + input.safeFrame.y)
          ),
    failedPredicates,
    passed: failedPredicates.length === 0
  };
}

const expectedRuntimeAssets = (character: Character) =>
  new Set(
    [
      "",
      "-back",
      "-run-front-a",
      "-run-front-b",
      "-run-back-a",
      "-run-back-b",
      "-run-right",
      "-run-right-b"
    ].map(
      (suffix) => `/assets/characters/runtime/player-${character}${suffix}.webp`
    )
  );

function readUnsigned24LittleEndian(bytes: Buffer, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function readWebPDimensions(bytes: Buffer): {
  naturalWidth: number;
  naturalHeight: number;
} {
  if (
    bytes.length < 20 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WEBP"
  ) {
    throw new Error("Runtime asset response is not a valid WebP container.");
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + chunkSize;
    if (dataEnd > bytes.length) {
      throw new Error(`Runtime WebP ${chunkType} chunk is truncated.`);
    }
    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        naturalWidth:
          readUnsigned24LittleEndian(bytes, dataOffset + 4) + 1,
        naturalHeight:
          readUnsigned24LittleEndian(bytes, dataOffset + 7) + 1
      };
    }
    if (
      chunkType === "VP8L" &&
      chunkSize >= 5 &&
      bytes[dataOffset] === 0x2f
    ) {
      const byte1 = bytes[dataOffset + 1];
      const byte2 = bytes[dataOffset + 2];
      const byte3 = bytes[dataOffset + 3];
      const byte4 = bytes[dataOffset + 4];
      return {
        naturalWidth: 1 + byte1 + ((byte2 & 0x3f) << 8),
        naturalHeight:
          1 + (byte2 >> 6) + (byte3 << 2) + ((byte4 & 0x0f) << 10)
      };
    }
    if (
      chunkType === "VP8 " &&
      chunkSize >= 10 &&
      bytes[dataOffset + 3] === 0x9d &&
      bytes[dataOffset + 4] === 0x01 &&
      bytes[dataOffset + 5] === 0x2a
    ) {
      return {
        naturalWidth: bytes.readUInt16LE(dataOffset + 6) & 0x3fff,
        naturalHeight: bytes.readUInt16LE(dataOffset + 8) & 0x3fff
      };
    }
    offset = dataEnd + (chunkSize % 2);
  }
  throw new Error("Runtime WebP dimensions are unavailable.");
}

function assertRequestLedgers(ledgers: RequestLedger[]) {
  expect(ledgers.map(({ identity }) => identity)).toEqual([
    "desktop-male",
    "desktop-female",
    "mobile-female"
  ]);
  for (const ledger of ledgers) {
    const expectedViewport =
      ledger.profile === "desktop" ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT;
    expect(ledger.viewport).toEqual(expectedViewport);
    expect(new Set(ledger.runtimeAssets)).toEqual(
      expectedRuntimeAssets(ledger.character)
    );
    expect(ledger.runtimeAssets).toHaveLength(8);
    expect(ledger.runtimeAssetMeasurements).toHaveLength(8);
    expect(
      ledger.runtimeAssetMeasurements.every(
        ({ asset, naturalWidth, naturalHeight }) =>
          ledger.runtimeAssets.includes(asset) &&
          naturalWidth === 768 &&
          naturalHeight === 1152
      )
    ).toBe(true);
    expect(ledger.approvedSourceRequests.length).toBeGreaterThanOrEqual(1);
    expect(
      ledger.approvedSourceRequests.every(
        (request) => request === APPROVED_SOURCE
      )
    ).toBe(true);
    const opposite = ledger.character === "male" ? "female" : "male";
    expect(
      ledger.runtimeAssets.some((asset) =>
        asset.includes(`player-${opposite}`)
      )
    ).toBe(false);
    expect(
      ledger.requests.some((path) => /player-(male|female)\.glb$/.test(path))
    ).toBe(false);
    expect(ledger.approvedSourceDom).toEqual({
      backdropSource: APPROVED_SOURCE,
      backdropComplete: true,
      backdropNaturalWidth: REFERENCE_IMAGE.width,
      backdropNaturalHeight: REFERENCE_IMAGE.height,
      foregroundSource: APPROVED_SOURCE,
      foregroundComplete: true,
      foregroundNaturalWidth: REFERENCE_IMAGE.width,
      foregroundNaturalHeight: REFERENCE_IMAGE.height
    });
    expect(ledger.errors).toEqual([]);
  }
}

async function collectRequestLedger(
  browser: Browser,
  identity: RequestLedgerIdentity,
  profile: "desktop" | "mobile",
  character: Character
): Promise<RequestLedger> {
  const viewport =
    profile === "desktop" ? DESKTOP_VIEWPORT : MOBILE_VIEWPORT;
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport,
    serviceWorkers: "block"
  });
  const requests: string[] = [];
  const errors: string[] = [];
  const measurementPromises = new Map<
    string,
    Promise<RuntimeAssetMeasurement>
  >();
  context.on("request", (request) => {
    requests.push(new URL(request.url()).pathname);
  });
  context.on("requestfailed", (request) => {
    errors.push(
      `requestfailed:${new URL(request.url()).pathname}:${
        request.failure()?.errorText ?? "request failed"
      }`
    );
  });
  context.on("response", (response) => {
    const asset = new URL(response.url()).pathname;
    if (response.status() >= 400) {
      errors.push(`http:${response.status()}:${asset}`);
    }
    if (
      asset.startsWith("/assets/characters/runtime/player-") &&
      asset.endsWith(".webp") &&
      !measurementPromises.has(asset)
    ) {
      measurementPromises.set(
        asset,
        response
          .body()
          .then((body) => ({ asset, ...readWebPDimensions(body) }))
          .catch((error: unknown) => {
            errors.push(
              `response-body:${asset}:${
                error instanceof Error ? error.message : String(error)
              }`
            );
            return { asset, naturalWidth: 0, naturalHeight: 0 };
          })
      );
    }
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(`pageerror:${error.message}`));
  try {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/en");
    await advanceToCharacterSelection(page);
    await selectCharacter(page, character);
    await page.getByRole("button", { name: "ENTER WORLD" }).click();
    await waitForWorld(page, profile);
    const approvedSourceState = await readWorldTelemetry(page);
    const runtimeAssets = [
      ...new Set(
        requests.filter(
          (path) =>
            path.startsWith("/assets/characters/runtime/player-") &&
            path.endsWith(".webp")
        )
      )
    ].sort();
    const ledger: RequestLedger = {
      identity,
      profile,
      viewport: { ...viewport },
      character,
      requests: [...requests],
      runtimeAssets,
      approvedSourceRequests: requests.filter(
        (path) => path === APPROVED_SOURCE
      ),
      approvedSourceDom: {
        backdropSource: approvedSourceState.backdrop.source,
        backdropComplete: approvedSourceState.backdrop.imageComplete,
        backdropNaturalWidth: approvedSourceState.backdrop.naturalWidth,
        backdropNaturalHeight: approvedSourceState.backdrop.naturalHeight,
        foregroundSource: approvedSourceState.foreground.source,
        foregroundComplete: approvedSourceState.foreground.imageComplete,
        foregroundNaturalWidth: approvedSourceState.foreground.naturalWidth,
        foregroundNaturalHeight: approvedSourceState.foreground.naturalHeight
      },
      runtimeAssetMeasurements: (
        await Promise.all(measurementPromises.values())
      ).sort((left, right) => left.asset.localeCompare(right.asset)),
      errors: [...errors]
    };
    return ledger;
  } finally {
    await context.close();
  }
}

async function collectThreeRequestLedgers(
  browser: Browser
): Promise<RequestLedger[]> {
  const ledgers = [
    await collectRequestLedger(browser, "desktop-male", "desktop", "male"),
    await collectRequestLedger(
      browser,
      "desktop-female",
      "desktop",
      "female"
    ),
    await collectRequestLedger(
      browser,
      "mobile-female",
      "mobile",
      "female"
    )
  ];
  assertRequestLedgers(ledgers);
  return ledgers;
}

async function readStartTelemetry(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".start-screen");
    const image = document.querySelector<HTMLImageElement>(
      '[data-testid="approved-start-environment"]'
    );
    const grid = document.querySelector<HTMLElement>(".character-grid");
    const options = [
      ...document.querySelectorAll<HTMLElement>(".character-option")
    ];
    const portraits = [
      ...document.querySelectorAll<HTMLImageElement>(".character-figure")
    ];
    const rectangle = (element: Element | null) => {
      const bounds = element?.getBoundingClientRect();
      return bounds
        ? {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height
          }
        : null;
    };
    return {
      phase: shell?.dataset.phase ?? null,
      approvedSource: image?.getAttribute("src") ?? null,
      approvedSourceCount: document.querySelectorAll(
        '[data-testid="approved-start-environment"]'
      ).length,
      imageReady:
        Boolean(image?.complete) &&
        image?.naturalWidth === 1817 &&
        image?.naturalHeight === 866,
      shellBounds: rectangle(shell),
      shellScrollTop: shell?.scrollTop ?? null,
      shellScrollLeft: shell?.scrollLeft ?? null,
      shellClientHeight: shell?.clientHeight ?? null,
      shellScrollHeight: shell?.scrollHeight ?? null,
      windowScrollY: window.scrollY,
      imageBounds: rectangle(image),
      cardBounds: rectangle(document.querySelector(".start-card")),
      selectedOptionBounds: rectangle(
        document.querySelector('.character-option[aria-pressed="true"]')
      ),
      enterButtonBounds: rectangle(
        document.querySelector(".character-select-card .primary-action")
      ),
      gridContract: grid
        ? {
            cardWidth: grid.dataset.cardWidth ?? null,
            cardHeight: grid.dataset.cardHeight ?? null,
            cardGap: grid.dataset.cardGap ?? null
          }
        : null,
      optionBounds: options.map(rectangle),
      portraitBounds: portraits.map(rectangle),
      portraitSources: portraits.map((portrait) => portrait.getAttribute("src")),
      portraitAlts: portraits.map((portrait) => portrait.getAttribute("alt")),
      horizontalOverflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - window.innerWidth
    };
  });
}

function assertStartTelemetry(
  state: Awaited<ReturnType<typeof readStartTelemetry>>,
  phase: "start" | "select",
  viewport: { width: number; height: number }
) {
  expect(state.phase).toBe(phase);
  expect(state.approvedSource).toBe(APPROVED_SOURCE);
  expect(state.approvedSourceCount).toBe(1);
  expect(state.imageReady).toBe(true);
  expect(state.shellBounds?.x).toBeCloseTo(0, 1);
  expect(state.shellBounds?.y).toBeCloseTo(0, 1);
  expect(state.shellBounds?.width).toBeCloseTo(viewport.width, 1);
  expect(state.shellBounds?.height).toBeGreaterThanOrEqual(viewport.height);
  expect(state.windowScrollY).toBe(0);
  expect(state.shellScrollLeft).toBe(0);
  expect(state.imageBounds?.x).toBeCloseTo(0, 1);
  expect(state.imageBounds?.y).toBeCloseTo(0, 1);
  expect(state.imageBounds?.width).toBeCloseTo(viewport.width, 1);
  expect(state.imageBounds?.height).toBeGreaterThanOrEqual(viewport.height);
  expect(state.horizontalOverflow).toBeLessThanOrEqual(0);
  if (phase === "select") {
    expect(state.gridContract).toEqual({
      cardWidth: "320",
      cardHeight: "525",
      cardGap: "46"
    });
    expect(state.optionBounds).toHaveLength(2);
    expect(
      state.optionBounds.every(
        (bounds) =>
          bounds !== null &&
          Math.abs(bounds.width - 320) <= 1 &&
          Math.abs(bounds.height - 525) <= 1
      )
    ).toBe(true);
    expect(state.portraitSources).toEqual([
      "/assets/characters/player-male.png",
      "/assets/characters/player-female.png"
    ]);
    expect(state.portraitAlts).toEqual([
      "Male player character",
      "Female player character"
    ]);
    if (viewport.width === MOBILE_VIEWPORT.width) {
      expect(Number(state.shellScrollTop)).toBeGreaterThan(0);
      expect(Number(state.shellScrollHeight)).toBeGreaterThan(
        Number(state.shellClientHeight)
      );
      expect(state.selectedOptionBounds).not.toBeNull();
      expect(state.selectedOptionBounds!.y).toBeLessThan(viewport.height);
      expect(
        state.selectedOptionBounds!.y + state.selectedOptionBounds!.height
      ).toBeGreaterThan(0);
      expect(state.enterButtonBounds).not.toBeNull();
    }
  }
}

async function readMapTelemetry(page: Page) {
  return page.evaluate(() => {
    const read = (selector: string) => {
      const svg = document.querySelector<SVGSVGElement>(selector);
      if (!svg) return null;
      const player = svg.querySelector<SVGElement>('[data-map-layer="player"]');
      const terrain = svg.querySelector<SVGImageElement>(
        '[data-map-layer="terrain"]'
      );
      const coastline = svg.querySelector<SVGElement>(
        '[data-map-layer="coastline"]'
      );
      const mapRoot =
        svg.closest<HTMLElement>(".rpg-world-map-plane") ?? svg;
      const routes = [
        ...svg.querySelectorAll<SVGElement>(
          '[data-map-layer="route"],[data-map-layer="bridge"]'
        )
      ];
      const nodes = [
        ...mapRoot.querySelectorAll<SVGElement>(
          '[data-map-layer="zone"],[data-map-layer="arrival"]'
        )
      ];
      return {
        viewBox: svg.getAttribute("viewBox"),
        navigationRevision: svg.dataset.navigationRevision ?? null,
        navigationRegion: svg.dataset.navigationRegion ?? null,
        terrain: {
          source: terrain?.getAttribute("href") ?? null,
          sourceId: terrain?.dataset.mapSourceId ?? null,
          width: terrain?.getAttribute("width") ?? null,
          height: terrain?.getAttribute("height") ?? null
        },
        coastline: {
          sourceId: coastline?.dataset.mapSourceId ?? null,
          points: coastline?.getAttribute("points") ?? null
        },
        routes: routes.map((route) => ({
          layer: route.dataset.mapLayer ?? null,
          sourceId: route.dataset.mapSourceId ?? null,
          points: route.getAttribute("points")
        })),
        nodes: nodes.map((node) => ({
          layer: node.dataset.mapLayer ?? null,
          sourceId: node.dataset.mapSourceId ?? null,
          navigationRevision: node.dataset.navigationRevision ?? null
        })),
        player: {
          sourceId: player?.dataset.mapSourceId ?? null,
          navigationRevision: player?.dataset.navigationRevision ?? null,
          transform: player?.getAttribute("transform") ?? null
        }
      };
    };
    return {
      mini: read(".rpg-mini-map-canvas"),
      full: read(".rpg-world-map-canvas")
    };
  });
}

async function readWorldTelemetry(page: Page) {
  return page.evaluate(() => {
    const world = document.querySelector<HTMLElement>(".world-shell");
    const renderer = world?.querySelector<HTMLElement>(
      '[data-world-renderer="approved-reference"]'
    );
    const canvas = renderer?.querySelector<HTMLCanvasElement>("canvas");
    const canvasFrame = canvas;
    const backdrop = renderer?.querySelector<HTMLElement>(
      '[data-rpg-world-backdrop="approved-image"]'
    );
    const backdropImage = backdrop?.querySelector<HTMLImageElement>(
      '[data-rpg-world-backdrop-image="single"]'
    );
    const foreground = renderer?.querySelector<HTMLElement>(
      '[data-rpg-reference-layer="foreground-frame"]'
    );
    const foregroundImage = foreground?.querySelector<HTMLImageElement>(
      '[data-rpg-reference-foreground-image="single"]'
    );
    const shadow = renderer?.querySelector<HTMLElement>(
      '[data-rpg-player-shadow="approved-contract"]'
    );
    const data = canvas?.dataset ?? renderer?.dataset;
    const rendererBounds = renderer?.getBoundingClientRect();
    const controlBounds = [
      ...document.querySelectorAll<HTMLElement>(
        ".world-controls button,.mobile-move-zone"
      )
    ].map((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      };
    });
    const layer = (element: HTMLElement | null | undefined) => ({
      transformRevision:
        element?.dataset.rpgReferenceTransformRevision ?? null,
      navigationRevision:
        element?.dataset.rpgReferenceNavigationRevision ?? null,
      transformIdentity:
        element?.dataset.rpgReferenceTransformIdentity ?? null,
      imageFrame: element?.dataset.rpgReferenceImageFrame ?? null,
      safeFrame:
        element?.dataset.rpgReferenceSafeFrame ??
        element?.dataset.rpgWorldBackdropSafeFrame ??
        null
    });

    return {
      phase:
        document.querySelector(".start-screen")?.getAttribute("data-phase") ??
        null,
      worldPresent: Boolean(world),
      worldReady: renderer?.dataset.worldReady ?? null,
      renderer: renderer?.dataset.worldRenderer ?? null,
      cameraMode: renderer?.dataset.cameraMode ?? null,
      profile: data?.cameraProfile ?? null,
      viewport: data?.viewport ?? null,
      safeFrame: data?.safeFrame ?? null,
      backdropScale: data?.backdropScale ?? null,
      sourceOffset: data?.sourceOffset ?? null,
      targetSourceOffset: data?.targetSourceOffset ?? null,
      sourceWindow: data?.sourceWindow ?? null,
      cameraStepCssPixels: data?.cameraStepCssPixels ?? null,
      referenceTransformRevision:
        data?.referenceTransformRevision ?? null,
      referenceNavigationRevision:
        data?.referenceNavigationRevision ?? null,
      referenceTransformIdentity:
        data?.referenceTransformIdentity ?? null,
      referenceImageFrame: data?.referenceImageFrame ?? null,
      playerReferencePixel: data?.playerReferencePixel ?? null,
      playerRawReferencePixel: data?.playerRawReferencePixel ?? null,
      playerScreenFoot: data?.playerScreenFoot ?? null,
      playerScreenBounds: data?.playerScreenBounds ?? null,
      playerReferenceBounds: data?.playerReferenceBounds ?? null,
      playerActualReferenceBounds:
        data?.playerActualReferenceBounds ?? null,
      playerCameraScreenBounds:
        data?.playerCameraScreenBounds ?? null,
      playerScreenHeight: data?.playerScreenHeight ?? null,
      playerDisplayCssHeight: data?.playerDisplayCssHeight ?? null,
      playerDisplayProfile: data?.playerDisplayProfile ?? null,
      playerRawDepthKey: data?.playerRawDepthKey ?? null,
      playerGroupPosition: data?.playerGroupPosition ?? null,
      playerGroupScale: data?.playerGroupScale ?? null,
      playerRendererLocalCorrection:
        data?.playerRendererLocalCorrection ?? null,
      playerEnvelopeSubset: data?.playerEnvelopeSubset ?? null,
      playerGrounded: data?.playerGrounded ?? null,
      characterDepth: data?.characterDepth ?? null,
      characterId: data?.characterId ?? null,
      characterAsset: data?.characterAsset ?? null,
      characterReady: data?.characterReady ?? null,
      movementCompatibility: data?.movementCompatibility ?? null,
      activeDepthBand: data?.activeDepthBand ?? null,
      depthCrossing: data?.depthCrossing ?? null,
      foregroundCrossing: data?.foregroundCrossing ?? null,
      foregroundVisible: data?.foregroundVisible ?? null,
      foregroundAbovePlayer: data?.foregroundAbovePlayer ?? null,
      foregroundId: data?.foregroundId ?? null,
      foregroundScreenBounds: data?.foregroundScreenBounds ?? null,
      foregroundSourceCount: data?.foregroundSourceCount ?? null,
      layers: {
        backdrop: layer(backdrop),
        canvas: layer(canvasFrame),
        shadow: layer(shadow),
        foreground: layer(foreground)
      },
      backdrop: {
        wrapperCount:
          renderer?.querySelectorAll(
            '[data-rpg-world-backdrop="approved-image"]'
          ).length ?? 0,
        imageCount:
          renderer?.querySelectorAll(
            '[data-rpg-world-backdrop-image="single"]'
          ).length ?? 0,
        source: backdrop?.dataset.rpgWorldBackdropAsset ?? null,
        ready: backdrop?.dataset.rpgWorldBackdropReady ?? null,
        decodeReady:
          backdrop?.dataset.rpgWorldBackdropDecodeReady ?? null,
        imageComplete: backdropImage?.complete ?? false,
        naturalWidth: backdropImage?.naturalWidth ?? 0,
        naturalHeight: backdropImage?.naturalHeight ?? 0
      },
      foreground: {
        frameCount:
          renderer?.querySelectorAll(
            '[data-rpg-reference-layer="foreground-frame"]'
          ).length ?? 0,
        imageCount:
          renderer?.querySelectorAll(
            '[data-rpg-reference-foreground-image="single"]'
          ).length ?? 0,
        sourceCount:
          foreground?.dataset.rpgReferenceForegroundSourceCount ?? null,
        source:
          foreground?.dataset.rpgReferenceForegroundSource ?? null,
        mask: foreground?.dataset.rpgReferenceForegroundMask ?? null,
        clip: foreground?.dataset.rpgReferenceForegroundClip ?? null,
        crossing:
          foreground?.dataset.rpgReferenceForegroundCrossing ?? null,
        visible:
          foreground?.dataset.rpgReferenceForegroundVisible ?? null,
        abovePlayer:
          foreground?.dataset.rpgReferenceForegroundAbovePlayer ?? null,
        computedVisibility: foreground
          ? getComputedStyle(foreground).visibility
          : null,
        computedZIndex: foreground
          ? getComputedStyle(foreground).zIndex
          : null,
        imageComplete:
          Boolean(foregroundImage?.complete) &&
          foregroundImage?.getAttribute("src") ===
            "/assets/world/world-environment-concept.png",
        naturalWidth: foregroundImage?.naturalWidth ?? 0,
        naturalHeight: foregroundImage?.naturalHeight ?? 0
      },
      shadow: {
        bounds: shadow?.dataset.rpgPlayerShadowBounds ?? null,
        blur: shadow?.dataset.rpgPlayerShadowBlur ?? null,
        footOffset: shadow?.dataset.rpgPlayerShadowFootOffset ?? null,
        opacity: shadow ? getComputedStyle(shadow).opacity : null
      },
      character: world?.dataset.character ?? null,
      zone: world?.dataset.currentZone ?? null,
      position: world?.dataset.playerPosition ?? null,
      navigationRevision: world?.dataset.navigationRevision ?? null,
      navigationRegion: world?.dataset.navigationRegion ?? null,
      rendererBounds: rendererBounds
        ? {
            x: rendererBounds.x,
            y: rendererBounds.y,
            width: rendererBounds.width,
            height: rendererBounds.height
          }
        : null,
      blankHeight: rendererBounds
        ? Math.max(0, window.innerHeight - (rendererBounds.y + rendererBounds.height))
        : null,
      controlBounds,
      horizontalOverflow:
        Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth
        ) - window.innerWidth
    };
  });
}

async function waitForWorld(page: Page, profile: "desktop" | "mobile") {
  const renderer = page.locator(
    `.flat-world-renderer[data-camera-profile="${profile}"][data-world-ready="true"]`
  );
  await expect(renderer).toBeVisible({ timeout: 30_000 });
  await expect(
    renderer.locator('[data-rpg-world-backdrop-decode-ready="true"]')
  ).toHaveCount(1);
  await expect(renderer.locator("canvas")).toHaveAttribute(
    "data-player-grounded",
    "true"
  );
  await expect(renderer.locator("canvas")).toHaveAttribute(
    "data-player-envelope-subset",
    "true"
  );
  await page.waitForTimeout(250);
}

async function advanceToCharacterSelection(page: Page) {
  await expect(page.locator('.start-screen[data-phase="start"]')).toBeVisible();
  const start = page.getByRole("button", { name: "START" });
  await expect(start).toBeVisible();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await start.click();
    try {
      await expect(page.locator(".start-screen")).toHaveAttribute(
        "data-phase",
        "select",
        { timeout: 5_000 }
      );
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await expect(
    page.getByRole("heading", { name: "CHOOSE YOUR CHARACTER" })
  ).toBeVisible();
}

async function selectCharacter(page: Page, character: Character) {
  const option = page.getByRole("button", {
    name:
      character === "male"
        ? "Select male character"
        : "Select female character"
  });
  await option.click();
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "ENTER WORLD" })).toBeEnabled();
}

function assertMapTelemetry(
  map: Awaited<ReturnType<typeof readMapTelemetry>>["mini" | "full"],
  navigationRevision: string | null
) {
  expect(map).not.toBeNull();
  expect(map?.viewBox).toBe("0 0 1817 866");
  expect(map?.navigationRevision).toBe(navigationRevision);
  expect(map?.terrain).toEqual({
    source: APPROVED_SOURCE,
    sourceId: "approved-world-environment-concept",
    width: "1817",
    height: "866"
  });
  expect(map?.coastline.sourceId).toBe("approved-reference-coastline");
  expect(map?.coastline.points?.trim().split(/\s+/)).toHaveLength(24);
  expect(map?.routes).toHaveLength(5);
  expect(map?.routes.every(({ points }) => (points ?? "").trim().split(/\s+/).length >= 4)).toBe(
    true
  );
  expect(map?.nodes.filter(({ layer }) => layer === "zone")).toHaveLength(5);
  expect(map?.nodes.filter(({ layer }) => layer === "arrival")).toHaveLength(5);
  expect(map?.player.sourceId).toBe("player");
  expect(map?.player.navigationRevision).toBe(navigationRevision);
  expect(map?.player.transform).toMatch(/^translate\(.+\) rotate\(.+\)$/);
}

function assertWorldTelemetry(
  state: Awaited<ReturnType<typeof readWorldTelemetry>>,
  profile: "desktop" | "mobile",
  character: Character
) {
  const safeFrame = profile === "desktop" ? [0, 0, 1440, 900] : [0, 64, 390, 780];
  const expectedScale = profile === "desktop" ? 900 / 866 : 1.3;
  const sourceWindow = numbers(state.sourceWindow);
  const playerBounds = numbers(state.playerScreenBounds);
  const playerFoot = numbers(state.playerScreenFoot);
  const referenceFoot = numbers(state.playerReferencePixel);
  const rawReferenceFoot = numbers(state.playerRawReferencePixel);
  const shadowBounds = numbers(state.shadow.bounds);
  const imageFrame = numbers(state.referenceImageFrame);
  const identity = state.referenceTransformIdentity;
  expect(state.worldPresent).toBe(true);
  expect(state.worldReady).toBe("true");
  expect(state.renderer).toBe("approved-reference");
  expect(state.cameraMode).toBe("orthographic-reference");
  expect(state.profile).toBe(profile);
  expect(numbers(state.safeFrame)).toEqual(safeFrame);
  expect(Number(state.backdropScale)).toBeCloseTo(expectedScale, 6);
  expect(sourceWindow).toHaveLength(4);
  expect(sourceWindow.every(Number.isFinite)).toBe(true);
  expect(sourceWindow[0]).toBeGreaterThanOrEqual(0);
  expect(sourceWindow[1]).toBeGreaterThanOrEqual(0);
  expect(sourceWindow[2]).toBeLessThanOrEqual(REFERENCE_IMAGE.width + 0.01);
  expect(sourceWindow[3]).toBeLessThanOrEqual(REFERENCE_IMAGE.height + 0.01);
  expect(imageFrame).toHaveLength(4);
  expect(identity).toBe(
    `${state.referenceNavigationRevision}:${state.referenceTransformRevision}`
  );
  for (const layer of Object.values(state.layers)) {
    expect(layer.transformIdentity).toBe(identity);
    expect(layer.transformRevision).toBe(state.referenceTransformRevision);
    expect(layer.navigationRevision).toBe(state.referenceNavigationRevision);
    expect(numbers(layer.imageFrame)).toEqual(imageFrame);
    expect(numbers(layer.safeFrame)).toEqual(safeFrame);
  }
  expect(state.navigationRevision).toBe(state.referenceNavigationRevision);
  expect(state.character).toBe(character);
  expect(state.characterId).toBe(character);
  expect(state.characterAsset).toMatch(
    new RegExp(`/assets/characters/runtime/player-${character}.*\\.webp$`)
  );
  expect(state.characterReady).toBe("true");
  expect(state.movementCompatibility).toBe("false");
  expect(state.playerDisplayProfile).toBe(profile);
  expect(state.playerRendererLocalCorrection).toBe("none");
  expect(state.playerGrounded).toBe("true");
  expect(state.playerEnvelopeSubset).toBe("true");
  expect(referenceFoot).toHaveLength(2);
  expect(rawReferenceFoot[0]).toBeCloseTo(referenceFoot[0], 3);
  expect(rawReferenceFoot[1]).toBeCloseTo(referenceFoot[1], 3);
  expect(playerFoot).toHaveLength(2);
  expect(playerBounds).toHaveLength(4);
  expect(numbers(state.playerReferenceBounds)).toHaveLength(4);
  expect(numbers(state.playerActualReferenceBounds)).toHaveLength(4);
  expect(numbers(state.playerCameraScreenBounds)).toHaveLength(4);
  expect(Number(state.playerRawDepthKey)).toBeCloseTo(
    Number(state.characterDepth),
    5
  );
  expect(shadowBounds).toHaveLength(4);
  const expectedShadow =
    profile === "mobile"
      ? { width: 48, height: 14, opacity: 0.46, blur: 1.5 }
      : state.zone === "airport"
        ? { width: 58, height: 15, opacity: 0.42, blur: 2 }
        : state.zone === "hanabi"
          ? { width: 50, height: 14, opacity: 0.44, blur: 2 }
          : null;
  if (expectedShadow) {
    expect(shadowBounds[2]).toBeCloseTo(expectedShadow.width, 1);
    expect(shadowBounds[3]).toBeCloseTo(expectedShadow.height, 1);
    expect(Number(state.shadow.blur)).toBe(expectedShadow.blur);
    expect(Number(state.shadow.opacity)).toBeCloseTo(expectedShadow.opacity, 1);
  }
  expect(Number(state.shadow.footOffset)).toBe(4);
  expect(Number(state.shadow.opacity)).toBeGreaterThanOrEqual(0);
  expect(Number(state.shadow.opacity)).toBeLessThanOrEqual(0.46);
  expect(state.backdrop).toEqual({
    wrapperCount: 1,
    imageCount: 1,
    source: APPROVED_SOURCE,
    ready: "true",
    decodeReady: "true",
    imageComplete: true,
    naturalWidth: 1817,
    naturalHeight: 866
  });
  expect(state.foreground.frameCount).toBe(1);
  expect(state.foreground.imageCount).toBe(1);
  expect(state.foreground.sourceCount).toBe("1");
  expect(state.foreground.source).toBe(APPROVED_SOURCE);
  expect(state.foreground.mask).not.toBeNull();
  expect(state.foreground.clip).not.toBeNull();
  expect(state.foreground.imageComplete).toBe(true);
  expect(state.foreground.naturalWidth).toBe(1817);
  expect(state.foreground.naturalHeight).toBe(866);
  expect(state.foregroundSourceCount).toBe("1");
  expect(state.foreground.crossing).toBe(state.depthCrossing);
  expect(state.foreground.visible).toBe(state.foregroundVisible);
  expect(state.foreground.abovePlayer).toBe(state.foregroundAbovePlayer);
  const playerBehindForeground = state.depthCrossing === "behind";
  expect(state.foreground.visible).toBe(
    String(playerBehindForeground)
  );
  expect(state.foreground.abovePlayer).toBe(
    String(playerBehindForeground)
  );
  expect(state.foreground.computedVisibility).toBe(
    playerBehindForeground ? "visible" : "hidden"
  );
  expect(state.foreground.computedZIndex).toBe(
    playerBehindForeground ? "3" : "1"
  );
  expect(state.horizontalOverflow).toBeLessThanOrEqual(0);
  if (profile === "desktop") {
    const target =
      ZONE_FOOT_TARGETS[
        state.zone as keyof typeof ZONE_FOOT_TARGETS
      ];
    expect(target).toBeDefined();
    expect(referenceFoot[0]).toBeGreaterThanOrEqual(target.x[0]);
    expect(referenceFoot[0]).toBeLessThanOrEqual(target.x[1]);
    expect(referenceFoot[1]).toBeGreaterThanOrEqual(target.y[0]);
    expect(referenceFoot[1]).toBeLessThanOrEqual(target.y[1]);
    expect(Number(state.playerDisplayCssHeight)).toBeGreaterThanOrEqual(
      target.height[0]
    );
    expect(Number(state.playerDisplayCssHeight)).toBeLessThanOrEqual(
      target.height[1]
    );
  } else {
    expect(state.blankHeight).toBeLessThanOrEqual(1);
    expect(playerFoot[1]).toBeGreaterThanOrEqual(650);
    expect(playerFoot[1]).toBeLessThanOrEqual(735);
    expect(Number(state.playerDisplayCssHeight)).toBe(122);
    expect(Number(state.cameraStepCssPixels)).toBeLessThanOrEqual(24.01);
    expect(state.rendererBounds).toMatchObject({
      x: 0,
      y: 0,
      width: 390,
      height: 844
    });
    expect(
      state.controlBounds.every(
        ({ x, y, width, height }) =>
          x >= -1 &&
          y >= 63 &&
          x + width <= 391 &&
          y + height <= 845
      )
    ).toBe(true);
  }
}

async function compareSameSourceClipSeam(page: Page) {
  const renderer = page.locator(
    '.flat-world-renderer[data-world-ready="true"]'
  );
  const canvas = renderer.locator("canvas");
  const foreground = renderer.locator(
    '[data-rpg-reference-layer="foreground-frame"]'
  );
  const geometry = await renderer.evaluate((element) => {
    const foregroundFrame = element.querySelector<HTMLElement>(
      '[data-rpg-reference-layer="foreground-frame"]'
    );
    const foregroundImage = foregroundFrame?.querySelector<HTMLImageElement>(
      '[data-rpg-reference-foreground-image="single"]'
    );
    const sharedTransformIdentity =
      element.querySelector<HTMLCanvasElement>("canvas")?.dataset
        .referenceTransformIdentity ?? null;
    const layerTransformIdentities = [
      element.querySelector<HTMLElement>(
        '[data-rpg-world-backdrop="approved-image"]'
      )?.dataset.rpgReferenceTransformIdentity ?? null,
      element.querySelector<HTMLCanvasElement>("canvas")?.dataset
        .rpgReferenceTransformIdentity ?? null,
      element.querySelector<HTMLElement>(
        '[data-rpg-player-shadow="approved-contract"]'
      )?.dataset.rpgReferenceTransformIdentity ?? null,
      foregroundFrame?.dataset.rpgReferenceTransformIdentity ?? null
    ];
    if (!foregroundFrame || !foregroundImage) {
      throw new Error("Clip seam foreground geometry is unavailable.");
    }
    if (
      !sharedTransformIdentity ||
      layerTransformIdentities.some(
        (identity) => identity !== sharedTransformIdentity
      )
    ) {
      throw new Error("Clip seam layers do not share one transform identity.");
    }
    const rawPolygons =
      foregroundFrame.dataset.rpgReferenceForegroundClip;
    if (!rawPolygons) {
      throw new Error("Normalized foreground clip telemetry is missing.");
    }
    const parsed: unknown = JSON.parse(rawPolygons);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.some(
        (polygon) =>
          !Array.isArray(polygon) ||
          polygon.length < 3 ||
          polygon.some(
            (point) =>
              !Array.isArray(point) ||
              point.length !== 2 ||
              point.some(
                (coordinate) =>
                  typeof coordinate !== "number" ||
                  !Number.isFinite(coordinate) ||
                  coordinate < 0 ||
                  coordinate > 1
              )
          )
      )
    ) {
      throw new Error(
        "Foreground clip telemetry must contain valid normalized polygons."
      );
    }
    const polygons = parsed as number[][][];
    const rendererBounds = element.getBoundingClientRect();
    const imageBounds = foregroundImage.getBoundingClientRect();
    const imageFrame = (
      foregroundFrame.dataset.rpgReferenceImageFrame ?? ""
    )
      .split(",")
      .filter(Boolean)
      .map(Number);
    const safeFrame = (
      foregroundFrame.dataset.rpgReferenceSafeFrame ?? ""
    )
      .split(",")
      .filter(Boolean)
      .map(Number);
    if (
      imageFrame.length !== 4 ||
      imageFrame.some((value) => !Number.isFinite(value)) ||
      safeFrame.length !== 4 ||
      safeFrame.some((value) => !Number.isFinite(value)) ||
      rendererBounds.width <= 0 ||
      rendererBounds.height <= 0 ||
      imageBounds.width <= 0 ||
      imageBounds.height <= 0
    ) {
      throw new Error("Foreground image or safe-frame telemetry is invalid.");
    }
    return {
      polygons,
      transformIdentity: sharedTransformIdentity,
      imageFrame,
      safeFrame,
      rendererBounds: {
        x: rendererBounds.x,
        y: rendererBounds.y,
        width: rendererBounds.width,
        height: rendererBounds.height
      },
      imageBounds: {
        x: imageBounds.x,
        y: imageBounds.y,
        width: imageBounds.width,
        height: imageBounds.height
      },
      devicePixelRatio: window.devicePixelRatio
    };
  });
  expect(geometry.transformIdentity).not.toBeNull();
  const originalLayerStyles = await renderer.evaluate((element) => {
    const canvasElement = element.querySelector<HTMLCanvasElement>("canvas");
    const shadow = element.querySelector<HTMLElement>(
      '[data-rpg-player-shadow="approved-contract"]'
    );
    if (!canvasElement || !shadow) {
      throw new Error("Clip seam layers are unavailable.");
    }
    const original = {
      canvasOpacity: canvasElement.style.opacity,
      shadowVisibility: shadow.style.visibility
    };
    canvasElement.style.opacity = "0";
    shadow.style.visibility = "hidden";
    return original;
  });
  const visibilityOverride = await page.locator("head").evaluate((head) => {
    const style = document.createElement("style");
    style.dataset.rpgClipSeamVisibilityOverride = "true";
    style.textContent =
      '[data-rpg-reference-layer="foreground-frame"]{visibility:visible!important}';
    head.append(style);
    return true;
  });
  expect(visibilityOverride).toBe(true);
  let withForeground: Buffer;
  let withoutForeground: Buffer;
  try {
    await expect(foreground).toHaveCSS("visibility", "visible");
    withForeground = await renderer.screenshot();
    await page
      .locator('[data-rpg-clip-seam-visibility-override="true"]')
      .evaluate((style) => {
        style.textContent =
          '[data-rpg-reference-layer="foreground-frame"]{visibility:hidden!important}';
      });
    await expect(foreground).toHaveCSS("visibility", "hidden");
    withoutForeground = await renderer.screenshot();
  } finally {
    await renderer.evaluate(
      (element, original) => {
        const canvasElement =
          element.querySelector<HTMLCanvasElement>("canvas");
        const shadow = element.querySelector<HTMLElement>(
          '[data-rpg-player-shadow="approved-contract"]'
        );
        if (canvasElement) {
          canvasElement.style.opacity = original.canvasOpacity;
        }
        if (shadow) shadow.style.visibility = original.shadowVisibility;
      },
      originalLayerStyles
    );
    await page
      .locator('[data-rpg-clip-seam-visibility-override="true"]')
      .evaluateAll((styles) => styles.forEach((style) => style.remove()));
  }
  await expect(canvas).toHaveCSS("visibility", "visible");
  const restoredTransformIdentities = await renderer.evaluate((element) => {
    const canvasElement =
      element.querySelector<HTMLCanvasElement>("canvas");
    return {
      sharedCurrentIdentity:
        canvasElement?.dataset.referenceTransformIdentity ?? null,
      layers: [
        element.querySelector<HTMLElement>(
          '[data-rpg-world-backdrop="approved-image"]'
        )?.dataset.rpgReferenceTransformIdentity ?? null,
        canvasElement?.dataset.rpgReferenceTransformIdentity ?? null,
        element.querySelector<HTMLElement>(
          '[data-rpg-player-shadow="approved-contract"]'
        )?.dataset.rpgReferenceTransformIdentity ?? null,
        element.querySelector<HTMLElement>(
          '[data-rpg-reference-layer="foreground-frame"]'
        )?.dataset.rpgReferenceTransformIdentity ?? null
      ]
    };
  });
  expect(restoredTransformIdentities.sharedCurrentIdentity).not.toBeNull();
  expect(
    restoredTransformIdentities.layers.every(
      (identity) =>
        identity === restoredTransformIdentities.sharedCurrentIdentity
    )
  ).toBe(true);
  return page.evaluate(
    async ({
      withForegroundBase64,
      withoutForegroundBase64,
      seamGeometry
    }) => {
      const pixels = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d", {
          willReadFrequently: true
        });
        if (!context) throw new Error("Canvas 2D context unavailable.");
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, canvas.width, canvas.height);
      };
      const before = await pixels(withForegroundBase64);
      const after = await pixels(withoutForegroundBase64);
      if (
        before.width !== after.width ||
        before.height !== after.height
      ) {
        throw new Error("Clip seam comparison dimensions differ.");
      }
      const scaleX =
        before.width / seamGeometry.rendererBounds.width;
      const scaleY =
        before.height / seamGeometry.rendererBounds.height;
      if (
        !Number.isFinite(scaleX) ||
        !Number.isFinite(scaleY) ||
        scaleX <= 0 ||
        scaleY <= 0
      ) {
        throw new Error("Clip seam screenshot device scale is invalid.");
      }
      const polygons = seamGeometry.polygons.map((polygon) =>
        polygon.map(([normalizedX, normalizedY]) => [
          (seamGeometry.imageBounds.x -
            seamGeometry.rendererBounds.x +
            normalizedX * seamGeometry.imageBounds.width) *
            scaleX,
          (seamGeometry.imageBounds.y -
            seamGeometry.rendererBounds.y +
            normalizedY * seamGeometry.imageBounds.height) *
            scaleY
        ])
      );
      const pointInPolygon = (
        x: number,
        y: number,
        polygon: number[][]
      ) => {
        let inside = false;
        for (
          let current = 0, previous = polygon.length - 1;
          current < polygon.length;
          previous = current++
        ) {
          const [currentX, currentY] = polygon[current];
          const [previousX, previousY] = polygon[previous];
          if (
            currentY > y !== previousY > y &&
            x <
              ((previousX - currentX) * (y - currentY)) /
                (previousY - currentY) +
                currentX
          ) {
            inside = !inside;
          }
        }
        return inside;
      };
      const squaredDistanceToSegment = (
        x: number,
        y: number,
        start: number[],
        end: number[]
      ) => {
        const deltaX = end[0] - start[0];
        const deltaY = end[1] - start[1];
        const lengthSquared = deltaX * deltaX + deltaY * deltaY;
        const projection =
          lengthSquared === 0
            ? 0
            : Math.max(
                0,
                Math.min(
                  1,
                  ((x - start[0]) * deltaX +
                    (y - start[1]) * deltaY) /
                    lengthSquared
                )
              );
        const nearestX = start[0] + projection * deltaX;
        const nearestY = start[1] + projection * deltaY;
        return (x - nearestX) ** 2 + (y - nearestY) ** 2;
      };
      const isBoundaryPixel = (x: number, y: number) =>
        polygons.some((polygon) =>
          polygon.some((start, index) =>
            squaredDistanceToSegment(
              x,
              y,
              start,
              polygon[(index + 1) % polygon.length]
            ) <= 1
          )
        );
      let maximumChannelDelta = 0;
      let changedPixelCount = 0;
      let outsideMaskChangedPixelCount = 0;
      let boundaryMaximumDelta = 0;
      const boundaryChangedPixels = new Uint8Array(
        before.width * before.height
      );
      for (let pixel = 0; pixel < boundaryChangedPixels.length; pixel += 1) {
        const index = pixel * 4;
        let changed = false;
        let pixelMaximumDelta = 0;
        for (let channel = 0; channel < 4; channel += 1) {
          const delta = Math.abs(
            before.data[index + channel] - after.data[index + channel]
          );
          pixelMaximumDelta = Math.max(pixelMaximumDelta, delta);
          maximumChannelDelta = Math.max(maximumChannelDelta, delta);
          changed ||= delta > 1;
        }
        const x = (pixel % before.width) + 0.5;
        const y = Math.floor(pixel / before.width) + 0.5;
        const boundary = isBoundaryPixel(x, y);
        if (boundary) {
          boundaryMaximumDelta = Math.max(
            boundaryMaximumDelta,
            pixelMaximumDelta
          );
        }
        if (!changed) continue;
        changedPixelCount += 1;
        const inside = polygons.some((polygon) =>
          pointInPolygon(x, y, polygon)
        );
        if (!inside) outsideMaskChangedPixelCount += 1;
        if (boundary) boundaryChangedPixels[pixel] = 1;
      }
      let seamComponentCount = 0;
      const stack: number[] = [];
      for (let pixel = 0; pixel < boundaryChangedPixels.length; pixel += 1) {
        if (boundaryChangedPixels[pixel] !== 1) continue;
        seamComponentCount += 1;
        boundaryChangedPixels[pixel] = 2;
        stack.push(pixel);
        while (stack.length > 0) {
          const current = stack.pop()!;
          const currentX = current % before.width;
          const currentY = Math.floor(current / before.width);
          for (let deltaY = -1; deltaY <= 1; deltaY += 1) {
            for (let deltaX = -1; deltaX <= 1; deltaX += 1) {
              if (deltaX === 0 && deltaY === 0) continue;
              const adjacentX = currentX + deltaX;
              const adjacentY = currentY + deltaY;
              if (
                adjacentX < 0 ||
                adjacentX >= before.width ||
                adjacentY < 0 ||
                adjacentY >= before.height
              ) {
                continue;
              }
              const adjacent = adjacentY * before.width + adjacentX;
              if (boundaryChangedPixels[adjacent] !== 1) continue;
              boundaryChangedPixels[adjacent] = 2;
              stack.push(adjacent);
            }
          }
        }
      }
      return {
        method: "browser-canvas-image-data",
        width: before.width,
        height: before.height,
        deviceScale: { x: scaleX, y: scaleY },
        devicePixelRatio: seamGeometry.devicePixelRatio,
        normalizedPolygons: seamGeometry.polygons,
        imageFrame: seamGeometry.imageFrame,
        safeFrame: seamGeometry.safeFrame,
        transformIdentity: seamGeometry.transformIdentity,
        maximumChannelDelta,
        changedPixelCount,
        outsideMaskChangedPixelCount,
        boundaryMaximumDelta,
        seamComponentCount,
        passed:
          outsideMaskChangedPixelCount === 0 &&
          boundaryMaximumDelta <= 1 &&
          seamComponentCount === 0
      };
    },
    {
      withForegroundBase64: withForeground.toString("base64"),
      withoutForegroundBase64: withoutForeground.toString("base64"),
      seamGeometry: geometry
    }
  );
}

async function comparePlayerCompositePixels(page: Page) {
  const renderer = page.locator(
    '.flat-world-renderer[data-world-ready="true"]'
  );
  const canvas = renderer.locator("canvas");
  const playerBounds = numbers(
    await canvas.getAttribute("data-player-screen-bounds")
  );
  const rendererBounds = await renderer.boundingBox();
  const viewport = page.viewportSize();
  if (
    playerBounds.length !== 4 ||
    playerBounds.some((value) => !Number.isFinite(value)) ||
    !rendererBounds ||
    !viewport
  ) {
    throw new Error("Player composite capture bounds are unavailable.");
  }
  const [minimumX, minimumY, maximumX, maximumY] = playerBounds;
  const left = Math.max(0, Math.floor(rendererBounds.x + minimumX));
  const top = Math.max(0, Math.floor(rendererBounds.y + minimumY));
  const right = Math.min(
    viewport.width,
    Math.ceil(rendererBounds.x + maximumX)
  );
  const bottom = Math.min(
    viewport.height,
    Math.ceil(rendererBounds.y + maximumY)
  );
  const clip = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
  if (clip.width <= 0 || clip.height <= 0) {
    throw new Error("Player composite capture bounds are outside the viewport.");
  }

  const readLayerState = () =>
    renderer.evaluate((element) => {
      const canvasElement = element.querySelector<HTMLCanvasElement>("canvas");
      const shadow = element.querySelector<HTMLElement>(
        '[data-rpg-player-shadow="approved-contract"]'
      );
      const foreground = element.querySelector<HTMLElement>(
        '[data-rpg-reference-layer="foreground-frame"]'
      );
      return {
        profile: element.dataset.cameraProfile ?? null,
        zone:
          element.closest<HTMLElement>(".world-shell")?.dataset.currentZone ??
          null,
        canvasVisibility: canvasElement
          ? getComputedStyle(canvasElement).opacity === "0"
            ? "hidden"
            : getComputedStyle(canvasElement).visibility
          : null,
        shadowVisibility: shadow
          ? getComputedStyle(shadow).display === "none"
            ? "hidden"
            : getComputedStyle(shadow).visibility
          : null,
        foregroundPresent: Boolean(foreground),
        foregroundVisibility: foreground
          ? getComputedStyle(foreground).visibility
          : null,
        foregroundZIndex: foreground
          ? getComputedStyle(foreground).zIndex
          : null,
        foregroundCrossing:
          foreground?.dataset.rpgReferenceForegroundCrossing ?? null
      };
    });
  const visibleState = await readLayerState();
  if (
    visibleState.canvasVisibility !== "visible" ||
    visibleState.shadowVisibility !== "visible" ||
    !visibleState.foregroundPresent
  ) {
    throw new Error("Player composite layers are not ready for capture.");
  }

  const withPlayer = await page.screenshot({ clip });
  const originalVisibility = await renderer.evaluate((element) => {
    const canvasElement = element.querySelector<HTMLCanvasElement>("canvas");
    const shadow = element.querySelector<HTMLElement>(
      '[data-rpg-player-shadow="approved-contract"]'
    );
    if (!canvasElement || !shadow) {
      throw new Error("Player composite layers are unavailable.");
    }
    const original = {
      canvasOpacity: canvasElement.style.opacity,
      shadowDisplay: shadow.style.display,
      shadowDisplayPriority: shadow.style.getPropertyPriority("display")
    };
    canvasElement.style.opacity = "0";
    return original;
  });
  let withoutSprite: Buffer;
  let withoutPlayer: Buffer;
  let spriteHiddenState: Awaited<ReturnType<typeof readLayerState>>;
  let hiddenState: Awaited<ReturnType<typeof readLayerState>>;
  try {
    withoutSprite = await page.screenshot({ clip });
    spriteHiddenState = await readLayerState();
    await renderer.evaluate((element) => {
      const shadow = element.querySelector<HTMLElement>(
        '[data-rpg-player-shadow="approved-contract"]'
      );
      if (!shadow) throw new Error("Player shadow is unavailable.");
      shadow.style.setProperty("display", "none", "important");
    });
    withoutPlayer = await page.screenshot({ clip });
    hiddenState = await readLayerState();
  } finally {
    await renderer.evaluate(
      (element, original) => {
        const canvasElement =
          element.querySelector<HTMLCanvasElement>("canvas");
        const shadow = element.querySelector<HTMLElement>(
          '[data-rpg-player-shadow="approved-contract"]'
        );
        if (canvasElement) {
          canvasElement.style.opacity = original.canvasOpacity;
        }
        if (shadow) {
          shadow.style.setProperty(
            "display",
            original.shadowDisplay,
            original.shadowDisplayPriority
          );
        }
      },
      originalVisibility
    );
  }
  const restoredState = await readLayerState();
  const occlusionInput = await renderer.evaluate((element) => {
    const canvas = element.querySelector<HTMLCanvasElement>("canvas");
    const foreground = element.querySelector<HTMLElement>(
      '[data-rpg-reference-layer="foreground-frame"]'
    );
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    const imageFrame = (canvas?.dataset.rpgReferenceImageFrame ?? "")
      .split(",")
      .map(Number);
    const safeFrame = (canvas?.dataset.rpgReferenceSafeFrame ?? "")
      .split(",")
      .map(Number);
    const playerScreenFoot = (canvas?.dataset.playerScreenFoot ?? "")
      .split(",")
      .map(Number);
    const normalizedPolygons = JSON.parse(
      foreground?.dataset.rpgReferenceForegroundClip ?? "[]"
    ) as unknown;
    const sourcePolygons = JSON.parse(
      foreground?.dataset.rpgReferenceForegroundSourceClip ?? "[]"
    ) as unknown;
    if (
      !canvas ||
      !context ||
      imageFrame.length !== 4 ||
      safeFrame.length !== 4 ||
      playerScreenFoot.length !== 2 ||
      !Array.isArray(normalizedPolygons) ||
      !Array.isArray(sourcePolygons)
    ) {
      throw new Error("Player/foreground mask pixels are unavailable.");
    }
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const deviceScale = canvas.width / safeFrame[2];
    const alphaPixels: Array<[number, number]> = [];
    for (let index = 0; index < pixels.data.length; index += 4) {
      if (pixels.data[index + 3] <= 25) continue;
      const pixel = index / 4;
      alphaPixels.push([
        pixel % canvas.width,
        Math.floor(pixel / canvas.width)
      ]);
    }
    return {
      alphaPixels,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      deviceScale,
      safeFrame: {
        x: safeFrame[0],
        y: safeFrame[1],
        width: safeFrame[2],
        height: safeFrame[3]
      },
      imageFrame: {
        x: imageFrame[0],
        y: imageFrame[1],
        width: imageFrame[2],
        height: imageFrame[3]
      },
      playerScreenFoot: [playerScreenFoot[0], playerScreenFoot[1]] as const,
      normalizedPolygons,
      sourcePolygons
    };
  });
  const occlusion = measureNormalizedPlayerOcclusion(occlusionInput);
  const compareScreenshots = (
    beforeScreenshot: Buffer,
    afterScreenshot: Buffer
  ) =>
    page.evaluate(
      async ({ beforeBase64, afterBase64 }) => {
        const pixels = async (base64: string) => {
          const image = new Image();
          image.src = `data:image/png;base64,${base64}`;
          await image.decode();
          const canvasElement = document.createElement("canvas");
          canvasElement.width = image.naturalWidth;
          canvasElement.height = image.naturalHeight;
          const context = canvasElement.getContext("2d", {
            willReadFrequently: true
          });
          if (!context) throw new Error("Canvas 2D context unavailable.");
          context.drawImage(image, 0, 0);
          return context.getImageData(
            0,
            0,
            canvasElement.width,
            canvasElement.height
          );
        };
        const before = await pixels(beforeBase64);
        const after = await pixels(afterBase64);
        if (
          before.width !== after.width ||
          before.height !== after.height
        ) {
          throw new Error("Player composite comparison dimensions differ.");
        }
        let maximumChannelDelta = 0;
        let changedPixelCount = 0;
        let changedMinimumX = before.width;
        let changedMinimumY = before.height;
        let changedMaximumX = -1;
        let changedMaximumY = -1;
        let lumaDecrease = 0;
        for (let index = 0; index < before.data.length; index += 4) {
          let changed = false;
          for (let channel = 0; channel < 4; channel += 1) {
            const delta = Math.abs(
              before.data[index + channel] - after.data[index + channel]
            );
            maximumChannelDelta = Math.max(maximumChannelDelta, delta);
            changed ||= delta > 1;
          }
          if (changed) {
            changedPixelCount += 1;
            const pixel = index / 4;
            const x = pixel % before.width;
            const y = Math.floor(pixel / before.width);
            changedMinimumX = Math.min(changedMinimumX, x);
            changedMinimumY = Math.min(changedMinimumY, y);
            changedMaximumX = Math.max(changedMaximumX, x);
            changedMaximumY = Math.max(changedMaximumY, y);
            const beforeLuma =
              before.data[index] * 0.2126 +
              before.data[index + 1] * 0.7152 +
              before.data[index + 2] * 0.0722;
            const afterLuma =
              after.data[index] * 0.2126 +
              after.data[index + 1] * 0.7152 +
              after.data[index + 2] * 0.0722;
            lumaDecrease += afterLuma - beforeLuma;
          }
        }
        return {
          width: before.width,
          height: before.height,
          maximumChannelDelta,
          changedPixelCount,
          changedBounds:
            changedPixelCount === 0
              ? null
              : {
                  minimumX: changedMinimumX,
                  minimumY: changedMinimumY,
                  maximumX: changedMaximumX,
                  maximumY: changedMaximumY
                },
          lumaDecrease
        };
      },
      {
        beforeBase64: beforeScreenshot.toString("base64"),
        afterBase64: afterScreenshot.toString("base64")
      }
    );
  const spriteComparison = await compareScreenshots(
    withPlayer,
    withoutSprite
  );
  const compositeComparison = await compareScreenshots(
    withPlayer,
    withoutPlayer
  );
  const shadowComparison = await compareScreenshots(
    withoutSprite,
    withoutPlayer
  );
  const minimumChangedPixelCount =
    visibleState.profile === "mobile"
      ? 1300
      : visibleState.zone === "airport"
        ? 2000
        : 1500;
  const minimumShadowChangedPixelCount =
    visibleState.profile === "mobile"
      ? 160
      : visibleState.zone === "airport"
        ? 220
        : 180;
  const foregroundUnchanged =
    visibleState.foregroundVisibility ===
      spriteHiddenState.foregroundVisibility &&
    visibleState.foregroundZIndex === spriteHiddenState.foregroundZIndex &&
    visibleState.foregroundCrossing === spriteHiddenState.foregroundCrossing &&
    visibleState.foregroundVisibility === hiddenState.foregroundVisibility &&
    visibleState.foregroundZIndex === hiddenState.foregroundZIndex &&
    visibleState.foregroundCrossing === hiddenState.foregroundCrossing;
  const minimumIntersectionRatio =
    visibleState.zone === "airport" ? 0.12 : 0.18;
  const maximumIntersectionRatio =
    visibleState.zone === "airport" ? 0.3 : 0.4;
  const failedPredicates = [
    ...occlusion.failedPredicates.map(
      (predicate) => `occlusion.${predicate}`
    ),
    ...(spriteComparison.maximumChannelDelta > 8
      ? []
      : ["sprite.maximumChannelDelta>8"]),
    ...(spriteComparison.changedPixelCount >= minimumChangedPixelCount
      ? []
      : ["sprite.changedPixelCount>=minimum"]),
    ...(spriteComparison.changedBounds !== null
      ? []
      : ["sprite.changedBounds"]),
    ...(compositeComparison.maximumChannelDelta > 8
      ? []
      : ["composite.maximumChannelDelta>8"]),
    ...(compositeComparison.changedPixelCount >= minimumChangedPixelCount
      ? []
      : ["composite.changedPixelCount>=minimum"]),
    ...(shadowComparison.changedPixelCount >= minimumShadowChangedPixelCount
      ? []
      : ["shadow.changedPixelCount>=minimum"]),
    ...(shadowComparison.lumaDecrease > 0
      ? []
      : ["shadow.lumaDecrease>0"]),
    ...(occlusion.intersectionRatio >= minimumIntersectionRatio
      ? []
      : ["occlusion.intersectionRatio>=minimum"]),
    ...(occlusion.intersectionRatio <= maximumIntersectionRatio
      ? []
      : ["occlusion.intersectionRatio<=maximum"]),
    ...(occlusion.playerRemainingRatio >= 0.65
      ? []
      : ["occlusion.playerRemainingRatio>=0.65"]),
    ...(occlusion.alphaBottomToFootCssPixels !== null
      ? []
      : ["occlusion.alphaBottomToFootCssPixels"]),
    ...(occlusion.alphaBottomToFootCssPixels !== null &&
    occlusion.alphaBottomToFootCssPixels <= 2
      ? []
      : ["occlusion.alphaBottomToFootCssPixels<=2"]),
    ...(foregroundUnchanged ? [] : ["foregroundUnchanged"]),
    ...(spriteHiddenState.canvasVisibility === "hidden"
      ? []
      : ["spriteHidden.canvasVisibility"]),
    ...(spriteHiddenState.shadowVisibility === "visible"
      ? []
      : ["spriteHidden.shadowVisibility"]),
    ...(hiddenState.canvasVisibility === "hidden"
      ? []
      : ["playerHidden.canvasVisibility"]),
    ...(hiddenState.shadowVisibility === "hidden"
      ? []
      : ["playerHidden.shadowVisibility"]),
    ...(restoredState.canvasVisibility === "visible"
      ? []
      : ["restored.canvasVisibility"]),
    ...(restoredState.shadowVisibility === "visible"
      ? []
      : ["restored.shadowVisibility"])
  ];
  return {
    method: "player-bounds-browser-canvas-image-data",
    playerBounds,
    clip,
    ...spriteComparison,
    compositeComparison,
    shadowComparison,
    minimumChangedPixelCount,
    minimumShadowChangedPixelCount,
    occlusion,
    foregroundUnchanged,
    visibleState,
    spriteHiddenState,
    hiddenState,
    restoredState,
    failedPredicates,
    passed: failedPredicates.length === 0
  };
}

test("normalized player occlusion coordinate contract", () => {
  const imageFrame = { x: 10.5, y: 20.5, width: 99, height: 99 };
  const safeFrame = { x: 10, y: 20, width: 100, height: 100 };
  expect(
    playerPixelCenterCoordinates({
      column: 0,
      row: 0,
      deviceScale: 1,
      safeFrame,
      imageFrame
    })
  ).toMatchObject({ normalizedX: 0, normalizedY: 0 });
  expect(
    playerPixelCenterCoordinates({
      column: 99,
      row: 99,
      deviceScale: 1,
      safeFrame,
      imageFrame
    })
  ).toMatchObject({ normalizedX: 1, normalizedY: 1 });
  expect(
    playerPixelCenterCoordinates({
      column: 49.5,
      row: 49.5,
      deviceScale: 1,
      safeFrame,
      imageFrame
    })
  ).toMatchObject({ normalizedX: 0.5, normalizedY: 0.5 });
  expect(() =>
    playerPixelCenterCoordinates({
      column: 0,
      row: 0,
      deviceScale: 0,
      safeFrame,
      imageFrame
    })
  ).toThrow("device scale");
  expect(() =>
    playerPixelCenterCoordinates({
      column: 0,
      row: 0,
      deviceScale: 1,
      safeFrame,
      imageFrame: { ...imageFrame, width: 0 }
    })
  ).toThrow("image frame");

  const sourcePolygons = [
    [
      [0, 0],
      [1817, 0],
      [0, 866]
    ]
  ];
  const normalizedPolygons = [
    [
      [0, 0],
      [1, 0],
      [0, 1]
    ]
  ];
  const parsedNormalized = parseNormalizedPolygons(normalizedPolygons);
  const parsedSource = parseSourcePolygons(sourcePolygons);
  expect(
    provePolygonEquivalence(parsedNormalized, parsedSource)
  ).toMatchObject({
    passed: true,
    equivalenceTolerance: 0,
    polygonCount: 1,
    pointCount: 3
  });
  expect(pointInPolygonUnion([0.25, 0.25], parsedNormalized)).toBe(true);
  expect(pointInPolygonUnion([1.25, 1.25], parsedNormalized)).toBe(false);
  expect(
    pointInPolygonUnion(
      [0.25 * 1817, 0.25 * 866],
      parsedSource
    )
  ).toBe(true);
  expect(() =>
    provePolygonEquivalence(
      parseNormalizedPolygons([
        [
          [1 / 1817 + Number.EPSILON, 1 / 866],
          [1, 0],
          [0, 1]
        ]
      ]),
      parseSourcePolygons([
        [
          [1, 1],
          [1817, 0],
          [0, 866]
        ]
      ])
    )
  ).toThrow("normalizedX !== sourceX / 1817");
  expect(() =>
    parseNormalizedPolygons([
      [
        [0, 0],
        [1, 0],
        [0, Number.NaN]
      ]
    ])
  ).toThrow("is invalid");
  expect(() =>
    parseNormalizedPolygons([
      [
        [0, 0],
        [1, 0],
        [0, 1 + Number.EPSILON]
      ]
    ])
  ).toThrow("is invalid");

  const proofInput = {
    alphaPixels: [[24, 24]] as const,
    canvasWidth: 100,
    canvasHeight: 100,
    deviceScale: 1,
    safeFrame: { x: 0, y: 0, width: 100, height: 100 },
    imageFrame: { x: 0, y: 0, width: 100, height: 100 },
    playerScreenFoot: [24.5, 24.5] as const,
    normalizedPolygons,
    sourcePolygons
  };
  const proof = measureNormalizedPlayerOcclusion(proofInput);
  expect(proof).toMatchObject({
    coordinateSpace: "normalized-image-frame",
    equivalence: { passed: true, equivalenceTolerance: 0 },
    classificationParity: {
      passed: true,
      comparedAlphaPixels: 1,
      mismatchCount: 0
    },
    playerAlphaPixels: 1,
    intersectionAlphaPixels: 1,
    ratioConsistencyTolerance: Number.EPSILON,
    alphaBottomToFootCssPixels: 0,
    failedPredicates: [],
    passed: true
  });
  expect(proof).not.toHaveProperty("outsideMaskChangedPixelCount");
  expect(pointInPolygonUnion([24.5, 24.5], parsedNormalized)).toBe(false);

  let classificationCall = 0;
  const parityFailure = measureNormalizedPlayerOcclusion(proofInput, {
    parseNormalizedPolygons,
    parseSourcePolygons,
    polygonPointBounds,
    provePolygonEquivalence,
    playerPixelCenterCoordinates,
    pointInPolygonUnion: () => {
      classificationCall += 1;
      return classificationCall % 2 === 1;
    }
  });
  expect(parityFailure.classificationParity).toMatchObject({
    passed: false,
    mismatchCount: 1
  });
  expect(parityFailure.failedPredicates).toContain(
    "normalizedSourceClassificationParity"
  );
  expect(parityFailure.passed).toBe(false);
});

test("captures and validates the approved desktop and mobile reference", async ({
  browser,
  page
}) => {
  test.skip(PREFLIGHT, "Full capture is disabled in bounded preflight mode.");
  await mkdir(DESKTOP_DIRECTORY, { recursive: true });
  await mkdir(MOBILE_DIRECTORY, { recursive: true });
  await page.setViewportSize(DESKTOP_VIEWPORT);

  const errors: Array<{ kind: string; message: string; url?: string }> = [];
  const actionErrors: string[] = [];
  const desktopRows: Array<Record<string, unknown>> = [];
  const mobileRows: Array<Record<string, unknown>> = [];
  let requestLedgers: RequestLedger[] = [];
  const screenshots = { desktop: [] as string[], mobile: [] as string[] };
  let clipSeam: Awaited<ReturnType<typeof compareSameSourceClipSeam>> | null =
    null;

  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push({ kind: "console", message: message.text() });
    }
  });
  page.on("pageerror", (error) =>
    errors.push({ kind: "pageerror", message: error.message })
  );
  page.on("requestfailed", (request) =>
    errors.push({
      kind: "requestfailed",
      message: request.failure()?.errorText ?? "request failed",
      url: request.url()
    })
  );
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push({
        kind: "http",
        message: String(response.status()),
        url: response.url()
      });
    }
  });

  const recordDesktop = async (
    id: DesktopRowId,
    character?: Character
  ) => {
    const relativePath = `desktop/${id}.png`;
    const state = character
      ? await readWorldTelemetry(page)
      : await readStartTelemetry(page);
    if (character) assertWorldTelemetry(state as Awaited<ReturnType<typeof readWorldTelemetry>>, "desktop", character);
    else
      assertStartTelemetry(
        state as Awaited<ReturnType<typeof readStartTelemetry>>,
        id === "start" ? "start" : "select",
        DESKTOP_VIEWPORT
      );
    const playerComposite =
      character && (id === "zone-airport" || id === "zone-hanabi")
        ? await comparePlayerCompositePixels(page)
        : null;
    if (playerComposite) {
      expect(
        playerComposite.passed,
        `${id}:${JSON.stringify(playerComposite, null, 2)}`
      ).toBe(true);
    }
    const map = await readMapTelemetry(page);
    await page.screenshot({
      path: join(EVIDENCE_DIRECTORY, relativePath),
      fullPage: false
    });
    screenshots.desktop.push(relativePath);
    desktopRows.push({
      id,
      screenshot: relativePath,
      references: references[id],
      state,
      playerComposite,
      map
    });
  };

  const recordMobile = async (
    id: MobileRowId,
    character?: Character
  ) => {
    const relativePath = `mobile/${id}.png`;
    const state = character
      ? await readWorldTelemetry(page)
      : await readStartTelemetry(page);
    if (character) assertWorldTelemetry(state as Awaited<ReturnType<typeof readWorldTelemetry>>, "mobile", character);
    else
      assertStartTelemetry(
        state as Awaited<ReturnType<typeof readStartTelemetry>>,
        id === "start" ? "start" : "select",
        MOBILE_VIEWPORT
      );
    const playerComposite = null;
    const map = await readMapTelemetry(page);
    await page.screenshot({
      path: join(EVIDENCE_DIRECTORY, relativePath),
      fullPage: false
    });
    screenshots.mobile.push(relativePath);
    mobileRows.push({
      id,
      screenshot: relativePath,
      state,
      playerComposite,
      map
    });
  };

  const openSelection = async () => {
    await page.goto("/en");
    await advanceToCharacterSelection(page);
  };

  const enterWorld = async (
    character: Character,
    profile: "desktop" | "mobile"
  ) => {
    await selectCharacter(page, character);
    await page.getByRole("button", { name: "ENTER WORLD" }).click();
    await waitForWorld(page, profile);
  };

  const travel = async (
    zone: "tokyo" | "gyukatsu" | "sakura" | "hanabi"
  ) => {
    const label = zone[0].toUpperCase() + zone.slice(1);
    await page.getByRole("button", { name: /Open world map/ }).click();
    await page.getByRole("button", { name: `Travel to: ${label}` }).click();
    await expect(page.locator(".world-shell")).toHaveAttribute(
      "data-current-zone",
      zone
    );
    await waitForWorld(page, "desktop");
  };

  try {
    requestLedgers = await collectThreeRequestLedgers(browser);
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/en");
    await recordDesktop("start");
    await advanceToCharacterSelection(page);
    await selectCharacter(page, "male");
    await recordDesktop("selection-male");
    await selectCharacter(page, "female");
    await recordDesktop("selection-female");

    await openSelection();
    await enterWorld("male", "desktop");
    await recordDesktop("world-male", "male");

    await openSelection();
    await enterWorld("female", "desktop");
    await recordDesktop("world-female", "female");
    await recordDesktop("zone-airport", "female");
    clipSeam = await compareSameSourceClipSeam(page);
    expect(clipSeam.outsideMaskChangedPixelCount).toBe(0);
    expect(clipSeam.boundaryMaximumDelta).toBeLessThanOrEqual(1);
    expect(clipSeam.seamComponentCount).toBe(0);
    expect(
      clipSeam.passed,
      JSON.stringify(clipSeam, null, 2)
    ).toBe(true);

    for (const zone of ["tokyo", "gyukatsu", "sakura", "hanabi"] as const) {
      await travel(zone);
      await recordDesktop(`zone-${zone}`, "female");
      if (zone === "hanabi") {
        expect(numbers((await readWorldTelemetry(page)).position)).toEqual([
          26,
          0,
          -18
        ]);
      }
    }

    const miniMapTelemetry = await readMapTelemetry(page);
    const worldTelemetry = await readWorldTelemetry(page);
    assertMapTelemetry(miniMapTelemetry.mini, worldTelemetry.navigationRevision);
    await recordDesktop("mini-map", "female");
    await page.getByRole("button", { name: /Open world map/ }).click();
    await expect(page.getByRole("dialog", { name: "World map" })).toBeVisible();
    const fullMapTelemetry = await readMapTelemetry(page);
    assertMapTelemetry(fullMapTelemetry.full, worldTelemetry.navigationRevision);
    await recordDesktop("full-map", "female");

    await page.setViewportSize(MOBILE_VIEWPORT);
    await page.goto("/en");
    await recordMobile("start");
    await advanceToCharacterSelection(page);
    await selectCharacter(page, "female");
    await recordMobile("selection-female");
    await enterWorld("female", "mobile");
    await page.keyboard.down("ArrowRight");
    await page.waitForTimeout(180);
    await page.keyboard.up("ArrowRight");
    await waitForWorld(page, "mobile");
    await recordMobile("world-female", "female");
    const miniToggle = page.locator(".rpg-mini-map-toggle");
    if ((await miniToggle.getAttribute("aria-expanded")) !== "true") {
      await miniToggle.click();
    }
    await expect(miniToggle).toHaveAttribute("aria-expanded", "true");
    await recordMobile("expanded-mini-map", "female");
    await page.getByRole("button", { name: /Open world map/ }).click();
    await expect(page.getByRole("dialog", { name: "World map" })).toBeVisible();
    await recordMobile("full-map", "female");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    actionErrors.push(message);
    errors.push({ kind: "action", message });
    throw error;
  } finally {
    const desktopIds = desktopRows.map(({ id }) => id);
    const mobileIds = mobileRows.map(({ id }) => id);
    await writeFile(
      join(EVIDENCE_DIRECTORY, "approved-reference.json"),
      `${JSON.stringify(
        {
          schemaVersion: 3,
          mode: "full",
          generatedAt: new Date().toISOString(),
          evidenceDirectory: EVIDENCE_DIRECTORY,
          approvedSource: {
            asset: APPROVED_SOURCE,
            naturalWidth: REFERENCE_IMAGE.width,
            naturalHeight: REFERENCE_IMAGE.height,
            backdropImageCount: 1,
            foregroundImageCount: 1
          },
          authorizedPathCount: AUTHORIZED_PATH_COUNT,
          desktop: {
            viewport: DESKTOP_VIEWPORT,
            rows: desktopRows
          },
          mobile: {
            viewport: MOBILE_VIEWPORT,
            rows: mobileRows
          },
          screenshots,
          requestLedgers,
          clipSeam,
          errors,
          actionErrors,
          assertions: {
            exactDesktopRows:
              JSON.stringify(desktopIds) === JSON.stringify(DESKTOP_ROWS),
            exactMobileRows:
              JSON.stringify(mobileIds) === JSON.stringify(MOBILE_ROWS),
            exactDesktopScreenshotCount: screenshots.desktop.length === 12,
            exactMobileScreenshotCount: screenshots.mobile.length === 5,
            zeroRuntimeErrors: errors.length === 0,
            zeroActionErrors: actionErrors.length === 0,
            clipSeamPassed: clipSeam?.passed === true,
            exactFreshContextRequestLedgers:
              requestLedgers.length === 3 &&
              requestLedgers.map(({ identity }) => identity).join(",") ===
                "desktop-male,desktop-female,mobile-female"
          }
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  }

  expect(desktopRows.map(({ id }) => id)).toEqual(DESKTOP_ROWS);
  expect(mobileRows.map(({ id }) => id)).toEqual(MOBILE_ROWS);
  expect(screenshots.desktop).toHaveLength(12);
  expect(screenshots.mobile).toHaveLength(5);
  expect(clipSeam?.passed).toBe(true);
  assertRequestLedgers(requestLedgers);
  expect(actionErrors).toEqual([]);
  expect(errors).toEqual([]);
});

test("player pixels survive foreground composition at desktop Airport, desktop Hanabi, and mobile Hanabi", async ({
  page
}) => {
  test.skip(PREFLIGHT, "Direct composition regression is not a preflight row.");
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto("/en");
  await advanceToCharacterSelection(page);
  await selectCharacter(page, "female");
  await page.getByRole("button", { name: "ENTER WORLD" }).click();
  await waitForWorld(page, "desktop");

  const airport = await readWorldTelemetry(page);
  assertWorldTelemetry(airport, "desktop", "female");
  expect(airport.zone).toBe("airport");
  const desktopAirport = await comparePlayerCompositePixels(page);
  expect(
    desktopAirport.passed,
    JSON.stringify(desktopAirport, null, 2)
  ).toBe(true);

  await page.getByRole("button", { name: /Open world map/ }).click();
  await page.getByRole("button", { name: "Travel to: Hanabi" }).click();
  await expect(page.locator(".world-shell")).toHaveAttribute(
    "data-current-zone",
    "hanabi"
  );
  await waitForWorld(page, "desktop");
  const hanabi = await readWorldTelemetry(page);
  assertWorldTelemetry(hanabi, "desktop", "female");
  expect(hanabi.zone).toBe("hanabi");
  const desktopHanabi = await comparePlayerCompositePixels(page);
  expect(
    desktopHanabi.passed,
    JSON.stringify(desktopHanabi, null, 2)
  ).toBe(true);

  await page.setViewportSize(MOBILE_VIEWPORT);
  await waitForWorld(page, "mobile");
  const mobileHanabiState = await readWorldTelemetry(page);
  assertWorldTelemetry(mobileHanabiState, "mobile", "female");
  expect(mobileHanabiState.zone).toBe("hanabi");
  const mobileHanabi = await comparePlayerCompositePixels(page);
  expect(
    mobileHanabi.passed,
    JSON.stringify(mobileHanabi, null, 2)
  ).toBe(true);

  for (const proof of [desktopAirport, desktopHanabi, mobileHanabi]) {
    expect(proof.foregroundUnchanged).toBe(true);
    expect(proof.occlusion.alphaBottomToFootCssPixels).not.toBeNull();
    expect(proof.occlusion.alphaBottomToFootCssPixels).toBeLessThanOrEqual(2);
    expect(proof.changedPixelCount).toBeGreaterThanOrEqual(
      proof.minimumChangedPixelCount
    );
    expect(proof.maximumChannelDelta).toBeGreaterThan(8);
  }
  await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
  await writeFile(
    join(EVIDENCE_DIRECTORY, "option-b-player-pixels.json"),
    `${JSON.stringify(
      {
        desktopAirport,
        desktopHanabi,
        mobileHanabi
      },
      null,
      2
    )}\n`,
    "utf8"
  );
});

test("bounded preflight captures only four non-counting screens", async ({
  browser,
  page
}) => {
  test.skip(
    !PREFLIGHT || !STRICT_EVIDENCE,
    "Strict bounded preflight mode is not enabled."
  );
  const attemptNumber = Number(process.env.ARCHITECTURE_ATTEMPT_NUMBER);
  expect(attemptNumber).toBe(4);
  await mkdir(DESKTOP_DIRECTORY, { recursive: true });
  await mkdir(MOBILE_DIRECTORY, { recursive: true });
  const screenshots: string[] = [];
  const errors: string[] = [];
  const requestLedgers = await collectThreeRequestLedgers(browser);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) =>
    errors.push(request.failure()?.errorText ?? "request failed")
  );
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize(DESKTOP_VIEWPORT);
  await page.goto("/en");
  await advanceToCharacterSelection(page);
  await selectCharacter(page, "female");
  await page.getByRole("button", { name: "ENTER WORLD" }).click();
  await waitForWorld(page, "desktop");
  const airport = await readWorldTelemetry(page);
  assertWorldTelemetry(airport, "desktop", "female");
  const desktopAirport = await comparePlayerCompositePixels(page);
  expect(
    desktopAirport.passed,
    JSON.stringify(desktopAirport, null, 2)
  ).toBe(true);
  const clipSeam = await compareSameSourceClipSeam(page);
  expect(clipSeam.outsideMaskChangedPixelCount).toBe(0);
  expect(clipSeam.boundaryMaximumDelta).toBeLessThanOrEqual(1);
  expect(clipSeam.seamComponentCount).toBe(0);
  expect(clipSeam.passed).toBe(true);
  await page.screenshot({
    path: join(DESKTOP_DIRECTORY, "zone-airport.png"),
    fullPage: false
  });
  screenshots.push("desktop/zone-airport.png");
  await page.getByRole("button", { name: /Open world map/ }).click();
  await page.getByRole("button", { name: "Travel to: Hanabi" }).click();
  await waitForWorld(page, "desktop");
  const hanabi = await readWorldTelemetry(page);
  assertWorldTelemetry(hanabi, "desktop", "female");
  const desktopHanabi = await comparePlayerCompositePixels(page);
  expect(
    desktopHanabi.passed,
    JSON.stringify(desktopHanabi, null, 2)
  ).toBe(true);
  await page.screenshot({
    path: join(DESKTOP_DIRECTORY, "zone-hanabi.png"),
    fullPage: false
  });
  screenshots.push("desktop/zone-hanabi.png");

  await page.setViewportSize(MOBILE_VIEWPORT);
  await waitForWorld(page, "mobile");
  const mobileWorld = await readWorldTelemetry(page);
  assertWorldTelemetry(mobileWorld, "mobile", "female");
  const mobileHanabi = await comparePlayerCompositePixels(page);
  expect(
    mobileHanabi.passed,
    JSON.stringify(mobileHanabi, null, 2)
  ).toBe(true);
  await page.screenshot({
    path: join(MOBILE_DIRECTORY, "world-female.png"),
    fullPage: false
  });
  screenshots.push("mobile/world-female.png");
  await page.getByRole("button", { name: /Open world map/ }).click();
  await expect(page.getByRole("dialog", { name: "World map" })).toBeVisible();
  await page.screenshot({
    path: join(MOBILE_DIRECTORY, "full-map.png"),
    fullPage: false
  });
  screenshots.push("mobile/full-map.png");
  const screenshotSnapshot = await snapshotEvidenceFiles(screenshots);

  const evidence = {
    schemaVersion: 2,
    mode: "strict-preflight",
    status: errors.length === 0 ? "PASS" : "FAIL",
    attemptNumber,
    countsAsAttempt: false,
    createsGlobalLock: false,
    createsReviews: false,
    generatedAt: new Date().toISOString(),
    evidenceDirectory: EVIDENCE_DIRECTORY,
    rows: PREFLIGHT_ROWS,
    screenshots,
    screenshotSnapshot,
    clipSeam,
    playerProofs: {
      desktopAirport,
      desktopHanabi,
      mobileHanabi
    },
    requestLedgers,
    requestLedgerValidation: {
      status: "PASS",
      identities: requestLedgers.map(({ identity }) => identity)
    },
    errors
  };
  await writeFile(
    join(EVIDENCE_DIRECTORY, "strict-preflight.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    { encoding: "utf8", flag: "wx" }
  );
  expect(screenshots).toHaveLength(4);
  assertRequestLedgers(requestLedgers);
  expect(errors).toEqual([]);
});
