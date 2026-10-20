import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(async ({ app }) => { await app.open('/'); });
async function backup(screen: any, browser: any) {
  await screen.getByRole('button', '설정', { exact: true }).tap();
  const file = await browser.waitForDownload(() => screen.getByRole('button', '워크스페이스 내보내기').tap());
  return JSON.parse(await readFile(file.absolutePath, 'utf8'));
}
async function fixture(data: any) {
  const dir = await mkdtemp(join(tmpdir(), 'folio-e2e-'));
  const path = join(dir, 'backup.json'); await writeFile(path, JSON.stringify(data)); return path;
}

test('duplicate content has independent blocks and editing does not affect original', async ({ screen }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('원본 문서');
  await screen.getByLabel('블록 1 내용').fill('원본 내용');
  await screen.getByRole('button', '페이지 더보기').tap();
  await screen.getByRole('menuitem', '페이지 복제').tap();
  await screen.getByLabel('블록 1 내용').fill('수정된 복사본');
  await screen.getByRole('button', '페이지 열기: 원본 문서', { exact: true }).tap();
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('원본 내용');
});

test('restoring a parent does not restore an independently trashed child', async ({ screen }) => {
  await screen.getByRole('button', '페이지 열기: 주간 회의', { exact: true }).tap();
  await screen.getByRole('button', '페이지 더보기').tap();
  await screen.getByRole('menuitem', '휴지통으로 이동').tap();
  await screen.getByRole('button', '페이지 열기: 팀 위키', { exact: true }).tap();
  await screen.getByRole('button', '페이지 더보기').tap();
  await screen.getByRole('menuitem', '휴지통으로 이동').tap();
  await screen.getByRole('button', '휴지통', { exact: true }).tap();
  await screen.getByRole('button', '복원: 팀 위키').tap();
  await expect(screen.getByRole('button', '복원: 주간 회의')).toBeVisible();
  await screen.getByRole('button', '닫기', { exact: true }).tap();
  await expect(screen.getByRole('button', '페이지 열기: 팀 위키', { exact: true })).toBeVisible();
  await expect(screen.getByRole('button', '페이지 열기: 주간 회의', { exact: true })).toBeHidden();
});

test('parent trash and restore restores its active descendants', async ({ screen }) => {
  await screen.getByRole('button', '페이지 열기: 팀 위키', { exact: true }).tap();
  await screen.getByRole('button', '페이지 더보기').tap();
  await screen.getByRole('menuitem', '휴지통으로 이동').tap();
  await expect(screen.getByRole('button', '페이지 열기: 주간 회의', { exact: true })).toBeHidden();
  await screen.getByRole('button', '휴지통', { exact: true }).tap();
  await screen.getByRole('button', '복원: 팀 위키').tap();
  await screen.getByRole('button', '닫기', { exact: true }).tap();
  await expect(screen.getByRole('button', '페이지 열기: 주간 회의', { exact: true })).toBeVisible();
});

test('move menu excludes self and descendants and moves pages safely', async ({ screen, browser }) => {
  await screen.getByRole('button', '페이지 열기: 팀 위키', { exact: true }).tap();
  await screen.getByRole('button', '페이지 더보기').tap();
  await screen.getByRole('menuitem', '페이지 이동').tap();
  expect(await browser.evaluate(() => [...document.querySelector('[aria-label="이동할 상위 페이지"]').querySelectorAll('option')].map(o => (o as HTMLOptionElement).value).includes('wiki'))).toBe(false);
  expect(await browser.evaluate(() => [...document.querySelector('[aria-label="이동할 상위 페이지"]').querySelectorAll('option')].map(o => (o as HTMLOptionElement).value).includes('meeting'))).toBe(false);
  await screen.getByLabel('이동할 상위 페이지').selectOption('아이디어 노트');
  await screen.getByRole('button', '이동', { exact: true }).tap();
  await browser.reload();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('팀 위키');
});

test('status filter affects table and board consistently', async ({ screen }) => {
  await screen.getByLabel('상태 필터').selectOption('완료');
  await expect(screen.getByRole('button', '작업 열기: 워크스페이스 구조 잡기')).toBeVisible();
  await expect(screen.getByRole('button', '작업 열기: 브랜드 가이드 정리')).toBeHidden();
  await screen.getByRole('tab', '보드', { exact: true }).tap();
  await expect(screen.getByRole('region', '완료')).toContainText('워크스페이스 구조 잡기');
  await expect(screen.getByRole('button', '작업 열기: 브랜드 가이드 정리')).toBeHidden();
});

