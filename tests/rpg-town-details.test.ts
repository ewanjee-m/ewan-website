import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RPG_MAIN_ROUTE,
  isRpgWalkablePosition
} from "../app/world/RpgTownSceneLayout";
import {
  RPG_COASTAL_ROCK_DETAILS,
  RPG_GYUKATSU_OUTDOOR_DETAILS,
  RPG_TOKYO_CROSSWALK_DETAILS
} from "../app/world/RpgTownDetailsLayout";

describe("approved town concept 3D details", () => {
  it("adds an irregular non-blocking rock line outside the airport walking road", () => {
    expect(RPG_COASTAL_ROCK_DETAILS.length).toBeGreaterThanOrEqual(10);
    expect(
      RPG_COASTAL_ROCK_DETAILS.every(({ blocksMovement }) => !blocksMovement)
    ).toBe(true);
    expect(
      new Set(
        RPG_COASTAL_ROCK_DETAILS.map(({ scale }) => scale.join(","))
      ).size
    ).toBeGreaterThanOrEqual(7);

    for (const rock of RPG_COASTAL_ROCK_DETAILS) {
      expect(rock.position[0]).toBeLessThanOrEqual(-34.2);
      expect(
        RPG_MAIN_ROUTE.some(
          (route) =>
            rock.position[0] >= route.minimumX &&
            rock.position[0] <= route.maximumX &&
            rock.position[2] >= route.minimumZ &&
            rock.position[2] <= route.maximumZ
        ),
        rock.id
      ).toBe(false);
    }
  });

  it("lays a flush, fully traversable zebra crossing over the Tokyo intersection", () => {
    expect(RPG_TOKYO_CROSSWALK_DETAILS).toHaveLength(9);
    const stripeX = RPG_TOKYO_CROSSWALK_DETAILS.map(
      ({ position }) => position[0]
    );
    expect(Math.max(...stripeX) - Math.min(...stripeX)).toBeGreaterThan(4);

    for (const stripe of RPG_TOKYO_CROSSWALK_DETAILS) {
      expect(stripe.blocksMovement, stripe.id).toBe(false);
      expect(stripe.size[1], stripe.id).toBeLessThanOrEqual(0.03);
      expect(stripe.position[1], stripe.id).toBeLessThanOrEqual(0.14);
      expect(
        isRpgWalkablePosition(stripe.position[0], stripe.position[2]),
        stripe.id
      ).toBe(true);
    }
  });

  it("places red-parasol outdoor seating at the gyukatsu plaza edge without blocking it", () => {
    expect(RPG_GYUKATSU_OUTDOOR_DETAILS.length).toBeGreaterThanOrEqual(6);
    expect(
      RPG_GYUKATSU_OUTDOOR_DETAILS.some(({ position }) => position[2] > 4.5)
    ).toBe(true);
    expect(
      RPG_GYUKATSU_OUTDOOR_DETAILS.some(({ position }) => position[2] < -4.5)
    ).toBe(true);

    for (const detail of RPG_GYUKATSU_OUTDOOR_DETAILS) {
      expect(detail.blocksMovement, detail.id).toBe(false);
      expect(detail.parasolColor, detail.id).toMatch(/^#(?:b|c)[0-9a-f]{5}$/i);
      expect(detail.seatOffsets.length, detail.id).toBeGreaterThanOrEqual(3);
      expect(Math.abs(detail.position[2]), detail.id).toBeGreaterThan(3);
      expect(
        isRpgWalkablePosition(detail.position[0], detail.position[2]),
        detail.id
      ).toBe(true);
      for (const [seatX, seatZ] of detail.seatOffsets) {
        expect(
          isRpgWalkablePosition(
            detail.position[0] + seatX,
            detail.position[2] + seatZ
          ),
          `${detail.id} seat`
        ).toBe(true);
      }
    }
  });

  it("renders every static detail in five shared presentation-aware instance batches", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/world/RpgTownDetails.tsx"),
      "utf8"
    );

    expect(source.match(/<Instances\b/g)).toHaveLength(5);
    expect(source.match(/frames=\{1\}/g)).toHaveLength(5);
    expect(source).toContain("RPG_COASTAL_ROCK_DETAILS");
    expect(source).toContain("RPG_TOKYO_CROSSWALK_DETAILS");
    expect(source).toContain("RPG_GYUKATSU_OUTDOOR_DETAILS");
    expect(source).toContain("blocksMovement: false");
    expect(source).toContain("presentation");
    expect(source).toContain("zoneWeights.tokyo");
    expect(source).toContain("zoneWeights.gyukatsu");
    expect(source).toContain("decorationDensity");
  });
});
