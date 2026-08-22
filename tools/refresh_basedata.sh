#!/usr/bin/env bash
# 매일 새벽 basedata.db를 정부 공공데이터 최신본으로 갱신한다(systemd 타이머로 기동).
#
# 매번 새 파일(basedata.db.new)에 임포트하고, 핵심 테이블에 데이터가 들어왔는지
# 확인한 뒤에만 기존 파일을 교체한다. 임포터도 기본적으로 대상 테이블을 교체하지만,
# 새 DB 파일을 사용하는 방식이 전체 데이터셋 교체를 보장한다.
#
# api 컨테이너가 basedata.db를 WAL 모드로 열어두므로, 파일 교체 전에 컨테이너를 반드시
# 내린다. docker-compose 1.29.2가 "컨테이너 재생성" 경로에서 이미지 메타데이터 파싱
# 버그(KeyError: ContainerConfig)를 갖고 있어(레거시 빌더로 만든 이미지), stop 후
# rm으로 컨테이너를 완전히 지운 뒤 up으로 새로 만드는 방식을 쓴다(README_docker.md
# 배포 흐름에서도 동일하게 우회).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

COMPOSE="docker-compose -f docker-compose.prod.yml"
DB_LIVE="basedata.db"
DB_NEW="basedata.db.new"
DB_PREV="basedata.db.prev"

log() {
  echo "[refresh_basedata $(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "시작"

rm -f "$DB_NEW"

python3 import_to_sqlite.py \
  --dir basedata \
  --db "$DB_NEW" \
  --fetch-baseinfo \
  --clean-downloads \
  --overwrite \
  --low-memory

# 최소 정합성 검증 — 핵심 테이블이 비어있지 않을 때만 교체를 진행한다.
for table in station route routestation routeline vehicle; do
  count=$(sqlite3 "$DB_NEW" "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo 0)
  log "검증: $table = ${count}행"
  if [ "${count:-0}" -lt 1 ]; then
    log "실패: $table 테이블이 비어있어 교체를 중단합니다. 기존 $DB_LIVE는 그대로 둡니다."
    exit 1
  fi
done

log "검증 통과 — api 컨테이너를 내리고 DB를 교체합니다"
$COMPOSE stop api
$COMPOSE rm -f api

rm -f "${DB_LIVE}-wal" "${DB_LIVE}-shm"
rm -f "$DB_PREV"
[ -f "$DB_LIVE" ] && mv "$DB_LIVE" "$DB_PREV"
mv "$DB_NEW" "$DB_LIVE"

$COMPOSE up -d api

log "완료. 이전 DB는 ${DB_PREV}로 보존됨"
