import { afterEach, describe, expect, it } from "vitest";
import { attachWorldKeyboardInput } from "../app/world/KeyboardInput";
import { createInputController } from "../app/world/InputController";

const attached: Array<() => void> = [];

afterEach(() => {
  attached.splice(0).forEach((cleanup) => cleanup());
  document.body.replaceChildren();
});

describe("world keyboard input", () => {
  it("always releases a held direction even when keyup comes from a button", () => {
    const input = createInputController();
    attached.push(attachWorldKeyboardInput(input));

    document.body.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowUp",
        bubbles: true,
        cancelable: true
      })
    );
    expect(input.getMovement()).toEqual({ x: 0, y: 1 });

    const button = document.createElement("button");
    document.body.append(button);
    button.dispatchEvent(
      new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true })
    );

    expect(input.getMovement()).toEqual({ x: 0, y: 0 });
  });

  it("does not turn keys inside a guide surface into world movement", () => {
    const input = createInputController();
    attached.push(attachWorldKeyboardInput(input));
    const guide = document.createElement("aside");
    guide.dataset.worldInputBlock = "true";
    const heading = document.createElement("h2");
    guide.append(heading);
    document.body.append(guide);

    heading.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true
      })
    );

    expect(input.getMovement()).toEqual({ x: 0, y: 0 });
  });
});

describe("keyboard after a control has been pressed", () => {
  it("keeps walking available once a HUD button holds the focus", () => {
    const input = createInputController();
    const detach = attachWorldKeyboardInput(input);
    const button = document.createElement("button");
    document.body.append(button);

    // Pressing a control leaves it focused, and every later key event is
    // aimed at it. Walking has to survive that.
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
    );
    expect(input.getMovement()).toEqual({ x: 0, y: 1 });

    // Space still belongs to the focused button so it can be activated.
    button.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true })
    );
    expect(input.consumeJump()).toBe(false);

    button.remove();
    detach();
  });

  it("still leaves the whole keyboard to a text field", () => {
    const input = createInputController();
    const detach = attachWorldKeyboardInput(input);
    const field = document.createElement("input");
    document.body.append(field);

    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
    );
    expect(input.getMovement()).toEqual({ x: 0, y: 0 });

    field.remove();
    detach();
  });
});