test('task deletion persists and removes it from both views', async ({ screen, browser }) => {
  await screen.getByRole('button', '작업 열기: 브랜드 가이드 정리').tap();
  await screen.getByRole('button', '작업 삭제', { exact: true }).tap();
  await expect(screen.getByRole('button', '작업 열기: 브랜드 가이드 정리')).toBeHidden();
  await browser.reload();
  await screen.getByRole('tab', '보드', { exact: true }).tap();
  await expect(screen.getByRole('button', '작업 열기: 브랜드 가이드 정리')).toBeHidden();
});

test('Ctrl K opens search and Escape closes it', async ({ screen, browser }) => {
  await browser.keyboard.press('Control+k');
  await expect(screen.getByRole('searchbox', '워크스페이스 검색')).toBeVisible();
  await browser.keyboard.press('Escape');
  await expect(screen.getByRole('dialog')).toBeHidden();
});

test('Markdown export includes checked todo content', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('내보내기 문서');
  await screen.getByLabel('블록 1 내용').fill('/');
  await screen.getByRole('option', '할 일 목록', { exact: true }).tap();
  await screen.getByLabel('블록 1 내용').fill('완료한 작업');
  await screen.getByRole('checkbox', '할 일 1 완료').check();
  const file = await browser.waitForDownload(() => screen.getByRole('button', '내보내기', { exact: true }).tap());
  const text = await readFile(file.absolutePath, 'utf8');
  expect(text).toContain('# 내보내기 문서'); expect(text).toContain('- [x] 완료한 작업');
});

test('backup import requires confirmation and cancellation preserves current data', async ({ screen, browser }) => {
  const data = await backup(screen, browser); const oldName = data.settings.name;
  data.settings.name = '가져온 워크스페이스'; const path = await fixture(data);
  await screen.getByLabel('백업 파일 선택').setInputFiles(path);
  await expect(screen.getByRole('button', '백업으로 교체')).toBeVisible();
  await screen.getByRole('button', '가져오기 취소').tap();
  await screen.getByRole('button', '닫기', { exact: true }).tap();
  await expect(screen.getByTestId('workspace-name')).toHaveText(oldName);
  await screen.getByRole('button', '설정', { exact: true }).tap();
  await screen.getByLabel('백업 파일 선택').setInputFiles(path);
  await screen.getByRole('button', '백업으로 교체').tap();
  await browser.reload();
  await expect(screen.getByTestId('workspace-name')).toHaveText('가져온 워크스페이스');
});

test('cyclic backup is rejected without replacing current data', async ({ screen, browser }) => {
  const data = await backup(screen, browser);
  data.pages[0].parentId = data.pages[0].id;
  await screen.getByLabel('백업 파일 선택').setInputFiles(await fixture(data));
  await expect(browser.locator('#import-feedback')).toContainText('페이지 계층 구조가 올바르지 않습니다.');
  await expect(screen.getByRole('button', '백업으로 교체')).toBeHidden();
  await screen.getByRole('button', '닫기', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('나의 워크스페이스');
});

test('new templates do not share mutable block content', async ({ screen }) => {
  await screen.getByRole('button', '템플릿', { exact: true }).tap();
  await screen.getByRole('button', '회의록 템플릿 사용').tap();
  await screen.getByLabel('블록 1 내용').fill('바뀐 회의 안건');
  await screen.getByRole('button', '템플릿', { exact: true }).tap();
  await screen.getByRole('button', '회의록 템플릿 사용').tap();
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('회의 안건');
});

test('local storage failure retains edits and allows a backup', async ({ app, browser, screen }) => {
  await browser.addInitScript(() => { Storage.prototype.setItem = function() { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await browser.reload();
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('저장 실패에도 보존할 문서');
  await expect(browser.locator('#save-state')).toContainText('저장 안 됨');
  const data = await backup(screen, browser);
  expect(data.pages.some((p: any) => p.title === '저장 실패에도 보존할 문서')).toBe(true);
});

test('mobile home remains within viewport and database search is usable', async ({ browser, screen, app }) => {
  await browser.setViewport({ width: 390, height: 844 });
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await screen.getByRole('searchbox', '데이터베이스 검색').fill('브랜드');
  await expect(screen.getByRole('button', '작업 열기: 브랜드 가이드 정리')).toBeVisible();
  await app.screenshot('mobile-home-database');
});
