import type { createInputController } from "./InputController";

type KeyboardInputController = Pick<
  ReturnType<typeof createInputController>,
  "pressKey" | "releaseKey" | "reset"
>;

const TEXT_ENTRY_SELECTOR =
  "input, select, textarea, [contenteditable='true'], [data-world-input-block='true']";
const ACTIVATION_SELECTOR = "button, a, [role='button'], [role='link']";

// Typing and menus take the whole keyboard. A button keeps the focus ring
// after it is pressed, though, and blocking everything for it left a visitor
// who had touched any control unable to walk again without reaching for the
// mouse. A focused button only needs the key that presses it.
function blocksWorldInput(target: EventTarget | null, key: string) {
  if (!(target instanceof Element)) {
    return false;
  }
  if (target.closest(TEXT_ENTRY_SELECTOR)) {
    return true;
  }
  return key === " " && Boolean(target.closest(ACTIVATION_SELECTOR));
}

export function attachWorldKeyboardInput(input: KeyboardInputController) {
  const onKeyDown = (event: KeyboardEvent) => {
    if (blocksWorldInput(event.target, event.key)) {
      return;
    }
    if (event.key.startsWith("Arrow") || event.key === " ") {
      event.preventDefault();
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
