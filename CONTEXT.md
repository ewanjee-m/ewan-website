# Ewan World 제품 컨텍스트

## 제품

`ewan-website`는 방문자가 남성 또는 여성 플레이어 캐릭터를 선택하고 일본 마을의 다섯 장소를 탐색하는 인터랙티브 포트폴리오다.

지원 언어는 한국어, 일본어, 영어다. 목적지는 `airport`, `tokyo`, `gyukatsu`, `sakura`, `hanabi`다.

## 활성 경로

```text
ExperienceShell
→ WorldView
→ SeamlessWorldCanvas
→ WorldRuntime + RpgTownScene + RpgPlayerActor + ChaseOrbitCamera3d
```

- `ExperienceShell`은 시작, 캐릭터 선택, 월드 단계를 관리한다.
- `WorldView`는 이동, 카메라, 상호작용, 지도, 길 안내와 포트폴리오 UI를 결합한다.
- `SeamlessWorldCanvas`는 하나의 WebGL 3D 장면을 월드 입장부터 종료까지 유지한다.
- `WorldRuntime`은 이동, 충돌, 점프, 구역과 탐색 리비전을 계산한다.
- `RpgTownScene`은 지형, 건축물, 랜드마크, NPC와 효과를 렌더링한다.
- `RpgPlayerActor`는 선택한 남성·여성 GLB와 대체 모델을 관리한다.
- `ChaseOrbitCamera3d`는 구역 프로필, 수동 회전, 자동 복귀, 충돌과 안전 영역을 관리한다.

활성 렌더러 식별은 `seamless-rpg`, 기술 식별은 `webgl3d`다.

## 이동과 지도

논리 경계는 `x=-36..36`, `z=-36..36`이다. 걷기 속도는 `3`, 달리기 속도는 `7` 월드 단위/초다. 캐릭터 키가 약 `2.6` 단위이므로 각각 초당 키의 `1.15`배와 `2.69`배이고, 달리기 키를 누르면 실제로 빨라지는 것이 느껴진다. 공항에서 하나비까지의 기준 경로 길이는 `122.08884600503183`이고 걷기 약 `40.7초`, 달리기 약 `17.4초`가 걸린다. 이 시간은 속도에서 계산해 검증하며 별도 상수로 적어 두지 않는다.

이동 방향은 카메라 기준이다. 화면 위는 카메라에서 멀어지는 방향, 화면 오른쪽은 카메라의 오른손 방향이다. 카메라의 앞·오른쪽 기준축은 `ChaseOrbitCamera.getChaseOrbitCameraBasis` 한 곳에서만 만들고 카메라 배치와 이동이 함께 읽는다. 두 곳에서 따로 계산하면 좌우가 뒤집힌다.

카메라 자동 복귀는 앞으로 걷는 입력일 때만 동작한다. 옆으로 걷는 동안 진행 방향을 쫓으면 이동 방향이 카메라를 따라 돌아 제자리 회전이 된다.

운하는 물 영역이므로 차단되며 `sakura-bridge-route`에서만 건널 수 있다. 미니맵과 전체 지도는 런타임 위치, 방향, 구역과 탐색 리비전을 공유한다. 전체 지도의 장소 선택은 설명만 바꾸고 이동이나 리비전을 바꾸지 않는다.

## 캐릭터와 상호작용

남성과 여성은 같은 이동, 충돌, 점프와 상호작용 규칙을 사용한다. 런타임은 GLB 모델을 우선 사용하고 개별 자산이 실패하면 해당 플레이어 또는 NPC만 안전하게 대체하거나 생략한다.

상호작용은 가까운 대상과 바라보는 방향을 함께 확인한다. 대화상자가 열리면 입력을 비우며 `Escape`로 닫아도 위치, 방향과 탐색 리비전은 바뀌지 않는다.

## 검증 경계

```bash
npm run test:unit
npm run typecheck -- --incremental false
npm run lint
npm run build
npm run test:e2e
npm run test:visual:check
npm run test:performance
```

`npm run test:visual`은 데스크톱과 모바일에서 각각 10개, 합계 20개 화면을 캡처하고 독립 검토 전 상태에서 멈춘다. `test:visual:finalize`는 서버나 브라우저를 시작하지 않고 같은 증거 폴더의 ID, 커밋, 해시, 검토자와 오류 파일만 검증한다.

G005/G007 증거와 도구는 역사 기록이다. 현재 시각 검증과 섞지 않는다.

## 문서 권위

- 실행: [README.md](README.md)
- 월드: [docs/world-design.md](docs/world-design.md)
- 캐릭터: [docs/character-design.md](docs/character-design.md)
- 인터페이스: [docs/interface-design.md](docs/interface-design.md)
- 인계: [docs/handoff.md](docs/handoff.md)
- 활성 결정: [ADR 0004](docs/adr/0004-seamless-rpg-world.md)
- 대체된 결정: [ADR 0003](docs/adr/0003-approved-reference-canvas-renderer.md)
