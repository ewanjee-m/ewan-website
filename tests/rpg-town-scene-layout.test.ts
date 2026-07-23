import { describe, expect, it } from "vitest";
import { getDestinationPosition } from "../app/guide/WorldNavigation";
import {
  RPG_BRIDGE_ARCH_RISE,
  RPG_BRIDGE_CROSSING,
  RPG_LANDMARKS,
  RPG_MAIN_ROUTE,
  RPG_TOWN_BOUNDS,
  RPG_TOWN_SURFACES,
  RPG_TOWN_ZONES,
  getRpgWalkSurfaceHeight,
  isRpgWalkablePosition,
  rectanglesTouchOrOverlap
} from "../app/world/RpgTownSceneLayout";
import {
  RPG_WORLD_BOUNDS,
  RPG_WORLD_ROUTES,
  RPG_WORLD_SCENE_LANDMARKS,
  RPG_WORLD_SCENE_SURFACES,
  RPG_WORLD_ZONES
} from "../app/world/RpgWorldModel";
import {
  getNavigationRegionAt,
  getSurfaceHeight,
  isWalkable
} from "../app/world/RpgWorldGeometry";

describe("RPG town scene layout", () => {
  it("derives compatibility bounds and routes from the canonical model", () => {
    expect(RPG_TOWN_BOUNDS).toBe(RPG_WORLD_BOUNDS);
    expect(RPG_MAIN_ROUTE.map(({ id }) => id)).toEqual(
      RPG_WORLD_ROUTES.map(({ id }) => id)
    );
    expect(RPG_TOWN_SURFACES).toEqual(RPG_WORLD_SCENE_SURFACES);
    expect(RPG_LANDMARKS).toEqual(RPG_WORLD_SCENE_LANDMARKS);
    expect(RPG_TOWN_SURFACES).not.toBe(RPG_WORLD_SCENE_SURFACES);
    expect(RPG_LANDMARKS).not.toBe(RPG_WORLD_SCENE_LANDMARKS);
    for (const point of [[-30, 0], [16.6, 0], [16.6, -24], [-8, 14]] as const) {
      expect(isRpgWalkablePosition(point[0], point[1])).toBe(isWalkable(point));
      expect(getRpgWalkSurfaceHeight(point[0], point[1])).toBe(getSurfaceHeight(point));
    }
  });
  it("provides a broad explorable town instead of a narrow stage", () => {
    const townWidth =
      RPG_TOWN_BOUNDS.maximumX - RPG_TOWN_BOUNDS.minimumX;
    const townDepth =
      RPG_TOWN_BOUNDS.maximumZ - RPG_TOWN_BOUNDS.minimumZ;

    expect(townWidth).toBeGreaterThanOrEqual(72);
    expect(townDepth).toBeGreaterThanOrEqual(72);
    expect(Math.max(townWidth, townDepth) / Math.min(townWidth, townDepth)).toBeLessThanOrEqual(
      1.15
    );

    const bus = RPG_LANDMARKS.find(({ id }) => id === "airport-limousine-bus");
    const airportPlaza = RPG_TOWN_SURFACES.find(
      ({ id }) => id === "airport-bus-plaza"
    );
    const hanabiPlaza = RPG_TOWN_SURFACES.find(
      ({ id }) => id === "hanabi-festival-plaza"
    );

    expect(bus?.size[0]).toBeGreaterThanOrEqual(5.8);
    expect(airportPlaza?.size[0]).toBeGreaterThanOrEqual(12);
    expect(hanabiPlaza?.size[0]).toBeGreaterThanOrEqual(12);
  });
  it("lays the five districts and one connected route network across both axes", () => {
    expect(RPG_TOWN_ZONES.map(({ id }) => id)).toEqual([
      "airport",
      "tokyo",
      "gyukatsu",
      "sakura",
      "hanabi"
    ]);

    expect(new Set(RPG_TOWN_ZONES.map(({ centerX }) => centerX)).size).toBeGreaterThan(2);
    expect(new Set(RPG_TOWN_ZONES.map(({ centerZ }) => centerZ)).size).toBeGreaterThan(2);
    for (const zone of RPG_TOWN_ZONES) {
      const destination = getDestinationPosition(zone.id);
      expect(destination[0], zone.id).toBeGreaterThanOrEqual(zone.minimumX);
      expect(destination[0], zone.id).toBeLessThanOrEqual(zone.maximumX);
      expect(destination[2], zone.id).toBeGreaterThanOrEqual(zone.minimumZ);
      expect(destination[2], zone.id).toBeLessThanOrEqual(zone.maximumZ);
    }

    expect(
      RPG_MAIN_ROUTE.some(
        (route) =>
          route.maximumX - route.minimumX >
          route.maximumZ - route.minimumZ
      )
    ).toBe(true);
    expect(
      RPG_MAIN_ROUTE.some(
        (route) =>
          route.maximumZ - route.minimumZ >
          route.maximumX - route.minimumX
      )
    ).toBe(true);

    const connectedRouteIds = new Set([RPG_MAIN_ROUTE[0].id]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const route of RPG_MAIN_ROUTE) {
        if (connectedRouteIds.has(route.id)) {
          continue;
        }
        if (
          RPG_MAIN_ROUTE.some(
            (connected) =>
              connectedRouteIds.has(connected.id) &&
              rectanglesTouchOrOverlap(connected, route)
          )
        ) {
          connectedRouteIds.add(route.id);
          expanded = true;
        }
      }
    }
    expect(connectedRouteIds.size).toBe(RPG_MAIN_ROUTE.length);
  });

  it("lets the visitor reach every district destination and its signature landmark", () => {
    const key = (x: number, z: number) => `${x},${z}`;
    const visited = new Set<string>();
    const queue: Array<readonly [number, number]> = [[-30, 0]];
    let queueIndex = 0;

    while (queueIndex < queue.length) {
      const [x, z] = queue[queueIndex];
      queueIndex += 1;
      const pointKey = key(x, z);
      if (visited.has(pointKey) || !isRpgWalkablePosition(x, z)) {
        continue;
      }
      visited.add(pointKey);
      for (const [offsetX, offsetZ] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const) {
        queue.push([x + offsetX, z + offsetZ]);
      }
    }

    for (const zone of RPG_TOWN_ZONES) {
      const [destinationX, , destinationZ] = getDestinationPosition(zone.id);
      expect(visited.has(key(destinationX, destinationZ)), zone.id).toBe(true);
    }

    const signatureLandmarkIds = [
      "airport-limousine-bus",
      "tokyo-blue-tower",
      "gyukatsu-main-machiya",
      "sakura-tree-01",
      "hanabi-apple-stall"
    ] as const;
    for (const landmarkId of signatureLandmarkIds) {
      const landmark = RPG_LANDMARKS.find(({ id }) => id === landmarkId)!;
      const zone = RPG_TOWN_ZONES.find(({ id }) => id === landmark.zoneId)!;
      expect(landmark.position[0], landmark.id).toBeGreaterThanOrEqual(
        zone.minimumX
      );
      expect(landmark.position[0], landmark.id).toBeLessThanOrEqual(
        zone.maximumX
      );
      expect(landmark.position[2], landmark.id).toBeGreaterThanOrEqual(
        zone.minimumZ
      );
      expect(landmark.position[2], landmark.id).toBeLessThanOrEqual(
        zone.maximumZ
      );

      const minimumX = landmark.position[0] - landmark.size[0] / 2;
      const maximumX = landmark.position[0] + landmark.size[0] / 2;
      const minimumZ = landmark.position[2] - landmark.size[2] / 2;
      const maximumZ = landmark.position[2] + landmark.size[2] / 2;
      const hasReachableApproach = [...visited].some((pointKey) => {
        const [x, z] = pointKey.split(",").map(Number);
        const distanceX = Math.max(minimumX - x, 0, x - maximumX);
        const distanceZ = Math.max(minimumZ - z, 0, z - maximumZ);
        return Math.hypot(distanceX, distanceZ) <= 3;
      });
      expect(hasReachableApproach, landmark.id).toBe(true);
    }
  });

  it("keeps blocking scenery outside the playable main route", () => {
    for (const landmark of RPG_LANDMARKS.filter(
      ({ blocksMovement }) => blocksMovement
    )) {
      const footprint = {
        minimumX: landmark.position[0] - landmark.size[0] / 2,
        maximumX: landmark.position[0] + landmark.size[0] / 2,
        minimumZ: landmark.position[2] - landmark.size[2] / 2,
        maximumZ: landmark.position[2] + landmark.size[2] / 2
      };

      expect(
        RPG_MAIN_ROUTE.some((route) =>
          rectanglesTouchOrOverlap(footprint, route, -0.05)
        ),
        landmark.id
      ).toBe(false);
    }
  });

  it("uses a real bridge to connect the road across the canal", () => {
    const canal = RPG_LANDMARKS.find(
      ({ id }) => id === RPG_BRIDGE_CROSSING.canalId
    );
    const bridge = RPG_LANDMARKS.find(
      ({ id }) => id === RPG_BRIDGE_CROSSING.bridgeId
    );
    const bridgeRoute = RPG_MAIN_ROUTE.find(
      ({ id }) => id === RPG_BRIDGE_CROSSING.routeId
    );

    expect(canal?.kind).toBe("canal");
    expect(bridge?.kind).toBe("bridge");
    expect(bridgeRoute?.surface).toBe("bridge");
    expect(bridge?.position[0]).toBe(canal?.position[0]);
    expect((bridge?.size[0] ?? 0) > (canal?.size[0] ?? Infinity)).toBe(true);
    expect(bridgeRoute?.minimumX).toBe(
      (bridge?.position[0] ?? 0) - (bridge?.size[0] ?? 0) / 2
    );
    expect(bridgeRoute?.maximumX).toBe(
      (bridge?.position[0] ?? 0) + (bridge?.size[0] ?? 0) / 2
    );

    const bridgeDeckTop =
      (bridge?.position[1] ?? 0) + (bridge?.size[1] ?? 0) / 2;
    const bridgeCenterZ = bridge?.position[2] ?? 0;
    const bridgeCenterHeight = getRpgWalkSurfaceHeight(
      bridge?.position[0] ?? 0,
      bridgeCenterZ
    );
    expect(bridgeCenterHeight).toBeCloseTo(
      bridgeDeckTop + RPG_BRIDGE_ARCH_RISE,
      5
    );
    expect(
      getRpgWalkSurfaceHeight(bridgeRoute?.minimumX ?? 0, bridgeCenterZ)
    ).toBeCloseTo(bridgeDeckTop, 5);
    expect(bridgeCenterHeight - bridgeDeckTop).toBeGreaterThanOrEqual(0.35);
    expect(
      getRpgWalkSurfaceHeight(
        (bridgeRoute?.minimumX ?? 0) - 0.01,
        bridgeCenterZ
      )
    ).toBe(0);
    expect(
      getRpgWalkSurfaceHeight(
        bridge?.position[0] ?? 0,
        (bridgeRoute?.maximumZ ?? 0) + 0.01
      )
    ).toBe(0);
  });

  it("derives collision-safe walkability from roads, plazas, and landmark footprints", () => {
    const airportPlaza = RPG_TOWN_SURFACES.find(
      ({ id }) => id === "airport-bus-plaza"
    )!;
    const bus = RPG_LANDMARKS.find(
      ({ id }) => id === "airport-limousine-bus"
    )!;
    const terminal = RPG_LANDMARKS.find(
      ({ id }) => id === "airport-terminal"
    )!;
    const stall = RPG_LANDMARKS.find(
      ({ id }) => id === "hanabi-apple-stall"
    )!;
    const bridge = RPG_LANDMARKS.find(
      ({ id }) => id === RPG_BRIDGE_CROSSING.bridgeId
    )!;

    for (const zone of RPG_TOWN_ZONES) {
      const [destinationX, , destinationZ] = getDestinationPosition(zone.id);
      expect(isRpgWalkablePosition(destinationX, destinationZ), zone.id).toBe(
        true
      );
    }
    expect(
      isRpgWalkablePosition(bridge.position[0], bridge.position[2])
    ).toBe(true);
    expect(
      isRpgWalkablePosition(
        airportPlaza.position[0] - airportPlaza.size[0] / 2 + 0.4,
        airportPlaza.position[2]
      )
    ).toBe(true);
    expect(isRpgWalkablePosition(8, -10)).toBe(true);

    expect(bus.blocksMovement).toBe(false);
    expect(isRpgWalkablePosition(bus.position[0], bus.position[2])).toBe(true);
    expect(
      isRpgWalkablePosition(terminal.position[0], terminal.position[2])
    ).toBe(false);
    expect(isRpgWalkablePosition(stall.position[0], stall.position[2])).toBe(
      false
    );
    expect(
      isRpgWalkablePosition(
        bridge.position[0],
        bridge.position[2] + bridge.size[2] / 2 - 0.1
      )
    ).toBe(true);
    expect(isRpgWalkablePosition(bridge.position[0], 0)).toBe(false);
    expect(isRpgWalkablePosition(RPG_TOWN_BOUNDS.maximumX + 0.1, 0)).toBe(
      false
    );
  });

  it("opens the full square town floor while preserving real obstacles and water", () => {
    for (const [zone, x, z] of [
      ["airport", -35, 30],
      ["tokyo", 0, 35],
      ["gyukatsu", 19, 9],
      ["sakura", -19, -35],
      ["hanabi", 35, -35]
    ] as const) {
      expect(isRpgWalkablePosition(x, z), zone).toBe(true);
    }

    const bridge = RPG_LANDMARKS.find(
      ({ id }) => id === RPG_BRIDGE_CROSSING.bridgeId
    )!;
    expect(isRpgWalkablePosition(bridge.position[0], -24)).toBe(true);
    expect(isRpgWalkablePosition(bridge.position[0], 0)).toBe(false);
  });

  it("makes at least 85 percent of the square a single reachable floor component", () => {
    const gridScale = 2;
    const minimumX = RPG_TOWN_BOUNDS.minimumX * gridScale;
    const maximumX = RPG_TOWN_BOUNDS.maximumX * gridScale;
    const minimumZ = RPG_TOWN_BOUNDS.minimumZ * gridScale;
    const maximumZ = RPG_TOWN_BOUNDS.maximumZ * gridScale;
    const key = (x: number, z: number) => `${x},${z}`;
    const walkable = new Set<string>();

    for (let x = minimumX; x <= maximumX; x += 1) {
      for (let z = minimumZ; z <= maximumZ; z += 1) {
        if (isRpgWalkablePosition(x / gridScale, z / gridScale)) {
          walkable.add(key(x, z));
        }
      }
    }

    const visited = new Set<string>();
    const queue: Array<readonly [number, number]> = [[-30 * gridScale, 1.5 * gridScale]];
    for (let index = 0; index < queue.length; index += 1) {
      const [x, z] = queue[index];
      const pointKey = key(x, z);
      if (!walkable.has(pointKey) || visited.has(pointKey)) continue;
      visited.add(pointKey);
      for (const [offsetX, offsetZ] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1]
      ] as const) {
        queue.push([x + offsetX, z + offsetZ]);
      }
    }

    const totalGridPoints =
      (maximumX - minimumX + 1) * (maximumZ - minimumZ + 1);
    expect(walkable.size / totalGridPoints).toBeGreaterThanOrEqual(0.85);
    expect(visited.size).toBe(walkable.size);
  });

  it("contains recognizable volumetric landmarks and small scene actors", () => {
    expect(
      RPG_LANDMARKS.map(({ zoneId, kind }) => `${zoneId}:${kind}`)
    ).toEqual(
      expect.arrayContaining([
        "airport:terminal",
        "airport:bus",
        "tokyo:tower",
        "gyukatsu:machiya",
        "sakura:sakuraTree",
        "sakura:canal",
        "sakura:bridge",
        "hanabi:stall",
        "hanabi:lantern",
        "hanabi:torii",
        "hanabi:hanabi",
        "hanabi:npc"
      ])
    );
    expect(
      RPG_LANDMARKS.filter(({ kind }) => kind === "npc").length
    ).toBeGreaterThanOrEqual(5);
    expect(
      RPG_LANDMARKS.filter(({ kind }) => kind === "sakuraTree").length
    ).toBeGreaterThanOrEqual(6);
    expect(
      RPG_LANDMARKS.filter(({ kind }) => kind === "lantern").length
    ).toBeGreaterThanOrEqual(8);
  });

  it("builds every district motif as a dense cluster of real 3D landmarks", () => {
    const districtMotifs = [
      {
        zoneId: "airport",
        kinds: ["terminal", "tower"],
        minimumCount: 3
      },
      { zoneId: "tokyo", kinds: ["tower"], minimumCount: 9 },
      { zoneId: "gyukatsu", kinds: ["machiya"], minimumCount: 6 },
      { zoneId: "sakura", kinds: ["sakuraTree"], minimumCount: 11 },
      { zoneId: "hanabi", kinds: ["stall"], minimumCount: 6 }
    ] as const;

    for (const motif of districtMotifs) {
      const landmarks = RPG_LANDMARKS.filter(
        ({ kind, zoneId }) =>
          zoneId === motif.zoneId &&
          motif.kinds.some((candidate) => candidate === kind)
      );

      expect(landmarks.length, motif.zoneId).toBeGreaterThanOrEqual(
        motif.minimumCount
      );
      for (const landmark of landmarks) {
        expect(landmark.blocksMovement, landmark.id).toBe(true);
        expect(landmark.size.every((value) => value > 0), landmark.id).toBe(
          true
        );
      }
    }
  });

  it("places added district volumes beside roads and pedestrian plazas", () => {
    const addedDistrictVolumes = RPG_LANDMARKS.filter(({ id }) =>
      id.startsWith("district-volume-")
    );
    const broadDistrictGroundIds = new Set([
      "airport-coastal-apron",
      "tokyo-neighborhood-paving",
      "gyukatsu-stone-plaza",
      "sakura-riverside-garden",
      "hanabi-riverside-paving"
    ]);
    const pedestrianSurfaces = RPG_TOWN_SURFACES.filter(
      ({ id, kind }) =>
        !broadDistrictGroundIds.has(id) &&
        (kind === "sidewalk" || kind === "plaza")
    );

    expect(addedDistrictVolumes.length).toBeGreaterThanOrEqual(17);
    for (const landmark of addedDistrictVolumes) {
      const zone = RPG_TOWN_ZONES.find(({ id }) => id === landmark.zoneId)!;
      const footprint = {
        minimumX: landmark.position[0] - landmark.size[0] / 2,
        maximumX: landmark.position[0] + landmark.size[0] / 2,
        minimumZ: landmark.position[2] - landmark.size[2] / 2,
        maximumZ: landmark.position[2] + landmark.size[2] / 2
      };

      const canonicalZone = RPG_WORLD_ZONES.find(({ id }) => id === zone.id)!;
      const navigationRegion = getNavigationRegionAt([
        landmark.position[0],
        landmark.position[2]
      ]);
      expect(navigationRegion?.regionId, landmark.id).toBe(
        landmark.navigationRegionId ?? canonicalZone.id
      );

      expect(
        RPG_MAIN_ROUTE.some((route) =>
          rectanglesTouchOrOverlap(footprint, route, -0.05)
        ),
        landmark.id
      ).toBe(false);
      expect(
        pedestrianSurfaces.some((surface) =>
          rectanglesTouchOrOverlap(
            footprint,
            {
              minimumX: surface.position[0] - surface.size[0] / 2,
              maximumX: surface.position[0] + surface.size[0] / 2,
              minimumZ: surface.position[2] - surface.size[2] / 2,
              maximumZ: surface.position[2] + surface.size[2] / 2
            },
            -0.05
          )
        ),
        landmark.id
      ).toBe(false);
    }
  });

  it("keeps the playable town independent from image backdrops", () => {
    expect(JSON.stringify({ RPG_TOWN_SURFACES, RPG_LANDMARKS })).not.toMatch(
      /(?:backdrop|panorama|\.png|\.jpe?g|\.webp)/i
    );
    expect(RPG_TOWN_SURFACES.map(({ kind }) => ({ kind }))).toEqual(
      expect.arrayContaining([
        { kind: "ground" },
        { kind: "road" },
        { kind: "sidewalk" },
        { kind: "plaza" }
      ])
    );
    for (const surface of RPG_TOWN_SURFACES) {
      expect(surface.size.every((value) => value > 0), surface.id).toBe(true);
    }
  });

  it("fails closed for non-finite compatibility walkability inputs", () => {
    expect(isRpgWalkablePosition(Number.NaN, 0)).toBe(false);
    expect(isRpgWalkablePosition(Number.POSITIVE_INFINITY, 0)).toBe(false);
    expect(isRpgWalkablePosition(0, Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("rebuilds the approved concept's broad district surfaces as walkable 3D ground", () => {
    const expectedDistrictSurfaces = [
      ["airport-coastal-apron", 14, 40, "rectangle"],
      ["tokyo-neighborhood-paving", 22, 22, "rectangle"],
      ["gyukatsu-stone-plaza", 17, 17, "circle"],
      ["sakura-riverside-garden", 22, 22, "rectangle"],
      ["hanabi-riverside-paving", 18, 22, "rectangle"]
    ] as const;

    for (const [id, minimumWidth, minimumDepth, shape] of expectedDistrictSurfaces) {
      const surface = RPG_TOWN_SURFACES.find((candidate) => candidate.id === id);
      expect(surface, id).toBeDefined();
      expect(surface?.size[0], id).toBeGreaterThanOrEqual(minimumWidth);
      expect(surface?.size[2], id).toBeGreaterThanOrEqual(minimumDepth);
      expect(surface?.shape ?? "rectangle", id).toBe(shape);
      expect(
        isRpgWalkablePosition(surface?.position[0] ?? Infinity, surface?.position[2] ?? Infinity),
        id
      ).toBe(true);
    }

    const ocean = RPG_TOWN_SURFACES.find(({ id }) => id === "town-ocean");
    expect(ocean?.kind).toBe("water");
    expect(ocean?.size[0]).toBeGreaterThan(RPG_TOWN_BOUNDS.maximumX * 2);
    expect(ocean?.size[2]).toBeGreaterThan(RPG_TOWN_BOUNDS.maximumZ * 2);
  });

  it("uses one large signature sakura canopy like the approved concept", () => {
    const signatureTree = RPG_LANDMARKS.find(({ id }) => id === "sakura-tree-01");

    expect(signatureTree?.size[0]).toBeGreaterThanOrEqual(4.6);
    expect(signatureTree?.size[1]).toBeGreaterThanOrEqual(6.4);
    expect(signatureTree?.size[2]).toBeGreaterThanOrEqual(4.6);
  });

  it("keeps every grounded landmark inside the town bounds", () => {
    for (const landmark of RPG_LANDMARKS.filter(
      ({ kind }) => kind !== "hanabi"
    )) {
      expect(
        landmark.position[0] - landmark.size[0] / 2,
        landmark.id
      ).toBeGreaterThanOrEqual(RPG_TOWN_BOUNDS.minimumX);
      expect(
        landmark.position[0] + landmark.size[0] / 2,
        landmark.id
      ).toBeLessThanOrEqual(RPG_TOWN_BOUNDS.maximumX);
      expect(
        landmark.position[2] - landmark.size[2] / 2,
        landmark.id
      ).toBeGreaterThanOrEqual(RPG_TOWN_BOUNDS.minimumZ);
      expect(
        landmark.position[2] + landmark.size[2] / 2,
        landmark.id
      ).toBeLessThanOrEqual(RPG_TOWN_BOUNDS.maximumZ);
    }
  });
});
