import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PortfolioGuide } from "../app/world/PortfolioGuide";

const labels = {
  portfolioLabel: "Portfolio landmarks",
  openPortfolio: "View work",
  closePortfolioMenu: "Close work list",
  closePortfolio: "Close portfolio",
  portfolioItems: [
    {
      id: "world-design",
      title: "Festival World Design",
      kicker: "Spherical festival world",
      summary: "A continuous interactive festival world."
    }
  ]
};

describe("mobile portfolio landmarks", () => {
  it("starts as one compact control and restores the list after closing an entry", async () => {
    const user = userEvent.setup();
    render(
      <PortfolioGuide
        labels={labels}
        requestedEntryId={null}
        onOpenChange={vi.fn()}
        onRequestHandled={vi.fn()}
      />
    );

    const toggle = screen.getByRole("button", { name: "View work" });
    const landmarks = screen.getByRole("navigation", {
      name: "Portfolio landmarks"
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(landmarks).toHaveAttribute("data-menu-open", "false");

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAccessibleName("Close work list");
    expect(landmarks).toHaveAttribute("data-menu-open", "true");

    await user.click(
      screen.getByRole("button", { name: "Festival World Design" })
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("dialog")).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Close portfolio" })
    );
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(landmarks).toHaveAttribute("data-menu-open", "true");
  });

  it("handles a controlled request once and shares Escape with the close path", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onRequestHandled = vi.fn();
    const requester = document.createElement("button");
    requester.textContent = "NPC";
    document.body.append(requester);
    requester.focus();
    const { rerender } = render(
      <PortfolioGuide
        labels={labels}
        requestedEntryId="world-design"
        onOpenChange={onOpenChange}
        onRequestHandled={onRequestHandled}
      />
    );

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(onRequestHandled).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <PortfolioGuide
        labels={labels}
        requestedEntryId="world-design"
        onOpenChange={onOpenChange}
        onRequestHandled={onRequestHandled}
      />
    );
    expect(onRequestHandled).toHaveBeenCalledOnce();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onOpenChange.mock.calls.filter(([open]) => !open)).toHaveLength(1);
    expect(onRequestHandled).toHaveBeenCalledOnce();
    expect(requester).toHaveFocus();
    requester.remove();
  });
});

describe("portfolio list against the world overlays", () => {
  it("puts the open list above the world mini-map so every entry can be tapped", () => {
    // On a phone the open list reaches down over the map, and the map used to
    // sit on top, which swallowed taps on the last entry.
    const styles = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8"
    );
    const guideLayer = Number(
      /\.portfolio-guide:has\([^)]*\)\s*\{[^}]*z-index:\s*(\d+)/.exec(styles)?.[1]
    );
    const miniMapLayer = Number(
      /\.rpg-mini-map\s*\{[^}]*z-index:\s*(\d+)/.exec(styles)?.[1]
    );

    expect(Number.isFinite(guideLayer)).toBe(true);
    expect(Number.isFinite(miniMapLayer)).toBe(true);
    expect(guideLayer).toBeGreaterThan(miniMapLayer);
  });
});
