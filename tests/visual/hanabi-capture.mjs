import { chromium } from "@playwright/test";

const baseURL = process.env.HANABI_BASE_URL ?? "http://127.0.0.1:4180";
const outputPrefix =
  process.env.HANABI_OUTPUT_PREFIX ?? "/private/tmp/ewan-hanabi";
const frameCount = Number.parseInt(process.env.HANABI_FRAMES ?? "8", 10);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 667 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true
});
const page = await context.newPage();

try {
  await page.addInitScript(() => localStorage.clear());
  await page.goto(`${baseURL}/en`);
  await page.getByRole("button", { name: "START" }).click();
  await page
    .getByRole("button", { name: "Select female character" })
    .click();
  await page.getByRole("button", { name: "ENTER WORLD" }).click();
  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 30_000 });

  const world = page.getByTestId("world-view");
  await page.keyboard.down("ArrowDown");
  await world.waitFor({ state: "visible" });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="world-view"]')?.getAttribute(
        "data-current-zone"
      ) === "hanabi",
    undefined,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(2_000);
  await page.keyboard.up("ArrowDown");
  await page.waitForTimeout(2_000);

  const session = await context.newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: 300, y: 430, radiusX: 4, radiusY: 4, force: 1 }]
  });
  for (let step = 1; step <= 10; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: 300,
          y: 430 - step * 30,
          radiusX: 4,
          radiusY: 4,
          force: 1
        }
      ]
    });
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: []
  });
  await session.detach();
  await page.waitForTimeout(500);

  for (let frame = 0; frame < frameCount; frame += 1) {
    await page.screenshot({ path: `${outputPrefix}-${frame}.png` });
    await page.waitForTimeout(250);
  }
} finally {
  await browser.close();
}
