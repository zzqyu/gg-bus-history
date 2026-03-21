# Docker 운영 정리 (로컬 + VPS)

이 문서는 현재 프로젝트 구조(`api`, `web`, `basedata.db`) 기준으로 실제 동작하는 실행/배포 절차를 정리합니다.

## 1) 권장 실행 방식
- 로컬/신규 서버: `docker compose` (Compose v2) 사용 권장
- 구형 서버(Compose v1.29.2): `ContainerConfig` 재생성 버그가 있어, 필요 시 API만 `docker run`으로 수동 기동

## 2) 로컬 실행 (Compose v2)
프로젝트 루트에서:

```bash
docker compose up -d --build
docker compose ps
```

로그 확인:

```bash
docker compose logs -f api
docker compose logs -f web
```

중지:

```bash
docker compose down
```

## 3) 성능/정상 동작 검증 명령
`findRoutes` 응답시간:

```bash
curl 'http://localhost:8000/findRoutes?ax=127.068111&ay=37.209902&bx=127.024511&by=37.504501&aradius=500&bradius=500&sday=2026-03-20' -s -o /dev/null -w '%{time_total}s\n'
```

`find_routes` SQL 계측 로그 확인:

```bash
docker compose logs --tail 100 api | grep 'find_routes: pair_sql executed'
```

정상 기대치(현재 코드):
- `pair_sql executed 1 times ...` 형태로 출력

## 4) VPS에서 `docker-compose` v1 버그 회피
증상:
- `docker-compose up -d --build api` 시 `KeyError: 'ContainerConfig'`

자동 배포 스크립트(권장):

```bash
# app.py만 반영
tools/deploy_api_vps.sh

# app.py + basedata.db 함께 반영
tools/deploy_api_vps.sh --with-db
```

회피 절차(API만 수동 실행):

```bash
# 1) 최신 코드 반영
scp api/app.py root@<SERVER_IP>:~/gg-bus-history/api/app.py

# 2) 서버에서 API 이미지 빌드
ssh root@<SERVER_IP> "cd ~/gg-bus-history/api && docker build -t gg-bus-history_api:manual ."

# 3) 기존 API 컨테이너 제거 후 수동 실행
ssh root@<SERVER_IP> "docker ps -aq --filter name=gg-bus-history_api | xargs -r docker rm -f"
ssh root@<SERVER_IP> "docker run -d --name gg-bus-history_api_1 -p 8000:8000 -v ~/gg-bus-history/basedata:/data:ro -v ~/gg-bus-history/basedata.db:/app/basedata.db:ro -e PYTHONUNBUFFERED=1 gg-bus-history_api:manual"

# 4) 서버에서 응답시간 + 로그 확인
ssh root@<SERVER_IP> "curl 'http://localhost:8000/findRoutes?ax=127.068111&ay=37.209902&bx=127.024511&by=37.504501&aradius=500&bradius=500&sday=2026-03-20' -s -o /dev/null -w '%{time_total}s\\n'"
ssh root@<SERVER_IP> "docker logs --tail 100 gg-bus-history_api_1 | grep 'find_routes: pair_sql executed'"
```

## 5) 운영 팁
- `api/app.py`의 `get_db_connection()`에서 SQLite PRAGMA를 적용하므로, API는 해당 코드 버전으로 기동되어야 성능 이점이 유지됩니다.
- API가 안 뜨고 `curl` 종료코드가 `7`이면 먼저 컨테이너 상태를 확인하세요.

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

## 6) 향후 권장
- VPS는 가능하면 `docker compose` v2로 전환하는 것을 권장합니다. (v1 `ContainerConfig` 버그 회피)