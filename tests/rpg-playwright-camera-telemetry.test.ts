import { describe, expect, it } from "vitest";
import {
  assertSafeCameraTelemetry,
  type WorldTelemetry
} from "./fixtures/rpg-playwright-world";

const SAFE_TELEMETRY: WorldTelemetry = {
  positionRaw: "0,0,0",
  position: [0, 0, 0],
  headingRaw: "0,0,1",
  heading: [0, 0, 1],
  revision: "1",
  zone: "hanabi",
  navigationRegion: "hanabi",
  inputLocked: false,
  movement: [0, 0],
  movementStrength: 0,
  runRequested: false,
  playerMoving: false,
  playerLocomotion: "idle",
  cameraYaw: 0,
  cameraPitch: Math.PI / 10,
  cameraBoom: 9.2,
  cameraFacingDot: 0.93,
  cameraCollisionAdjusted: false,
  cameraCollisionAdjustment: 0,
  cameraLateralCollisionEscape: false,
  cameraSafeViolationMs: 0,
  cameraDiagnostic: "ok"
};

describe("Playwright camera telemetry assertions", () => {
  it("can tolerate only transient facing lag while preserving every other safety assertion", () => {
    expect(() => assertSafeCameraTelemetry(SAFE_TELEMETRY)).toThrow(
      "camera is not facing the player focus"
    );
    expect(() =>
      assertSafeCameraTelemetry(SAFE_TELEMETRY, {
        requireFacing: false
      })
    ).not.toThrow();
    expect(() =>
      assertSafeCameraTelemetry(
        {
          ...SAFE_TELEMETRY,
          cameraDiagnostic: "non-finite-collision"
        },
        { requireFacing: false }
      )
    ).toThrow("camera diagnostic failed");
  });
});
