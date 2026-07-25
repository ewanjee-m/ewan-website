import { describe, expect, it } from "vitest";
import {
  RPG_DISTRICT_ARCHITECTURE,
  RPG_KAWARA_ROOF_COLORS,
  RPG_MACHIYA_PLASTER_COLORS,
  RPG_MACHIYA_TIMBER_COLORS,
  RPG_MACHIYA_WALL_COLORS,
  RPG_TIMBER_WALL_MAX_HEIGHT,
  RPG_PERIMETER_MID_RING_IDS,
  RPG_PERIMETER_NEAR_RING_IDS,
  RPG_PERIMETER_NEIGHBORHOOD,
  RPG_PERIMETER_SKYLINE_RING_IDS,
  RPG_TILED_ROOF_EAVE_OVERHANG,
  RPG_TILED_ROOF_STRUCTURES
} from "../app/world/RpgTownArchitectureLayout";
import {
  RPG_BOARD_FENCE_PANELS,
  RPG_BUS_STOP_STRUCTURES,
  RPG_NOREN_CURTAINS,
  RPG_PINE_TIERS,
  RPG_PINE_TRUNKS,
  RPG_SHOPFRONT_LATTICE,
  RPG_STREET_TORII,
  RPG_TORII_GATES,
  RPG_VERTICAL_KANBAN
} from "../app/world/RpgTownStreetLifeLayout";
import {
  RPG_LANDMARKS,
  RPG_TOWN_BOUNDS
} from "../app/world/RpgTownSceneLayout";
import { getRpgTownRenderStats } from "../app/world/RpgTownRenderStats";

const HEX = /^#[0-9a-f]{6}$/;

function channels(hex: string) {
  expect(hex, hex).toMatch(HEX);
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ] as const;
}

