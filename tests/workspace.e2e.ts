import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readFile } from 'node:fs/promises';

beforeEach(async ({ app }) => { await app.open('/'); });

test('welcome workspace has navigation and useful starter content', async ({ screen, app }) => {
  await expect(screen.getByRole('navigation', '워크스페이스')).toBeVisible();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('나의 워크스페이스');
  await expect(screen.getByRole('table', '프로젝트 데이터베이스')).toBeVisible();
  await app.screenshot('desktop-workspace');
});

test('create and rename a page, edit a block, persist after reload', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('E2E 프로젝트 노트');
  await screen.getByLabel('블록 1 내용').fill('다음 주 출시를 준비합니다.');
  await browser.reload();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('E2E 프로젝트 노트');
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('다음 주 출시를 준비합니다.');
});

test('slash menu creates a checkbox block and retains checked state', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('블록 1 내용').fill('/');
  await screen.getByRole('option', '할 일 목록', { exact: true }).tap();
  await screen.getByLabel('블록 1 내용').fill('배포 전 테스트');
  await screen.getByRole('checkbox', '할 일 1 완료').check();
  await browser.reload();
  await expect(screen.getByRole('checkbox', '할 일 1 완료')).toBeChecked();
});

test('Enter adds a block, and block types can change', async ({ screen }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('블록 1 내용').fill('첫 번째 문단');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await screen.getByLabel('블록 2 내용').fill('두 번째 문단');
  await screen.getByRole('button', '블록 2 메뉴').tap();
  await screen.getByRole('option', '제목 2', { exact: true }).tap();
  await expect(screen.getByLabel('블록 2 내용')).toHaveValue('두 번째 문단');
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-type', 'h2');
});

test('workspace search finds content and opens the matching page', async ({ screen }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('고객 인터뷰');
  await screen.getByLabel('블록 1 내용').fill('유일한검색어7391');
  await screen.getByRole('button', '검색', { exact: true }).tap();
  await screen.getByRole('searchbox', '워크스페이스 검색').fill('유일한검색어7391');
  await screen.getByRole('button', '검색 결과: 고객 인터뷰').tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('고객 인터뷰');
});

test('favorite and duplicate a page', async ({ screen }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('즐겨찾기 문서');
  await screen.getByRole('button', '즐겨찾기 추가', { exact: true }).tap();
  await expect(screen.getByRole('button', '즐겨찾기 해제', { exact: true })).toBeVisible();
  await screen.getByRole('button', '페이지 더보기').tap();
  await screen.getByRole('menuitem', '페이지 복제').tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('즐겨찾기 문서 (복사본)');
});

test('trash and restore a page with its content', async ({ screen }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('복원할 문서');
  await screen.getByLabel('블록 1 내용').fill('삭제되어도 보존될 내용');
  await screen.getByRole('button', '페이지 더보기').tap();
  await screen.getByRole('menuitem', '휴지통으로 이동').tap();
  await screen.getByRole('button', '휴지통', { exact: true }).tap();
  await screen.getByRole('button', '복원: 복원할 문서').tap();
  await screen.getByRole('button', '닫기', { exact: true }).tap();
  await screen.getByRole('button', '페이지 열기: 복원할 문서', { exact: true }).tap();
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('삭제되어도 보존될 내용');
});

test('create database task, filter and inspect it in board view', async ({ screen }) => {
  await screen.getByRole('button', '새 작업', { exact: true }).tap();
  await screen.getByLabel('작업 이름').fill('E2E 품질 점검');
  await screen.getByLabel('작업 상태').selectOption('진행 중');
  await screen.getByLabel('작업 우선순위').selectOption('높음');
  await screen.getByRole('button', '작업 저장', { exact: true }).tap();
  await screen.getByRole('searchbox', '데이터베이스 검색').fill('E2E 품질 점검');
  await expect(screen.getByRole('button', '작업 열기: E2E 품질 점검')).toBeVisible();
  await screen.getByRole('tab', '보드', { exact: true }).tap();
  await expect(screen.getByRole('region', '진행 중')).toContainText('E2E 품질 점검');
});

test('edit task status and confirm it persists', async ({ screen, browser }) => {
  await screen.getByRole('button', '작업 열기: 브랜드 가이드 정리').tap();
  await screen.getByLabel('작업 상태').selectOption('완료');
  await screen.getByRole('button', '작업 저장', { exact: true }).tap();
  await browser.reload();
  await screen.getByRole('button', '작업 열기: 브랜드 가이드 정리').tap();
  await expect(screen.getByLabel('작업 상태')).toHaveValue('완료');
});

test('templates create editable pages', async ({ screen }) => {
  await screen.getByRole('button', '템플릿', { exact: true }).tap();
  await screen.getByRole('button', '회의록 템플릿 사용').tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('팀 회의록');
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('회의 안건');
});

test('settings update workspace name and persist dark theme', async ({ screen, browser }) => {
  await screen.getByRole('button', '설정', { exact: true }).tap();
  await screen.getByLabel('워크스페이스 이름').fill('나의 연구실');
  await screen.getByLabel('화면 테마').selectOption({ value: 'dark' });
  await screen.getByRole('button', '설정 저장').tap();
  await browser.reload();
  await expect(screen.getByTestId('workspace-name')).toHaveText('나의 연구실');
  await expect(browser.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('export produces a real workspace backup', async ({ screen, browser }) => {
  await screen.getByRole('button', '설정', { exact: true }).tap();
  const file = await browser.waitForDownload(() => screen.getByRole('button', '워크스페이스 내보내기').tap());
  const data = JSON.parse(await readFile(file.absolutePath, 'utf8'));
  expect(data.version).toBe(1);
  expect(data.pages.length).toBeGreaterThan(1);
});

test('mobile menu works without horizontal overflow', async ({ screen, browser, app }) => {
  await browser.setViewport({ width: 390, height: 844 });
  await screen.getByRole('button', '사이드바 열기').tap();
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toBeVisible();
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await app.screenshot('mobile-page');
});

test('user HTML is displayed as text, never executed', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('<img src=x onerror=window.hacked=1>');
  await screen.getByLabel('블록 1 내용').fill('<script>window.hacked=1</script>');
  await browser.reload();
  expect(await browser.evaluate(() => (window as any).hacked)).toBe(undefined);
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('<img src=x onerror=window.hacked=1>');
});
