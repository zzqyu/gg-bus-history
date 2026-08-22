# CLAUDE.md

이 파일은 이 저장소의 코드를 작업할 때 Claude Code(claude.ai/code)가 따라야 할 지침을 제공합니다.

## 프로젝트 개요

경기도 버스 시간 이력 조회 서비스("버스탈시간") — SQLite에 저장된 경기도 버스 운행 이력/예정 데이터를 사용해 "A에서 B로 갈 때 어떤 버스를 타야 하는가"에 답하고, 정부 공공 API의 실시간 도착 예측 정보를 결합하는 FastAPI 기반 Next.js 웹 앱입니다.

Caddy 뒤에서 세 서비스가 실행됩니다: `caddy`(리버스 프록시/TLS) → `web`(Next.js) → `api`(FastAPI, 운영 환경에서는 내부 전용).

프론트엔드 스택은 Next.js 15, React 19, Tailwind CSS v4, shadcn/ui입니다. 실제 결과 화면은 `pages/index.tsx`가 `components/result/ResultCard.tsx`, `components/result/TimetableView.tsx`, `components/result/DaySwitcher.tsx`를 조합해 렌더링합니다. (2026-08 UI/UX 개편 중 시안 비교용으로 쓰던 `/preview` 라우트와 `components/preview/`, `preview/fixtures/`는 개편 완료 후 삭제했습니다 — 히스토리는 `plans/ui-ux/`에 남아 있습니다.)

## 명령어

이 저장소는 Docker Compose와 `Makefile`을 통해 실행됩니다. `docker compose`를 직접 호출하기보다 `make` 타깃을 우선 사용하세요(`.roorules` 참고).

```bash
make dev-up      # 개발 스택 시작(Caddyfile.dev, 포트 3000, 자체 서명 TLS)
make dev-logs    # caddy/web/api 로그 확인
make dev-down    # 개발 스택 중지

make prod-up     # 운영 스택 시작(Caddyfile.prod, 포트 80/443)
make prod-logs
make prod-down   # 운영 스택 중지

make web-install # 운영 web 컨테이너 내부에서 npm ci 실행(패키지 추가 시 사용)
make web-build   # 운영 web 컨테이너 내부에서 npm run build 실행
make web-clean   # rm -rf .next node_modules
```

프론트엔드만 실행하는 경우(Docker 외부): `npm run dev` / `npm run build` / `npm start`. `package.json`에는 lint 또는 test 스크립트가 설정되어 있지 않습니다.

API 검증(자동화된 테스트가 없으므로 수동으로 검증):
```bash
curl 'http://localhost:8000/findRoutes?ax=127.068111&ay=37.209902&bx=127.024511&by=37.504501&aradius=500&bradius=500&sday=2026-03-20' -s -o /dev/null -w '%{time_total}s\n'
docker compose logs --tail 100 api | grep 'find_routes: pair_sql executed'
```

원본 `basedata/*.txt` 파일에서 기본 SQLite DB를 다시 생성:
```bash
python import_to_sqlite.py --dir basedata --db basedata.db
```
열은 `|`로 구분되고 행은 `^`로 구분됩니다. 스크립트는 파일 이름 끝의 `yyyymmdd*` 버전 접미사를 제거해 테이블 이름을 생성합니다(예: `route20260802V2.txt` → 테이블 `route`). `--fetch-baseinfo` 자동 다운로드 흐름과 `--rename-db-tables`에 대해서는 `README_import_sqlite.md`를 참고하세요.

운영 서버(VPS) 운용 스크립트(`tools/`):
- `tools/deploy_web.sh` — 운영 서버에서 master를 pull 받아 Caddy 설정과 web/api 중 실제로 바뀐 쪽만 반영하고 헬스체크까지 한다. 로컬에서 push한 뒤 `ssh root@bustal.kr -p 2222 "cd ~/gg-bus-history && ./tools/deploy_web.sh"`로 배포한다. 자세한 배경은 `README_docker.md` 참고.
- `tools/refresh_basedata.sh` — `basedata.db`를 정부 공공데이터 최신본으로 매일 자동 갱신한다. 새 파일에 임포트 후 핵심 테이블 검증을 통과해야만 교체하며, 운영 서버에 systemd 타이머(`tools/systemd/bustal-refresh.timer`, 매일 05:00 KST)로 등록돼 있다. 자세한 배경은 `README_import_sqlite.md` 참고.
- `tools/screenshot/capture.mjs` — dev 서버 화면을 Playwright로 캡처해 UI 변경을 눈으로 확인하는 범용 스크립트. Claude 전용 스킬이 아니라 순수 node 스크립트라 다른 에이전트(Codex 등)도 그대로 쓸 수 있다. 최초 1회 `cd tools/screenshot && npm install && npx playwright install chromium` 필요 — 사용법은 `tools/screenshot/README.md` 참고.

## 아키텍처

