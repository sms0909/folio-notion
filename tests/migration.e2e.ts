import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
const stored = (browser: any) => browser.evaluate(() => JSON.parse(localStorage.getItem('folio.workspace.v1')!));

test('version 1 data is upgraded on load and the original is kept', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('옛 버전 페이지');
  await screen.getByLabel('블록 1 내용').pressSequentially('옛 내용');
  const old = await browser.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('folio.workspace.v1')!); data.version = 1; data.tasks = []; delete data.databases;
    const raw = JSON.stringify(data); localStorage.setItem('folio.workspace.v1', raw); return raw;
  });
  await browser.reload();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('옛 버전 페이지');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('옛 내용');
  expect(await browser.evaluate(() => localStorage.getItem('folio.workspace.v1.backup'))).toBe(old);
  await screen.getByLabel('블록 1 내용').pressSequentially(' 추가');
  const data = await stored(browser);
  expect(data.version).toBe(3);
  expect(data.pages.find((p: any) => p.id === data.activeId).blocks[0].text).toContain('추가');
  expect(await browser.evaluate(() => localStorage.getItem('folio.workspace.v1.backup'))).toBe(old);
});

test('exports use version 3 and include marks', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('블록 1 내용').pressSequentially('**굵은** 글');
  const data = await backup(screen, browser);
  expect(data.version).toBe(3);
  const page = data.pages.find((p: any) => p.id === data.activeId);
  expect(page.blocks[0].text).toBe('굵은 글');
  expect(page.blocks[0].marks).toEqual([{ start: 0, end: 2, type: 'bold' }]);
});

test('a version 1 backup can still be imported', async ({ screen, browser }) => {
  const data = await backup(screen, browser);
  data.version = 1; data.tasks = []; delete data.databases; data.settings.name = '옛 백업';
  for (const page of data.pages) for (const b of page.blocks) delete b.marks;
  await screen.getByLabel('백업 파일 선택').setInputFiles(await fixture(data));
  await screen.getByRole('button', '백업으로 교체').tap();
  await expect(screen.getByTestId('workspace-name')).toHaveText('옛 백업');
  expect((await stored(browser)).version).toBe(3);
});

test('backups from a newer version are refused', async ({ screen, browser }) => {
  const data = await backup(screen, browser);
  data.version = 4;
  await screen.getByLabel('백업 파일 선택').setInputFiles(await fixture(data));
  await expect(browser.locator('#import-feedback')).toContainText('올바른 Folio 백업 파일이 아닙니다.');
  await expect(screen.getByRole('button', '백업으로 교체')).toBeHidden();
});

for (const [label, mark] of [['a range past the text', { start: 0, end: 9999, type: 'bold' }], ['an unknown type', { start: 0, end: 1, type: 'blink' }], ['a script link', { start: 0, end: 1, type: 'link', value: 'javascript:alert(1)' }], ['an unknown colour', { start: 0, end: 1, type: 'color', value: 'url(x)' }]] as const) {
  test(`a backup whose mark has ${label} is refused`, async ({ screen, browser }) => {
    const data = await backup(screen, browser);
    const target = data.pages.flatMap((p: any) => p.blocks).find((b: any) => b.text.length > 0);
    target.marks = [mark];
    await screen.getByLabel('백업 파일 선택').setInputFiles(await fixture(data));
    await expect(browser.locator('#import-feedback')).toContainText('블록 데이터가 올바르지 않습니다');
    await expect(screen.getByRole('button', '백업으로 교체')).toBeHidden();
  });
}
