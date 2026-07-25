import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RPG_CANONICAL_MAP_SOURCE_IDS,
  RPG_MAP_EDGE_PADDING,
  RPG_MAP_LABEL_FONT_SIZE,
  RPG_MAP_LABEL_INK_BAND,
  RPG_MAP_LABEL_OUTLINE_WIDTH,
  RPG_MAP_LAND_SOURCE_ID,
  RPG_MAP_MARKER_GEOMETRY,
  RPG_MAP_NODES,
  RPG_MAP_PIXELS_PER_WORLD_UNIT,
  RPG_MAP_ROADS,
  RPG_MAP_TOUR_ORDER,
  RPG_MAP_VIEW_BOX,
  RPG_MINI_MAP_VIEW_BOX,
  RPG_WORLD_MAP_VIEW_BOX,
  getRpgMapNextZoneId,
  projectRpgMapWorldHeadingRotation,
  projectRpgMapWorldPoint,
  serializeRpgMapWorldPolygon
} from "../app/world/RpgMiniMapProjection";
import {
  RPG_WORLD_ARRIVALS,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_ROUTES,
  RPG_WORLD_TRANSITIONS,
  RPG_WORLD_ZONE_IDS
} from "../app/world/RpgWorldModel";
import { isWalkable } from "../app/world/RpgWorldGeometry";

const { minimumX, maximumX, minimumZ, maximumZ } = RPG_WORLD_BOUNDS;

