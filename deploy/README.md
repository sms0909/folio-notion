# NAS 설치 안내 (Synology Container Manager)

현재 단계에서는 화면만 제공하는 앱이 뜹니다(문서는 각자의 브라우저에 저장). 로그인과 서버 저장은 5단계 이후에 추가되며, 그때도 같은 방법으로 폴더를 덮어쓰고 프로젝트를 다시 빌드합니다.

## 1. 파일 복사

NAS의 `/volume2/docker/folio_notion_REA/` 아래에 `app` 폴더를 만들고, 이 저장소의 아래 항목을 복사합니다.

- `dist/`, `server.mjs`, `package.json`, `package-lock.json`, `docker-compose.yml`
- `node_modules/`, `.git/`, `tests/`는 복사하지 않습니다.

## 2. .env 만들기

`app` 폴더에 `.env` 파일을 만듭니다(`.env.example` 참고). 개발 PC의 `.env`를 복사한 뒤 DB 주소만 NAS 내부 주소로 바꿉니다.

```
DB_HOST=192.168.0.18
DB_PORT=53306
```

## 3. 프로젝트 등록

Container Manager → 프로젝트 → 생성

- 프로젝트 이름: `folio`
- 경로: `/volume2/docker/folio_notion_REA/app`
- 원본: "기존 docker-compose.yml 사용"
- 웹 포털 설정은 건너뛰고 완료

처음 실행은 이미지를 받느라 몇 분 걸립니다. 컨테이너 `folio-app`이 "정상(healthy)"이 되면 내부망에서 `http://192.168.0.18:4317`로 열립니다.

## 4. 외부 접속 (HTTPS)

1. 제어판 → 외부 액세스 → DDNS에서 호스트 이름을 등록합니다(또는 보유 도메인).
2. 제어판 → 보안 → 인증서에서 그 이름으로 Let's Encrypt 인증서를 받습니다.
3. 제어판 → 로그인 포털 → 고급 → 역방향 프록시 → 생성
   - 소스: HTTPS, 호스트 이름 `<도메인>`, 포트 443
   - 대상: HTTP, `localhost`, 포트 4317
   - 사용자 지정 머리글 → 생성 → WebSocket (실시간 편집에 필요)
4. 공유기에서 443 포트를 NAS(192.168.0.18)로 전달합니다. 4317은 외부로 열지 않습니다.

## 업데이트

`app` 폴더의 파일을 새 것으로 덮어쓴 뒤 프로젝트 → 작업 → 빌드(또는 중지 후 시작).

## 데이터 위치

- 첨부 파일·백업: `app/data/` (컨테이너의 `/data`)
- DB: MariaDB 컨테이너의 볼륨 (`/var/lib/mysql`에 연결돼 있어야 함)
