import { test } from "@playwright/test";
import {
  driveCanonicalRoute,
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
});
