import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';

beforeEach(async ({ app }) => { await app.open('/'); });

for (const position of ['first', 'last']) {
  test(`Backspace beside a divider keeps focus on its menu (${position})`, async ({ screen }) => {
    await screen.getByRole('button', '새 페이지', { exact: true }).tap();
    await screen.getByLabel('블록 1 내용').press('Enter');
    await screen.getByLabel('블록 2 내용').press('Enter');
    await screen.getByRole('button', '블록 2 메뉴').tap();
    await screen.getByRole('option', '구분선', { exact: true }).tap();
    await screen.getByLabel(`블록 ${position === 'first' ? 1 : 3} 내용`).press('Backspace');
    await expect(screen.getByRole('button', `블록 ${position === 'first' ? 1 : 2} 메뉴`)).toBeFocused();
  });
}

test('keyboard change in a table cell keeps focus on that cell', async ({ screen }) => {
  const status = screen.getByLabel('브랜드 가이드 정리 상태');
  await status.press('ArrowDown');
  await expect(status).toHaveValue('완료');
  await expect(status).toBeFocused();
});

test('Escape without an open dialog leaves focus in the editor', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').press('Control+k');
  await screen.getByLabel('워크스페이스 검색').press('Escape');
  const title = screen.getByLabel('페이지 제목');
  await title.press('End');
  await title.press('Escape');
  await expect(title).toBeFocused();
});

test('Backspace in an empty first block moves focus to the next block', async ({ screen }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('블록 1 내용').press('Enter');
  await screen.getByLabel('블록 2 내용').fill('남는 블록');
  await screen.getByLabel('블록 1 내용').press('Backspace');
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('남는 블록');
  await expect(screen.getByLabel('블록 1 내용')).toBeFocused();
});

test('importing a backup applies its saved database view', async ({ screen, browser }) => {
  await screen.getByRole('tab', '보드', { exact: true }).tap();
  await screen.getByRole('button', '설정', { exact: true }).tap();
  const file = await browser.waitForDownload(() => screen.getByRole('button', '워크스페이스 내보내기').tap());
  await screen.getByRole('button', '닫기', { exact: true }).tap();
  await screen.getByRole('tab', '표', { exact: true }).tap();
  await screen.getByRole('button', '설정', { exact: true }).tap();
  await screen.getByLabel('백업 파일 선택').setInputFiles(file.absolutePath);
  await screen.getByRole('button', '백업으로 교체').tap();
  await expect(screen.getByRole('tab', '보드', { exact: true })).toHaveAttribute('aria-selected', 'true');
});
