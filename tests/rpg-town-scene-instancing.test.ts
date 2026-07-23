import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sceneSource = readFileSync(
  resolve(process.cwd(), "app/world/RpgTownScene.tsx"),
  "utf8"
);
const flatWorldSource = readFileSync(
  resolve(process.cwd(), "app/world/FlatWorldCanvas.tsx"),
  "utf8"
);
const architectureSource = readFileSync(
  resolve(process.cwd(), "app/world/RpgTownArchitecture.tsx"),
  "utf8"
);

describe("RPG district volume rendering", () => {
  it("routes repeated landmarks to the direct-rendered architecture instead of duplicate rich components", () => {
    expect(sceneSource).toContain("function isDistrictVolumeLandmark");
    expect(sceneSource).toContain("<RpgTownArchitecture");
    expect(sceneSource).toContain("!isDistrictVolumeLandmark(layout)");
    expect(sceneSource).not.toContain("DistrictVolumeClusters");
  });

  it("shares direct 3D batches across shells, four-sided facades, roofs, trees, props, and the outer town", () => {
    expect(architectureSource).toContain("shellInstances");
    expect(architectureSource).toContain("facadeWindowInstances");
    expect(architectureSource).toContain("districtSlopedRoofs");
    expect(architectureSource).toContain("treeCrownInstances");
    expect(architectureSource).toContain("propPostInstances");
    expect(architectureSource).toContain("perimeterShellInstances");
    expect(architectureSource.match(/<InstanceBatch\b/g)?.length ?? 0).toBeGreaterThanOrEqual(10);
    expect(architectureSource).not.toContain("TextureLoader");
    expect(architectureSource).not.toContain("<planeGeometry");
  });

  it("keeps every animated hanabi bloom in two shared ray and spark batches", () => {
    const hanabiStart = sceneSource.indexOf("function HanabiBurst");
    const hanabiEnd = sceneSource.indexOf(
      "function Landmark",
      hanabiStart
    );
    const hanabiSource = sceneSource.slice(hanabiStart, hanabiEnd);

    expect(hanabiStart).toBeGreaterThanOrEqual(0);
    expect(hanabiEnd).toBeGreaterThan(hanabiStart);
    expect(hanabiSource.match(/<Instances\b/g)).toHaveLength(2);
    expect(hanabiSource).toContain("rayInstances");
    expect(hanabiSource).toContain("sparkInstances");
    expect(hanabiSource).not.toContain("<mesh position=");
  });

  it("renders the square town surfaces in four shared water, land, plaza, and ring batches", () => {
    const surfacesStart = sceneSource.indexOf("function TownSurfaces");
    const surfacesEnd = sceneSource.indexOf("function AirportPlane", surfacesStart);
    const surfacesSource = sceneSource.slice(surfacesStart, surfacesEnd);

    expect(surfacesStart).toBeGreaterThanOrEqual(0);
    expect(surfacesEnd).toBeGreaterThan(surfacesStart);
    expect(surfacesSource).toContain("rectangularWaterSurfaces");
    expect(surfacesSource).toContain("rectangularLandSurfaces");
    expect(surfacesSource).toContain("circularSurfaces");
    expect(surfacesSource).toContain("circleRingSurfaces");
    expect(surfacesSource).not.toContain("RPG_TOWN_SURFACES.map");
  });

  it("keeps the airport terminal glazing, mullions, canopy legs, and control tower in four shared batches", () => {
    const terminalStart = sceneSource.indexOf("function Terminal");
    const terminalEnd = sceneSource.indexOf("function AirportBus", terminalStart);
    const terminalSource = sceneSource.slice(terminalStart, terminalEnd);

    expect(terminalSource.match(/<Instances\b/g)).toHaveLength(4);
    expect(terminalSource).toContain("terminalWindowInstances");
    expect(terminalSource).toContain("terminalMullionInstances");
    expect(terminalSource).toContain("terminalCanopyLegInstances");
  });

  it("shares two batches across every torii gate instead of one group per gate", () => {
    const toriiStart = sceneSource.indexOf("function TownTorii");
    const toriiEnd = sceneSource.indexOf("function TownCrowd", toriiStart);
    const toriiSource = sceneSource.slice(toriiStart, toriiEnd);

    expect(toriiStart).toBeGreaterThanOrEqual(0);
    expect(toriiSource.match(/<Instances\b/g)).toHaveLength(2);
    expect(toriiSource).toContain("pillarInstances");
    expect(toriiSource).toContain("beamInstances");
    expect(toriiSource.match(/<mesh\b/g)).toBeNull();
    expect(sceneSource).toContain('layout.kind !== "torii"');
  });

  it("strings the paper lanterns through the animated festival lantern batch", () => {
    const lanternStart = sceneSource.indexOf("function FestivalLanterns");
    const lanternEnd = sceneSource.indexOf("function TownTorii", lanternStart);
    const lanternSource = sceneSource.slice(lanternStart, lanternEnd);

    expect(lanternSource).toContain("RPG_HANGING_LANTERNS");
    expect(lanternSource).toContain(
      "limit={layouts.length + RPG_HANGING_LANTERNS.length}"
    );
    expect(lanternSource.match(/<Instances\b/g)).toHaveLength(3);
  });

  it("batches street-life shopfronts, cables, foliage, and lit signs into the shared architecture groups", () => {
    expect(architectureSource).toContain("streetLevelBoxInstances");
    expect(architectureSource).toContain("groundDressingInstances");
    expect(architectureSource).toContain("litSignInstances");
    expect(architectureSource).toContain("overheadCableInstances");
    expect(architectureSource).toContain("visibleFoliage");
    expect(architectureSource).toContain("canopyInstances");
    expect(architectureSource).toContain("RPG_TOWN_ARCHITECTURE_BATCH_STATS");
    expect(architectureSource.match(/<InstanceBatch\b/g)?.length ?? 0).toBeLessThanOrEqual(26);
  });

  it("renders smiling volumetric NPCs on real patrol routes with varied gestures", () => {
    const crowdStart = sceneSource.indexOf("function TownCrowd");
    const crowdEnd = sceneSource.indexOf("function HanabiBurst", crowdStart);
    const crowdSource = sceneSource.slice(crowdStart, crowdEnd);

    expect(crowdStart).toBeGreaterThanOrEqual(0);
    expect(crowdEnd).toBeGreaterThan(crowdStart);
    expect(sceneSource).toContain("deriveNpcPatrolRoute");
    expect(crowdSource).toContain("evaluateNpcPatrolMotionInto");
    expect(crowdSource).toContain("pose.animationKind");
    expect(crowdSource).toContain("<RpgNpcCharacter3d");
    expect(crowdSource).toContain("character.applyPose(pose)");
    expect(crowdSource).toContain("group.position.set");
    expect(crowdSource).toContain("dataset.npcMovingCount");
    expect(crowdSource).toContain("dataset.npcAnimationKinds");
    expect(crowdSource).toContain('dataset.npcRenderer = "rigged-toon-glb"');
    expect(crowdSource).not.toContain("<sprite");
    expect(crowdSource).not.toContain("evaluateNpcMotionInto");
  });

  it("drives the airport bus around its route with rolling wheels and telemetry", () => {
    const busStart = sceneSource.indexOf("function AirportBus");
    const busEnd = sceneSource.indexOf("function CorridorFacade", busStart);
    const busSource = sceneSource.slice(busStart, busEnd);

    expect(busStart).toBeGreaterThanOrEqual(0);
    expect(busEnd).toBeGreaterThan(busStart);
    expect(sceneSource).toContain("createRpgBusRuntime");
    expect(busSource).toContain("activeBusRuntime.pose");
    expect(busSource).toContain("advanceRpgBusRuntime");
    expect(busSource).toContain("pose.wheelRotation");
    expect(busSource).toContain("activeBus.position.set");
    expect(busSource).toContain("dataset.busPosition");
    expect(busSource).toContain("dataset.busPhase");
  });

  it("keeps the moving bus windows, stripes, tires, hubs, and lamps in five shared batches", () => {
    const busStart = sceneSource.indexOf("function AirportBus");
    const busEnd = sceneSource.indexOf("function CorridorFacade", busStart);
    const busSource = sceneSource.slice(busStart, busEnd);

    expect(busSource.match(/<Instances\b/g)).toHaveLength(5);
    expect(busSource).toContain("busWindowInstances");
    expect(busSource).toContain("busStripeInstances");
    expect(busSource).toContain("wheelTireGroups");
    expect(busSource).toContain("wheelHubGroups");
    expect(busSource).toContain("headlightMaterial");
  });

  it("uses the same moving bus pose for the player's live collision footprint", () => {
    expect(flatWorldSource).toContain("createRpgBusRuntime");
    expect(flatWorldSource).toContain("advanceRpgBusRuntime");
    expect(flatWorldSource).toContain("isRpgPositionOutsideMovingBus");
    expect(flatWorldSource).toContain("busRuntime.pose");
    expect(flatWorldSource).toContain("busRuntime={busRuntime}");
    expect(flatWorldSource).toContain("canMoveTo:");
    expect(flatWorldSource).toContain("dynamicObstacles:");
  });
});
