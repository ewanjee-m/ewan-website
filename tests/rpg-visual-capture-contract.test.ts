import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  path.join(
    process.cwd(),
    "tests/visual/rpg-world-verification.mjs"
  ),
  "utf8"
);
const routeSource = readFileSync(
  path.join(
    process.cwd(),
    "tests/fixtures/rpg-playwright-world.ts"
  ),
  "utf8"
);

describe("RPG visual capture execution contract", () => {
  it("uses the installed Chromium channel instead of SwiftShader headless shell", () => {
    expect(source).toContain(
      'chromium.launch({ channel: "chromium" })'
    );
  });

  it("fails explicitly when requestAnimationFrame stops", () => {
    expect(routeSource).toContain("E_RAF_STALL");
    expect(routeSource).toContain("document.hidden");
    expect(routeSource).toContain("document.hasFocus()");
  });

  it("preserves the primary capture error during browser cleanup", () => {
    expect(source).toContain("primaryCaptureError");
    expect(source).toContain("primaryViewportError");
  });
});
