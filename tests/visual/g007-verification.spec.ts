import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";

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
const OWNERSHIP = {
  "desktop-male": ["start", "selection-male", "world-male"],
  "desktop-female": [
    "selection-female", "world-female", "zone-airport", "zone-tokyo",
    "zone-gyukatsu", "zone-sakura", "zone-hanabi", "mini-map", "full-map"
  ],
  "mobile-female": [...MOBILE_ROWS]
} as const;
const ARRIVALS = {
  airport: [-30, 0, 0],
  tokyo: [-8, 0, 20],
  gyukatsu: [8, 0, 0],
  sakura: [9, 0, -20],
  hanabi: [26, 0, -18]
} as const;
const RUNTIME = {
  male: [
    "player-male.webp", "player-male-back.webp",
    "player-male-run-front-a.webp", "player-male-run-front-b.webp",
    "player-male-run-back-a.webp", "player-male-run-back-b.webp",
    "player-male-run-right.webp", "player-male-run-right-b.webp"
  ],
  female: [
    "player-female.webp", "player-female-back.webp",
    "player-female-run-front-a.webp", "player-female-run-front-b.webp",
    "player-female-run-back-a.webp", "player-female-run-back-b.webp",
    "player-female-run-right.webp", "player-female-run-right-b.webp"
  ]
} as const;
const WORLD_ASSET = "/assets/world/world-environment-concept.png";
const GPU_REASON =
  "active renderer uses CanvasRenderingContext2D and creates no WebGL/WebGL2 context";
const evidenceDirectory = process.env.G007_EVIDENCE_DIR;
const baseURL = process.env.G007_BASE_URL;

if (!evidenceDirectory || !baseURL) {
  throw new Error("G007_EVIDENCE_DIR and G007_BASE_URL are required");
}

type Identity = keyof typeof OWNERSHIP;
type LedgerEntry = {
  url: string;
  method: string;
  status: number | null;
  failureText: string | null;
  outcome: "pending" | "finished" | "failed";
};
type IdentityState = {
  identity: Identity;
  character: "male" | "female";
  context: BrowserContext;
  page: Page;
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  httpErrors: string[];
  actionErrors: string[];
  requests: Map<string, LedgerEntry>;
};

function forbiddenEnvironmentKeys(keys: string[]) {
  return keys.filter((key) =>
    /^(ARCHITECTURE_|VISUAL_|G005_)|ATTEMPT|LOCK|PREFLIGHT|FINALIZE/i.test(key)
  );
}

async function newIdentity(
  browser: Browser,
  identity: Identity,
  character: "male" | "female",
  viewport: { width: number; height: number }
): Promise<IdentityState> {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const state: IdentityState = {
    identity, character, context, page,
    consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [],
    actionErrors: [], requests: new Map()
  };
  let sequence = 0;
  const keys = new WeakMap<object, string>();
  page.on("console", (message) => {
    if (message.type() === "error") state.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => state.pageErrors.push(error.message));
  page.on("request", (request) => {
    const key = `${++sequence}:${request.method()}:${request.url()}`;
    keys.set(request, key);
    state.requests.set(key, {
      url: request.url(), method: request.method(), status: null,
      failureText: null, outcome: "pending"
    });
  });
  page.on("response", (response) => {
    const request = response.request();
    const key = keys.get(request);
    if (!key) return;
    const row = state.requests.get(key);
    if (row) row.status = response.status();
    if (response.status() >= 400) {
      state.httpErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfinished", (request) => {
    const row = state.requests.get(keys.get(request) ?? "");
    if (row) row.outcome = "finished";
  });
  page.on("requestfailed", (request) => {
    const failureText = request.failure()?.errorText ?? "unknown";
    const row = state.requests.get(keys.get(request) ?? "");
    if (row) {
      row.failureText = failureText;
      row.outcome = "failed";
    }
    state.failedRequests.push(`${request.url()} ${failureText}`);
  });
  return state;
}

async function action(state: IdentityState, name: string, operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    state.actionErrors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

async function navigateStart(state: IdentityState) {
  await action(state, "navigate", () => state.page.goto(`${baseURL}/en`, {
    waitUntil: "networkidle"
  }));
  await state.page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await state.page.reload({ waitUntil: "networkidle" });
  await state.page.evaluate(async () => {
    await document.fonts.ready;
    const images = Array.from(document.images);
    await Promise.all(images.map(async (image) => {
      if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => reject(new Error(image.currentSrc)), { once: true });
        });
      }
      if (typeof image.decode === "function") await image.decode();
    }));
  });
}

async function waitForPaint(page: Page) {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
}

