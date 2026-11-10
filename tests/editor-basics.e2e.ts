import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readFile } from 'node:fs/promises';

beforeEach(async ({ app, screen }) => {
  await app.open('/');
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
});

const savedBlocks = (browser: any) => browser.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('folio.workspace.v1')!);
  return data.pages.find((p: any) => p.id === data.activeId).blocks.map((b: any) => ({ type: b.type, text: b.text, indent: b.indent ?? 0 }));
});

for (const [typed, type, label] of [['# ', 'h1', '제목 1'], ['## ', 'h2', '제목 2'], ['### ', 'h3', '제목 3'], ['- ', 'bullet', '글머리'], ['* ', 'bullet', '별표 글머리'], ['[] ', 'todo', '할 일'], ['> ', 'quote', '인용'], ['1. ', 'numbered', '번호']]) {
  test(`Markdown shortcut "${typed.trim()}" turns the block into ${label}`, async ({ screen }) => {
    const first = screen.getByLabel('블록 1 내용');
    await first.pressSequentially(`${typed}바로 변환`);
    await expect(screen.getByTestId('block-1')).toHaveAttribute('data-type', type);
    await expect(first).toHaveText('바로 변환');
    await expect(first).toBeFocused();
  });
}

test('pasted Markdown-looking text stays literal', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').fill('# 그대로 남는 글');
  await expect(screen.getByTestId('block-1')).toHaveAttribute('data-type', 'text');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('# 그대로 남는 글');
});

test('three hyphens make a divider and continue in a new block', async ({ screen, browser }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('---');
  await expect(screen.getByTestId('block-1')).toHaveAttribute('data-type', 'divider');
  await expect(screen.getByLabel('블록 2 내용')).toBeFocused();
  expect(await savedBlocks(browser)).toEqual([{ type: 'divider', text: '', indent: 0 }, { type: 'text', text: '', indent: 0 }]);
});

test('three backticks open a code block where Enter and Tab stay inside', async ({ screen, browser }) => {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('```');
  await expect(screen.getByTestId('block-1')).toHaveAttribute('data-type', 'code');
  await first.pressSequentially('if (ok) {');
  await first.press('Enter');
  await first.press('Tab');
  await first.pressSequentially('run();');
  expect(await savedBlocks(browser)).toEqual([{ type: 'code', text: 'if (ok) {\n  run();', indent: 0 }]);
  await first.press('Control+Enter');
  await expect(screen.getByLabel('블록 2 내용')).toBeFocused();
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-type', 'text');
});

test('Shift+Enter adds a line break inside the same block', async ({ screen, browser }) => {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('첫 줄');
  await first.press('Shift+Enter');
  await first.pressSequentially('둘째 줄');
  expect(await savedBlocks(browser)).toEqual([{ type: 'text', text: '첫 줄\n둘째 줄', indent: 0 }]);
  await browser.reload();
  expect(await savedBlocks(browser)).toEqual([{ type: 'text', text: '첫 줄\n둘째 줄', indent: 0 }]);
});

test('numbered lists count automatically and restart after a break', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('1. 하나');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await screen.getByLabel('블록 2 내용').pressSequentially('둘');
  await screen.getByLabel('블록 2 내용').press('Enter');
  await screen.getByLabel('블록 3 내용').pressSequentially('셋');
  await expect(screen.getByTestId('block-1-number')).toHaveText('1.');
  await expect(screen.getByTestId('block-2-number')).toHaveText('2.');
  await expect(screen.getByTestId('block-3-number')).toHaveText('3.');
  await screen.getByRole('button', '블록 2 메뉴').tap();
  await screen.getByRole('option', '텍스트', { exact: true }).tap();
  await expect(screen.getByTestId('block-3-number')).toHaveText('1.');
});

test('Enter on an empty list item leaves the list', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('- 항목');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-type', 'bullet');
  await screen.getByLabel('블록 2 내용').press('Enter');
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-type', 'text');
  await expect(screen.getByTestId('block-3')).toBeHidden();
  await expect(screen.getByLabel('블록 2 내용')).toBeFocused();
});

