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
Tests       41 passed (41)
```

The full unit suite passed:

```text
Test Files  96 passed (96)
Tests       808 passed (808)
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
- Expected GLB and SVG network failures are checked before the throwing
  `useGLTF` or `useLoader` path mounts. One shared resource fetches each
  original URL once, caches its Blob/object URL through the Three loading
  manager, reports a sanitized error, and leaves the boundary in place for
  unexpected parse or render failures.
- Eager player and NPC GLTF preloads are removed. Successful player, shared NPC,
  and SVG loader reads use the cached object URL rather than issuing a second
  original request.
- Failed resources are evicted for a later remount, and an unsettled request is
  aborted when its final subscriber unmounts.
- Every NPC interaction target is unavailable while its resource is pending,
  becomes available only after fetch success, and returns to unavailable if
  parsing or rendering then fails.
- The Hanabi SVG is local geometry only. Its nested Suspense and asset boundary
  can remain pending indefinitely while the world reaches ready.

## Adaptive Quality and Telemetry

- Ordered cumulative stages:
  `full → pixel-ratio → shadows → fireworks → far-decorations → npc-secondary-motion`.
- The legacy `SceneQualityLevel` return/getter API remains type-compatible.
- Terrain, roads, collision, landmarks, and player remain enabled at every
  stage.
- Far shoreline rocks and Gyukatsu outdoor details are culled against the live
  player position and `farDecorationDistance`; crosswalk roads and signature
  landmarks remain outside that culling.
- The active `RpgWorldEffects` frame loop applies firework trail duration to
  actual point-group visibility and material opacity, so a reduced trail
  expires before the full trail.
- Degraded shadows use the smaller of the device quality ceiling and `1024`;
  low quality therefore remains shadow-free.
- One immutable settings object flows through Canvas, scene, and consumers.
- Scene runtime input remains locked until `worldReady`. Movement pressed
  during loading cannot advance position or revision, and the stable input
  controller is cleared immediately before unlock.
- Quality changes do not key or remount Canvas or the scene root.
- Performance samples publish only after two seconds and are frozen.
- Frame recording uses refs rather than per-frame React state.
- DOM `data-quality-stage` and `window.__RPG_PERFORMANCE__.qualityStage`
  synchronize immediately while preserving the latest sample.
- Unsupported and remounted worlds clear stale global telemetry.

## Browser Evidence

Command:

```text
npx playwright test tests/e2e/world.spec.ts --config=playwright.config.ts --grep "falls back|WebGL|requests each original RPG asset"
```

Result:

```text
6 passed (42.4s)
```

- Player GLB `404`: fallback visible and movement continues.
- Yukata NPC GLB `404`: only its diagnostic ID is unavailable, movement
  continues, and an unaffected interaction opens.
- Optional Hanabi SVG `404`: decoration is omitted, fireworks remain enabled,
  movement continues, and interaction remains available.
- WebGL unavailable: no renderer is constructed; restoring support and clicking
  the now-clickable retry reaches ready.
- Baseline WebGL world still reports one Canvas, runtime, and scene mount.
- A successful female-player world requested the selected player GLB, each
  shared NPC GLB, and the optional SVG exactly once. The unselected male GLB
  was not requested.
- Each injected player, NPC, and SVG `404` route also observed exactly one
  original request.
- All three injected asset `404` cases recorded zero `pageerror` events.
  Captured error reporting contained no asset filename, HTTP URL, or stack
  frame.

## Review Correction Evidence

RED command:

```text
npx vitest run tests/rpg-asset-boundary.test.tsx tests/scene-quality.test.ts tests/world-effects.test.ts tests/rpg-town-details.test.ts
```

Initial result:

```text
Test Files  4 failed (4)
Tests       4 failed | 30 passed (34)
```

- The availability gate and decoration visibility behavior did not exist.
- Low-quality degraded shadows incorrectly increased from `0` to `1024`.
- A `0.5` second firework trail remained visible when it should have expired.

Corrected focused behavior:

```text
npx vitest run tests/rpg-asset-boundary.test.tsx tests/scene-quality.test.ts tests/world-effects.test.ts tests/rpg-town-details.test.ts tests/world-interaction.test.ts

Test Files  5 passed (5)
Tests       44 passed (44)
```

Final required verification:

```text
Task 9 focused: 13 files, 55 tests passed
Full unit: 96 files, 808 tests passed
Typecheck with --incremental false: passed
Targeted ESLint: 0 errors, 0 warnings
git diff --check: passed
Task 9 404/WebGL/request-count browser grep: 6 passed (42.4s)
```

## Asset Resource and Active Effect Evidence

RED command:

```text
npx vitest run tests/rpg-world-effects.test.ts tests/rpg-asset-boundary.test.tsx tests/rpg-npc-crowd-lifecycle.test.tsx
```

Initial result:

```text
Test Files  3 failed (3)
Tests       5 failed | 4 passed (9)
```

- The active world-effects module had no trail lifetime frame.
- Successful preflight did not map the original URL to a cached object URL.
- Failed entries remained cached, pending requests had no abort signal, and
  NPC interactions stayed available while fetches were pending.

Corrected focused behavior:

```text
Test Files  3 passed (3)
Tests       9 passed (9)
```

- A `0.5` second active trail is hidden with opacity `0` while the `1.15`
  second trail remains visible at the same elapsed frame.
- The loader resolves one fetched Blob through an object URL after exactly one
  original request.
- A failed mount can fetch successfully on remount.
- Unmounting the final subscriber aborts its pending request.
- Deferred NPC fetches keep interaction targets disabled until success.

## Static Verification

- `npm run typecheck -- --incremental false` → exit `0`
- targeted ESLint over Task 9 source and tests → `0` errors, `0` warnings
- `git diff --check` → exit `0`
- SVG audit found no external asset URL, script, font, or metadata. The only URL
  is the required SVG XML namespace.

## Remaining Risk

- The Task 9 browser grep proves failure isolation, zero page errors, and
  interaction continuity. Exact Hanabi-child target selection remains covered
  deterministically at unit level. Direct route-driven Hanabi-child browser
  interaction is an accepted Task 10 validation gap.
