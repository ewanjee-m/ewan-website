import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getMessages } from "../app/i18n/messages";
import {
  RPG_CANONICAL_MAP_SOURCE_IDS
} from "../app/world/RpgMiniMapProjection";
import { createInitialWorldNavigationSnapshot } from "../app/world/WorldNavigationState";
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

  it("loads SeamlessWorldCanvas instead of FlatWorldCanvas", () => {
    const source = readFileSync("app/world/WorldView.tsx", "utf8");

    expect(source).toContain('import("./SeamlessWorldCanvas")');
    expect(source).not.toContain('import("./FlatWorldCanvas")');
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
    const navigation = createInitialWorldNavigationSnapshot();
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
      expect(map.querySelector("image")).toBeNull();
      expect(
        map.querySelector('[data-map-layer="model-terrain"]')
      ).not.toBeNull();
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

  it("keeps the read-only map open without moving after choosing a destination", async () => {
    const user = userEvent.setup();
    renderWorld();
    const world = screen.getByTestId("world-view");
    const position = world.getAttribute("data-player-position");
    const revision = world.getAttribute("data-navigation-revision");

    await user.keyboard("m");
    await user.click(
      screen.getByRole("button", { name: "Inspect: Gyukatsu" })
    );

    expect(
      screen.getByRole("dialog", { name: "World map" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Inspect: Gyukatsu" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("world-map-selected-description")
    ).toHaveTextContent(
      getMessages("en").worldMap.destinationDescriptions.gyukatsu
    );
    expect(world).toHaveAttribute("data-player-position", position);
    expect(world).toHaveAttribute("data-navigation-revision", revision);
  });
});
