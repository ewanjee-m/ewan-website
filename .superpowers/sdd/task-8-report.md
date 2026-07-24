# Task 8 implementation report

## Scope

- Implementation base: `b586fc5aaff269d7a912251c816f8c31589ec03f`
- Branch: `agent/visual-fidelity-map-alignment`
- Added one canonical interaction catalog with five entrances and seven authored NPC targets.
- Kept the existing single `SeamlessWorldCanvas`, runtime, and camera ownership.
- Did not add recovery, performance, or Task 9 behavior.

## RED evidence

Command:

```text
npm run test:unit -- --run tests/world-interaction.test.ts tests/portfolio-guide.test.tsx
```

Observed before implementation:

```text
FAIL tests/world-interaction.test.ts
Failed to resolve import "../app/world/WorldInteraction"

FAIL tests/portfolio-guide.test.tsx
Unable to find an accessible element with the role "dialog"

Test Files 2 failed (2)
Tests 1 failed | 2 passed (3)
```

The failures proved that neither the world interaction contract nor controlled
portfolio opening existed.

## Implemented behavior

- `WORLD_INTERACTION_TARGETS` contains five entrance targets and the seven NPCs
  authored by `RPG_LANDMARKS`.
- `findWorldInteractionTarget` applies target radius, an inclusive 60-degree
  facing cone, and unavailable-target filtering.
- `WorldRuntime` owns `nearInteractionId`; UI components do not calculate
  distance or facing.
- `RpgSceneRuntime` zeros movement while locked, pauses gameplay advancement,
  suppresses reset, jump, and interaction consumption, and leaves the other
  independent camera and effect frame subscribers mounted and running.
- Unlocked interaction is consumed after runtime advancement and maps the
  current target to one portfolio entry request.
- The on-screen prompt calls the same `WorldView` request handler used by the
  runtime input path.
- `PortfolioGuide` handles each controlled request once, acknowledges it once,
  emits open and close state, uses one close path for button and Escape, and
  restores focus to the requesting element.
- `WorldView` resets input on interaction open, locks the canvas runtime,
  suppresses conflicting map and touch controls, and keeps full-map Escape
  map-only.

## State-invariance checks

- Thirty locked runtime frame callbacks:
  - movement intent remained `{ x: 0, y: 0, runRequested: false }`;
  - gameplay runtime advancement did not run;
  - jump and interaction queues were not consumed;
  - position, heading, and navigation revision remained unchanged.
- World component flow:
  - opened the mapped portfolio from a nearby target;
  - remained locked across 30 published frames;
  - closed with Escape;
  - restored the prompt;
  - preserved position, heading, and revision.
- Full-map Escape removed only the map and left the gameplay interaction queue
  empty.

## GREEN evidence

Focused Task 8 tests:

```text
npm run test:unit -- --run tests/world-interaction.test.ts tests/portfolio-guide.test.tsx tests/start-experience.test.tsx tests/messages.test.ts
Test Files 4 passed (4)
Tests 26 passed (26)
```

Runtime, navigation publisher, input, and map tests:

```text
npm run test:unit -- --run tests/world-runtime.test.ts tests/world-navigation-publisher.test.ts tests/input-controller.test.ts tests/keyboard-input.test.ts tests/world-mini-map-integration.test.tsx tests/rpg-region-presentation.test.ts
Test Files 6 passed (6)
Tests 45 passed (45)
```

Full unit suite:

```text
npm run test:unit
Test Files 90 passed (90)
Tests 776 passed (776)
```

Static verification:

```text
npm run typecheck -- --incremental false
tsc --noEmit --incremental false

npx eslint app/world/WorldInteraction.ts app/world/WorldInteractionPrompt.tsx app/world/WorldNavigationState.ts app/world/WorldRuntime.ts app/world/RpgSceneRuntime.tsx app/world/SeamlessWorldCanvas.tsx app/world/PortfolioGuide.tsx app/world/WorldView.tsx app/i18n/messages.ts tests/world-interaction.test.ts tests/portfolio-guide.test.tsx tests/start-experience.test.tsx tests/messages.test.ts
exit 0

git diff --check
exit 0
```
