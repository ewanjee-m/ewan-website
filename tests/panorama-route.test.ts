import { describe, expect, it } from "vitest";
import {
  PANORAMA_ROUTE_ANCHORS,
  createPanoramaRoutePoint,
  mapWorldToPanoramaInto
} from "../app/world/PanoramaRoute";

describe("approved panorama walk route", () => {
  it("orders the actual image landmarks from airport bus to hanabi", () => {
    expect(PANORAMA_ROUTE_ANCHORS.map((anchor) => anchor.id)).toEqual([
      "airport",
      "tokyo",
      "gyukatsu",
      "sakura",
      "hanabi"
    ]);
    for (let index = 1; index < PANORAMA_ROUTE_ANCHORS.length; index += 1) {
      expect(PANORAMA_ROUTE_ANCHORS[index].worldX).toBeGreaterThan(
        PANORAMA_ROUTE_ANCHORS[index - 1].worldX
      );
      expect(PANORAMA_ROUTE_ANCHORS[index].imageX).toBeGreaterThan(
        PANORAMA_ROUTE_ANCHORS[index - 1].imageX
      );
    }
  });

  it.each(PANORAMA_ROUTE_ANCHORS)(
    "lands on the painted $id walkway instead of a separate 3D object",
    (anchor) => {
      const point = mapWorldToPanoramaInto(
        { x: anchor.worldX, z: 0 },
        createPanoramaRoutePoint()
      );
      expect(point.x).toBeCloseTo(anchor.imageX, 8);
      expect(point.y).toBeCloseTo(anchor.imageY, 8);
      expect(point.scale).toBeCloseTo(anchor.scale, 8);
    }
  );

  it("moves upward and becomes smaller when the player walks deeper into the image", () => {
    const near = mapWorldToPanoramaInto(
      { x: 0, z: 4.5 },
      createPanoramaRoutePoint()
    );
    const far = mapWorldToPanoramaInto(
      { x: 0, z: -4.5 },
      createPanoramaRoutePoint()
    );

    expect(far.y).toBeGreaterThan(near.y);
    expect(far.scale).toBeLessThan(near.scale);
  });

  it("reuses the caller-owned point in the animation loop", () => {
    const point = createPanoramaRoutePoint();
    expect(mapWorldToPanoramaInto({ x: -5, z: 1 }, point)).toBe(point);
  });
});
