import { expect, test } from "@playwright/test";
import {
  enterRpgWorld,
  readWorldTelemetry
} from "../fixtures/rpg-playwright-world";

test("mini-map publishes exact revision-paired position updates within 100ms", async ({
  page
}) => {
  await enterRpgWorld(page);
  const miniMap = page.locator(".rpg-mini-map");
  if ((await miniMap.getAttribute("data-expanded")) === "false") {
    await page.getByRole("button", { name: "Expand mini-map" }).click();
  }
  await expect(page.locator(".rpg-mini-map-player")).toBeVisible();

  await page.evaluate(() => {
    const renderer = document.querySelector<HTMLElement>(
      ".seamless-world-renderer"
    );
    const marker = document.querySelector<HTMLElement>(
      ".rpg-mini-map-player"
    );
    if (!renderer || !marker) throw new Error("map telemetry is missing");
    const samples = new Map<
      string,
      { at: number; position: string; anchor: string }
    >();
    const paired: Array<{
      revision: string;
      latencyMs: number;
      position: string;
      expectedAnchor: string;
      actualAnchor: string;
    }> = [];
    const recordRenderer = () => {
      const revision = renderer.dataset.navigationRevision;
      const position = renderer.dataset.playerPosition;
      const anchor = renderer.dataset.mapAnchorReference;
      if (!revision || !position || !anchor) return;
      samples.set(revision, { at: performance.now(), position, anchor });
    };
    const recordMarker = () => {
      const revision = marker.dataset.navigationRevision;
      const actualAnchor = marker.dataset.anchorReference;
      if (!revision || !actualAnchor) return;
      const sample = samples.get(revision);
      if (!sample) {
        throw new Error(`map revision ${revision} has no renderer sample`);
      }
      if (sample.anchor !== actualAnchor) {
        throw new Error(
          `map projection mismatch for ${revision}: ${sample.anchor} !== ${actualAnchor}`
        );
      }
      paired.push({
        revision,
        latencyMs: performance.now() - sample.at,
        position: sample.position,
        expectedAnchor: sample.anchor,
        actualAnchor
      });
    };
    recordRenderer();
    recordMarker();
    const rendererObserver = new MutationObserver(recordRenderer);
    const markerObserver = new MutationObserver(recordMarker);
    rendererObserver.observe(renderer, {
      attributes: true,
      attributeFilter: [
        "data-navigation-revision",
        "data-player-position",
        "data-map-anchor-reference"
      ]
    });
    markerObserver.observe(marker, {
      attributes: true,
      attributeFilter: [
        "data-navigation-revision",
        "data-anchor-reference"
      ]
    });
    Object.assign(window, {
      __RPG_MAP_LATENCY__: {
        samples,
        paired,
        disconnect() {
          rendererObserver.disconnect();
          markerObserver.disconnect();
        }
      }
    });
  });

  await page.keyboard.down("w");
  await page.waitForTimeout(1_000);
  await page.keyboard.up("w");
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const state = (
          window as typeof window & {
            __RPG_MAP_LATENCY__?: { paired: unknown[] };
          }
        ).__RPG_MAP_LATENCY__;
        return state?.paired.length ?? 0;
      })
    )
    .toBeGreaterThan(5);

  const paired = await page.evaluate(() => {
    const state = (
      window as typeof window & {
        __RPG_MAP_LATENCY__?: {
          paired: Array<{
            revision: string;
            latencyMs: number;
            position: string;
            expectedAnchor: string;
            actualAnchor: string;
          }>;
          disconnect(): void;
        };
      }
    ).__RPG_MAP_LATENCY__;
    if (!state) throw new Error("map latency observer is missing");
    state.disconnect();
    return state.paired;
  });
  expect(paired.length).toBeGreaterThan(5);
  expect(Math.max(...paired.map(({ latencyMs }) => latencyMs)))
    .toBeLessThanOrEqual(100);
  expect(
    paired.every(
      ({ revision, position, expectedAnchor, actualAnchor }) =>
        revision.length > 0 &&
        position.split(",").every((value) => Number.isFinite(Number(value))) &&
        expectedAnchor === actualAnchor
    )
  ).toBe(true);
});

test("full map is keyboard-accessible and inspection never moves the player", async ({
  page
}) => {
  await enterRpgWorld(page);
  const before = await readWorldTelemetry(page);
  await page.keyboard.press("m");
  const dialog = page.getByRole("dialog", { name: "World map" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^Inspect:/ })).toHaveCount(5);
  await dialog.getByRole("button", { name: "Inspect: Hanabi" }).click();
  await page.waitForTimeout(500);
  const after = await readWorldTelemetry(page);
  expect(after.positionRaw).toBe(before.positionRaw);
  expect(after.revision).toBe(before.revision);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open world map (M key)" })
  ).toBeFocused();
});
