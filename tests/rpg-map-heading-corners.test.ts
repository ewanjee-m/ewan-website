import { describe, expect, it } from "vitest";
import { projectRpgReferenceMapHeadingRotation } from "../app/world/RpgMiniMapProjection";
import { RPG_WORLD_BOUNDS } from "../app/world/RpgWorldModel";
import { isWalkable } from "../app/world/RpgWorldGeometry";

const { minimumX, maximumX, minimumZ, maximumZ } = RPG_WORLD_BOUNDS;

const CORNERS = [
  [minimumX, minimumZ],
  [minimumX, maximumZ],
  [maximumX, minimumZ],
  [maximumX, maximumZ]
] as const;

const HEADINGS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2]
] as const;

describe("map heading at the edge of the world", () => {
  /**
   * The map arrow is decoration; a visitor walking into a corner is not an
   * error. Sampling forward leaves the terrain there, and so does sampling
   * backward along the same line, which used to throw and take the whole
   * world renderer down mid-walk.
   */
  it("never throws anywhere the visitor can actually stand", () => {
    for (const [x, z] of CORNERS) {
      for (const [hx, hz] of HEADINGS) {
        expect(() =>
          projectRpgReferenceMapHeadingRotation([x, 0, z], [hx, 0, hz])
        ).not.toThrow();
      }
    }
  });

  it("returns a usable angle at every boundary sample", () => {
    const step = 1.5;
    for (let x = minimumX; x <= maximumX; x += step) {
      for (const z of [minimumZ, maximumZ]) {
        if (!isWalkable([x, z])) continue;
        for (const [hx, hz] of HEADINGS) {
          const rotation = projectRpgReferenceMapHeadingRotation(
            [x, 0, z],
            [hx, 0, hz]
          );
          expect(Number.isFinite(rotation)).toBe(true);
          expect(rotation).toBeGreaterThan(-181);
          expect(rotation).toBeLessThanOrEqual(180);
        }
      }
    }
  });

  it("still refuses coordinates that are not numbers", () => {
    expect(() =>
      projectRpgReferenceMapHeadingRotation(
        [Number.NaN, 0, 0],
        [1, 0, 0]
      )
    ).toThrow();
  });
});
