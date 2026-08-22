# UI 스크린샷 도구

dev 서버(`npm run dev` 또는 `make dev-up`)에서 UI 변경사항을 실제 브라우저 렌더링으로
눈으로 확인하기 위한 범용 스크립트. Claude Code, Codex 등 어떤 에이전트든 그냥
`node`로 실행하면 되고, 특정 도구 전용 스킬이 아니다.

이 폴더는 `../../package.json`(프로젝트 본체)과 분리된 자체 `package.json`을 갖는다
— Playwright를 프로젝트 본체의 `node_modules`에 넣지 않기 위해서다(그 `node_modules`는
컨테이너로 통째 마운트되므로 여기서 오염시키면 안 된다).

## 최초 1회 설치

```bash
cd tools/screenshot
npm install
npx playwright install chromium
```

## 사용법

```bash
node tools/screenshot/capture.mjs \
  --url "http://localhost:3000/?ax=127.068111&ay=37.209902&bx=127.024511&by=37.504501&aradius=900&bradius=900&sday=2026-08-13&view=results" \
  --out /tmp/shot.png
```

옵션:
- `--width`, `--height`: 뷰포트 크기(기본 390x900, 모바일 폭)
- `--wait`: networkidle 이후 추가로 기다릴 시간(ms, 기본 1500)
- `--wait-selector`: 고정 대기 대신 이 CSS 셀렉터가 나타날 때까지 기다림(데이터 로딩이
  걸리는 화면에서 더 안정적 — 예: `'[aria-label="결과 화면 전환"] button'`)
- `--no-full-page`: 페이지 전체가 아니라 현재 뷰포트만 캡처

## 딥링크로 특정 화면 바로 열기

`pages/index.tsx`가 지원하는 URL 쿼리 파라미터로 검색 조작 없이 원하는 화면을 바로 열 수
있다: `ax`/`ay`/`bx`/`by`/`aradius`/`bradius`/`sday`(또는 `sk`/`ek`로 표시 라벨),
`view=results` 또는 `view=all_timetable`로 결과 카드/통합 시간이력 화면을 바로 연다.