describe("top-down world map projection", () => {
  it("is a square window on a square world, with room for the markers", () => {
    expect(maximumX - minimumX).toBe(maximumZ - minimumZ);
    expect(RPG_MAP_VIEW_BOX.width).toBe(RPG_MAP_VIEW_BOX.height);
    expect(RPG_MAP_VIEW_BOX.width).toBe(
      (maximumX - minimumX) * RPG_MAP_PIXELS_PER_WORLD_UNIT +
        RPG_MAP_EDGE_PADDING * 2
    );
    expect(RPG_MINI_MAP_VIEW_BOX).toBe(RPG_MAP_VIEW_BOX);
    expect(RPG_WORLD_MAP_VIEW_BOX).toBe(RPG_MAP_VIEW_BOX);

    // A marker drawn on the world edge has to fit inside the drawing, which is
    // what the padding ring is for. This is the "arrow half outside the right
    // edge" defect expressed as a number.
    expect(RPG_MAP_EDGE_PADDING).toBeGreaterThanOrEqual(
      Math.max(
        RPG_MAP_MARKER_GEOMETRY.playerHaloRadius,
        RPG_MAP_MARKER_GEOMETRY.playerArrowLength,
        RPG_MAP_MARKER_GEOMETRY.arrivalRingRadius
      )
    );
  });

  it("puts north up and east right, by hand-computed corners", () => {
    const padding = RPG_MAP_EDGE_PADDING;
    const span =
      (maximumX - minimumX) * RPG_MAP_PIXELS_PER_WORLD_UNIT;

    // North-west corner of the world: minimum X, maximum Z.
    expect(projectRpgMapWorldPoint([minimumX, 0, maximumZ])).toEqual({
      x: padding,
      y: padding
    });
    // South-east corner: maximum X, minimum Z.
    expect(projectRpgMapWorldPoint([maximumX, 0, minimumZ])).toEqual({
      x: padding + span,
      y: padding + span
    });
    // The origin lands dead centre.
    expect(projectRpgMapWorldPoint([0, 0, 0])).toEqual({
      x: padding + span / 2,
      y: padding + span / 2
    });

    // Walking east moves right on screen; walking north moves up.
    const centre = projectRpgMapWorldPoint([0, 0, 0]);
    expect(projectRpgMapWorldPoint([10, 0, 0]).x).toBeGreaterThan(centre.x);
    expect(projectRpgMapWorldPoint([10, 0, 0]).y).toBe(centre.y);
    expect(projectRpgMapWorldPoint([0, 0, 10]).y).toBeLessThan(centre.y);
    expect(projectRpgMapWorldPoint([0, 0, 10]).x).toBe(centre.x);
  });

  it("accepts a flat world point and serializes polygons in the same space", () => {
    expect(projectRpgMapWorldPoint([12, -8])).toEqual(
      projectRpgMapWorldPoint([12, 0, -8])
    );
    const corner = projectRpgMapWorldPoint([minimumX, 0, maximumZ]);
    expect(
      serializeRpgMapWorldPolygon([
        [minimumX, maximumZ],
        [maximumX, maximumZ]
      ])
    ).toBe(
      `${corner.x},${corner.y} ` +
        `${projectRpgMapWorldPoint([maximumX, 0, maximumZ]).x},${corner.y}`
    );
  });

  it("points the heading arrow the way the visitor actually walks", () => {
    // The arrow path is drawn along +X at rest, so a rotation of 0 is
    // screen-right and -90 is screen-up.
    expect(projectRpgMapWorldHeadingRotation([1, 0, 0])).toBe(0);
    expect(projectRpgMapWorldHeadingRotation([0, 0, 1])).toBe(-90);
    expect(projectRpgMapWorldHeadingRotation([-1, 0, 0])).toBe(180);
    expect(projectRpgMapWorldHeadingRotation([0, 0, -1])).toBe(90);
    expect(projectRpgMapWorldHeadingRotation([0, 0, 0])).toBe(0);
  });

  it("agrees with the projection: the arrow points at where a step lands", () => {
    let compared = 0;
    for (const [x, z] of [
      [0, 0],
      [-30, 12],
      [26, -18],
      [minimumX + 1, minimumZ + 1],
      [maximumX - 1, maximumZ - 1]
    ] as const) {
      for (const [hx, hz] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
        [Math.SQRT1_2, Math.SQRT1_2],
        [-0.6, 0.8]
      ] as const) {
        const stepX = x + hx * 0.5;
        const stepZ = z + hz * 0.5;
        // The projection clamps to the world, so a step that leaves the world
        // lands on the same pixel and carries no direction. A visitor cannot
        // take that step either.
        if (
          stepX < minimumX ||
          stepX > maximumX ||
          stepZ < minimumZ ||
          stepZ > maximumZ
        ) {
          continue;
        }
        compared += 1;
        const here = projectRpgMapWorldPoint([x, 0, z]);
        const step = projectRpgMapWorldPoint([stepX, 0, stepZ]);
        const expected =
          (Math.atan2(step.y - here.y, step.x - here.x) * 180) / Math.PI;
        const actual = projectRpgMapWorldHeadingRotation([hx, 0, hz]);
        const error = Math.abs(((actual - expected + 540) % 360) - 180);
        expect(error, `${x},${z} facing ${hx},${hz}`).toBeLessThan(0.02);
      }
    }
    expect(compared).toBe(30);
  });

  it("never throws and never leaves the frame, anywhere a visitor can stand", () => {
    const radius = Math.max(
      RPG_MAP_MARKER_GEOMETRY.playerHaloRadius,
      RPG_MAP_MARKER_GEOMETRY.playerArrowLength
    );
    let samples = 0;
    for (let x = minimumX; x <= maximumX; x += 0.5) {
      for (let z = minimumZ; z <= maximumZ; z += 0.5) {
        if (!isWalkable([x, z])) continue;
        samples += 1;
        const point = projectRpgMapWorldPoint([x, 0, z]);
        expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
        expect(point.x - radius, `${x},${z}`).toBeGreaterThanOrEqual(0);
        expect(point.y - radius, `${x},${z}`).toBeGreaterThanOrEqual(0);
        expect(point.x + radius, `${x},${z}`).toBeLessThanOrEqual(
          RPG_MAP_VIEW_BOX.width
        );
        expect(point.y + radius, `${x},${z}`).toBeLessThanOrEqual(
          RPG_MAP_VIEW_BOX.height
        );
      }
    }
    expect(samples).toBeGreaterThan(10_000);
  });

  it("refuses coordinates that are not numbers", () => {
    expect(() => projectRpgMapWorldPoint([Number.NaN, 0, 0])).toThrow(RangeError);
    expect(() =>
      projectRpgMapWorldHeadingRotation([Number.NaN, 0, 1])
    ).toThrow(RangeError);
  });
});

