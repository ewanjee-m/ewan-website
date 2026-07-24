import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceShell } from "../app/components/ExperienceShell";

describe("start experience", () => {
  beforeEach(() => {
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
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

  it("keeps Space available for focused world buttons instead of turning it into jump", async () => {
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

    expect(
      screen.getByRole("dialog", { name: "Festival World Design" })
    ).toBeVisible();
  });
});
