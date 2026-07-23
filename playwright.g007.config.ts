import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const evidenceDirectory = process.env.G007_EVIDENCE_DIR;
const baseURL = process.env.G007_BASE_URL;

if (!evidenceDirectory || !baseURL) {
  throw new Error("G007_EVIDENCE_DIR and G007_BASE_URL are required");
}

const repositoryRoot = fs.realpathSync(process.cwd());
const evidenceRoot = fs.realpathSync(
  path.join(repositoryRoot, "test-results", "visual-fidelity")
);
const resolvedEvidence = fs.realpathSync(evidenceDirectory);
const evidenceStat = fs.lstatSync(resolvedEvidence);

if (
  evidenceStat.isSymbolicLink() ||
  !evidenceStat.isDirectory() ||
  path.dirname(resolvedEvidence) !== evidenceRoot ||
  !/^g007-/.test(path.basename(resolvedEvidence))
) {
  throw new Error("G007_EVIDENCE_DIR must be a canonical g007-* evidence child");
}

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: "g007-verification.spec.ts",
  outputDir: path.join(resolvedEvidence, "playwright-results"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  }
});
