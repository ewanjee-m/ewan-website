import { test } from "@playwright/test";
import {
  driveCanonicalRoute,
  driveForwardToPoint,
  driveWithKeyboardToPoint,
  enterRpgWorld
} from "../fixtures/rpg-playwright-world";

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true
});

test("mobile full route keeps the camera safe without hidden recovery", async ({
  page
}) => {
  test.setTimeout(120_000);
  await enterRpgWorld(page, "female");
  await driveCanonicalRoute(page, {
    runRequested: false,
    requireMapObservation: false
  });
  await driveWithKeyboardToPoint(page, [21, -21.9], {
    runRequested: true,
    tolerance: 0.05,
    timeoutMs: 40_000
  });
  await driveForwardToPoint(page, [21, -22], Math.PI, {
    tolerance: 0.05
  });
});
