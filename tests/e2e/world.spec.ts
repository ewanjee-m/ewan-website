import { expect, test, type Page } from "@playwright/test";

type Box = { x: number; y: number; width: number; height: number };

function boxesOverlap(first: Box, second: Box) {
  return !(
    first.x + first.width <= second.x ||
    second.x + second.width <= first.x ||
    first.y + first.height <= second.y ||
    second.y + second.height <= first.y
  );
}

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

async function enterWorld(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  const response = await page.goto("/en");
  expect(response).not.toBeNull();
  expect(response!.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response!.headers()["x-frame-options"]).toBe("DENY");
  expect(response!.headers()["content-security-policy"]).toContain(
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

async function readWorldPosition(page: Page) {
  return (
    (await page.getByTestId("world-view").getAttribute("data-player-position")) ??
    ""
  )
    .split(",")
    .map(Number);
}

test.describe("pre-world responsive flow", () => {
  for (const scenario of [
    {
      name: "short landscape",
      viewport: { width: 844, height: 390 },
      locale: "en",
      start: "START",
      enter: "ENTER WORLD"
    },
    {
      name: "Korean portrait",
      viewport: { width: 390, height: 844 },
      locale: "ko",
      start: "시작",
      enter: "월드 입장"
    }
  ]) {
    test(`${scenario.name} keeps every required action and label unobstructed`, async ({
      page
    }) => {
      await page.setViewportSize(scenario.viewport);
      await page.addInitScript(() => localStorage.clear());
      await page.goto(`/${scenario.locale}`);

      const start = page.getByRole("button", { name: scenario.start });
      expectFullyVisible(await start.boundingBox(), scenario.viewport);
      await start.click();

      const localeBox = await page.locator(".locale-switcher").boundingBox();
      const brandBox = await page.locator(".start-eyebrow").boundingBox();
      expect(localeBox).not.toBeNull();
      expect(brandBox).not.toBeNull();
      expect(boxesOverlap(localeBox!, brandBox!)).toBe(false);

      const options = page.locator(".character-option");
      await expect(options).toHaveCount(2);
      for (let index = 0; index < 2; index += 1) {
        const figureBox = await options
          .nth(index)
          .locator(".character-figure")
          .boundingBox();
        const nameBox = await options
          .nth(index)
          .locator(".character-name")
          .boundingBox();
        expect(figureBox).not.toBeNull();
        expect(nameBox).not.toBeNull();
        expect(figureBox!.y + figureBox!.height).toBeLessThanOrEqual(
          nameBox!.y + 2
        );
      }

      await options.first().click();
      const enter = page.getByRole("button", { name: scenario.enter });
      await enter.scrollIntoViewIfNeeded();
      expectFullyVisible(await enter.boundingBox(), scenario.viewport);
    });
  }
});

test("serves the Japanese festival favicon from the conventional URL", async ({
  request
}) => {
  const response = await request.get("/favicon.ico");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/svg+xml");
  expect(await response.text()).toContain('aria-label="Hanabi festival torii"');
});

test.describe("common desktop viewports", () => {
  for (const viewport of [
    { width: 800, height: 896 },
    { width: 864, height: 996 },
    { width: 1280, height: 800 },
    { width: 1366, height: 768 }
  ]) {
    test(`${viewport.width}x${viewport.height} renders the registered world without overflow`, async ({
      page
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      await page.setViewportSize(viewport);
      await enterWorld(page);

      const renderer = page.locator(".flat-world-renderer");
      const backdrop = page.locator(
        '[data-rpg-world-backdrop="approved-image"]'
      );
      await expect(renderer).toHaveAttribute(
        "data-viewport",
        `${viewport.width},${viewport.height}`
      );
      await expect(renderer).toHaveAttribute(
        "data-viewport-supported",
        "true"
      );
      await expect(renderer).toHaveAttribute("data-camera-profile", "desktop");
      await expect(backdrop).toHaveAttribute(
        "data-rpg-world-backdrop-safe-frame",
        `0,0,${viewport.width},${viewport.height}`
      );
      expectFullyVisible(await backdrop.boundingBox(), viewport);
      expect(await renderer.locator(":scope > *").count()).toBeGreaterThan(0);

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
      expect(errors).toEqual([]);
    });
  }
});

test("desktop keeps the Canvas2D world active through guidance, movement, reset, and locale change", async ({
  page
}) => {
  const errors: string[] = [];
  let guideRequests = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.route("**/api/guide", async (route) => {
    guideRequests += 1;
    expect(route.request().headers()["x-guide-client-id"]).toMatch(
      /^[0-9a-f-]{36}$/
    );
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recommendation: {
          destinationId: "moon",
          themeId: "celebration",
          basis: "fortune"
        }
      })
    });
  });

  await enterWorld(page);
  const world = page.getByTestId("world-view");
  const renderer = page.locator(".flat-world-renderer");
  const startPosition = await world.getAttribute("data-player-position");
  expect(startPosition).not.toBeNull();
  await expect(world).toHaveAttribute("data-character", "female");
  await expect(renderer).toHaveAttribute(
    "data-world-renderer",
    "approved-reference"
  );
  await expect(renderer).toHaveAttribute("data-renderer-technology", "canvas2d");

  const beforeMove = await readWorldPosition(page);
  await page.keyboard.down("ArrowUp");
  try {
    await expect
      .poll(async () => {
        const current = await readWorldPosition(page);
        return Math.hypot(
          current[0] - beforeMove[0],
          current[2] - beforeMove[2]
        );
      })
      .toBeGreaterThan(0.5);
  } finally {
    await page.keyboard.up("ArrowUp");
  }
  await expect(world).not.toHaveAttribute(
    "data-player-position",
    startPosition!
  );
  await page.getByRole("button", { name: "Return to start" }).click();
  await expect(world).toHaveAttribute("data-player-position", startPosition!);

  await page
    .getByRole("button", { name: "Directions", exact: true })
    .click();
  await page.getByRole("button", { name: "Today's fortune" }).click();
  await expect(
    page.locator(".guide-notice", {
      hasText:
        "We couldn't load guidance, so we're showing a default recommendation."
    })
  ).toBeVisible();

  await page.getByRole("button", { name: "日本語" }).click();
  await expect(world).toHaveAttribute("data-locale", "ja");
  await expect(page).toHaveTitle(
    "Ewan's World · インタラクティブ3Dポートフォリオ"
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "日本のお祭りをイメージした3Dワールドの風景と操作を楽しめます。"
  );
  await expect(
    page.locator(".guide-notice", {
      hasText: "案内を取得できなかったため、基本のおすすめを表示します。"
    })
  ).toBeVisible();
  expect(guideRequests).toBe(1);
  expect(errors).toEqual([]);
});

