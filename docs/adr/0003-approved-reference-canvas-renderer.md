---
status: superseded
---

# 승인 원화 기준 Canvas 2D 렌더러

이 결정은 [ADR 0004](0004-seamless-rpg-world.md)로 대체되었다. 아래 본문은 G005/G007 역사와 당시 계약을 보존한다.

## 배경

제품 화면은 승인된 일본 마을 원화와 남성·여성 캐릭터 정체성을 그대로 보여 줘야 한다. 저장소에는 절차적 Three.js 월드와 추적 카메라를 위한 모듈과 테스트가 남아 있지만, 공개 화면의 활성 경로는 해당 구현을 사용하지 않는다.

활성 경로는 다음과 같다.

```text
ExperienceShell -> WorldView -> FlatWorldCanvas
```

## 결정

활성 월드 렌더러는 승인 원화 기준 Canvas 2D 합성이다.

- `1817x866` 승인 원화를 배경, 카메라 표시 창, 플레이어 발 위치, 접촉 그림자, 전경 가림, 미니맵과 전체 지도의 공통 등록 기준으로 사용한다.
- `FlatWorldCanvas`는 `CanvasRenderingContext2D`에 남성·여성 방향별 WebP 스프라이트를 그린다.
- 플레이어는 정면, 후면, 측면과 두 달리기 프레임을 사용한다. 점프는 현재 방향의 스프라이트와 화면상 높이, 접촉 그림자로 표현한다.
- 프레임마다 이미지 안의 발 오프셋을 적용해 투명 여백과 관계없이 등록된 지면점에 접지한다.
- 배경, 플레이어, 접촉 그림자와 구역별 잘라 낸 전경은 같은 탐색 리비전과 화면 변환을 사용한다.
- 미니맵과 전체 지도는 같은 지형, 다섯 장소, 경로, 다리, 도착점, 플레이어 위치와 방향을 사용한다.
- 전체 지도 이동은 목적지 위치, 바라보는 방향, 현재 구역, 카메라와 지도 상태를 한 프레임에서 함께 갱신한다.
- 길 안내는 추천만 제공하며 이동과 독립적이다. 추천 중에도 자유 이동과 전체 지도 이동을 사용할 수 있다.
- 지원 검증 뷰포트는 데스크톱 `1440x900`, 모바일 `390x844`다. 모바일 월드 안전 프레임은 `(0,64,390,780)`이다.

## 논리 월드와 승인 원화

논리 월드는 `x=-36~36`, `z=-36~36` 범위에서 이동과 충돌을 계산한다. 공항, 도쿄, 규카츠, 벚꽃 수로와 하나비 장소는 연결 경로와 도착점을 가진다.

월드 좌표는 교정점과 경로 메시를 통해 승인 원화 좌표에 투영한다. 운하는 등록된 다리 경로에서만 건널 수 있다. 구역별 주요 장소 보호 영역은 카메라 표시 창에 필요한 장면을 남긴다.

카메라는 입체 장면을 회전하지 않는다. 플레이어의 등록된 발 픽셀과 구역 보호 영역을 기준으로 원화의 표시 창을 이동한다. 보통 이동은 화면 변화량을 제한하고, 전체 지도 이동·위치 초기화·화면 크기 변경·오류 복구는 관련 계층을 같은 리비전으로 다시 등록한다.

## 테스트 경계

Vitest의 활성 단위 테스트 포함 범위는 정확히 다음과 같다.

```ts
include: ["tests/**/*.test.{ts,tsx}"]
```

다음 10개 파일은 과거 Three.js, 절차적 월드 또는 추적 카메라 계약을 주로 검증하므로 활성 단위 테스트에서 정확한 경로로 제외한다. 파일은 역사 계약으로 보존하며, 이 결정은 삭제를 허용하지 않는다.

1. `tests/rpg-npc-glb-renderer.test.ts`
2. `tests/rpg-town-scene-instancing.test.ts`
3. `tests/rpg-town-details.test.ts`
4. `tests/rpg-town-architecture.test.ts`
5. `tests/rpg-town-draw-budget.test.ts`
6. `tests/npc-patrol-motion.test.ts`
7. `tests/rpg-bus-motion.test.ts`
8. `tests/rpg-camera-collision.test.ts`
9. `tests/rpg-town-scene-layout.test.ts`
10. `tests/rpg-town-street-life.test.ts`

활성 동작은 승인 원화 등록, 플레이어 렌더러, 월드 모델과 이동 가능 영역, 탐색 세션, 지도, 이동, 시작 화면, 길 안내, 안전성과 자산 정체성 테스트가 담당한다. 파일명 일부를 기준으로 넓게 제외하지 않는다.