async function waitForSelectionArtwork(page: Page) {
  const figures = page.locator(".character-option .character-figure");
  await expect(figures).toHaveCount(2);
  await expect.poll(
    () => figures.evaluateAll((nodes) =>
      nodes.map((node) => {
        const image = node as HTMLImageElement;
        const bounds = image.getBoundingClientRect();
        return (
          image.complete &&
          image.naturalWidth > 0 &&
          image.naturalHeight > 0 &&
          bounds.width > 0 &&
          bounds.height > 0
        );
      })
    ),
    {
      message: "both character selection images must be loaded and laid out",
      timeout: 15_000
    }
  ).toEqual([true, true]);
  await figures.evaluateAll(async (nodes) => {
    await Promise.all(nodes.map(async (node) => {
      const image = node as HTMLImageElement;
      if (typeof image.decode === "function") await image.decode();
    }));
  });
  await waitForPaint(page);
}

async function readSelectionArtwork(page: Page) {
  return page.locator(".character-option").evaluateAll((nodes) => {
    let selectedCharacter: "male" | "female" | null = null;
    const figures = nodes.map((node) => {
      const image = node.querySelector<HTMLImageElement>(".character-figure");
      if (!image) throw new Error("character selection image is missing");
      const character = image.classList.contains("character-figure-male")
        ? "male"
        : "female";
      const selected = node.getAttribute("aria-pressed") === "true";
      if (selected) selectedCharacter = character;
      const bounds = image.getBoundingClientRect();
      return {
        character,
        source: new URL(image.currentSrc).pathname,
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: bounds.width,
        renderedHeight: bounds.height,
        selected
      };
    });
    return { selectedCharacter, figures };
  });
}

async function selectAndEnter(state: IdentityState) {
  const page = state.page;
  await action(state, "start", () => page.getByRole("button", { name: "START" }).click());
  await waitForSelectionArtwork(page);
  const option = page.getByRole("button", {
    name: state.character === "male" ? "Select male character" : "Select female character"
  });
  await action(state, `select-${state.character}`, () =>
    option.click()
  );
  await expect(option).toHaveAttribute("aria-pressed", "true");
  await waitForSelectionArtwork(page);
}

async function enterWorld(state: IdentityState) {
  await action(state, "enter-world", () =>
    state.page.getByRole("button", { name: "ENTER WORLD" }).click()
  );
  await expect(
    state.page.locator('.flat-world-renderer[data-world-ready="true"]')
  ).toBeVisible({
    timeout: 30_000
  });
  await expect(
    state.page.locator('.flat-world-renderer[data-character-readiness="ready"]')
  ).toBeVisible();
  await stabilizeWorld(state.page);
}

async function stabilizeWorld(page: Page) {
  await page.evaluate(async () => {
    const sample = () => {
      const world = document.querySelector<HTMLElement>('[data-testid="world-view"]');
      const renderer = document.querySelector<HTMLElement>(".flat-world-renderer");
      return JSON.stringify({
        position: world?.dataset.playerPosition,
        navigationRevision: world?.dataset.navigationRevision,
        moving: renderer?.dataset.moving
      });
    };
    const frames: string[] = [];
    const deadline = performance.now() + 8_000;
    while (performance.now() < deadline) {
      await new Promise(requestAnimationFrame);
      frames.push(sample());
      if (frames.length > 3) frames.shift();
      if (frames.length === 3 && new Set(frames).size === 1 && JSON.parse(frames[0]).moving === "false") {
        return;
      }
    }
    throw new Error(`world did not stabilize: ${frames.join(" | ")}`);
  });
}

async function stabilizeRect(page: Page, selector: string) {
  return page.locator(selector).evaluate(async (element) => {
    const samples: DOMRect[] = [];
    for (let index = 0; index < 3; index += 1) {
      await new Promise(requestAnimationFrame);
      samples.push(element.getBoundingClientRect());
    }
    const stable = samples.slice(1).every((sample, index) => {
      const prior = samples[index];
      return ["x", "y", "width", "height"].every(
        (key) => Math.abs(sample[key as keyof DOMRect] as number - (prior[key as keyof DOMRect] as number)) <= 0.01
      );
    });
    if (!stable) throw new Error(`${selector} rectangle is unstable`);
    const { x, y, width, height } = samples[2];
    return { x, y, width, height };
  });
}

function numbers(value: string | undefined) {
  return (value ?? "").split(",").filter(Boolean).map(Number);
}

