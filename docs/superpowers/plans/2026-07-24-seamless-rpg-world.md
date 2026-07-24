# Seamless RPG World Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공항부터 하나비까지 순간이동 없이 이동하고, 실제 3D 배경과 자유 회전 추적 카메라가 함께 움직이는 연속형 RPG 월드를 공개 URL에 배포한다.

**Architecture:** `RpgWorldModel`을 좌표의 단일 기준으로 유지하고, 순수 `WorldRuntime`이 이동·충돌·지면 높이·탐색 상태를 소유한다. 하나의 React Three Fiber `SeamlessWorldCanvas`가 절차형 지형·건축·대표 장소·GLB 캐릭터·카메라를 조립하며, 미니맵과 전체 지도는 런타임 좌표를 읽기만 한다.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16, React Three Fiber 9.6, Drei 10.7, Three.js 0.185, Vitest 4.1, Playwright 1.61, Vinext, Cloudflare Sites

## Global Constraints

- 런타임 의존성을 추가하지 않는다.
- 활성 월드는 하나의 지속되는 WebGL Canvas이며 지역 전환 시 재생성하지 않는다.
- `RpgWorldModel`의 `[x, z]` 좌표가 장면·충돌·지도·상호작용의 단일 기준이다.
- `FlatWorldCanvas`, `RpgWorldBackdrop`, `RpgReferenceSceneComposition`은 활성 경로에서 사용하지 않는다.
- 지도·안내·상호작용은 캐릭터 위치를 변경할 수 없다. 공개 좌표 변경 동작은 공항 재시작 하나뿐이다.
- 건물 내부와 지역 로딩 화면을 만들지 않는다.
- 보행 가능 고정 경로는 `122.09 world units`, 걷기 `75.8초`, 달리기 `64.3초`, 허용 범위 `±5%`다.
- 카메라 수평 회전은 `360°`, pitch는 `18°~55°`, 자동 복귀 대기는 `0.8초`, 복귀 완료는 `1.2초` 안의 `5°` 이하다.
- 카메라 최소 boom 거리는 `2.6`이다.
- 지도 도착점 오차는 `0.5 CSS px`, 평면 왕복 오차는 `0.1 world units`, 방향 오차는 `2°`, 표시 지연은 `100ms` 이하다.
- 성능 기준은 MacBook Pro `Mac16,7`, Apple M4 Pro `14-core CPU / 20-core GPU`, 메모리 `48GB`에서 측정한다.
- 데스크톱 중앙 평균 `55 FPS`·하위 5% `40 FPS`, 모바일 제한 환경 중앙 평균 `42 FPS`·하위 5% `24 FPS` 이상을 만족한다.
- G005·G007 역사 증거와 `tests/visual/g007-verification.mjs`는 수정하지 않는다.
- 추적되지 않은 `docs/assets/`는 읽을 수 있지만 추가·수정·커밋하지 않는다.
- 구현 커밋은 포크 브랜치 `ewanjee-m/ewan-website:agent/visual-fidelity-map-alignment`와 Draft PR `https://github.com/EwanJee/ewan-website/pull/1`에 계속 푸시한다.

## Plan Publication Gate

Implementation begins only after this plan is reviewed, committed by itself, and pushed to the active Draft PR:

```bash
git add docs/superpowers/plans/2026-07-24-seamless-rpg-world.md
git commit -m "Plan seamless RPG world implementation" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

Verify local `HEAD`, the fork branch SHA, and PR `headRefOid` are identical before Task 1. After publication, the plan is tracked and the only allowed pre-existing untracked path is `docs/assets/`.

---

## File Responsibility Map

### Create

- `app/world/WorldInput.ts` — 키보드·조이스틱·카메라 드래그·상호작용 입력 타입.
- `app/world/WorldNavigationState.ts` — 렌더러 중립 탐색 스냅샷과 초기 상태.
- `app/world/WorldRuntime.ts` — 이동·달리기·충돌·점프·지면·재시작 런타임.
- `app/world/FlatWorldNavigationAdapter.ts` — 구현 중 Canvas 2D가 새 런타임 스냅샷을 읽는 임시 어댑터.
- `app/world/RpgMapTerrain.tsx` — 월드 모델에서 생성한 공용 SVG 지도 지형.
- `app/world/ChaseOrbitCamera.ts` — 카메라 회전·복귀·지역 프로필의 순수 계산.
- `app/world/RpgCameraOcclusion.ts` — 지속 시야 차단의 투명화·복구 시간 상태.
- `app/world/RpgCameraSafety.ts` — 데스크톱·모바일 캐릭터 화면 안전 영역 판정.
- `app/world/WorldCameraInput.tsx` — 데스크톱·모바일 카메라 포인터 입력 영역.
- `app/world/AdaptiveQualityMonitor.tsx` — 프레임 표본을 품질 단계 변경으로 연결.
- `app/world/RpgWorldSurfaces.tsx` — 지면·도로·광장·운하·다리 3D geometry.
- `app/world/RpgSignatureLandmarks.tsx` — 공항·도쿄·규카츠·사쿠라·하나비 대표 장소.
- `app/world/RpgRegionPresentation.ts` — 지역 전이의 색·조명·장식·식생·효과·음량 가중치.
- `app/world/RpgWorldEffects.tsx` — 사쿠라 꽃잎·하나비 효과를 지역 전이와 품질 단계에 연결.
- `app/world/RpgRegionAudio.tsx` — 외부 자산 없이 생성한 지역 ambience의 사용자 제스처 기반 gain 전이.
- `app/world/RpgPlayerActor.tsx` — 런타임 스냅샷을 GLB 플레이어 pose로 반영.
- `app/world/RpgNpcCrowd.tsx` — NPC GLB·순찰 pose·카메라 장애물 연결.
- `app/world/RpgAirportBusActor.tsx` — 하나의 공유 버스 pose를 렌더링·충돌·카메라에 반영.
- `app/world/RpgSceneRuntime.tsx` — 프레임 입력 소비·런타임 advance·UI 스냅샷 발행.
- `app/world/WorldNavigationPublisher.ts` — 10Hz 및 중요 상태 즉시 발행 규칙.
- `app/world/ChaseOrbitCamera3d.tsx` — Three 카메라 배치·충돌·안전 영역 적용.
- `app/world/RpgRuntimeDiagnostics.ts` — Canvas·런타임·장면 누적 생성 횟수.
- `app/world/SeamlessWorldCanvas.tsx` — 단일 Canvas와 장면 조립.
- `app/world/WorldInteraction.ts` — NPC·입구 접근 거리와 시선 판정.
- `app/world/WorldInteractionPrompt.tsx` — 접근 가능한 대상의 상호작용 버튼.
- `app/world/WorldCapability.ts` — WebGL 지원 판정.
- `app/world/WorldBootstrap.ts` — 런타임·핵심 데이터 초기화와 실패 주입 경계.
- `app/world/WorldPerformanceSampler.ts` — FPS·하위 5%·긴 프레임 측정.
- `app/world/WorldPerformanceMonitor.tsx` — 프레임 표본과 DOM/테스트 telemetry 연결.
- `app/world/RpgAssetBoundary.tsx` — 플레이어·NPC별 자산 오류 격리.
- `app/world/RpgFallbackCharacter3d.tsx` — GLB 실패 시 기본 3D 캐릭터.
- `app/world/RpgOptionalDecoration.tsx` — 선택 장식의 독립 Suspense·오류 경계.
- `public/assets/world/hanabi-festival-sign.svg` — 실패 격리 검증용 자체 제작 하나비 표지.
- `tests/fixtures/rpg-canonical-route.ts` — 보행 가능한 고정 이동 경로.
- `tests/fixtures/rpg-visual-camera-fixtures.ts` — 지역·뷰포트별 시각 캡처 카메라.
- `tests/world-runtime.test.ts` — 런타임 이동·지면·충돌·재시작 테스트.
- `tests/world-navigation-publisher.test.ts` — 지도·UI 스냅샷 100ms 발행 상한 테스트.
- `tests/chase-orbit-camera.test.ts` — 카메라 계산 테스트.
- `tests/rpg-camera-occlusion.test.ts` — 지속 시야 차단의 fade/restore 시간 테스트.
- `tests/rpg-camera-safety.test.ts` — 데스크톱·모바일 안전 영역과 보정 테스트.
- `tests/world-camera-input.test.tsx` — UI 차단·오른쪽 55%·단일 터치 카메라 입력 테스트.
- `tests/world-interaction.test.ts` — 접근·시선·입력 잠금 테스트.
- `tests/world-capability.test.ts` — WebGL 지원 판정 테스트.
- `tests/world-bootstrap.test.ts` — 핵심 데이터·런타임 생성 실패 주입 테스트.
- `tests/world-performance-sampler.test.ts` — 성능 통계 테스트.
- `tests/seamless-world-canvas-recovery.test.tsx` — 핵심 런타임·장면 렌더 오류 주입과 재시도 재생성 테스트.
- `tests/rpg-region-presentation.test.ts` — 모든 지역 전이 채널의 smoothstep 테스트.
- `tests/rpg-asset-boundary.test.tsx` — 플레이어·NPC·선택 장식 오류 격리 테스트.
- `tests/e2e/rpg-performance.spec.ts` — 재현 가능한 데스크톱·모바일 제한 성능 측정.
- `playwright.performance.config.ts` — 성능 전용 desktop/mobile production-build 프로젝트.
- `tests/visual/rpg-world-verification.mjs` — 20개 3D 캡처·독립 검토·마감 도구.
- `docs/adr/0004-seamless-rpg-world.md` — 활성 3D 렌더러 결정.

### Modify

- `app/world/InputController.ts:1-86` — 빠른 이동 큐 제거, `WASD`·달리기·상호작용·카메라 입력 추가.
- `app/world/KeyboardInput.ts:1-58` — 데스크톱 키 계약과 UI 입력 차단.
- `app/world/FlatWorldCanvas.tsx` — 구현 중 새 입력·탐색 계약을 읽는 임시 호환 경로.
- `app/world/WorldCanvas.tsx` — 역사 3D Canvas의 입력 타입 import와 caller-owned movement buffer 호환성만 유지.
- `app/world/RpgWorldGeometry.ts:191-213` — 지면 법선 계산 추가.
- `app/world/RpgCameraCollision.ts` — 회전 카메라의 정적·동적 장애물 충돌 계약 확장.
- `app/world/RpgCharacterMotion3d.ts:15-375` — 걷기·달리기 속도 비율을 gait에 반영.
- `app/world/RpgMiniMapProjection.ts:1-240` — 모델 기반 지도 polygon과 역투영.
- `app/world/RpgMiniMap.tsx:1-280` — 이미지 지형을 모델 기반 지형으로 교체.
- `app/world/RpgWorldMap.tsx:1-320` — 빠른 이동 제거, 읽기 전용 장소 강조.
- `app/world/RpgTownScene.tsx:1-61` — `null` 계약을 실제 3D 장면 조립으로 교체.
- `app/world/RpgTownAmbience.tsx:1-28` — 지역 전이 조명·안개·하늘 적용.
- `app/world/RpgTownDetails.tsx` — 지역 가중치와 품질 단계에 따른 장식 표시.
- `app/world/AirportBusVisual.tsx` — 기존 버스 geometry를 공유 pose actor에서도 재사용할 수 있게 분리.
- `app/world/RpgNpcCharacter3d.tsx:1-171` — NPC 시야 차단을 공통 시간 기반 투명화 상태에 연결.
- `app/world/PortfolioGuide.tsx:1-121` — 월드 상호작용에서 특정 항목을 열 수 있는 제어형 계약.
- `app/world/WorldErrorBoundary.tsx:1-36` — 오류 상세·재시도·reset key.
- `app/world/AdaptiveQuality.ts` — 누적 품질 저하 단계와 역사 API 호환.
- `app/world/SceneQuality.ts` — 단계·포인터별 타입화된 장면 품질 설정.
- `app/world/WorldView.tsx:1-310` — `SeamlessWorldCanvas`, 카메라 입력, 읽기 전용 지도, 상호작용 연결.
- `app/i18n/messages.ts:1-470` — 지도·카메라·상호작용 문구.
- `app/globals.css` — 카메라 입력 영역, 상호작용 버튼, 로딩·오류 UI, 3D telemetry 스타일.
- `vitest.config.ts:1-25` — 활성 3D 테스트 제외 해제.
- `playwright.config.ts:1-27` — 64.3초 이동 테스트 timeout.
- `playwright.deployed.config.ts:1-55` — 공개 연속 이동·모바일 검증 timeout.
- `package.json` — 3D 시각·성능 검증 명령.
- `tests/e2e/world.spec.ts` — WebGL 3D 이동·카메라·상호작용.
- `tests/e2e/map-accessibility.spec.ts` — 읽기 전용 지도와 GLB 요청.
- `tests/deployed/public-smoke.spec.ts` — 공개 3D 월드 smoke.
- `tests/public-copy-privacy.test.ts` — 공개 문서의 활성 WebGL 계약.
- `README.md`, `CONTEXT.md`, `docs/handoff.md`, `docs/interface-design.md`, `docs/product-plan.md`, `docs/world-design.md`, `docs/character-design.md` — 활성 3D 계약과 검증 명령.
- `docs/adr/0003-approved-reference-canvas-renderer.md` — 상태를 `superseded`로 변경.

### Delete after behavior is ported

- `tests/flat-world-session.test.ts` — 순간이동·빠른 이동 중심의 활성 테스트를 `tests/world-runtime.test.ts`로 교체.

### Preserve as Historical Inputs

- `app/world/FlatWorldCanvas.tsx` (Tasks 1–2 may update only interim input/snapshot compatibility)
- `app/world/FlatWorldSession.ts`
- `app/world/RpgWorldBackdrop.tsx`
- `app/world/RpgReferenceSceneComposition.tsx`
- `app/world/WorldCanvas.tsx` (Task 1 may update only type imports and the caller-owned movement buffer)
- `app/world/WorldSession.ts`
- `tests/visual/g007-verification.mjs`
- `tests/visual/approved-reference.spec.ts`
- `tests/visual/architecture-attempt.mjs`
- `playwright.visual.config.ts`
- G005·G007 `test-results`와 `.omx/evidence`

---

### Task 1: Replace the Input Contract and Remove Fast Travel

**Files:**
- Create: `app/world/WorldInput.ts`
- Modify: `app/world/InputController.ts:1-86`
- Modify: `app/world/KeyboardInput.ts:1-58`
- Modify: `app/world/FlatWorldCanvas.tsx:112-141`
- Modify: `app/world/WorldCanvas.tsx` (compatibility-only; no renderer behavior change)
- Modify: `app/world/RpgWorldMap.tsx`
- Modify: `app/world/WorldView.tsx`
- Test: `tests/input-controller.test.ts`
- Test: `tests/keyboard-input.test.ts`
- Test: `tests/rpg-world-map-component.test.tsx`
- Test: `tests/rpg-player-renderer-integration.test.ts`
- Test: `tests/world-mini-map-integration.test.tsx`

**Interfaces:**
- Produces: `WorldMovementIntent`, `WorldCameraDragIntent`, `WorldPointerKind`.
- Produces: `createInputController()` with `readMovement`, `consumeCameraDrag`, `consumeJump`, `consumeReset`, `consumeInteraction`.
- Produces: `InputController = ReturnType<typeof createInputController>` from `InputController.ts`; downstream modules do not import this type from `WorldView`.
- Removes: `queueTravel`, `consumeTravel`.
- Preserves: `Escape` as UI dismissal only; it never becomes movement, jump, reset, interaction, or camera input.

- [ ] **Step 1: Write failing input tests**

```ts
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
});
```

- [ ] **Step 2: Run tests and verify the old contract fails**

Run:

```bash
npm run test:unit -- --run tests/input-controller.test.ts tests/keyboard-input.test.ts
```

Expected: FAIL because `WASD`, run, interaction, camera drag methods are absent and travel methods still exist.

- [ ] **Step 3: Add input types and implement the controller**

```ts
// app/world/WorldInput.ts
export type WorldPointerKind = "mouse" | "touch" | "pen";

export interface WorldMovementIntent {
  x: number;
  y: number;
  runRequested: boolean;
}

export interface WorldCameraDragIntent {
  deltaX: number;
  deltaY: number;
  pointerKind: WorldPointerKind;
}
```

```ts
// app/world/InputController.ts
import type {
  WorldCameraDragIntent,
  WorldMovementIntent,
  WorldPointerKind
} from "./WorldInput";

const movementKeys: ReadonlyMap<string, readonly [number, number]> = new Map([
  ["ArrowUp", [0, 1]],
  ["w", [0, 1]],
  ["W", [0, 1]],
  ["ArrowDown", [0, -1]],
  ["s", [0, -1]],
  ["S", [0, -1]],
  ["ArrowLeft", [-1, 0]],
  ["a", [-1, 0]],
  ["A", [-1, 0]],
  ["ArrowRight", [1, 0]],
  ["d", [1, 0]],
  ["D", [1, 0]]
] as const);

export function createInputController() {
  const pressed = new Set<string>();
  let touchMovement: WorldMovementIntent | null = null;
  let jumpHeld = false;
  let jumpQueued = false;
  let resetQueued = false;
  let interactionQueued = false;
  const cameraDrag: WorldCameraDragIntent = {
    deltaX: 0,
    deltaY: 0,
    pointerKind: "mouse"
  };

  return {
    pressKey(key: string) {
      if (movementKeys.has(key) || key === "Shift") pressed.add(key);
      if (key === " " && !jumpHeld) {
        jumpHeld = true;
        jumpQueued = true;
      }
      if (key === "e" || key === "E" || key === "Enter") {
        interactionQueued = true;
      }
      if (key === "r" || key === "R") resetQueued = true;
    },
    releaseKey(key: string) {
      pressed.delete(key);
      if (key === " ") jumpHeld = false;
    },
    reset() {
      pressed.clear();
      touchMovement = null;
      jumpHeld = false;
      jumpQueued = false;
      resetQueued = false;
      interactionQueued = false;
      cameraDrag.deltaX = 0;
      cameraDrag.deltaY = 0;
    },
    setTouchMovement(intent: WorldMovementIntent | null) {
      touchMovement = intent ? { ...intent } : null;
    },
    addCameraDrag(
      deltaX: number,
      deltaY: number,
      pointerKind: WorldPointerKind
    ) {
      if (![deltaX, deltaY].every(Number.isFinite)) return;
      cameraDrag.deltaX += deltaX;
      cameraDrag.deltaY += deltaY;
      cameraDrag.pointerKind = pointerKind;
    },
    readMovement(target: WorldMovementIntent) {
      if (touchMovement) return Object.assign(target, touchMovement);
      let x = 0;
      let y = 0;
      for (const key of pressed) {
        const direction = movementKeys.get(key);
        if (!direction) continue;
        x += direction[0];
        y += direction[1];
      }
      const length = Math.hypot(x, y);
      const scale = length > 1 ? 1 / length : 1;
      target.x = x * scale;
      target.y = y * scale;
      target.runRequested = pressed.has("Shift");
      return target;
    },
    consumeCameraDrag(target: WorldCameraDragIntent) {
      Object.assign(target, cameraDrag);
      cameraDrag.deltaX = 0;
      cameraDrag.deltaY = 0;
      return target;
    },
    queueJump() {
      jumpQueued = true;
    },
    queueReset() {
      resetQueued = true;
    },
    queueInteraction() {
      interactionQueued = true;
    },
    consumeJump() {
      const result = jumpQueued;
      jumpQueued = false;
      return result;
    },
    consumeReset() {
      const result = resetQueued;
      resetQueued = false;
      return result;
    },
    consumeInteraction() {
      const result = interactionQueued;
      interactionQueued = false;
      return result;
    }
  };
}

export type InputController = ReturnType<typeof createInputController>;
```

- [ ] **Step 4: Update keyboard routing and stop the flat renderer from consuming travel**

```ts
// app/world/KeyboardInput.ts key branch
const WORLD_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "w", "W", "a", "A", "s", "S", "d", "D",
  "Shift", " ", "e", "E", "Enter", "r", "R"
]);

if (WORLD_KEYS.has(event.key)) {
  if (event.key !== "Shift") event.preventDefault();
  input.pressKey(event.key);
}
```

Update `blocksWorldInput` so both `Space` and `Enter` stay with a focused button/link:

```ts
return (key === " " || key === "Enter") &&
  Boolean(target.closest(ACTIVATION_SELECTOR));
```

Keep `Escape` out of `WORLD_KEYS`. Preserve `RpgWorldMap`'s existing `Escape` listener and `onClose` callback, and keep `WorldView.closeWorldMap` as the single close path so focus returns to the map trigger. Extend `tests/keyboard-input.test.ts` to dispatch `Escape` and assert `pressKey` is not called. Extend `tests/rpg-world-map-component.test.tsx` so `Escape` closes the read-only map while the supplied navigation position and revision remain unchanged.

In `FlatWorldCanvas.tsx`, delete the `consumeTravel()` and `session.fastTravel()` branch. Keep reset, movement and jump processing so the interim Canvas 2D build remains usable until Task 7.

Both Canvas compatibility files remain typechecked. In `FlatWorldCanvas.tsx`, import `InputController` directly from `./InputController`, keep only `PlayerCharacter` from `./WorldView`, import `WorldMovementIntent`, and use that type for the interim `screenMovement` buffer described below.

`WorldCanvas.tsx` remains history-only but is still included by TypeScript. Split its type imports so `InputController` comes from `./InputController` while `CameraRigController` and `PlayerCharacter` continue to come from `./WorldView`. Import `WorldMovementIntent` and change its caller-owned buffer to:

```ts
const movement = useRef<WorldMovementIntent>({
  x: 0,
  y: 0,
  runRequested: false
});
```

Keep passing that object to the legacy session; structural typing lets the legacy `{ x, y }` consumer ignore `runRequested`. Extend `tests/rpg-player-renderer-integration.test.ts` with source assertions for the direct `InputController` import and the initialized `runRequested: false` buffer. Do not otherwise change the historical renderer.

In the same task, remove `supportsFastTravel`, `travelToDestination`, and `onTravel` from `WorldView` and `RpgWorldMap`. Give `RpgWorldMap` a local `selectedZoneId` initialized from `navigation.currentZoneId`; destination buttons update only that local selection. This keeps every intermediate commit type-correct while Task 3 later replaces the terrain and adds selected-place descriptions.

Update the existing `tests/world-mini-map-integration.test.tsx` fast-travel assertion in this task, rather than leaving the otherwise clean unit suite red until Task 3. After selecting Gyukatsu, assert that the full map stays open and that the shared navigation position and revision remain unchanged. Task 3 may extend the same integration test for model-driven terrain, but it must not be responsible for repairing a failure introduced here.

Change the interim `FlatWorldCanvas` input buffer to `WorldMovementIntent`; its legacy screen/world projection functions read only `x` and `y`, while `runRequested` is ignored until `WorldRuntime` becomes active. In `WorldView.updateMovement`, send:

```ts
const strength = Math.min(1, magnitude);
input.setTouchMovement({
  x: x * scale,
  y: y * scale,
  runRequested: strength >= 0.85
});
```

Update every `getMovement()` test/caller to the caller-owned `readMovement(target)` API in the same task.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm run test:unit -- --run tests/input-controller.test.ts tests/keyboard-input.test.ts tests/rpg-world-map-component.test.tsx tests/rpg-player-renderer-integration.test.ts tests/world-mini-map-integration.test.tsx
```

Expected: PASS with no travel method in the active input controller; `Escape` closes the map and never enters the gameplay input buffer; selecting a destination keeps the read-only map open and leaves navigation unchanged.

- [ ] **Step 6: Commit and push**

