# 인터랙티브 3D 포트폴리오 참고 조사

조사 확인일: 2026-07-21

## 조사 기준

- 실제로 탐색 가능한 포트폴리오인가
- 데스크톱과 모바일 입력을 모두 다루는가
- 소스와 라이선스를 확인할 수 있는가
- 정적 배포, 3D 성능, 오류 복구에 적용할 근거가 있는가
- 디자인을 복제하지 않고 구조와 실패 방지 방식을 배울 수 있는가

## 제품 참고

### Palworld 공식 플레이 자료

- 공식 제품 페이지: [Pocketpair Palworld](https://www.pocketpair.jp/en/games-en/palworld-en/)
- 공식 판매 페이지와 플레이 화면: [Palworld on Steam](https://store.steampowered.com/app/1623730/Palworld/?gsAppOpenWithBrowser=true)
- 확인한 시각 원칙:
  - 캐릭터는 카메라를 향하는 평면이 아니라 옆·뒤·대각선에서도 부피가 유지되는 전신 3D 형태다.
  - 이동 방향과 캐릭터 몸의 방향이 연결되고, 카메라는 캐릭터 뒤를 기본으로 따라가면서 주변 공간을 함께 보여 준다.
  - 선명한 캐릭터 윤곽, 색이 구분되는 의상, 깊이 순서가 분명한 지형·건축·식생으로 멀리 있는 장소도 읽을 수 있다.
- 적용할 점:
  - 승인된 남녀 외형을 관절이 나뉜 자체 3D geometry로 다시 만들고 이동 heading을 실제 y축 회전으로 변환한다.
  - 좌우 전환에 음수 scale이나 이미지 반전을 사용하지 않는다.
  - 몸통·골반·팔·다리의 움직임을 이어 붙이고 회전 중에는 머리카락·소매·기모노 밑단이 늦게 따라오게 한다.
  - 고해상도 렌더링은 데스크톱 high 단계에 집중하고 모바일은 캐릭터 깊이를 유지한 채 입자·그림자·내부 해상도를 단계적으로 줄인다.
- 사용하지 않는 것:
  - Palworld의 캐릭터, 생물, 의상, 지도, 모델, 텍스처와 UI 자산은 복제하거나 가져오지 않는다.
  - 화면의 인상만 흉내 내기 위해 색상이나 고유 silhouette를 그대로 사용하지 않는다.

### Bruno Simon Folio

- 라이브: [bruno-simon.com](https://bruno-simon.com/)
- 소스: [brunosimon/folio-2025](https://github.com/brunosimon/folio-2025)
- 라이선스: MIT
- 확인한 동작:
  - 키보드 방향키와 `WASD`, 한 손가락 모바일 이동, 게임패드를 구분한다.
  - 입력 장치가 바뀌면 해당 장치의 조작 안내로 전환한다.
  - 낮은 품질 선택, 복귀 지점 이동, 전체 초기화를 제공한다.
  - 서버가 꺼져도 핵심 포트폴리오는 동작하고 서버 의존 기능만 비활성화한다.
  - 공개 소스는 입력, 물리 전·후 처리, 시점, 구역, 조명, 렌더링을 순서가 있는 게임 루프로 분리한다.
  - `GLB`와 텍스처를 빌드 단계에서 압축하고 원본과 배포 자산을 구분한다.
- 적용할 점:
  - 키보드와 터치를 각각 구현하되 동일한 이동 행동으로 변환한다.
  - 이동 불능 상태를 정상 시나리오로 보고 복구 동작을 제공한다.
  - 모바일은 처음부터 낮은 그래픽 품질로 시작하고 측정 결과에 따라 조정한다.
  - 반복 모델과 텍스처를 압축하고 재사용한다.
- 피할 점:
  - 기능 수와 물리 효과를 처음부터 같은 수준으로 만들지 않는다.
  - 포트폴리오 내용보다 운전 자체가 앞서지 않도록 완료 행동을 먼저 정한다.

### Craftzdog Homepage

- 라이브: [craftz.dog](https://www.craftz.dog/)
- 소스: [craftzdog/craftzdog-homepage](https://github.com/craftzdog/craftzdog-homepage)
- 라이선스: 저장소의 별도 조건을 확인해야 하며 3D 모델은 재사용 대상에서 제외한다.
- 적용할 점:
  - `Next.js` 포트폴리오에 3D 장면을 결합한 작은 기준 사례로 사용한다.
  - 포트폴리오 정보는 3D 장면이 실패해도 읽을 수 있는 HTML 구조를 유지한다.

### React Three Fiber 3D Portfolio

- 소스: [adrianhajdin/3d-portfolio](https://github.com/adrianhajdin/3d-portfolio)
- 확인한 동작: 3D 모델, 카메라 전환, 프로젝트 섹션, 모바일 대응을 React 구성요소로 나눈다.
- 적용할 점: 포트폴리오 내용과 3D 장면의 경계를 비교하는 참고로만 사용한다.
- 주의: 이 사례는 자유 이동 게임이 아니므로 이동 제어 설계의 근거로 사용하지 않는다.

## 기술 참고

### React Three Fiber

- 문서: [Introduction](https://r3f.docs.pmnd.rs/getting-started/introduction)
- 판단: `React` 구성요소 안에서 Three.js 장면을 구성해야 한다는 요구에 맞는다.
- 버전 조건: React 주요 버전과 `@react-three/fiber` 주요 버전을 맞춰야 한다.

### React Three Rapier

- 소스: [pmndrs/react-three-rapier](https://github.com/pmndrs/react-three-rapier)
- 라이선스: MIT
- 판단: 복잡한 rigid body가 필요할 때 사용할 수 있지만, 경계 안의 이어진 바닥, landmark footprint, 운하·다리와 움직이는 버스의 회전 footprint를 순수 좌표로 판정할 수 있어 넣지 않는다.
- 적용: `RpgTownSceneLayout.ts`가 마을 경계, 실제 차단 영역과 아치형 다리 높이를 계산하고 `RpgBusMotion.ts`가 현재 버스 위치·회전 충돌을 계산한다. 도로·광장·잔디의 시각 종류는 이동 가능 여부를 제한하지 않는다.

### Ecctrl

- 소스: [pmndrs/ecctrl](https://github.com/pmndrs/ecctrl)
- 판단: 물리 controller 전체는 사용하지 않고 캐릭터가 보이는 근접 전신 추적 camera의 관계만 참고한다.
- 적용: 정면 전진에서만 실제 화면 yaw로 기준을 옮기는 heading 추적, 자동 복귀 없는 drag orbit·sky, 실제 camera forward 기반 screen-relative movement와 mobile joystick을 작은 순수 module로 분리해 검증한다.

### Next.js 정적 내보내기

- 문서: [Static Exports](https://nextjs.org/docs/app/guides/static-exports)
- 판단: `output: 'export'`는 HTML, CSS, JavaScript 정적 파일을 만들지만 요청 시 실행되는 서버 기능과 비밀 API 키를 사용할 수 없다.

### OpenAI Responses API

- 공식 모델 목록: [OpenAI API Models](https://developers.openai.com/api/docs/models)
- 공식 모델 문서: [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- 공식 사용 지침: [Model guidance](https://developers.openai.com/api/docs/guides/latest-model)
- 적용: 짧은 목적지 추천은 비용과 응답 시간을 줄이는 `gpt-5.6-luna`와 Responses API의 엄격한 JSON schema를 사용한다. 브라우저 식별자는 이름이나 이메일이 아닌 임의 UUID를 `safety_identifier`로 보내고 응답 저장은 `store: false`로 끈다.
- 보안 경계: 브라우저와 정적 자산에는 API 키를 넣지 않는다. 같은 저장소의 요청 시 실행 serverless Route Handler만 배포 비밀 값 `OPENAI_API_KEY`를 읽는다.

## 성능과 화면 안정성

### React Three Fiber 성능 지침

- 문서: [Scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance)
- 적용할 점:
  - 반복되는 도로 돌, 잔디와 벚꽃잎은 인스턴싱으로 그리기 호출 수를 줄인다. 주변 인물은 구역별 고해상도 WebP를 깊이 있는 단일 메시 표면에 투영해 인물당 한 번의 주요 그리기 호출로 유지한다.
  - 같은 모델과 텍스처를 캐시하고 재사용한다.
  - 거리에 따라 모델 상세도를 낮춘다.
  - 측정한 초당 프레임 수에 따라 해상도와 효과 품질을 낮춘다.
  - 낮은 품질 자산을 먼저 보여 주고 높은 품질 자산을 나중에 불러온다.
  - 공식 지침은 반복 메시의 인스턴싱, 거리별 상세도, 평균 초당 프레임 수에 따른 품질 조절을 함께 권장한다.

### Three.js 입자와 line segment

- 공식 예제: [Points / sprites](https://threejs.org/examples/webgl_points_sprites.html)
- 적용할 점:
  - 벚꽃잎은 개별 React 요소 대신 instanced plane으로 그린다.
  - 하나비는 여러 ray를 한 `bufferGeometry`의 line segment로 묶고 중심 core만 별도 면으로 그린다.
  - 품질이 낮아지면 geometry 수를 늘리지 않고 꽃잎 instance 수와 효과 세기를 줄인다.

### 3D 캐릭터 회전과 동작 혼합

- 공식 기술 참고:
  - [Unreal Engine Blend Spaces](https://dev.epicgames.com/documentation/en-us/unreal-engine/blend-spaces-in-unreal-engine)
  - [Unreal Engine Character Movement Component](https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Runtime/Engine/UCharacterMovementComponent)
  - [Unreal Engine Game Animation Sample](https://dev.epicgames.com/documentation/en-us/unreal-engine/game-animation-sample-project-in-unreal-engine)
  - [Three.js animation system](https://threejs.org/manual/en/animation-system.html)
- 적용할 점:
  - 이동 여부와 점프 상태를 갑자기 교체하지 않고 idle·run·jump 가중치를 시간 기반으로 섞는다.
  - 목표 heading까지 가장 짧은 각도로 회전하고 frame 간격이 달라도 같은 속도로 수렴하게 한다.
  - 좌우 다리와 팔을 반대 위상으로 움직이고 골반과 가슴을 반대 방향으로 작게 회전한다.
  - 방향을 크게 바꿀 때 몸 기울기, 머리카락과 옷자락의 후행을 함께 계산한다.
  - 현재 구현은 외부 animation 파일을 불러오지 않는 절차형 관절 리그지만, 나중에 glTF 골격 모델로 바꿀 때도 같은 상태·가중치 계약을 유지한다.

### Three.js 모델과 렌더 비용

- 공식 기술 참고:
  - [Three.js glTF loader](https://threejs.org/docs/pages/GLTFLoader.html)
  - [Three.js FAQ: 권장 3D 형식](https://threejs.org/manual/en/faq.html)
  - [Three.js shadows](https://threejs.org/manual/en/shadows.html)
  - [Three.js LOD](https://threejs.org/docs/pages/LOD.html)
- 적용할 점:
  - 움직이는 캐릭터에는 매 frame 전체 shadow map을 다시 그리는 대신 지면 접촉용 blob shadow를 사용한다.
  - 품질 단계에 따라 구·원기둥의 segment, Canvas 내부 해상도, 하나비 ray 수를 줄이되 캐릭터의 실제 깊이와 관절 수는 유지한다.
  - 외부 제작 모델로 전환할 때는 glTF를 사용하고 거리별 상세도와 압축 자산을 별도 검증한다.

### Playwright

- 문서: [Device emulation](https://playwright.dev/docs/emulation)
- 문서: [Visual comparisons](https://playwright.dev/docs/test-snapshots)
- 적용할 점:
  - 데스크톱과 모바일 Safari 성격의 뷰포트·터치 환경을 반복 실행한다.
  - 시작 화면과 필수 조작 UI는 같은 실행 환경에서 기준 화면과 비교한다.
- 한계:
  - 브라우저 모의 기기는 실제 모바일 GPU, 발열, 주소 표시줄 변화까지 재현하지 못한다.
  - WebGL 화면 비교는 운영체제, 그래픽 장치와 브라우저 버전에 따라 달라질 수 있으므로 같은 실행 환경을 유지해야 한다.

## 조사에서 나온 설계 원칙

1. 포트폴리오 내용을 이해하는 경로와 게임 조작의 재미를 분리해 둘 다 막히지 않게 한다.
2. 모든 입력을 `이동 의도`라는 하나의 공개 동작으로 바꾼다.
3. AI와 날씨 요청은 월드 진행을 보조하며 실패해도 직접 이동을 막지 않는다.
4. 모바일 품질 저하는 실패가 아니라 정상 동작으로 정의한다.
5. 복구, 품질 하향, 3D 미지원 대체 화면을 제품 기능으로 포함한다.
