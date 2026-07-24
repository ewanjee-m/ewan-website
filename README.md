# Ewan World

남성 또는 여성 플레이어 캐릭터로 일본 축제 마을을 직접 탐색하는 WebGL 3D 포트폴리오다.

공항버스, 도쿄, 규카츠, 벚꽃과 하나비 장면을 탐험할 수 있다.

## 활성 런타임

```text
ExperienceShell
→ WorldView
→ SeamlessWorldCanvas
→ WorldRuntime + RpgTownScene + RpgPlayerActor + ChaseOrbitCamera3d
```

`SeamlessWorldCanvas`는 하나의 지속되는 `seamless-rpg` WebGL 3D 렌더러다. 다섯 장소는 같은 장면, 런타임, 카메라와 탐색 상태 안에서 연결된다.

## 기능

- 한국어, 일본어, 영어 시작 화면
- 남성 또는 여성 GLB 캐릭터 선택
- 키보드와 모바일 조이스틱 이동, 걷기·달리기·점프
- 마우스와 터치 드래그 추적 카메라
- 공항, 도쿄, 규카츠, 벚꽃 수로, 하나비의 연속 이동
- 구조물 충돌, 운하 차단과 다리 통행
- 현재 위치·방향·탐색 리비전을 공유하는 미니맵과 전체 지도
- 가까운 장소와 NPC 상호작용
- 도쿄 날씨 또는 포춘을 이용한 길 안내

전체 지도는 장소 정보를 살펴보는 용도이며 플레이어를 이동시키지 않는다. 시작 위치 복귀는 별도 조작만 수행한다.

## 개발

Node.js `24` 이상이 필요하다.

```bash
npm run dev
```

## 검증

```bash
npm run test:unit
npm run typecheck -- --incremental false
npm run lint
npm run build
npm run test:e2e
npm run test:visual:check
npm run test:performance
```

현재 3D 시각 증거 20개를 캡처한다.

```bash
npm run test:visual
```

캡처는 `AWAITING_VISUAL_REVIEW`에서 멈춘다. 별도 검토자가 같은 커밋, 매니페스트 해시, PNG 해시와 남성·여성 앞뒤 참고 이미지를 확인한 뒤 마감한다.

```bash
npm run test:visual:finalize -- --evidence-dir <rpg-evidence-directory>
```

G007과 G005 증거는 역사 기록으로 보존한다. G007 도구는 `test:visual:g007-history:*`, G005 복구 도구는 `test:architecture-gate`로만 실행한다.

## 길 안내와 개인정보

길 안내는 `weather`와 `fortune`만 받는다. 서버 응답은 허용된 목적지와 테마로 검증하며 실패하면 로컬 추천을 표시한다. 이름, 이메일, 생년월일, 성별, 방문자 위치 권한과 자유 입력은 요구하지 않는다. `OPENAI_API_KEY`는 서버 환경에서만 읽는다.

## 문서

- [제품 계획](docs/product-plan.md)
- [월드 디자인](docs/world-design.md)
- [인터페이스 디자인](docs/interface-design.md)
- [캐릭터 디자인](docs/character-design.md)
- [현재 인계](docs/handoff.md)
- [활성 WebGL 3D 결정](docs/adr/0004-seamless-rpg-world.md)
- [대체된 Canvas 2D 결정 기록](docs/adr/0003-approved-reference-canvas-renderer.md)
