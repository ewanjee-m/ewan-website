import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptFlatWorldNavigationSnapshot } from "../app/world/FlatWorldNavigationAdapter";
import { createFlatWorldSession } from "../app/world/FlatWorldSession";
import { RpgMiniMap } from "../app/world/RpgMiniMap";
import {
  RPG_CANONICAL_MAP_SOURCE_IDS,
  RPG_MAP_COLORS,
  RPG_MAP_LAND_SOURCE_ID,
  RPG_MAP_NODES,
  RPG_MAP_ROADS,
  RPG_MAP_VIEW_BOX,
  RPG_MAP_ZONE_COLORS,
  RPG_MINI_MAP_LABEL_CSS_PIXELS,
  getRpgMapNextZoneId,
  projectRpgMapWorldHeadingRotation,
  projectRpgMapWorldPoint
} from "../app/world/RpgMiniMapProjection";
import {
  RPG_WORLD_BRIDGE,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_CANAL,
  RPG_WORLD_SPAWN,
  RPG_WORLD_ZONES,
  RPG_WORLD_ZONE_IDS
} from "../app/world/RpgWorldModel";

const labels = {
  label: "World mini-map",
  expand: "Expand mini-map",
  collapse: "Collapse mini-map",
  currentPosition: "Current position",
  nextDestination: "Next destination",
  mainRoute: "Main route",
  north: "North",
  destinations: {
    airport: "Airport bus stop",
    tokyo: "Tokyo boulevard",
    gyukatsu: "Gyukatsu alley",
    sakura: "Sakura canal",
    hanabi: "Fireworks festival"
  }
};

function navigationAt(
  position: readonly [number, number, number] = RPG_WORLD_SPAWN,
  heading: readonly [number, number, number] = [1, 0, 0]
) {
  const session = createFlatWorldSession({
    bounds: RPG_WORLD_BOUNDS,
    start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
    moveSpeed: 4
  });
  if (
    position[0] !== RPG_WORLD_SPAWN[0] ||
    position[2] !== RPG_WORLD_SPAWN[2] ||
    heading[0] !== 1 ||
    heading[2] !== 0
  ) {
    expect(
      session.teleport(position[0], position[2], {
        x: heading[0],
        z: heading[2]
      })
    ).toBe(true);
  }
  return adaptFlatWorldNavigationSnapshot(session.getNavigationSnapshot());
}

function useMobileViewport(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: "(max-width: 640px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    } satisfies MediaQueryList)
  );
}

