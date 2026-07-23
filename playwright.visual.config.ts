import { defineConfig } from "@playwright/test";

const evidenceDirectory =
  process.env.ARCHITECTURE_EVIDENCE_DIR ??
  "test-results/visual-fidelity/unmanaged";

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: `${evidenceDirectory}/playwright-results`,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.ARCHITECTURE_BASE_URL ?? "http://127.0.0.1:4180",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  }
});