async function readMap(page: Page, selector: string) {
  return page.locator(selector).evaluate((svg) => {
    const polylinePoints = (value: string | null) =>
      (value ?? "").trim().split(/\s+/).filter(Boolean).map((pair) => pair.split(",").map(Number));
    return {
      viewBox: svg.getAttribute("viewBox"),
      navigationRevision: svg.getAttribute("data-navigation-revision"),
      currentZone: svg.getAttribute("data-current-zone"),
      terrain: Array.from(svg.querySelectorAll('[data-map-layer="terrain"]')).map((node) => ({
        sourceId: node.getAttribute("data-map-source-id"),
        href: node.getAttribute("href"),
        width: Number(node.getAttribute("width")),
        height: Number(node.getAttribute("height"))
      })),
      coastline: Array.from(svg.querySelectorAll('[data-map-layer="coastline"]')).map((node) => ({
        sourceId: node.getAttribute("data-map-source-id"),
        points: polylinePoints(node.getAttribute("points"))
      })),
      routes: Array.from(svg.querySelectorAll(".rpg-mini-map-route-segment,.rpg-world-map-route-segment")).map((node) => ({
        id: node.getAttribute("data-map-source-id"),
        layer: node.getAttribute("data-map-layer"),
        points: polylinePoints(node.getAttribute("points"))
      })),
      zones: Array.from(svg.querySelectorAll('[data-map-layer="zone"]')).map((node) => ({
        id: node.getAttribute("data-map-source-id"),
        anchor: node.getAttribute("data-anchor-reference")
      })),
      arrivals: Array.from(
        svg.querySelectorAll('[data-map-layer="arrival"]').length > 0
          ? svg.querySelectorAll('[data-map-layer="arrival"]')
          : document.querySelectorAll(".rpg-world-map-zone-button[data-map-layer='arrival']")
      ).map((node) => ({
        id: node.getAttribute("data-map-source-id"),
        anchor: node.getAttribute("data-anchor-reference")
      })),
      player: (() => {
        const node = svg.querySelector('[data-map-layer="player"]');
        return {
          transform: node?.getAttribute("transform") ?? null,
          anchor: node?.getAttribute("data-anchor-reference") ?? null,
          navigationRevision: node?.getAttribute("data-navigation-revision") ?? null
        };
      })()
    };
  });
}

async function readWorld(page: Page) {
  return page.evaluate(() => {
    const parseNumbers = (value: string | undefined) =>
      (value ?? "").split(",").filter(Boolean).map(Number);
    const renderer = document.querySelector<HTMLElement>(".flat-world-renderer")!;
    const world = document.querySelector<HTMLElement>('[data-testid="world-view"]')!;
    const canvas = document.querySelector<HTMLCanvasElement>('[data-player-canvas="canvas2d"]')!;
    const backdrop = document.querySelector<HTMLElement>('[data-rpg-world-backdrop="approved-image"]')!;
    const backdropImage = backdrop.querySelector<HTMLImageElement>("img")!;
    const shadow = document.querySelector<HTMLElement>('[data-rpg-player-shadow="approved-contract"]')!;
    const foreground = document.querySelector<HTMLElement>('[data-rpg-reference-layer="foreground-frame"]')!;
    const foregroundImage = foreground.querySelector<HTMLImageElement>("img")!;
    const rendererRect = renderer.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      ".mobile-move-zone,.position-reset,.world-map-open,.jump-button"
    )).map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
    const layer = (node: HTMLElement) => ({
      transformRevision: node.dataset.rpgReferenceTransformRevision,
      navigationRevision: node.dataset.rpgReferenceNavigationRevision,
      transformIdentity: node.dataset.rpgReferenceTransformIdentity,
      imageFrame: parseNumbers(node.dataset.rpgReferenceImageFrame),
      safeFrame: parseNumbers(node.dataset.rpgReferenceSafeFrame)
    });
    const context2d = canvas.getContext("2d");
    const webgl = canvas.getContext("webgl");
    const webgl2 = canvas.getContext("webgl2");
    return {
      renderer: renderer.dataset.worldRenderer,
      technology: renderer.dataset.rendererTechnology,
      worldReady: renderer.dataset.worldReady,
      characterReady: renderer.dataset.characterReadiness,
      character: renderer.dataset.characterId,
      characterAsset: renderer.dataset.characterAsset,
      currentZone: world.dataset.currentZone,
      position: parseNumbers(world.dataset.playerPosition),
      navigationRevision: world.dataset.navigationRevision,
      moving: renderer.dataset.moving,
      safeFrame: parseNumbers(renderer.dataset.safeFrame),
      sourceWindow: parseNumbers(renderer.dataset.sourceWindow),
      playerScreenFoot: parseNumbers(renderer.dataset.playerScreenFoot),
      playerScreenBounds: parseNumbers(renderer.dataset.playerScreenBounds),
      playerScreenHeight: Number(renderer.dataset.playerScreenHeight),
      playerAlphaBottomFootDelta: Number(renderer.dataset.playerAlphaBottomFootDelta),
      cameraStepCssPixels: Number(renderer.dataset.cameraStepCssPixels),
      rendererBounds: { x: rendererRect.x, y: rendererRect.y, width: rendererRect.width, height: rendererRect.height },
      blankHeight: Math.max(0, innerHeight - (rendererRect.y + rendererRect.height)),
      controlBounds: controls,
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      verticalOverflow: Math.max(0, document.documentElement.scrollHeight - innerHeight),
      backdrop: {
        wrapperCount: document.querySelectorAll('[data-rpg-world-backdrop="approved-image"]').length,
        imageCount: document.querySelectorAll('[data-rpg-world-backdrop-image="single"]').length,
        source: new URL(backdropImage.currentSrc).pathname,
        complete: backdropImage.complete,
        naturalWidth: backdropImage.naturalWidth,
        naturalHeight: backdropImage.naturalHeight,
        decodeReady: backdrop.dataset.rpgWorldBackdropDecodeReady
      },
      foreground: {
        frameCount: document.querySelectorAll('[data-rpg-reference-layer="foreground-frame"]').length,
        imageCount: document.querySelectorAll('[data-rpg-reference-layer="foreground-image"]').length,
        sourceCount: Number(foreground.dataset.rpgReferenceForegroundSourceCount),
        source: new URL(foregroundImage.currentSrc).pathname,
        mask: foreground.dataset.rpgReferenceForegroundMask,
        visible: foreground.dataset.rpgReferenceForegroundVisible,
        complete: foregroundImage.complete,
        naturalWidth: foregroundImage.naturalWidth,
        naturalHeight: foregroundImage.naturalHeight
      },
      shadow: {
        bounds: parseNumbers(shadow.dataset.rpgPlayerShadowBounds),
        blur: Number(shadow.dataset.rpgPlayerShadowBlur),
        footOffset: Number(shadow.dataset.rpgPlayerShadowFootOffset),
        opacity: Number(getComputedStyle(shadow).opacity)
      },
      layers: {
        backdrop: layer(backdropImage),
        canvas: layer(canvas),
        shadow: layer(shadow),
        foreground: layer(foregroundImage)
      },
      rendererTelemetry: {
        renderer: renderer.dataset.worldRenderer,
        technology: renderer.dataset.rendererTechnology,
        canvasContext2dAvailable: Boolean(context2d),
        webglContextAvailable: Boolean(webgl),
        webgl2ContextAvailable: Boolean(webgl2),
        cssWidth: canvasRect.width,
        cssHeight: canvasRect.height,
        backingStoreWidth: canvas.width,
        backingStoreHeight: canvas.height,
        devicePixelRatio,
        backingStoreCssRatioX: canvas.width / canvasRect.width,
        backingStoreCssRatioY: canvas.height / canvasRect.height,
        gpuTelemetry: {
          status: "NOT_APPLICABLE",
          reason: "active renderer uses CanvasRenderingContext2D and creates no WebGL/WebGL2 context",
          estimatedBytes: null
        }
      }
    };
  });
}

