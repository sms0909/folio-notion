# NAS 설치 안내 (Synology Container Manager)

Google 로그인 + OTP가 붙은 앱이 뜹니다. 문서는 아직 각자의 브라우저에 저장됩니다(서버 저장은 다음 단계).

## 1. 파일 복사

NAS의 `/volume2/docker/folio_notion_REA/` 아래에 `app` 폴더를 만들고, 이 저장소의 아래 항목을 복사합니다.

- `dist/`, `server/`, `server.mjs`, `package.json`, `package-lock.json`, `docker-compose.yml`
- `node_modules/`, `.git/`, `tests/`는 복사하지 않습니다.

## 2. .env 만들기

`app` 폴더에 `.env` 파일을 만듭니다(`.env.example` 참고). 개발 PC의 `.env`를 복사한 뒤 DB 주소만 NAS 내부 주소로 바꿉니다.

```
DB_HOST=192.168.0.18
DB_PORT=53306
PUBLIC_URL=https://<도메인>
ADMIN_EMAIL=<처음 로그인해 관리자가 될 Google 계정 이메일>
GOOGLE_CLIENT_ID=<아래 2-1에서 받은 값>
GOOGLE_CLIENT_SECRET=<아래 2-1에서 받은 값>
SESSION_SECRET=<32자 이상 무작위 문자열>
```

`SESSION_SECRET`은 `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` 로 만듭니다. 이 값이 바뀌면 모든 사용자가 OTP를 다시 등록해야 하므로 따로 보관합니다. 값이 하나라도 빠지면 컨테이너가 시작하지 않고 로그에 빠진 항목이 나옵니다.

### 2-1. Google 로그인 설정

1. https://console.cloud.google.com → 프로젝트 생성 → API 및 서비스 → OAuth 동의 화면(외부, 앱 이름 Folio)
2. 사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID → 웹 애플리케이션
3. 승인된 리디렉션 URI: `https://<도메인>/auth/google/callback`
4. 발급된 클라이언트 ID와 보안 비밀을 `.env`에 넣습니다.

동의 화면이 "테스트" 상태이면 테스트 사용자로 등록한 계정만 로그인됩니다. 여러 사람이 쓰려면 "프로덕션으로 게시"합니다(기본 범위만 써서 심사는 필요 없습니다).

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

## 5. 처음 로그인

1. `https://<도메인>` 에서 `ADMIN_EMAIL` 계정으로 로그인하고 OTP를 등록합니다. 복구 코드를 보관합니다.
2. `https://<도메인>/admin` 에서 함께 쓸 사람의 Google 이메일을 초대합니다.
3. 관리자 OTP를 잃어버리면 Container Manager → 컨테이너 `folio-app` → 터미널에서 `node server/cli.mjs reset-otp <이메일>`.

## 업데이트

`app` 폴더의 파일을 새 것으로 덮어쓴 뒤 프로젝트 → 작업 → 빌드(또는 중지 후 시작).

## 데이터 위치

- 첨부 파일·백업: `app/data/` (컨테이너의 `/data`)
- DB: MariaDB 컨테이너의 볼륨 (`/var/lib/mysql`에 연결돼 있어야 함)
