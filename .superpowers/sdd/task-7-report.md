# Task 7 implementation report

## Scope

- Activated one persistent `SeamlessWorldCanvas` from `WorldView`.
- Kept `FlatWorldCanvas` out of the active import path.
- Added one caller-owned `RpgBusRuntime` and one `WorldRuntime`.
- Kept mutable chase-camera state inside `WorldRuntime`.
- Added navigation publishing, runtime diagnostics, adaptive quality monitoring, camera collision, occlusion, screen safety, and loading readiness.
- Did not add interaction handling or recovery/performance redesign behavior.

## TDD evidence

### RED

Command:

```text
npm run test:unit -- --run tests/world-navigation-publisher.test.ts tests/world-mini-map-integration.test.tsx tests/start-experience.test.tsx tests/rpg-camera-collision.test.ts
```

Result: exit 1.

- `WorldNavigationPublisher` could not be resolved.
- `WorldView` still imported `FlatWorldCanvas`.
- The camera drag area was absent.
- 35 assertions passed before the three expected Task 7 failures stopped the slice.

### GREEN

The same command passed:

```text
Test Files  4 passed (4)
Tests       39 passed (39)
```

The complete active Task 7 slice also passed:

```text
Test Files  9 passed (9)
Tests       83 passed (83)
```

## Architecture ownership checks

- `WorldView` has one dynamic import: `import("./SeamlessWorldCanvas")`.
- `WorldView` has no active `FlatWorldCanvas` import.
- `SeamlessWorldCanvas` creates one `RpgBusRuntime` and one `WorldRuntime`.
- `WorldRuntime.getCameraState()` returns the runtime-owned mutable camera state; reset mutates that same object.
- Frame priorities are bus `-2.5`, camera input `-2`, runtime `-1`, and camera placement `0`.
- The navigation ref, publisher callback, React navigation state, guide, mini-map, world map, and telemetry all receive the same snapshot object.
- Camera and runtime telemetry use `RefObject<HTMLDivElement | null>` and contain no DOM selector lookup.
- Dynamic camera obstacles refill a caller-owned array and return the same array.
- Camera collision keeps the last finite safe position, enforces the `2.6` minimum boom, and publishes camera safety and diagnostics every frame.
- Landmark and NPC occlusion use the `250ms` wait, `100ms` fade, and `200ms` restore state machine.
- `InstancedMesh` materials are never changed by camera occlusion.
- Runtime diagnostics expose one canvas mount, one runtime creation, and one scene mount.
- The loading state clears only after two frames rendered inside the resolved Suspense boundary.
- Mobile joystick running begins at magnitude `0.85`.
- `vitest.config.ts` is byte-identical to base SHA `b71c0b5cf6166e67b1b629653a8d097ae25f85f4`; SHA-256 is `119b029457062125874304161295f08e4a86f975381c45e69fc16fa9d3a06022`.
- `ACTIVE_UNIT_EXCLUDES` remains empty, so the active camera suites stay included.

## Verification

- Focused Task 7 unit slice: 83 passed.
- TypeScript: `npm run typecheck -- --incremental false` passed.
- Targeted ESLint: passed with no findings.
- Diff whitespace check: `git diff --check` passed.
- Local production WebGL smoke:
  `npx playwright test tests/e2e/world.spec.ts --config=playwright.config.ts --grep "enters the seamless WebGL world"`
  passed 1 test.
- Full unit suite: 89 files and 764 tests passed.

## Remaining risks

- The Task 7 browser gate covers world entry, readiness, camera diagnostics, minimum boom, safety duration, and mount counts on Chromium.
- Canvas2D-specific broad browser assertions remain outside this task and are scheduled for the later active E2E migration.
