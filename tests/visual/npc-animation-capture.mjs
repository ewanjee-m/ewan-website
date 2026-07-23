import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.VISUAL_BASE_URL ?? "http://127.0.0.1:4180";
const outputDirectory =
  process.env.VISUAL_OUTPUT_DIR ?? "/private/tmp/ewan-npc-animation";
const requiredAnimationKinds = new Set([
  "walk",
  "wave",
  "talk",
  "nod",
  "look-around",
  "pause"
]);

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1
});
const page = await context.newPage();
const browserErrors = [];
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});
page.on("pageerror", (error) => browserErrors.push(error.message));
await page.addInitScript(() => localStorage.clear());

try {
  await page.goto(`${baseURL}/en`);
  await page.getByRole("button", { name: "START" }).click();
  await page.getByRole("button", { name: "Select female character" }).click();
  await page.getByRole("button", { name: "ENTER WORLD" }).click();
  await page.locator('[data-world-ready="true"]').waitFor({
    state: "visible",
    timeout: 30_000
  });

  const canvas = page.locator(".world-shell canvas");
  await canvas.waitFor({ state: "visible", timeout: 30_000 });
  const seenAnimationKinds = new Set();
  const firstPositions = new Set();
  const samples = [];
  const deadline = Date.now() + 30_000;
  let captureIndex = 0;

  while (Date.now() < deadline) {
    const telemetry = await canvas.evaluate((element) => ({
      animationKinds: (element.getAttribute("data-npc-animation-kinds") ?? "")
        .split(",")
        .filter(Boolean),
      movingCount: Number(element.getAttribute("data-npc-moving-count")),
      firstPosition: element.getAttribute("data-npc-first-position") ?? "",
      drawCalls: Number(element.getAttribute("data-draw-calls")),
      triangles: Number(element.getAttribute("data-triangles")),
      fps: Number(element.getAttribute("data-fps"))
    }));
    const newKinds = telemetry.animationKinds.filter(
      (kind) => !seenAnimationKinds.has(kind)
    );
    telemetry.animationKinds.forEach((kind) => seenAnimationKinds.add(kind));
    if (telemetry.firstPosition) firstPositions.add(telemetry.firstPosition);
    samples.push(telemetry);

    if (newKinds.length > 0) {
      const file = `${String(captureIndex).padStart(2, "0")}-${newKinds
        .join("-")
        .replaceAll("-around", "Around")}.png`;
      await page.screenshot({ path: join(outputDirectory, file) });
      captureIndex += 1;
    }
    if (
      [...requiredAnimationKinds].every((kind) =>
        seenAnimationKinds.has(kind)
      ) &&
      firstPositions.size >= 2
    ) {
      break;
    }
    await page.waitForTimeout(200);
  }

  const missingKinds = [...requiredAnimationKinds].filter(
    (kind) => !seenAnimationKinds.has(kind)
  );
  await writeFile(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify(
      {
        baseURL,
        seenAnimationKinds: [...seenAnimationKinds],
        missingKinds,
        distinctFirstPositions: firstPositions.size,
        samples
      },
      null,
      2
    )}\n`
  );
  if (missingKinds.length > 0) {
    throw new Error(`Missing rendered NPC animation kinds: ${missingKinds.join(", ")}`);
  }
  if (firstPositions.size < 2) {
    throw new Error("The first NPC did not move between rendered samples");
  }
  if (browserErrors.length > 0) {
    throw new Error(`Browser errors:\n${browserErrors.join("\n")}`);
  }

} finally {
  await context.close();
  await browser.close();
}