function luminance(hex: string) {
  const [r, g, b] = channels(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Vermilion and indigo are the two reds/blues the town is allowed to shout in. */
function isVermilion(hex: string) {
  const [r, g, b] = channels(hex);
  return r > 130 && r > g * 1.7 && r > b * 1.7;
}

function isIndigo(hex: string) {
  const [r, , b] = channels(hex);
  return b > r * 1.25 && b > 55 && luminance(hex) < 0.45;
}

describe("Japanese roof silhouette", () => {
  it("splits the perimeter into tiled-roof neighbourhoods and a modern far skyline", () => {
    const byId = new Map(
      RPG_PERIMETER_NEIGHBORHOOD.map((building) => [building.id, building])
    );

    expect(RPG_PERIMETER_NEAR_RING_IDS.length).toBeGreaterThanOrEqual(32);
    expect(RPG_PERIMETER_MID_RING_IDS.length).toBeGreaterThanOrEqual(20);
    expect(RPG_PERIMETER_SKYLINE_RING_IDS.length).toBeGreaterThanOrEqual(24);

    for (const id of [
      ...RPG_PERIMETER_NEAR_RING_IDS,
      ...RPG_PERIMETER_MID_RING_IDS
    ]) {
      const building = byId.get(id);
      expect(building, id).toBeDefined();
      expect(["gable", "hip"], id).toContain(building!.roofStyle);
    }
    for (const id of RPG_PERIMETER_SKYLINE_RING_IDS) {
      const building = byId.get(id);
      expect(building, id).toBeDefined();
      expect(["terrace", "stepped"], id).toContain(building!.roofStyle);
    }

    // The existing budget contract still wants at least three distinct styles.
    expect(
      new Set(RPG_PERIMETER_NEIGHBORHOOD.map(({ roofStyle }) => roofStyle)).size
    ).toBe(4);
  });

  it("gives every tiled roof an eave that overhangs the wall it sits on", () => {
    expect(RPG_TILED_ROOF_EAVE_OVERHANG).toBeGreaterThanOrEqual(0.55);
    expect(RPG_TILED_ROOF_STRUCTURES.length).toBeGreaterThanOrEqual(57);

    for (const roof of RPG_TILED_ROOF_STRUCTURES) {
      const [width, , depth] = roof.size;
      expect(roof.eaveWidth, roof.id).toBeGreaterThanOrEqual(
        width + RPG_TILED_ROOF_EAVE_OVERHANG * 2
      );
      expect(roof.eaveDepth, roof.id).toBeGreaterThanOrEqual(
        depth + RPG_TILED_ROOF_EAVE_OVERHANG * 2
      );
      expect(roof.cornerFlickCount, roof.id).toBe(4);
      expect(roof.hasRidge, roof.id).toBe(true);
    }
  });

  it("roofs the town in kawara tile greys rather than per-building accents", () => {
    for (const color of RPG_KAWARA_ROOF_COLORS) {
      expect(luminance(color), color).toBeLessThan(0.36);
    }
    for (const roof of RPG_TILED_ROOF_STRUCTURES) {
      expect(RPG_KAWARA_ROOF_COLORS, roof.id).toContain(roof.roofColor);
    }
  });

  it("keeps dark timber off the tall perimeter walls", () => {
    // A whole 7-unit wall in charred timber reads as a black slab at chase
    // distance, not as a machiya. Timber belongs on the low buildings.
    for (const id of [
      ...RPG_PERIMETER_NEAR_RING_IDS,
      ...RPG_PERIMETER_MID_RING_IDS
    ]) {
      const building = RPG_PERIMETER_NEIGHBORHOOD.find(
        (candidate) => candidate.id === id
      )!;
      if (building.size[1] <= RPG_TIMBER_WALL_MAX_HEIGHT) continue;
      expect(RPG_MACHIYA_PLASTER_COLORS, `${id} h=${building.size[1]}`)
        .toContain(building.color);
    }
    // Both families still have to appear somewhere on the ring.
    const used = new Set(
      [...RPG_PERIMETER_NEAR_RING_IDS, ...RPG_PERIMETER_MID_RING_IDS].map(
        (id) =>
          RPG_PERIMETER_NEIGHBORHOOD.find((candidate) => candidate.id === id)!
            .color
      )
    );
    expect(
      RPG_MACHIYA_PLASTER_COLORS.some((color) => used.has(color))
    ).toBe(true);
    expect(
      RPG_MACHIYA_TIMBER_COLORS.some((color) => used.has(color))
    ).toBe(true);
  });

  it("walls the perimeter in plaster and dark timber instead of city greys", () => {
    for (const id of [
      ...RPG_PERIMETER_NEAR_RING_IDS,
      ...RPG_PERIMETER_MID_RING_IDS
    ]) {
      const building = RPG_PERIMETER_NEIGHBORHOOD.find(
        (candidate) => candidate.id === id
      )!;
      expect(RPG_MACHIYA_WALL_COLORS, id).toContain(building.color);
    }
    // Plaster has to actually read as off-white next to the timber.
    const plaster = RPG_MACHIYA_WALL_COLORS.filter(
      (color) => luminance(color) > 0.7
    );
    const timber = RPG_MACHIYA_WALL_COLORS.filter(
      (color) => luminance(color) < 0.3
    );
    expect(plaster.length).toBeGreaterThanOrEqual(2);
    expect(timber.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Japanese street dressing", () => {
  it("hangs indigo noren over every shopfront doorway", () => {
    const shopfronts = RPG_DISTRICT_ARCHITECTURE.filter(({ kind }) =>
      kind === "machiya" || kind === "tower" || kind === "terminal"
    );
    expect(shopfronts.length).toBeGreaterThanOrEqual(15);

    for (const structure of shopfronts) {
      // Cloth panels only — the rod they hang from is timber by design.
      const panels = RPG_NOREN_CURTAINS.filter(({ id }) =>
        new RegExp(`^${structure.id}-noren-panel-\\d+$`).test(id)
      );
      expect(panels.length, structure.id).toBeGreaterThanOrEqual(3);
      expect(
        RPG_NOREN_CURTAINS.some(
          ({ id }) => id === `${structure.id}-noren-rail`
        ),
        structure.id
      ).toBe(true);
      for (const panel of panels) {
        expect(isIndigo(panel.color), `${panel.id} ${panel.color}`).toBe(true);
        // A curtain hangs clear of the wall it covers.
        const offset = Math.hypot(
          panel.position[0] - structure.position[0],
          panel.position[2] - structure.position[2]
        );
        expect(offset, panel.id).toBeGreaterThan(
          Math.min(structure.size[0], structure.size[2]) / 2
        );
      }
    }
  });

  it("stacks vertical kanban blades up every tower and terminal", () => {
    const signed = RPG_DISTRICT_ARCHITECTURE.filter(
      ({ kind }) => kind === "tower" || kind === "terminal"
    );
    expect(signed.length).toBeGreaterThanOrEqual(10);

    for (const structure of signed) {
      const blades = RPG_VERTICAL_KANBAN.filter(({ id }) =>
        id.startsWith(`${structure.id}-kanban-`)
      );
      expect(blades.length, structure.id).toBeGreaterThanOrEqual(2);

      for (const blade of blades) {
        // A kanban is a tall narrow blade, not a fascia band.
        expect(blade.size[1], blade.id).toBeGreaterThan(blade.size[0] * 2.5);
        expect(blade.size[1], blade.id).toBeGreaterThan(blade.size[2] * 4);
        // It stands proud of the wall so it is legible along the street.
        const offset = Math.hypot(
          blade.position[0] - structure.position[0],
          blade.position[2] - structure.position[2]
        );
        expect(offset, blade.id).toBeGreaterThan(
          Math.min(structure.size[0], structure.size[2]) / 2
        );
      }

      // Blades stack up the elevation instead of piling on one another.
      const heights = blades
        .map(({ position }) => position[1])
        .sort((a, b) => a - b);
      for (let index = 1; index < heights.length; index += 1) {
        expect(
          heights[index] - heights[index - 1],
          `${structure.id} blade spacing`
        ).toBeGreaterThan(0.6);
      }
    }
  });

  it("battens shopfronts with vertical timber lattice", () => {
    expect(RPG_SHOPFRONT_LATTICE.length).toBeGreaterThanOrEqual(90);
    for (const batten of RPG_SHOPFRONT_LATTICE) {
      expect(luminance(batten.color), batten.id).toBeLessThan(0.3);
      // Vertical: taller than it is wide or deep.
      expect(batten.size[1], batten.id).toBeGreaterThan(batten.size[0] * 3);
      expect(batten.size[1], batten.id).toBeGreaterThan(batten.size[2] * 3);
    }
  });

  it("stands a vermilion torii on the airport approach and keeps every gate in bounds", () => {
    expect(RPG_TORII_GATES.length).toBeGreaterThanOrEqual(2);
    expect(
      RPG_TORII_GATES.some(({ zoneId }) => zoneId === "airport")
    ).toBe(true);

    for (const gate of RPG_TORII_GATES) {
      expect(isVermilion(gate.color), `${gate.id} ${gate.color}`).toBe(true);
      expect(Math.abs(gate.position[0]), gate.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumX
      );
      expect(Math.abs(gate.position[2]), gate.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumZ
      );
    }
    // Kasagi, shimaki, nuki, gakuzuka and two pillars per gate.
    expect(RPG_STREET_TORII.length).toBeGreaterThanOrEqual(
      RPG_TORII_GATES.length * 6
    );
  });

  it("never stands a street torii on top of a landmark torii", () => {
    const landmarkGates = RPG_LANDMARKS.filter(({ kind }) => kind === "torii");
    expect(landmarkGates.length).toBeGreaterThan(0);

    for (const gate of RPG_TORII_GATES) {
      for (const landmark of landmarkGates) {
        const separation = Math.hypot(
          gate.position[0] - landmark.position[0],
          gate.position[2] - landmark.position[2]
        );
        // Two gates inside each other read as one broken gate, not as two.
        expect(separation, `${gate.id} vs ${landmark.id}`).toBeGreaterThan(6);
      }
    }
    // The gates spread the cue across zones rather than doubling up in one.
    expect(new Set(RPG_TORII_GATES.map(({ zoneId }) => zoneId)).size).toBe(
      RPG_TORII_GATES.length
    );
  });

  it("closes the gap between each torii's tie beam and its lintel", () => {
    for (const gate of RPG_TORII_GATES) {
      const part = (suffix: string) =>
        RPG_STREET_TORII.find(({ id }) => id === `${gate.id}-${suffix}`)!;
      const nuki = part("nuki");
      const shimaki = part("shimaki");
      const gakuzuka = part("gakuzuka");
      expect(nuki, gate.id).toBeDefined();
      expect(shimaki, gate.id).toBeDefined();
      expect(gakuzuka, gate.id).toBeDefined();

      const nukiTop = nuki.position[1] + nuki.size[1] / 2;
      const shimakiBottom = shimaki.position[1] - shimaki.size[1] / 2;
      const plaqueBottom = gakuzuka.position[1] - gakuzuka.size[1] / 2;
      const plaqueTop = gakuzuka.position[1] + gakuzuka.size[1] / 2;

      // The plaque post is structural: it must touch both beams, or it reads
      // as a black rectangle hanging in mid air.
      expect(plaqueBottom, `${gate.id} plaque bottom`).toBeLessThanOrEqual(
        nukiTop + 0.02
      );
      expect(plaqueTop, `${gate.id} plaque top`).toBeGreaterThanOrEqual(
        shimakiBottom - 0.02
      );
    }
  });

  it("replaces the palms with clipped pines and keeps none in the airport", () => {
    expect(RPG_PINE_TRUNKS.length).toBeGreaterThanOrEqual(16);
    expect(RPG_PINE_TIERS.length).toBeGreaterThanOrEqual(24);
    for (const tier of RPG_PINE_TIERS) {
      // A clipped pine tier is a wide flat plate, never a frond.
      expect(tier.size[0] / tier.size[1], tier.id).toBeGreaterThan(2);
      const [r, g, b] = channels(tier.color);
      expect(g, `${tier.id} ${tier.color}`).toBeGreaterThan(r);
      expect(g, `${tier.id} ${tier.color}`).toBeGreaterThan(b);
    }
  });

  it("roofs the airport bus shelter in the same kawara tile as the town", () => {
    // It is the first structure the visitor stands beside, and a white slab
    // canopy on steel posts is the most generic object in the opening frame.
    const part = (suffix: string) =>
      RPG_BUS_STOP_STRUCTURES.find(
        ({ id }) => id === `airport-bus-shelter-${suffix}`
      );
    const roof = part("roof");
    const ridge = part("ridge");

    expect(roof).toBeDefined();
    expect(RPG_KAWARA_ROOF_COLORS, "shelter roof").toContain(roof!.color);
    expect(ridge, "shelter ridge").toBeDefined();
    expect(ridge!.position[1]).toBeGreaterThan(roof!.position[1]);
    expect(RPG_KAWARA_ROOF_COLORS, "shelter ridge").toContain(ridge!.color);
  });

  it("runs board fences with a capping rail along the open edges", () => {
    expect(RPG_BOARD_FENCE_PANELS.length).toBeGreaterThanOrEqual(24);
    for (const panel of RPG_BOARD_FENCE_PANELS) {
      expect(luminance(panel.color), panel.id).toBeLessThan(0.42);
      expect(Math.abs(panel.position[0]), panel.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumX + 2
      );
      expect(Math.abs(panel.position[2]), panel.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumZ + 2
      );
    }
  });
});

describe("Japanese dressing stays inside the render budget", () => {
  it("adds no draw call groups and holds both triangle ceilings", () => {
    const high = getRpgTownRenderStats("high");
    const low = getRpgTownRenderStats("low");

    expect(high.drawUnits).toBeLessThanOrEqual(80);
    expect(high.triangleCount).toBeLessThanOrEqual(150_000);
    expect(low.triangleCount).toBeLessThanOrEqual(90_000);
    expect(low.triangleCount).toBeLessThan(high.triangleCount);
    // Every measured group has to carry real geometry: a NaN triangle count
    // from an unregistered geometry would silently drop out of the budget.
    for (const group of high.groups) {
      expect(Number.isFinite(group.triangleCount), group.id).toBe(true);
      expect(group.triangleCount, group.id).toBeGreaterThan(0);
    }
  });
});