## 명령 경계

`package.json`의 테스트 스크립트 경계는 다음과 같다.

| 스크립트 | 실행 값 | 역할 |
| --- | --- | --- |
| `test` | `npm run test:unit` | 활성 단위 테스트 별칭 |
| `test:unit` | `vitest run` | 활성 Vitest 테스트 |
| `test:watch` | `vitest` | 로컬 감시 실행 |
| `test:e2e` | `playwright test --config=playwright.config.ts` | 공개 흐름 브라우저 테스트 |
| `test:visual` | `node tests/visual/g007-verification.mjs --capture` | G007 캡처 |
| `test:visual:finalize` | `node tests/visual/g007-verification.mjs --finalize` | 같은 G007 폴더 마감 |
| `test:visual:check` | `node tests/visual/g007-verification.mjs --self-test` | G007 검증 도구 자체 점검 |
| `test:architecture-gate` | `node tests/visual/architecture-attempt.mjs` | G005 역사·복구 |

전체 확인에서 함께 사용하는 비테스트 명령은 다음과 같다.

```bash
npm run typecheck -- --incremental false
npm run lint
npm run build
```

시각 캡처:

```bash
npm run test:visual
```

이 명령은 하나의 `npm run dev` 생명주기에서 데스크톱 12개와 모바일 5개 화면을 캡처하고 `AWAITING_VISUAL_REVIEW`로 멈춘다.

별도 검토자가 17개 화면을 모두 승인하고 검토 산출물을 만든 뒤 정확한 같은 증거 폴더를 마감한다.

```bash
npm run test:visual:finalize -- --evidence-dir <exact-g007-directory>
```

마감은 개발 서버를 시작하거나 화면을 다시 캡처하지 않는다.

`npm run test:architecture-gate`는 G005 역사·복구용 명령으로 보존한다. G007 검증에서는 실행하지 않는다. `tests/visual/approved-reference.spec.ts`와 `playwright.visual.config.ts`도 G005 역사 입력이며 G007이 불러오거나 실행하지 않는다.

## GPU 기록

Canvas 2D에는 WebGL GPU 할당 예산을 적용하지 않는다. G007의 모든 월드 화면은 다음 값을 기록한다.

```text
gpuTelemetry.status = NOT_APPLICABLE
gpuTelemetry.reason = active renderer uses CanvasRenderingContext2D and creates no WebGL/WebGL2 context
gpuTelemetry.estimatedBytes = null
```

`0`바이트는 측정 가능한 GPU 메모리가 실제로 0이었다는 뜻이므로 사용하지 않는다. 이 렌더러는 측정 대상 WebGL 또는 WebGL2 컨텍스트 자체를 만들지 않는다.

## 시각 증거의 역할

G005 Attempt4는 승인 당시의 변경 불가 역사 증거다. 전체 시도 잠금, 고정 입력 목록, 사용한 시도 슬롯, 승인 캡처, 순서가 있는 검토와 최종 아키텍처 성공은 Attempt4만 증명한다. G007은 해당 파일, 잠금, 시간과 상태를 변경하거나 다시 실행하지 않는다.

G007은 정리 이후의 현재 입력이 같은 공개 결과를 계속 만드는지 반복 검증한다. 각 실행은 고유한 `test-results/visual-fidelity/g007-<UTC>-<pid>` 폴더를 만들고 다음을 증명한다.

- 실제 하나의 개발 서버 생명주기
- 데스크톱 12개와 모바일 5개 화면
- 현재 입력 목록과 캡처의 결합
- 별도 시각 검토자의 17개 행 승인
- 재캡처 없는 같은 폴더 마감

G007 실패는 Attempt4를 무효화하거나 수정하지 않는다. 실패한 G007 폴더는 그대로 남기고 코드 또는 테스트를 고친 뒤 별도 고유 폴더에서 다시 검증한다.

## 결과

- 제품 문서와 기본 테스트가 활성 Canvas 2D 경로를 설명한다.
- 승인 원화, 플레이어, 전경과 지도가 하나의 등록 기준을 사용한다.
- 전체 지도 이동 중 중간 상태가 노출되지 않는다.
- GPU 측정 불가 상태를 성공이나 0바이트로 과장하지 않는다.
- 과거 Three.js 구현과 검증 기록은 보존하지만 활성 제품의 증거로 사용하지 않는다.
- 과거 모듈이나 제외된 테스트를 삭제하려면 별도 승인 범위가 필요하다.