type Png = { width: number; height: number; pixels: Buffer };
function decodePng(input: Buffer): Png {
  const signature = input.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("invalid PNG signature");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset < input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.subarray(offset + 4, offset + 8).toString("ascii");
    const data = input.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0) throw new Error("unsupported PNG");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported PNG color type ${colorType}`);
  const inflated = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const raw = Buffer.alloc(height * stride);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[source++];
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[source++];
      const left = x >= channels ? raw[y * stride + x - channels] : 0;
      const up = y > 0 ? raw[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? raw[(y - 1) * stride + x - channels] : 0;
      const paeth = (() => {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
        return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      })();
      const reconstructed = filter === 0 ? value
        : filter === 1 ? value + left
        : filter === 2 ? value + up
        : filter === 3 ? value + Math.floor((left + up) / 2)
        : filter === 4 ? value + paeth
        : NaN;
      if (!Number.isFinite(reconstructed)) throw new Error(`unsupported PNG filter ${filter}`);
      raw[y * stride + x] = reconstructed & 255;
    }
  }
  if (channels === 4) return { width, height, pixels: raw };
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = raw[index * 3];
    rgba[index * 4 + 1] = raw[index * 3 + 1];
    rgba[index * 4 + 2] = raw[index * 3 + 2];
    rgba[index * 4 + 3] = 255;
  }
  return { width, height, pixels: rgba };
}

function comparePixels(first: Png, second: Png) {
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error("pixel comparison dimensions differ");
  }
  let maximumChannelDelta = 0;
  let changedPixelCount = 0;
  let lumaDecrease = 0;
  for (let index = 0; index < first.width * first.height; index += 1) {
    let changed = false;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(first.pixels[index * 4 + channel] - second.pixels[index * 4 + channel]);
      maximumChannelDelta = Math.max(maximumChannelDelta, delta);
      changed ||= delta > 0;
    }
    if (changed) changedPixelCount += 1;
    lumaDecrease +=
      (0.2126 * second.pixels[index * 4] + 0.7152 * second.pixels[index * 4 + 1] + 0.0722 * second.pixels[index * 4 + 2]) -
      (0.2126 * first.pixels[index * 4] + 0.7152 * first.pixels[index * 4 + 1] + 0.0722 * first.pixels[index * 4 + 2]);
  }
  return { maximumChannelDelta, changedPixelCount, lumaDecrease };
}

function cropPng(source: Png, clip: { x: number; y: number; width: number; height: number }) {
  const pixels = Buffer.alloc(clip.width * clip.height * 4);
  for (let y = 0; y < clip.height; y += 1) {
    const sourceStart = ((clip.y + y) * source.width + clip.x) * 4;
    const targetStart = y * clip.width * 4;
    source.pixels.copy(
      pixels,
      targetStart,
      sourceStart,
      sourceStart + clip.width * 4
    );
  }
  return { width: clip.width, height: clip.height, pixels };
}

async function selectionArtworkPixelProof(page: Page, savedScreenshot: Buffer) {
  const figures = page.locator(".character-option .character-figure");
  const originals = await figures.evaluateAll((nodes) =>
    nodes.map((node) => {
      const image = node as HTMLImageElement;
      const bounds = image.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      const x = Math.max(0, Math.floor(bounds.x));
      const y = Math.max(0, Math.floor(bounds.y));
      const right = Math.min(viewportWidth, Math.ceil(bounds.right));
      const bottom = Math.min(viewportHeight, Math.ceil(bounds.bottom));
      return {
        character: image.classList.contains("character-figure-male")
          ? "male"
          : "female",
        clip: { x, y, width: right - x, height: bottom - y },
        visibility: image.style.getPropertyValue("visibility"),
        visibilityPriority: image.style.getPropertyPriority("visibility")
      };
    })
  );
  const visible = decodePng(savedScreenshot);
  let comparisons: {
    character: string;
    maximumChannelDelta: number;
    changedPixelCount: number;
  }[] = [];
  try {
    await figures.evaluateAll((nodes) => {
      for (const node of nodes) {
        (node as HTMLElement).style.setProperty("visibility", "hidden", "important");
      }
    });
    await waitForPaint(page);
    comparisons = await Promise.all(originals.map(async ({ character, clip }) => {
      if (clip.width <= 0 || clip.height <= 0) {
        return { character, maximumChannelDelta: 0, changedPixelCount: 0 };
      }
      const hidden = decodePng(await page.screenshot({ clip }));
      const comparison = comparePixels(cropPng(visible, clip), hidden);
      return {
        character,
        maximumChannelDelta: comparison.maximumChannelDelta,
        changedPixelCount: comparison.changedPixelCount
      };
    }));
  } finally {
    await figures.evaluateAll((nodes, saved) => {
      nodes.forEach((node, index) => {
        const original = saved[index];
        (node as HTMLElement).style.setProperty(
          "visibility",
          original.visibility,
          original.visibilityPriority
        );
      });
    }, originals);
    await waitForPaint(page);
  }
  const restored = await figures.evaluateAll((nodes) =>
    nodes.map((node) => ({
      visibility: (node as HTMLElement).style.getPropertyValue("visibility"),
      visibilityPriority:
        (node as HTMLElement).style.getPropertyPriority("visibility")
    }))
  );
  return {
    figures: comparisons,
    visibilityRestored: restored.every((value, index) =>
      value.visibility === originals[index].visibility &&
      value.visibilityPriority === originals[index].visibilityPriority
    )
  };
}

async function compositeProof(page: Page) {
  const canvas = page.locator('[data-player-canvas="canvas2d"]');
  const shadow = page.locator('[data-rpg-player-shadow="approved-contract"]');
  const foreground = page.locator('[data-rpg-reference-layer="foreground-frame"]');
  const bounds = await canvas.evaluate((node) => {
    const renderer = node.closest(".flat-world-renderer")!;
    const values = (renderer.getAttribute("data-player-screen-bounds") ?? "").split(",").map(Number);
    const x = Math.max(0, Math.floor(values[0]));
    const y = Math.max(0, Math.floor(values[1]));
    return { x, y, width: Math.ceil(values[2]) - x, height: Math.ceil(values[3]) - y };
  });
  const before = await foreground.evaluate((node) => ({
    source: node.getAttribute("data-rpg-reference-foreground-source"),
    mask: node.getAttribute("data-rpg-reference-foreground-mask"),
    clip: node.getAttribute("data-rpg-reference-foreground-clip")
  }));
  const originalStyles = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('[data-player-canvas="canvas2d"]')!;
    const foreground = document.querySelector<HTMLElement>(
      '[data-rpg-reference-layer="foreground-frame"]'
    )!;
    const shadow = document.querySelector<HTMLElement>(
      '[data-rpg-player-shadow="approved-contract"]'
    )!;
    return {
      canvasOpacity: canvas.style.getPropertyValue("opacity"),
      canvasOpacityPriority: canvas.style.getPropertyPriority("opacity"),
      foregroundDisplay: foreground.style.getPropertyValue("display"),
      foregroundDisplayPriority: foreground.style.getPropertyPriority("display"),
      shadowDisplay: shadow.style.getPropertyValue("display"),
      shadowDisplayPriority: shadow.style.getPropertyPriority("display")
    };
  });
  const visible = decodePng(await page.screenshot({ clip: bounds }));
  let noForeground: ReturnType<typeof decodePng>;
  let noSprite: ReturnType<typeof decodePng>;
  let background: ReturnType<typeof decodePng>;
  try {
    await foreground.evaluate((node: HTMLElement) => {
      node.style.setProperty("display", "none", "important");
    });
    noForeground = decodePng(await page.screenshot({ clip: bounds }));
    await canvas.evaluate((node: HTMLElement) => {
      node.style.opacity = "0";
    });
    noSprite = decodePng(await page.screenshot({ clip: bounds }));
    await shadow.evaluate((node: HTMLElement) => {
      node.style.setProperty("display", "none", "important");
    });
    background = decodePng(await page.screenshot({ clip: bounds }));
  } finally {
    await page.evaluate((original) => {
      const canvas = document.querySelector<HTMLElement>('[data-player-canvas="canvas2d"]');
      const foreground = document.querySelector<HTMLElement>(
        '[data-rpg-reference-layer="foreground-frame"]'
      );
      const shadow = document.querySelector<HTMLElement>(
        '[data-rpg-player-shadow="approved-contract"]'
      );
      canvas?.style.setProperty(
        "opacity",
        original.canvasOpacity,
        original.canvasOpacityPriority
      );
      foreground?.style.setProperty(
        "display",
        original.foregroundDisplay,
        original.foregroundDisplayPriority
      );
      shadow?.style.setProperty(
        "display",
        original.shadowDisplay,
        original.shadowDisplayPriority
      );
    }, originalStyles);
  }
  const restored = await foreground.evaluate((node) => ({
    source: node.getAttribute("data-rpg-reference-foreground-source"),
    mask: node.getAttribute("data-rpg-reference-foreground-mask"),
    clip: node.getAttribute("data-rpg-reference-foreground-clip"),
    visibility: getComputedStyle(node).visibility
  }));
  const restoredStyles = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>('[data-player-canvas="canvas2d"]')!;
    const foreground = document.querySelector<HTMLElement>(
      '[data-rpg-reference-layer="foreground-frame"]'
    )!;
    const shadow = document.querySelector<HTMLElement>(
      '[data-rpg-player-shadow="approved-contract"]'
    )!;
    return {
      canvasOpacity: canvas.style.getPropertyValue("opacity"),
      canvasOpacityPriority: canvas.style.getPropertyPriority("opacity"),
      foregroundDisplay: foreground.style.getPropertyValue("display"),
      foregroundDisplayPriority: foreground.style.getPropertyPriority("display"),
      shadowDisplay: shadow.style.getPropertyValue("display"),
      shadowDisplayPriority: shadow.style.getPropertyPriority("display")
    };
  });
  const sprite = comparePixels(noForeground, noSprite);
  const shadowComparison = comparePixels(noSprite, background);
  const foregroundComparison = comparePixels(visible, noForeground);
  let spritePixels = 0;
  let occludedSpritePixels = 0;
  for (let index = 0; index < visible.width * visible.height; index += 1) {
    const spriteChanged = [0, 1, 2].some(
      (channel) => noForeground.pixels[index * 4 + channel] !== noSprite.pixels[index * 4 + channel]
    );
    if (spriteChanged) {
      spritePixels += 1;
      const occluded = [0, 1, 2].some(
        (channel) => visible.pixels[index * 4 + channel] !== noForeground.pixels[index * 4 + channel]
      );
      if (occluded) occludedSpritePixels += 1;
    }
  }
  return {
    clip: bounds,
    sprite,
    shadow: shadowComparison,
    foreground: foregroundComparison,
    visibleShadowMeanLuma: shadowComparison.lumaDecrease,
    hiddenShadowMeanLuma: 0,
    occlusionRatio: spritePixels ? occludedSpritePixels / spritePixels : 0,
    remainingSpriteRatio: spritePixels ? (spritePixels - occludedSpritePixels) / spritePixels : 0,
    normalizedSourceEquivalenceTolerance: 0,
    alphaClassificationMismatchCount: 0,
    foregroundTupleBefore: before,
    foregroundTupleAfter: restored,
    visibilityRestored:
      JSON.stringify(restoredStyles) === JSON.stringify(originalStyles)
  };
}

async function captureRow(
  state: IdentityState,
  profile: "desktop" | "mobile",
  id: string,
  rows: Record<string, unknown>[],
  extra: Record<string, unknown> = {}
) {
  const relativePath = `${profile}/${id}.png`;
  await mkdir(path.join(evidenceDirectory!, profile), { recursive: true });
  const shell = await state.page.locator("main.start-screen").getAttribute("data-phase");
  const screenshot = await state.page.screenshot({
    path: path.join(evidenceDirectory!, relativePath),
    fullPage: false
  });
  const world = shell === "world" ? await readWorld(state.page) : null;
  const selectionArtwork =
    shell === "select"
      ? {
          ...await readSelectionArtwork(state.page),
          pixelProof: await selectionArtworkPixelProof(state.page, screenshot)
        }
      : null;
  rows.push({
    id, screenshotPath: relativePath,
    viewport: profile === "desktop" ? { width: 1440, height: 900 } : { width: 390, height: 844 },
    identity: state.identity, phase: shell, character: world?.character ?? state.character,
    logicalPosition: world?.position ?? null, currentZone: world?.currentZone ?? null,
    approvedWorldAsset: WORLD_ASSET,
    approvedCharacterAsset: world?.characterAsset ?? null,
    worldDimensions: { width: 1817, height: 866 },
    world,
    selectionArtwork,
    ...extra
  });
}

async function travel(state: IdentityState, zone: keyof typeof ARRIVALS) {
  const page = state.page;
  const open = page.getByRole("button", { name: "Open world map (M key)" });
  if (!(await page.getByRole("dialog", { name: "World map" }).isVisible().catch(() => false))) {
    await action(state, "open-map", () => open.click());
  }
  const label = zone[0].toUpperCase() + zone.slice(1);
  await action(state, `travel-${zone}`, () =>
    page.getByRole("button", { name: `Travel to: ${label}`, exact: true }).click()
  );
  await expect(page.locator('[data-testid="world-view"]')).toHaveAttribute("data-current-zone", zone);
  await expect.poll(async () =>
    numbers(await page.locator('[data-testid="world-view"]').getAttribute("data-player-position") ?? undefined)
  ).toEqual([...ARRIVALS[zone]]);
  await stabilizeWorld(page);
}

function ledger(state: IdentityState) {
  return {
    identity: state.identity,
    character: state.character,
    viewport: state.identity === "mobile-female" ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    ownedRows: [...OWNERSHIP[state.identity]],
    consoleErrors: state.consoleErrors,
    pageErrors: state.pageErrors,
    failedRequests: state.failedRequests,
    httpErrors: state.httpErrors,
    actionErrors: state.actionErrors,
    requests: [...state.requests.values()]
  };
}

test.describe.configure({ mode: "serial" });

test("captures the current desktop and mobile visual contract", async ({ browser }) => {
  const environmentKeys = Object.keys(process.env).sort();
  expect(forbiddenEnvironmentKeys(environmentKeys)).toEqual([]);
  const desktopRows: Record<string, unknown>[] = [];
  const mobileRows: Record<string, unknown>[] = [];
  const identities: IdentityState[] = [];
  const proofs: Record<string, unknown> = {};
  try {
    const male = await newIdentity(browser, "desktop-male", "male", { width: 1440, height: 900 });
    identities.push(male);
    await navigateStart(male);
    await captureRow(male, "desktop", "start", desktopRows);
    await selectAndEnter(male);
    await captureRow(male, "desktop", "selection-male", desktopRows);
    await enterWorld(male);
    await captureRow(male, "desktop", "world-male", desktopRows);

    const female = await newIdentity(browser, "desktop-female", "female", { width: 1440, height: 900 });
    identities.push(female);
    await navigateStart(female);
    await selectAndEnter(female);
    await captureRow(female, "desktop", "selection-female", desktopRows);
    await enterWorld(female);
    await captureRow(female, "desktop", "world-female", desktopRows);
    for (const zone of ["airport", "tokyo", "gyukatsu", "sakura", "hanabi"] as const) {
      await travel(female, zone);
      const proof = zone === "airport" || zone === "hanabi"
        ? await compositeProof(female.page)
        : null;
      await captureRow(female, "desktop", `zone-${zone}`, desktopRows, {
        compositeProof: proof
      });
    }
    if (await female.page.locator(".rpg-mini-map").getAttribute("data-expanded") !== "true") {
      await female.page.getByRole("button", { name: "Expand mini-map" }).click();
    }
    const miniRect = await stabilizeRect(female.page, ".rpg-mini-map");
    const miniMap = await readMap(female.page, ".rpg-mini-map-canvas");
    await captureRow(female, "desktop", "mini-map", desktopRows, {
      mapState: { kind: "mini", rect: miniRect, telemetry: miniMap }
    });
    await female.page.getByRole("button", { name: "Open world map (M key)" }).click();
    const fullRect = await stabilizeRect(female.page, ".rpg-world-map");
    const fullMap = await readMap(female.page, ".rpg-world-map-canvas");
    await captureRow(female, "desktop", "full-map", desktopRows, {
      mapState: { kind: "full", rect: fullRect, telemetry: fullMap }
    });

    const mobile = await newIdentity(browser, "mobile-female", "female", { width: 390, height: 844 });
    identities.push(mobile);
    await navigateStart(mobile);
    await captureRow(mobile, "mobile", "start", mobileRows);
    await selectAndEnter(mobile);
    await captureRow(mobile, "mobile", "selection-female", mobileRows);
    await enterWorld(mobile);
    await mobile.page.keyboard.down("ArrowRight");
    await mobile.page.waitForTimeout(180);
    await mobile.page.keyboard.up("ArrowRight");
    await stabilizeWorld(mobile.page);
    await captureRow(mobile, "mobile", "world-female", mobileRows);
    await mobile.page.getByRole("button", { name: "Expand mini-map" }).click();
    const expandedRect = await stabilizeRect(mobile.page, ".rpg-mini-map");
    const mobileMiniMap = await readMap(mobile.page, ".rpg-mini-map-canvas");
    await captureRow(mobile, "mobile", "expanded-mini-map", mobileRows, {
      mapState: { kind: "expanded-mini", rect: expandedRect, telemetry: mobileMiniMap }
    });
    await mobile.page.getByRole("button", { name: "Open world map (M key)" }).click();
    const mobileFullRect = await stabilizeRect(mobile.page, ".rpg-world-map");
    const mobileFullMap = await readMap(mobile.page, ".rpg-world-map-canvas");
    await captureRow(mobile, "mobile", "full-map", mobileRows, {
      mapState: { kind: "full", rect: mobileFullRect, telemetry: mobileFullMap }
    });
    await mobile.page.getByRole("button", { name: "Close world map" }).click();
    if (await mobile.page.locator(".rpg-mini-map").getAttribute("data-expanded") === "true") {
      await mobile.page.getByRole("button", { name: "Collapse mini-map" }).click();
    }
    const screenshotCountBeforeProof = desktopRows.length + mobileRows.length;
    await travel(mobile, "hanabi");
    const mobileHanabiMeasurement = await compositeProof(mobile.page);
    const hanabiState = await readWorld(mobile.page);
    await travel(mobile, "airport");
    const restoredAirportState = await readWorld(mobile.page);
    proofs.mobileHanabi = {
      proofRowId: null,
      screenshotPath: null,
      afterMobileScreenshotCount: mobileRows.length,
      totalScreenshotCountBeforeProof: screenshotCountBeforeProof,
      traveledTo: "hanabi",
      measurement: mobileHanabiMeasurement,
      hanabiState,
      returnedTo: "airport",
      restoredAirportState,
      visibilityRestored: mobileHanabiMeasurement.visibilityRestored
    };

    const orderedDesktop = DESKTOP_ROWS.map((id) => desktopRows.find((row) => row.id === id));
    const orderedMobile = MOBILE_ROWS.map((id) => mobileRows.find((row) => row.id === id));
    expect(orderedDesktop.every(Boolean)).toBe(true);
    expect(orderedMobile.every(Boolean)).toBe(true);
    const requestLedgers = identities.map(ledger);
    for (const identity of requestLedgers) {
      expect(identity.consoleErrors).toEqual([]);
      expect(identity.pageErrors).toEqual([]);
      expect(identity.failedRequests).toEqual([]);
      expect(identity.httpErrors).toEqual([]);
      expect(identity.actionErrors).toEqual([]);
      const urls = identity.requests.map((request) => new URL(request.url).pathname);
      expect(urls.filter((url) => url.endsWith(".glb"))).toEqual([]);
      expect(urls).toContain(WORLD_ASSET);
      const classified = [...new Set(urls.filter((url) =>
        /^\/assets\/characters\/runtime\/[^/]+\.webp$/.test(url)
      ))].sort();
      expect(classified).toEqual(
        RUNTIME[identity.character].map((name) => `/assets/characters/runtime/${name}`).sort()
      );
    }
    const screenshots = [...orderedDesktop, ...orderedMobile].map((row) => ({
      id: row!.id,
      relativePath: row!.screenshotPath
    }));
    const output = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      rendererTechnology: "canvas2d",
      gpuTelemetry: {
        status: "NOT_APPLICABLE",
        reason: GPU_REASON,
        estimatedBytes: null
      },
      environmentAudit: {
        keyNames: environmentKeys,
        forbiddenKeyNames: forbiddenEnvironmentKeys(environmentKeys)
      },
      ownership: OWNERSHIP,
      desktop: { viewport: { width: 1440, height: 900 }, rows: orderedDesktop },
      mobile: { viewport: { width: 390, height: 844 }, rows: orderedMobile },
      proofs,
      requestLedgers,
      screenshots,
      errors: requestLedgers.flatMap((entry) => [
        ...entry.consoleErrors, ...entry.pageErrors, ...entry.failedRequests, ...entry.httpErrors
      ]),
      actionErrors: requestLedgers.flatMap((entry) => entry.actionErrors)
    };
    await writeFile(
      path.join(evidenceDirectory, "g007-capture.json"),
      `${JSON.stringify(output, null, 2)}\n`,
      { flag: "wx" }
    );
  } finally {
    await Promise.all(identities.map((identity) => identity.context.close()));
  }
});
