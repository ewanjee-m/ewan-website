import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorldErrorBoundary } from "../app/world/WorldErrorBoundary";

function BrokenScene(): never {
  throw new Error("WebGL scene failed");
}

describe("world error boundary", () => {
  it("keeps a readable fallback available when the 3D scene throws", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <WorldErrorBoundary fallback={<p>Readable portfolio fallback</p>}>
        <BrokenScene />
      </WorldErrorBoundary>
    );

    expect(screen.getByText("Readable portfolio fallback")).toBeVisible();
    consoleError.mockRestore();
  });
});