```bash
git add app/world/WorldInput.ts app/world/InputController.ts app/world/KeyboardInput.ts app/world/FlatWorldCanvas.tsx app/world/WorldCanvas.tsx app/world/RpgWorldMap.tsx app/world/WorldView.tsx tests/input-controller.test.ts tests/keyboard-input.test.ts tests/rpg-world-map-component.test.tsx tests/rpg-player-renderer-integration.test.ts tests/world-mini-map-integration.test.tsx
git commit -m "Replace world input and remove fast travel" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 2: Build the Renderer-Neutral World Runtime

**Files:**
- Create: `app/world/WorldNavigationState.ts`
- Create: `app/world/WorldRuntime.ts`
- Create: `app/world/FlatWorldNavigationAdapter.ts`
- Create: `tests/fixtures/rpg-canonical-route.ts`
- Create: `tests/world-runtime.test.ts`
- Modify: `app/world/RpgWorldGeometry.ts:191-213`
- Modify: `app/world/FlatWorldCanvas.tsx:292-517`
- Modify: `app/world/RpgMiniMap.tsx:1-20`
- Modify: `app/world/RpgWorldMap.tsx:1-45`
- Modify: `app/world/WorldView.tsx`
- Modify: `tests/rpg-mini-map-component.test.tsx`
- Modify: `tests/rpg-world-map-component.test.tsx`
- Modify: `tests/world-mini-map-integration.test.tsx`
- Modify: `tests/rpg-player-renderer-integration.test.ts`
- Delete: `tests/flat-world-session.test.ts` after its active movement, collision, jump, and reset cases are ported to `tests/world-runtime.test.ts`

**Interfaces:**
- Consumes: `WorldMovementIntent` from Task 1.
- Produces: `WorldNavigationSnapshot`.
- Produces: `createWorldRuntime(options?: WorldRuntimeOptions): WorldRuntime`.
- Produces: `getSurfaceNormal(position): WorldPoint3`.
- Runtime public methods: `setMovement`, `jump`, `reset`, `advance`, `getNavigationSnapshot`.
- `WorldRuntimeOptions.canOccupyDynamic(position)` is the only dynamic-collision injection point; Task 6 supplies the shared moving-bus pose.

- [ ] **Step 1: Add the canonical route fixture and failing tests**

```ts
// tests/fixtures/rpg-canonical-route.ts
export const RPG_CANONICAL_ROUTE = [
  [-26.304534009865293, -2.973191261452298],
  [-27, -2.973191261452298],
  [-29, -2.973191261452298],
  [-29, 20],
  [-8, 20],
  [-7, 20],
  [-7, 9],
  [-8, 9],
  [-8, 0],
  [8, 0],
  [8, -11],
  [9, -20],
  [14.3, -18],
  [18.9, -18],
  [26, -18]
] as const;
```

```ts
// tests/world-runtime.test.ts
import { describe, expect, it } from "vitest";
import { isWalkable } from "../app/world/RpgWorldGeometry";
import {
  WORLD_RUN_SPEED,
  WORLD_WALK_SPEED,
  createWorldRuntime
} from "../app/world/WorldRuntime";
import { RPG_CANONICAL_ROUTE } from "./fixtures/rpg-canonical-route";

describe("WorldRuntime", () => {
  it("keeps the canonical route walkable at 0.1-unit samples", () => {
    let distance = 0;
    for (let index = 1; index < RPG_CANONICAL_ROUTE.length; index += 1) {
      const from = RPG_CANONICAL_ROUTE[index - 1];
      const to = RPG_CANONICAL_ROUTE[index];
      const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
      distance += length;
      const count = Math.ceil(length / 0.1);
      for (let sample = 0; sample <= count; sample += 1) {
        const progress = sample / count;
        expect(isWalkable([
          from[0] + (to[0] - from[0]) * progress,
          from[1] + (to[1] - from[1]) * progress
        ])).toBe(true);
      }
    }
    expect(distance).toBeCloseTo(122.08884600503183, 9);
  });

  function driveCanonicalRoute(runRequested: boolean) {
    const runtime = createWorldRuntime();
    const speed = runRequested ? WORLD_RUN_SPEED : WORLD_WALK_SPEED;
    const framePattern = [1 / 120, 1 / 50, 1 / 30, 1 / 90] as const;
    const visitedZones: string[] = [];
    let elapsedSeconds = 0;
    let frame = 0;

    for (let index = 1; index < RPG_CANONICAL_ROUTE.length; index += 1) {
      const target = RPG_CANONICAL_ROUTE[index];
      for (;;) {
        const current = runtime.getNavigationSnapshot().position;
        const dx = target[0] - current[0];
        const dz = target[1] - current[2];
        const remaining = Math.hypot(dx, dz);
        if (remaining <= 1e-7) break;
        const delta = Math.min(
          framePattern[frame % framePattern.length],
          remaining / speed
        );
        runtime.setMovement({
          x: dx / remaining,
          y: dz / remaining,
          runRequested
        });
        runtime.advance(delta, 0);
        elapsedSeconds += delta;
        frame += 1;
        const zone = runtime.getNavigationSnapshot().currentZoneId;
        if (visitedZones.at(-1) !== zone) visitedZones.push(zone);
      }
    }

    runtime.setMovement({ x: 0, y: 0, runRequested: false });
    return { runtime, elapsedSeconds, visitedZones };
  }

  it.each([
    { runRequested: false, expectedSeconds: 75.8 },
    { runRequested: true, expectedSeconds: 64.3 }
  ])(
    "drives the real runtime through every region in $expectedSeconds seconds ±5%",
    ({ runRequested, expectedSeconds }) => {
      const result = driveCanonicalRoute(runRequested);
      expect(result.elapsedSeconds).toBeGreaterThanOrEqual(
        expectedSeconds * 0.95
      );
      expect(result.elapsedSeconds).toBeLessThanOrEqual(
        expectedSeconds * 1.05
      );
      expect(result.visitedZones).toEqual([
        "airport",
        "tokyo",
        "gyukatsu",
        "sakura",
        "hanabi"
      ]);
      expect(result.runtime.getNavigationSnapshot().position).toEqual([
        26,
        0,
        -18
      ]);
    }
  );

  it("keeps an idle revision stable and exposes no coordinate jump API", () => {
    const runtime = createWorldRuntime();
    const before = runtime.getNavigationSnapshot();
    for (let frame = 0; frame < 30; frame += 1) {
      runtime.advance(1 / 60, 0);
    }
    const after = runtime.getNavigationSnapshot();
    expect(after.position).toEqual(before.position);
    expect(after.revision).toBe(before.revision);
    expect(runtime).not.toHaveProperty("teleport");
    expect(runtime).not.toHaveProperty("fastTravel");
    expect(runtime).not.toHaveProperty("setPosition");
  });
});
```

- [ ] **Step 2: Run the runtime test and verify it fails**

Run:

```bash
npm run test:unit -- --run tests/world-runtime.test.ts
```

Expected: FAIL because `WorldRuntime` and the renderer-neutral snapshot do not exist.

- [ ] **Step 3: Define the navigation snapshot**

```ts
// app/world/WorldNavigationState.ts
import type { DestinationId } from "../guide/GuideContract";
import {
  getNavigationRegionAt,
  getSurfaceHeight,
  getSurfaceNormal,
  type NavigationRegion
} from "./RpgWorldGeometry";
import { RPG_WORLD_SPAWN, type WorldPoint3 } from "./RpgWorldModel";

export type WorldLocomotion = "idle" | "walk" | "run" | "jump";

export interface WorldNavigationSnapshot {
  readonly revision: number;
  readonly position: WorldPoint3;
  readonly surfaceHeight: number;
  readonly jumpOffset: number;
  readonly surfaceNormal: WorldPoint3;
  readonly heading: WorldPoint3;
  readonly moving: boolean;
  readonly grounded: boolean;
  readonly locomotion: WorldLocomotion;
  readonly navigationRegion: NavigationRegion;
  readonly navigationRegionId: string;
  readonly transitionProgress: number | null;
  readonly currentZoneId: DestinationId;
  readonly highlightedZoneIds: readonly DestinationId[];
  readonly nearInteractionId: string | null;
}

export function createInitialWorldNavigationSnapshot(): WorldNavigationSnapshot {
  const navigationRegion = getNavigationRegionAt(RPG_WORLD_SPAWN)!;
  return Object.freeze({
    revision: 0,
    position: Object.freeze([...RPG_WORLD_SPAWN] as WorldPoint3),
    surfaceHeight: getSurfaceHeight(RPG_WORLD_SPAWN),
    jumpOffset: 0,
    surfaceNormal: Object.freeze(getSurfaceNormal(RPG_WORLD_SPAWN)),
    heading: Object.freeze([1, 0, 0] as const),
    moving: false,
    grounded: true,
    locomotion: "idle",
    navigationRegion,
    navigationRegionId: navigationRegion.regionId,
    transitionProgress: null,
    currentZoneId: navigationRegion.displayZoneId,
    highlightedZoneIds: navigationRegion.highlightedZoneIds,
    nearInteractionId: null
  });
}
```

- [ ] **Step 4: Add surface normal calculation**

```ts
// app/world/RpgWorldGeometry.ts
export function getSurfaceNormal(
  position: WorldPoint2 | WorldPoint3,
  epsilon = 0.05
): WorldPoint3 {
  const [x, z] = point2(position);
  const dx =
    getSurfaceHeight([x + epsilon, z]) -
    getSurfaceHeight([x - epsilon, z]);
  const dz =
    getSurfaceHeight([x, z + epsilon]) -
    getSurfaceHeight([x, z - epsilon]);
  const length = Math.hypot(dx, epsilon * 2, dz);
  return [-dx / length, (epsilon * 2) / length, -dz / length];
}
```

- [ ] **Step 5: Implement the runtime**

```ts
// app/world/WorldRuntime.ts
import {
  getNavigationRegionAt,
  getSurfaceHeight,
  getSurfaceNormal,
  isWalkable
} from "./RpgWorldGeometry";
import {
  RPG_WORLD_BOUNDS,
  RPG_WORLD_SPAWN,
  type WorldPoint3
} from "./RpgWorldModel";
import type { WorldMovementIntent } from "./WorldInput";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";

export const WORLD_WALK_SPEED = 1.61;
export const WORLD_RUN_SPEED = 1.9;
const MAX_STEP = 0.25;
const JUMP_VELOCITY = 6;
const GRAVITY = 15;

export function resolveCameraRelativeDirection(
  intent: Readonly<WorldMovementIntent>,
  yaw: number
) {
  const length = Math.hypot(intent.x, intent.y);
  if (length <= 1e-8) return { x: 0, z: 0, strength: 0 };
  const x = intent.x / Math.max(1, length);
  const y = intent.y / Math.max(1, length);
  return {
    x: x * Math.cos(yaw) + y * Math.sin(yaw),
    z: -x * Math.sin(yaw) + y * Math.cos(yaw),
    strength: Math.min(1, length)
  };
}

export interface WorldRuntimeOptions {
  canOccupyDynamic?: (position: readonly [number, number]) => boolean;
}

export function createWorldRuntime(options: WorldRuntimeOptions = {}) {
  const movement: WorldMovementIntent = { x: 0, y: 0, runRequested: false };
  let x = RPG_WORLD_SPAWN[0];
  let z = RPG_WORLD_SPAWN[2];
  let heading: WorldPoint3 = [1, 0, 0];
  let jumpOffset = 0;
  let jumpVelocity = 0;
  let revision = 0;
  const canOccupy = (position: readonly [number, number]) =>
    isWalkable(position) && (options.canOccupyDynamic?.(position) ?? true);

  const snapshot = (): WorldNavigationSnapshot => {
    const region = getNavigationRegionAt([x, z]);
    if (!region) {
      throw new RangeError(`WorldRuntime escaped navigation space at ${x},${z}`);
    }
    const surfaceHeight = getSurfaceHeight([x, z]);
    const grounded = jumpOffset === 0;
    const speed = Math.hypot(movement.x, movement.y);
    return Object.freeze({
      revision,
      position: Object.freeze([x, surfaceHeight + jumpOffset, z] as const),
      surfaceHeight,
      jumpOffset,
      surfaceNormal: Object.freeze(getSurfaceNormal([x, z])),
      heading: Object.freeze(heading),
      moving: speed > 0,
      grounded,
      locomotion: !grounded
        ? "jump"
        : speed === 0
          ? "idle"
          : movement.runRequested
            ? "run"
            : "walk",
      navigationRegion: region,
      navigationRegionId: region.regionId,
      transitionProgress: region.kind === "transition" ? region.progress : null,
      currentZoneId: region.displayZoneId,
      highlightedZoneIds: Object.freeze([...region.highlightedZoneIds]),
      nearInteractionId: null
    });
  };

  return {
    setMovement(next: Readonly<WorldMovementIntent>) {
      const changed =
        next.x !== movement.x ||
        next.y !== movement.y ||
        next.runRequested !== movement.runRequested;
      Object.assign(movement, next);
      if (changed) revision += 1;
    },
    jump() {
      if (jumpOffset === 0) jumpVelocity = JUMP_VELOCITY;
    },
    reset() {
      x = RPG_WORLD_SPAWN[0];
      z = RPG_WORLD_SPAWN[2];
      heading = [1, 0, 0];
      jumpOffset = 0;
      jumpVelocity = 0;
      Object.assign(movement, { x: 0, y: 0, runRequested: false });
      revision += 1;
    },
    advance(deltaSeconds: number, cameraYaw: number) {
      const beforeX = x;
      const beforeZ = z;
      const beforeJumpOffset = jumpOffset;
      const beforeHeadingX = heading[0];
      const beforeHeadingZ = heading[2];
      const delta = Math.min(0.25, Math.max(0, deltaSeconds));
      const direction = resolveCameraRelativeDirection(movement, cameraYaw);
      const speed = movement.runRequested ? WORLD_RUN_SPEED : WORLD_WALK_SPEED;
      const distance = direction.strength * speed * delta;
      const steps = Math.max(1, Math.ceil(distance / MAX_STEP));
      for (let index = 0; index < steps; index += 1) {
        const nextX = Math.min(
          RPG_WORLD_BOUNDS.maximumX,
          Math.max(RPG_WORLD_BOUNDS.minimumX, x + direction.x * distance / steps)
        );
        const nextZ = Math.min(
          RPG_WORLD_BOUNDS.maximumZ,
          Math.max(RPG_WORLD_BOUNDS.minimumZ, z + direction.z * distance / steps)
        );
        if (canOccupy([nextX, nextZ])) {
          x = nextX;
          z = nextZ;
        } else {
          if (canOccupy([nextX, z])) x = nextX;
          if (canOccupy([x, nextZ])) z = nextZ;
        }
      }
      if (direction.strength > 0) {
        heading = [direction.x, 0, direction.z];
      }
      if (jumpVelocity !== 0 || jumpOffset > 0) {
        jumpVelocity -= GRAVITY * delta;
        jumpOffset = Math.max(0, jumpOffset + jumpVelocity * delta);
        if (jumpOffset === 0) jumpVelocity = 0;
      }
      if (
        x !== beforeX ||
        z !== beforeZ ||
        jumpOffset !== beforeJumpOffset ||
        heading[0] !== beforeHeadingX ||
        heading[2] !== beforeHeadingZ
      ) {
        revision += 1;
      }
    },
    getNavigationSnapshot: snapshot
  };
}

export type WorldRuntime = ReturnType<typeof createWorldRuntime>;
```

- [ ] **Step 6: Bridge the interim renderer without porting its drawing loop**

Keep `createFlatWorldSession` private to the historical Canvas 2D renderer until Task 7; do not mix the new runtime into its reference-camera and sprite code. Add `adaptFlatWorldNavigationSnapshot(flat): WorldNavigationSnapshot` in `FlatWorldNavigationAdapter.ts`, deriving:

```ts
const surfaceHeight = getSurfaceHeight(flat.position);
const jumpOffset = Math.max(0, flat.position[1]);
return Object.freeze({
  revision: flat.revision,
  position: Object.freeze([
    flat.position[0],
    surfaceHeight + jumpOffset,
    flat.position[2]
  ] as const),
  surfaceHeight,
  jumpOffset,
  surfaceNormal: getSurfaceNormal(flat.position),
  heading: flat.heading,
  moving: flat.moving,
  grounded: flat.grounded,
  locomotion: !flat.grounded
    ? "jump"
    : flat.moving
      ? "walk"
      : "idle",
  navigationRegion: flat.navigationRegion,
  navigationRegionId: flat.navigationRegionId,
  transitionProgress: flat.transitionProgress,
  currentZoneId: flat.currentZoneId,
  highlightedZoneIds: flat.highlightedZoneIds,
  nearInteractionId: null
});
```

`FlatWorldCanvas` adapts only its outgoing `onNavigationChange` value. `WorldView`, `RpgMiniMap`, and `RpgWorldMap` consume `WorldNavigationSnapshot` and initialize with `createInitialWorldNavigationSnapshot`. Task 7 then swaps the renderer without changing any UI consumer type.

Update the three map-component test helpers in this task as well. They must stop passing `FlatWorldNavigationSnapshot` directly: construct `WorldNavigationSnapshot` values with `createInitialWorldNavigationSnapshot()` plus a region derived from `getNavigationRegionAt(position)`, or pass the interim session value through `adaptFlatWorldNavigationSnapshot`. No test may use a cast to hide a snapshot-shape mismatch.

Port the diagonal normalization, boundary, substep collision, jump, reset, and caller-visible snapshot assertions from `tests/flat-world-session.test.ts` into `tests/world-runtime.test.ts`, then delete `tests/flat-world-session.test.ts`. Do not copy its teleport or `fastTravel` cases: the active runtime test explicitly proves that `teleport`, `fastTravel`, and external `setPosition` do not exist.

- [ ] **Step 7: Run runtime, geometry, and interim renderer tests**

Run:

```bash
npm run test:unit -- --run tests/world-runtime.test.ts tests/rpg-world-geometry.test.ts tests/rpg-player-renderer-integration.test.ts tests/rpg-mini-map-component.test.tsx tests/rpg-world-map-component.test.tsx tests/world-mini-map-integration.test.tsx
```

Expected: PASS; route samples are walkable, bridge feet use surface height, and the active runtime has no coordinate jump API.

- [ ] **Step 8: Commit and push**

```bash
git add app/world/WorldNavigationState.ts app/world/WorldRuntime.ts app/world/FlatWorldNavigationAdapter.ts app/world/RpgWorldGeometry.ts app/world/FlatWorldCanvas.tsx app/world/RpgMiniMap.tsx app/world/RpgWorldMap.tsx app/world/WorldView.tsx tests/fixtures/rpg-canonical-route.ts tests/world-runtime.test.ts tests/flat-world-session.test.ts tests/rpg-player-renderer-integration.test.ts tests/rpg-mini-map-component.test.tsx tests/rpg-world-map-component.test.tsx tests/world-mini-map-integration.test.tsx
git commit -m "Add the continuous RPG world runtime" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 3: Generate a Read-Only Map from World Coordinates

**Files:**
- Create: `app/world/RpgMapTerrain.tsx`
- Modify: `app/world/RpgMiniMapProjection.ts:1-240`
- Modify: `app/world/RpgMiniMap.tsx:1-280`
- Modify: `app/world/RpgWorldMap.tsx:1-320`
- Modify: `app/world/WorldView.tsx:40-310`
- Modify: `app/i18n/messages.ts`
- Test: `tests/rpg-mini-map.test.ts`
- Test: `tests/rpg-mini-map-component.test.tsx`
- Test: `tests/rpg-world-map-component.test.tsx`
- Test: `tests/world-mini-map-integration.test.tsx`
- Test: `tests/rpg-reference-registration.test.ts`
- Test: `tests/rpg-world-transform.test.ts`
- Test: `tests/messages.test.ts`
- Test: `tests/e2e/map-accessibility.spec.ts`
- Test: `tests/e2e/world.spec.ts`

**Interfaces:**
- Consumes: `WorldNavigationSnapshot`.
- Produces: `projectRpgReferenceMapPoint`, `unprojectRpgReferenceMapPoint`, `projectRpgWorldPolygon`.
- Produces: `<RpgMapTerrain />`.
- `RpgWorldMap` no longer accepts `onTravel`.

- [ ] **Step 1: Replace travel expectations with read-only map tests**

```tsx
it("selects a place without moving the player", async () => {
  const user = userEvent.setup();
  const navigation = navigationAt(RPG_WORLD_SPAWN, [1, 0, 0]);
  const before = navigation.position.join(",");
  render(
    <RpgWorldMap
      labels={labels}
      navigation={navigation}
      onClose={vi.fn()}
    />
  );

  await user.click(screen.getByRole("button", { name: "Inspect: Hanabi" }));
  expect(screen.getByTestId("world-map-selected-description"))
    .toHaveTextContent(labels.destinationDescriptions.hanabi);
  expect(navigation.position.join(",")).toBe(before);
});

it("round-trips walkable map points within 0.1 world units", () => {
  const samples: Array<readonly [number, number]> = [];
  for (let index = 1; index < RPG_CANONICAL_ROUTE.length; index += 1) {
    const from = RPG_CANONICAL_ROUTE[index - 1];
    const to = RPG_CANONICAL_ROUTE[index];
    const count = Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 0.1);
    for (let sample = 0; sample <= count; sample += 1) {
      const progress = sample / count;
      samples.push([
        from[0] + (to[0] - from[0]) * progress,
        from[1] + (to[1] - from[1]) * progress
      ]);
    }
  }
  for (let x = RPG_WORLD_BOUNDS.minimumX; x <= RPG_WORLD_BOUNDS.maximumX; x += 0.5) {
    for (let z = RPG_WORLD_BOUNDS.minimumZ; z <= RPG_WORLD_BOUNDS.maximumZ; z += 0.5) {
      if (isWalkable([x, z])) samples.push([x, z]);
    }
  }
  for (const [x, z] of samples) {
    const pixel = projectRpgReferenceMapPoint([x, 0, z]);
    const world = unprojectRpgReferenceMapPoint([pixel.x, pixel.y]);
    expect(world, `${x},${z}`).not.toBeNull();
    expect(Math.hypot(world![0] - x, world![2] - z), `${x},${z}`)
      .toBeLessThanOrEqual(0.1);
  }
});

it("keeps all five 1817x866 arrival anchors within 0.5 CSS px", () => {
  for (const arrival of RPG_WORLD_ARRIVALS) {
    const projected = projectRpgReferenceMapPoint(arrival.position);
    const expected = RPG_REFERENCE_MAP_GOLDEN.nodes[arrival.zoneId];
    expect(
      Math.hypot(projected.x - expected[0], projected.y - expected[1]),
      arrival.zoneId
    ).toBeLessThanOrEqual(0.5);
  }
});

it("keeps the rendered heading within 2 degrees of the registered direction", () => {
  for (const arrival of RPG_WORLD_ARRIVALS) {
    const heading = [arrival.heading[0], 0, arrival.heading[1]] as const;
    const origin = projectWorldToReference(arrival.position)!;
    const tip = projectWorldToReference([
      arrival.position[0] + heading[0] * 0.25,
      arrival.position[1],
      arrival.position[2] + heading[2] * 0.25
    ])!;
    const expected =
      Math.atan2(tip.pixel[1] - origin.pixel[1], tip.pixel[0] - origin.pixel[0]) *
      180 / Math.PI;
    const actual = projectRpgReferenceMapHeadingRotation(
      arrival.position,
      heading
    );
    const error = Math.abs(((actual - expected + 540) % 360) - 180);
    expect(error, arrival.zoneId).toBeLessThanOrEqual(2);
  }
});

it("keeps runtime position and revision fixed for 500ms after map selection", async () => {
  vi.useFakeTimers();
  try {
    const runtime = createWorldRuntime();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <RpgWorldMap
        labels={labels}
        navigation={runtime.getNavigationSnapshot()}
        onClose={vi.fn()}
      />
    );
    const before = runtime.getNavigationSnapshot();
    await user.click(screen.getByRole("button", { name: "Inspect: Hanabi" }));
    for (let frame = 0; frame < 30; frame += 1) {
      runtime.advance(1 / 60, 0);
      await vi.advanceTimersByTimeAsync(1000 / 60);
    }
    const after = runtime.getNavigationSnapshot();
    expect(after.position).toEqual(before.position);
    expect(after.revision).toBe(before.revision);
  } finally {
    vi.useRealTimers();
  }
});

it("rejects a polygon outside the registered map terrain", () => {
  expect(() =>
    projectRpgWorldPolygon([
      [Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER],
      [Number.MAX_SAFE_INTEGER - 1, 0, Number.MAX_SAFE_INTEGER],
      [Number.MAX_SAFE_INTEGER, 0, Number.MAX_SAFE_INTEGER - 1]
    ])
  ).toThrow(RangeError);
});
```

