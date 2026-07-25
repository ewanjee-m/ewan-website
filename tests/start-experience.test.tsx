import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InputController } from "../app/world/InputController";
import {
  createInitialWorldNavigationSnapshot,
  type WorldNavigationSnapshot
} from "../app/world/WorldNavigationState";

interface MockWorldCanvasProps {
  input: InputController;
  inputLocked: boolean;
  onInteractionRequest: (entryId: string) => void;
  onNavigationChange: (snapshot: WorldNavigationSnapshot) => void;
}

const worldCanvasHarness = vi.hoisted(() => ({
  current: null as MockWorldCanvasProps | null
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockWorldCanvas(props: MockWorldCanvasProps) {
      worldCanvasHarness.current = props;
      return null;
    }
}));

import { ExperienceShell } from "../app/components/ExperienceShell";
import { WORLD_INTERACTION_TARGETS } from "../app/world/WorldInteraction";

describe("start experience", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    worldCanvasHarness.current = null;
  });

  it("shows the English welcome screen before character selection", () => {
    const { container } = render(<ExperienceShell locale="en" />);

    expect(
      screen.getByRole("heading", { name: "WELCOME TO MY WORLD!" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "START" })).toBeEnabled();
    expect(
      screen.queryByRole("heading", { name: "CHOOSE YOUR CHARACTER" })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("approved-start-environment")).toHaveAttribute(
      "src",
      "/assets/world/world-environment-concept.png"
    );
    expect(container.querySelector(".start-sky")).not.toBeInTheDocument();
    expect(
      container.querySelector(
        ".start-moon, .start-firework, .start-horizon"
      )
    ).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/docs\/.*concept/i);
  });

  it("shows START as not-yet-ready in the server markup so no click is swallowed", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<ExperienceShell locale="en" />);
    const start = container.querySelector<HTMLButtonElement>(
      "button.primary-action"
    );

    expect(start?.textContent).toBe("START");
    // Before hydration React has attached no click handler, so an enabled
    // button would take the click and do nothing at all. Disabled is the one
    // state that is both visibly not-ready and impossible to click silently.
    expect(start?.disabled).toBe(true);
    expect(start?.getAttribute("aria-busy")).toBe("true");
    expect(start?.getAttribute("data-ready")).toBe("false");
    expect(
      container.querySelector(".start-screen")?.getAttribute("data-ready")
    ).toBe("false");
  });

  it("enables START as soon as the client has hydrated", () => {
    const { container } = render(<ExperienceShell locale="en" />);
    const start = screen.getByRole("button", { name: "START" });

    expect(start).toBeEnabled();
    expect(start).toHaveAttribute("data-ready", "true");
    expect(start).not.toHaveAttribute("aria-busy", "true");
    expect(container.querySelector(".start-screen")).toHaveAttribute(
      "data-ready",
      "true"
    );
  });

  it("opens character selection without entering the world", async () => {
    const user = userEvent.setup();
    const { container } = render(<ExperienceShell locale="en" />);

    await user.click(screen.getByRole("button", { name: "START" }));

    expect(
      screen.getByRole("heading", { name: "CHOOSE YOUR CHARACTER" })
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "ENTER WORLD" })
    ).toBeDisabled();
    expect(screen.getByAltText("Male player character")).toHaveAttribute(
      "src",
      "/assets/characters/player-male.png"
    );
    expect(screen.getByAltText("Female player character")).toHaveAttribute(
      "src",
      "/assets/characters/player-female.png"
    );
    expect(screen.queryByTestId("world-view")).not.toBeInTheDocument();
    expect(screen.getByTestId("approved-start-environment")).toHaveAttribute(
      "src",
      "/assets/world/world-environment-concept.png"
    );
    expect(container.querySelector(".start-sky")).not.toBeInTheDocument();
    expect(
      container.querySelector(
        ".start-moon, .start-firework, .start-horizon"
      )
    ).not.toBeInTheDocument();

    const characterGrid = document.querySelector(".character-grid");
    expect(characterGrid).toHaveAttribute("data-card-width", "320");
    expect(characterGrid).toHaveAttribute("data-card-height", "525");
    expect(characterGrid).toHaveAttribute("data-card-gap", "46");
    expect(
      screen.getByRole("button", { name: "Select male character" })
    ).toHaveClass("character-option");
  });

  it("enters the world with the selected female character", async () => {
    const user = userEvent.setup();
    render(<ExperienceShell locale="en" />);

    await user.click(screen.getByRole("button", { name: "START" }));
    await user.click(
      screen.getByRole("button", { name: "Select female character" })
    );

    expect(
      screen.getByRole("button", { name: "Select female character" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "ENTER WORLD" })
    ).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "ENTER WORLD" }));

    expect(
      screen.getByRole("region", { name: "3D portfolio world" })
    ).toHaveAttribute("data-character", "female");
  });

  it("resets restored shell scroll on start, selection, and world phases", async () => {
    const user = userEvent.setup();
    const scrollTo = vi.mocked(window.scrollTo);
    scrollTo.mockClear();
    const originalScrollTop = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollTop"
    );
    const originalScrollLeft = Object.getOwnPropertyDescriptor(
      Element.prototype,
      "scrollLeft"
    );
    const scrollTops = new WeakMap<Element, number>();
    const scrollLefts = new WeakMap<Element, number>();
    Object.defineProperty(Element.prototype, "scrollTop", {
      configurable: true,
      get() {
        return scrollTops.get(this) ?? 176;
      },
      set(value: number) {
        scrollTops.set(this, value);
      }
    });
    Object.defineProperty(Element.prototype, "scrollLeft", {
      configurable: true,
      get() {
        return scrollLefts.get(this) ?? 72;
      },
      set(value: number) {
        scrollLefts.set(this, value);
      }
    });

    try {
      const { container } = render(<ExperienceShell locale="en" />);
      const shell = container.querySelector<HTMLElement>(".start-screen");
      expect(shell).not.toBeNull();
      if (!shell) return;

      await waitFor(() => {
        expect(shell.scrollTop).toBe(0);
        expect(shell.scrollLeft).toBe(0);
        expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
      });

      shell.scrollTop = 176;
      shell.scrollLeft = 72;
      scrollTo.mockClear();
      await user.click(screen.getByRole("button", { name: "START" }));
      await waitFor(() => {
        expect(shell.scrollTop).toBe(0);
        expect(shell.scrollLeft).toBe(0);
        expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
      });

      shell.scrollTop = 176;
      shell.scrollLeft = 72;
      scrollTo.mockClear();
      await user.click(
        screen.getByRole("button", { name: "Select male character" })
      );
      await user.click(screen.getByRole("button", { name: "ENTER WORLD" }));
      await waitFor(() => {
        expect(shell.scrollTop).toBe(0);
        expect(shell.scrollLeft).toBe(0);
        expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
      });
    } finally {
      if (originalScrollTop) {
        Object.defineProperty(
          Element.prototype,
          "scrollTop",
          originalScrollTop
        );
      }
      if (originalScrollLeft) {
        Object.defineProperty(
          Element.prototype,
          "scrollLeft",
          originalScrollLeft
        );
      }
    }
  });

  it("restores the last character choice on a return visit", async () => {
    const user = userEvent.setup();
    const firstVisit = render(<ExperienceShell locale="en" />);

    await user.click(screen.getByRole("button", { name: "START" }));
    await user.click(
      screen.getByRole("button", { name: "Select female character" })
    );
    firstVisit.unmount();

    render(<ExperienceShell locale="en" />);
    await user.click(screen.getByRole("button", { name: "START" }));

    expect(
      screen.getByRole("button", { name: "Select female character" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "ENTER WORLD" })
    ).toBeEnabled();
  });

  it("shows the Korean welcome screen in Korean", () => {
    render(<ExperienceShell locale="ko" />);

    expect(
      screen.getByRole("heading", {
        name: "제 세계에 오신 것을 환영합니다!"
      })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "시작" })).toBeEnabled();
    expect(
      screen.getByRole("navigation", { name: "언어 선택" })
    ).toBeVisible();
  });

  it("switches language in place and synchronizes the document metadata", async () => {
    const user = userEvent.setup();
    const description = document.createElement("meta");
    description.name = "description";
    description.content =
      "Explore the scenes and interactions of a Japanese festival-inspired 3D world.";
    document.head.append(description);
    render(<ExperienceShell locale="en" />);

    await user.click(screen.getByRole("button", { name: "日本語" }));

    expect(
      screen.getByRole("heading", { name: "私の世界へようこそ！" })
    ).toBeVisible();
    expect(document.documentElement).toHaveAttribute("lang", "ja");
    expect(window.location.pathname).toBe("/ja");
    expect(
      screen.getByRole("navigation", { name: "言語を選択" })
    ).toBeVisible();
    expect(document.title).toBe(
      "Ewan's World · インタラクティブ3Dポートフォリオ"
    );
    expect(description).toHaveAttribute(
      "content",
      "日本のお祭りをイメージした3Dワールドの風景と操作を楽しめます。"
    );

    await user.click(screen.getByRole("button", { name: "한국어" }));

    expect(document.documentElement).toHaveAttribute("lang", "ko");
    expect(window.location.pathname).toBe("/ko");
    expect(document.title).toBe("Ewan's World · 인터랙티브 3D 포트폴리오");
    expect(description).toHaveAttribute(
      "content",
      "일본 축제에서 영감을 받은 3D 월드의 장면과 상호작용을 탐험해 보세요."
    );

    description.remove();
  });

  it("keeps world controls and activates the 3D camera drag area", async () => {
    const user = userEvent.setup();
    render(<ExperienceShell locale="en" />);

    await user.click(screen.getByRole("button", { name: "START" }));
    await user.click(
      screen.getByRole("button", { name: "Select male character" })
    );
    await user.click(screen.getByRole("button", { name: "ENTER WORLD" }));

    expect(
      screen.getByRole("region", { name: "Mobile movement control" })
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Jump" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open world map (M key)" })
    ).toBeVisible();
    expect(
      screen.getByLabelText("Camera drag area")
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Reset camera" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Portfolio landmarks" })
    ).toBeVisible();
  });

  it("locks interaction movement for 30 frames and resumes the unchanged world", async () => {
    const user = userEvent.setup();
    render(<ExperienceShell locale="en" />);
    await user.click(screen.getByRole("button", { name: "START" }));
    await user.click(
      screen.getByRole("button", { name: "Select male character" })
    );
    await user.click(screen.getByRole("button", { name: "ENTER WORLD" }));

    const canvas = worldCanvasHarness.current;
    expect(canvas).not.toBeNull();
    const target = WORLD_INTERACTION_TARGETS[0];
    const nearTarget = {
      ...createInitialWorldNavigationSnapshot(),
      revision: 42,
      position: Object.freeze([-32, 0, 0]),
      heading: Object.freeze([1, 0, 0]),
      nearInteractionId: target.id
    } satisfies WorldNavigationSnapshot;
    act(() => canvas!.onNavigationChange(nearTarget));

    const world = screen.getByTestId("world-view");
    const position = world.getAttribute("data-player-position");
    const heading = world.getAttribute("data-player-heading");
    const revision = world.getAttribute("data-navigation-revision");
    const prompt = screen.getByRole("button", { name: "Interact" });
    await user.click(prompt);
    expect(worldCanvasHarness.current?.inputLocked).toBe(true);
    expect(
      screen.getByRole("dialog", { name: "Festival World Design" })
    ).toBeVisible();

    act(() => {
      for (let frame = 0; frame < 30; frame += 1) {
        worldCanvasHarness.current!.onNavigationChange(nearTarget);
      }
    });
    await user.keyboard("{Escape}");

    expect(worldCanvasHarness.current?.inputLocked).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Interact" })).toHaveFocus();
    expect(world).toHaveAttribute("data-player-position", position);
    expect(world).toHaveAttribute("data-player-heading", heading);
    expect(world).toHaveAttribute("data-navigation-revision", revision);
  });

  it("uses Escape for the full map only and never queues gameplay", async () => {
    const user = userEvent.setup();
    render(<ExperienceShell locale="en" />);
    await user.click(screen.getByRole("button", { name: "START" }));
    await user.click(
      screen.getByRole("button", { name: "Select male character" })
    );
    await user.click(screen.getByRole("button", { name: "ENTER WORLD" }));

    await user.click(
      screen.getByRole("button", { name: "Open world map (M key)" })
    );
    expect(screen.getByRole("dialog", { name: "World map" })).toBeVisible();
    await user.keyboard("{Escape}");

    expect(
      screen.queryByRole("dialog", { name: "World map" })
    ).not.toBeInTheDocument();
    expect(
      worldCanvasHarness.current?.input.consumeInteraction()
    ).toBe(false);
  });

  it("lets visitors open and close the same readable portfolio in the world fallback", async () => {
    const user = userEvent.setup();
    render(<ExperienceShell locale="en" />);

    await user.click(screen.getByRole("button", { name: "START" }));
    await user.click(
      screen.getByRole("button", { name: "Select female character" })
    );
    await user.click(screen.getByRole("button", { name: "ENTER WORLD" }));

    expect(
      screen.getByRole("navigation", { name: "Portfolio landmarks" })
    ).toBeVisible();
    const worldDesignLandmark = screen.getByRole("button", {
      name: "Festival World Design"
    });
    await user.click(worldDesignLandmark);

    expect(
      screen.getByRole("dialog", { name: "Festival World Design" })
    ).toBeVisible();
    expect(
      screen.getByText(/airport bus, Tokyo, gyukatsu, sakura, and hanabi/i)
    ).toBeVisible();

    const closePortfolio = screen.getByRole("button", {
      name: "Close portfolio"
    });
    expect(closePortfolio).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(worldDesignLandmark).toHaveFocus();
  });

  it("jumps on Space even when a world button holds the focus, and presses it on Enter", async () => {
    const user = userEvent.setup();
    render(<ExperienceShell locale="en" />);

    await user.click(screen.getByRole("button", { name: "START" }));
    await user.click(
      screen.getByRole("button", { name: "Select male character" })
    );
    await user.click(screen.getByRole("button", { name: "ENTER WORLD" }));

    const landmark = screen.getByRole("button", {
      name: "Festival World Design"
    });
    landmark.focus();
    await user.keyboard(" ");

    // Space jumps. A focused button answering it is what made walking along
    // and jumping re-open the map the visitor had just closed.
    expect(
      screen.queryByRole("dialog", { name: "Festival World Design" })
    ).toBeNull();

    await user.keyboard("{Enter}");
    expect(
      screen.getByRole("dialog", { name: "Festival World Design" })
    ).toBeVisible();
  });
});

