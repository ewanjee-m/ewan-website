import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getMessages, locales } from "../app/i18n/messages";
import { WorldErrorBoundary } from "../app/world/WorldErrorBoundary";

function BrokenScene(): never {
  throw new Error("World scene failed");
}

describe("world error boundary", () => {
  it("keeps a readable fallback available when the world scene throws", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <WorldErrorBoundary
        resetKey={0}
        onRetry={vi.fn()}
        fallback={() => <p>Readable portfolio fallback</p>}
      >
        <BrokenScene />
      </WorldErrorBoundary>
    );

    expect(screen.getByText("Readable portfolio fallback")).toBeVisible();
    expect(consoleError).toHaveBeenCalledWith(
      "World render failed",
      expect.any(Error),
      expect.any(Object)
    );
    consoleError.mockRestore();
  });

  it("retries an error boundary with a new reset key", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const view = render(
      <WorldErrorBoundary
        resetKey={0}
        onRetry={onRetry}
        fallback={({ retry }) => <button onClick={retry}>Retry</button>}
      >
        <BrokenScene />
      </WorldErrorBoundary>
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    view.rerender(
      <WorldErrorBoundary
        resetKey={0}
        onRetry={onRetry}
        fallback={({ retry }) => <button onClick={retry}>Retry</button>}
      >
        <p>Healthy world</p>
      </WorldErrorBoundary>
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    view.rerender(
      <WorldErrorBoundary
        resetKey={1}
        onRetry={onRetry}
        fallback={({ retry }) => <button onClick={retry}>Retry</button>}
      >
        <p>Healthy world</p>
      </WorldErrorBoundary>
    );
    expect(screen.getByText("Healthy world")).toBeVisible();
    consoleError.mockRestore();
  });

  it("uses renderer-neutral fallback copy in every locale", () => {
    for (const locale of locales) {
      const fallback = getMessages(locale).worldFallback;
      expect(fallback).not.toMatch(/3D|WebGL/i);
      expect(fallback.length).toBeGreaterThan(0);
    }
  });
});
