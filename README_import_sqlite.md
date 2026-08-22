
# TXT → SQLite 변환 안내

이 문서는 기반데이터 폴더의 단일-행 TXT 파일들을 SQLite로 변환하는 방법을 정리합니다.

요약
- 파일 포맷: 열 구분자는 `|`, 행 구분자는 `^`입니다. 파일의 첫 번째 `^` 이전 부분은 헤더(열 이름)입니다.
- 스크립트: `import_to_sqlite.py` (파일명에서 `yyyymmdd` 형식의 버전명을 제거하고 테이블명으로 사용)
- 기존 DB 테이블 버전 제거: `strip_db_table_versions.py`
- 기본 임포트는 기존 대상 테이블을 교체하여 이전 버전 행이 남지 않음

사용 전제
- 파일 인코딩은 UTF-8이어야 합니다.
- 각 TXT 파일은 워크스페이스의 `basedata` 같은 디렉토리에 위치시키면 편합니다.

빠른 사용법

1) `basedata` 폴더 전체를 `basedata.db`로 임포트:

```bash
python import_to_sqlite.py --dir basedata --db basedata.db
```

기존 `basedata.db`가 있어도 임포트 대상 테이블은 먼저 교체됩니다. 의도적으로
기존 테이블에 행을 누적할 때만 `--append`를 사용하세요.

추가: 정부 오픈API의 baseInfo JSON에서 최신 TXT 다운로드 URL을 자동으로 가져와 `--dir`로 내려받고 임포트하려면:

```bash
# 기반데이터를 먼저 다운로드한 뒤 임포트 (다운로드 대상 = --dir)
python import_to_sqlite.py --dir basedata --db basedata.db --fetch-baseinfo

# 다운로드 폴더 비우고 다시 내려받아 임포트
python import_to_sqlite.py --dir basedata --db basedata.db --fetch-baseinfo --clean-downloads

# 다운로드 시 기존 파일을 덮어쓰려면
python import_to_sqlite.py --dir basedata --db basedata.db --fetch-baseinfo --overwrite

# 다운로드한 파일 목록만 보고 종료
python import_to_sqlite.py --dir basedata --list-downloads
```

2) 임포트가 끝나면 테이블 목록 확인:

```bash
sqlite3 basedata.db "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
```

3) 샘플 행 조회 예시:

```bash
sqlite3 basedata.db "SELECT * FROM route LIMIT 5;"
```

버전명(yyyymmdd*) 처리

- `import_to_sqlite.py`는 파일명에서 후미의 `yyyymmdd`(예: `20260314`)와 뒤이은 문자들을 제거한 값을 테이블명으로 사용합니다. 예: `route20260314V2.txt` → 테이블명 `route`.
- 이미 임포트되어 있는 DB의 테이블명을 한꺼번에 바꾸려면 `--rename-db-tables` 옵션을 사용하세요:

```bash
python import_to_sqlite.py --db basedata.db --rename-db-tables
```

충돌 처리: 동일한 대상 테이블명이 이미 존재하면 `_1`, `_2` 식으로 접미사가 붙습니다.

성능 및 주의사항
- 모든 열은 TEXT로 생성됩니다. 필요한 경우 나중에 적절히 타입 변환 혹은 인덱스 생성을 권장합니다.
- 큰 파일(수백만 행)은 시간이 걸립니다. 실행 중인 로그를 확인하세요.

인덱스 추가 예시

```sql
-- 예: station 테이블에 id 컬럼이 존재하면
CREATE INDEX IF NOT EXISTS idx_station_id ON station(id);
```

문제 해결 팁
- 파일에서 행 구분자가 잘못되었거나 헤더가 누락되면 데이터가 올바르게 파싱되지 않습니다. 먼저 텍스트 편집기에서 `^`와 `|` 포맷을 확인하세요.
- 인코딩 문제(특수문자 등)는 `utf-8`로 재저장 후 재시도하세요.

추가 지원
- 특정 테이블만 재임포트하거나, 테이블별로 타입/인덱스 제안을 원하시면 알려주세요.

운영 서버 자동 갱신 (systemd 타이머)
- 매일 자동 갱신은 `tools/refresh_basedata.sh`를 사용합니다 — 새 파일(`basedata.db.new`)에 임포트하고, 핵심 테이블에 데이터가 들어왔는지 확인한 뒤에만 `api` 컨테이너를 내리고 기존 `basedata.db`를 교체·재기동합니다. 임포터 자체도 기본적으로 기존 임포트 대상 테이블을 교체하므로 수동 실행에서도 이전 버전 행이 누적되지 않습니다.
- 운영 서버(`/root/gg-bus-history`)에 `tools/systemd/bustal-refresh.service`, `tools/systemd/bustal-refresh.timer`를 `/etc/systemd/system/`에 설치하고 `systemctl enable --now bustal-refresh.timer`로 매일 05:00(KST)에 실행되게 등록되어 있습니다. 당일 원시데이터는 보통 새벽 4~5시경에야 채워지므로(그 전에는 다운로드 URL이 200 OK/0바이트로 빈 채 온다) 여유를 두고 05:00으로 잡았습니다. 로그는 `journalctl -u bustal-refresh.service`로 확인합니다.

웹 UI(Next.js) 예시
- 경로 검색 웹 앱을 포함한 예시 Next.js 프로젝트가 워크스페이스에 추가되어 있습니다. 앱은 `basedata.db`를 열어 A/B 위치 반경 내 정류장을 찾고, 동일 노선상에서 A->B 순서로 이동 가능한 노선들을 반환합니다.

시작 방법 (개발):

Docker Compose 사용(권장):

```bash
# 프로젝트 루트에서
docker compose up --build
```

개별 서비스만 실행하려면:

```bash
# API(파이썬)만 빌드/실행
docker compose up --build api

# 웹(Next.js)만 빌드/실행
docker compose up --build web
```

브라우저에서 `http://localhost:3000` 접속 후 A/B 좌표와 반경(m)을 입력해 검색하세요.
