import { describe, expect, it } from "vitest";
import { createInputController } from "../app/world/InputController";

describe("RPG input controller", () => {
  it("supports WASD, arrows, run, jump, reset, and interaction", () => {
    const input = createInputController();
    const movement = { x: 0, y: 0, runRequested: false };

    input.pressKey("w");
    input.pressKey("d");
    input.pressKey("Shift");
    expect(input.readMovement(movement)).toEqual({
      x: Math.SQRT1_2,
      y: Math.SQRT1_2,
      runRequested: true
    });

    input.pressKey(" ");
    input.pressKey("e");
    input.pressKey("r");
    expect(input.consumeJump()).toBe(true);
    expect(input.consumeInteraction()).toBe(true);
    expect(input.consumeReset()).toBe(true);
    expect(input).not.toHaveProperty("queueTravel");
    expect(input).not.toHaveProperty("consumeTravel");
  });

  it("accumulates and clears one camera drag frame", () => {
    const input = createInputController();
    const drag = { deltaX: 0, deltaY: 0, pointerKind: "mouse" as const };

    input.addCameraDrag(10, -4, "mouse");
    input.addCameraDrag(2, 1, "mouse");
    expect(input.consumeCameraDrag(drag)).toEqual({
      deltaX: 12,
      deltaY: -3,
      pointerKind: "mouse"
    });
    expect(input.consumeCameraDrag(drag)).toEqual({
      deltaX: 0,
      deltaY: 0,
      pointerKind: "mouse"
    });
  });

  it("uses the mobile drag as the same movement intent and stops on release", () => {
    const input = createInputController();
    const movement = { x: 0, y: 0, runRequested: false };

    input.setTouchMovement({ x: -0.5, y: 0.75, runRequested: true });
    expect(input.readMovement(movement)).toEqual({
      x: -0.5,
      y: 0.75,
      runRequested: true
    });

    input.setTouchMovement(null);
    expect(input.readMovement(movement)).toEqual({
      x: 0,
      y: 0,
      runRequested: false
    });
  });

  it("reuses a caller-owned movement intent during the animation loop", () => {
    const input = createInputController();
    const movement = { x: 0, y: 0, runRequested: false };
    input.pressKey("ArrowLeft");

    expect(input.readMovement(movement)).toBe(movement);
    expect(movement).toEqual({ x: -1, y: 0, runRequested: false });
  });

  it("releases letter movement regardless of keyup casing", () => {
    const input = createInputController();
    const movement = { x: 0, y: 0, runRequested: false };

    input.pressKey("w");
    input.releaseKey("W");

    expect(input.readMovement(movement)).toEqual({
      x: 0,
      y: 0,
      runRequested: false
    });
  });

  it("does not requeue held Space and rearms after release", () => {
    const input = createInputController();

    input.pressKey(" ");
    expect(input.consumeJump()).toBe(true);
    expect(input.consumeJump()).toBe(false);

    input.pressKey(" ");
    expect(input.consumeJump()).toBe(false);

    input.releaseKey(" ");
    input.pressKey(" ");
    expect(input.consumeJump()).toBe(true);
    expect(input.consumeJump()).toBe(false);
  });

  it("consumes queued mobile actions once", () => {
    const input = createInputController();

    input.queueJump();
    input.queueReset();
    input.queueInteraction();

    expect(input.consumeJump()).toBe(true);
    expect(input.consumeJump()).toBe(false);
    expect(input.consumeReset()).toBe(true);
    expect(input.consumeReset()).toBe(false);
    expect(input.consumeInteraction()).toBe(true);
    expect(input.consumeInteraction()).toBe(false);
  });

  it("reset clears held, touch, discrete, and camera input", () => {
    const input = createInputController();
    const movement = { x: 0, y: 0, runRequested: false };
    const drag = { deltaX: 0, deltaY: 0, pointerKind: "mouse" as const };

    input.pressKey("w");
    input.pressKey("Shift");
    input.setTouchMovement({ x: 0.5, y: -0.25, runRequested: true });
    input.pressKey(" ");
    input.pressKey("e");
    input.pressKey("r");
    input.addCameraDrag(4, -2, "touch");

    input.reset();

    expect(input.readMovement(movement)).toEqual({
      x: 0,
      y: 0,
      runRequested: false
    });
    expect(input.consumeJump()).toBe(false);
    expect(input.consumeReset()).toBe(false);
    expect(input.consumeInteraction()).toBe(false);
    expect(input.consumeCameraDrag(drag)).toMatchObject({
      deltaX: 0,
      deltaY: 0
    });

    input.pressKey(" ");
    expect(input.consumeJump()).toBe(true);
  });
});
