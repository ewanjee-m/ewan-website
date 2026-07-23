import { render, screen } from "@testing-library/react";
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
      <WorldErrorBoundary fallback={<p>Readable portfolio fallback</p>}>
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

  it("uses renderer-neutral fallback copy in every locale", () => {
    for (const locale of locales) {
      const fallback = getMessages(locale).worldFallback;
      expect(fallback).not.toMatch(/3D|WebGL/i);
      expect(fallback.length).toBeGreaterThan(0);
    }
  });
});
