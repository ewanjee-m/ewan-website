---
status: accepted
---

# Next.js 서버리스 API 경계

3D 화면과 이동 계산은 브라우저에서 실행하고, OpenAI 요청만 같은 Next.js 저장소의 서버리스 `Route Handler`에서 처리한다. 비밀 키가 필요 없는 날씨 요청은 브라우저에서 직접 처리한다. 이 구조는 별도 서버를 운영하지 않으면서 API 키를 브라우저와 공개 파일에서 분리하고 배포 지점을 하나로 유지한다.

## 고려한 선택

- 완전한 정적 내보내기는 사이트 소유자의 OpenAI API 키를 안전하게 보관할 수 없어 사용하지 않는다.
- 별도 서버리스 함수 저장소는 비밀 값을 보호할 수 있지만 배포와 장애 확인 지점이 늘어나 사용하지 않는다.
- 상시 서버와 데이터베이스는 현재 포트폴리오 경험에 필요하지 않아 두지 않는다.

## 결과

- `OPENAI_API_KEY`는 배포 환경의 비밀 값으로만 저장한다.
- 도쿄 날씨는 브라우저가 Open-Meteo의 키 없는 현재 날씨 API를 직접 호출하고, `30분` 최신성 기준을 넘은 값은 AI에 전달하지 않는다.
- OpenAI 요청은 `mode`, 현재 장면 구역, 허용 목적지, 도쿄 날짜와 검증된 현재 날씨만 입력으로 받는다.
- 로그인이나 개인 정보와 연결되지 않은 익명 브라우저 세션 ID를 OpenAI `safety_identifier`로 함께 보내 개별 방문자의 악용이 전체 프로젝트에 미치는 영향을 줄인다.
- OpenAI 응답은 `destinationId`, `themeId`, `basis`만 가진 엄격한 출력 스키마로 제한하고, 서버에서 허용 ID와 `basis === mode`를 다시 검증한다. AI가 좌표·방향·이동 명령을 만들거나 플레이어 캐릭터를 직접 제어하지 않게 한다.
- 한 번에 한 요청, 중복 제거, `5초` 제한 시간과 취소·늦은 응답 무시를 적용한다. 실패 때 기존 추천이 있으면 유지하고, 없을 때만 검증된 로컬 기본 안내를 활성화한다.
- Cloudflare Workers Rate Limiting binding의 공통 namespace에서 접속 IP당 `분당 18회`, 브라우저 ID당 `분당 6회`, AI 안내 전체 `분당 60회`를 순서대로 제한한다. 위치 단위의 느슨한 카운터이므로 전 세계의 엄격한 호출 수나 비용 상한이라고 표현하지 않는다.
- OpenAI 프로젝트 예산은 월간 사용량 알림이며 강제 비용 상한이 아니다. 환경 변수로 AI 안내를 즉시 끌 수 있게 한다.
- 3D 모델, 텍스처와 포트폴리오 내용은 정적 파일로 배포하고 캐시한다.
- 3D 렌더링 성능은 `Route Handler`와 분리해 브라우저에서 최적화한다.

## 근거

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI 안전 식별자](https://developers.openai.com/api/docs/guides/safety-best-practices#implement-safety-identifiers)
- [OpenAI API 프로젝트 예산과 알림](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform)
