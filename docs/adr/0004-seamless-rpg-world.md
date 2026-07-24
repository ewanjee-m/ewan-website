---
status: accepted
---

# 연속 WebGL 3D RPG 월드

## 배경

제품은 다섯 장소를 한 장의 참고 이미지와 즉시 이동으로 보여 주는 대신, 방문자가 같은 공간 안에서 직접 걷고 카메라를 돌리며 구조물, NPC와 효과를 경험해야 한다.

## 결정

활성 흐름은 다음과 같다.

```text
ExperienceShell
→ WorldView
→ SeamlessWorldCanvas
→ WorldRuntime + RpgTownScene + RpgPlayerActor + ChaseOrbitCamera3d
```

- `SeamlessWorldCanvas`는 월드 입장 동안 하나의 WebGL Canvas와 런타임을 유지한다.
- `WorldRuntime`은 연속 좌표, 충돌, 점프, 구역, 상호작용과 탐색 리비전을 소유한다.
- `RpgTownScene`은 지형, 건축물, 랜드마크, NPC와 효과를 하나의 3D 장면으로 렌더링한다.
- `RpgPlayerActor`는 선택한 남성·여성 GLB와 자산 실패 대체를 소유한다.
- `ChaseOrbitCamera3d`는 수동 회전, 진행 방향 복귀, 장소 프로필, 충돌과 안전 영역을 소유한다.
- 미니맵과 전체 지도는 같은 런타임 위치와 리비전을 투영한다. 지도 선택은 이동을 수행하지 않는다.
- 구역 경계 통과는 새 장면 마운트나 새 핵심 자산 요청을 만들지 않는다.

## 검증

- 공항에서 하나비까지 실제 키보드 입력 기준 걷기 `75.8초`, 달리기 `64.3초`
- 지도 갱신 지연 `100ms` 이하
- 카메라 최소 붐 `2.6`, 안전 위반 `250ms` 이하
- 5초 준비 후 정확히 75초 성능 측정, 데스크톱·CPU 제한 모바일 각 3회
- 데스크톱·모바일 각 10개 시각 캡처와 별도 검토
- Canvas, 런타임, 장면 마운트 각각 한 번

## 역사

ADR 0003과 G005/G007 도구·증거는 당시 Canvas 2D 결정 기록으로 보존한다. 현재 활성 런타임이나 시각 검증 명령으로 사용하지 않는다.