describe("Korean line breaking", () => {
  const styles = () =>
    readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

  it("carries the locale on the element that wraps every screen", () => {
    const { container } = render(<ExperienceShell locale="ko" />);

    // Every headline and label, start screen and world alike, lives inside
    // this one element, so one locale-scoped wrapping rule reaches all of them.
    const shell = container.querySelector(".start-screen");
    expect(shell).toHaveAttribute("data-locale", "ko");
    expect(shell?.querySelector(".start-card h1")).toBeInTheDocument();
  });

  it("keeps Korean words whole and never lets one overflow its box", () => {
    // 제 세계에 오 / 신 것을 환 / 영합니다 was the observed wrap: Korean has
    // spaces between words, but the default rule breaks between any two
    // syllables. keep-all wraps on the spaces instead; break-word stays as the
    // escape hatch for a word wider than its own line, so keeping words whole
    // can never push text outside the card.
    expect(styles()).toMatch(
      /\.start-screen\[data-locale="ko"\]\s*\{[^}]*word-break:\s*keep-all/
    );
    expect(styles()).toMatch(
      /\.start-screen\[data-locale="ko"\]\s*\{[^}]*overflow-wrap:\s*break-word/
    );
  });

  it("leaves Japanese alone, where keep-all would make a sentence unbreakable", () => {
    expect(styles()).not.toMatch(
      /\[data-locale="ja"\][^{]*\{[^}]*word-break:\s*keep-all/
    );
  });

  it("keeps the shared 12ch headline measure, which already fits the longest Korean word", () => {
    // Measured in Chromium against the display font: the widest word,
    // 환영합니다!, is 506px at the 1440px headline size while 12ch resolves to
    // 835px, and 212px against 350px at the smallest headline size. The shared
    // measure already clears the longest whole word at every width, so it
    // needs no locale override and has none.
    expect(styles()).toMatch(/\.start-card h1\s*\{[^}]*max-width:\s*12ch/);
    expect(styles()).not.toMatch(
      /\[data-locale="ko"\][^{]*\.start-card h1\s*\{[^}]*max-width/
    );
  });
});