test('Tab and Shift+Tab indent blocks and the depth survives a reload', async ({ screen, browser }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('- 부모');
  await screen.getByLabel('블록 1 내용').press('Tab');
  await expect(screen.getByTestId('block-1')).toHaveAttribute('data-indent', '0');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await screen.getByLabel('블록 2 내용').pressSequentially('자식');
  await screen.getByLabel('블록 2 내용').press('Tab');
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-indent', '1');
  await expect(screen.getByLabel('블록 2 내용')).toBeFocused();
  await screen.getByLabel('블록 2 내용').press('Tab');
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-indent', '1');
  await browser.reload();
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-indent', '1');
  await screen.getByLabel('블록 2 내용').press('Shift+Tab');
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-indent', '0');
});

test('nested numbered items count separately from their parents', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('1. 상위 하나');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await screen.getByLabel('블록 2 내용').pressSequentially('하위 하나');
  await screen.getByLabel('블록 2 내용').press('Tab');
  await screen.getByLabel('블록 2 내용').press('Enter');
  await screen.getByLabel('블록 3 내용').pressSequentially('상위 둘');
  await screen.getByLabel('블록 3 내용').press('Shift+Tab');
  await expect(screen.getByTestId('block-2-number')).toHaveText('1.');
  await expect(screen.getByTestId('block-3-number')).toHaveText('2.');
});

test('a toggle hides and shows its indented children and remembers the state', async ({ screen, browser }) => {
  await screen.getByLabel('블록 1 내용').fill('/');
  await screen.getByRole('option', '토글 목록', { exact: true }).tap();
  await screen.getByLabel('블록 1 내용').pressSequentially('자세히 보기');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-indent', '1');
  await screen.getByLabel('블록 2 내용').pressSequentially('숨겨질 내용');
  await screen.getByRole('button', '토글 1 접기').tap();
  await expect(screen.getByLabel('블록 2 내용')).toBeHidden();
  await browser.reload();
  await expect(screen.getByLabel('블록 2 내용')).toBeHidden();
  await screen.getByRole('button', '토글 1 펼치기').tap();
  await expect(screen.getByLabel('블록 2 내용')).toHaveText('숨겨질 내용');
});

test('slash menu filters while typing and picks with the keyboard', async ({ screen }) => {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('/제목');
  await expect(screen.getByRole('option', '제목 1', { exact: true })).toBeVisible();
  await expect(screen.getByRole('option', '제목 3', { exact: true })).toBeVisible();
  await expect(screen.getByRole('option', '인용', { exact: true })).toBeHidden();
  await expect(screen.getByRole('option', '제목 1', { exact: true })).toHaveAttribute('aria-selected', 'true');
  await first.press('ArrowDown');
  await expect(screen.getByRole('option', '제목 2', { exact: true })).toHaveAttribute('aria-selected', 'true');
  await first.press('Enter');
  await expect(screen.getByTestId('block-1')).toHaveAttribute('data-type', 'h2');
  await expect(first).toHaveText('');
  await expect(first).toBeFocused();
  await expect(screen.getByTestId('block-2')).toBeHidden();
});

test('slash menu closes when nothing matches and keeps the typed text', async ({ screen }) => {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('/없는블록');
  await expect(screen.getByRole('listbox', '블록 유형')).toBeHidden();
  await expect(first).toHaveText('/없는블록');
});

test('slash menu offers the new block types', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').fill('/');
  for (const name of ['제목 3', '번호 매기기 목록', '토글 목록', '코드']) await expect(screen.getByRole('option', name, { exact: true })).toBeVisible();
  await screen.getByRole('option', '코드', { exact: true }).tap();
  await expect(screen.getByTestId('block-1')).toHaveAttribute('data-type', 'code');
});

test('Backspace at the start of a block merges it into the previous one', async ({ screen, browser }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('앞부분');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await screen.getByLabel('블록 2 내용').pressSequentially('뒷부분');
  await screen.getByLabel('블록 2 내용').press('Home');
  await screen.getByLabel('블록 2 내용').press('Backspace');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('앞부분뒷부분');
  await expect(screen.getByLabel('블록 1 내용')).toBeFocused();
  await browser.keyboard.type('+');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('앞부분+뒷부분');
  await expect(screen.getByTestId('block-2')).toBeHidden();
});

