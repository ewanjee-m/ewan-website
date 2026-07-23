import { describe, expect, it } from "vitest";
import { createInputController } from "../app/world/InputController";

describe("player input", () => {
  it("maps arrow keys to movement and clears input on release or focus loss", () => {
    const input = createInputController();

    input.pressKey("ArrowUp");
    input.pressKey("ArrowRight");
    expect(input.getMovement()).toEqual({ x: 1, y: 1 });

    input.releaseKey("ArrowUp");
    expect(input.getMovement()).toEqual({ x: 1, y: 0 });

    input.reset();
    expect(input.getMovement()).toEqual({ x: 0, y: 0 });
  });

  it("uses the mobile drag as the same movement intent and stops on release", () => {
    const input = createInputController();

    input.setTouchMovement({ x: -0.5, y: 0.75 });
    expect(input.getMovement()).toEqual({ x: -0.5, y: 0.75 });

    input.setTouchMovement(null);
    expect(input.getMovement()).toEqual({ x: 0, y: 0 });
  });

  it("queues one jump for a Space press", () => {
    const input = createInputController();

    input.pressKey(" ");
    expect(input.consumeJump()).toBe(true);
    expect(input.consumeJump()).toBe(false);

    input.releaseKey(" ");
    input.pressKey(" ");
    expect(input.consumeJump()).toBe(true);
  });

  it("queues the same jump from the mobile control", () => {
    const input = createInputController();

    input.queueJump();

    expect(input.consumeJump()).toBe(true);
    expect(input.consumeJump()).toBe(false);
  });

  it("queues one return to the safe starting point", () => {
    const input = createInputController();

    input.queueReset();

    expect(input.consumeReset()).toBe(true);
    expect(input.consumeReset()).toBe(false);
  });

  it("queues one fast travel destination from the world map", () => {
    const input = createInputController();

    expect(input.consumeTravel()).toBeNull();

    input.queueTravel("sakura");
    expect(input.consumeTravel()).toBe("sakura");
    expect(input.consumeTravel()).toBeNull();
  });

  it("keeps only the latest queued fast travel destination", () => {
    const input = createInputController();

    input.queueTravel("tokyo");
    input.queueTravel("hanabi");

    expect(input.consumeTravel()).toBe("hanabi");
  });

  it("drops a queued fast travel destination on focus loss", () => {
    const input = createInputController();

    input.queueTravel("gyukatsu");
    input.reset();

    expect(input.consumeTravel()).toBeNull();
  });

  it("reuses a caller-owned movement intent during the animation loop", () => {
    const input = createInputController();
    const movement = { x: 0, y: 0 };
    input.pressKey("ArrowLeft");

    expect(input.readMovement(movement)).toBe(movement);
    expect(movement).toEqual({ x: -1, y: 0 });
  });
});
