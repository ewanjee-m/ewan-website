import path from "node:path";
import { describe, expect, it } from "vitest";
import playwrightConfig from "../playwright.config";

describe("Playwright output isolation", () => {
  it("keeps E2E artifacts outside the visual-fidelity evidence tree", () => {
    const root = process.cwd();
    const outputDir = path.resolve(root, playwrightConfig.outputDir ?? "");
    const visualEvidenceDir = path.resolve(
      root,
      "test-results/visual-fidelity"
    );

    expect(outputDir).toBe(path.resolve(root, "test-results/e2e"));
    expect(outputDir).not.toBe(visualEvidenceDir);
    expect(path.relative(outputDir, visualEvidenceDir)).toMatch(
      /^\.\.(?:[/\\]|$)/
    );
  });
});
