import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "../app/i18n/messages";
import { createInitialFlatWorldNavigationSnapshot } from "../app/world/FlatWorldSession";
import {
  RPG_CANONICAL_MAP_SOURCE_IDS,
  RPG_MAP_TERRAIN_ASSET
} from "../app/world/RpgMiniMapProjection";
import {
  WorldView,
  shareWorldNavigationSnapshot
} from "../app/world/WorldView";

function renderWorld() {
  vi.stubGlobal("WebGL2RenderingContext", class WebGL2RenderingContext {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getExtension: () => ({ loseContext: () => undefined })
  } as unknown as WebGL2RenderingContext);

  return render(
    <WorldView character="female" locale="en" labels={getMessages("en")} />
  );
}

describe("world mini-map integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the localized map with the world navigation starting point", () => {
    renderWorld();

    expect(
      screen.getByRole("button", { name: "Collapse mini-map" })
    ).toBeVisible();
    expect(
      screen.getByRole("img", { name: "Current position: Airport" })
    ).toBeVisible();
    expect(screen.getByTestId("world-view")).toHaveAttribute(
      "data-player-position",
      "-26.305,0.000,-2.973"
    );
    expect(screen.getByTestId("world-view")).toHaveAttribute(
      "data-navigation-region",
      "airport"
    );
    expect(screen.getByTestId("world-view")).toHaveAttribute(
      "data-highlighted-zones",
      "airport"
    );
  });

  it("shares one immutable navigation object across every consumer", () => {
    const navigation = createInitialFlatWorldNavigationSnapshot();
    const consumers = shareWorldNavigationSnapshot(navigation);

    expect(consumers.guide).toBe(navigation);
    expect(consumers.miniMap).toBe(navigation);
    expect(consumers.worldMap).toBe(navigation);
    expect(consumers.telemetry).toBe(navigation);
    expect(Object.isFrozen(consumers)).toBe(true);
    expect(Object.isFrozen(navigation)).toBe(true);
  });

  it("opens the full world map from the on-screen control and closes it again", async () => {
    const user = userEvent.setup();
    renderWorld();

    const openButton = screen.getByRole("button", {
      name: "Open world map (M key)"
    });
    expect(openButton).toHaveAttribute("aria-expanded", "false");

    await user.click(openButton);
    const dialog = screen.getByRole("dialog", { name: "World map" });
    expect(dialog).toBeVisible();
    const miniMap = screen.getByRole("group", { name: "World mini-map" });
    const sourceIds = (root: Element) =>
      [
        ...root.querySelectorAll<HTMLElement>("[data-map-source-id]")
      ].map((element) => element.dataset.mapSourceId!);
    expect([...new Set(sourceIds(miniMap))].sort()).toEqual(
      [...RPG_CANONICAL_MAP_SOURCE_IDS].sort()
    );
    expect([...new Set(sourceIds(dialog))].sort()).toEqual(
      [...RPG_CANONICAL_MAP_SOURCE_IDS].sort()
    );
    for (const map of [miniMap, dialog]) {
      expect(map.querySelector('[data-map-layer="terrain"]')).toHaveAttribute(
        "href",
        RPG_MAP_TERRAIN_ASSET
      );
    }
    expect(
      miniMap.getAttribute("data-navigation-revision")
    ).toBe(
      dialog
        .querySelector(".rpg-world-map-canvas")
        ?.getAttribute("data-navigation-revision")
    );
    expect(
      miniMap
        .querySelector('[data-map-layer="player"]')
        ?.getAttribute("transform")
    ).toBe(
      dialog
        .querySelector('[data-map-layer="player"]')
        ?.getAttribute("transform")
    );
    expect(
      miniMap
        .querySelector('[data-map-layer="player"]')
        ?.getAttribute("data-navigation-revision")
    ).toBe(
      dialog
        .querySelector('[data-map-layer="player"]')
        ?.getAttribute("data-navigation-revision")
    );

    await user.click(
      screen.getByRole("button", { name: "Close world map" })
    );
    expect(
      screen.queryByRole("dialog", { name: "World map" })
    ).not.toBeInTheDocument();
    expect(openButton).toHaveFocus();
  });

  it("opens and closes the full world map with the M shortcut", async () => {
    const user = userEvent.setup();
    renderWorld();

    await user.keyboard("m");
    expect(screen.getByRole("dialog", { name: "World map" })).toBeVisible();

    await user.keyboard("m");
    expect(
      screen.queryByRole("dialog", { name: "World map" })
    ).not.toBeInTheDocument();
  });

  it("closes the full world map after choosing a fast travel destination", async () => {
    const user = userEvent.setup();
    renderWorld();

    await user.keyboard("m");
    await user.click(
      screen.getByRole("button", { name: "Travel to: Gyukatsu" })
    );

    expect(
      screen.queryByRole("dialog", { name: "World map" })
    ).not.toBeInTheDocument();
  });
});