describe("RPG mini-map", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the town, five named destinations, the visitor, and the way on", () => {
    const { container } = render(
      <RpgMiniMap
        labels={labels}
        navigation={navigationAt()}
      />
    );

    expect(
      screen.getByRole("group", { name: "World mini-map" })
    ).toBeVisible();
    expect(screen.getByRole("img", { name: "Main route" })).toBeVisible();
    const nextZoneId = getRpgMapNextZoneId("airport")!;
    for (const [zoneId, destination] of Object.entries(labels.destinations)) {
      const name =
        zoneId === nextZoneId
          ? `Next destination: ${destination}`
          : destination;
      expect(screen.getByRole("img", { name })).toBeVisible();
    }
    expect(
      screen.getByRole("img", {
        name: "Current position: Airport bus stop"
      })
    ).toBeVisible();

    const canvas = container.querySelector(".rpg-mini-map-canvas");
    expect(canvas).toHaveAttribute(
      "viewBox",
      `0 0 ${RPG_MAP_VIEW_BOX.width} ${RPG_MAP_VIEW_BOX.height}`
    );
    expect(canvas).toHaveAttribute("data-next-zone", nextZoneId);
    expect(container.querySelector("image")).toBeNull();
    expect(
      container.querySelector('[data-map-layer="model-terrain"]')
    ).not.toBeNull();

    // Every drawn feature is a feature of the world model, at world scale.
    expect(container.querySelectorAll("[data-map-zone]")).toHaveLength(
      RPG_WORLD_ZONES.length
    );
    expect(container.querySelectorAll("[data-map-route]")).toHaveLength(
      RPG_MAP_ROADS.length
    );
    expect(
      container.querySelector(`[data-map-water="${RPG_WORLD_CANAL.id}"]`)
    ).not.toBeNull();
    expect(
      container.querySelector(`[data-map-bridge="${RPG_WORLD_BRIDGE.id}"]`)
    ).not.toBeNull();
    const land = container.querySelector(
      `[data-map-source-id="${RPG_MAP_LAND_SOURCE_ID}"]`
    );
    expect(land).toHaveAttribute("fill", RPG_MAP_COLORS.land);
    expect(land).toHaveAttribute("stroke", RPG_MAP_COLORS.landEdge);
    expect(land).toHaveAttribute("stroke-width", "3");
    for (const zone of container.querySelectorAll<SVGElement>(
      ".rpg-map-terrain-zone"
    )) {
      expect(zone).toHaveAttribute(
        "fill",
        RPG_MAP_ZONE_COLORS[
          zone.dataset.mapZone as keyof typeof RPG_MAP_ZONE_COLORS
        ]
      );
      // Fill only: a district outline changes with data-current, so the
      // stylesheet owns that half and there is no attribute here to assert.
      // The land, roads, canal and bridge below still carry theirs.
    }
    const water = container.querySelector(".rpg-map-terrain-water");
    expect(water).toHaveAttribute("fill", RPG_MAP_COLORS.canal);
    expect(water).toHaveAttribute("stroke", RPG_MAP_COLORS.canalEdge);
    expect(water).toHaveAttribute("stroke-width", "2");
    for (const route of container.querySelectorAll(
      ".rpg-map-terrain-route"
    )) {
      expect(route).toHaveAttribute("fill", RPG_MAP_COLORS.road);
      expect(route).toHaveAttribute("stroke", RPG_MAP_COLORS.roadEdge);
      expect(route).toHaveAttribute("stroke-width", "2");
    }
    const bridge = container.querySelector(".rpg-map-terrain-bridge");
    expect(bridge).toHaveAttribute("fill", RPG_MAP_COLORS.bridge);
    expect(bridge).toHaveAttribute("stroke", RPG_MAP_COLORS.bridgeEdge);
    expect(bridge).toHaveAttribute("stroke-width", "2");

    const sourceIds = [
      ...container.querySelectorAll<SVGElement>("[data-map-source-id]")
    ].map((element) => element.dataset.mapSourceId!);
    expect([...new Set(sourceIds)].sort()).toEqual(
      [...RPG_CANONICAL_MAP_SOURCE_IDS].sort()
    );
    for (const layer of [
      "model-terrain",
      "sea",
      "land",
      "zone",
      "route",
      "water",
      "bridge",
      "arrival",
      "player"
    ]) {
      expect(
        container.querySelector(`[data-map-layer="${layer}"]`),
        layer
      ).not.toBeNull();
    }
    expect(
      container.querySelector('[data-map-layer="coastline"]')
    ).toBeNull();

    // The five names are on the map itself, not in a list beneath it.
    const mapLabels = [
      ...container.querySelectorAll<SVGTextElement>("[data-map-label]")
    ];
    expect(mapLabels).toHaveLength(5);
    expect(
      mapLabels.every(
        (label) =>
          label.tagName.toLowerCase() === "text" &&
          label.dataset.labelFontTargetCssPx ===
            String(RPG_MINI_MAP_LABEL_CSS_PIXELS)
      )
    ).toBe(true);
    expect(mapLabels.map((label) => label.textContent)).toEqual(
      RPG_MAP_NODES.map((node) => labels.destinations[node.zoneId])
    );
    // Drawn where the projection places the name, not somewhere near it. The
    // projection test gates those places against the visitor marker, and that
    // gate is worth nothing if the map is free to put the text elsewhere.
    for (const node of RPG_MAP_NODES) {
      const label = container.querySelector(
        `[data-map-label="${node.zoneId}"]`
      );
      expect(label, node.zoneId).toHaveAttribute("x", String(node.label.x));
      expect(label, node.zoneId).toHaveAttribute("y", String(node.label.y));
      expect(label, node.zoneId).toHaveAttribute(
        "text-anchor",
        node.label.anchor
      );
    }
    for (const node of RPG_MAP_NODES) {
      expect(
        container.querySelector(
          `.rpg-mini-map-destination-${node.zoneId}`
        )
      ).toHaveAttribute(
        "data-heading-rotation",
        String(node.headingRotation)
      );
    }
  });

  it("keeps every fast-travel player marker on the canonical arrival marker", () => {
    const session = createFlatWorldSession({
      bounds: RPG_WORLD_BOUNDS,
      start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
      moveSpeed: 4
    });
    const { container, rerender } = render(
      <RpgMiniMap
        labels={labels}
        navigation={adaptFlatWorldNavigationSnapshot(
          session.getNavigationSnapshot()
        )}
      />
    );

    for (const destinationId of RPG_WORLD_ZONE_IDS) {
      const navigation = adaptFlatWorldNavigationSnapshot(
        session.fastTravel(destinationId)
      );
      rerender(<RpgMiniMap labels={labels} navigation={navigation} />);
      const player = container.querySelector<SVGGElement>(
        '[data-map-layer="player"]'
      );
      const arrival = container.querySelector<SVGGElement>(
        `.rpg-mini-map-destination-${destinationId}`
      );
      const node = RPG_MAP_NODES.find(
        ({ zoneId }) => zoneId === destinationId
      )!;
      const target = `${node.point.x},${node.point.y}`;
      expect(player).toHaveAttribute("data-anchor-reference", target);
      expect(arrival).toHaveAttribute("data-anchor-reference", target);
      expect(player).toHaveAttribute(
        "data-navigation-revision",
        String(navigation.revision)
      );
      expect(arrival).toHaveAttribute(
        "data-navigation-revision",
        String(navigation.revision)
      );
    }
  });

  it("marks the zone the visitor stands in and shows a north cue", () => {
    const { container } = render(
      <RpgMiniMap
        labels={labels}
        navigation={navigationAt([-8, 0, -24], [0, 0, -1])}
      />
    );

    expect(screen.getByRole("img", { name: "North" })).toBeVisible();
    expect(
      container.querySelectorAll('.rpg-map-terrain-zone[data-current="true"]')
    ).toHaveLength(1);
    expect(
      container.querySelector('.rpg-map-terrain-zone[data-current="true"]')
    ).toHaveClass("rpg-map-terrain-zone-sakura");
    const navigation = navigationAt([-8, 0, -24], [0, 0, -1]);
    const point = projectRpgMapWorldPoint(navigation.position);
    const rotation = projectRpgMapWorldHeadingRotation(navigation.heading);
    expect(container.querySelector(".rpg-mini-map-player")).toHaveAttribute(
      "transform",
      `translate(${point.x} ${point.y}) rotate(${rotation})`
    );
  });

  it("uses canonical transition highlight boundaries from the snapshot", () => {
    const navigation = navigationAt([-20, 0, 1], [1, 0, 0]);
    const { container } = render(
      <RpgMiniMap labels={labels} navigation={navigation} />
    );

    expect(navigation.navigationRegion).toMatchObject({
      kind: "transition",
      progress: 0.5,
      displayZoneId: "gyukatsu",
      highlightedZoneIds: ["airport", "gyukatsu"]
    });
    expect(
      container.querySelectorAll(
        '.rpg-map-terrain-zone[data-highlighted="true"]'
      )
    ).toHaveLength(2);
    expect(
      container.querySelector('.rpg-map-terrain-zone[data-current="true"]')
    ).toHaveClass("rpg-map-terrain-zone-gyukatsu");
  });

  it("updates player position, heading, and zone from one replacement snapshot", () => {
    const initial = navigationAt();
    const next = navigationAt([8, 0, 0], [0, 0, -1]);
    const { container, rerender } = render(
      <RpgMiniMap labels={labels} navigation={initial} />
    );
    const initialTransform = container
      .querySelector(".rpg-mini-map-player")
      ?.getAttribute("transform");

    rerender(<RpgMiniMap labels={labels} navigation={next} />);

    expect(
      container.querySelector(".rpg-mini-map-player")
    ).not.toHaveAttribute("transform", initialTransform);
    const expectedPoint = projectRpgMapWorldPoint(next.position);
    const expectedRotation = projectRpgMapWorldHeadingRotation(next.heading);
    expect(container.querySelector(".rpg-mini-map-player")).toHaveAttribute(
      "transform",
      `translate(${expectedPoint.x} ${expectedPoint.y}) rotate(${expectedRotation})`
    );
    expect(
      container.querySelector('.rpg-map-terrain-zone[data-current="true"]')
    ).toHaveClass("rpg-map-terrain-zone-gyukatsu");
  });

  it("collapses and expands without storing visitor state", async () => {
    const user = userEvent.setup();
    render(
      <RpgMiniMap
        labels={labels}
        navigation={navigationAt([0, 0, 0], [0, 0, 1])}
      />
    );

    const collapse = screen.getByRole("button", {
      name: "Collapse mini-map"
    });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await user.click(collapse);
    const expand = screen.getByRole("button", { name: "Expand mini-map" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("group", { name: "World mini-map" })
    ).not.toBeInTheDocument();

    await user.click(expand);
    expect(
      screen.getByRole("group", { name: "World mini-map" })
    ).toBeVisible();
    expect(window.localStorage).toHaveLength(0);
  });

  it("starts open on a mobile viewport", () => {
    // A phone is where this world is mostly walked. The map used to fold away
    // on a narrow screen, which meant the visitor who most needed it was the
    // one who never saw it — and the player marker, which only exists while
    // the map is open, went missing with it.
    useMobileViewport(true);

    render(
      <RpgMiniMap
        labels={labels}
        navigation={navigationAt([0, 0, 0], [0, 0, 1])}
      />
    );

    expect(
      screen.getByRole("button", { name: "Collapse mini-map" })
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("group", { name: "World mini-map" })
    ).toBeVisible();
  });

  it("still folds away on a mobile viewport when the visitor asks", async () => {
    useMobileViewport(true);
    const user = userEvent.setup();

    render(
      <RpgMiniMap
        labels={labels}
        navigation={navigationAt([0, 0, 0], [0, 0, 1])}
      />
    );

    await user.click(screen.getByRole("button", { name: "Collapse mini-map" }));

    expect(
      screen.getByRole("button", { name: "Expand mini-map" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("group", { name: "World mini-map" })
    ).not.toBeInTheDocument();
  });

  it("publishes revision-paired player telemetry on a mobile viewport", async () => {
    // A route drive on a phone reported "map telemetry is missing" because the
    // marker only exists while the map is open and the map used to start
    // closed on a narrow screen. It is open from the first frame now, so the
    // marker is there without anybody having to find the toggle first.
    useMobileViewport(true);
    const navigation = navigationAt([4, 0, -12], [0, 0, 1]);
    const { container } = render(
      <RpgMiniMap labels={labels} navigation={navigation} />
    );

    const marker = container.querySelector(".rpg-mini-map-player");
    const anchor = projectRpgMapWorldPoint(navigation.position);
    expect(marker).toHaveAttribute(
      "data-anchor-reference",
      `${anchor.x},${anchor.y}`
    );
    expect(marker).toHaveAttribute(
      "data-navigation-revision",
      String(navigation.revision)
    );
  });

  it("hydrates to the same markup the server sent on a mobile viewport", async () => {
    useMobileViewport(true);
    const props = {
      labels,
      navigation: navigationAt([0, 0, 0], [0, 0, 1])
    };
    const serverMarkup = renderToString(<RpgMiniMap {...props} />);
    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let root: Root | undefined;

    await act(async () => {
      root = hydrateRoot(container, <RpgMiniMap {...props} />);
      await Promise.resolve();
    });

    // The map used to open on the server and fold on the client once the
    // viewport was measured, which is a state the visitor sees flicker past.
    // It is open on both now, so there is nothing to reconcile.
    expect(serverMarkup).toContain('aria-expanded="true"');
    expect(
      container.querySelector('.rpg-mini-map-toggle[aria-expanded="true"]')
    ).not.toBeNull();
    expect(
      container.querySelector('.rpg-mini-map-toggle[aria-expanded="false"]')
    ).toBeNull();
    expect(
      consoleError.mock.calls.flat().join(" ")
    ).not.toMatch(/hydration|did not match/i);

    await act(async () => root?.unmount());
    container.remove();
  });
});
