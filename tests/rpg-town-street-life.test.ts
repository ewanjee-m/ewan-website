import { describe, expect, it } from "vitest";
import {
  FLAT_WORLD_HALF_WIDTH,
  getDestinationPosition
} from "../app/guide/WorldNavigation";
import { RPG_BUS_ROUTE_BOUNDS } from "../app/world/RpgBusMotion";
import { RPG_DISTRICT_ARCHITECTURE } from "../app/world/RpgTownArchitectureLayout";
import {
  RPG_BUS_STOP_SIGNS,
  RPG_BUS_STOP_STRUCTURES,
  RPG_COASTLINE_RING_ROCKS,
  RPG_CROSSWALK_PADS,
  RPG_EXTRA_CROSSWALK_STRIPES,
  RPG_HANGING_LANTERNS,
  RPG_HEDGE_BLOCKS,
  RPG_TOWN_COLUMN_PROPS,
  RPG_TOWN_SPAWN_CLEARANCE_RADIUS,
  RPG_TOWN_SPAWN_POINT,
  isOutsideRpgSpawnClearance,
  RPG_LANTERN_STRING_WIRES,
  RPG_PALM_FRONDS,
  RPG_PALM_TRUNKS,
  RPG_PLANTER_FOLIAGE,
  RPG_PLANTER_WALLS,
  RPG_PLAZA_PAVING,
  RPG_ROOFTOP_CLUTTER,
  RPG_SHOPFRONT_SHADES,
  RPG_SHOPFRONT_SIGNS,
  RPG_STALL_GRILL_BODIES,
  RPG_STALL_GRILL_EMBERS,
  RPG_UTILITY_CROSSARMS,
  RPG_UTILITY_POLES,
  RPG_UTILITY_WIRES,
  type RpgStreetLifeInstance
} from "../app/world/RpgTownStreetLifeLayout";
import {
  CANAL_EAST_BANK_X,
  CANAL_WEST_BANK_X,
  RPG_LANDMARKS,
  RPG_MAIN_ROUTE,
  RPG_TOWN_BOUNDS,
  RPG_TOWN_SURFACES,
  isRpgWalkablePosition
} from "../app/world/RpgTownSceneLayout";

const SHOPFRONT_BUILDINGS = RPG_DISTRICT_ARCHITECTURE.filter(
  ({ kind }) => kind === "tower" || kind === "machiya" || kind === "terminal"
);

function isInsideBusRoute(x: number, z: number): boolean {
  return (
    x >= RPG_BUS_ROUTE_BOUNDS.minimumX - 1.6 &&
    x <= RPG_BUS_ROUTE_BOUNDS.maximumX + 1.6 &&
    z >= RPG_BUS_ROUTE_BOUNDS.minimumZ - 1.6 &&
    z <= RPG_BUS_ROUTE_BOUNDS.maximumZ + 1.6
  );
}

const GROUND_LEVEL_DECOR: readonly (readonly [
  string,
  readonly RpgStreetLifeInstance[]
])[] = [
  ["planter-walls", RPG_PLANTER_WALLS],
  ["hedges", RPG_HEDGE_BLOCKS],
  ["palm-trunks", RPG_PALM_TRUNKS],
  ["grills", RPG_STALL_GRILL_BODIES],
  ["bus-stop", RPG_BUS_STOP_STRUCTURES],
  ["utility-poles", RPG_UTILITY_POLES]
];

