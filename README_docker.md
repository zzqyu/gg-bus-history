# Docker: 빌드 및 실행 안내

이 문서는 이 리포지토리의 도커(또는 Docker Compose) 기반 개발/실행 절차를 간단히 정리합니다.

## 전제
- Docker 및 Docker Compose(또는 Docker Engine에 내장된 `docker compose`)가 설치되어 있어야 합니다.
- Mac/Windows 사용자는 Docker Desktop을 권장합니다.
- 로컬 개발에서는 프로젝트 루트에서 명령을 실행하세요.

## 기본 명령
프로젝트 루트에서 이미지를 빌드하고 모든 서비스를 기동하려면:

```bash
# 빌드 후 포그라운드 실행
docker compose up --build

# 또는 백그라운드로 실행
docker compose up --build -d
```

특정 서비스만 빌드/실행하려면 서비스 이름을 지정합니다. 예: `api`, `web` (리포지토리의 compose 정의에 따라 이름이 다를 수 있음).

```bash
# API(파이썬)만 빌드 후 실행
docker compose up --build api

# 웹(Next.js)만 빌드 후 실행
docker compose up --build web
```

## 로그 확인
실시간 로그 보기:

```bash
# 모든 서비스 로그
docker compose logs -f

# 특정 서비스 로그
docker compose logs -f api
```

## 중지 및 정리

```bash
# 중지
docker compose down

# 컨테이너+네트워크+볼륨(선택) 정리
docker compose down --volumes
```

## 재빌드(캐시 무시)

```bash
docker compose build --no-cache
docker compose up -d
```

## 환경변수
- Compose 파일이나 서비스는 `.env` 또는 환경변수를 통해 설정을 받습니다. 예:
  - `NEXT_PUBLIC_API_BASE` (웹에서 API 베이스 URL을 설정할 때 사용)
  - API 서비스의 DB 파일 경로나 권한 관련 env

예시 `.env` (프로젝트 루트):

```env
# 예시
NEXT_PUBLIC_API_BASE=http://host.docker.internal:8000
```

> 주의: `host.docker.internal`는 호스트를 컨테이너에서 참조할 때 유용합니다 (macOS/Windows). Linux에서 다르게 설정해야 할 수 있습니다.

## DB 및 데이터 파일 처리
- 이 프로젝트는 로컬 `basedata` 같은 디렉토리에 TXT 파일/SQLite DB를 보관합니다. Compose에서 볼륨으로 마운트하여 컨테이너와 파일을 공유하는 구성이 일반적입니다.
- `import_to_sqlite.py` 스크립트를 사용해 기반 데이터 파일을 다운로드(`--fetch-baseinfo`)하고 `--dir`에 저장한 뒤 DB로 임포트할 수 있습니다.

로컬에서 직접 실행 예:

```bash
# 기반데이터를 다운로드해 basedata에 저장하고 DB로 임포트
python import_to_sqlite.py --dir basedata --db basedata.db --fetch-baseinfo --clean-downloads
```

컨테이너 내부에서 임포트 스크립트를 실행하려면 (compose 서비스 이름이 `api`인 경우):

```bash
# 컨테이너의 쉘로 들어가서 실행
docker compose exec api /bin/sh
# 또는 한줄 명령으로 실행
docker compose exec api python import_to_sqlite.py --dir /app/basedata --db /app/basedata.db --fetch-baseinfo
```

(Compose에서 컨테이너의 작업 디렉토리나 마운트 경로를 확인하세요.)

## 포트 및 접근
- 웹(Next.js) 기본 포트: `3000` (로컬에서 `http://localhost:3000` 접속)
- API 기본 포트: Compose 파일에 정의된 포트(예: `8000`)를 확인하세요.

## 문제 해결
- 빌드/실행 실패 시:
  - `docker compose logs <service>`로 로그 확인
  - 권한 문제: 마운트된 볼륨의 파일 권한을 확인
  - 포트 충돌: 이미 사용 중인 포트가 있는지 확인

## 빠른 체크리스트
- Docker Desktop 또는 docker+compose 설치
- 프로젝트 루트에서 `docker compose up --build` 실행
- 브라우저에서 `http://localhost:3000`(웹) 접속
- API가 필요하면 `http://localhost:<api-port>` 확인

---

문서에 추가할 내용을 알려주세요:
- Compose 파일의 구체적 서비스 이름/포트/볼륨 매핑을 반영
- 컨테이너 내에서 데이터 초기화 스크립트를 자동으로 실행하도록 설정하는 방법
- CI/CD용 빌드/배포 지침

원하시면 이 README에 프로젝트의 실제 `docker-compose.yml` 예시(또는 현재 compose 파일을 기반으로 한 더 구체적 가이드)를 추가해드리겠습니다.