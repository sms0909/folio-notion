# Folio

Notion의 페이지·블록·검색·데이터베이스 흐름을 참고한 한국어 개인 워크스페이스입니다.

## 실행

Node.js 22.22.3 이상이 필요합니다.

```powershell
npm install
npm start
```

http://127.0.0.1:4317 에서 엽니다.

## 기능

- 페이지 생성·제목 수정·중첩·이동·복제·즐겨찾기·휴지통 복원
- 텍스트, 제목, 할 일, 목록, 인용, 콜아웃, 구분선 블록
- 슬래시 블록 메뉴, Enter로 새 블록, Shift+Enter 줄바꿈, 블록 순서 이동
- 작업 표·보드 보기, 상세 편집, 필터·검색·마감일 정렬
- 템플릿, 전체 검색(Ctrl/Cmd+K), 라이트·다크 테마
- 브라우저 자동 저장, JSON 백업·검증된 가져오기, Markdown 내보내기

개인용 브라우저 앱입니다. 서버 동기화·실시간 협업·Notion 계정 연동·AI 기능은 없습니다. 브라우저 데이터를 지우기 전에 설정에서 백업을 내보내세요. 다른 기기나 다른 사이트 주소에서는 별도의 저장 공간을 사용합니다.

## 검증

```powershell
npm run check
$env:E2E_TELEMETRY_DISABLED='1'
npm run test:e2e
npm run test:research
```

필요한 브라우저: `npx e2e-web install chromium`

로컬 서버가 없으면 E2E 설정이 서버를 시작하고 실행 후 정리합니다. 자연어 모델 API 없이 실제 브라우저 상호작용을 검증합니다. .e2e/report.json에 결과, .e2e/results에 단계별 트레이스와 캡처가 저장됩니다.

분석: [docs/analysis.md](docs/analysis.md). 설계와 계획: docs/superpowers.
