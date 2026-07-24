import { describe, expect, it } from "vitest";
import { createWorldBootstrap } from "../app/world/WorldBootstrap";

describe("world bootstrap", () => {
  it("surfaces an injected core bootstrap failure", () => {
    const failure = new Error("injected world model failure");

    expect(() =>
      createWorldBootstrap({
        createRuntime: () => {
          throw failure;
        }
      })
    ).toThrow(failure);
  });
});