test('Backspace at the start of a heading turns it back into text first', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('# 제목');
  await screen.getByLabel('블록 1 내용').press('Home');
  await screen.getByLabel('블록 1 내용').press('Backspace');
  await expect(screen.getByTestId('block-1')).toHaveAttribute('data-type', 'text');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('제목');
});

test('arrow keys move the caret between blocks', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('위');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await screen.getByLabel('블록 2 내용').pressSequentially('아래');
  await screen.getByLabel('블록 2 내용').press('ArrowUp');
  await expect(screen.getByLabel('블록 1 내용')).toBeFocused();
  await screen.getByLabel('블록 1 내용').press('ArrowDown');
  await expect(screen.getByLabel('블록 2 내용')).toBeFocused();
});

test('a block can be duplicated from its menu and with Ctrl+D', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('[] 복제할 일');
  await screen.getByRole('button', '블록 1 메뉴').tap();
  await screen.getByRole('button', '블록 복제').tap();
  await expect(screen.getByLabel('블록 2 내용')).toHaveText('복제할 일');
  await expect(screen.getByTestId('block-2')).toHaveAttribute('data-type', 'todo');
  await screen.getByLabel('블록 2 내용').press('Control+d');
  await expect(screen.getByLabel('블록 3 내용')).toHaveText('복제할 일');
  await expect(screen.getByLabel('블록 3 내용')).toBeFocused();
});

test('undo and redo step through structural edits', async ({ screen, browser }) => {
  await screen.getByLabel('블록 1 내용').fill('남는 글');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await expect(screen.getByTestId('block-2')).toBeVisible();
  await browser.keyboard.press('Control+z');
  await expect(screen.getByTestId('block-2')).toBeHidden();
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('남는 글');
  await browser.keyboard.press('Control+Shift+z');
  await expect(screen.getByTestId('block-2')).toBeVisible();
  await screen.getByRole('button', '블록 1 메뉴').tap();
  await screen.getByRole('button', '삭제').tap();
  await expect(screen.getByTestId('block-2')).toBeHidden();
  await browser.keyboard.press('Control+z');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('남는 글');
  await expect(screen.getByTestId('block-2')).toBeVisible();
});

test('undo restores a block type change and typed text', async ({ screen }) => {
  await screen.getByLabel('블록 1 내용').fill('되돌릴 글');
  await screen.getByRole('button', '블록 1 메뉴').tap();
  await screen.getByRole('option', '인용', { exact: true }).tap();
  await expect(screen.getByTestId('block-1')).toHaveAttribute('data-type', 'quote');
  await screen.getByLabel('블록 1 내용').press('Control+z');
  await expect(screen.getByTestId('block-1')).toHaveAttribute('data-type', 'text');
  await screen.getByLabel('블록 1 내용').press('Control+z');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('');
  await screen.getByLabel('블록 1 내용').press('Control+y');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('되돌릴 글');
});

test('Markdown export covers the new block types and indentation', async ({ screen, browser }) => {
  await screen.getByLabel('페이지 제목').fill('새 블록 내보내기');
  await screen.getByLabel('블록 1 내용').pressSequentially('### 작은 제목');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await screen.getByLabel('블록 2 내용').pressSequentially('1. 첫째');
  await screen.getByLabel('블록 2 내용').press('Enter');
  await screen.getByLabel('블록 3 내용').pressSequentially('둘째');
  await screen.getByLabel('블록 3 내용').press('Enter');
  await screen.getByLabel('블록 4 내용').pressSequentially('안쪽');
  await screen.getByLabel('블록 4 내용').press('Tab');
  await screen.getByLabel('블록 4 내용').press('Enter');
  await screen.getByLabel('블록 5 내용').press('Enter');
  await screen.getByLabel('블록 5 내용').press('Backspace');
  await screen.getByLabel('블록 5 내용').pressSequentially('```');
  await screen.getByLabel('블록 5 내용').pressSequentially('const a = 1;');
  const file = await browser.waitForDownload(() => screen.getByRole('button', '내보내기', { exact: true }).tap());
  const markdown = await readFile(file.absolutePath, 'utf8');
  expect(markdown).toContain('### 작은 제목');
  expect(markdown).toContain('1. 첫째');
  expect(markdown).toContain('2. 둘째');
  expect(markdown).toContain('    1. 안쪽');
  expect(markdown).toContain('```\nconst a = 1;\n```');
});
