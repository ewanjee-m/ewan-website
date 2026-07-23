import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { GuidePanel, type ActiveGuideRecommendation } from "../app/guide/GuidePanel";
import { getMessages, type Locale } from "../app/i18n/messages";

const navigation = {
  position: [-22, 0, 0] as [number, number, number],
  surfaceNormal: [0, 1, 0] as [number, number, number],
  heading: [1, 0, 0] as [number, number, number],
  currentZoneId: "airport" as const
};

function Harness({ locale }: { locale: Locale }) {
  const [active, setActive] = useState<ActiveGuideRecommendation | null>(null);
  return (
    <>
      <GuidePanel
        locale={locale}
        labels={getMessages(locale).guide}
        navigation={navigation}
        activeRecommendation={active}
        onActiveRecommendationChange={setActive}
      />
      <output data-testid="active-destination">
        {active?.destinationId ?? "none"}
      </output>
    </>
  );
}

function mockRecommendation() {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        recommendation: {
          destinationId: "hanabi",
          themeId: "celebration",
          basis: "fortune"
        }
      }),
      { status: 200 }
    )
  );
}

describe("guide panel", () => {
  afterEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("opens a non-modal choice panel with both documented sources", async () => {
    const user = userEvent.setup();
    render(<Harness locale="en" />);

    await user.click(screen.getByRole("button", { name: "Directions" }));

    expect(
      screen.getByRole("heading", {
        name: "What should guide today's recommendation?"
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Current weather" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today's fortune" })).toBeInTheDocument();
  });

  it("moves focus into the panel and restores it after Escape closes the panel", async () => {
    const user = userEvent.setup();
    render(<Harness locale="en" />);

    const opener = screen.getByRole("button", { name: "Directions" });
    await user.click(opener);

    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("complementary", { name: "Directions" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Directions" })).toHaveFocus();
  });

  it("moves focus to the active request and result view", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)))
    );
    render(<Harness locale="en" />);

    await user.click(screen.getByRole("button", { name: "Directions" }));
    await user.click(screen.getByRole("button", { name: "Today's fortune" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    resolveFetch?.(
      new Response(
        JSON.stringify({
          recommendation: {
            destinationId: "hanabi",
            themeId: "celebration",
            basis: "fortune"
          }
        }),
        { status: 200 }
      )
    );

    expect(
      await screen.findByRole("heading", { name: /^Recommendation ready/ })
    ).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Choose again" }));
    expect(
      screen.getByRole("heading", {
        name: "What should guide today's recommendation?"
      })
    ).toHaveFocus();
  });

  it("returns focus to the preserved result when a retry fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              recommendation: {
                destinationId: "hanabi",
                themeId: "celebration",
                basis: "fortune"
              }
            }),
            { status: 200 }
          )
        )
        .mockResolvedValueOnce(new Response("busy", { status: 503 }))
    );
    render(<Harness locale="en" />);

    await user.click(screen.getByRole("button", { name: "Directions" }));
    await user.click(screen.getByRole("button", { name: "Today's fortune" }));
    await screen.findByText("Fireworks festival");
    await user.click(screen.getByRole("button", { name: "Choose again" }));
    await user.click(screen.getByRole("button", { name: "Current weather" }));

    expect(
      await screen.findByText(
        "We couldn't load new guidance, so your current recommendation remains active."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /^Recommendation ready/ })
    ).toHaveFocus();
  });

  it("uses one persistent status region instead of announcing moving directions repeatedly", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", mockRecommendation());
    render(<Harness locale="en" />);

    const status = screen.getByTestId("guide-status");
    expect(status).toHaveAttribute("role", "status");

    await user.click(screen.getByRole("button", { name: "Directions" }));
    await user.click(screen.getByRole("button", { name: "Today's fortune" }));

    await waitFor(() =>
      expect(status).toHaveTextContent(
        "Recommendation ready. Fireworks festival. Straight ahead"
      )
    );
    expect(document.querySelector(".guide-result")).not.toHaveAttribute(
      "aria-live"
    );
    expect(document.querySelector(".guide-omamori")).not.toHaveAttribute(
      "aria-live"
    );
  });

  it("activates only the returned IDs and shows reviewed copy", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", mockRecommendation());
    render(<Harness locale="en" />);

    await user.click(screen.getByRole("button", { name: "Directions" }));
    await user.click(screen.getByRole("button", { name: "Today's fortune" }));

    expect(await screen.findByText("Fireworks festival")).toBeInTheDocument();
    expect(screen.getByText("Enjoy even the small reasons to celebrate.")).toBeInTheDocument();
    expect(screen.getByTestId("active-destination")).toHaveTextContent("hanabi");
  });

  it("uses an allowed local fallback when the first request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("busy", { status: 503 })));
    render(<Harness locale="en" />);

    await user.click(screen.getByRole("button", { name: "Directions" }));
    await user.click(screen.getByRole("button", { name: "Today's fortune" }));

    expect(
      await screen.findByText(
        "We couldn't load guidance, so we're showing a default recommendation."
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId("active-destination")).not.toHaveTextContent("none");
    expect(screen.getByTestId("active-destination")).not.toHaveTextContent("airport");
  });

  it("does not describe an unavailable weather fallback as current Tokyo weather", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<Harness locale="en" />);

    await user.click(screen.getByRole("button", { name: "Directions" }));
    await user.click(screen.getByRole("button", { name: "Current weather" }));

    expect(await screen.findByText("Weather unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Using current Tokyo weather")).not.toBeInTheDocument();
  });

  it("labels cached weather as previous data instead of current weather", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "ewan-world-tokyo-weather",
      JSON.stringify({
        status: "live",
        weatherCode: 2,
        temperatureC: 24.5,
        observedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        intervalSeconds: 900
      })
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<Harness locale="en" />);

    await user.click(screen.getByRole("button", { name: "Directions" }));
    await user.click(screen.getByRole("button", { name: "Current weather" }));

    expect(await screen.findByText(/Previous weather data · Cloudy/)).toBeInTheDocument();
    expect(screen.queryByText("Using current Tokyo weather")).not.toBeInTheDocument();
  });

  it("re-renders a stored ID in Japanese without another network request", async () => {
    const user = userEvent.setup();
    const fetcher = mockRecommendation();
    vi.stubGlobal("fetch", fetcher);
    const view = render(<Harness locale="en" />);

    await user.click(screen.getByRole("button", { name: "Directions" }));
    await user.click(screen.getByRole("button", { name: "Today's fortune" }));
    expect(await screen.findByText("Fireworks festival")).toBeInTheDocument();

    view.rerender(<Harness locale="ja" />);

    expect(screen.getByText("花火大会")).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ignores a late response after cancellation", async () => {
    const user = userEvent.setup();
    let resolveFetch: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () => new Promise<Response>((resolve) => (resolveFetch = resolve))
      )
    );
    render(<Harness locale="en" />);

    await user.click(screen.getByRole("button", { name: "Directions" }));
    await user.click(screen.getByRole("button", { name: "Today's fortune" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    resolveFetch?.(
      new Response(
        JSON.stringify({
          recommendation: {
            destinationId: "hanabi",
            themeId: "celebration",
            basis: "fortune"
          }
        }),
        { status: 200 }
      )
    );

    await waitFor(() =>
      expect(screen.getByTestId("active-destination")).toHaveTextContent("none")
    );
    expect(
      screen.getByText("Request canceled.", { selector: ".guide-notice" })
    ).toBeInTheDocument();
  });
});
