#!/usr/bin/env bash
# 운영 서버(VPS)에서 master를 pull 받아 web/api를 재배포한다.
#
# 이번 배포 세션 동안 반복했던 수동 절차(git pull → 필요시 npm ci/build →
# docker-compose stop/rm/up)를 그대로 스크립트화했다. docker-compose 1.29.2가
# "컨테이너 재생성" 경로에서 이미지 메타데이터 파싱 버그(KeyError: ContainerConfig)를
# 갖고 있어(레거시 빌더로 만든 이미지), stop 후 rm으로 컨테이너를 완전히 지운 뒤
# up으로 새로 만드는 방식을 쓴다.
#
# 사용법:
#   tools/deploy_web.sh              # origin/master를 pull
#   tools/deploy_web.sh <branch>      # 지정한 브랜치를 pull
#
# 전제: 이 스크립트는 운영 서버의 저장소 루트(~/gg-bus-history)에서, 이 파일이
# git으로 이미 pull된 상태로 실행한다(최초 1회는 수동으로 pull 필요).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

COMPOSE="docker-compose -f docker-compose.prod.yml"
BRANCH="${1:-master}"
SITE_URL="${DEPLOY_HEALTHCHECK_URL:-https://bustal-time.kro.kr/}"

log() {
  echo "[deploy_web $(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Caddyfile.prod는 운영 전용 커스터마이징(보안 헤더, 별도 사이트 라우팅 등)이
# 항상 로컬에서만 수정된 채(uncommitted) 유지된다 — 이건 정상이니 dirty 체크에서 뺀다.
dirty="$(git status --porcelain -- ':!Caddyfile.prod' || true)"
if [ -n "$dirty" ]; then
  log "경고: Caddyfile.prod 외에 커밋되지 않은 변경사항이 있습니다 — 배포를 중단합니다."
  echo "$dirty"
  exit 1
fi

OLD_HEAD="$(git rev-parse HEAD)"

log "브랜치 $BRANCH fetch/pull 중"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

NEW_HEAD="$(git rev-parse HEAD)"

if [ "$OLD_HEAD" = "$NEW_HEAD" ]; then
  log "새 커밋 없음 — 배포할 것이 없습니다."
  exit 0
fi

log "변경 범위: $OLD_HEAD..$NEW_HEAD"
CHANGED="$(git diff --name-only "$OLD_HEAD" "$NEW_HEAD")"
echo "$CHANGED" | sed 's/^/  /'

WEB_PATTERN='^(pages/|components/|utils/|hooks/|lib/|public/|styles/|types/|package\.json$|package-lock\.json$|next\.config\.mjs$|tsconfig\.json$|postcss\.config\.js$|components\.json$|web/Dockerfile$)'
API_PATTERN='^api/'

web_changed=false
echo "$CHANGED" | grep -qE "$WEB_PATTERN" && web_changed=true

api_changed=false
echo "$CHANGED" | grep -qE "$API_PATTERN" && api_changed=true

if [ "$web_changed" = true ]; then
  if echo "$CHANGED" | grep -qE '^web/Dockerfile$'; then
    log "web/Dockerfile 변경 감지 — 이미지 재빌드"
    $COMPOSE build web
  fi

  log "web 빌드 중 (.next 초기화 후 npm ci + next build)"
  rm -rf .next
  $COMPOSE run --rm --no-deps web sh -c "npm ci --include=dev --no-audit --no-fund && npm run build"

  log "web 컨테이너 재기동"
  $COMPOSE stop web
  $COMPOSE rm -f web
  $COMPOSE up -d web
else
  log "web 관련 변경 없음 — web 재배포 스킵"
fi

if [ "$api_changed" = true ]; then
  if echo "$CHANGED" | grep -qE '^api/(Dockerfile|requirements\.txt)$'; then
    log "api/Dockerfile 또는 requirements.txt 변경 감지 — 이미지 재빌드"
    $COMPOSE build api
  fi

  log "api 컨테이너 재기동"
  $COMPOSE stop api
  $COMPOSE rm -f api
  $COMPOSE up -d api
else
  log "api 관련 변경 없음 — api 재배포 스킵"
fi

sleep 3
log "컨테이너 상태:"
docker ps --format '{{.Names}}\t{{.Status}}' | grep gg-bus-history || true

log "헬스체크: $SITE_URL"
code="$(curl -sk -o /dev/null -w '%{http_code}' "$SITE_URL")"
log "응답 코드: $code"
if [ "$code" != "200" ]; then
  log "경고: 헬스체크가 200이 아닙니다 — 로그를 확인하세요 (docker logs gg-bus-history_web_1 / gg-bus-history_api_1)"
  exit 1
fi

log "완료"
