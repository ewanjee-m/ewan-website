import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["rpg-performance.spec.ts"],
  outputDir: "test-results/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName: "chromium",
    channel: "chromium",
    locale: "en-US",
    timezoneId: "Asia/Seoul",
    contextOptions: { reducedMotion: "reduce" },
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off"
  },
  webServer: {
    command:
      "PUBLIC_GUIDE_MODE=disabled npm run build && PUBLIC_GUIDE_MODE=disabled npm run start -- --port 4173 --hostname 127.0.0.1",
    url: "http://127.0.0.1:4173/en",
    reuseExistingServer: false,
    timeout: 180_000
  }
});
