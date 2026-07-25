import type { createInputController } from "./InputController";

type KeyboardInputController = Pick<
  ReturnType<typeof createInputController>,
  "pressKey" | "releaseKey" | "reset"
>;

const TEXT_ENTRY_SELECTOR =
  "input, select, textarea, [contenteditable='true'], [data-world-input-block='true']";
const ACTIVATION_SELECTOR = "button, a, [role='button'], [role='link']";
const WORLD_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "w",
  "W",
  "a",
  "A",
  "s",
  "S",
  "d",
  "D",
  "Shift",
  " ",
  "e",
  "E",
  "Enter",
  "r",
  "R"
]);

// Typing and menus take the whole keyboard. A button keeps the focus ring
// after it is pressed, though, and blocking everything for it left a visitor
// who had touched any control unable to walk again without reaching for the
// mouse. A focused button only needs the key that presses it.
//
// Space is the exception. It is the jump key, and closing the map hands focus
// back to the button that opened it, so a visitor walking along and jumping
// re-opened the map instead of leaving the ground. While the world is being
// played the space belongs to the world; Enter still presses the button.
function blocksWorldInput(target: EventTarget | null, key: string) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(TEXT_ENTRY_SELECTOR)) {
    return true;
  }
  return key === "Enter" && Boolean(target.closest(ACTIVATION_SELECTOR));
}

/** A focused button would otherwise answer the jump key by activating. */
function stealsJumpFromTheWorld(target: EventTarget | null, key: string) {
  return (
    key === " " &&
    target instanceof Element &&
    Boolean(target.closest(ACTIVATION_SELECTOR))
  );
}

export function attachWorldKeyboardInput(input: KeyboardInputController) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (blocksWorldInput(event.target, event.key)) {
      return;
    }
    if (WORLD_KEYS.has(event.key)) {
      // Shift keeps its default so held modifiers still reach the browser;
      // everything else is the world's, including a space that a focused
      // button would otherwise turn into a second press of itself.
      if (
        event.key !== "Shift" ||
        stealsJumpFromTheWorld(event.target, event.key)
      ) {
        event.preventDefault();
      }
      input.pressKey(event.key);
    }
  };
  const onKeyUp = (event: KeyboardEvent) => input.releaseKey(event.key);
  const resetInput = () => input.reset();
  const onVisibilityChange = () => {
    if (document.hidden) {
      resetInput();
    }
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", resetInput);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", resetInput);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    input.reset();
  };
}
