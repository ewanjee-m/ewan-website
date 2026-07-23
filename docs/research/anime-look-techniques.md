# 애니메이션 룩 기법 조사와 채택 기록

2026-07-21 deep-research(다중 웹 검색 + 주장별 3표 반박 검증) 결과 중 이 레포에 채택한 항목만 남긴다. 검증에서 반박되었거나 채택하지 않은 항목은 끝에 적는다. 새 npm 패키지와 외부 3D 자산은 쓰지 않고 기법·수식·상수만 가져왔다.

## 1. 캐릭터 밴드 음영

- 기법: `MeshToonMaterial` + 2~3텍셀 `DataTexture` `gradientMap`. `magFilter`·`minFilter` 모두 `NearestFilter`가 아니면 GPU 보간으로 밴드 경계가 뭉개진다.
- 적용 위치: `app/world/RpgCharacterToonMaterial.ts`의 `TOON_RAMP_STEPS` — 4단 균등 램프(96/172/228/255)를 경계가 뚜렷한 소수 단으로 교체.
- 출처: https://threejs.org/docs/pages/MeshToonMaterial.html (NearestFilter 필수 조건 원문), https://sbcode.net/threejs/meshtoonmaterial/
- 검증: 설치본 three@0.185.1의 `lights_toon_pars_fragment`에서 `getGradientIrradiance()`가 `dotNL`을 gradientMap 샘플로 양자화함을 확인.

## 2. 윤곽선 (inverted hull)

- 기법: 캐릭터 `SkinnedMesh`를 클론해 같은 스켈레톤에 다시 bind, 재질 `side: BackSide`, 정점 셰이더에서 법선 방향으로 두께만큼 팽창. 스키닝과의 결합은 `#include <begin_vertex>` 직후에 팽창을 넣어 이후 `skinning_vertex`가 팽창된 정점에 본 변형을 적용하게 한다. 청크 치환 재질은 `customProgramCacheKey` 지정.
- 적용 위치: `app/world/RpgPlayerCharacter3d.tsx`, `app/world/RpgNpcCharacter3d.tsx`.
- 출처: https://github.com/ZaneAtega/Three-js-Anime-Shader (두께 예시 0.02875), onBeforeCompile 메커니즘: https://medium.com/@pailhead011/extending-three-js-materials-with-glsl-78ea7bbb9270
- 주의: "스키닝 GLB에 그대로 호환된다"는 주장은 반박 검증에서 기각(0 대 3)되어, 이 레포에서는 달리기 중 캡처(`tmp/stride.mjs`)로 직접 확인하는 것을 완료 조건으로 삼았다.

## 3. 하나비 입자

- 기법: 버스트 1발 = `THREE.Points` 1개(드로우콜 1) + `ShaderMaterial(transparent, depthWrite:false, blending:AdditiveBlending)`. additive는 순서 무관이라 깊이 정렬 문제가 없다.
- 구형 셸 샘플링: 반지름에 75~100% 지터를 준 `Spherical` 무작위 샘플로 두께 있는 껍질 폭발을 만든다.
- 생애주기: 진행도 `uProgress` 하나를 remap으로 겹치는 위상으로 분해 — 폭발 [0,0.1], 낙하 [0.1,1.0], 크기 열기 [0,0.125], 크기 닫기 [0.125,1], 반짝임 [0.2,0.8]. 폭발·낙하는 3차 ease-out `1-pow(1-x,3)`.
- 적용 위치: `app/world/RpgHanabiLayout.ts`(순수 위상 함수), `app/world/RpgTownAmbience.tsx`(렌더).
- 출처: https://github.com/nothingnothings/threejs-fireworks (위상 상수·셸 샘플링 원문), https://threejs-journey.com/lessons/fireworks-shaders (5위상 설계), https://github.com/mmousawy/WebGL-Fireworks (수치 기준점: 입자 300/발, 중력 프레임당 -0.2 등 — 참고만, 이 레포는 자체 예산 사용)
- 참고: `THREE.Points`는 렌더러 삼각형 통계에 잡히지 않으므로 삼각형 예산과 독립이고, 입자 수는 화질·플리커 기준으로 정한다.

## 4. 동작 완급 (사인 단조 제거)

- 방법론: 소수 키프레임 + 절차 레이어. 출처: GDC 2014 "Animation Bootcamp: An Indie Approach to Procedural Animation" (David Rosen) — https://www.gdcvault.com/play/1020583/Animation-Bootcamp-An-Indie-Approach
- 수식: 프레임레이트 무관 damper `lerp(x, g, 1-exp(-(ln2·dt)/halflife))` 와 임계감쇠 스프링 폐형해(감쇠 `d = 4·ln2/halflife`). 출처: https://theorangeduck.com/page/spring-roll-call . three.js에는 같은 계열이 `MathUtils.damp`로 내장돼 있음을 r0.185.1 소스에서 확인.
- 적용 위치: `app/world/RpgCharacterMotion3d.ts`
  - `advanceCriticallyDampedSpring` — 위 폐형해 그대로.
  - 이동 블렌드를 스프링으로 바꾸고 그 속도(`movementBlendVelocity`)를 가속 기울기(`ACCELERATION_LEAN_GAIN`)에 연결 — 출발 시 앞으로 숙임(예비 동작), 정지 시 되돌아오는 정착(따라오는 움직임).
  - 착지 반동: 공중→접지 전환 프레임에 충격량을 넣고 반감기 0.09s 스프링이 풀어낸다(`LAND_RECOIL_*`). 임계감쇠 범프의 피크는 `impulse/(y·e)`, `y = 2·ln2/halflife`.
  - 접지 눌림: 골반 상하를 대칭 `|sin|`에서 `pow(|sin(2φ+0.35)|, 1.7)` 성형으로 바꿔 접촉 순간 급격히 낮아지게.
  - 머리카락·소매·치마 지연: 게이트 위상 0.8~1.05 라디안 지연(10.8 rad/s 기준 74~97ms)으로 몸을 따라오게. 회전 성분은 기존 `turnFollow`(자체 감쇠 팔로워)가 이미 지연이라 그대로.
  - 어깨 스윙 파형: `sign(s)·|s|^1.3` 성형으로 반환점에서 머무르고 중간을 빠르게 지나가게.

## 5. 채택하지 않은 항목

- Genshin식 얼굴 SDF 그림자(step((-FdotL+1)/2, faceShadowMap)): 이 레포 얼굴은 승인 원화 크롭 텍스처라 별도 얼굴 그림자 맵이 없고, 얼굴을 어둡게 하지 않는 방향이 승인 기준이라 제외. 출처 기록만: https://github.com/NoiRC256/URPSimpleGenshinShaders
- 후처리(포스트프로세싱) 기반 외곽선·블룸: 포스트프로세싱 없이 가능한 것 위주라는 방침에 따라 제외.
- GSAP 등 트윈 라이브러리: 패키지 추가 금지 제약으로 경과시간 기반 자체 위상 계산으로 대체.
