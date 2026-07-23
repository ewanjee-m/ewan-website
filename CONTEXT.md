# Ewan World 제품 컨텍스트

## 제품

`ewan-website`는 방문자가 남성 또는 여성 플레이어 캐릭터를 선택하고 일본 마을의 다섯 장소를 탐색하는 인터랙티브 포트폴리오다. 화면은 승인된 마을 원화를 기준으로 구성하며, 플레이어 캐릭터와 지도는 같은 논리 좌표와 이미지 좌표 등록을 공유한다.

지원 언어는 한국어, 일본어, 영어다. 선택한 언어와 캐릭터는 브라우저에 저장한다.

## 사용자 흐름

1. 시작 화면에서 언어를 선택하고 `START`를 누른다.
2. 남성 또는 여성 캐릭터 카드를 선택한다.
3. 월드에 입장해 방향키 또는 화면 왼쪽 이동 조작으로 이동한다.
4. `Space` 또는 점프 버튼으로 점프한다.
5. 미니맵으로 현재 위치와 경로를 확인한다.
6. 전체 지도에서 장소를 선택하면 해당 도착점으로 한 번에 이동한다.
7. 길 안내에서 날씨 또는 포춘을 선택하면 목적지와 방향을 추천받는다. 추천은 이동을 실행하거나 제한하지 않는다.

다섯 목적지는 `airport`, `tokyo`, `gyukatsu`, `sakura`, `hanabi`다.

## 활성 런타임

활성 경로는 다음과 같다.

```text
ExperienceShell -> WorldView -> FlatWorldCanvas
```

- `ExperienceShell`은 시작, 캐릭터 선택, 월드 단계를 관리한다.
- `WorldView`는 이동 입력, 길 안내, 포트폴리오, 미니맵, 전체 지도를 결합한다.
- `FlatWorldCanvas`는 `CanvasRenderingContext2D`로 승인 원화와 WebP 플레이어 스프라이트를 합성한다.

활성 렌더러는 `approved-reference` Canvas 2D다. `1817x866` 승인 원화가 월드 좌표, 카메라 창, 캐릭터 발 위치, 접촉 그림자, 구역별 전경 가림, 미니맵과 전체 지도의 공통 기준이다.

데스크톱 프로필은 `1440x900`, 모바일 프로필은 `390x844`다. 모바일 월드의 안전 프레임은 상단 UI 영역을 제외한 `(0,64,390,780)`이다. 카메라는 원화를 입체 시점으로 회전하지 않고, 플레이어의 등록 위치와 구역 보호 범위에 맞춰 원화 안의 표시 창을 이동한다.

## 월드와 이동

논리 월드는 `x=-36~36`, `z=-36~36` 범위를 사용한다. 공항, 도쿄, 규카츠, 벚꽃 수로, 하나비 장소와 연결 경로가 하나의 탐색 공간을 이룬다.

- 이동은 월드 경계, 구조물 차단 영역, 운하 통행 제한을 따른다.
- 운하는 등록된 다리 경로에서만 건널 수 있다.
- 미니맵과 전체 지도는 같은 지형, 경로, 다섯 도착점, 플레이어 위치와 방향을 표시한다.
- 전체 지도 이동은 `WorldView`가 목적지를 입력 큐에 넣고 `FlatWorldCanvas`가 한 프레임에서 위치, 방향, 구역, 카메라 등록을 함께 갱신하는 원자적 이동이다.

## 플레이어 캐릭터

남성과 여성은 동일한 이동·충돌·점프 규칙을 사용한다. 각 캐릭터는 정면, 후면, 측면 방향과 달리기 프레임을 가진 `768x1152` WebP 런타임 자산을 사용한다.

- 정면과 후면은 각각의 자산을 사용한다.
- 측면 자산은 오른쪽을 기준으로 하며 왼쪽 이동에서 가로 반전한다.
- 이동 중에는 두 달리기 프레임을 교대한다.
- 점프 중에는 현재 방향의 스프라이트와 공중 이동 상태를 사용한다.
- 자산별 투명 여백의 발 오프셋을 적용해 이미지 안의 발을 월드 접지점에 맞춘다.
- 타원형 접촉 그림자는 캐릭터 아래에 남고, 구역별 전경 마스크가 캐릭터 앞을 가릴 수 있다.

## 길 안내

길 안내는 `weather`와 `fortune` 요청만 허용한다. 서버 응답은 허용된 목적지와 테마 목록으로 검증하고, 실패하면 검증된 로컬 추천을 사용한다.

- 길 안내는 플레이어 위치, 이동, 점프와 전체 지도 이동을 바꾸지 않는다.
- 추천 중에도 방문자는 모든 장소로 직접 이동하거나 전체 지도를 사용할 수 있다.
- 길 안내 패널이 열리면 화면 겹침을 줄이기 위해 미니맵을 숨기고, 닫으면 같은 위치 상태로 다시 표시한다.
- 날씨는 도쿄 고정 좌표와 `Asia/Tokyo` 시각을 사용한다.
- 이름, 이메일, 생년월일, 성별, 방문자 위치 권한과 자유 입력을 요구하지 않는다.

## 검증 경계

`package.json`이 정의하는 명령은 다음과 같다.

```bash
npm run test:unit
npm run test:e2e
npm run test:visual:check
npm run test:visual
npm run typecheck -- --incremental false
npm run lint
npm run build
```

`npm run test:visual`은 12개 데스크톱 화면과 5개 모바일 화면을 하나의 개발 서버 생명주기에서 캡처하고 `AWAITING_VISUAL_REVIEW`로 멈춘다. 별도 검토가 17개 화면을 모두 승인한 뒤 같은 폴더를 다음 명령으로 마감한다.

```bash
npm run test:visual:finalize -- --evidence-dir <exact-g007-directory>
```

Canvas 2D는 WebGL 또는 WebGL2 컨텍스트를 만들지 않으므로 GPU 메모리 측정 상태는 `0`이나 성공이 아니라 `NOT_APPLICABLE`이다. 기록 사유는 `active renderer uses CanvasRenderingContext2D and creates no WebGL/WebGL2 context`다.

현재 G007 캡처는 `test-results/visual-fidelity/g007-20260723T142731136Z-62999`에 있으며 PNG 17개를 포함한다. 상태는 `AWAITING_VISUAL_REVIEW`이고 아직 최종 `PASS`가 아니다.

G005 Attempt4는 승인 당시의 변경 불가 역사 증거다. G007은 현재 입력으로 반복 실행하는 검증이며 Attempt4 파일, 잠금 또는 마감 상태를 변경하지 않는다. `npm run test:architecture-gate`는 G005 역사·복구용 명령이므로 G007 검증에 사용하지 않는다.

## 문서 권위

- 제품과 실행: [README.md](README.md)
- 월드 구성: [docs/world-design.md](docs/world-design.md)
- 캐릭터: [docs/character-design.md](docs/character-design.md)
- 길 안내: [docs/ai-guide-design.md](docs/ai-guide-design.md)
- 현재 인계: [docs/handoff.md](docs/handoff.md)
- 렌더러 결정: [ADR 0003](docs/adr/0003-approved-reference-canvas-renderer.md)
- 대체된 결정 기록: [ADR 0002](docs/adr/0002-stable-renderer-and-streamed-world.md)