**프론트엔드 → API 프록시 → FastAPI → SQLite** 구조이며, 브라우저가 FastAPI를 직접 호출하지 않습니다.
- `pages/index.tsx`(약 2,200줄)는 앱 상태 대부분(검색 좌표, 결과, 그룹별 시간표 상태, Kakao Map 참조, 공유 모달 상태)을 보유한 하나의 큰 클라이언트 컴포넌트입니다. Kakao Maps SDK, 지오코딩/장소 검색 및 모든 데이터 가져오기를 조정하며, 실시간 도착 목록은 `hooks/useRealtimeArrival.ts`가 정류장 단위로 조회·캐시합니다.
- `pages/api/*.ts`는 FastAPI 엔드포인트(`http://api:8000/...` — localhost가 아닌 Docker 서비스 이름)를 1:1로 프록시하는 얇은 Next.js API 라우트입니다. 따라서 브라우저는 API 컨테이너와 직접 통신하지 않습니다. 각 라우트는 하나의 FastAPI 경로를 대응합니다: `findRoutes`, `groupTimetable`, `allGroupsTimetable`, `routeLine`, `realtimeArrivalList`, `realtimeArrivalItem`.
- `components/`는 `pages/index.tsx`에서 props/콜백으로 구동되는 프레젠테이션 컴포넌트입니다. 결과 UI는 `components/result/`의 `ResultCard`, `TimetableView`, `DaySwitcher`가 담당합니다(구 `GroupCard`, `GroupTimetable`, `AllGroupsTimetable`, `RealtimeArrivalPanel`, `ResultsSection`, `DateSelector`는 삭제됨). 별도의 상태 관리 라이브러리나 라우팅은 없으며, 단일 페이지 앱으로 구성됩니다.
- `utils/`에는 순수 헬퍼가 있습니다: `timeUtils.ts`(운행일 경계 — "운행일"은 자정을 넘길 수 있음), `routeUtils.ts`, `mapUtils.ts`(좌표 파싱), `stationNumberUtils.ts`(그룹 전체에서 정류장별 승차/하차 번호를 안정적으로 부여), `realtimeUtils.ts`, `styleUtils.ts`.
- `types/index.ts`는 API 응답과 프론트엔드 사이에서 공유하는 데이터 형태 계약(`Group`, `RouteTimetable`, `TimetableEntry`, `RealtimeArrivalItem` 등)을 정의합니다. 스택을 따라 특정 필드의 흐름을 추적할 때 먼저 이 파일을 확인하세요.

**`api/app.py`**(약 1,700줄, 단일 파일)는 핵심 도메인 로직입니다.
- `find_routes` / `all_groups_timetable`: A/B 좌표와 반경을 받아 주변 정류장을 찾은 다음, A 근처 정류장을 B 근처 정류장보다 먼저 통과하는 노선(동일 노선, 정류장 순서 오름차순)을 찾아 승차/하차 후보 정류장 쌍으로 그룹화합니다.
- `build_timetables_for_routes` / `group_timetable`: 확정된 승차→하차 정류장 쌍에 대해 예정 시간표를 생성합니다. 과거 도착 시간을 보완하고, 직접 데이터가 부족하면 `_match_vehicle_dp`(두 정류장 사이의 차량 배차 시간을 DP 방식으로 매칭하는 함수)를 통해 승차/하차 시각을 추론합니다.
- `fetch_realtime_arrival_list` / `fetch_realtime_arrival_item` / `realtimeArrival*` 엔드포인트: 외부 정부 실시간 도착 API를 호출하고 응답 형태를 정규화한 뒤 짧은 시간 동안 캐시합니다(`REALTIME_CACHE`, TTL 12초). 이는 조합된 시간표와 기타 외부 호출에 사용하는 범용 `CACHE`(TTL 5분)와 별개입니다.
- `get_db_connection`은 읽기 중심의 동시 접근에 맞게 WAL과 조정된 PRAGMA를 적용해 `basedata.db`를 엽니다. 대부분의 배포 경로에서 DB는 API 컨테이너에 읽기 전용으로 마운트됩니다.
- 오류는 stdout에 출력하는 동시에 `RotatingFileHandler`를 통해 `api/pastArrival_errors.log`에도 기록됩니다.

**데이터 모델**(`basedata/*.txt`에서 가져온 SQLite 테이블): `station`, `route`, `routestation`(노선 ↔ 정류장 순서), `routeline`(노선별 폴리라인 형상), `vehicle`, `area`. 가져온 모든 열의 타입은 TEXT이며, `find_routes` 및 관련 함수가 쿼리 시점에 Python/SQL에서 숫자 및 지리 연산을 수행합니다.

**배포**: `Caddyfile.dev`는 `:3000`에서 TLS를 내부적으로 종료합니다. `Caddyfile.prod`는 80/443 포트에서 `bustal.kr`을 `web:3000`으로 리버스 프록시하며, `www`와 기존 도메인은 신규 canonical 도메인으로 301 리디렉션합니다. Caddy가 Let's Encrypt 인증서를 자동 발급·갱신하고 `caddy_data` 볼륨에 보관합니다. 운영 환경에서 `api` 컨테이너는 호스트 포트를 게시하지 않으며 Docker 네트워크를 통해 `web`에서만 접근할 수 있습니다. `docker-compose.yml`(`.dev`/`.prod`가 아닌 일반 파일)은 `README_docker.md`의 VPS 배포 흐름에서 직접 사용되며 자체 웹 포트 환경 변수(`WEB_PORT`, 기본값 3000)를 가집니다. Make로 구동하는 개발/운영 Compose 파일과 혼동하지 마세요. 운영 서버 자체는 `docker-compose.prod.yml`로 떠 있으며, 코드 배포는 `tools/deploy_web.sh`가, `basedata.db` 일일 갱신은 `tools/refresh_basedata.sh`(systemd 타이머)가 담당합니다.

필수 환경 변수(`.env.local`, 커밋하지 않음): `NEXT_PUBLIC_KAKAO_MAP_API_KEY`, `NEXT_PUBLIC_KAKAO_JS_KEY`, `NEXT_PUBLIC_KAKAO_SHARE_TEMPLATE_ID`(Kakao Maps SDK 및 공유 기능), `BASEINFO_SERVICE_KEY`(`api/app.py`와 `import_to_sqlite.py --fetch-baseinfo`가 서버 측에서 사용하는 정부 공공 API 키).
