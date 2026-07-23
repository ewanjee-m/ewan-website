---
status: superseded
---

> 이 결정은 [ADR 0003: 승인 원화 기준 Canvas 2D 렌더러](0003-approved-reference-canvas-renderer.md)로 대체됐다. 아래 본문은 당시 결정을 그대로 보존한다.

# WebGL 2 geometry 기반 RPG 렌더러

모바일을 포함한 넓은 지원 범위와 화면 안정성을 우선해 React Three Fiber의 `WebGL 2` Canvas를 사용한다. 플레이 가능한 `72×72` 정사각형의 지면, 건물과 상호작용 대상은 React와 Three.js geometry(입체 형태)로 만들고, 승인 배경 이미지는 경계 밖 먼 원경에만 둔다.

## 결정

- 공항 터미널·버스, 도쿄 건물, 규카츠 마치야, 벚꽃나무, 운하·다리, 축제 가판대·등불·도리이는 geometry로 렌더링한다. 주변 인물은 고해상도 투명 WebP의 정면을 머리·몸통·옷·팔다리의 병합 geometry에 투영하고 진행 방향으로 회전한다.
- `/assets/world/world-environment-concept.png`는 플레이 가능한 가장 먼 모서리 밖 반지름 `55.5`, 높이 `40`, 불투명도 `0.2`의 원통 안쪽에 원본 비율의 네 구간으로 반복한다. 하단을 투명하게 흐리게 하고 `blocksMovement=false`로 두어 지면, 건물과 충돌을 대신하지 않는다. 이미지의 넓은 구역 포장, 해안색과 큰 벚꽃 구도는 가까운 3D surface와 landmark로 대응시킨다.
- 마을, 플레이어와 효과에 같은 world transform을 적용하고 변환된 player 위치·heading을 카메라 입력으로 사용한다.
- 카메라는 pitch에 따라 `6.4~7.2` 거리와 `1.6~3.15` 높이에서 player를 따라간다. 기본 세로 화각은 `52도`, 하늘 보기는 최대 `84도`다. player 이동량은 camera와 target에 즉시 더하고 회전 framing과 충돌 회피는 시간 기반으로 보간한다. 좌우·후진·drag 중에는 실제 camera yaw를 유지하고, drag 뒤 첫 정면 전진에서 보이는 yaw를 추적 heading으로 옮겨 화면 도약 없이 이어 간다. drag yaw·pitch는 오비트와 하늘 보기를 우선하며 자동으로 캐릭터 뒤로 복귀하지 않는다.
- 마을 경계, 차단 landmark footprint, 다리 없는 운하 구간과 현재 움직이는 버스의 회전된 footprint가 충돌의 단일 기준이다. 도로·보도·광장·잔디 종류는 이동을 제한하지 않는다.
- 반복 돌, 잔디, 벚꽃잎, 먼 건물과 구역 밀도용 입체물은 geometry 종류별 instance로 묶고 static shadow는 첫 세 frame 뒤 갱신하지 않는다. 대표 터미널·버스·tower·마치야·다리·가판대는 상세 geometry를 유지한다.
- 기기 입력 특성과 frame 시간을 기준으로 high·medium·low 품질을 선택하고 device pixel ratio, antialias, shadow와 petal 수를 조절한다.
- 공항버스는 폐곡선을 순환·정차하고 바퀴를 주행 거리만큼 회전시킨다. 주변 인물은 통행 가능한 2~4개 지역 지점을 순찰하고 끝점에서 역할별 행동을 한다. 움직임 감소 설정에서는 양쪽 모두 출발 자세에 고정한다.
- `RpgTownAmbience`만 sky, fog, hemisphere, ambient, directional, 구역별 point light를 제공하고 장면의 환경 조명은 중복 렌더링하지 않는다. 완전한 밤에도 hemisphere `1.7`, ambient `0.85`, directional `0.95`, tone mapping exposure `1.18`을 유지한다.
- 캐릭터 선택과 월드 플레이어는 같은 승인된 `1024×1536` 앞·뒤 PNG를 사용한다. 월드에서는 이미지 영역을 sphere·capsule·rounded box·cylinder의 실제 표면에 projected volumetric UV로 투영하고 plane이나 방향별 sprite를 사용하지 않는다.
- 모델의 로컬 `+Z`를 정면으로 두고 논리 heading까지 최단각 y축 회전을 적용한다. 좌우 전환에 image flip이나 음수 scale을 사용하지 않는다.
- 움직이는 플레이어는 정적 shadow map에 포함하지 않고 높이에 따라 변하는 지면 접촉 그림자를 사용한다.
- animation loop의 camera, movement, transform과 timeline 계산은 caller-owned buffer를 재사용한다.
- WebGL context를 잃거나 3D render가 실패하면 같은 언어의 HTML 포트폴리오를 보여 준다.

## 고려한 선택

- 한 장의 일본 마을 이미지를 플레이 공간의 plane에 붙이고 카메라와 캐릭터만 움직이는 방식은 앞뒤 관계, 건물 뒤 이동, 다리 높이와 실제 충돌을 만들 수 없어 사용하지 않는다. 같은 이미지를 경계 밖 원경에만 두고 가까운 공간은 geometry로 분리한다.
- player heading을 한 frame에 그대로 복사하는 방식은 방향 전환 때 화면이 급회전하므로 사용하지 않는다. 추적 heading을 시간 기반으로 보간한다.
- 구형 지면은 수평 도로, 마을 안쪽 진입과 화면 기준 이동을 복잡하게 만들고 승인된 RPG 구도와 맞지 않아 사용하지 않는다.
- 외부 고용량 3D model과 여러 photo texture는 첫 로딩, mobile memory와 캐릭터 스타일 일치 비용이 커서 마을의 기본 표현으로 사용하지 않는다. 승인 배경 한 장, 선택한 캐릭터의 앞·뒤 PNG와 네 주변 인물 runtime WebP만 목적이 제한된 texture로 사용한다.
- 방향별 플레이어 sprite를 교체하거나 측면 이미지를 반전하는 방식은 카메라 오비트에서 깊이가 사라지고 방향 전환이 끊겨 사용하지 않는다.

## 결과

- 방문자는 geometry 사이의 시차와 가림을 통해 마을 안에 들어간 깊이를 본다.
- 보이는 다리 상판과 플레이어 높이, 운하 통행 제한이 같은 layout 데이터에서 나온다.
- 정면 전진에서 camera가 화면 전방을 추적하고 좌우·후진과 drag에서는 보이는 yaw가 유지된다. drag 뒤 다시 전진할 때도 실제 화면 yaw를 새 기준으로 삼아 화면 전방이 갑자기 바뀌지 않는다.
- 플레이어 몸도 heading까지 실제 3D로 회전하고 양쪽 팔다리, 머리카락과 옷자락이 이어서 움직이므로 옆·뒤·대각선에서 같은 부피를 유지한다.
- 모든 장면은 첫 진입에 함께 준비되므로 구역 경계에서 원경을 교체하거나 빈 배경을 보이지 않는다.
- 복잡한 물리 engine 없이 경계 안의 이어진 바닥, 차단 footprint, 운하·다리와 움직이는 버스 충돌로 예측 가능한 RPG 이동을 제공한다.
- 장면 detail을 늘릴 때는 draw call, triangle, 초당 frame telemetry와 모바일 캡처를 함께 확인해야 한다.
