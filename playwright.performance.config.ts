import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results/performance",
  timeout: 600_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  preserveOutput: "always",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: "chromium",
    locale: "en-US",
    timezoneId: "Asia/Seoul",
    contextOptions: { reducedMotion: "reduce" },
    trace: "off",
    screenshot: "only-on-failure",
    video: "off"
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
      name: "mobile-constrained",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: true
      }
    }
  ],
  webServer: {
    command:
      "PUBLIC_GUIDE_MODE=disabled npm run build && " +
      "PUBLIC_GUIDE_MODE=disabled npm run start -- --port 4173 --hostname 127.0.0.1",
    url: "http://127.0.0.1:4173/en",
    reuseExistingServer: false,
    timeout: 180_000
  }
});
