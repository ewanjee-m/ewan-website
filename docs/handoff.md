# 현재 인계

## 제품 상태

활성 월드는 하나의 연속 WebGL 3D RPG 경험이다.

```text
ExperienceShell
→ WorldView
→ SeamlessWorldCanvas
→ WorldRuntime + RpgTownScene + RpgPlayerActor + ChaseOrbitCamera3d
```

- 렌더러: `seamless-rpg`
- 기술: `webgl3d`
- 데스크톱 기준: `1440x900`
- 모바일 기준: `390x844`
- 장소: `airport`, `tokyo`, `gyukatsu`, `sakura`, `hanabi`
- 캐릭터: 남성·여성 GLB, 개별 자산 실패 대체
- 지도: 탐색용이며 플레이어 이동 없음

## 동작 계약

- 실제 키보드 또는 터치 입력으로 다섯 장소를 이동한다.
- 운하는 차단되고 벚꽃 다리에서만 건넌다.
- 카메라는 수동 회전 후 이동 중 `0.8초`가 지나면 진행 방향 뒤로 복귀한다.
- 카메라 붐은 `2.6` 아래로 내려가지 않고 안전 영역 위반은 `250ms`를 넘지 않는다.
- 지도 위치는 같은 탐색 리비전의 런타임 위치를 `100ms` 안에 반영한다.
- 지도 선택과 상호작용 열기·닫기는 위치, 방향과 리비전을 바꾸지 않는다.
- 위치 초기화 조작만 공항 시작점으로 돌아간다.

## 검증 명령

```bash
npm run test:unit
npm run typecheck -- --incremental false
npm run lint
npm run build
npm run test:e2e
npm run test:visual:check
npm run test:performance
```

시각 캡처는 `npm run test:visual`, 독립 검토 후 마감은 다음 명령을 사용한다.

```bash
npm run test:visual:finalize -- --evidence-dir <rpg-evidence-directory>
```

마감은 서버를 시작하거나 재캡처하지 않는다. Task 11에서 별도 검토가 수행되기 전에는 시각 `PASS`를 기록하지 않는다.

## 역사 보존

- G007 도구와 증거는 `test:visual:g007-history:*` 명령 아래에 보존한다.
- G005 도구와 증거는 `test:architecture-gate`와 기존 파일에 보존한다.
- `tests/visual/g007-verification.mjs`, G005/G007 증거 파일과 잠금은 현재 검증에서 수정하지 않는다.

## 시작점

- [제품 컨텍스트](../CONTEXT.md)
- [월드 디자인](world-design.md)
- [캐릭터 디자인](character-design.md)
- [인터페이스 디자인](interface-design.md)
- [활성 결정 ADR 0004](adr/0004-seamless-rpg-world.md)
