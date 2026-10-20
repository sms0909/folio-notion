import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(async ({ app }) => { await app.open('/'); });

test('duplicate of maximum length title remains readable after reload', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('가'.repeat(500));
  await screen.getByRole('button', '페이지 더보기').tap();
  await screen.getByRole('menuitem', '페이지 복제').tap();
  await browser.reload();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('가'.repeat(494) + ' (복사본)');
});

test('changing block type preserves slash-prefixed document text', async ({ screen }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('블록 1 내용').fill('/api/users documentation');
  await screen.getByRole('button', '블록 1 메뉴').tap();
  await screen.getByRole('option', '제목 2', { exact: true }).tap();
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('/api/users documentation');
});

test('editor constrains text to the supported size without losing the workspace', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('큰 본문 문서');
  await expect(screen.getByLabel('블록 1 내용')).toHaveAttribute('maxlength', '100000');
  await screen.getByLabel('블록 1 내용').fill('가'.repeat(100000));
  await browser.reload();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('큰 본문 문서');
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('가'.repeat(100000));
});

test('backup with HTML in an identifier is rejected before rendering', async ({ screen, browser }) => {
  await screen.getByRole('button', '설정', { exact: true }).tap();
  const file = await browser.waitForDownload(() => screen.getByRole('button', '워크스페이스 내보내기').tap());
  const data = JSON.parse(await readFile(file.absolutePath, 'utf8'));
  data.pages[0].blocks[0].id = '"><img src=x onerror="window.hacked=1">';
  const dir = await mkdtemp(join(tmpdir(), 'folio-unsafe-')); const path = join(dir, 'backup.json');
  await writeFile(path, JSON.stringify(data));
  await screen.getByLabel('백업 파일 선택').setInputFiles(path);
  await expect(browser.locator('#import-feedback')).toContainText('블록 데이터가 올바르지 않습니다.');
  await expect(screen.getByRole('button', '백업으로 교체')).toBeHidden();
});

test('stale tab cannot overwrite a newer workspace', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('현재 탭 문서');
  await browser.evaluate(() => {
    const key = 'folio.workspace.v1';
    const data = JSON.parse(localStorage.getItem(key)!);
    data.settings.name = '다른 탭의 최신 변경';
    const previous = localStorage.getItem(key); const next = JSON.stringify(data);
    localStorage.setItem(key, next);
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue: previous, newValue: next, storageArea: localStorage }));
  });
  await screen.getByRole('button', '페이지 열기: 팀 위키', { exact: true }).tap();
  await browser.reload();
  await expect(screen.getByTestId('workspace-name')).toHaveText('다른 탭의 최신 변경');
});