describe("what the map draws", () => {
  it("draws nothing from the reference illustration", async () => {
    const projection = await import("../app/world/RpgMiniMapProjection");
    expect(projection).not.toHaveProperty("RPG_REFERENCE_MAP_COASTLINE");
    expect(RPG_CANONICAL_MAP_SOURCE_IDS).not.toContain(
      "approved-reference-coastline"
    );
    for (const transitionId of RPG_WORLD_TRANSITIONS.map(({ id }) => id)) {
      expect(RPG_CANONICAL_MAP_SOURCE_IDS).not.toContain(transitionId);
    }
  });

  it("lists exactly the world features it can draw from the model", () => {
    expect([...RPG_CANONICAL_MAP_SOURCE_IDS].sort()).toEqual(
      [
        RPG_MAP_LAND_SOURCE_ID,
        ...RPG_WORLD_ZONE_IDS,
        ...RPG_MAP_ROADS.map(({ id }) => id),
        "sakura-canal",
        "sakura-bridge",
        ...RPG_WORLD_ARRIVALS.map(({ id }) => id),
        "player"
      ].sort()
    );
    expect(RPG_MAP_ROADS.map(({ id }) => id)).toEqual(
      RPG_WORLD_ROUTES.filter(({ surface }) => surface === "road").map(
        ({ id }) => id
      )
    );
  });

  it("places one labelled node on every arrival, in world coordinates", () => {
    expect(RPG_MAP_NODES.map(({ arrivalId }) => arrivalId)).toEqual(
      RPG_WORLD_ARRIVALS.map(({ id }) => id)
    );
    for (const node of RPG_MAP_NODES) {
      const arrival = RPG_WORLD_ARRIVALS.find(
        ({ id }) => id === node.arrivalId
      )!;
      expect(node.point).toEqual(projectRpgMapWorldPoint(arrival.position));
      expect(node.headingRotation).toBe(
        projectRpgMapWorldHeadingRotation([
          arrival.heading[0],
          0,
          arrival.heading[1]
        ])
      );
    }
  });

  it("measures a name's ink with the outline the stylesheet actually paints", () => {
    // The clearance below is computed from the font size plus this outline, so
    // if the stylesheet widens it the gate quietly starts under-measuring how
    // much of the map a name covers. The rule lives in a file this module
    // cannot import, so it is read.
    const stylesheet = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8"
    );
    const rule = /\.rpg-mini-map-label\s*\{([^}]*)\}/.exec(stylesheet);
    expect(rule, ".rpg-mini-map-label is missing from app/globals.css").not
      .toBeNull();
    const strokeWidth = /stroke-width:\s*([\d.]+)/.exec(rule![1]);
    expect(strokeWidth, ".rpg-mini-map-label paints no outline").not.toBeNull();
    expect(Number(strokeWidth![1])).toBe(RPG_MAP_LABEL_OUTLINE_WIDTH);
    expect(RPG_MAP_LABEL_INK_BAND.above).toBeGreaterThan(
      RPG_MAP_LABEL_INK_BAND.below
    );
    expect(
      RPG_MAP_LABEL_INK_BAND.above + RPG_MAP_LABEL_INK_BAND.below
    ).toBe(RPG_MAP_LABEL_FONT_SIZE + RPG_MAP_LABEL_OUTLINE_WIDTH);
  });

  it("keeps the five names apart no matter how long the words are", () => {
    // Two labels can only collide if their baselines share a line, so the
    // gate is on vertical separation, which does not depend on the locale.
    for (const first of RPG_MAP_NODES) {
      for (const second of RPG_MAP_NODES) {
        if (first.zoneId >= second.zoneId) continue;
        expect(
          Math.abs(first.label.y - second.label.y),
          `${first.zoneId} vs ${second.zoneId}`
        ).toBeGreaterThanOrEqual(RPG_MAP_LABEL_FONT_SIZE);
      }
    }
  });

  it("keeps every name out from under the visitor marker", () => {
    // Reported from play: standing at Sakura, the visitor marker sat on top of
    // the Hanabi name and hid the middle of it. An arrival is where a district
    // pins its own name and where a visitor who walks into that district ends
    // up, so every one of the five is a place the marker is certain to be
    // drawn, and it is drawn over the names rather than under them.
    //
    // A name's width depends on the locale, so, as with the separation gate
    // above, the clearance is vertical: bands that do not share a line cannot
    // collide however long the words are. The marker's footprint is a disc,
    // and the arrow tip sweeps further out than the halo edge, so the radius
    // is the longer of the two rather than the halo alone.
    const markerRadius = Math.max(
      RPG_MAP_MARKER_GEOMETRY.playerHaloRadius,
      RPG_MAP_MARKER_GEOMETRY.playerArrowLength
    );
    for (const standing of RPG_MAP_NODES) {
      const markerTop = standing.point.y - markerRadius;
      const markerBottom = standing.point.y + markerRadius;
      for (const named of RPG_MAP_NODES) {
        const labelTop = named.label.y - RPG_MAP_LABEL_INK_BAND.above;
        const labelBottom = named.label.y + RPG_MAP_LABEL_INK_BAND.below;
        // Soft, so a placement change reports every name it buries at once
        // rather than one per run.
        // Soft, so a placement change reports every name it buries at once
        // rather than one per run.
        expect.soft(
          Math.max(markerTop - labelBottom, labelTop - markerBottom),
          `the ${named.zoneId} name is under the marker at ${standing.zoneId}`
        ).toBeGreaterThan(0);
      }
    }
  });

  it("grows every label towards the middle of the frame", () => {
    for (const node of RPG_MAP_NODES) {
      expect(node.label.y).toBeGreaterThanOrEqual(RPG_MAP_LABEL_FONT_SIZE);
      expect(node.label.y).toBeLessThanOrEqual(
        RPG_MAP_VIEW_BOX.height - RPG_MAP_LABEL_FONT_SIZE
      );
      if (node.label.anchor === "start") {
        expect(node.label.x).toBeLessThan(RPG_MAP_VIEW_BOX.width / 2);
      } else if (node.label.anchor === "end") {
        expect(node.label.x).toBeGreaterThan(RPG_MAP_VIEW_BOX.width / 2);
      } else {
        expect(
          Math.min(node.label.x, RPG_MAP_VIEW_BOX.width - node.label.x)
        ).toBeGreaterThanOrEqual(260);
      }
    }
  });
});

describe("where to go next", () => {
  it("follows the transition chain the world actually connects", () => {
    expect(RPG_MAP_TOUR_ORDER).toEqual(RPG_WORLD_ZONE_IDS);
    for (let index = 1; index < RPG_MAP_TOUR_ORDER.length; index += 1) {
      const from = RPG_MAP_TOUR_ORDER[index - 1];
      const to = RPG_MAP_TOUR_ORDER[index];
      expect(getRpgMapNextZoneId(from), from).toBe(to);
      expect(
        RPG_WORLD_TRANSITIONS.some(
          (transition) =>
            transition.fromZoneId === from && transition.toZoneId === to
        ),
        `${from} -> ${to} has no walkable transition`
      ).toBe(true);
    }
    expect(getRpgMapNextZoneId(RPG_MAP_TOUR_ORDER.at(-1)!)).toBeNull();
  });
});
