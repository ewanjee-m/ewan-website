import { expect, test, type Page } from "@playwright/test";

type RuntimeEvidence = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  httpErrors: string[];
  actionErrors: string[];
  requestUrls: string[];
};

const DESTINATIONS = [
  "Airport",
  "Tokyo",
  "Gyukatsu",
  "Sakura",
  "Hanabi"
] as const;

function collectRuntimeEvidence(page: Page): RuntimeEvidence {
  const evidence: RuntimeEvidence = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
    actionErrors: [],
    requestUrls: []
  };

  page.on("console", (message) => {
    if (message.type() === "error") {
      evidence.consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("request", (request) => evidence.requestUrls.push(request.url()));
  page.on("requestfailed", (request) => {
    evidence.failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown"}`
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      evidence.httpErrors.push(
        `${response.status()} ${response.request().method()} ${response.url()}`
      );
    }
  });

  return evidence;
}

async function runAction(
  evidence: RuntimeEvidence,
  label: string,
  action: () => Promise<void>
) {
  try {
    await action();
  } catch (error) {
    evidence.actionErrors.push(
      `${label}: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}

async function enterWorld(page: Page, evidence?: RuntimeEvidence) {
  await page.addInitScript(() => localStorage.clear());
  const perform = async (label: string, action: () => Promise<void>) => {
    if (evidence) {
      await runAction(evidence, label, action);
    } else {
      await action();
    }
  };

  await perform("open English start", async () => {
    await page.goto("/en");
  });
  await perform("start experience", async () => {
    await page.getByRole("button", { name: "START" }).click();
  });
  await perform("select female character", async () => {
    await page
      .getByRole("button", { name: "Select female character" })
      .click();
  });
  await perform("enter world", async () => {
    await page.getByRole("button", { name: "ENTER WORLD" }).click();
  });
  await expect(
    page.locator(
      '.flat-world-renderer[data-world-ready="true"][data-world-renderer="approved-reference"][data-renderer-technology="canvas2d"]'
    )
  ).toBeVisible({ timeout: 30_000 });
}

async function readPosition(page: Page) {
  return (
    (await page.getByTestId("world-view").getAttribute("data-player-position")) ??
    ""
  )
    .split(",")
    .map(Number);
}

test("keyboard movement updates the live world position from the airport spawn", async ({
  page
}) => {
  await enterWorld(page);
  const start = await readPosition(page);

  await page.keyboard.down("ArrowUp");
  try {
    await expect
      .poll(async () => {
        const current = await readPosition(page);
        return Math.hypot(current[0] - start[0], current[2] - start[2]);
      }, { timeout: 10_000 })
      .toBeGreaterThan(0.5);
  } finally {
    await page.keyboard.up("ArrowUp");
  }

  const moved = await readPosition(page);
  expect(Math.hypot(moved[0] - start[0], moved[2] - start[2])).toBeGreaterThan(
    0.5
  );
  expect(moved[1]).toBe(0);
});

test("Canvas2D maps expose five destinations and travel atomically to Hanabi without runtime errors", async ({
  page
}) => {
  const evidence = collectRuntimeEvidence(page);
  await enterWorld(page, evidence);

  const world = page.getByTestId("world-view");
  const renderer = page.locator(".flat-world-renderer");
  await expect(renderer).toHaveAttribute(
    "data-world-renderer",
    "approved-reference"
  );
  await expect(renderer).toHaveAttribute("data-renderer-technology", "canvas2d");

  const miniMap = page.locator(".rpg-mini-map");
  const miniMapCanvas = page.locator(".rpg-mini-map-canvas");
  await expect(miniMap).toBeVisible();
  await expect(miniMapCanvas).toBeVisible();
  await expect(
    miniMapCanvas.locator(
      '[data-map-layer="terrain"][data-map-source-id="approved-world-environment-concept"]'
    )
  ).toHaveCount(1);
  const navigationRevision = await world.getAttribute("data-navigation-revision");
  expect(navigationRevision).not.toBeNull();
  if (navigationRevision === null) {
    throw new Error("world navigation revision is missing");
  }
  await expect(miniMapCanvas.locator('[data-map-layer="player"]')).toHaveAttribute(
    "data-navigation-revision",
    navigationRevision
  );

  await runAction(evidence, "open world map", async () => {
    await page
      .getByRole("button", { name: "Open world map (M key)" })
      .click();
  });
  const dialog = page.getByRole("dialog", { name: "World map" });
  await expect(dialog).toBeVisible();

  const travelButtons = dialog.getByRole("button", { name: /^Travel to:/ });
  await expect(travelButtons).toHaveCount(5);
  for (const destination of DESTINATIONS) {
    await expect(
      dialog.getByRole("button", { name: `Travel to: ${destination}` })
    ).toHaveCount(1);
  }

  await runAction(evidence, "travel to Hanabi", async () => {
    await dialog
      .getByRole("button", { name: "Travel to: Hanabi" })
      .click();
  });
  await expect(dialog).toBeHidden();
  await expect(world).toHaveAttribute("data-current-zone", "hanabi");
  await expect(world).toHaveAttribute(
    "data-player-position",
    "26.000,0.000,-18.000"
  );

  const glbRequests = evidence.requestUrls.filter((url) => {
    try {
      return new URL(url).pathname.toLowerCase().endsWith(".glb");
    } catch {
      return url.toLowerCase().includes(".glb");
    }
  });
  expect(glbRequests).toEqual([]);
  expect(evidence.consoleErrors).toEqual([]);
  expect(evidence.pageErrors).toEqual([]);
  expect(evidence.failedRequests).toEqual([]);
  expect(evidence.httpErrors).toEqual([]);
  expect(evidence.actionErrors).toEqual([]);
});