test("Tokyo weather sends only a fresh validated observation to guidance", async ({
  page
}) => {
  let weatherRequests = 0;
  let postedBody: Record<string, unknown> | undefined;
  await page.route("https://api.open-meteo.com/v1/forecast**", async (route) => {
    weatherRequests += 1;
    const nowSeconds = Math.floor(Date.now() / 1000) - 300;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        timezone: "Asia/Tokyo",
        current: {
          time: nowSeconds,
          interval: 900,
          temperature_2m: 31.2,
          weather_code: 2
        }
      })
    });
  });
  await page.route("**/api/guide", async (route) => {
    postedBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        recommendation: {
          destinationId: "moon",
          themeId: "rest",
          basis: "weather"
        }
      })
    });
  });

  await enterWorld(page);
  await page
    .getByRole("button", { name: "Directions", exact: true })
    .click();
  await page.getByRole("button", { name: "Current weather" }).click();

  await expect(page.getByText(/^Current weather data · Cloudy$/)).toBeVisible();
  await expect(page.getByText("Temperature: 31.2°C")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Weather data by Open-Meteo" })
  ).toBeVisible();
  expect(weatherRequests).toBe(1);
  expect(postedBody).toEqual(
    expect.objectContaining({
      mode: "weather",
      currentZoneId: "airport",
      weatherCode: 2,
      temperatureC: 31.2,
      observedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/)
    })
  );
  expect(postedBody).not.toHaveProperty("latitude");
  expect(postedBody).not.toHaveProperty("longitude");
});

