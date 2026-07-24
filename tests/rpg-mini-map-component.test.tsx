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
  projectRpgReferenceMapHeadingRotation,
  projectRpgReferenceMapPoint
} from "../app/world/RpgMiniMapProjection";
import {
  RPG_WORLD_BRIDGE,
  RPG_WORLD_BOUNDS,
  RPG_WORLD_CANAL,
  RPG_WORLD_ROUTES,
  RPG_WORLD_SPAWN,
  RPG_WORLD_ZONES,
  RPG_WORLD_ZONE_IDS
} from "../app/world/RpgWorldModel";
import { RPG_REFERENCE_MAP_GOLDEN } from "./fixtures/rpg-reference-registration-golden";

const labels = {
  label: "World mini-map",
  expand: "Expand mini-map",
  collapse: "Collapse mini-map",
  currentPosition: "Current position",
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

  it("shows the route, five destinations, current position, and heading", () => {
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
    for (const destination of Object.values(labels.destinations)) {
      expect(screen.getByRole("img", { name: destination })).toBeVisible();
    }
    expect(
      screen.getByRole("img", {
        name: "Current position: Airport bus stop"
      })
    ).toBeVisible();
    const canvas = container.querySelector(".rpg-mini-map-canvas");
    expect(canvas).toHaveAttribute("viewBox", "0 0 1817 866");
    expect(container.querySelector("image")).toBeNull();
    expect(
      container.querySelector('[data-map-layer="model-terrain"]')
    ).not.toBeNull();
    expect(container.querySelectorAll("[data-map-zone]")).toHaveLength(
      RPG_WORLD_ZONES.length
    );
    expect(container.querySelectorAll("[data-map-route]")).toHaveLength(
      RPG_WORLD_ROUTES.length
    );
    expect(
      container.querySelector(`[data-map-water="${RPG_WORLD_CANAL.id}"]`)
    ).not.toBeNull();
    expect(
      container.querySelector(`[data-map-bridge="${RPG_WORLD_BRIDGE.id}"]`)
    ).not.toBeNull();
    const sourceIds = [
      ...container.querySelectorAll<SVGElement>("[data-map-source-id]")
    ].map((element) => element.dataset.mapSourceId!);
    expect([...new Set(sourceIds)].sort()).toEqual(
      [...RPG_CANONICAL_MAP_SOURCE_IDS].sort()
    );
    for (const layer of [
      "model-terrain",
      "coastline",
      "bridge",
      "route",
      "zone",
      "arrival",
      "player"
    ]) {
      expect(container.querySelector(`[data-map-layer="${layer}"]`)).not.toBeNull();
    }
    const mapLabels = [
      ...container.querySelectorAll<HTMLElement>("[data-map-label]")
    ];
    expect(mapLabels).toHaveLength(5);
    expect(
      mapLabels.every(
        (label) => label.dataset.labelFontTargetCssPx === "10"
      )
    ).toBe(true);
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
      const target = RPG_REFERENCE_MAP_GOLDEN.nodes[destinationId].join(",");
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
      container.querySelectorAll('.rpg-mini-map-zone[data-current="true"]')
    ).toHaveLength(1);
    expect(
      container.querySelector('.rpg-mini-map-zone[data-current="true"]')
    ).toHaveClass("rpg-mini-map-zone-sakura");
    const navigation = navigationAt([-8, 0, -24], [0, 0, -1]);
    const point = projectRpgReferenceMapPoint(navigation.position);
    const rotation = projectRpgReferenceMapHeadingRotation(
      navigation.position,
      navigation.heading
    );
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
      container.querySelectorAll('.rpg-mini-map-zone[data-highlighted="true"]')
    ).toHaveLength(2);
    expect(
      container.querySelector('.rpg-mini-map-zone[data-current="true"]')
    ).toHaveClass("rpg-mini-map-zone-gyukatsu");
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
    const expectedPoint = projectRpgReferenceMapPoint(next.position);
    const expectedRotation = projectRpgReferenceMapHeadingRotation(
      next.position,
      next.heading
    );
    expect(container.querySelector(".rpg-mini-map-player")).toHaveAttribute(
      "transform",
      `translate(${expectedPoint.x} ${expectedPoint.y}) rotate(${expectedRotation})`
    );
    expect(
      container.querySelector('.rpg-mini-map-zone[data-current="true"]')
    ).toHaveClass("rpg-mini-map-zone-gyukatsu");
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

  it("starts collapsed on a mobile viewport", () => {
    useMobileViewport(true);

    render(
      <RpgMiniMap
        labels={labels}
        navigation={navigationAt([0, 0, 0], [0, 0, 1])}
      />
    );

    expect(
      screen.getByRole("button", { name: "Expand mini-map" })
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("group", { name: "World mini-map" })
    ).not.toBeInTheDocument();
  });

  it("hydrates without changing the server markup before applying the mobile default", async () => {
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

    expect(serverMarkup).toContain('aria-expanded="true"');
    expect(
      container.querySelector('.rpg-mini-map-toggle[aria-expanded="false"]')
    ).not.toBeNull();
    expect(
      consoleError.mock.calls.flat().join(" ")
    ).not.toMatch(/hydration|did not match/i);

    await act(async () => root?.unmount());
    container.remove();
  });
});