Update the active map E2E assertions in this task so no committed intermediate state retains the removed image/fast-travel contract. `tests/e2e/map-accessibility.spec.ts` and `tests/e2e/world.spec.ts` must assert `data-map-layer="model-terrain"`, no SVG `<image>`, `Inspect` controls, a still-open dialog after selection, changed selected-place copy, and unchanged player position/navigation revision.

- [ ] **Step 2: Run map tests and verify they fail**

Run:

```bash
npm run test:unit -- --run tests/rpg-mini-map.test.ts tests/rpg-world-map-component.test.tsx tests/world-mini-map-integration.test.tsx tests/rpg-reference-registration.test.ts tests/rpg-world-transform.test.ts tests/messages.test.ts
```

Expected: FAIL because inverse projection and model-driven terrain do not exist and the fixed image is still the terrain layer.

- [ ] **Step 3: Add inverse projection and model polygon projection**

```ts
// app/world/RpgMiniMapProjection.ts
import {
  projectWorldToReference,
  referenceToScene,
  sceneToWorld
} from "./RpgWorldGeometry";
import type { WorldPoint3, WorldPolygon } from "./RpgWorldModel";

export function unprojectRpgReferenceMapPoint(
  point: readonly [number, number]
): WorldPoint3 | null {
  const scene = referenceToScene(point);
  return scene ? sceneToWorld(scene) : null;
}

export function projectRpgWorldPolygon(polygon: WorldPolygon) {
  return polygon.map((point) => {
    const projection = projectWorldToReference(point);
    if (!projection) {
      throw new RangeError(`Map polygon point is outside registration: ${point}`);
    }
    return projection.pixel;
  });
}
```

- [ ] **Step 4: Render terrain from `RpgWorldModel`**

```tsx
// app/world/RpgMapTerrain.tsx
import {
  RPG_WORLD_BRIDGE,
  RPG_WORLD_CANAL,
  RPG_WORLD_ROUTES,
  RPG_WORLD_ZONES
} from "./RpgWorldModel";
import {
  projectRpgWorldPolygon,
  serializeRpgReferencePoints
} from "./RpgMiniMapProjection";

export function RpgMapTerrain() {
  return (
    <g data-map-layer="model-terrain">
      {RPG_WORLD_ZONES.map((zone) => (
        <polygon
          key={zone.id}
          className="rpg-map-terrain-zone"
          fill="#dfcfaa"
          stroke="#8d745b"
          strokeWidth="2"
          data-map-zone={zone.id}
          points={serializeRpgReferencePoints(
            projectRpgWorldPolygon(zone.displayPolygon)
          )}
        />
      ))}
      <polygon
        className="rpg-map-terrain-water"
        fill="#8bc9d9"
        stroke="#4d91a8"
        strokeWidth="2"
        data-map-water={RPG_WORLD_CANAL.id}
        points={serializeRpgReferencePoints(
          projectRpgWorldPolygon(RPG_WORLD_CANAL.polygon)
        )}
      />
      {RPG_WORLD_ROUTES.map((route) => (
        <polygon
          key={route.id}
          className="rpg-map-terrain-route"
          fill="#d6b184"
          stroke="#9a734b"
          strokeWidth="2"
          data-map-route={route.id}
          points={serializeRpgReferencePoints(
            projectRpgWorldPolygon(route.polygon)
          )}
        />
      ))}
      <polygon
        className="rpg-map-terrain-bridge"
        fill="#b67d52"
        stroke="#74462d"
        strokeWidth="2"
        data-map-bridge={RPG_WORLD_BRIDGE.id}
        points={serializeRpgReferencePoints(
          projectRpgWorldPolygon(RPG_WORLD_BRIDGE.polygon)
        )}
      />
    </g>
  );
}
```

Replace the `<image href="/assets/world/world-environment-concept.png">` layer in both maps with `<RpgMapTerrain />`.
Keep semantic classes and distinct land, water, route, and bridge fill/stroke values on the shared SVG component so the generated geometry is visually distinguishable without renderer-specific duplicate CSS.

- [ ] **Step 5: Make the full map read-only**

```tsx
interface RpgWorldMapProps {
  labels: RpgWorldMapLabels;
  navigation: WorldNavigationSnapshot;
  onClose: () => void;
}

const [selectedZoneId, setSelectedZoneId] = useState<DestinationId>(
  navigation.currentZoneId
);

<button
  type="button"
  aria-label={`${labels.inspect}: ${labels.destinations[destinationId]}`}
  aria-pressed={selectedZoneId === destinationId}
  onClick={() => setSelectedZoneId(destinationId)}
>
  {labels.destinations[destinationId]}
</button>

<p data-testid="world-map-selected-description">
  {labels.destinationDescriptions[selectedZoneId]}
</p>
```

Keep the Task 1 read-only selection behavior, add the selected-place description, and assert that `RpgWorldMapProps` has no `onTravel` property.

- [ ] **Step 6: Update localized map copy**

Use these exact English keys and translate the same meaning in Korean and Japanese:

```ts
worldMap: {
  hint: "Select a place to inspect it. Walk there through the world.",
  inspect: "Inspect",
  destinationDescriptions: {
    airport: "Airport terminal and limousine bus plaza",
    tokyo: "Tokyo boulevard and shopfront district",
    gyukatsu: "Gyukatsu alleys and outdoor grills",
    sakura: "Sakura canal, promenade, and bridge",
    hanabi: "Hanabi torii, stalls, lanterns, and fireworks"
  }
}
```

Replace `RpgWorldMapLabels.travelTo` with `inspect` and `destinationDescriptions`; no active type or message object retains the travel wording.

- [ ] **Step 7: Run map and message tests**

Run:

```bash
npm run test:unit -- --run tests/rpg-mini-map.test.ts tests/rpg-mini-map-component.test.tsx tests/rpg-world-map-component.test.tsx tests/world-mini-map-integration.test.tsx tests/rpg-reference-registration.test.ts tests/rpg-world-transform.test.ts tests/messages.test.ts
npm run test:e2e -- tests/e2e/map-accessibility.spec.ts tests/e2e/world.spec.ts
```

Expected: PASS; no map `<image>` or travel callback remains in unit or active E2E contracts, terrain layers are visually distinct, and selection leaves navigation revision and position unchanged.

- [ ] **Step 8: Commit and push**

```bash
git add app/world/RpgMapTerrain.tsx app/world/RpgMiniMapProjection.ts app/world/RpgMiniMap.tsx app/world/RpgWorldMap.tsx app/world/WorldView.tsx app/i18n/messages.ts tests/rpg-mini-map.test.ts tests/rpg-mini-map-component.test.tsx tests/rpg-world-map-component.test.tsx tests/world-mini-map-integration.test.tsx tests/rpg-reference-registration.test.ts tests/rpg-world-transform.test.ts tests/messages.test.ts tests/e2e/map-accessibility.spec.ts tests/e2e/world.spec.ts
git commit -m "Make the RPG maps coordinate-driven and read-only" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 4: Implement the Chase Orbit Camera Contract

**Files:**
- Create: `app/world/ChaseOrbitCamera.ts`
- Create: `app/world/RpgCameraOcclusion.ts`
- Create: `app/world/RpgCameraSafety.ts`
- Create: `app/world/WorldCameraInput.tsx`
- Create: `tests/chase-orbit-camera.test.ts`
- Create: `tests/rpg-camera-occlusion.test.ts`
- Create: `tests/rpg-camera-safety.test.ts`
- Create: `tests/world-camera-input.test.tsx`
- Modify: `app/world/RpgCameraCollision.ts`
- Modify: `app/globals.css`
- Modify: `vitest.config.ts`
- Test: `tests/rpg-camera-collision.test.ts`
- Test: `tests/rpg-character-camera-visibility.test.ts`

**Interfaces:**
- Consumes: `WorldCameraDragIntent`, `WorldNavigationSnapshot`.
- Produces: `createChaseOrbitCameraState`, `advanceChaseOrbitCamera`, `getRegionCameraProfile`, `shortestCameraYawError`.
- Produces: `advanceRpgCameraOcclusion`, `getRpgCameraSafeArea`, `calculateRpgCameraSafetyCorrection`, `advanceRpgCameraSafetyOffset`.
- Produces: `WorldCameraInputProps.onDrag`.

- [ ] **Step 1: Write camera timing, clamp, and collision tests**

```ts
import { describe, expect, it } from "vitest";
import {
  advanceChaseOrbitCamera,
  createChaseOrbitCameraState,
  getRegionCameraProfile,
  shortestCameraYawError
} from "../app/world/ChaseOrbitCamera";

