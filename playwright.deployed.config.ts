import { defineConfig } from "@playwright/test";

const publicBaseUrl = process.env.PUBLIC_BASE_URL;
const publicGuideMode = process.env.PUBLIC_GUIDE_MODE ?? "enabled";

if (!publicBaseUrl) {
  throw new Error("PUBLIC_BASE_URL is required for deployed smoke tests");
}
if (!["enabled", "disabled"].includes(publicGuideMode)) {
  throw new Error("PUBLIC_GUIDE_MODE must be enabled or disabled");
}

const deployedUrl = new URL(publicBaseUrl);

if (deployedUrl.protocol !== "https:") {
  throw new Error("PUBLIC_BASE_URL must use HTTPS");
}

export default defineConfig({
  testDir: "./tests/deployed",
  outputDir: "test-results/deployed",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: deployedUrl.toString(),
    browserName: "chromium",
    channel: "chromium",
    locale: "en-US",
    timezoneId: "Asia/Seoul",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1
      }
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true
      }
    }
  ]
});
