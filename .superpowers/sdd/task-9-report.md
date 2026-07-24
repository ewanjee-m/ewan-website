# Task 9 Implementation Report

## Scope

- Implemented loading, capability rejection, retry recovery, asset isolation,
  optional decoration handling, adaptive quality, and performance telemetry.
- Preserved Task 1–8 unit contracts.
- Did not modify Task 10 validation configuration or documentation.
- Left the user-owned untracked `docs/assets/` directory untouched.

## TDD Evidence

### RED

Command:

```text
npm run test:unit -- --run tests/world-capability.test.ts tests/world-bootstrap.test.ts tests/world-performance-sampler.test.ts tests/world-error-boundary.test.tsx tests/seamless-world-canvas-recovery.test.tsx tests/rpg-asset-boundary.test.tsx tests/adaptive-quality.test.ts tests/scene-quality.test.ts tests/world-interaction.test.ts
```

Initial result: exit `1`.

- Five suites could not resolve the new capability, bootstrap, sampler, and
  asset-boundary modules.
- Adaptive quality had no `getStage`.
- Scene quality had no cumulative settings or immutable core-layer contract.
- The world boundary had no retry/reset API.
- Runtime interaction availability could not be changed.

### GREEN

The same focused command passed:

```text
Test Files  9 passed (9)
Tests       35 passed (35)
```

The full unit suite passed:

```text
Test Files  95 passed (95)
Tests       795 passed (795)
```

## Failure Injection and Recovery

- Unsupported WebGL calls the capability dependency once and constructs zero
  runtime or scene objects.
- A runtime bootstrap failure reaches the real `WorldErrorBoundary`.
- A scene-render failure injected through `SceneComponent` reaches the same
  boundary.
- Both injected failure paths record exactly:
  - failed mount: Canvas `1`, runtime attempt `1`
  - after one retry: Canvas `2`, runtime attempt `2`
  - no third construction
- Error and unhandled-rejection listeners remained empty.
- The boundary remains failed when the reset key is unchanged and clears only
  when the parent increments the key.
- One stable input controller is reset before loading and again immediately
  before readiness.

## Asset Isolation

- Player GLB failure renders a foot-anchored capsule/sphere/front-marker
  character and continues applying movement and facing poses.
- NPC failure immediately removes only the failed NPC obstacle and interaction
  target. The passive registration effect is guarded against re-adding it.
- Repeated availability changes are idempotent and do not add revisions.
- A fresh runtime starts with the default available target set.
- With only `npc-hanabi-yukata` unavailable, deterministic target selection
  still returns `npc-hanabi-child`.
- Asset logs contain only `{ assetId, errorName }`.
- The Hanabi SVG is local geometry only. Its nested Suspense and asset boundary
  can remain pending indefinitely while the world reaches ready.

## Adaptive Quality and Telemetry

- Ordered cumulative stages:
  `full → pixel-ratio → shadows → fireworks → far-decorations → npc-secondary-motion`.
- The legacy `SceneQualityLevel` return/getter API remains type-compatible.
- Terrain, roads, collision, landmarks, and player remain enabled at every
  stage.
- One immutable settings object flows through Canvas, scene, and consumers.
- Quality changes do not key or remount Canvas or the scene root.
- Performance samples publish only after two seconds and are frozen.
- Frame recording uses refs rather than per-frame React state.
- DOM `data-quality-stage` and `window.__RPG_PERFORMANCE__.qualityStage`
  synchronize immediately while preserving the latest sample.
- Unsupported and remounted worlds clear stale global telemetry.

## Browser Evidence

Command:

```text
npx playwright test tests/e2e/world.spec.ts --config=playwright.config.ts --grep "falls back|WebGL"
```

Result:

```text
5 passed (41.1s)
```

- Player GLB `404`: fallback visible and movement continues.
- Yukata NPC GLB `404`: only its diagnostic ID is unavailable, movement
  continues, and an unaffected interaction opens.
- Optional Hanabi SVG `404`: decoration is omitted, fireworks remain enabled,
  movement continues, and interaction remains available.
- WebGL unavailable: no renderer is constructed; restoring support and clicking
  the now-clickable retry reaches ready.
- Baseline WebGL world still reports one Canvas, runtime, and scene mount.

## Static Verification

- `npm run typecheck -- --incremental false` → exit `0`
- targeted ESLint over Task 9 source and tests → `0` errors, `0` warnings
- `git diff --check` → exit `0`
- SVG audit found no external asset URL, script, font, or metadata. The only URL
  is the required SVG XML namespace.

## Remaining Risk

- The Task 9 browser grep proves failure isolation and interaction continuity,
  while the exact Hanabi-child target selection is covered deterministically at
  unit level. Long canonical-route timing and full route-driven interaction
  validation remain outside this task’s validation migration scope.
