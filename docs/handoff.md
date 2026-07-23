# 현재 인계

## 제품 상태

활성 월드는 승인 원화 기준 Canvas 2D 경험이다.

```text
ExperienceShell -> WorldView -> FlatWorldCanvas
```

- 기준 원화: `/assets/world/world-environment-concept.png`
- 기준 크기: `1817x866`
- 데스크톱 검증 뷰포트: `1440x900`
- 모바일 검증 뷰포트: `390x844`
- 모바일 월드 안전 프레임: `(0,64,390,780)`
- 렌더러 식별: `approved-reference`
- 렌더러 기술: `canvas2d`

`FlatWorldCanvas`가 승인 원화, 남성·여성 WebP 플레이어 스프라이트, 접촉 그림자와 구역별 전경 가림을 합성한다. 미니맵과 전체 지도는 같은 `1817x866` 등록과 월드 탐색 스냅샷을 사용한다.

## 동작 계약

- 남성과 여성은 정면, 후면, 측면과 달리기 두 프레임을 사용한다.
- 프레임별 이미지 발 오프셋으로 지면 접지를 맞춘다.
- 데스크톱은 방향키와 `Space`, 모바일은 왼쪽 이동 조작과 점프 버튼을 사용한다.
- 운하는 등록된 다리에서만 건널 수 있다.
- 전체 지도 이동은 위치, 방향, 구역, 카메라와 지도 상태를 한 번에 갱신한다.
- 길 안내는 목적지와 방향만 추천한다. 이동을 실행하거나 제한하지 않으며 전체 지도는 계속 사용할 수 있다.
- 길 안내, 포트폴리오 대화상자 또는 전체 지도가 열리면 미니맵을 숨겨 겹침을 줄인다.

## 현재 검증 증거

G007 캡처 폴더:

```text
test-results/visual-fidelity/g007-20260723T142731136Z-62999
```

- PNG: `17`개
- 데스크톱: `12`개
- 모바일: `5`개
- 상태: `AWAITING_VISUAL_REVIEW`

이 폴더는 캡처를 완료했지만 별도 시각 검토와 같은 폴더 마감이 남아 있다. 최종 `PASS`로 기록하지 않는다.

G005 Attempt4는 변경하지 않는 역사 승인 증거다. G007은 현재 입력으로 같은 공개 결과를 반복 검증한다. G007 작업은 Attempt4 파일, 잠금, 상태와 시간을 수정하거나 해당 실행을 다시 시작하지 않는다.

## 검증 명령

`package.json`과 일치하는 명령:

```bash
npm run test:unit
npm run test:e2e
npm run test:visual:check
npm run typecheck -- --incremental false
npm run lint
npm run build
```

G007 캡처:

```bash
npm run test:visual
```

캡처는 `AWAITING_VISUAL_REVIEW`에서 멈춘다. 별도 검토자가 17개 행을 모두 승인하고 검토 산출물을 만든 뒤 정확한 같은 폴더를 마감한다.

```bash
npm run test:visual:finalize -- --evidence-dir <exact-g007-directory>
```

마감은 서버를 시작하거나 화면을 다시 캡처하지 않는다.

`npm run test:architecture-gate`는 G005 역사·복구용이다. G007 검증에서는 실행하지 않는다.

## GPU 기록

활성 렌더러는 `CanvasRenderingContext2D`를 사용하고 WebGL 또는 WebGL2 컨텍스트를 만들지 않는다. GPU 메모리 측정 상태는 `NOT_APPLICABLE`이고 예상 바이트는 `null`이다.

```text
active renderer uses CanvasRenderingContext2D and creates no WebGL/WebGL2 context
```

## 보존 규칙

- `test-results/visual-fidelity/g005-*`와 G005 잠금 파일을 수정, 마감, 재캡처하거나 삭제하지 않는다.
- `tests/visual/approved-reference.spec.ts`와 `playwright.visual.config.ts`는 G005 역사 검증 입력으로 보존한다.
- `tests/visual/architecture-attempt.mjs`는 G007에서 실행하지 않는다.
- 저장소에 남아 있는 Three.js 기반 모듈과 제외된 테스트는 역사 계약이다. 활성 경로에 연결돼 있다고 해석하지 않는다.
- Three.js 모듈이나 제외된 테스트의 삭제는 별도 승인 범위가 필요하다.
- 외부 자산이나 npm 의존성을 추가하지 않는다.

## 문서 시작점

- 전체 컨텍스트: [`CONTEXT.md`](../CONTEXT.md)
- 실행과 검증: [`README.md`](../README.md)
- 월드: [`world-design.md`](world-design.md)
- 캐릭터: [`character-design.md`](character-design.md)
- 인터페이스: [`interface-design.md`](interface-design.md)
- 길 안내: [`ai-guide-design.md`](ai-guide-design.md)
- 활성 결정: [`adr/0003-approved-reference-canvas-renderer.md`](adr/0003-approved-reference-canvas-renderer.md)

`character-pipeline.md`와 `handoff-prompt.md`는 역사 입력이다. 활성 런타임이나 다음 작업의 권위로 사용하지 않는다.
