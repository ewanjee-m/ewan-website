import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { adaptFlatWorldNavigationSnapshot } from "../app/world/FlatWorldNavigationAdapter";
import { createFlatWorldSession } from "../app/world/FlatWorldSession";
import {
  RPG_CANONICAL_MAP_SOURCE_IDS,
  RPG_MAP_TERRAIN_ASSET,
  projectRpgReferenceMapHeadingRotation,
  projectRpgReferenceMapPoint
} from "../app/world/RpgMiniMapProjection";
import {
  RPG_WORLD_BOUNDS,
  RPG_WORLD_SPAWN
} from "../app/world/RpgWorldModel";
import { RpgWorldMap } from "../app/world/RpgWorldMap";
import { RPG_REFERENCE_MAP_GOLDEN } from "./fixtures/rpg-reference-registration-golden";

const labels = {
  title: "World map",
  open: "Open world map (M key)",
  close: "Close world map",
  hint: "Choose a place to travel straight there.",
  travelTo: "Travel to",
  currentPosition: "Current position",
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
    expect(screen.getByText("Current position: Airport")).toBeVisible();
  });

  it("offers every zone as a travel target and reports the visitor's zone", () => {
    const { container } = renderWorldMap({
      navigation: navigationAt([28, 0, -24], [1, 0, 0])
    });

    for (const destination of Object.values(labels.destinations)) {
      expect(
        screen.getByRole("button", { name: `Travel to: ${destination}` })
      ).toBeVisible();
    }
    expect(
      screen.getByRole("button", { name: "Travel to: Hanabi" })
    ).toHaveAttribute("aria-current", "true");
    expect(
      container.querySelectorAll('.rpg-world-map-zone[data-current="true"]')
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
  });

  it("selects a destination without changing navigation", async () => {
    const user = userEvent.setup();
    const navigation = navigationAt();
    renderWorldMap({ navigation });

    await user.click(
      screen.getByRole("button", { name: "Travel to: Sakura" })
    );

    expect(
      screen.getByRole("button", { name: "Travel to: Sakura" })
    ).toHaveAttribute("aria-current", "true");
    expect(navigation.position).toEqual(RPG_WORLD_SPAWN);
    expect(navigation.revision).toBe(0);
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
    const last = screen.getByRole("button", { name: "Travel to: Hanabi" });

    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();
  });

  it("draws the town, the route network, and the visitor facing", () => {
    const { container } = renderWorldMap({
      navigation: navigationAt([8, 0, 0], [0, 0, -1])
    });

    expect(container.querySelectorAll(".rpg-world-map-zone")).toHaveLength(5);
    expect(
      container.querySelectorAll(".rpg-world-map-route-segment").length
    ).toBeGreaterThan(1);
    expect(
      container.querySelector(".rpg-world-map-route-bridge")
    ).not.toBeNull();
    expect(container.querySelector(".rpg-world-map-canvas")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(container.querySelector(".rpg-world-map-canvas")).toHaveAttribute(
      "viewBox",
      "0 0 1817 866"
    );
    expect(container.querySelector('[data-map-layer="terrain"]')).toHaveAttribute(
      "href",
      RPG_MAP_TERRAIN_ASSET
    );
    const navigation = navigationAt([8, 0, 0], [0, 0, -1]);
    const playerPoint = projectRpgReferenceMapPoint(navigation.position);
    const rotation = projectRpgReferenceMapHeadingRotation(
      navigation.position,
      navigation.heading
    );
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
      "terrain",
      "coastline",
      "bridge",
      "route",
      "zone",
      "arrival",
      "player"
    ]) {
      expect(container.querySelector(`[data-map-layer="${layer}"]`)).not.toBeNull();
    }
  });

  it("highlights both canonical zones at the transition midpoint", () => {
    const navigation = navigationAt([-20, 0, 1], [1, 0, 0]);
    const { container } = renderWorldMap({ navigation });

    expect(navigation.currentZoneId).toBe("gyukatsu");
    expect(navigation.highlightedZoneIds).toEqual(["airport", "gyukatsu"]);
    expect(
      container.querySelectorAll('.rpg-world-map-zone[data-highlighted="true"]')
    ).toHaveLength(2);
    expect(
      container.querySelector('.rpg-world-map-zone[data-current="true"]')
    ).toHaveClass("rpg-world-map-zone-gyukatsu");
  });

  it("uses the same projected arrival authority for destination and player", () => {
    const session = createFlatWorldSession({
      bounds: RPG_WORLD_BOUNDS,
      start: { x: RPG_WORLD_SPAWN[0], z: RPG_WORLD_SPAWN[2] },
      moveSpeed: 4
    });

    for (const destinationId of Object.keys(
      RPG_REFERENCE_MAP_GOLDEN.nodes
    ) as Array<keyof typeof RPG_REFERENCE_MAP_GOLDEN.nodes>) {
      const navigation = adaptFlatWorldNavigationSnapshot(
        session.fastTravel(destinationId)
      );
      const { container, unmount } = renderWorldMap({ navigation });
      const target = RPG_REFERENCE_MAP_GOLDEN.nodes[destinationId].join(",");
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
