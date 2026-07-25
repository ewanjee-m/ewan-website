import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { adaptFlatWorldNavigationSnapshot } from "../app/world/FlatWorldNavigationAdapter";
import { createFlatWorldSession } from "../app/world/FlatWorldSession";
import {
  RPG_CANONICAL_MAP_SOURCE_IDS,
  RPG_MAP_NODES,
  RPG_MAP_ROADS,
  RPG_MAP_SCALE_WORLD_UNITS,
  RPG_MAP_VIEW_BOX,
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
import { RpgWorldMap } from "../app/world/RpgWorldMap";
import { createWorldRuntime } from "../app/world/WorldRuntime";

const labels = {
  title: "World map",
  open: "Open world map (M key)",
  close: "Close world map",
  hint: "Select a place to inspect it. Walk there through the world.",
  inspect: "Inspect",
  currentPosition: "Current position",
  nextDestination: "Next destination",
  mainRoute: "Main route",
  north: "North is up",
  legendLabel: "Map legend",
  legendZone: "Place",
  legendRoute: "Road",
  legendPlayer: "You and the way you face",
  scale: "Scale",
  destinations: {
    airport: "Airport",
    tokyo: "Tokyo",
    gyukatsu: "Gyukatsu",
    sakura: "Sakura",
    hanabi: "Hanabi"
  },
  destinationDescriptions: {
    airport: "Airport terminal and limousine bus plaza",
    tokyo: "Tokyo boulevard and shopfront district",
    gyukatsu: "Gyukatsu alleys and outdoor grills",
    sakura: "Sakura canal, promenade, and bridge",
    hanabi: "Hanabi torii, stalls, lanterns, and fireworks"
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

function renderWorldMap(
  overrides: Partial<Parameters<typeof RpgWorldMap>[0]> = {}
) {
  const onClose = vi.fn();
  const result = render(
    <RpgWorldMap
      labels={labels}
      navigation={navigationAt()}
      onClose={onClose}
      {...overrides}
    />
  );
  return { ...result, onClose };
}

describe("RPG world map", () => {
  it("is a named modal dialog that focuses its close control", () => {
    renderWorldMap();

    const dialog = screen.getByRole("dialog", { name: "World map" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("data-world-input-block", "true");
    expect(screen.getByRole("button", { name: "Close world map" })).toHaveFocus();
    expect(
      screen.getByRole("region", { name: "Map legend" })
    ).toBeVisible();
    expect(
      screen.getByText(
        "Current position: Airport · Next destination: Tokyo"
      )
    ).toBeVisible();
  });

  it("offers every zone for inspection and reports the visitor's zone", () => {
    const { container } = renderWorldMap({
      navigation: navigationAt([28, 0, -24], [1, 0, 0])
    });

    for (const destination of Object.values(labels.destinations)) {
      expect(
        screen.getByRole("button", { name: `Inspect: ${destination}` })
      ).toBeVisible();
    }
    expect(
      screen.getByRole("button", { name: "Inspect: Hanabi" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      container.querySelectorAll('.rpg-map-terrain-zone[data-current="true"]')
    ).toHaveLength(1);
    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>(
        ".rpg-world-map-zone-button"
      )
    ];
    expect(buttons).toHaveLength(5);
    expect(
      buttons.every(
        (button) =>
          button.dataset.touchTargetMinCss === "44x44" &&
          button.dataset.touchRectMobileCss === "76x44" &&
          button.dataset.labelFontTargetCssPx === "12" &&
          Boolean(button.dataset.anchorReference) &&
          Boolean(button.dataset.mobileControlReference)
      )
    ).toBe(true);
    expect(
      container.querySelectorAll("[data-map-mobile-leader]")
    ).toHaveLength(5);
    for (const node of RPG_MAP_NODES) {
      expect(
        container.querySelector(
          `.rpg-world-map-zone-button-${node.zoneId}`
        )
      ).toHaveAttribute(
        "data-heading-rotation",
        String(node.headingRotation)
      );
    }
  });

  it("selects a place without moving the player", async () => {
    const user = userEvent.setup();
    const navigation = navigationAt(RPG_WORLD_SPAWN, [1, 0, 0]);
    const before = navigation.position.join(",");
    renderWorldMap({ navigation });

    await user.click(screen.getByRole("button", { name: "Inspect: Hanabi" }));

    expect(
      screen.getByTestId("world-map-selected-description")
    ).toHaveTextContent(labels.destinationDescriptions.hanabi);
    expect(navigation.position.join(",")).toBe(before);
  });

  it("keeps runtime position and revision fixed for 500ms after map selection", async () => {
    const runtime = createWorldRuntime();
    const user = userEvent.setup();
    renderWorldMap({ navigation: runtime.getNavigationSnapshot() });
    const before = runtime.getNavigationSnapshot();

    await user.click(screen.getByRole("button", { name: "Inspect: Hanabi" }));

    vi.useFakeTimers();
    try {
      for (let frame = 0; frame < 30; frame += 1) {
        runtime.advance(1 / 60, 0);
        await vi.advanceTimersByTimeAsync(1000 / 60);
      }

      const after = runtime.getNavigationSnapshot();
      expect(after.position).toEqual(before.position);
      expect(after.revision).toBe(before.revision);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not expose a travel callback", () => {
    expectTypeOf<Parameters<typeof RpgWorldMap>[0]>().not.toHaveProperty(
      "onTravel"
    );
  });

  it("closes the read-only map on Escape without changing navigation", async () => {
    const user = userEvent.setup();
    const navigation = navigationAt([28, 0, -24], [0, 0, -1]);
    const position = [...navigation.position];
    const revision = navigation.revision;
    const { onClose } = renderWorldMap({ navigation });

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(navigation.position).toEqual(position);
    expect(navigation.revision).toBe(revision);

    await user.click(screen.getByRole("button", { name: "Close world map" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps keyboard focus inside the dialog", async () => {
    const user = userEvent.setup();
    renderWorldMap();

    const close = screen.getByRole("button", { name: "Close world map" });
    const last = screen.getByRole("button", { name: "Inspect: Hanabi" });

    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();
  });

  it("draws the town, the road network, and the visitor facing", () => {
    const { container } = renderWorldMap({
      navigation: navigationAt([8, 0, 0], [0, 0, -1])
    });

    expect(container.querySelectorAll(".rpg-map-terrain-zone")).toHaveLength(5);
    expect(
      container.querySelectorAll(".rpg-map-terrain-route")
    ).toHaveLength(RPG_MAP_ROADS.length);
    expect(
      container.querySelector(".rpg-map-terrain-bridge")
    ).not.toBeNull();
    expect(container.querySelector(".rpg-world-map-canvas")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(container.querySelector(".rpg-world-map-canvas")).toHaveAttribute(
      "viewBox",
      `0 0 ${RPG_MAP_VIEW_BOX.width} ${RPG_MAP_VIEW_BOX.height}`
    );
    expect(container.querySelector("image")).toBeNull();
    expect(
      container.querySelector('[data-map-layer="model-terrain"]')
    ).not.toBeNull();
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

    // A real scale bar, because the drawing is now at one uniform scale.
    expect(
      container.querySelector(".rpg-world-map-scale-bar")
    ).toHaveAttribute(
      "data-map-scale-world-units",
      String(RPG_MAP_SCALE_WORLD_UNITS)
    );

    const navigation = navigationAt([8, 0, 0], [0, 0, -1]);
    const playerPoint = projectRpgMapWorldPoint(navigation.position);
    const rotation = projectRpgMapWorldHeadingRotation(navigation.heading);
    expect(container.querySelector(".rpg-world-map-player")).toHaveAttribute(
      "transform",
      `translate(${playerPoint.x} ${playerPoint.y}) rotate(${rotation})`
    );
    const sourceIds = [
      ...container.querySelectorAll<HTMLElement>("[data-map-source-id]")
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
  });

  it("marks the district the visitor should head for next", () => {
    const { container } = renderWorldMap({
      navigation: navigationAt([8, 0, 0], [0, 0, -1])
    });

    const nextZoneId = getRpgMapNextZoneId("gyukatsu");
    expect(nextZoneId).toBe("sakura");
    expect(
      container.querySelectorAll('.rpg-world-map-destination[data-next="true"]')
    ).toHaveLength(1);
    expect(
      container.querySelector('.rpg-world-map-destination[data-next="true"]')
    ).toHaveClass(`rpg-world-map-destination-${nextZoneId}`);
    expect(
      container.querySelector(
        `.rpg-world-map-zone-button-${nextZoneId}`
      )
    ).toHaveAttribute("data-next", "true");

    // The last stop on the chain has nowhere further to send the visitor.
    const { container: atTheEnd } = renderWorldMap({
      navigation: navigationAt([26, 0, -18], [1, 0, 0])
    });
    expect(getRpgMapNextZoneId(RPG_WORLD_ZONE_IDS.at(-1)!)).toBeNull();
    expect(
      atTheEnd.querySelectorAll('.rpg-world-map-destination[data-next="true"]')
    ).toHaveLength(0);
  });

  it("highlights both canonical zones at the transition midpoint", () => {
    const navigation = navigationAt([-20, 0, 1], [1, 0, 0]);
    const { container } = renderWorldMap({ navigation });

    expect(navigation.currentZoneId).toBe("gyukatsu");
    expect(navigation.highlightedZoneIds).toEqual(["airport", "gyukatsu"]);
    expect(
      container.querySelectorAll(
        '.rpg-map-terrain-zone[data-highlighted="true"]'
      )
    ).toHaveLength(2);
    expect(
      container.querySelector('.rpg-map-terrain-zone[data-current="true"]')
    ).toHaveClass("rpg-map-terrain-zone-gyukatsu");
  });

  it("uses the same projected arrival authority for destination and player", () => {
    const session = createFlatWorldSession({
      bounds: RPG_WORLD_BOUNDS,
      start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
      moveSpeed: 4
    });

    for (const destinationId of RPG_WORLD_ZONE_IDS) {
      const navigation = adaptFlatWorldNavigationSnapshot(
        session.fastTravel(destinationId)
      );
      const { container, unmount } = renderWorldMap({ navigation });
      const node = RPG_MAP_NODES.find(
        ({ zoneId }) => zoneId === destinationId
      )!;
      const target = `${node.point.x},${node.point.y}`;
      expect(
        container.querySelector('[data-map-layer="player"]')
      ).toHaveAttribute("data-anchor-reference", target);
      expect(
        container.querySelector(
          `.rpg-world-map-zone-button-${destinationId}`
        )
      ).toHaveAttribute("data-anchor-reference", target);
      unmount();
    }
  });
});