describe("chase orbit camera", () => {
  it("clamps pitch and applies pointer-specific sensitivity", () => {
    const state = createChaseOrbitCameraState();
    advanceChaseOrbitCamera(state, {
      deltaSeconds: 1 / 60,
      elapsedSeconds: 1,
      drag: { deltaX: 100, deltaY: 1000, pointerKind: "mouse" },
      moving: false,
      headingYaw: 0,
      navigationRegion: {
        kind: "zone",
        regionId: "airport",
        displayZoneId: "airport",
        highlightedZoneIds: ["airport"]
      }
    });
    expect(state.yaw).toBeCloseTo(-0.4);
    expect(state.pitch).toBeCloseTo((55 * Math.PI) / 180);
  });

  it("waits 0.8s then returns within 5 degrees in 1.2s", () => {
    const state = createChaseOrbitCameraState();
    state.yaw = Math.PI / 2;
    state.lastManualInputSeconds = 0;
    advanceChaseOrbitCamera(state, {
      deltaSeconds: 0.799,
      elapsedSeconds: 0.799,
      drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
      moving: true,
      headingYaw: 0,
      navigationRegion: {
        kind: "zone",
        regionId: "gyukatsu",
        displayZoneId: "gyukatsu",
        highlightedZoneIds: ["gyukatsu"]
      }
    });
    expect(state.yaw).toBeCloseTo(Math.PI / 2, 10);

    for (let frame = 0; frame < 72; frame += 1) {
      const elapsedSeconds = 0.8 + (frame + 1) / 60;
      advanceChaseOrbitCamera(state, {
        deltaSeconds: 1 / 60,
        elapsedSeconds,
        drag: { deltaX: 0, deltaY: 0, pointerKind: "mouse" },
        moving: true,
        headingYaw: 0,
        navigationRegion: {
          kind: "zone",
          regionId: "gyukatsu",
          displayZoneId: "gyukatsu",
          highlightedZoneIds: ["gyukatsu"]
        }
      });
    }
    expect(0.8 + 72 / 60).toBe(2);
    expect(Math.abs(state.yaw)).toBeLessThanOrEqual((5 * Math.PI) / 180);
  });

  it("uses exact region camera profiles", () => {
    expect(getRegionCameraProfile("airport", "desktop")).toMatchObject({
      distance: 7.8,
      pitchDegrees: 28,
      fovDegrees: 45
    });
    expect(getRegionCameraProfile("gyukatsu", "mobile").distance)
      .toBeCloseTo(4.928);
  });

  it("smoothsteps camera values through a transition", () => {
    const profile = getRegionCameraProfile({
      kind: "transition",
      regionId: "gyukatsu-to-sakura",
      transitionId: "gyukatsu-to-sakura",
      fromZoneId: "gyukatsu",
      toZoneId: "sakura",
      progress: 0.5,
      displayZoneId: "sakura",
      highlightedZoneIds: ["gyukatsu", "sakura"]
    }, "desktop");
    expect(profile.distance).toBeCloseTo(6.2);
    expect(profile.pitchDegrees).toBeCloseTo(35);
  });

  it("returns the signed shortest yaw error across the wrap boundary", () => {
    expect(
      shortestCameraYawError(Math.PI - 0.1, -Math.PI + 0.1)
    ).toBeCloseTo(0.2);
  });
});
```

Add this component case in `tests/world-camera-input.test.tsx`:

```tsx
it("accepts one primary world drag and rejects UI or second-touch starts", () => {
  const onDrag = vi.fn();
  const { container } = render(
    <div>
      <WorldCameraInput label="Rotate camera" onDrag={onDrag} />
      <button data-world-input-block>Map</button>
    </div>
  );
  const layer = screen.getByLabelText("Rotate camera");
  fireEvent.pointerDown(layer, {
    pointerId: 1, pointerType: "touch", isPrimary: true,
    clientX: 300, clientY: 300
  });
  fireEvent.pointerDown(layer, {
    pointerId: 2, pointerType: "touch", isPrimary: false,
    clientX: 320, clientY: 300
  });
  fireEvent.pointerMove(layer, {
    pointerId: 2, pointerType: "touch", clientX: 360, clientY: 300
  });
  expect(onDrag).not.toHaveBeenCalled();
  fireEvent.pointerMove(layer, {
    pointerId: 1, pointerType: "touch", clientX: 312, clientY: 294
  });
  expect(onDrag).toHaveBeenCalledWith(12, -6, "touch");
  fireEvent.pointerDown(container.querySelector("button")!, {
    pointerId: 3, pointerType: "mouse", isPrimary: true
  });
  expect(onDrag).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run camera tests and verify they fail**

Run:

```bash
npm run test:unit -- --run tests/chase-orbit-camera.test.ts tests/rpg-camera-collision.test.ts tests/world-camera-input.test.tsx
```

Expected: FAIL because the chase orbit controller does not exist.

- [ ] **Step 3: Implement the pure camera state**

```ts
// app/world/ChaseOrbitCamera.ts
import type { DestinationId } from "../guide/GuideContract";
import type { NavigationRegion } from "./RpgWorldGeometry";
import type { WorldCameraDragIntent } from "./WorldInput";

const PROFILE = {
  airport: { distance: 7.8, pitchDegrees: 28 },
  tokyo: { distance: 6.6, pitchDegrees: 34 },
  gyukatsu: { distance: 5.6, pitchDegrees: 38 },
  sakura: { distance: 6.8, pitchDegrees: 32 },
  hanabi: { distance: 8, pitchDegrees: 28 }
} as const;

export interface ChaseOrbitCameraState {
  yaw: number;
  pitch: number;
  distance: number;
  lastManualInputSeconds: number;
}

export function getRegionCameraProfile(
  region: DestinationId | NavigationRegion,
  viewport: "desktop" | "mobile"
) {
  const mix = (from: number, to: number, progress: number) =>
    from + (to - from) * progress;
  const profile =
    typeof region === "string" || region.kind === "zone"
      ? PROFILE[typeof region === "string" ? region : region.displayZoneId]
      : (() => {
          const linear = Math.min(1, Math.max(0, region.progress));
          const progress = linear * linear * (3 - 2 * linear);
          const from = PROFILE[region.fromZoneId];
          const to = PROFILE[region.toZoneId];
          return {
            distance: mix(from.distance, to.distance, progress),
            pitchDegrees: mix(
              from.pitchDegrees,
              to.pitchDegrees,
              progress
            )
          };
        })();
  return {
    distance: profile.distance * (viewport === "mobile" ? 0.88 : 1),
    pitchDegrees: profile.pitchDegrees,
    fovDegrees: viewport === "mobile" ? 52 : 45
  };
}

export function createChaseOrbitCameraState(): ChaseOrbitCameraState {
  return {
    yaw: 0,
    pitch: (28 * Math.PI) / 180,
    distance: 7.8,
    lastManualInputSeconds: Number.NEGATIVE_INFINITY
  };
}

function damp(value: number, target: number, halflife: number, delta: number) {
  return target + (value - target) * Math.pow(0.5, delta / halflife);
}

export function shortestCameraYawError(value: number, target: number) {
  return Math.atan2(Math.sin(target - value), Math.cos(target - value));
}

export function advanceChaseOrbitCamera(
  state: ChaseOrbitCameraState,
  input: {
    deltaSeconds: number;
    elapsedSeconds: number;
    drag: Readonly<WorldCameraDragIntent>;
    moving: boolean;
    headingYaw: number;
    navigationRegion: NavigationRegion;
    viewport?: "desktop" | "mobile";
  }
) {
  const sensitivity = input.drag.pointerKind === "touch" ? 0.006 : 0.004;
  const profile = getRegionCameraProfile(
    input.navigationRegion,
    input.viewport ?? "desktop"
  );
  if (input.drag.deltaX !== 0 || input.drag.deltaY !== 0) {
    state.yaw -= input.drag.deltaX * sensitivity;
    state.pitch = Math.min(
      (55 * Math.PI) / 180,
      Math.max(
        (18 * Math.PI) / 180,
        state.pitch + input.drag.deltaY * sensitivity
      )
    );
    state.lastManualInputSeconds = input.elapsedSeconds;
  } else if (
    input.moving &&
    input.elapsedSeconds - state.lastManualInputSeconds >= 0.8
  ) {
    const error = shortestCameraYawError(state.yaw, input.headingYaw);
    state.yaw += error * (1 - Math.pow(0.5, input.deltaSeconds / 0.18));
    state.pitch = damp(
      state.pitch,
      (profile.pitchDegrees * Math.PI) / 180,
      0.2,
      input.deltaSeconds
    );
  }
  state.distance = damp(state.distance, profile.distance, 0.2, input.deltaSeconds);
  return state;
}
```

- [ ] **Step 4: Add the pointer input layer**

```tsx
// app/world/WorldCameraInput.tsx
"use client";

import { useRef, type PointerEvent } from "react";
import type { WorldPointerKind } from "./WorldInput";

export function WorldCameraInput({
  label,
  onDrag
}: {
  label: string;
  onDrag: (
    deltaX: number,
    deltaY: number,
    pointerKind: WorldPointerKind
  ) => void;
}) {
  const active = useRef<number | null>(null);
  const last = useRef({ x: 0, y: 0 });
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (active.current !== event.pointerId) return;
    onDrag(
      event.clientX - last.current.x,
      event.clientY - last.current.y,
      event.pointerType === "touch"
        ? "touch"
        : event.pointerType === "pen"
          ? "pen"
          : "mouse"
    );
    last.current = { x: event.clientX, y: event.clientY };
  };
  return (
    <div
      className="world-camera-input"
      aria-label={label}
      onPointerDown={(event) => {
        if (!event.isPrimary || active.current !== null) return;
        active.current = event.pointerId;
        last.current = { x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (active.current !== event.pointerId) return;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        active.current = null;
      }}
      onPointerCancel={(event) => {
        if (active.current !== event.pointerId) return;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        active.current = null;
      }}
      onLostPointerCapture={(event) => {
        if (active.current === event.pointerId) active.current = null;
      }}
    />
  );
}
```

The optional pointer-capture calls are required because jsdom does not implement them; real browsers still capture and release the pointer. CSS must place `.world-camera-input` over the Canvas, under buttons and dialogs, restrict coarse pointers to the right `55%`, and set `touch-action: none` on the world interaction surface. Capture only one primary pointer; while one pointer is active, ignore additional pointer IDs so pinch/zoom cannot become camera input. Pointer starts on `[data-world-input-block]`, buttons, links, dialogs, the map, or the joystick must never reach `WorldCameraInput`. Component tests cover each blocked origin, a two-touch attempt, and `lostpointercapture`.

Exercise the real `onPointerDown` handler for blocked origins: append representative blocked descendants to the rendered camera layer, dispatch pointer starts from each descendant so the event bubbles through the production handler, then prove subsequent pointer moves emit no drag. A sibling-only click is insufficient because it cannot reach the component regardless of its guard.

- [ ] **Step 5: Add occlusion timing and screen-safe-area calculations**

`RpgCameraOcclusion.ts` is a pure state machine with these exact assertions:

```ts
const state = createRpgCameraOcclusionState();
advanceRpgCameraOcclusion(state, true, 0.249);
expect(state.fading).toBe(false);
advanceRpgCameraOcclusion(state, true, 0.001);
expect(state.fading).toBe(true);
advanceRpgCameraOcclusion(state, true, 0.1);
expect(state.opacity).toBeLessThanOrEqual(0.2);
advanceRpgCameraOcclusion(state, false, 0.2);
expect(state.opacity).toBeCloseTo(1, 2);
```

It waits `250ms`, fades a marked blocker to opacity `0.15` within `100ms`, and restores it to `1` within `200ms`. State is keyed by object UUID so one blocked object cannot fade an unrelated landmark.

`RpgCameraSafety.ts` returns the exact safe rectangle for desktop `1440x900` (`x 15%..85%`, `y 10%..92%`) and mobile `390x844` content rect `(0,64,390,780)` (`x 10%..90%`, `y 8%..94%`). `calculateRpgCameraSafetyCorrection` returns zero while the projected foot/head bounds are inside; outside it returns signed overflow divided by the safe rectangle's width/height and clamps each axis to `[-1, 1]`.

`RpgCameraSafety.ts` exports a pure `advanceRpgCameraSafetyOffset` helper in this task. It accepts the current camera distance, normalized correction, camera-right/camera-up vectors, mutable current/target offsets, and `deltaSeconds`, and applies this exact world-space rule:

```ts
const horizontalShift = Math.min(state.distance * 0.35, 2);
const verticalShift = Math.min(state.distance * 0.25, 1.5);
targetSafetyOffset
  .copy(cameraRight)
  .multiplyScalar(correction.x * horizontalShift)
  .addScaledVector(cameraUp, -correction.y * verticalShift);
if (targetSafetyOffset.length() > 2.2) targetSafetyOffset.setLength(2.2);
safetyOffset.lerp(
  targetSafetyOffset,
  1 - Math.pow(0.5, deltaSeconds / 0.08)
);
```

Task 7's `ChaseOrbitCamera3d` consumes this helper instead of duplicating the formula. Unit tests cover every edge, the `2.2` clamp, `0.08s` half-life smoothing, decay back to zero, and a continuous `250ms` violation. The active E2E in Task 10 asserts that `data-camera-safe` never becomes `false`, `data-camera-boom` never drops below `2.6`, and `data-camera-diagnostic` never reports a non-finite result.

- [ ] **Step 6: Run camera tests**

Keep `RETIRED_UNIT_SUITES` byte-for-byte as the historical ten-path G007 contract. Introduce `ACTIVE_UNIT_EXCLUDES` now and make Vitest spread it instead of `RETIRED_UNIT_SUITES`. Reactivate the collision suite in this task by excluding only the other nine historical suites:

```ts
export const ACTIVE_UNIT_EXCLUDES = RETIRED_UNIT_SUITES.filter(
  (path) => path !== "tests/rpg-camera-collision.test.ts"
);

// Vitest config
exclude: [...configDefaults.exclude, ...ACTIVE_UNIT_EXCLUDES]
```

Repair `tests/rpg-camera-collision.test.ts` against the current world/camera contracts without weakening the minimum-boom, static/dynamic obstacle, thin-column, invalid-coordinate, and character-visibility assertions. Remove obsolete source assertions tied only to the retired `FlatWorldCanvas` composition. The exact focused command below must collect the collision file and pass; a skipped/excluded file is a failure.

Run:

```bash
npm run test:unit -- --run tests/chase-orbit-camera.test.ts tests/rpg-camera-collision.test.ts tests/rpg-character-camera-visibility.test.ts tests/rpg-camera-occlusion.test.ts tests/rpg-camera-safety.test.ts tests/world-camera-input.test.tsx
```

Expected: PASS; pitch, sensitivity, recenter timing, profiles and boom minimum are exact.

- [ ] **Step 7: Commit and push**

```bash
git add app/world/ChaseOrbitCamera.ts app/world/RpgCameraOcclusion.ts app/world/RpgCameraSafety.ts app/world/WorldCameraInput.tsx app/world/RpgCameraCollision.ts app/globals.css vitest.config.ts tests/chase-orbit-camera.test.ts tests/rpg-camera-collision.test.ts tests/rpg-character-camera-visibility.test.ts tests/rpg-camera-occlusion.test.ts tests/rpg-camera-safety.test.ts tests/world-camera-input.test.tsx
git commit -m "Add the RPG chase orbit camera" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 5: Build the 3D Town Surface and Landmark Scene

**Files:**
- Create: `app/world/RpgWorldSurfaces.tsx`
- Create: `app/world/RpgSignatureLandmarks.tsx`
- Create: `app/world/RpgRegionPresentation.ts`
- Create: `app/world/RpgWorldEffects.tsx`
- Create: `app/world/RpgRegionAudio.tsx`
- Create: `app/world/RpgTownRenderStats.ts`
- Modify: `app/world/RpgTownScene.tsx:1-61`
- Modify: `app/world/RpgTownAmbience.tsx:1-28`
- Modify: `app/world/RpgTownDetails.tsx`
- Modify: `app/world/RpgTownSceneLayout.ts`
- Modify: `app/world/RpgWorldModel.ts`
- Modify: `app/world/RpgWorldGeometry.ts`
- Modify: `vitest.config.ts:5-20`
- Create: `tests/rpg-region-presentation.test.ts`
- Test: `tests/rpg-town-scene-layout.test.ts`
- Test: `tests/rpg-town-architecture.test.ts`
- Test: `tests/rpg-town-details.test.ts`
- Test: `tests/rpg-town-street-life.test.ts`
- Test: `tests/rpg-town-draw-budget.test.ts`
- Test: `tests/rpg-town-scene-instancing.test.ts`
- Test: `tests/rpg-world-geometry.test.ts`
- Test: `tests/world-runtime.test.ts`
- Test: `tests/rpg-mini-map.test.ts`
- Modify: `tests/rpg-world-depth-bands.test.ts`

**Interfaces:**
- Consumes: `RPG_TOWN_SURFACES`, `RPG_MAIN_ROUTE`, `RPG_LANDMARKS`, mutable `RefObject<WorldNavigationSnapshot>`.
- Produces: `<RpgWorldSurfaces />`, `<RpgSignatureLandmarks />`, `<RpgWorldEffects />`, `<RpgRegionAudio />`, active `<RpgTownScene />`.
- Produces: `resolveRpgRegionPresentation(region, target)` with smoothstep weights for every visual/audio channel.
- Preserves one canonical walkability contract: walkable model ground/plaza/road/sidewalk/bridge minus canal water and collision volumes; `isRpgWalkablePosition(x, z)` delegates directly to `isWalkable([x, z])`.
- Defers: NPC mounting to Task 6 so this task compiles independently.

- [ ] **Step 1: Change the scene contract test from transparent to visible 3D**

```ts
export interface RpgTownSceneRenderContract {
  readonly renderer: "seamless-rpg";
  readonly technology: "webgl3d";
  readonly ground: boolean;
  readonly roads: boolean;
  readonly canal: boolean;
  readonly bridge: boolean;
  readonly buildings: boolean;
  readonly signatureLandmarks: boolean;
  readonly npcCrowd: boolean;
}

it("owns the continuous 3D environment", () => {
  expect(resolveRpgTownSceneRenderContract()).toEqual({
    renderer: "seamless-rpg",
    technology: "webgl3d",
    ground: true,
    roads: true,
    canal: true,
    bridge: true,
    buildings: true,
    signatureLandmarks: true,
    npcCrowd: false
  });
});
```

Add assertions that `RpgTownScene.tsx` imports `RpgWorldSurfaces`, `RpgTownArchitecture`, `RpgTownDetails`, `RpgSignatureLandmarks`, and does not import `RpgWorldBackdrop`.

Rewrite `tests/rpg-town-scene-instancing.test.ts` so it reads the new modular source files rather than slicing removed functions from `RpgTownScene.tsx`. In this task it asserts only static ownership: surfaces are in `RpgWorldSurfaces`, rich landmarks are in `RpgSignatureLandmarks`, repeated architecture/detail geometry remains in shared `Instances`/`InstanceBatch` groups, and no rich landmark ID is also present in a batched architecture set. Task 6 extends the same test with NPC and moving-bus ownership.

Rewrite `tests/rpg-town-draw-budget.test.ts` to count draw units from `RpgWorldSurfaces.tsx`, `RpgSignatureLandmarks.tsx`, `RpgTownArchitecture.tsx`, and `RpgTownDetails.tsx`. Delete `readComponentSource()` and every old monolithic function name. Keep the `120` draw-call, `150_000` high-quality triangle, and `90_000` low-quality triangle gates, with explicit exported batch stats for every procedural group.

In `tests/rpg-world-depth-bands.test.ts`, replace only the transparent/null scene case with the new render-contract assertion. Do not render R3F components through Testing Library without a Canvas; retain the independent projection/depth fixture cases unchanged.

- [ ] **Step 2: Run the retired scene suites directly and verify failure**

Run:

```bash
npm run test:unit -- --run tests/rpg-region-presentation.test.ts tests/rpg-town-scene-layout.test.ts tests/rpg-town-architecture.test.ts tests/rpg-town-details.test.ts tests/rpg-town-street-life.test.ts tests/rpg-town-draw-budget.test.ts tests/rpg-town-scene-instancing.test.ts tests/rpg-world-depth-bands.test.ts
```

Expected: FAIL because `RpgTownScene` returns `null`, the old tests still inspect removed monolithic blocks, and region presentation does not exist.

- [ ] **Step 3: Render ground, roads, canal and bridge**

```tsx
// app/world/RpgWorldSurfaces.tsx
"use client";

import { RPG_TOWN_SURFACES } from "./RpgTownSceneLayout";
import { RPG_WORLD_BRIDGE, RPG_WORLD_CANAL } from "./RpgWorldModel";

export function RpgWorldSurfaces() {
  return (
    <group name="rpg-world-surfaces">
      {RPG_TOWN_SURFACES.map((surface) => (
        <mesh
          key={surface.id}
          position={resolveRpgSurfaceMeshPosition(surface)}
          receiveShadow
          userData={{ surfaceId: surface.id, surfaceKind: surface.kind }}
        >
          {surface.shape === "circle" ? (
            <cylinderGeometry
              args={[surface.size[0] / 2, surface.size[0] / 2, surface.size[1], 48]}
            />
          ) : (
            <boxGeometry args={surface.size} />
          )}
          <meshStandardMaterial
            color={surface.color}
            roughness={surface.kind === "water" ? 0.28 : 0.92}
            metalness={surface.kind === "water" ? 0.08 : 0}
          />
        </mesh>
      ))}
      <mesh
        position={[
          (RPG_WORLD_CANAL.polygon[0][0] + RPG_WORLD_CANAL.polygon[1][0]) / 2,
          RPG_WORLD_CANAL.waterLevel,
          0
        ]}
        userData={{ surfaceId: RPG_WORLD_CANAL.id }}
      >
        <boxGeometry args={[2.2, 0.3, 72]} />
        <meshStandardMaterial color="#398aa2" roughness={0.24} />
      </mesh>
      {createRpgBridgeDeckSegments(24).map((segment) => (
        <mesh
          key={segment.id}
          position={segment.position}
          rotation={[0, 0, segment.rotationZ]}
          userData={{ surfaceId: RPG_WORLD_BRIDGE.id }}
        >
          <boxGeometry args={segment.size} />
          <meshStandardMaterial color="#ac4a3d" roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}
```

`resolveRpgSurfaceMeshPosition` keeps water at its authored level and places every walkable box/cylinder so its visual top is `getSurfaceHeight([x, z]) + 0.002`; this avoids both z-fighting and visible foot sinking while staying inside the `0.02` tolerance. Tests cover every walkable surface center in addition to the bridge samples.

`createRpgBridgeDeckSegments(24)` samples `getSurfaceHeight` at both ends of every segment, places the deck top at their average, and rotates each box by `atan2(endHeight - startHeight, endX - startX)`. Add a geometry test that samples each segment center and both seams; rendered deck-top height must differ from `getSurfaceHeight([x, -17])` by at most `0.02 world units`. Do not render a second flat bridge under the arched deck.

Expand the canonical `RpgWorldModel`/`RpgWorldGeometry.isWalkable` contract from route-only movement to outdoor exploration on model-authored ground, plazas, roads, sidewalks, and the bridge. Continue rejecting out-of-bounds points, canal water outside the bridge, and all collision volumes. Do not add a compatibility-only rectangle policy in `RpgTownSceneLayout`; it must remain a direct adapter to `isWalkable`. Cross-check a dense town grid so runtime, scene layout, map samples, and route reachability return the same result for every point.

- [ ] **Step 4: Render signature landmarks from authored data**

`RpgSignatureLandmarks.tsx` filters `getRpgLandmarkRenderTier(landmark) === "rich"` and renders every kind with one reusable component. Every root writes `userData.landmarkId`, takes position/size/color/rotation only from the landmark record, and adds detail as local offsets:

When repeated rich landmarks use `<Instances>`, the rendered `<Instance>` itself carries the matching `userData.landmarkId` and the landmark record's rotation-correct transform. Metadata on an empty sibling/parent group does not satisfy ownership.

| kind | geometry ownership |
| --- | --- |
| `terminal`, `tower`, `machiya`, `stall` | shell, roof, windows/signage; never re-rendered by batched architecture because these rows are `rich` |
| `bus` | returns `null`; Task 6 owns the one moving `RpgAirportBusActor` |
| `sakuraTree` | trunk cylinders and canopy spheres |
| `canal` | bank caps and rail details only; water remains owned by `RpgWorldSurfaces` |
| `bridge` | rails and posts only; arched walk deck remains owned by `RpgWorldSurfaces` |
| `lantern` | pole and emissive lantern |
| `torii` | two posts and two beams |
| `hanabi` | returns `null`; `RpgWorldEffects` exclusively owns `RpgHanabiLayout` particles/bursts |
| `npc` | returns `null`; Task 6 owns NPC GLBs |

The `Landmark` switch lists all twelve union members and ends in `assertNever(landmark.kind)`, so a new kind cannot silently disappear. `RpgTownArchitecture` continues to render only `batched` rows; add a test that the intersection between directly rendered landmark IDs and batched architecture IDs is empty.

```tsx
export function RpgSignatureLandmarks({
  qualityLevel,
  presentation
}: {
  qualityLevel: SceneQualityLevel;
  presentation: RefObject<RpgRegionPresentationState>;
}) {
  return (
    <group name="rpg-signature-landmarks">
      {RPG_LANDMARKS
        .filter((landmark) => getRpgLandmarkRenderTier(landmark) === "rich")
        .filter((landmark) => landmark.kind !== "npc")
        .map((landmark) => (
          <Landmark
            key={landmark.id}
            landmark={landmark}
            qualityLevel={qualityLevel}
            presentation={presentation}
          />
        ))}
    </group>
  );
}
```

The `Landmark` switch has explicit branches for `terminal`, `bus`, `tower`, `machiya`, `sakuraTree`, `canal`, `bridge`, `stall`, `lantern`, `torii`, `hanabi`, and `npc`; `bus` and `npc` return `null` for Task 6 actors, and `hanabi` returns `null` for the single `RpgWorldEffects` owner.

Tag every individually owned, opaque, potentially sight-blocking signature landmark root with `userData.cameraOccluder = true`; do not tag roads, water, particles, rails, lanterns, or other thin props. Do not fade `RpgTownArchitecture` instance batches: their material and UUID are shared, so fading one hit would erase every building in that batch. Batched buildings use inflated camera-collision proxies and must pass the Task 10 narrow-alley “no persistent occlusion” gate; only a uniquely material-owned landmark may enter the timed transparency state.

- [ ] **Step 5: Activate ambience and scene composition**

```tsx
// app/world/RpgTownScene.tsx
export interface RpgTownSceneRenderContract {
  readonly renderer: "seamless-rpg";
  readonly technology: "webgl3d";
  readonly ground: boolean;
  readonly roads: boolean;
  readonly canal: boolean;
  readonly bridge: boolean;
  readonly buildings: boolean;
  readonly signatureLandmarks: boolean;
  readonly npcCrowd: boolean;
}

export const RPG_TOWN_SCENE_RENDER_CONTRACT: RpgTownSceneRenderContract = {
  renderer: "seamless-rpg",
  technology: "webgl3d",
  ground: true,
  roads: true,
  canal: true,
  bridge: true,
  buildings: true,
  signatureLandmarks: true,
  npcCrowd: false
} as const;

export const RpgTownScene = memo(function RpgTownScene({
  qualityLevel = "high",
  navigation
}: RpgTownSceneProps) {
  const presentation = useRef(createRpgRegionPresentation());
  return (
    <group name="seamless-rpg-town">
      <RpgTownAmbience
        qualityLevel={qualityLevel}
        navigation={navigation}
        presentation={presentation}
      />
      <RpgWorldSurfaces />
      <RpgTownArchitecture qualityLevel={qualityLevel} />
      <RpgTownDetails presentation={presentation} />
      <RpgSignatureLandmarks
        qualityLevel={qualityLevel}
        presentation={presentation}
      />
      <RpgWorldEffects
        qualityLevel={qualityLevel}
        presentation={presentation}
      />
      <RpgRegionAudio presentation={presentation} />
    </group>
  );
});
```

Add `navigation: RefObject<WorldNavigationSnapshot>` to `RpgTownSceneProps`.

Replace the old ambience props rather than adding an undeclared property:

```ts
export interface RpgTownAmbienceProps {
  readonly qualityLevel: SceneQualityLevel;
  readonly navigation: RefObject<WorldNavigationSnapshot>;
  readonly presentation: RefObject<RpgRegionPresentationState>;
}
```

`RpgRegionPresentation.ts` owns these exact authored profiles:

```ts
export const RPG_REGION_PRESENTATION_PROFILES = {
  airport: {
    sky: "#b9dff0", fog: "#d7e3e5", key: "#fff6df", fill: "#b5dcf0",
    keyIntensity: 1.25, fillIntensity: 0.8,
    decorationDensity: 0.55, vegetationDensity: 0.15,
    effectIntensity: 0.05, ambienceVolume: 0.18
  },
  tokyo: {
    sky: "#9fbfd0", fog: "#b8c4ca", key: "#ffe7c4", fill: "#92b8c9",
    keyIntensity: 1.15, fillIntensity: 0.72,
    decorationDensity: 1, vegetationDensity: 0.25,
    effectIntensity: 0.12, ambienceVolume: 0.24
  },
  gyukatsu: {
    sky: "#c99b78", fog: "#8f6655", key: "#ffb667", fill: "#9a6e62",
    keyIntensity: 1.05, fillIntensity: 0.62,
    decorationDensity: 0.92, vegetationDensity: 0.18,
    effectIntensity: 0.2, ambienceVolume: 0.28
  },
  sakura: {
    sky: "#f1c5d6", fog: "#e7b9c8", key: "#fff1dc", fill: "#d9a8c5",
    keyIntensity: 1.3, fillIntensity: 0.86,
    decorationDensity: 0.78, vegetationDensity: 1,
    effectIntensity: 0.72, ambienceVolume: 0.22
  },
  hanabi: {
    sky: "#111a3a", fog: "#241d3e", key: "#ffbf69", fill: "#485c91",
    keyIntensity: 0.82, fillIntensity: 0.55,
    decorationDensity: 1, vegetationDensity: 0.32,
    effectIntensity: 1, ambienceVolume: 0.3
  }
} as const;
```

`RpgRegionPresentationState` contains mutable `Color` values, the four scalar density/intensity values, and `zoneWeights`/`audioGains` records with all five `DestinationId` keys. `resolveRpgRegionPresentation(region, target)` uses `t = progress * progress * (3 - 2 * progress)` for transitions, linearly blends every color/scalar, sets the source/destination zone weights to `1 - t`/`t`, and sets each audio gain to `zoneWeight * profile.ambienceVolume`. A zone sets its own weight to `1` and all others to `0`.

Add a pure midpoint test with transition progress `0.5`, plus a non-midpoint `0.25` case that proves the smoothstep value rather than linear interpolation. Assert complete five-key `zoneWeights` and `audioGains` records, every color, both light intensities, and every scalar at the non-midpoint and at endpoints `0` and `1`; no channel may jump or retain a stale unrelated-zone value.

`RpgTownAmbience` uses exactly one `<color attach="background">`, one `<fog attach="fog">`, one hemisphere light and one directional light. Its `useFrame` runs at priority `-3`, resolves the shared presentation from `navigation.current.navigationRegion`, and mutates the existing color/fog/light refs with frame-time damping. `RpgTownDetails` multiplies the Tokyo and Gyukatsu material opacity by their zone weight and `decorationDensity`; Sakura vegetation in `RpgSignatureLandmarks` uses the Sakura weight and `vegetationDensity`. `RpgWorldEffects` applies the Sakura weight to petals and the Hanabi weight to fireworks, then multiplies both by `effectIntensity` and the current quality budget.

`RpgRegionAudio` creates no network request. After the first post-mount `pointerdown` or `keydown`, it creates one two-second deterministic looping noise buffer, five `BiquadFilterNode` bands (`180`, `260`, `340`, `520`, `760` Hz), five gain nodes, and one master gain capped at `0.35`. On each frame it calls `gain.setTargetAtTime(presentation.current.audioGains[zoneId], context.currentTime, 0.08)`. It stops sources, removes listeners, and closes the `AudioContext` on unmount. Until a user gesture, it remains silent. Tests mock `AudioContext` and assert the five gains follow the same smoothstep weights.

Do not import `RpgWorldBackdrop`, create an `<image>`, create another Canvas, or load an audio asset.

- [ ] **Step 6: Re-enable the scene suites without rewriting G007 history**

Keep `RETIRED_UNIT_SUITES` byte-for-byte as the historical ten-path G007 contract because `tests/visual/g007-verification.test.ts` still verifies it. Task 4 already introduced `ACTIVE_UNIT_EXCLUDES` and reactivated camera collision. Reduce the active array after this task to only the three actor/motion suites whose replacement behavior is not implemented yet:

```ts
export const ACTIVE_UNIT_EXCLUDES = [
  "tests/rpg-npc-glb-renderer.test.ts",
  "tests/npc-patrol-motion.test.ts",
  "tests/rpg-bus-motion.test.ts"
] as const;

// Vitest config
exclude: [...configDefaults.exclude, ...ACTIVE_UNIT_EXCLUDES]
```

- [ ] **Step 7: Run the complete scene slice**

Run:

```bash
npm run test:unit -- --run tests/rpg-region-presentation.test.ts tests/rpg-town-scene-layout.test.ts tests/rpg-town-architecture.test.ts tests/rpg-town-details.test.ts tests/rpg-town-street-life.test.ts tests/rpg-town-draw-budget.test.ts tests/rpg-town-scene-instancing.test.ts tests/rpg-town-render-tier.test.ts tests/rpg-hanabi-layout.test.ts tests/rpg-world-depth-bands.test.ts tests/rpg-world-geometry.test.ts tests/world-runtime.test.ts tests/rpg-mini-map.test.ts
```

Expected: PASS; all scene suites run through the active include/exclude contract, the historical G007 constant remains unchanged, the old transparent contract is gone, and every presentation channel has a continuous transition test.

- [ ] **Step 8: Commit and push**

```bash
git add app/world/RpgWorldSurfaces.tsx app/world/RpgSignatureLandmarks.tsx app/world/RpgRegionPresentation.ts app/world/RpgWorldEffects.tsx app/world/RpgRegionAudio.tsx app/world/RpgTownRenderStats.ts app/world/RpgTownScene.tsx app/world/RpgTownAmbience.tsx app/world/RpgTownDetails.tsx app/world/RpgTownSceneLayout.ts app/world/RpgWorldModel.ts app/world/RpgWorldGeometry.ts vitest.config.ts tests/rpg-region-presentation.test.ts tests/rpg-town-scene-layout.test.ts tests/rpg-town-architecture.test.ts tests/rpg-town-details.test.ts tests/rpg-town-street-life.test.ts tests/rpg-town-draw-budget.test.ts tests/rpg-town-scene-instancing.test.ts tests/rpg-world-geometry.test.ts tests/world-runtime.test.ts tests/rpg-mini-map.test.ts tests/rpg-world-depth-bands.test.ts
git commit -m "Build the continuous 3D town scene" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 6: Connect GLB Player and NPC Actors

**Files:**
- Create: `app/world/RpgPlayerActor.tsx`
- Create: `app/world/RpgNpcCrowd.tsx`
- Create: `app/world/RpgAirportBusActor.tsx`
- Modify: `app/world/AirportBusVisual.tsx`
- Modify: `app/world/RpgCharacterMotion3d.ts:15-375`
- Modify: `app/world/RpgTownScene.tsx`
- Modify: `tests/rpg-town-scene-instancing.test.ts`
- Modify: `tests/world-runtime.test.ts`
- Modify: `vitest.config.ts`
- Test: `tests/rpg-character-motion-3d.test.ts`
- Test: `tests/rpg-player-glb-renderer.test.ts`
- Test: `tests/rpg-npc-glb-renderer.test.ts`
- Test: `tests/npc-patrol-motion.test.ts`
- Test: `tests/rpg-bus-motion.test.ts`

**Interfaces:**
- Consumes: mutable `RefObject<WorldNavigationSnapshot>`.
- Produces: `<RpgPlayerActor />`, `<RpgNpcCrowd />`, `<RpgAirportBusActor />`.
- Exposes: player `Vector3` ref for camera and NPC sight-line handling.
- Writes: mutable `RefObject<Map<string, RpgCameraDynamicObstacle>>` with one stable keyed obstacle per NPC and the bus.
- Reuses: exactly one `RpgBusRuntime`; Task 7 creates it once and the same `pose` drives rendering, player collision, and camera collision.
- Extends: `RpgCharacterMotion3dInput.movementSpeedRatio?: number`; omitted means `1`, run uses `WORLD_RUN_SPEED / WORLD_WALK_SPEED`.

- [ ] **Step 1: Write actor integration tests**

```ts
it("uses the selected GLB and applies the runtime pose at the surface height", () => {
  const source = readFileSync("app/world/RpgPlayerActor.tsx", "utf8");
  expect(source).toContain("<RpgPlayerCharacter3d");
  expect(source).toContain("characterHandle.current?.applyPose");
  expect(source).toContain("snapshot.position");
  expect(source).toContain("snapshot.surfaceHeight");
  expect(source).toContain("snapshot.jumpOffset");
  expect(source).toContain("evaluateRpgCharacterMotion3dInto");
  expect(source).toContain("createRpgCharacterMotion3dState");
});

it("renders every authored NPC through RpgNpcCharacter3d", () => {
  const npcIds = RPG_LANDMARKS
    .filter(({ kind }) => kind === "npc")
    .map(({ id }) => id);
  expect(npcIds).toHaveLength(7);
  expect(readFileSync("app/world/RpgNpcCrowd.tsx", "utf8"))
    .toContain("<RpgNpcCharacter3d");
});

it("advances a run gait faster than a walk gait", () => {
  const walkState = createRpgCharacterMotion3dState();
  const runState = createRpgCharacterMotion3dState();
  const walkPose = createRpgCharacterMotion3dPose();
  const runPose = createRpgCharacterMotion3dPose();
  const base = {
    deltaSeconds: 1 / 60,
    headingX: 1,
    headingZ: 0,
    moving: true,
    grounded: true,
    jumpHeight: 0,
    reducedMotion: false
  };
  evaluateRpgCharacterMotion3dInto(
    walkState,
    { ...base, movementSpeedRatio: 1 },
    walkPose
  );
  evaluateRpgCharacterMotion3dInto(
    runState,
    { ...base, movementSpeedRatio: WORLD_RUN_SPEED / WORLD_WALK_SPEED },
    runPose
  );
  expect(runPose.stridePhase).toBeGreaterThan(walkPose.stridePhase);
});

it("uses the same bus pose for rendering and dynamic player collision", () => {
  const bus = createRpgBusRuntime();
  const pose = bus.pose;
  advanceRpgBusRuntime(bus, 1, false);
  expect(bus.pose).toBe(pose);
  evaluateRpgBusMotionInto(
    {
      routeProgress: (22 + Math.PI * 2) / RPG_BUS_ROUTE_LENGTH,
      completedLoops: 0
    },
    bus.pose
  );
  const runtime = createWorldRuntime({
    canOccupyDynamic: ([x, z]) =>
      isRpgPositionOutsideMovingBus(x, z, bus.pose)
  });
  expect(isRpgPositionOutsideMovingBus(
    pose.position[0],
    pose.position[2],
    pose
  )).toBe(false);
  const spawn = runtime.getNavigationSnapshot().position;
  const initialDistance = Math.hypot(
    spawn[0] - pose.position[0],
    spawn[2] - pose.position[2]
  );
  const maxFrames = Math.ceil(
    (initialDistance / WORLD_WALK_SPEED + 2) * 120
  );
  for (let frame = 0; frame < maxFrames; frame += 1) {
    const position = runtime.getNavigationSnapshot().position;
    const dx = pose.position[0] - position[0];
    const dz = pose.position[2] - position[2];
    const length = Math.hypot(dx, dz);
    runtime.setMovement({
      x: dx / Math.max(length, 1e-8),
      y: dz / Math.max(length, 1e-8),
      runRequested: false
    });
    runtime.advance(1 / 120, 0);
    const next = runtime.getNavigationSnapshot().position;
    expect(isRpgPositionOutsideMovingBus(next[0], next[2], pose)).toBe(true);
  }
  const stopped = runtime.getNavigationSnapshot().position;
  expect(
    Math.hypot(stopped[0] - pose.position[0], stopped[2] - pose.position[2])
  ).toBeLessThan(4);
  expect(runtime).not.toHaveProperty("setPosition");
});
```

- [ ] **Step 2: Run actor suites and verify failure**

Run:

```bash
npm run test:unit -- --run tests/rpg-character-motion-3d.test.ts tests/rpg-player-glb-renderer.test.ts tests/rpg-npc-glb-renderer.test.ts tests/npc-patrol-motion.test.ts tests/rpg-bus-motion.test.ts
```

Expected: FAIL because the actor wrappers and shared moving-bus actor are absent and the NPC/bus suites remain retired.

- [ ] **Step 3: Implement the player actor**

```tsx
// app/world/RpgPlayerActor.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import { Group, Vector3 } from "three";
import {
  createRpgCharacterMotion3dPose,
  createRpgCharacterMotion3dState,
  evaluateRpgCharacterMotion3dInto
} from "./RpgCharacterMotion3d";
import {
  RpgPlayerCharacter3d,
  type RpgPlayerCharacter3dHandle
} from "./RpgPlayerCharacter3d";
import type { WorldNavigationSnapshot } from "./WorldNavigationState";
import { WORLD_RUN_SPEED, WORLD_WALK_SPEED } from "./WorldRuntime";
import type { PlayerCharacterId } from "./CharacterAssets";

export function RpgPlayerActor({
  character,
  navigation,
  playerPosition,
  qualityLevel,
  reducedMotion
}: {
  character: PlayerCharacterId;
  navigation: RefObject<WorldNavigationSnapshot>;
  playerPosition: RefObject<Vector3>;
  qualityLevel: "high" | "medium" | "low";
  reducedMotion: boolean;
}) {
  const root = useRef<Group>(null);
  const characterHandle = useRef<RpgPlayerCharacter3dHandle>(null);
  const motion = useRef(createRpgCharacterMotion3dState());
  const pose = useRef(createRpgCharacterMotion3dPose());

  useFrame((_, delta) => {
    const snapshot = navigation.current;
    if (!root.current || !snapshot) return;
    root.current.position.set(
      snapshot.position[0],
      snapshot.surfaceHeight,
      snapshot.position[2]
    );
    playerPosition.current.fromArray(snapshot.position);
    evaluateRpgCharacterMotion3dInto(
      motion.current,
      {
        deltaSeconds: delta,
        headingX: snapshot.heading[0],
        headingZ: snapshot.heading[2],
        moving: snapshot.moving,
        grounded: snapshot.grounded,
        jumpHeight: snapshot.jumpOffset,
        movementSpeedRatio:
          snapshot.locomotion === "run"
            ? WORLD_RUN_SPEED / WORLD_WALK_SPEED
            : 1,
        reducedMotion
      },
      pose.current
    );
    characterHandle.current?.applyPose(pose.current);
  });

  return (
    <group ref={root} name="rpg-player-actor">
      <RpgPlayerCharacter3d
        ref={characterHandle}
        character={character}
        guideActive={false}
        qualityLevel={qualityLevel}
      />
    </group>
  );
}
```

In `RpgCharacterMotion3d.ts`, sanitize `movementSpeedRatio` to `0.5..1.5` with fallback `1`, then multiply only the gait phase advance by that value. Keep all existing pose curves and all existing callers valid when the optional field is omitted.

- [ ] **Step 4: Implement the NPC crowd**

```tsx
// app/world/RpgNpcCrowd.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import {
  useEffect,
  useMemo,
  useRef,
  type RefObject
} from "react";
import { Group, Vector3 } from "three";
import { NPC_CHARACTER_MODELS } from "./NpcCharacterModels";
import type { NpcSpriteId } from "./NpcAssets";
import {
  createNpcPatrolPose,
  deriveNpcPatrolRoute,
  evaluateNpcPatrolMotionInto
} from "./NpcPatrolMotion";
import {
  RPG_NPC_CAMERA_CLEARANCE,
  type RpgCameraDynamicObstacle
} from "./RpgCameraCollision";
import {
  RpgNpcCharacter3d,
  type RpgNpcCharacter3dHandle
} from "./RpgNpcCharacter3d";
import { getSurfaceHeight } from "./RpgWorldGeometry";
import {
  RPG_LANDMARKS,
  type RpgLandmark
} from "./RpgTownSceneLayout";

type NpcLandmark = RpgLandmark & {
  kind: "npc";
  id: NpcSpriteId;
};

function isNpcLandmark(landmark: RpgLandmark): landmark is NpcLandmark {
  return landmark.kind === "npc" && landmark.id in NPC_CHARACTER_MODELS;
}

const NPC_LANDMARKS = RPG_LANDMARKS.filter(isNpcLandmark);

function RpgNpcActor({
  landmark,
  playerPosition,
  dynamicObstacles,
  reducedMotion
}: {
  landmark: NpcLandmark;
  playerPosition: RefObject<Vector3>;
  dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  reducedMotion: boolean;
}) {
  const root = useRef<Group>(null);
  const character = useRef<RpgNpcCharacter3dHandle>(null);
  const route = useMemo(
    () => deriveNpcPatrolRoute(landmark.id, landmark.variant ?? 0),
    [landmark.id, landmark.variant]
  );
  const pose = useRef(createNpcPatrolPose());
  const obstaclePosition = useRef<[number, number, number]>([0, 0, 0]);
  const model = NPC_CHARACTER_MODELS[landmark.id];
  const obstacle = useMemo<RpgCameraDynamicObstacle>(
    () => ({
      position: obstaclePosition.current,
      size: [0.56, model.visibleHeight, 0.56],
      yaw: 0,
      clearance: RPG_NPC_CAMERA_CLEARANCE
    }),
    [model.visibleHeight]
  );

  useEffect(() => {
    dynamicObstacles.current.set(landmark.id, obstacle);
    return () => {
      dynamicObstacles.current.delete(landmark.id);
    };
  }, [dynamicObstacles, landmark.id, obstacle]);

  useFrame(({ clock }) => {
    evaluateNpcPatrolMotionInto(
      route,
      clock.elapsedTime,
      reducedMotion,
      pose.current
    );
    const surfaceHeight = getSurfaceHeight([pose.current.x, pose.current.z]);
    root.current?.position.set(
      pose.current.x,
      surfaceHeight + pose.current.bob,
      pose.current.z
    );
    obstaclePosition.current[0] = pose.current.x;
    obstaclePosition.current[1] = surfaceHeight + model.visibleHeight / 2;
    obstaclePosition.current[2] = pose.current.z;
    obstacle.yaw = pose.current.yaw;
    character.current?.applyPose(pose.current);
  });

  return (
    <group ref={root}>
      <RpgNpcCharacter3d
        ref={character}
        npcId={landmark.id}
        variant={landmark.variant ?? 0}
        playerPosition={playerPosition}
      />
    </group>
  );
}

export function RpgNpcCrowd({
  playerPosition,
  dynamicObstacles,
  reducedMotion
}: {
  playerPosition: RefObject<Vector3>;
  dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  reducedMotion: boolean;
}) {
  return (
    <group name="rpg-npc-crowd">
      {NPC_LANDMARKS.map((landmark) => (
        <RpgNpcActor
          key={landmark.id}
          landmark={landmark}
          playerPosition={playerPosition}
          dynamicObstacles={dynamicObstacles}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}
```

Create the bus actor around the existing mutable runtime:

```tsx
// app/world/RpgAirportBusActor.tsx
export function RpgAirportBusActor({
  runtime,
  dynamicObstacles,
  reducedMotion
}: {
  runtime: RpgBusRuntime;
  dynamicObstacles: RefObject<Map<string, RpgCameraDynamicObstacle>>;
  reducedMotion: boolean;
}) {
  const root = useRef<Group>(null);
  const leftDoor = useRef<Group>(null);
  const wheels = useRef<Group[]>([]);
  const obstacle = useMemo<RpgCameraDynamicObstacle>(
    () => ({
      position: runtime.pose.position,
      size: RPG_BUS_DEFAULT_SIZE,
      yaw: runtime.pose.yaw,
      clearance: RPG_BUS_ACTOR_CLEARANCE
    }),
    [runtime]
  );

  useEffect(() => {
    dynamicObstacles.current.set("airport-bus", obstacle);
    return () => {
      dynamicObstacles.current.delete("airport-bus");
    };
  }, [dynamicObstacles, obstacle]);

  useFrame((_, delta) => {
    advanceRpgBusRuntime(runtime, delta, reducedMotion);
    root.current?.position.fromArray(runtime.pose.position);
    if (root.current) root.current.rotation.y = runtime.pose.yaw;
    obstacle.yaw = runtime.pose.yaw;
    if (leftDoor.current) {
      const open = runtime.snapshot.leftDoorOpenAmount;
      leftDoor.current.position.set(
        AIRPORT_BUS_DOOR_CLOSED_POSITION.x - open * 0.09,
        AIRPORT_BUS_DOOR_CLOSED_POSITION.y,
        AIRPORT_BUS_DOOR_CLOSED_POSITION.z + open * 0.76
      );
    }
    for (const wheel of wheels.current) {
      if (wheel) wheel.rotation.x = runtime.pose.wheelRotation;
    }
  }, -2.5);

  return (
    <group
      ref={root}
      position={runtime.pose.position}
      name="rpg-airport-bus"
      userData={{ cameraOccluder: true, landmarkId: "airport-bus" }}
    >
      <group position={[0, -1.075, 0]}>
        <AirportBusModel leftDoor={leftDoor} wheelRefs={wheels} />
      </group>
    </group>
  );
}
```

Export the existing `AirportBusModel` and `AIRPORT_BUS_DOOR_CLOSED_POSITION` from `AirportBusVisual.tsx` and add an optional caller-owned four-wheel ref array; the historical `AirportBusVisual` keeps its existing behavior when the prop is omitted. The actor offsets that ground-authored model by `-1.075` below the shared center pose, so tire bottoms land at `y=0 ±0.02`. Apply `runtime.snapshot.leftDoorOpenAmount` to the same exported `leftDoor` ref and `runtime.pose.wheelRotation` to all four wheel refs. Do not instantiate `createAirportBus()` or a second route controller in `RpgAirportBusActor`. The bus `useFrame` priority `-2.5` runs after ambience `-3`, before camera input `-2`, and before Task 7's player runtime priority `-1`.

Update `RpgTownSceneProps` with `playerPosition`, `dynamicObstacles`, `busRuntime`, and `reducedMotion`. Mount `<RpgAirportBusActor>` and `<RpgNpcCrowd>` after static landmarks, and change `RPG_TOWN_SCENE_RENDER_CONTRACT.npcCrowd` plus its test expectation from `false` to `true`. Extend `tests/rpg-town-scene-instancing.test.ts` to assert that the bus exists only in `RpgAirportBusActor`, NPCs exist only in `RpgNpcCrowd`, and `RpgSignatureLandmarks` returns `null` for both dynamic kinds.

- [ ] **Step 5: Re-enable character and motion suites**

Remove these paths from `ACTIVE_UNIT_EXCLUDES`; do not mutate historical `RETIRED_UNIT_SUITES`:

```ts
"tests/rpg-npc-glb-renderer.test.ts",
"tests/npc-patrol-motion.test.ts",
"tests/rpg-bus-motion.test.ts"
```

After removing those three paths, `ACTIVE_UNIT_EXCLUDES` is empty. Keep it exported for the G007-preserving active/historical separation.

- [ ] **Step 6: Run actor and model tests**

Run:

```bash
npm run test:unit -- --run tests/rpg-character-motion-3d.test.ts tests/rpg-player-glb-renderer.test.ts tests/rpg-npc-character-3d.test.ts tests/rpg-npc-glb-renderer.test.ts tests/npc-patrol-motion.test.ts tests/rpg-bus-motion.test.ts tests/rpg-town-scene-instancing.test.ts tests/rpg-character-model-contract.test.ts tests/world-runtime.test.ts
```

Expected: PASS with male/female player GLBs and four NPC GLBs loaded by the 3D components.

- [ ] **Step 7: Commit and push**

```bash
git add app/world/RpgPlayerActor.tsx app/world/RpgNpcCrowd.tsx app/world/RpgAirportBusActor.tsx app/world/AirportBusVisual.tsx app/world/RpgCharacterMotion3d.ts app/world/RpgTownScene.tsx vitest.config.ts tests/rpg-character-motion-3d.test.ts tests/rpg-player-glb-renderer.test.ts tests/rpg-npc-glb-renderer.test.ts tests/npc-patrol-motion.test.ts tests/rpg-bus-motion.test.ts tests/rpg-town-scene-instancing.test.ts tests/world-runtime.test.ts
git commit -m "Connect the 3D player NPCs and airport bus" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 7: Assemble and Activate the Seamless WebGL Canvas

**Files:**
- Create: `app/world/RpgSceneRuntime.tsx`
- Create: `app/world/WorldNavigationPublisher.ts`
- Create: `app/world/ChaseOrbitCamera3d.tsx`
- Create: `app/world/AdaptiveQualityMonitor.tsx`
- Create: `app/world/RpgRuntimeDiagnostics.ts`
- Create: `app/world/SeamlessWorldCanvas.tsx`
- Modify: `app/world/WorldRuntime.ts`
- Modify: `app/world/RpgNpcCharacter3d.tsx`
- Modify: `app/world/RpgTownScene.tsx`
- Modify: `app/world/WorldView.tsx:1-310`
- Modify: `app/globals.css`
- Modify: `vitest.config.ts`
- Test: `tests/rpg-camera-collision.test.ts`
- Test: `tests/rpg-camera-occlusion.test.ts`
- Test: `tests/rpg-camera-safety.test.ts`
- Create: `tests/world-navigation-publisher.test.ts`
- Test: `tests/world-mini-map-integration.test.tsx`
- Test: `tests/start-experience.test.tsx`
- Test: `tests/e2e/world.spec.ts`

**Interfaces:**
- Consumes: `WorldRuntime`, input controller, player and scene components.
- Produces: `SeamlessWorldCanvasProps`.
- Produces: `ChaseOrbitCamera3dProps.telemetry: RefObject<HTMLDivElement | null>`.
- Emits: `onNavigationChange(snapshot)` at 10Hz or immediately on region/interaction change.
- Writes telemetry: `data-world-renderer`, `data-renderer-technology`, `data-world-ready`, `data-player-position`, `data-navigation-revision`, `data-navigation-region`, camera boom/safety/diagnostic values.
- Extends: `WorldRuntime.getCameraState()` so the runtime, not React state, owns the mutable chase-camera state.

- [ ] **Step 1: Write the active renderer integration test**

```tsx
it("loads SeamlessWorldCanvas instead of FlatWorldCanvas", () => {
  const source = readFileSync("app/world/WorldView.tsx", "utf8");
  expect(source).toContain('import("./SeamlessWorldCanvas")');
  expect(source).not.toContain('import("./FlatWorldCanvas")');
});

it("publishes one shared 3D navigation snapshot", () => {
  const navigation = createInitialWorldNavigationSnapshot();
  const consumers = shareWorldNavigationSnapshot(navigation);
  expect(consumers.guide).toBe(navigation);
  expect(consumers.miniMap).toBe(navigation);
  expect(consumers.worldMap).toBe(navigation);
  expect(consumers.telemetry).toBe(navigation);
});

it("publishes a moved position within 100ms and region changes immediately", () => {
  const published: Array<{ at: number; revision: number }> = [];
  const publisher = createWorldNavigationPublisher((at, snapshot) => {
    published.push({ at, revision: snapshot.revision });
  });
  const runtime = createWorldRuntime();
  publisher.offer(0, runtime.getNavigationSnapshot());
  runtime.setMovement({ x: 1, y: 0, runRequested: false });
  runtime.advance(0.01, 0);
  const moved = runtime.getNavigationSnapshot();
  publisher.offer(0.099, moved);
  expect(published).toHaveLength(1);
  publisher.offer(0.1, moved);
  expect(published.at(-1)).toEqual({ at: 0.1, revision: moved.revision });

  const changedRegion = {
    ...moved,
    revision: moved.revision + 1,
    navigationRegionId: "tokyo",
    currentZoneId: "tokyo"
  } as WorldNavigationSnapshot;
  publisher.offer(0.101, changedRegion);
  expect(published.at(-1)?.at).toBe(0.101);
});
```

- [ ] **Step 2: Run integration tests and verify failure**

Run:

```bash
npm run test:unit -- --run tests/world-navigation-publisher.test.ts tests/world-mini-map-integration.test.tsx tests/start-experience.test.tsx tests/rpg-camera-collision.test.ts
```

Expected: FAIL because `WorldView` still imports the Canvas 2D renderer.

- [ ] **Step 3: Implement the frame runtime bridge**

```tsx
// app/world/RpgSceneRuntime.tsx
export function RpgSceneRuntime({
  runtime,
  input,
  navigation,
  onNavigationChange,
  telemetry
}: {
  runtime: WorldRuntime;
  input: InputController;
  navigation: RefObject<WorldNavigationSnapshot>;
  onNavigationChange: (snapshot: WorldNavigationSnapshot) => void;
  telemetry: RefObject<HTMLDivElement | null>;
}) {
  const movement = useRef<WorldMovementIntent>({
    x: 0,
    y: 0,
    runRequested: false
  });
  const publisher = useMemo(
    () => createWorldNavigationPublisher(
      (_, snapshot) => onNavigationChange(snapshot)
    ),
    [onNavigationChange]
  );

  useFrame(({ clock }, delta) => {
    if (input.consumeReset()) runtime.reset();
    if (input.consumeJump()) runtime.jump();
    runtime.setMovement(input.readMovement(movement.current));
    runtime.advance(delta, runtime.getCameraState().yaw);
    const next = runtime.getNavigationSnapshot();
    navigation.current = next;
    if (telemetry.current) {
      telemetry.current.dataset.playerPosition = next.position.join(",");
      telemetry.current.dataset.navigationRevision = String(next.revision);
      telemetry.current.dataset.navigationRegion = next.navigationRegionId;
    }
    publisher.offer(clock.elapsedTime, next);
  }, -1);
  return null;
}
```

Implement the publisher as a pure object so its time bound is unit-testable:

```ts
// app/world/WorldNavigationPublisher.ts
export function createWorldNavigationPublisher(
  publish: (atSeconds: number, snapshot: WorldNavigationSnapshot) => void,
  intervalSeconds = 0.1
) {
  let lastAt = Number.NEGATIVE_INFINITY;
  let lastRegionId = "";
  let lastInteractionId: string | null = null;
  return {
    offer(atSeconds: number, snapshot: WorldNavigationSnapshot) {
      const urgent =
        snapshot.navigationRegionId !== lastRegionId ||
        snapshot.nearInteractionId !== lastInteractionId;
      if (!urgent && atSeconds - lastAt + 1e-9 < intervalSeconds) return false;
      lastAt = atSeconds;
      lastRegionId = snapshot.navigationRegionId;
      lastInteractionId = snapshot.nearInteractionId;
      publish(atSeconds, snapshot);
      return true;
    }
  };
}
```

In `WorldRuntime.ts`, create one `ChaseOrbitCameraState` inside `createWorldRuntime` and expose only `getCameraState()`:

```ts
const cameraState = createChaseOrbitCameraState();

// inside reset()
Object.assign(cameraState, createChaseOrbitCameraState());

// in the returned public API
getCameraState() {
  return cameraState;
}
```

There is no camera state in React and no second camera state in `SeamlessWorldCanvas`.

Add a production-visible, read-only mount counter for the performance gate:

```ts
// app/world/RpgRuntimeDiagnostics.ts
export interface RpgRuntimeDiagnostics {
  canvasMounts: number;
  runtimeCreates: number;
  sceneMounts: number;
}

const diagnostics: RpgRuntimeDiagnostics = {
  canvasMounts: 0,
  runtimeCreates: 0,
  sceneMounts: 0
};

export function markRpgRuntimeDiagnostic(
  key: keyof RpgRuntimeDiagnostics
) {
  diagnostics[key] += 1;
  if (typeof window !== "undefined") {
    window.__RPG_RUNTIME_DIAGNOSTICS__ = Object.freeze({ ...diagnostics });
  }
}

export function readRpgRuntimeDiagnostics() {
  return Object.freeze({ ...diagnostics });
}
```

Declare the window field in the same module. Mark `runtimeCreates` in the `useMemo` factory, `canvasMounts` in a mount-only effect in `SeamlessWorldCanvas`, and `sceneMounts` in a mount-only effect in `RpgTownScene`. Do not decrement: the performance assertion is exactly `{ canvasMounts: 1, runtimeCreates: 1, sceneMounts: 1 }` from one page load through all five regions.

- [ ] **Step 4: Implement the Three camera component**

`ChaseOrbitCamera3d.tsx` uses two ordered frame callbacks:

- priority `-2`: consume drag, call `advanceChaseOrbitCamera` on `runtime.getCameraState()`, and thereby make the current yaw available to movement in the same frame;
- priority `0`: calculate the desired position, call `resolveRpgCameraOrbitCollisionInto`, apply position half-life `0.12`, quaternion rotation half-life `0.18`, and FOV `45°` desktop or `52°` mobile.

Its props include this required telemetry sink; no camera component performs a DOM query:

```ts
interface ChaseOrbitCamera3dProps {
  // Existing runtime, input, navigation, player and obstacle props.
  telemetry: RefObject<HTMLDivElement | null>;
}
```

```ts
const state = runtime.getCameraState();
const focus = focusPoint.current.set(
  playerPosition.current.x,
  playerPosition.current.y + 1.15,
  playerPosition.current.z
);
const horizontal = Math.cos(state.pitch) * state.distance;
desired.set(
  focus.x - Math.sin(state.yaw) * horizontal,
  focus.y + Math.sin(state.pitch) * state.distance,
  focus.z - Math.cos(state.yaw) * horizontal
);
resolveRpgCameraOrbitCollisionInto(
  {
    player: [focus.x, focus.y, focus.z],
    desiredCamera: [desired.x, desired.y, desired.z],
    dynamicObstacles: collectRpgCameraDynamicObstacles(
      dynamicObstacles.current,
      collisionObstacles.current
    )
  },
  resolved.current
);
if (resolved.current.every(Number.isFinite)) {
  safePosition.current.fromArray(resolved.current);
}
camera.position.lerp(
  safePosition.current,
  1 - Math.pow(0.5, delta / 0.12)
);
lookTarget.current.position.copy(camera.position);
lookTarget.current.lookAt(focus);
camera.quaternion.slerp(
  lookTarget.current.quaternion,
  1 - Math.pow(0.5, delta / 0.18)
);
```

Use `const resolved = useRef<[number, number, number]>([0, 0, 0])`; `resolveRpgCameraOrbitCollisionInto` does not accept a `Vector3`. If the resolved tuple is non-finite, keep `safePosition` unchanged and publish `data-camera-diagnostic="non-finite-collision"`. Update `PerspectiveCamera.fov` only when its target changes and call `updateProjectionMatrix()`.

`collectRpgCameraDynamicObstacles` clears and refills a caller-owned array from `Map.values()` and returns that same array; it must not allocate per frame.

After collision resolution, raycast from `focus` to the safe camera position. Walk each hit up to its first ancestor with `userData.cameraOccluder === true`. Only uniquely material-owned signature landmarks enter `advanceRpgCameraOcclusion`; preserve/restore their original `transparent` and `opacity` values and restore all touched materials on unmount. If a ray hits an `InstancedMesh`, never change its shared material: publish `data-camera-diagnostic="batched-occlusion"` and fail the narrow-alley E2E if the hit lasts `250ms`, forcing the camera proxy to be fixed instead of hiding a whole building batch. NPC line-of-sight hiding uses the same `250/100/200ms` state machine rather than an immediate visibility toggle.

Pass `getRpgPlayerCharacterDesign(character).height` into `ChaseOrbitCamera3d` as `playerVisibleHeight`. Project the player's foot point and `surfaceHeight + playerVisibleHeight` point every frame, call `calculateRpgCameraSafetyCorrection`, and apply Task 4's clamped world-space correction. Track continuous violation time in a ref and write these values on every frame without React state:

```ts
const boom = camera.position.distanceTo(focus);
const telemetryNode = telemetry.current;
if (telemetryNode) {
  telemetryNode.dataset.cameraYaw = String(state.yaw);
  telemetryNode.dataset.cameraBoom = String(boom);
  telemetryNode.dataset.cameraSafeViolationMs = String(
    Math.round(safetyViolationSeconds.current * 1000)
  );
  telemetryNode.dataset.cameraSafe = String(
    safetyViolationSeconds.current <= 0.25
  );
  telemetryNode.dataset.cameraRecentering = String(
    inputIsMoving &&
    elapsedSeconds - state.lastManualInputSeconds >= 0.8 &&
    Math.abs(shortestCameraYawError(state.yaw, headingYaw)) >
      5 * Math.PI / 180
  );
  telemetryNode.dataset.cameraDiagnostic = !collisionIsFinite
    ? "non-finite-collision"
    : batchedOcclusionSeconds.current >= 0.25
      ? "batched-occlusion"
      : "ok";
}
```

The E2E fails on any `cameraSafeViolationMs > 250`, boom below `2.6`, `batched-occlusion`, or non-finite diagnostic.

- [ ] **Step 5: Extract the adaptive quality frame monitor**

```tsx
// app/world/AdaptiveQualityMonitor.tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { createAdaptiveQuality } from "./AdaptiveQuality";
import type { SceneQualityLevel } from "./SceneQuality";

export interface AdaptiveQualityMonitorProps {
  initialLevel: SceneQualityLevel;
  onLevelChange: (level: SceneQualityLevel) => void;
}

export function AdaptiveQualityMonitor({
  initialLevel,
  onLevelChange
}: AdaptiveQualityMonitorProps) {
  const adaptive = useRef(createAdaptiveQuality({ initialLevel }));
  const lastLevel = useRef(initialLevel);
  useFrame((_, delta) => {
    const next = adaptive.current.recordFrame(delta);
    if (next !== lastLevel.current) {
      lastLevel.current = next;
      onLevelChange(next);
    }
  });
  return null;
}
```

- [ ] **Step 6: Assemble the one persistent Canvas**

```tsx
// app/world/SeamlessWorldCanvas.tsx
"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import {
  Suspense,
  memo,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

export interface SeamlessWorldCanvasProps {
  character: PlayerCharacterId;
  input: InputController;
  activeDestinationId: DestinationId | null;
  onNavigationChange: (snapshot: WorldNavigationSnapshot) => void;
}

function SeamlessWorldCanvas(props: SeamlessWorldCanvasProps) {
  useEffect(() => {
    markRpgRuntimeDiagnostic("canvasMounts");
  }, []);
  const busRuntime = useMemo(() => createRpgBusRuntime(), []);
  const runtime = useMemo(
    () => {
      markRpgRuntimeDiagnostic("runtimeCreates");
      return createWorldRuntime({
        canOccupyDynamic: ([x, z]) =>
          isRpgPositionOutsideMovingBus(x, z, busRuntime.pose)
      });
    },
    [busRuntime]
  );
  const navigation = useRef(runtime.getNavigationSnapshot());
  const playerPosition = useRef(new Vector3(...navigation.current.position));
  const dynamicObstacles = useRef(
    new Map<string, RpgCameraDynamicObstacle>()
  );
  const telemetry = useRef<HTMLDivElement>(null);
  const [qualityLevel, setQualityLevel] = useState(
    detectBrowserSceneQualityLevel
  );
  const [worldReady, setWorldReady] = useState(false);
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  return (
    <div
      ref={telemetry}
      className="seamless-world-renderer"
      data-world-renderer="seamless-rpg"
      data-renderer-technology="webgl3d"
      data-world-ready={String(worldReady)}
    >
      {!worldReady ? (
        <div className="world-canvas-loading" role="status">
          Loading 3D world
        </div>
      ) : null}
      <Canvas
        camera={{ position: [0, 6, 8], fov: 45, near: 0.1, far: 140 }}
        dpr={getSceneCanvasDpr(qualityLevel)}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <Suspense fallback={null}>
          <RpgTownScene
            qualityLevel={qualityLevel}
            navigation={navigation}
            playerPosition={playerPosition}
            dynamicObstacles={dynamicObstacles}
            busRuntime={busRuntime}
            reducedMotion={reducedMotion}
          />
          <RpgPlayerActor
            character={props.character}
            navigation={navigation}
            playerPosition={playerPosition}
            qualityLevel={qualityLevel}
            reducedMotion={reducedMotion}
          />
          <RpgSceneRuntime
            runtime={runtime}
            input={props.input}
            navigation={navigation}
            onNavigationChange={props.onNavigationChange}
            telemetry={telemetry}
          />
          <ChaseOrbitCamera3d
            runtime={runtime}
            input={props.input}
            navigation={navigation}
            playerPosition={playerPosition}
            playerVisibleHeight={
              getRpgPlayerCharacterDesign(props.character).height
            }
            dynamicObstacles={dynamicObstacles}
            telemetry={telemetry}
          />
          <AdaptiveQualityMonitor
            initialLevel={qualityLevel}
            onLevelChange={setQualityLevel}
          />
          <WorldReadyMarker onReady={() => setWorldReady(true)} />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default memo(SeamlessWorldCanvas);
```

Define the marker in the same file:

```tsx
function WorldReadyMarker({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  const emitted = useRef(false);
  useFrame(() => {
    frames.current += 1;
    if (!emitted.current && frames.current >= 2) {
      emitted.current = true;
      onReady();
    }
  });
  return null;
}
```

Because it is inside the same `Suspense` boundary as the terrain and selected GLB, `data-world-ready` cannot become `true` before those resources resolve.

- [ ] **Step 7: Switch `WorldView` and add camera input**

```tsx
const WorldCanvas = dynamic(() => import("./SeamlessWorldCanvas"), {
  ssr: false,
  loading: () => <div className="world-canvas-loading" aria-hidden="true" />
});

<WorldCameraInput
  label={labels.cameraControl}
  onDrag={(deltaX, deltaY, pointerKind) =>
    input.addCameraDrag(deltaX, deltaY, pointerKind)
  }
/>
```

The mobile joystick must send `runRequested: magnitude >= 0.85`.

- [ ] **Step 8: Verify camera collision in the active slice**

Task 4 already reactivated camera collision and Task 6 left `ACTIVE_UNIT_EXCLUDES` empty. Do not mutate historical `RETIRED_UNIT_SUITES`; verify the collision suite still passes after Three camera integration.

Run:

```bash
npm run test:unit -- --run tests/world-runtime.test.ts tests/world-navigation-publisher.test.ts tests/chase-orbit-camera.test.ts tests/rpg-camera-collision.test.ts tests/rpg-camera-occlusion.test.ts tests/rpg-camera-safety.test.ts tests/world-mini-map-integration.test.tsx tests/start-experience.test.tsx tests/rpg-bus-motion.test.ts
npm run typecheck -- --incremental false
```

Expected: PASS; TypeScript reports no old `FlatWorldNavigationSnapshot` or travel callback in the active path.

- [ ] **Step 9: Run a local WebGL smoke**

Run:

```bash
npx playwright test tests/e2e/world.spec.ts --config=playwright.config.ts --grep "enters the seamless WebGL world"
```

`playwright.config.ts` owns the production build/server lifecycle on port `4173`; do not start a second server on that port. Expected: PASS with `.seamless-world-renderer[data-renderer-technology="webgl3d"][data-world-ready="true"]`.

- [ ] **Step 10: Commit and push**

```bash
git add app/world/RpgSceneRuntime.tsx app/world/WorldNavigationPublisher.ts app/world/ChaseOrbitCamera3d.tsx app/world/AdaptiveQualityMonitor.tsx app/world/RpgRuntimeDiagnostics.ts app/world/SeamlessWorldCanvas.tsx app/world/WorldRuntime.ts app/world/RpgNpcCharacter3d.tsx app/world/RpgTownScene.tsx app/world/WorldView.tsx app/globals.css vitest.config.ts tests/world-navigation-publisher.test.ts tests/rpg-camera-collision.test.ts tests/rpg-camera-occlusion.test.ts tests/rpg-camera-safety.test.ts tests/world-mini-map-integration.test.tsx tests/start-experience.test.tsx tests/e2e/world.spec.ts
git commit -m "Activate the seamless WebGL RPG world" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 8: Add Proximity-Based NPC and Entrance Interactions

**Files:**
- Create: `app/world/WorldInteraction.ts`
- Create: `app/world/WorldInteractionPrompt.tsx`
- Modify: `app/world/WorldNavigationState.ts`
- Modify: `app/world/WorldRuntime.ts`
- Modify: `app/world/RpgSceneRuntime.tsx`
- Modify: `app/world/SeamlessWorldCanvas.tsx`
- Modify: `app/world/PortfolioGuide.tsx:1-121`
- Modify: `app/world/WorldView.tsx`
- Modify: `app/i18n/messages.ts`
- Modify: `app/globals.css`
- Create: `tests/world-interaction.test.ts`
- Modify: `tests/portfolio-guide.test.tsx`
- Modify: `tests/start-experience.test.tsx`
- Modify: `tests/messages.test.ts`

**Interfaces:**
- Produces: `WORLD_INTERACTION_TARGETS`, `findWorldInteractionTarget`.
- Produces: controlled `PortfolioGuideProps.requestedEntryId`.
- Emits: `onInteractionRequest(entryId)`.

- [ ] **Step 1: Write proximity, facing, and resume tests**

```ts
import { describe, expect, it } from "vitest";
import {
  findWorldInteractionTarget,
  WORLD_INTERACTION_TARGETS
} from "../app/world/WorldInteraction";

describe("world interaction", () => {
  it("requires proximity and facing", () => {
    expect(findWorldInteractionTarget({
      position: [-32, 0, 0],
      heading: [1, 0, 0]
    })?.id).toBe("airport-terminal-entry");
    expect(findWorldInteractionTarget({
      position: [-32, 0, 0],
      heading: [-1, 0, 0]
    })).toBeNull();
  });

  it("maps five places to portfolio entries", () => {
    expect(new Set(WORLD_INTERACTION_TARGETS.map(({ zoneId }) => zoneId)))
      .toEqual(new Set(["airport", "tokyo", "gyukatsu", "sakura", "hanabi"]));
    expect(
      WORLD_INTERACTION_TARGETS.filter(({ actorId }) => actorId).map(
        ({ actorId }) => actorId
      )
    ).toHaveLength(7);
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:unit -- --run tests/world-interaction.test.ts tests/portfolio-guide.test.tsx
```

Expected: FAIL because the world has no proximity interaction contract.

- [ ] **Step 3: Implement interaction targets and facing**

```ts
// app/world/WorldInteraction.ts
import type { DestinationId } from "../guide/GuideContract";
import type { WorldPoint3 } from "./RpgWorldModel";
import { RPG_LANDMARKS } from "./RpgTownSceneLayout";

export interface WorldInteractionTarget {
  id: string;
  zoneId: DestinationId;
  position: WorldPoint3;
  radius: number;
  entryId: "world-design" | "character-controls" | "ai-guide";
  actorId?: string;
}

const ENTRY_BY_ZONE = {
  airport: "world-design",
  tokyo: "world-design",
  gyukatsu: "character-controls",
  sakura: "character-controls",
  hanabi: "ai-guide"
} as const;

const ENTRANCE_INTERACTION_TARGETS = [
  { id: "airport-terminal-entry", zoneId: "airport", position: [-30, 0, 0], radius: 2.5, entryId: "world-design" },
  { id: "tokyo-boulevard-entry", zoneId: "tokyo", position: [-8, 0, 20], radius: 2.5, entryId: "world-design" },
  { id: "gyukatsu-shop-entry", zoneId: "gyukatsu", position: [8, 0, 0], radius: 2.5, entryId: "character-controls" },
  { id: "sakura-bridge-entry", zoneId: "sakura", position: [9, 0, -20], radius: 2.5, entryId: "character-controls" },
  { id: "hanabi-torii-entry", zoneId: "hanabi", position: [26, 0, -18], radius: 2.5, entryId: "ai-guide" }
] as const satisfies readonly WorldInteractionTarget[];

const NPC_INTERACTION_TARGETS = RPG_LANDMARKS
  .filter((landmark) => landmark.kind === "npc")
  .map((landmark) => ({
    id: landmark.id,
    actorId: landmark.id,
    zoneId: landmark.zoneId,
    position: landmark.position,
    radius: 2.1,
    entryId: ENTRY_BY_ZONE[landmark.zoneId]
  } satisfies WorldInteractionTarget));

export const WORLD_INTERACTION_TARGETS: readonly WorldInteractionTarget[] =
  Object.freeze([
    ...ENTRANCE_INTERACTION_TARGETS,
    ...NPC_INTERACTION_TARGETS
  ]);

const EMPTY_TARGET_SET: ReadonlySet<string> = new Set();

export function findWorldInteractionTarget({
  position,
  heading,
  unavailableTargetIds = EMPTY_TARGET_SET
}: {
  position: WorldPoint3;
  heading: WorldPoint3;
  unavailableTargetIds?: ReadonlySet<string>;
}) {
  for (const target of WORLD_INTERACTION_TARGETS) {
    if (unavailableTargetIds.has(target.id)) continue;
    const dx = target.position[0] - position[0];
    const dz = target.position[2] - position[2];
    const distance = Math.hypot(dx, dz);
    if (distance > target.radius || distance < 1e-6) continue;
    const facing = (dx * heading[0] + dz * heading[2]) / distance;
    if (facing >= Math.cos(Math.PI / 3)) return target;
  }
  return null;
}
```

- [ ] **Step 4: Add the prompt and controlled portfolio opening**

```tsx
// app/world/WorldInteractionPrompt.tsx
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
```

Extend `PortfolioGuide` with:

```ts
interface PortfolioGuideProps {
  labels: PortfolioLabels;
  requestedEntryId: string | null;
  onOpenChange: (open: boolean) => void;
  onRequestHandled: () => void;
}
```

When `requestedEntryId` matches an entry, open that entry, call `onOpenChange(true)`, and clear the request through `onRequestHandled`. On close call `onOpenChange(false)`.

Preserve the existing `Escape` listener in `PortfolioGuide`. It must call the same `closePortfolio` path as the close button, clear the active entry, call `onOpenChange(false)`, and restore focus. Extend `tests/portfolio-guide.test.tsx`: open a requested NPC entry, press `Escape`, assert the dialog is removed, `onOpenChange(false)` is emitted exactly once for that close, and `onRequestHandled` is not emitted a second time.

- [ ] **Step 5: Lock movement while an interaction is open**

In `WorldRuntime.snapshot`, calculate `nearInteractionId` with `findWorldInteractionTarget({ position, heading })`; no UI component performs its own distance calculation.

Add `inputLocked` and `onInteractionRequest` props to `RpgSceneRuntime`. When locked, call `runtime.setMovement({ x: 0, y: 0, runRequested: false })`, do not call `jump`, and leave the camera/effects frame callbacks running. When unlocked, consume `input.consumeInteraction()` after `runtime.advance`; if the current target exists, emit its `entryId` exactly once. The on-screen prompt calls the same handler.

Extend the 10Hz publication guard so a `nearInteractionId` change publishes immediately, just like a `navigationRegionId` change.

`WorldView` owns `interactionOpen`, calls `input.reset()` when it becomes true, and resumes from the unchanged snapshot when it becomes false. Add a component test that stores `position` and `heading` before opening, advances at least 30 frames while open, closes, and asserts both values are unchanged.

The same component test closes the interaction with `Escape`, not only the pointer close button. It asserts `interactionOpen=false`, the prompt can become available again, and navigation position, heading, and revision do not change because of the dismissal. If the full map is open, its own `Escape` handler closes only the map; no `Escape` path may queue a gameplay action.

- [ ] **Step 6: Run interaction and UI tests**

Run:

```bash
npm run test:unit -- --run tests/world-interaction.test.ts tests/portfolio-guide.test.tsx tests/start-experience.test.tsx tests/messages.test.ts
```

Expected: PASS; interaction opens the mapped portfolio entry and closing it preserves the player position.

- [ ] **Step 7: Commit and push**

```bash
git add app/world/WorldInteraction.ts app/world/WorldInteractionPrompt.tsx app/world/WorldNavigationState.ts app/world/WorldRuntime.ts app/world/RpgSceneRuntime.tsx app/world/SeamlessWorldCanvas.tsx app/world/PortfolioGuide.tsx app/world/WorldView.tsx app/i18n/messages.ts app/globals.css tests/world-interaction.test.ts tests/portfolio-guide.test.tsx tests/start-experience.test.tsx tests/messages.test.ts
git commit -m "Add in-world RPG interactions" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 9: Add Loading, Recovery, Asset Fallback, and Performance Telemetry

**Files:**
- Create: `app/world/WorldCapability.ts`
- Create: `app/world/WorldBootstrap.ts`
- Create: `app/world/WorldPerformanceSampler.ts`
- Create: `app/world/WorldPerformanceMonitor.tsx`
- Create: `app/world/RpgAssetBoundary.tsx`
- Create: `app/world/RpgFallbackCharacter3d.tsx`
- Create: `app/world/RpgOptionalDecoration.tsx`
- Create: `public/assets/world/hanabi-festival-sign.svg`
- Modify: `app/world/RpgPlayerActor.tsx`
- Modify: `app/world/RpgNpcCrowd.tsx`
- Modify: `app/world/RpgTownScene.tsx`
- Modify: `app/world/RpgTownAmbience.tsx`
- Modify: `app/world/RpgTownDetails.tsx`
- Modify: `app/world/RpgSignatureLandmarks.tsx`
- Modify: `app/world/RpgWorldEffects.tsx`
- Modify: `app/world/WorldInteraction.ts`
- Modify: `app/world/WorldRuntime.ts`
- Modify: `app/world/WorldErrorBoundary.tsx:1-36`
- Modify: `app/world/SeamlessWorldCanvas.tsx`
- Modify: `app/world/AdaptiveQualityMonitor.tsx`
- Modify: `app/world/AdaptiveQuality.ts`
- Modify: `app/world/SceneQuality.ts`
- Modify: `app/world/WorldView.tsx`
- Modify: `app/globals.css`
- Create: `tests/world-capability.test.ts`
- Create: `tests/world-bootstrap.test.ts`
- Create: `tests/world-performance-sampler.test.ts`
- Create: `tests/rpg-asset-boundary.test.tsx`
- Create: `tests/seamless-world-canvas-recovery.test.tsx`
- Modify: `tests/world-error-boundary.test.tsx`
- Modify: `tests/adaptive-quality.test.ts`
- Modify: `tests/scene-quality.test.ts`
- Modify: `tests/world-interaction.test.ts`
- Modify: `tests/e2e/world.spec.ts`

**Interfaces:**
- Produces: `supportsWebGl()`.
- Produces: `createWorldBootstrap({ createRuntime })` as the deterministic core-data/runtime injection boundary.
- Produces: `createWorldPerformanceSampler()`.
- Produces: `<WorldPerformanceMonitor />` with a 2-second telemetry publication cadence.
- Writes: `data-quality-stage` and typed `window.__RPG_PERFORMANCE__`.
- Produces: `WorldErrorBoundary` with `onRetry` and `resetKey`.
- Produces: `SeamlessWorldDependencies.SceneComponent` as the deterministic scene-render exception injection seam.
- Produces: player GLB fallback and per-NPC omission without stopping the scene.
- Produces: ordered quality degradation `pixel ratio → shadows → fireworks → far decorations → NPC secondary motion`.
- Produces: `WorldRuntime.setInteractionTargetAvailable(id, available)` so a failed NPC cannot leave a ghost prompt.

- [ ] **Step 1: Write failure and performance tests**

```ts
it("rejects missing WebGL without constructing the world", () => {
  expect(supportsWebGl(() => null)).toBe(false);
});

it("surfaces an injected core bootstrap failure", () => {
  const failure = new Error("injected world model failure");
  expect(() =>
    createWorldBootstrap({
      createRuntime: () => {
        throw failure;
      }
    })
  ).toThrow(failure);
});

it("computes average, p5 FPS, and long frames", () => {
  const sampler = createWorldPerformanceSampler();
  for (let index = 0; index < 120; index += 1) {
    sampler.recordFrame(1 / 60);
  }
  sampler.recordFrame(0.3);
  expect(sampler.read()).toMatchObject({
    averageFps: expect.any(Number),
    p5Fps: expect.any(Number),
    longFrameCount: 1
  });
});

it("degrades quality in the required order without removing core world layers", () => {
  const expected = [
    "full",
    "pixel-ratio",
    "shadows",
    "fireworks",
    "far-decorations",
    "npc-secondary-motion"
  ] as const;
  const quality = createAdaptiveQuality({
    initialLevel: "high",
    lowSamplesBeforeChange: 1
  });
  expect(quality.getStage()).toBe(expected[0]);
  for (const stage of expected.slice(1)) {
    runFrames(quality, 30, 2);
    expect(quality.getStage()).toBe(stage);
  }
  const settings = getSceneQuality({
    level: "high",
    reducedMotion: false,
    degradationStage: quality.getStage()
  });
  expect(settings.coreLayers).toEqual({
    terrain: true,
    roads: true,
    collision: true,
    landmarks: true,
    player: true
  });
  expect(settings.npcSecondaryMotion).toBe(false);
});
```

```tsx
it("retries an error boundary with a new reset key", async () => {
  const user = userEvent.setup();
  const onRetry = vi.fn();
  render(
    <WorldErrorBoundary
      resetKey={0}
      onRetry={onRetry}
      fallback={({ retry }) => <button onClick={retry}>Retry</button>}
    >
      <BrokenWorld />
    </WorldErrorBoundary>
  );
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});
```

In `tests/seamless-world-canvas-recovery.test.tsx`, define module-scope `let mockCanvasMountCount = 0` and reset it in `beforeEach`. Mock only the R3F `Canvas`/`useFrame` host and the non-scene frame actors. The mock Canvas starts with `childrenReady=false`; in one mount-only effect it increments `mockCanvasMountCount` and sets `childrenReady=true`, then renders its children. This ensures the Canvas mount is observable before the injected scene throws, matching R3F's separate scene root. The mock `useFrame` invokes the ready-marker callback twice from an effect. Mock `RpgPlayerActor`, `RpgSceneRuntime`, `ChaseOrbitCamera3d`, `AdaptiveQualityMonitor`, and `WorldPerformanceMonitor` as `() => null`, so only the injected scene and ready marker execute. Register `error` and `unhandledrejection` listeners into a local `unhandledErrors: unknown[]` and remove them in `afterEach`.

`RecoveryHarness` owns `resetKey`, one stable input controller, and the required production props. It wraps `<SeamlessWorldCanvas key={resetKey}>` in the real `WorldErrorBoundary`; its `onRetry` calls `beforeRetry()` and then increments the key. Inject a `SceneComponent` that throws `new Error("injected WorldScene render failure")` while a mutable `failScene` flag is true:

```tsx
it("rebuilds exactly one Canvas/runtime pair after a WorldScene render error", async () => {
  const user = userEvent.setup();
  const createRuntime = vi.fn(() => createWorldRuntime());
  const supportsWebGl = vi.fn(() => true);
  let failScene = true;
  const InjectedScene: ComponentType<RpgTownSceneProps> = (props) => {
    void props;
    if (failScene) throw new Error("injected WorldScene render failure");
    return null;
  };

  const { container } = render(
    <RecoveryHarness
      dependencies={{
        createRuntime,
        SceneComponent: InjectedScene,
        supportsWebGl
      }}
      beforeRetry={() => {
        failScene = false;
      }}
    />
  );

  expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  expect(unhandledErrors).toEqual([]);
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => {
    expect(container.querySelector(".seamless-world-renderer"))
      .toHaveAttribute("data-world-ready", "true");
  }, { timeout: 10_000 });
  expect(createRuntime).toHaveBeenCalledTimes(2);
  expect(supportsWebGl).toHaveBeenCalledTimes(2);
  expect(mockCanvasMountCount).toBe(2);
  expect(unhandledErrors).toEqual([]);
});
```

The assertions prove one failed pair plus exactly one replacement pair; no third construction is allowed.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm run test:unit -- --run tests/world-capability.test.ts tests/world-bootstrap.test.ts tests/world-performance-sampler.test.ts tests/world-error-boundary.test.tsx tests/seamless-world-canvas-recovery.test.tsx tests/rpg-asset-boundary.test.tsx tests/adaptive-quality.test.ts tests/scene-quality.test.ts tests/world-interaction.test.ts
```

Expected: FAIL because capability, bootstrap and `SceneComponent` injection, telemetry, ordered quality settings, and retry APIs do not exist.

- [ ] **Step 3: Implement WebGL capability and performance sampling**

```ts
// app/world/WorldCapability.ts
export function supportsWebGl(
  getContext: (name: "webgl2" | "webgl") => unknown = (name) =>
    document.createElement("canvas").getContext(name)
) {
  try {
    return Boolean(getContext("webgl2") || getContext("webgl"));
  } catch {
    return false;
  }
}
```

```ts
// app/world/WorldPerformanceSampler.ts
export function createWorldPerformanceSampler() {
  const frameSeconds: number[] = [];
  return {
    recordFrame(deltaSeconds: number) {
      if (Number.isFinite(deltaSeconds) && deltaSeconds > 0) {
        frameSeconds.push(deltaSeconds);
      }
    },
    read() {
      const sorted = [...frameSeconds].sort((a, b) => a - b);
      const total = frameSeconds.reduce((sum, value) => sum + value, 0);
      const p95Frame =
        sorted[
          Math.max(0, Math.min(
            sorted.length - 1,
            Math.ceil(sorted.length * 0.95) - 1
          ))
        ] ??
        Number.POSITIVE_INFINITY;
      return Object.freeze({
        averageFps: total > 0 ? frameSeconds.length / total : 0,
        p5Fps: Number.isFinite(p95Frame) ? 1 / p95Frame : 0,
        longFrameCount: frameSeconds.filter((value) => value > 0.25).length,
        frameCount: frameSeconds.length
      });
    }
  };
}
```

`WorldPerformanceMonitor.tsx` records `useFrame` deltas into one sampler and publishes a frozen result every 2 seconds through `onSample`. Export the sample contract from `WorldPerformanceSampler.ts`:

```ts
export interface WorldPerformanceSample {
  averageFps: number;
  p5Fps: number;
  longFrameCount: number;
  frameCount: number;
}
```

`createWorldPerformanceSampler().read()` returns `Readonly<WorldPerformanceSample>`. In `WorldPerformanceMonitor.tsx`, import that sample type and the quality-stage type, then declare the browser record:

```ts
import type { RpgQualityDegradationStage } from "./AdaptiveQuality";
import type { WorldPerformanceSample } from "./WorldPerformanceSampler";

export interface WorldPerformanceTelemetry extends WorldPerformanceSample {
  qualityStage: RpgQualityDegradationStage;
}

declare global {
  interface Window {
    __RPG_PERFORMANCE__?: WorldPerformanceTelemetry;
  }
}
```

`SeamlessWorldCanvas` stores the latest sample in refs and mirrors only the rounded values plus the current quality stage to `data-average-fps`, `data-p5-fps`, `data-long-frame-count`, `data-quality-stage`, and typed `window.__RPG_PERFORMANCE__`; it does not set React state every frame.

Replace the three-level-only adaptive transition with an ordered cumulative stage while keeping `SceneQualityLevel` as the device ceiling:

```ts
export const RPG_QUALITY_DEGRADATION_ORDER = [
  "full",
  "pixel-ratio",
  "shadows",
  "fireworks",
  "far-decorations",
  "npc-secondary-motion"
] as const;

export type RpgQualityDegradationStage =
  typeof RPG_QUALITY_DEGRADATION_ORDER[number];
```

Preserve the historical adaptive API while adding the stage API:

```ts
interface AdaptiveQuality {
  recordFrame(deltaSeconds: number): SceneQualityLevel;
  getLevel(): SceneQualityLevel;
  getStage(): RpgQualityDegradationStage;
}
```

`recordFrame` and `getLevel` keep returning a legacy `SceneQualityLevel` so the typechecked history-only `WorldCanvas.tsx` remains compatible. With `stageIndex = RPG_QUALITY_DEGRADATION_ORDER.indexOf(stage)`, use `drops = Math.min(2, stageIndex)` and return `LEVELS[Math.max(0, maximumLevelIndex - drops)]`. This preserves the existing high → medium after the first low transition, high → low after the second, and symmetric slow recovery tests. The new `AdaptiveQualityMonitor` calls `recordFrame(delta)` only to advance the sampler and compares `getStage()`; it never interprets the legacy return as a stage.

Each two consecutive low-FPS samples advances exactly one stage; four recovery samples move back exactly one stage. Tests may set `lowSamplesBeforeChange: 1` only to exercise all stages quickly. Extend `tests/adaptive-quality.test.ts` to verify both the exact stage sequence and the legacy `SceneQualityLevel` return/getter types. Extend `SceneQualityInput` with `degradationStage?: RpgQualityDegradationStage` and `coarsePointer?: boolean`, defaulting to `"full"` and `false` for existing pure callers. `getSceneQuality` applies cumulative settings:

| stage | newly changed setting |
| --- | --- |
| `full` | device-level DPR, shadows, particles, decoration range, NPC motion |
| `pixel-ratio` | cap `maxDpr` at `1.25` desktop / `1.0` coarse pointer |
| `shadows` | shadow map `1024`, update every fourth frame |
| `fireworks` | particle count `50%`, trail seconds `50%` |
| `far-decorations` | far decoration distance `18`, otherwise `48` |
| `npc-secondary-motion` | `npcSecondaryMotion=false`; patrol position remains active |

The returned settings always contain:

```ts
degradationStage,
coreLayers: {
  terrain: true,
  roads: true,
  collision: true,
  landmarks: true,
  player: true
}
```

After `getSceneQuality` in `SceneQuality.ts`, export its resolved contract:

```ts
export type SceneQualitySettings = ReturnType<typeof getSceneQuality>;
```

At `pixel-ratio` and every later stage, calculate:

```ts
maxDpr: Math.min(selected.maxDpr, coarsePointer ? 1 : 1.25)
```

Add unit cases that request the same level/stage with `coarsePointer: false` and `true` and expect `maxDpr` `1.25` and `1.0` respectively.

Modify the named `AdaptiveQualityMonitorProps` from Task 7: replace `onLevelChange(SceneQualityLevel)` with `reducedMotion: boolean`, `coarsePointer: boolean`, and `onSettingsChange(settings: SceneQualitySettings)`. The monitor owns one adaptive state, derives `getSceneQuality({ level: initialLevel, reducedMotion, degradationStage, coarsePointer })`, and emits that full frozen settings object only when the stage changes.

In `SeamlessWorldCanvas`, replace mutable `qualityLevel/setQualityLevel` with an immutable device ceiling and a separate settings state:

```ts
const reducedMotion = useMemo(
  () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  []
);
const qualityLevel = useMemo(detectBrowserSceneQualityLevel, []);
const coarsePointer = useMemo(
  () => window.matchMedia("(pointer: coarse)").matches,
  []
);
const [qualitySettings, setQualitySettings] = useState(() =>
  getSceneQuality({
    level: qualityLevel,
    reducedMotion,
    degradationStage: "full",
    coarsePointer
  })
);
```

Pass `qualityLevel`, `reducedMotion`, `coarsePointer`, and `onSettingsChange={setQualitySettings}` to the monitor. The Canvas uses `[qualitySettings.minDpr, qualitySettings.maxDpr]` directly. A stage-change effect immediately updates the root `data-quality-stage` and, when a performance record already exists, replaces it with the same sample values plus the new `qualityStage`; every later sample also reads the current stage ref. This guarantees the DOM attribute and `window.__RPG_PERFORMANCE__.qualityStage` agree even between two-second performance publications. `RpgTownAmbience` consumes the shadow-map size/update cadence, `RpgWorldEffects` consumes fireworks/particle settings, `RpgTownDetails` and `RpgSignatureLandmarks` consume far-decoration distance, and `RpgNpcCrowd` consumes `npcSecondaryMotion`. Pass one settings object through `RpgTownScene`; no consumer creates a second adaptive state, and no quality stage unmounts the Canvas or scene root.

- [ ] **Step 4: Implement retryable world errors**

Change `WorldErrorBoundary` state to `{ failed: boolean; error: Error | null }` and its props to:

```ts
interface WorldErrorBoundaryProps {
  children: ReactNode;
  resetKey: number;
  onRetry: () => void;
  fallback: (context: {
    error: Error;
    retry: () => void;
  }) => ReactNode;
}
```

Reset failed state in `componentDidUpdate` when `resetKey` changes. `retry` calls only `onRetry`; the parent increments the key and causes the reset.

`WorldView` owns `worldResetKey`, increments it on retry, and recreates `SeamlessWorldCanvas` with `key={worldResetKey}`.

`createWorldBootstrap` receives an optional `createRuntime` dependency and otherwise calls the real `createWorldRuntime`. `SeamlessWorldCanvas` calls it once in `useMemo`. Add this explicit injection contract; production callers omit it:

```ts
export interface SeamlessWorldDependencies {
  readonly createRuntime: typeof createWorldRuntime;
  readonly SceneComponent: ComponentType<RpgTownSceneProps>;
  readonly supportsWebGl: typeof supportsWebGl;
}

export const DEFAULT_SEAMLESS_WORLD_DEPENDENCIES:
  SeamlessWorldDependencies = Object.freeze({
    createRuntime: createWorldRuntime,
    SceneComponent: RpgTownScene,
    supportsWebGl
  });

export interface SeamlessWorldCanvasProps {
  character: PlayerCharacterId;
  input: InputController;
  activeDestinationId: DestinationId | null;
  onNavigationChange: (snapshot: WorldNavigationSnapshot) => void;
  onRetry: () => void;
  dependencies?: Partial<SeamlessWorldDependencies>;
}
```

At the top of `SeamlessWorldCanvas`, resolve each dependency independently with `?? DEFAULT_SEAMLESS_WORLD_DEPENDENCIES.<name>`; do not spread a new object on every render. The runtime memo calls `createWorldBootstrap({ createRuntime: () => resolvedCreateRuntime({ canOccupyDynamic }) })` exactly once. Inside the existing Canvas, mount `<SceneComponent ...sceneProps />` instead of hard-coding `<RpgTownScene>`. A render exception from that injected component must propagate to the outer `WorldErrorBoundary`.

The core-bootstrap unit test injects a throwing runtime factory. The separate `tests/seamless-world-canvas-recovery.test.tsx` injects the throwing scene component, removes the failure before retry, clicks retry, and asserts exactly one new Canvas/runtime pair reaches `data-world-ready="true"` within 10 seconds. Both tests assert zero unhandled errors and no reuse of the failed input/runtime state.

- [ ] **Step 5: Add WebGL and asset fallback UI**

Split `SeamlessWorldCanvas` into a capability wrapper and private `SupportedSeamlessWorldCanvas`. The wrapper resolves dependencies, memoizes one `supportsWebGl()` result for that keyed mount, and either renders the visible support message/retry button or mounts the supported inner component. All bus/runtime/navigation/player/quality hooks live only in `SupportedSeamlessWorldCanvas`, so unsupported WebGL constructs zero runtime objects and never violates conditional-hook ordering. The unsupported button calls the required `SeamlessWorldCanvasProps.onRetry`; do not render `FlatWorldCanvas`.

`WorldView` defines one stable `retryWorld` callback that clears the input, increments `worldResetKey`, passes it both to `WorldErrorBoundary.onRetry` and `SeamlessWorldCanvas.onRetry`, and keys the Canvas with the new reset key. While `worldReady` is false, clear the input controller. Clear it once more on the `false → true` transition so keys pressed during loading never move the player. Extend `tests/world-capability.test.ts` so the injected unsupported branch asserts `createRuntime` was called zero times before the retry.

`RpgFallbackCharacter3d.tsx` renders a foot-anchored group using one capsule body, one sphere head and an arrow-shaped front marker, and implements the same `applyPose` handle as `RpgPlayerCharacter3d`. `RpgPlayerActor` passes one shared handle ref to either the GLB or fallback branch through `RpgAssetBoundary`, so movement and facing continue after a player GLB failure.

Wrap each `RpgNpcCharacter3d` in its own `RpgAssetBoundary` with `fallback={null}`. `WorldRuntime` owns `unavailableInteractionTargetIds` and exposes:

```ts
setInteractionTargetAvailable(targetId: string, available: boolean) {
  let changed = false;
  if (available) {
    changed = unavailableInteractionTargetIds.delete(targetId);
  } else if (!unavailableInteractionTargetIds.has(targetId)) {
    unavailableInteractionTargetIds.add(targetId);
    changed = true;
  }
  if (changed) revision += 1;
}
```

Pass that set into `findWorldInteractionTarget`; the snapshot can never publish a disabled target. `RpgNpcActor` keeps `assetAvailable` state. Its boundary `onError` sets the state false, immediately deletes `dynamicObstacles.current.delete(landmark.id)`, and calls `runtime.setInteractionTargetAvailable(landmark.id, false)`. Its frame callback returns immediately while unavailable.

Replace Task 6's obstacle registration effect with an availability-guarded effect to prevent React's parent passive effect from re-adding an actor after a child error boundary fires:

```ts
useEffect(() => {
  if (!assetAvailable) {
    dynamicObstacles.current.delete(landmark.id);
    return;
  }
  dynamicObstacles.current.set(landmark.id, obstacle);
  return () => {
    dynamicObstacles.current.delete(landmark.id);
  };
}, [
  assetAvailable,
  dynamicObstacles,
  landmark.id,
  obstacle
]);
```

The immediate delete handles the current commit; the `assetAvailable=false` rerender runs the prior cleanup and the guarded effect cannot re-add the key. In `tests/rpg-asset-boundary.test.tsx`, flush passive effects with `await waitFor(...)` after the injected NPC rejection and assert both `dynamicObstacles.current.has(failedNpcId) === false` and the runtime target is unavailable. A full retry creates a fresh runtime and restores the default available set; there is no partial-state reuse.

Pass the same `WorldRuntime` instance through `SeamlessWorldCanvas → RpgTownScene → RpgNpcCrowd`; do not create or import a second runtime in an actor component.

On failure remove only that actor's dynamic obstacle and interaction target; all other NPCs, world movement, entrances, and interactions remain active. Log only `{ assetId, errorName }`, never the full request URL or error stack.

Add one optional, self-authored Hanabi sign asset at `public/assets/world/hanabi-festival-sign.svg` and load it only inside `RpgOptionalDecoration` with its own nested `Suspense fallback={null}` and `RpgAssetBoundary fallback={null}`. The outer world-ready boundary must not wait for this optional decoration. The SVG contains a `512x192` navy panel, red/gold border, and simple geometric firework marks; it contains no embedded external URL, font, script, or metadata. On load failure log `{ assetId: "hanabi-festival-sign", errorName }` and omit only the sign.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 192">
  <rect width="512" height="192" rx="18" fill="#111a3a"/>
  <rect x="10" y="10" width="492" height="172" rx="12"
        fill="none" stroke="#d04b3f" stroke-width="10"/>
  <rect x="28" y="28" width="456" height="136" rx="8"
        fill="none" stroke="#f4c56a" stroke-width="4"/>
  <g fill="none" stroke="#f4c56a" stroke-width="8" stroke-linecap="round">
    <path d="M128 96H64M96 64V128M73 73L119 119M119 73L73 119"/>
    <path d="M448 96H384M416 64V128M393 73L439 119M439 73L393 119"/>
  </g>
  <g fill="#f4c56a">
    <circle cx="224" cy="78" r="14"/>
    <circle cx="256" cy="112" r="18"/>
    <circle cx="288" cy="78" r="14"/>
  </g>
</svg>
```

- [ ] **Step 6: Add deterministic failure-injection E2E cases**

In `tests/e2e/world.spec.ts`:

```ts
test("falls back when the selected player GLB returns 404", async ({ page }) => {
  await page.route("**/player-male.glb", (route) =>
    route.fulfill({ status: 404, body: "" })
  );
  await enterWorld(page, "male");
  await expect(page.locator('[data-character-fallback="true"]')).toBeVisible();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowRight");
  await expectMoved(page);
});
```

Add an NPC case that returns `404` for the uniquely used `npc-hanabi-yukata.glb`, walks the player after readiness, verifies `[data-npc-id="npc-hanabi-yukata"]` and its interaction prompt are both absent, and verifies the nearby `npc-hanabi-child` interaction still opens. Assert that movement, the airport/entrance targets, and every unrelated NPC remain available.

Add a decoration case that returns `404` for `hanabi-festival-sign.svg`, asserts `[data-decoration-id="hanabi-festival-sign"]` is absent, and still crosses the canonical route, renders Hanabi fireworks, and opens an NPC interaction. The injected `404` is expected evidence for that case and must not be counted as an unhandled request failure.

For WebGL unsupported, inject `HTMLCanvasElement.prototype.getContext` returning `null`, assert no `.seamless-world-renderer`, restore the method, click retry, and expect `worldReady=true` within 10 seconds. Run the core-bootstrap exception through `tests/world-bootstrap.test.ts` and the exact `SeamlessWorldDependencies.SceneComponent` exception through `tests/seamless-world-canvas-recovery.test.tsx`; each must show the retry UI with zero unhandled errors, remove the injected failure before the click, reach `data-world-ready="true"` within 10 seconds, and increment both Canvas mounts and runtime constructions by exactly one.

- [ ] **Step 7: Run error and quality tests**

Run:

```bash
npm run test:unit -- --run tests/world-capability.test.ts tests/world-bootstrap.test.ts tests/world-performance-sampler.test.ts tests/world-error-boundary.test.tsx tests/seamless-world-canvas-recovery.test.tsx tests/rpg-asset-boundary.test.tsx tests/adaptive-quality.test.ts tests/scene-quality.test.ts tests/world-interaction.test.ts
npx playwright test tests/e2e/world.spec.ts --config=playwright.config.ts --grep "falls back|WebGL"
```

Expected: PASS with zero unhandled page errors.

- [ ] **Step 8: Commit and push**

```bash
git add app/world/WorldCapability.ts app/world/WorldBootstrap.ts app/world/WorldPerformanceSampler.ts app/world/WorldPerformanceMonitor.tsx app/world/RpgAssetBoundary.tsx app/world/RpgFallbackCharacter3d.tsx app/world/RpgOptionalDecoration.tsx app/world/RpgPlayerActor.tsx app/world/RpgNpcCrowd.tsx app/world/RpgTownScene.tsx app/world/RpgTownAmbience.tsx app/world/RpgTownDetails.tsx app/world/RpgSignatureLandmarks.tsx app/world/RpgWorldEffects.tsx app/world/WorldInteraction.ts app/world/WorldRuntime.ts app/world/WorldErrorBoundary.tsx app/world/SeamlessWorldCanvas.tsx app/world/AdaptiveQualityMonitor.tsx app/world/AdaptiveQuality.ts app/world/SceneQuality.ts app/world/WorldView.tsx app/globals.css public/assets/world/hanabi-festival-sign.svg tests/world-capability.test.ts tests/world-bootstrap.test.ts tests/world-performance-sampler.test.ts tests/world-error-boundary.test.tsx tests/seamless-world-canvas-recovery.test.tsx tests/rpg-asset-boundary.test.tsx tests/adaptive-quality.test.ts tests/scene-quality.test.ts tests/world-interaction.test.ts tests/e2e/world.spec.ts
git commit -m "Harden RPG loading recovery and performance" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 10: Replace Active Validation and Documentation Contracts

**Files:**
- Create: `tests/fixtures/rpg-visual-camera-fixtures.ts`
- Create: `tests/fixtures/rpg-playwright-world.ts`
- Create: `tests/e2e/rpg-performance.spec.ts`
- Create: `tests/visual/rpg-world-verification.mjs`
- Create: `docs/adr/0004-seamless-rpg-world.md`
- Create: `playwright.performance.config.ts`
- Modify: `app/world/ChaseOrbitCamera3d.tsx`
- Modify: `app/world/WorldNavigationPublisher.ts`
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `playwright.config.ts`
- Modify: `playwright.deployed.config.ts`
- Modify: `tests/e2e/world.spec.ts`
- Modify: `tests/e2e/map-accessibility.spec.ts`
- Modify: `tests/world-navigation-publisher.test.ts`
- Modify: `tests/deployed/public-smoke.spec.ts`
- Modify: `tests/public-copy-privacy.test.ts`
- Modify: `tests/visual/g007-verification.test.ts` (package-script expectation only)
- Modify: `README.md`
- Modify: `CONTEXT.md`
- Modify: `docs/handoff.md`
- Modify: `docs/interface-design.md`
- Modify: `docs/product-plan.md`
- Modify: `docs/world-design.md`
- Modify: `docs/character-design.md`
- Modify: `docs/adr/0003-approved-reference-canvas-renderer.md`

**Interfaces:**
- Produces: `npm run test:visual`, `test:visual:finalize`, `test:visual:check`, `test:performance`.
- Preserves: G005/G007 tools and evidence under history-only commands.
- Produces: 20 captures, JSON manifest, independent review rows, final PASS state.

- [ ] **Step 1: Add exact camera fixtures**

```ts
// tests/fixtures/rpg-visual-camera-fixtures.ts
export const RPG_VISUAL_CAMERA_FIXTURES = {
  airport: { yawOffsetDegrees: -25, pitchDegrees: 28, desktopDistance: 7.8, mobileDistance: 6.864 },
  tokyo: { yawOffsetDegrees: 30, pitchDegrees: 34, desktopDistance: 6.6, mobileDistance: 5.808 },
  gyukatsu: { yawOffsetDegrees: -20, pitchDegrees: 38, desktopDistance: 5.6, mobileDistance: 4.928 },
  sakura: { yawOffsetDegrees: 25, pitchDegrees: 32, desktopDistance: 6.8, mobileDistance: 5.984 },
  hanabi: { yawOffsetDegrees: -30, pitchDegrees: 28, desktopDistance: 8, mobileDistance: 7.04 }
} as const;
```

- [ ] **Step 2: Rewrite active E2E assertions**

`tests/e2e/world.spec.ts` must assert:

- selected male and female GLBs each appear;
- renderer is `seamless-rpg` and technology is `webgl3d`;
- `world-environment-concept.png` is not requested by the active Canvas or maps;
- two isolated `120_000ms` browser tests drive the canonical route through real keyboard input with varied RAF timing: walk reaches all five regions in `75.8s ±5%`, reset, and run reaches them in `64.3s ±5%`;
- the existing run-route `120_000ms` test, rather than a third long test, returns `404` for `npc-hanabi-yukata.glb`, reaches Hanabi through the canonical route, then uses real keyboard input to approach `[21, 0, -22]` facing `[0, 0, -1]`; it must expose the interaction prompt with `data-target-id="npc-hanabi-child"`, open and close it with `Escape`, preserve exact position/heading/revision across the interaction, report only the sanitized expected asset failure, and emit no `pageerror`;
- mobile joystick moves and the right-side drag changes camera yaw;
- camera recenters after `0.8 + 1.2` seconds;
- yaw is unchanged at `0.799s`, is within `5°` of the movement-rear target by `2.0s`, camera boom stays `>=2.6`, camera-safe violation never exceeds `250ms`, and diagnostics remain `ok`;
- canal blocks movement and the bridge allows crossing;
- all five map arrival anchors are within `0.5 CSS px`, heading error is `<=2°`, a browser-side `MutationObserver` measures runtime-position-to-map-marker delay `<=100ms`, and map selection leaves both position and revision unchanged for `500ms`;
- interaction opens, `Escape` closes it, and position/heading/revision remain unchanged;
- the full map opens, `Escape` closes it, and no movement, jump, reset, interaction, or camera action is queued;
- only reset returns to the airport.

Put walk and run in separate tests and set only those two tests to `120_000`; do not combine them under one timeout.

Install the `npc-hanabi-yukata.glb` `404` route before entering the world in the run test. After `driveCanonicalRoute(page, { runRequested: true })` reaches Hanabi, keep using the shared real-keyboard driving primitives to reach the stable child approach pose `[21, 0, -22]` with heading `[0, 0, -1]`. Confirm the missing yukata NPC never appears, the child prompt targets `npc-hanabi-child`, and opening then closing the child interaction with `Escape` leaves the full-precision renderer position, heading, and navigation revision byte-for-byte unchanged. Capture the expected NPC asset failure through the sanitized diagnostic surface and fail on any unsanitized error or `pageerror`.

Create the shared helper in `tests/fixtures/rpg-playwright-world.ts`; do not export it from a spec file because importing a spec registers its tests. `driveCanonicalRoute(page, { runRequested })` rotates the camera so forward input follows each fixture segment, holds `W` plus optional `Shift`, polls the full-precision `data-player-position` on `.seamless-world-renderer`, and releases at `<=0.05 world units` from each vertex. It records browser `performance.now()` before the first keydown and after the Hanabi arrival, records every distinct `data-navigation-region` on `[data-testid="world-view"]` for diagnostics, validates the five-zone order from that node's `data-current-zone`, and releases every held key in `finally`. It fails immediately if `data-camera-boom < 2.6`, `data-camera-safe-violation-ms > 250`, or `data-camera-diagnostic !== "ok"`.

Observe `world-environment-concept.png` only after world entry, or retain request initiator evidence that proves the active Canvas/map did not initiate it. The start screen intentionally uses that reference image and is outside this assertion.

Change `WorldNavigationPublisher`'s default ordinary-movement interval from `0.1s` to `0.075s`, preserving immediate region and interaction publication. Update `tests/world-navigation-publisher.test.ts` so `0.074s` does not publish and `0.075s` does. For the browser `<=100ms` map gate, install one `MutationObserver` before movement. Record browser `performance.now()`, full-precision position, and projected anchor for every renderer `data-navigation-revision`. When `.rpg-mini-map-player[data-navigation-revision]` changes, match that exact revision and require its `data-anchor-reference` to equal the recorded projection before measuring the paired timestamps. Reject a missing revision or mismatched projection instead of pairing unrelated frames.

Publish the live camera pitch as `data-camera-pitch` beside yaw and boom in `ChaseOrbitCamera3d`. The active `tests/e2e/world.spec.ts` assertions must fail if pitch is missing/non-finite and must compare the capture fixture's requested pitch with the live telemetry.

- [ ] **Step 3: Add the performance test**

`tests/e2e/rpg-performance.spec.ts` must:

- require production `baseURL`;
- reload for each trial, wait for `worldReady`, then exclude a 5-second warm-up;
- clear RAF, request, error, and mount baselines immediately after warm-up;
- read `startQualityStage` from `.seamless-world-renderer[data-quality-stage]` immediately after warm-up and validate it against `RPG_QUALITY_DEGRADATION_ORDER`;
- start one RAF sampler, execute the canonical route with run held for `64.3s ±5%`, then orbit the Hanabi camera for the positive remaining time;
- stop the sampler exactly `75_000ms` after it began and require `orbitMs` to equal `durationMs - traversalMs` within one RAF interval; `10.7s` is the nominal remainder, not a second independent tolerance;
- repeat the full warm-up plus 75-second sample three times per project;
- assert the median desktop average/p5 is at least `55/40`;
- call `client.send("Emulation.setCPUThrottlingRate", { rate: 4 })` for the mobile project;
- assert the median mobile average/p5 is at least `42/24`;
- assert `longFrameCount === 0` for every trial after warm-up;
- assert `window.__RPG_RUNTIME_DIAGNOSTICS__` stays exactly `{ canvasMounts: 1, runtimeCreates: 1, sceneMounts: 1 }`;
- assert zero requests start after warm-up while crossing region boundaries, zero request failures, zero page/console errors, and zero core-asset 404s;
- read `endQualityStage` from the same `data-quality-stage` attribute at the exact 75-second stop, and assert `window.__RPG_PERFORMANCE__.qualityStage` matches it;
- attach browser, OS, CPU, memory, DPR, WebGL renderer and quality levels.

Use browser-side timestamps and RAF intervals, not Node `Date.now()`. Install the request listener before warm-up. After warm-up and baseline clearing, enable the Node request-count boolean first, then atomically set the page-side `measurementStarted` flag and start the RAF sampler in one awaited browser task. Begin route input only after that task resolves. This conservative boundary may count an immediately preceding request but cannot miss one in the activation gap. The only allowed network count during the measured route is `0`; analytics/guide traffic is disabled for this config.

The already-installed request listener reads only the synchronous Node boolean; do not call asynchronous `page.evaluate()` from inside it. Run this config with `workers: 1`, fixed locale/timezone/reduced-motion settings, and no retries.

Each trial result has this exact minimum shape:

```ts
interface RpgPerformanceTrial {
  durationMs: number;             // 75_000 ± one RAF interval
  traversalMs: number;            // 64_300 ±5%
  orbitMs: number;                // positive derived remainder; nominally 10_700
  averageFps: number;
  p5Fps: number;
  longFrameCount: 0;
  transitionRequestCount: 0;
  requestFailureCount: 0;
  pageErrorCount: 0;
  consoleErrorCount: 0;
  diagnostics: {
    canvasMounts: 1;
    runtimeCreates: 1;
    sceneMounts: 1;
  };
  startQualityStage: RpgQualityDegradationStage;
  endQualityStage: RpgQualityDegradationStage;
}
```

`playwright.performance.config.ts` uses the same production `webServer` command as `playwright.config.ts`, a `600_000ms` test timeout, and exactly two projects:

```ts
webServer: {
  command:
    "PUBLIC_GUIDE_MODE=disabled npm run build && " +
    "PUBLIC_GUIDE_MODE=disabled npm run start -- --port 4173 --hostname 127.0.0.1",
  url: "http://127.0.0.1:4173/en",
  reuseExistingServer: false,
  timeout: 180_000
}
```

```ts
projects: [
  {
    name: "desktop",
    use: {
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1
    }
  },
  {
    name: "mobile-constrained",
    use: {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      hasTouch: true,
      isMobile: true
    }
  }
]
```

Only the `mobile-constrained` project creates a CDP session and sets CPU throttle rate `4`; the normal E2E config remains unthrottled.

- [ ] **Step 4: Build the 3D visual evidence state machine**

`tests/visual/rpg-world-verification.mjs` accepts exactly one mode:

```text
--capture
--finalize --evidence-dir <absolute-or-repo-relative-path>
--self-test
```

Capture these IDs for both `desktop` and `mobile`:

```js
const CAPTURE_IDS = [
  "airport",
  "tokyo",
  "gyukatsu",
  "sakura",
  "hanabi",
  "narrow-camera",
  "obstacle-camera",
  "mini-map",
  "full-map",
  "npc-interaction"
];
```

`--capture` creates `test-results/visual-fidelity/rpg-<UTC>-<pid>`, writes 20 PNGs, `capture-manifest.json`, `browser-errors.json`, `network-errors.json`, `performance-summary.json`, and stops in `AWAITING_VISUAL_REVIEW`.

For both viewport groups, capture `airport` with the male GLB and `npc-interaction` with the female GLB; record `selectedCharacter` in every manifest row. The reviewer compares those two captures with the corresponding local front/back character reference PNGs as well as checking foot contact and 3D proportions.

All capture states must be reached through real keyboard or touch input; the capture tool must not call a travel or teleport API. The two camera-specific states are exact:

- `narrow-camera`: walk from the Gyukatsu canonical arrival `[8, 0, 0]` to `[5, 0, 7]`, face west, apply the Gyukatsu fixture (`yawOffsetDegrees: -20`, `pitchDegrees: 38`, viewport distance), and capture only after the position is within `0.05`, `data-current-zone="gyukatsu"`, `data-camera-safe="true"`, and `data-camera-diagnostic="ok"`.
- `obstacle-camera`: remain at `[5, 0, 7]`, face east so the requested rear boom crosses the expanded `gyukatsu-main-machiya` footprint, use zero yaw offset with `pitchDegrees: 38`, and wait until the actual boom is at least `2.6` and at least `0.1` shorter than the requested viewport distance. The safety violation must stay `<=250ms` and the diagnostic must remain `ok`. If live browser telemetry cannot establish these predicates, capture fails rather than silently choosing another position.

Each `capture-manifest.json` row records the ID, relative PNG path, SHA-256, viewport, selected character, player position/heading, camera yaw/pitch/boom, navigation revision/zone, required landmarks, and any character reference assets used for review. The manifest also records the exact commit SHA and a top-level capture producer `{ "id": "rpg-world-verification.mjs", "capturedAt": "<ISO-8601>" }`.

`visual-review.json` has this top-level shape:

```json
{
  "protocol": "rpg-visual-review",
  "evidenceDirectory": "rpg-<UTC>-<pid>",
  "commitSha": "<40-hex>",
  "captureManifestSha256": "<64-hex>",
  "reviewer": {
    "id": "<independent-agent-or-human-id>",
    "reviewedAt": "<ISO-8601>"
  },
  "referenceAssets": [
    {
      "character": "male",
      "front": "public/assets/characters/player-male.png",
      "frontSha256": "<64-hex>",
      "back": "public/assets/characters/player-male-back.png",
      "backSha256": "<64-hex>"
    },
    {
      "character": "female",
      "front": "public/assets/characters/player-female.png",
      "frontSha256": "<64-hex>",
      "back": "public/assets/characters/player-female-back.png",
      "backSha256": "<64-hex>"
    }
  ],
  "rows": []
}
```

`rows` contains one row per PNG with:

```json
{
  "id": "desktop/airport",
  "characterCorrect": true,
  "requiredLandmarksVisible": true,
  "cameraNatural": true,
  "mapAligned": true,
  "uiUsable": true,
  "decision": "APPROVE"
}
```

`--finalize` verifies exact set equality between the 20 manifest row IDs and the 20 review row IDs, rejecting missing, extra, or duplicate rows. It also verifies every row is approved, the reviewer ID is non-empty and differs from the capture-producer ID, the review timestamp is valid, evidence-directory/commit/manifest hashes match, front/back reference paths and hashes match, PNG hashes are unchanged, and browser/network errors are zero. Task 11 procedurally assigns the review to a separate reviewer context; the ID mismatch binds that decision to the evidence but does not replace the procedural independence gate. Finalize writes `rpg-visual-verification.json` with `status: "PASS"` and `phase: "finalize_complete"`. It must never start a server or recapture.

- [ ] **Step 5: Update scripts and test inclusion**

```json
{
  "scripts": {
    "test:visual": "node tests/visual/rpg-world-verification.mjs --capture",
    "test:visual:finalize": "node tests/visual/rpg-world-verification.mjs --finalize",
    "test:visual:check": "node tests/visual/rpg-world-verification.mjs --self-test",
    "test:visual:g007-history:capture": "node tests/visual/g007-verification.mjs --capture",
    "test:visual:g007-history:finalize": "node tests/visual/g007-verification.mjs --finalize",
    "test:visual:g007-history:check": "node tests/visual/g007-verification.mjs --self-test",
    "test:performance": "playwright test tests/e2e/rpg-performance.spec.ts --config=playwright.performance.config.ts"
  }
}
```

Merge only these keys into the existing `scripts` object; do not replace or reorder unrelated package metadata.

Within the existing `expectedScripts` object in `tests/visual/g007-verification.test.ts`, replace only the three old visual command values and add the three clearly named G007 history keys plus `test:performance`. Keep its existing `test`, `test:unit`, `test:watch`, `test:e2e`, and `test:architecture-gate` expectations. Keep every G007 evidence, retired-suite, isolation, recovery, hash, and protocol assertion unchanged. Do not edit `tests/visual/g007-verification.mjs` or any G005/G007 evidence file.

Verify the removals from Tasks 5–7 left `ACTIVE_UNIT_EXCLUDES` empty and that Vitest does not spread historical `RETIRED_UNIT_SUITES` into `test.exclude`. Keep both `CURRENT_UNIT_INCLUDE` and the exact ten-path `RETIRED_UNIT_SUITES` export so the G007 retired-suite assertion still passes.

- [ ] **Step 6: Update public smoke tests**

`tests/deployed/public-smoke.spec.ts` must use:

```ts
const world = page.locator(
  '.seamless-world-renderer[data-world-ready="true"]' +
  '[data-world-renderer="seamless-rpg"]' +
  '[data-renderer-technology="webgl3d"]'
);
```

The smoke must directly move through at least airport → Gyukatsu → Sakura → Hanabi, drag the camera in desktop and mobile projects, open the map without changing position, and assert zero page errors, console errors, failed requests and core asset 404s.

Set this direct-route smoke to `120_000ms`; the deployed config's ordinary `45_000ms` timeout remains the default for other tests.

- [ ] **Step 7: Update authority documents**

Write `docs/adr/0004-seamless-rpg-world.md` with status `accepted`, the active flow:

```text
ExperienceShell
→ WorldView
→ SeamlessWorldCanvas
→ WorldRuntime + RpgTownScene + RpgPlayerActor + ChaseOrbitCamera3d
```

Mark ADR 0003 `superseded`. Update README, CONTEXT, handoff, interface, product, world and character docs so none declares Canvas 2D or fast travel as active. Keep ADR 0003 body and G005/G007 history intact.

Update `tests/public-copy-privacy.test.ts` in the same step. Replace its Canvas 2D expectation with the exact active sentence `` `SeamlessWorldCanvas`는 하나의 지속되는 WebGL 3D RPG 월드 렌더러다. `` and keep the localized privacy/registry assertions unchanged.

- [ ] **Step 8: Run the full local validation layer**

Run:

```bash
npm run test:unit
npm run typecheck -- --incremental false
npm run lint
npm run build
npm run test:e2e
npm run test:visual:check
npm run test:performance
```

Expected:

- all unit tests pass with no retired suite;
- typecheck exits `0`;
- lint has `0` errors;
- build exits `0`;
- local E2E passes desktop and mobile cases;
- visual tool self-test passes;
- performance meets the specified reference-device gates.

- [ ] **Step 9: Commit and push**

```bash
git add app/world/ChaseOrbitCamera3d.tsx app/world/RpgAirportBusActor.tsx app/world/RpgCameraCollision.ts app/world/RpgMiniMap.tsx app/world/RpgMiniMapProjection.ts app/world/RpgNpcCrowd.tsx app/world/RpgWorldMap.tsx app/world/WorldNavigationPublisher.ts package.json vitest.config.ts playwright.config.ts playwright.deployed.config.ts playwright.performance.config.ts tests/fixtures/rpg-canonical-route.ts tests/fixtures/rpg-playwright-world.ts tests/fixtures/rpg-route-steering.ts tests/fixtures/rpg-visual-camera-fixtures.ts tests/e2e/map-accessibility.spec.ts tests/e2e/rpg-performance.spec.ts tests/e2e/world.spec.ts tests/deployed/public-smoke.spec.ts tests/public-copy-privacy.test.ts tests/rpg-camera-collision.test.ts tests/rpg-mini-map-component.test.tsx tests/rpg-mini-map.test.ts tests/rpg-route-steering.test.ts tests/rpg-world-map-component.test.tsx tests/visual/g007-verification.test.ts tests/visual/rpg-world-verification.mjs tests/world-navigation-publisher.test.ts tests/world-runtime.test.ts README.md CONTEXT.md docs/handoff.md docs/interface-design.md docs/product-plan.md docs/world-design.md docs/character-design.md docs/adr/0003-approved-reference-canvas-renderer.md docs/adr/0004-seamless-rpg-world.md docs/superpowers/plans/2026-07-24-seamless-rpg-world.md
git commit -m "Replace validation with the seamless RPG contract" \
  -m "Generated with Codex" \
  -m "Co-Authored-By: OpenAI Codex <noreply@openai.com>"
git push fork HEAD:agent/visual-fidelity-map-alignment
```

---

### Task 11: Perform Visual Review, Computer Use, PR Verification, and Public Deployment

**Files:**
- Evidence: `test-results/visual-fidelity/rpg-<UTC>-<pid>/`
- Update: Draft PR `https://github.com/EwanJee/ewan-website/pull/1`
- Deploy: Sites project `appgprj_6a623b7023c881918715e104a6879ffe`
- Verify: `https://ewan-world.ewan.chatgpt.site`

**Interfaces:**
- Consumes: passing source state and exact commit SHA.
- Produces: finalized visual PASS, Computer Use evidence, Sites version ID, production smoke PASS.

- [ ] **Step 1: Confirm a clean, exact source state**

Run:

```bash
git status --short
git rev-parse HEAD
git ls-remote fork refs/heads/agent/visual-fidelity-map-alignment
gh pr view 1 --json headRefOid,url,isDraft
```

Expected: only `?? docs/assets/` may remain; local HEAD, fork head and PR `headRefOid` are identical.

- [ ] **Step 2: Capture visual evidence**

Run:

```bash
npm run test:visual
```

Expected: one evidence directory with 20 PNGs and terminal state `AWAITING_VISUAL_REVIEW`.

- [ ] **Step 3: Obtain independent visual approval**

The reviewer must inspect every PNG and write all 20 rows in `visual-review.json`. No row may be copied from G007 because the renderer and camera contract changed.

Run:

```bash
npm run test:visual:finalize -- --evidence-dir test-results/visual-fidelity/<exact-rpg-directory>
```

Expected: `PASS / finalize_complete`; PNG hashes unchanged and no recapture.

- [ ] **Step 4: Validate the actual app with Computer Use**

Start the actual development server:

```bash
npm run dev -- --port 4174 --hostname 127.0.0.1
```

Use the `computer-use:computer-use` skill against `http://127.0.0.1:4174/en` and perform:

1. select the male character and enter the world;
2. walk the canonical route through airport, Tokyo, Gyukatsu, Sakura and Hanabi;
3. rotate the camera with mouse drag and verify delayed recenter;
4. collide with a building and confirm the camera boom shortens without entering it;
5. cross only through the Sakura bridge;
6. open and close one NPC interaction and confirm position is unchanged;
7. open the full map, select Hanabi, close it and confirm position is unchanged;
8. switch to `390x844`, use the joystick and right-side touch drag;
9. reload and repeat world entry;
10. inspect console and network panels for errors and 404s.

Record screenshots and the observed navigation telemetry for each region.
Stop the development server after the evidence is saved.

- [ ] **Step 5: Run the final code and browser layer**

Run:

```bash
npm run test:unit
npm run typecheck -- --incremental false
npm run lint
npm run build
npm run test:e2e
npm run test:performance
```

Expected: every command passes on the exact commit intended for deployment.

Then start the already-built production app with:

```bash
npm run start -- --port 4173 --hostname 127.0.0.1
```

Use Computer Use for a shorter production check: enter the world, move across one region transition, rotate/recenter the camera, open the map without moving, reload, and inspect console/network. Stop the server before PR/Sites operations.

- [ ] **Step 6: Update and verify the Draft PR**

Push any final verified commit, then update the PR title and body to describe the continuous 3D world, no fast travel, camera behavior, test evidence and public URL.

Run:

```bash
git push fork HEAD:agent/visual-fidelity-map-alignment
gh pr view 1 --json headRefOid,url,isDraft,statusCheckRollup
```

Expected: PR head equals local HEAD and required checks are successful or explicitly absent.

- [ ] **Step 7: Save and deploy the exact Sites version**

Read `.openai/hosting.json`, use its exact `project_id`, push the exact source state, save a Sites version whose `commit_sha` equals local/PR/fork HEAD, then deploy that saved version. Record the version ID and production deployment result.

- [ ] **Step 8: Run public desktop and mobile smoke**

Run:

```bash
PUBLIC_BASE_URL=https://ewan-world.ewan.chatgpt.site \
PUBLIC_GUIDE_MODE=disabled \
npm run test:deployed
```

Expected: desktop and mobile projects pass with WebGL 3D ready, direct movement, camera drag, map immutability, no page/console/network errors and no core asset 404.

- [ ] **Step 9: Verify public Computer Use**

Repeat the core Computer Use flow against `https://ewan-world.ewan.chatgpt.site`, including reload and `390x844`. Confirm the deployed version visibly matches the finalized evidence and the published `commit_sha`.

- [ ] **Step 10: Close the implementation loop**

Report:

- final commit SHA;
- Draft PR URL;
- Sites version ID;
- public URL;
- unit, typecheck, lint, build, local E2E, performance, visual, Computer Use and deployed smoke results;
- remaining risks, including physical-phone performance if no physical device was available.
