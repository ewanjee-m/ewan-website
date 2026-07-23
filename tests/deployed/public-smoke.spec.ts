import { expect, test, type Page, type TestInfo } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };
type HttpError = { method: string; status: number; url: string };
const publicGuideMode = process.env.PUBLIC_GUIDE_MODE ?? "enabled";

function expectFullyVisible(
  box: Box | null,
  viewport: { width: number; height: number }
) {
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
}

function isGuideResponse(url: string) {
  return new URL(url).pathname === "/api/guide";
}

function viewportContract(testInfo: TestInfo) {
  if (testInfo.project.name === "mobile") {
    return {
      viewport: { width: 390, height: 844 },
      safeFrame: "0,64,390,780"
    };
  }
  return {
    viewport: { width: 1440, height: 900 },
    safeFrame: "0,0,1440,900"
  };
}

async function enterWorld(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  const response = await page.goto("/en");

  expect(response).not.toBeNull();
  expect(response!.status()).toBe(200);
  expect(response!.url()).toMatch(/^https:\/\//);

  const headers = response!.headers();
  expect(headers["strict-transport-security"]).toBe(
    "max-age=31536000; includeSubDomains"
  );
  expect(headers["permissions-policy"]).toBe(
    "camera=(), microphone=(), geolocation=()"
  );
  expect(headers["referrer-policy"]).toBe(
    "strict-origin-when-cross-origin"
  );
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy"]).toContain(
    "frame-ancestors 'none'"
  );

  await page.getByRole("button", { name: "START" }).click();
  await page
    .getByRole("button", { name: "Select female character" })
    .click();
  await page.getByRole("button", { name: "ENTER WORLD" }).click();

  await expect(
    page.locator(
      '.flat-world-renderer[data-world-ready="true"][data-world-renderer="approved-reference"][data-renderer-technology="canvas2d"]'
    )
  ).toBeVisible({ timeout: 30_000 });
}

test("public deployment serves the complete world flow", async ({
  page
}, testInfo) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const httpErrors: HttpError[] = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()}: ${
        request.failure()?.errorText ?? "unknown failure"
      }`
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      httpErrors.push({
        method: response.request().method(),
        status: response.status(),
        url: response.url()
      });
    }
  });

  const { viewport, safeFrame } = viewportContract(testInfo);
  await enterWorld(page);

  const world = page.getByTestId("world-view");
  const renderer = page.locator(".flat-world-renderer");
  const backdrop = page.locator(
    '[data-rpg-world-backdrop="approved-image"]'
  );
  await expect(renderer).toHaveAttribute(
    "data-viewport",
    `${viewport.width},${viewport.height}`
  );
  await expect(renderer).toHaveAttribute("data-viewport-supported", "true");
  await expect(backdrop).toHaveAttribute(
    "data-rpg-world-backdrop-safe-frame",
    safeFrame
  );
  expectFullyVisible(await backdrop.boundingBox(), viewport);

  await page
    .getByRole("button", { name: "Open world map (M key)" })
    .click();
  const map = page.getByRole("dialog", { name: "World map" });
  await expect(map).toBeVisible();
  expectFullyVisible(await map.boundingBox(), viewport);
  await page
    .getByRole("button", { name: "Travel to: Hanabi", exact: true })
    .click();
  await expect(world).toHaveAttribute("data-current-zone", "hanabi");
  await expect(world).toHaveAttribute(
    "data-player-position",
    "26.000,0.000,-18.000"
  );

  await page
    .getByRole("button", { name: "Directions", exact: true })
    .click();
  const guidePanel = page.locator(".guide-panel");
  await expect(guidePanel).toBeVisible();
  expectFullyVisible(await guidePanel.boundingBox(), viewport);

  const guideResponsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      isGuideResponse(response.url()),
    { timeout: 10_000 }
  );
  await page.getByRole("button", { name: "Today's fortune" }).click();
  const resultHeading = page.getByRole("heading", {
    name: "Recommendation ready."
  });
  const [guideResponse] = await Promise.all([
    guideResponsePromise,
    expect(resultHeading).toBeVisible({ timeout: 6_000 })
  ]);

  if (publicGuideMode === "disabled") {
    expect(guideResponse.status()).toBe(503);
    expect(guideResponse.headers()["x-guide-mode"]).toBe("disabled");
    await expect(
      page.locator(".guide-notice", {
        hasText:
          "We couldn't load guidance, so we're showing a default recommendation."
      })
    ).toBeVisible();
  } else {
    expect(guideResponse.status()).toBe(200);
    expect(guideResponse.headers()["x-guide-mode"]).toBeUndefined();
    await expect(page.locator(".guide-notice")).toHaveCount(0);
  }
  await expect(
    guidePanel.getByText("Recommended destination", { exact: true })
  ).toBeVisible();
  await expect(
    guidePanel.getByText("Direction", { exact: true })
  ).toBeVisible();
  expectFullyVisible(await guidePanel.boundingBox(), viewport);

  const overflow = await page.evaluate(() => ({
    horizontal:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    vertical:
      document.documentElement.scrollHeight -
      document.documentElement.clientHeight
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(0);
  expect(overflow.vertical).toBeLessThanOrEqual(0);

  const unexpectedHttpErrors = httpErrors.filter(
    (error) =>
      !(
        publicGuideMode === "disabled" &&
        error.method === "POST" &&
        error.status === 503 &&
        isGuideResponse(error.url)
      )
  );
  const allowedGuideErrors = httpErrors.filter(
    (error) =>
      error.method === "POST" &&
      error.status === 503 &&
      isGuideResponse(error.url)
  );
  expect(allowedGuideErrors).toHaveLength(
    guideResponse.status() === 503 ? 1 : 0
  );
  expect(unexpectedHttpErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
