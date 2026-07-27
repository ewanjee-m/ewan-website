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
  it("shows nothing until a conversation asks for something", async () => {
    // The world used to carry a "View work" toggle and a landmark menu beside
    // it. Both are gone: the way into a piece of work is to walk up to it and
    // talk. With nothing requested there is nothing on screen.
    const user = userEvent.setup();
    const { rerender } = render(
      <PortfolioGuide
        labels={labels}
        requestedEntryId={null}
        requestedDialogue={null}
        onOpenChange={vi.fn()}
        onRequestHandled={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "View work" })).toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Portfolio landmarks" })
    ).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();

    // What a conversation asks for still opens, and closing it leaves the
    // world clear again rather than dropping the visitor into a menu.
    rerender(
      <PortfolioGuide
        labels={labels}
        requestedEntryId="world-design"
        requestedDialogue={null}
        onOpenChange={vi.fn()}
        onRequestHandled={vi.fn()}
      />
    );
    expect(screen.getByRole("dialog")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Close portfolio" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: "View work" })).toBeNull();
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
        requestedDialogue={{
          contextLabel: "Hanabi · NPC conversation",
          speaker: "Haru · Festival child",
          message:
            "The candy-apple stall is beside the torii. Let's go before the fireworks begin!"
        }}
        onOpenChange={onOpenChange}
        onRequestHandled={onRequestHandled}
      />
    );

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("Hanabi · NPC conversation")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Haru · Festival child" })
    ).toBeVisible();
    expect(
      screen.getByText(
        "The candy-apple stall is beside the torii. Let's go before the fireworks begin!"
      )
    ).toBeVisible();
    expect(
      screen.queryByText("A continuous interactive festival world.")
    ).not.toBeInTheDocument();
    expect(onRequestHandled).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(true);

    rerender(
      <PortfolioGuide
        labels={labels}
        requestedEntryId="world-design"
        requestedDialogue={{
          contextLabel: "Hanabi · NPC conversation",
          speaker: "Haru · Festival child",
          message:
            "The candy-apple stall is beside the torii. Let's go before the fireworks begin!"
        }}
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

  it("keeps the desktop work list collapsed until the visitor asks for it", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8"
    );

    expect(styles).toMatch(
      /\.portfolio-landmarks\s*\{[^}]*display:\s*none/
    );
    expect(styles).toMatch(
      /\.portfolio-landmarks\[data-menu-open="true"\]\s*\{[^}]*display:\s*grid/
    );
  });

  it("keeps the mobile interaction card in the lower third and clears inactive controls", () => {
    const styles = readFileSync(
      resolve(process.cwd(), "app/globals.css"),
      "utf8"
    );

    expect(styles).toContain(
      ".world-shell:has(.portfolio-dialog) .world-controls"
    );
    expect(styles).toMatch(
      /@media \(max-width: 640px\)[\s\S]*?\.portfolio-dialog\s*\{[^}]*bottom:/
    );
  });
});