describe("RPG town street life", () => {
  it("gives every district shop a projecting awning, a lit sign band, and glazing", () => {
    expect(SHOPFRONT_BUILDINGS.length).toBeGreaterThanOrEqual(12);

    for (const building of SHOPFRONT_BUILDINGS) {
      expect(
        RPG_SHOPFRONT_SHADES.some(({ id }) => id === `${building.id}-awning`),
        building.id
      ).toBe(true);
      expect(
        RPG_SHOPFRONT_SIGNS.some(({ id }) => id === `${building.id}-sign-band`),
        building.id
      ).toBe(true);
      expect(
        RPG_SHOPFRONT_SIGNS.some(
          ({ id }) => id === `${building.id}-shopfront-glazing`
        ),
        building.id
      ).toBe(true);
    }
  });

  it("hangs awnings and sign bands above head height and in front of their building", () => {
    for (const building of SHOPFRONT_BUILDINGS) {
      const awning = RPG_SHOPFRONT_SHADES.find(
        ({ id }) => id === `${building.id}-awning`
      );
      const signBand = RPG_SHOPFRONT_SIGNS.find(
        ({ id }) => id === `${building.id}-sign-band`
      );
      if (!awning || !signBand) {
        throw new Error(`Missing shopfront parts for ${building.id}`);
      }

      const groundY = building.position[1] - building.size[1] / 2;
      expect(awning.position[1] - groundY, building.id).toBeGreaterThanOrEqual(
        1.5
      );
      expect(signBand.position[1], building.id).toBeGreaterThan(
        awning.position[1]
      );

      const forwardDistance = Math.hypot(
        awning.position[0] - building.position[0],
        awning.position[2] - building.position[2]
      );
      expect(forwardDistance, building.id).toBeGreaterThan(
        building.size[2] / 2
      );
      expect(forwardDistance, building.id).toBeLessThan(
        building.size[2] / 2 + 1.4
      );
      const facesTownCentre =
        Math.sign(awning.position[2] - building.position[2]) ===
        (building.position[2] < 0 ? 1 : -1);
      expect(facesTownCentre, building.id).toBe(true);
    }
  });

  it("strings paper lanterns high enough to walk under and never as blockers", () => {
    expect(RPG_HANGING_LANTERNS.length).toBeGreaterThanOrEqual(40);
    expect(RPG_LANTERN_STRING_WIRES.length).toBeGreaterThanOrEqual(24);

    for (const lantern of RPG_HANGING_LANTERNS) {
      expect(lantern.blocksMovement, lantern.id).toBe(false);
      expect(lantern.position[1], lantern.id).toBeGreaterThan(2.2);
      expect(Math.abs(lantern.position[0]), lantern.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumX
      );
      expect(Math.abs(lantern.position[2]), lantern.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumZ
      );
    }

    for (const wire of RPG_LANTERN_STRING_WIRES) {
      expect(wire.position[1], wire.id).toBeGreaterThan(2.6);
      expect(Math.max(wire.size[0], wire.size[2]), wire.id).toBeLessThan(0.06);
    }
  });

  it("raises utility poles with sagging overhead wires clear of the street", () => {
    expect(RPG_UTILITY_POLES.length).toBeGreaterThanOrEqual(6);
    expect(RPG_UTILITY_CROSSARMS.length).toBeGreaterThanOrEqual(
      RPG_UTILITY_POLES.length
    );
    expect(RPG_UTILITY_WIRES.length).toBeGreaterThanOrEqual(
      (RPG_UTILITY_POLES.length - 2) * 2
    );

    for (const pole of RPG_UTILITY_POLES) {
      expect(pole.size[1], pole.id).toBeGreaterThan(4.5);
      expect(Math.abs(pole.position[0]), pole.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumX
      );
      expect(Math.abs(pole.position[2]), pole.id).toBeLessThanOrEqual(
        RPG_TOWN_BOUNDS.maximumZ
      );
    }
    for (const wire of RPG_UTILITY_WIRES) {
      expect(wire.position[1], wire.id).toBeGreaterThan(4);
    }
  });

  it("keeps ground-level decoration off building footprints and out of the coach lane", () => {
    for (const [group, instances] of GROUND_LEVEL_DECOR) {
      expect(instances.length, group).toBeGreaterThan(0);
      for (const instance of instances) {
        expect(instance.position.every(Number.isFinite), `${group}:${instance.id}`)
          .toBe(true);
        expect(
          isInsideBusRoute(instance.position[0], instance.position[2]),
          `${group}:${instance.id}`
        ).toBe(false);
      }
    }
  });

  it("dresses plazas and crossings with flush, fully traversable paving", () => {
    expect(RPG_PLAZA_PAVING.length).toBeGreaterThanOrEqual(40);
    expect(RPG_EXTRA_CROSSWALK_STRIPES.length).toBeGreaterThanOrEqual(12);

    for (const slab of [...RPG_PLAZA_PAVING, ...RPG_EXTRA_CROSSWALK_STRIPES]) {
      expect(slab.size[1], slab.id).toBeLessThanOrEqual(0.03);
      expect(slab.position[1], slab.id).toBeLessThanOrEqual(0.14);
      expect(
        isRpgWalkablePosition(slab.position[0], slab.position[2]),
        slab.id
      ).toBe(true);
    }

    for (const stripe of RPG_EXTRA_CROSSWALK_STRIPES) {
      expect(
        RPG_MAIN_ROUTE.some(
          (route) =>
            stripe.position[0] >= route.minimumX &&
            stripe.position[0] <= route.maximumX &&
            stripe.position[2] >= route.minimumZ &&
            stripe.position[2] <= route.maximumZ
        ),
        stripe.id
      ).toBe(true);
    }
  });

  it("stacks rooftop plant above each tower roof line", () => {
    const rooftopStructures = RPG_DISTRICT_ARCHITECTURE.filter(
      ({ kind }) => kind === "tower" || kind === "terminal"
    );
    expect(RPG_ROOFTOP_CLUTTER.length).toBeGreaterThanOrEqual(
      rooftopStructures.length * 4
    );

    for (const structure of rooftopStructures) {
      const roofY = structure.position[1] + structure.size[1] / 2;
      const parts = RPG_ROOFTOP_CLUTTER.filter(({ id }) =>
        id.startsWith(`${structure.id}-roof-`)
      );
      expect(parts.length, structure.id).toBeGreaterThanOrEqual(4);
      for (const part of parts) {
        expect(part.position[1], part.id).toBeGreaterThan(roofY);
        expect(
          Math.abs(part.position[0] - structure.position[0]),
          part.id
        ).toBeLessThanOrEqual(structure.size[0] / 2 + 0.1);
      }
    }
  });

  it("rings the island with non-blocking rock shoreline outside the walkable bounds", () => {
    expect(RPG_COASTLINE_RING_ROCKS.length).toBeGreaterThanOrEqual(48);
    expect(
      new Set(
        RPG_COASTLINE_RING_ROCKS.map(({ scale }) => scale.join(","))
      ).size
    ).toBeGreaterThanOrEqual(40);

    for (const rock of RPG_COASTLINE_RING_ROCKS) {
      expect(rock.blocksMovement, rock.id).toBe(false);
      expect(
        Math.abs(rock.position[0]) > RPG_TOWN_BOUNDS.maximumX ||
          Math.abs(rock.position[2]) > RPG_TOWN_BOUNDS.maximumZ,
        rock.id
      ).toBe(true);
    }
  });

  it("lights food stalls and the bus stop with warm emissive detail", () => {
    expect(RPG_STALL_GRILL_EMBERS.length).toBeGreaterThanOrEqual(
      RPG_STALL_GRILL_BODIES.length / 3
    );
    expect(RPG_BUS_STOP_SIGNS.length).toBeGreaterThanOrEqual(2);
    expect(RPG_PLANTER_FOLIAGE.length).toBeGreaterThanOrEqual(
      RPG_PLANTER_WALLS.length
    );
    expect(RPG_PALM_FRONDS.length).toBeGreaterThan(RPG_PALM_TRUNKS.length);
  });

  it("keeps every tall prop out of the airport spawn clearance", () => {
    expect(RPG_TOWN_SPAWN_POINT[0]).toBe(
      getDestinationPosition("airport", FLAT_WORLD_HALF_WIDTH)[0]
    );
    expect(RPG_TOWN_SPAWN_CLEARANCE_RADIUS).toBeGreaterThanOrEqual(3);

    const tallProps = [
      ...RPG_TOWN_COLUMN_PROPS,
      ...RPG_SHOPFRONT_SHADES,
      ...RPG_SHOPFRONT_SIGNS,
      ...RPG_STALL_GRILL_BODIES,
      ...RPG_PLANTER_WALLS,
      ...RPG_HEDGE_BLOCKS,
      ...RPG_UTILITY_CROSSARMS
    ];

    for (const prop of tallProps) {
      const top = prop.position[1] + prop.size[1] / 2;
      if (top < 1.2) {
        continue;
      }
      expect(
        isOutsideRpgSpawnClearance(prop.position[0], prop.position[2]),
        `${prop.id} at ${Math.hypot(
          prop.position[0] - RPG_TOWN_SPAWN_POINT[0],
          prop.position[2] - RPG_TOWN_SPAWN_POINT[1]
        ).toFixed(2)} from spawn`
      ).toBe(true);
    }

    for (const lantern of RPG_HANGING_LANTERNS) {
      expect(
        isOutsideRpgSpawnClearance(lantern.position[0], lantern.position[2]) ||
          lantern.position[1] > 2.2,
        lantern.id
      ).toBe(true);
    }

    for (const landmark of RPG_LANDMARKS) {
      if (!landmark.blocksMovement) {
        continue;
      }
      expect(
        isOutsideRpgSpawnClearance(landmark.position[0], landmark.position[2]),
        landmark.id
      ).toBe(true);
    }
  });

  it("exposes every new column prop to the chase camera in one occluder source", () => {
    expect(RPG_TOWN_COLUMN_PROPS.length).toBeGreaterThanOrEqual(
      RPG_UTILITY_POLES.length +
        RPG_PALM_TRUNKS.length +
        RPG_BUS_STOP_STRUCTURES.length
    );

    for (const group of [
      RPG_UTILITY_POLES,
      RPG_PALM_TRUNKS,
      RPG_BUS_STOP_STRUCTURES
    ]) {
      for (const prop of group) {
        expect(
          RPG_TOWN_COLUMN_PROPS.some(({ id }) => id === prop.id),
          prop.id
        ).toBe(true);
      }
    }

    for (const prop of RPG_TOWN_COLUMN_PROPS) {
      expect(prop.position.every(Number.isFinite), prop.id).toBe(true);
      expect(prop.size.every(Number.isFinite), prop.id).toBe(true);
      expect(prop.rotation.every(Number.isFinite), prop.id).toBe(true);
    }
  });

  it("still walks from the spawn point to every district after moving props", () => {
    const visited = new Set<string>();
    const queue: Array<readonly [number, number]> = [
      [RPG_TOWN_SPAWN_POINT[0], RPG_TOWN_SPAWN_POINT[1]]
    ];
    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const [x, z] = queue[queueIndex];
      queueIndex += 1;
      const key = `${x},${z}`;
      if (visited.has(key) || !isRpgWalkablePosition(x, z)) {
        continue;
      }
      visited.add(key);
      for (const [stepX, stepZ] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const) {
        queue.push([x + stepX, z + stepZ]);
      }
    }

    expect(visited.size).toBeGreaterThan(800);
    for (const destinationId of [
      "airport",
      "tokyo",
      "gyukatsu",
      "sakura",
      "hanabi"
    ] as const) {
      const destination = getDestinationPosition(
        destinationId,
        FLAT_WORLD_HALF_WIDTH
      );
      expect(
        isRpgWalkablePosition(destination[0], destination[2]),
        destinationId
      ).toBe(true);
    }
  });

  it("cuts the canal into the island instead of painting a flat band", () => {
    const canal = RPG_LANDMARKS.find(({ id }) => id === "sakura-canal");
    const westBank = RPG_TOWN_SURFACES.find(({ id }) => id === "town-meadow");
    const eastBank = RPG_TOWN_SURFACES.find(
      ({ id }) => id === "town-meadow-east"
    );
    const ocean = RPG_TOWN_SURFACES.find(({ id }) => id === "town-ocean");

    expect(canal?.position[1] ?? 0).toBeLessThan(-0.2);
    expect(westBank).toBeDefined();
    expect(eastBank).toBeDefined();
    expect(
      (westBank?.position[0] ?? 0) + (westBank?.size[0] ?? 0) / 2
    ).toBeCloseTo(CANAL_WEST_BANK_X, 5);
    expect(
      (eastBank?.position[0] ?? 0) - (eastBank?.size[0] ?? 0) / 2
    ).toBeCloseTo(CANAL_EAST_BANK_X, 5);
    expect(
      (ocean?.position[1] ?? 0) + (ocean?.size[1] ?? 0) / 2
    ).toBeLessThan(canal?.position[1] ?? 0);

    for (const surface of RPG_TOWN_SURFACES) {
      if (surface.kind !== "plaza" && surface.kind !== "sidewalk") {
        continue;
      }
      const spansTrench =
        surface.position[0] - surface.size[0] / 2 < CANAL_EAST_BANK_X &&
        surface.position[0] + surface.size[0] / 2 > CANAL_WEST_BANK_X;
      expect(spansTrench, surface.id).toBe(false);
    }
  });

  it("paints crossings on a dark pad so the bars read against the road", () => {
    expect(RPG_CROSSWALK_PADS.length).toBeGreaterThanOrEqual(2);

    for (const pad of RPG_CROSSWALK_PADS) {
      expect(pad.size[1], pad.id).toBeLessThanOrEqual(0.03);
      expect(pad.position[1], pad.id).toBeLessThan(0.122);
      expect(
        isRpgWalkablePosition(pad.position[0], pad.position[2]),
        pad.id
      ).toBe(true);
    }

    for (const stripe of RPG_EXTRA_CROSSWALK_STRIPES) {
      expect(stripe.position[1], stripe.id).toBeGreaterThan(0.11);
      expect(stripe.color.toLowerCase(), stripe.id).toMatch(/^#f/);
    }
  });

  it("adds walk-under torii gates that never seal a road", () => {
    const torii = RPG_LANDMARKS.filter(({ kind }) => kind === "torii");
    expect(torii.length).toBeGreaterThanOrEqual(3);

    for (const gate of torii) {
      expect(gate.blocksMovement, gate.id).toBe(true);
      const footprint = {
        minimumX: gate.position[0] - gate.size[0] / 2 - 0.6,
        maximumX: gate.position[0] + gate.size[0] / 2 + 0.6,
        minimumZ: gate.position[2] - gate.size[2] / 2 - 0.6,
        maximumZ: gate.position[2] + gate.size[2] / 2 + 0.6
      };
      for (const route of RPG_MAIN_ROUTE) {
        const overlaps =
          footprint.maximumX > route.minimumX &&
          footprint.minimumX < route.maximumX &&
          footprint.maximumZ > route.minimumZ &&
          footprint.minimumZ < route.maximumZ;
        expect(overlaps, `${gate.id} vs ${route.id}`).toBe(false);
      }
    }
  });
});
