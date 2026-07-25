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

  it("reuses one browser context and page for every capture in a viewport", () => {
    const captureViewportSource = source.slice(
      source.indexOf("async function captureViewport("),
      source.indexOf("async function capture()")
    );

    expect(captureViewportSource).toContain("if (page) return page;");
    expect(
      captureViewportSource.match(/browser\.newContext\(/g)
    ).toHaveLength(1);
    expect(
      captureViewportSource.match(/context\.newPage\(/g)
    ).toHaveLength(1);
    expect(
      captureViewportSource.match(/await context\?\.close\(\)/g)
    ).toHaveLength(1);
  });

  it("waits for foreground occluders to finish fading before proof screenshots", () => {
    expect(source).toContain(
      'const CAMERA_OCCLUSION_SETTLE_IDS = new Set(["narrow-camera", "obstacle-camera", "sakura"]);'
    );
    expect(source).toContain("const CAMERA_OCCLUSION_SETTLE_MS = 450;");
    expect(source).toContain("CAMERA_OCCLUSION_SETTLE_IDS.has(id)");
    expect(source).toContain(
      "await page.waitForTimeout(CAMERA_OCCLUSION_SETTLE_MS);"
    );
  });

  it("uses the clearest collision-valid Gyukatsu obstacle angle", () => {
    expect(source).toContain(
      "const GYUKATSU_OBSTACLE_POSITION = [4.5, 4.5];"
    );
    expect(source).toContain(
      "const GYUKATSU_OBSTACLE_YAW_OFFSET_DEGREES = 55;"
    );
    expect(source).toContain(
      "await driveTo(page, GYUKATSU_OBSTACLE_POSITION, { run: false })"
    );
    expect(source).toContain(
      "obstacleYaw - GYUKATSU_OBSTACLE_YAW_OFFSET_DEGREES * Math.PI / 180"
    );
  });

  it("waits for the rendered camera to face the player after fixture turns", () => {
    expect(source).toContain("const facingResolved");
    expect(source).toContain("cameraFacingDot >= 0.98");
    expect(
      source.match(/await waitForCameraFixture\(/g)
    ).toHaveLength(7);
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

  it("keeps Hanabi travel pitch separate from the final scenic pitch", () => {
    expect(source).toContain(
      'getRegionCameraProfile("hanabi", viewportName).pitchDegrees'
    );
    expect(source).toContain("hanabiTravelPitchDegrees");
    expect(
      source.match(
        /await waitForCameraFixture\(\s*page,\s*hanabiTravelPitchDegrees,/g
      )
    ).toHaveLength(3);
    expect(
      source.match(
        /await waitForCameraFixture\(\s*page,\s*CAMERA_FIXTURES\.hanabi\.pitchDegrees,/g
      ) ?? []
    ).toHaveLength(0);
    expect(source).toMatch(
      /await setCamera\([\s\S]*?interactionCamera\.position[\s\S]*?hanabiTravelPitchDegrees\s*\);/
    );
  });

  it("captures Hanabi with the untouched live chase-camera profile", () => {
    expect(source).toContain("applyCameraFixture = true");
    expect(source).toContain('applyCameraFixture: id !== "hanabi"');
    expect(source).toContain("E_HANABI_LIVE_CAMERA");
    expect(source).toContain(
      'getRegionCameraProfile("hanabi", viewportName)'
    );
  });

  it("aims the airport proof at the live moving coach", () => {
    expect(source).toContain("busPosition");
    expect(source).toContain('id === "airport"');
  });
});
