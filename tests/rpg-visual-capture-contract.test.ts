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

  it("waits for the rendered camera to face the player after fixture turns", () => {
    expect(source).toContain("const facingResolved");
    expect(source).toContain("cameraFacingDot >= 0.98");
    expect(
      source.match(/await waitForCameraFixture\(/g)
    ).toHaveLength(4);
  });

  it("uses one landmark-focused camera fixture source instead of arrival-heading offsets", () => {
    expect(source).toContain(
      'RPG_VISUAL_CAMERA_FIXTURES'
    );
    expect(source).toContain(
      'resolveRpgVisualCameraYaw'
    );
    expect(source).not.toContain("const CAMERA_FIXTURES = {");
    expect(source).not.toContain(
      "headingYaw + fixture.yawOffsetDegrees"
    );
  });

  it("aims the airport proof at the live moving coach", () => {
    expect(source).toContain("busPosition");
    expect(source).toContain('id === "airport"');
  });
});