test.describe("mobile portrait world", () => {
  const viewport = { width: 390, height: 844 };

  test.use({
    viewport,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3
  });

  test("keeps movement, guide, mini-map, and full map inside the safe layout", async ({
    page
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.route("**/api/guide", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          recommendation: {
            destinationId: "moon",
            themeId: "celebration",
            basis: "fortune"
          }
        })
      })
    );

    await enterWorld(page);
    const renderer = page.locator(".flat-world-renderer");
    const movement = page.getByRole("region", {
      name: "Mobile movement control"
    });
    const backdrop = page.locator(
      '[data-rpg-world-backdrop="approved-image"]'
    );
    await expect(renderer).toHaveAttribute("data-viewport", "390,844");
    await expect(backdrop).toHaveAttribute(
      "data-rpg-world-backdrop-safe-frame",
      "0,64,390,780"
    );
    expectFullyVisible(await movement.boundingBox(), viewport);
    await expect(page.getByTestId("world-view")).not.toHaveAttribute(
      "role",
      "application"
    );

    const miniMap = page.locator(".rpg-mini-map");
    await expect(miniMap).toHaveAttribute("data-expanded", "false");
    await page.getByRole("button", { name: "Expand mini-map" }).click();
    const miniMapCanvas = page.locator(".rpg-mini-map-canvas");
    await expect(miniMap).toHaveAttribute("data-expanded", "true");
    await expect(miniMapCanvas).toBeVisible();
    await expect(
      miniMapCanvas.locator('[data-map-layer="model-terrain"]')
    ).toHaveCount(1);
    await expect(miniMapCanvas.locator("image")).toHaveCount(0);
    expectFullyVisible(await miniMap.boundingBox(), viewport);
    await page.getByRole("button", { name: "Collapse mini-map" }).click();

    await page
      .getByRole("button", { name: "Directions", exact: true })
      .click();
    const panel = page.locator(".guide-panel");
    await expect(panel).toBeVisible();
    await expect(miniMap).toBeHidden();
    expectFullyVisible(await panel.boundingBox(), viewport);
    const panelBox = await panel.boundingBox();
    const movementBox = await movement.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(movementBox).not.toBeNull();
    expect(boxesOverlap(panelBox!, movementBox!)).toBe(false);
    await page.getByRole("button", { name: "Close" }).click();

    await page
      .getByRole("button", { name: "Open world map (M key)" })
      .click();
    const world = page.getByTestId("world-view");
    const playerPosition = await world.getAttribute("data-player-position");
    const navigationRevision = await world.getAttribute(
      "data-navigation-revision"
    );
    expect(playerPosition).not.toBeNull();
    expect(navigationRevision).not.toBeNull();
    const map = page.getByRole("dialog", { name: "World map" });
    await expect(map).toBeVisible();
    expectFullyVisible(await map.boundingBox(), viewport);
    await expect(
      map.locator('[data-map-layer="model-terrain"]')
    ).toHaveCount(1);
    await expect(map.locator("svg image")).toHaveCount(0);
    await expect(
      map.getByRole("button", { name: /^Inspect:/ })
    ).toHaveCount(5);
    const selectedDescription = map.getByTestId(
      "world-map-selected-description"
    );
    const initialDescription = await selectedDescription.textContent();
    await map.getByRole("button", { name: "Inspect: Hanabi" }).click();
    await expect(map).toBeVisible();
    await expect(selectedDescription).toHaveText(
      "Hanabi torii, stalls, lanterns, and fireworks"
    );
    expect(await selectedDescription.textContent()).not.toBe(initialDescription);
    await expect(world).toHaveAttribute("data-player-position", playerPosition!);
    await expect(world).toHaveAttribute(
      "data-navigation-revision",
      navigationRevision!
    );
    await page.getByRole("button", { name: "Close world map" }).click();

    const overflow = await page.evaluate(() => ({
      horizontal:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      vertical:
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight
    }));
    expect(overflow.horizontal).toBeLessThanOrEqual(0);
    expect(overflow.vertical).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test("moves the player with the mobile joystick and resets its knob on release", async ({
    page
  }) => {
    await enterWorld(page);

    const movement = page.getByRole("region", {
      name: "Mobile movement control"
    });
    const knob = movement.locator(".mobile-move-knob");
    const movementBox = await movement.boundingBox();
    expect(movementBox).not.toBeNull();

    const startPosition = await readWorldPosition(page);
    const centerX = movementBox!.x + movementBox!.width / 2;
    const centerY = movementBox!.y + movementBox!.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    try {
      await page.mouse.move(centerX, centerY - movementBox!.height * 0.38, {
        steps: 4
      });

      await expect
        .poll(async () => {
          const currentPosition = await readWorldPosition(page);
          return Math.hypot(
            currentPosition[0] - startPosition[0],
            currentPosition[2] - startPosition[2]
          );
        })
        .toBeGreaterThan(0.5);

      expect(
        await knob.evaluate(
          (element) => (element as HTMLElement).style.transform
        )
      ).not.toBe("translate(0px, 0px)");
    } finally {
      await page.mouse.up();
    }

    await expect
      .poll(() =>
        knob.evaluate((element) => (element as HTMLElement).style.transform)
      )
      .toBe("translate(0px, 0px)");
  });
});

test.describe("mobile landscape world", () => {
  const viewport = { width: 844, height: 390 };

  test.use({
    viewport,
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3
  });

  test("keeps active movement and map controls visible without a camera region", async ({
    page
  }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.goto("/en");
    await page.getByRole("button", { name: "START" }).click();
    await page
      .getByRole("button", { name: "Select female character" })
      .click();
    await page.getByRole("button", { name: "ENTER WORLD" }).click();
    const renderer = page.locator(".flat-world-renderer");
    await expect(renderer).toHaveAttribute("data-viewport", "844,390");
    await expect(renderer).toHaveAttribute("data-viewport-supported", "false");

    const movement = page.getByRole("region", {
      name: "Mobile movement control"
    });
    const mapButton = page.getByRole("button", {
      name: "Open world map (M key)"
    });
    expectFullyVisible(await movement.boundingBox(), viewport);
    expectFullyVisible(await mapButton.boundingBox(), viewport);
    await expect(page.locator(".camera-drag-zone")).toHaveCount(0);

    await mapButton.click();
    const map = page.getByRole("dialog", { name: "World map" });
    await expect(map).toBeVisible();
    expectFullyVisible(await map.boundingBox(), viewport);
    await expect(
      map.locator('[data-map-layer="model-terrain"]')
    ).toHaveCount(1);
    await expect(map.locator("svg image")).toHaveCount(0);
    await expect(
      map.getByRole("button", { name: /^Inspect:/ })
    ).toHaveCount(5);
  });
});
