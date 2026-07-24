# Task 9 Implementation Report

## Scope

- Implemented capability rejection, retry recovery, asset failure isolation,
  optional decoration handling, adaptive quality, performance telemetry, and
  interaction continuity.
- Preserved Task 1–8 unit contracts.
- Kept the approved Task 10 validation-only commit unchanged.
- Left the user-owned untracked `docs/assets/` directory untouched.

## Firework Continuity

- The active world-effects frame loop and unit tests share
  `calculateActiveRpgFireworkFrameInto`.
- That active seam delegates base-shell timing to the canonical
  `RpgHanabiLayout` calculation. It therefore preserves pre-delay wrapping,
  cycle wrapping, and persistent bursts.
- High, medium, and low render budgets retain at least four visible canonical
  base bursts at every 50 ms sample from `0` through `30` seconds. The targeted
  low-quality `0.95` second and high-quality `23.2` second samples also retain
  at least four.
- `trailSeconds` controls a separate afterglow layer and cannot hide the
  canonical base shell.
- High quality has two shell layers, so it renders the afterglow overlay.
  Medium and low have one shell layer, so the overlay is omitted while the
  canonical base shell remains visible. This does not claim that low-quality
  `trailSeconds` renders a second layer.
- Invalid cycle and trail values use finite fallbacks and cannot produce
  `NaN` frame values.

## Interaction Continuity

- `approachAirportInteraction` first clicks `Return to start`, then polls until
  telemetry confirms the exact spawn position.
- It holds only `ArrowUp`, stops as soon as an airport-zone interaction prompt
  becomes visible, and releases the key in `finally`.
- It has no fixed sleep, lateral steering, or intentional overshoot.
- NPC `404` and optional Hanabi decoration `404` each preserved movement and an
  unaffected airport interaction for three consecutive runs.

## TDD Evidence

### RED

Command:

```text
npx vitest run tests/rpg-world-effects.test.ts
```

Initial result:

```text
Test Files  1 failed (1)
Tests       6 failed (6)
```

- Active scheduling exposed no visible bursts at time zero for any quality
  level.
- The low `0.95` second and high `23.2` second continuity samples failed.
- Persistent active frames did not match the canonical calculation.
- The independent active trail calculation did not exist.

### GREEN

Command:

```text
npx vitest run tests/rpg-world-effects.test.ts tests/rpg-hanabi-layout.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests       21 passed (21)
```

## Failure Injection and Asset Isolation

- Unsupported WebGL rejects before renderer or scene construction and can
  recover after support becomes available.
- Player GLB failure renders the fallback character while movement continues.
- A failed NPC is removed without disabling unrelated interactions.
- Optional Hanabi SVG failure omits only that decoration; fireworks, movement,
  and interactions remain available.
- Original asset URLs are fetched once and successful Blob responses are read
  through cached object URLs.
- Failed resources are evicted for a later remount, and an unsettled request is
  aborted when its final subscriber unmounts.
- Asset diagnostics remain sanitized and injected `404` cases produce no
  `pageerror` events.

## Adaptive Quality and Telemetry

- Ordered cumulative stages remain
  `full → pixel-ratio → shadows → fireworks → far-decorations → npc-secondary-motion`.
- Terrain, roads, collision, landmarks, and the player remain enabled at every
  stage.
- Scene input remains locked until readiness, and the stable input controller
  is cleared immediately before unlock.
- Quality changes do not key or remount Canvas or the scene root.
- Performance samples publish after two seconds and frame recording uses refs.
- DOM quality state and `window.__RPG_PERFORMANCE__` remain synchronized.

## Browser Evidence

Task 9 failure-isolation and recovery command:

```text
npx playwright test tests/e2e/world.spec.ts --config=playwright.config.ts --grep "falls back|WebGL|requests each original RPG asset"
```

Result:

```text
6 passed (37.8s)
```

Final-code interaction repetition command:

```text
npx playwright test tests/e2e/world.spec.ts --config=playwright.config.ts --grep "only one failed NPC|optional Hanabi decoration" --repeat-each=3 --workers=1
```

Result:

```text
6 passed (1.1m)
```

- The repeated command is three consecutive passes of both continuity
  scenarios in one worker.
- The complete browser grep covers player fallback, NPC isolation, optional
  decoration isolation, request counts, WebGL recovery, and the baseline world.

## Final Verification

```text
Active and canonical firework suites: 2 files, 21 tests passed
Task 9 focused unit suites: 14 files, 75 tests passed
Full unit suite: 96 files, 814 tests passed
Typecheck with --incremental false: passed
Targeted ESLint: passed
git diff --check: passed
Task 9 browser grep: 6 passed (37.8s)
NPC and decoration continuity, 3 consecutive runs each: 6 passed (1.1m)
```

## Remaining Risk

- Successful Blob object URLs are intentionally retained for the page lifetime.
  This has a low, accepted memory-retention cost. Revoking them earlier is
  unsafe because Three loaders may still read the cached URL asynchronously.
- Direct route-driven Hanabi-child browser interaction remains the accepted
  Task 10 validation gap; deterministic target selection is covered at unit
  level.
