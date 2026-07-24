import type { WorldInteractionTarget } from "./WorldInteraction";

export function WorldInteractionPrompt({
  target,
  label,
  onInteract
}: {
  target: WorldInteractionTarget | null;
  label: string;
  onInteract: () => void;
}) {
  if (!target) return null;
  return (
    <button
      className="world-interaction-prompt"
      type="button"
      data-target-id={target.id}
      onClick={onInteract}
    >
      {label}
    </button>
  );
}
