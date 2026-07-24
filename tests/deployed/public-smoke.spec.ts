import { expect, test } from "@playwright/test";
import {
  dragCamera,
  driveCanonicalRoute,
  enterRpgWorld,
  readWorldTelemetry
} from "../fixtures/rpg-playwright-world";

test("public deployment serves the direct seamless RPG route", async ({
  page
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const coreAsset404s: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failedRequests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`
    );
  });
  page.on("response", (response) => {
    if (
      response.status() === 404 &&
      /\.(?:glb|png|svg|webp|woff2?)(?:$|\?)/i.test(response.url())
    ) {
      coreAsset404s.push(response.url());
    }
  });

  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/en"
  );
  const renderer = await enterRpgWorld(page);
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.url()).toMatch(/^https:\/\//);
  expect(response.headers()["strict-transport-security"]).toBe(
    "max-age=31536000; includeSubDomains"
  );
  const world = page.locator('[data-testid="world-view"]');
  await expect(
    page.locator(
      '.seamless-world-renderer[data-world-ready="true"]' +
        '[data-world-renderer="seamless-rpg"]' +
        '[data-renderer-technology="webgl3d"]'
    )
  ).toBeVisible();

  const yawBefore = (await readWorldTelemetry(page)).cameraYaw;
  await dragCamera(page, 80, 0);
  expect((await readWorldTelemetry(page)).cameraYaw).not.toBeCloseTo(
    yawBefore,
    2
  );

  const route = await driveCanonicalRoute(page, { runRequested: true });
  expect(route.zones).toEqual([
    "airport",
    "tokyo",
    "gyukatsu",
    "sakura",
    "hanabi"
  ]);
  await expect(world).toHaveAttribute("data-current-zone", "hanabi");

  const beforeMap = await readWorldTelemetry(page);
  await page.getByRole("button", { name: "Open world map (M key)" }).click();
  const map = page.getByRole("dialog", { name: "World map" });
  await expect(map).toBeVisible();
  await map.getByRole("button", { name: "Inspect: Airport" }).click();
  await page.waitForTimeout(500);
  const afterMap = await readWorldTelemetry(page);
  expect(afterMap.positionRaw).toBe(beforeMap.positionRaw);
  expect(afterMap.revision).toBe(beforeMap.revision);
  await page.keyboard.press("Escape");

  await expect(renderer).toHaveAttribute("data-camera-diagnostic", "ok");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect(coreAsset404s).toEqual([]);
});
