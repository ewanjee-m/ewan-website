import { describe, expect, it } from "vitest";
import { isZoneDetailed } from "../app/world/ZoneDetail";

describe("zone detail range", () => {
  const airportPosition = { x: 0, y: 12.08, z: 0 };
  const positionAt = (angle: number) => ({
    x: 0,
    y: Math.cos(angle) * 12.08,
    z: -Math.sin(angle) * 12.08
  });

  it("keeps the current and adjacent mobile zones ready but hides remote detail", () => {
    expect(isZoneDetailed(airportPosition, 0, "medium")).toBe(true);
    expect(isZoneDetailed(airportPosition, Math.PI / 3, "medium")).toBe(true);
    expect(isZoneDetailed(airportPosition, (Math.PI * 5) / 3, "medium")).toBe(
      true
    );
    expect(isZoneDetailed(airportPosition, Math.PI, "medium")).toBe(false);
  });

  it("keeps adjacent high-quality zones detailed but uses silhouettes remotely", () => {
    expect(isZoneDetailed(airportPosition, Math.PI / 3, "high")).toBe(true);
    expect(isZoneDetailed(airportPosition, Math.PI, "high")).toBe(false);
  });

  it.each(["high", "medium", "low"] as const)(
    "keeps both neighbors of the current zone detailed near a %s-quality boundary",
    (qualityLevel) => {
      const justBeforeTokyo = positionAt((Math.PI * 29) / 180);

      expect(isZoneDetailed(justBeforeTokyo, 0, qualityLevel)).toBe(true);
      expect(
        isZoneDetailed(justBeforeTokyo, Math.PI / 3, qualityLevel)
      ).toBe(true);
      expect(
        isZoneDetailed(justBeforeTokyo, (Math.PI * 5) / 3, qualityLevel)
      ).toBe(true);
      expect(
        isZoneDetailed(justBeforeTokyo, (Math.PI * 2) / 3, qualityLevel)
      ).toBe(false);
    }
  );
});
