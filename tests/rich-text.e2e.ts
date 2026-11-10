import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { readFile } from 'node:fs/promises';

beforeEach(async ({ app, screen }) => {
  await app.open('/');
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
});

const savedBlocks = (browser: any) => browser.evaluate(() => {
  const data = JSON.parse(localStorage.getItem('folio.workspace.v1')!);
  return data.pages.find((p: any) => p.id === data.activeId).blocks.map((b: any) => ({ type: b.type, text: b.text, marks: b.marks ?? [] }));
});
const paste = (browser: any, text: string) => browser.evaluate((text: string) => {
  const data = new DataTransfer(); data.setData('text/plain', text); data.setData('text/html', `<b>${text}</b>`);
  document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  return true;
}, text);
async function typeAndSelectAll(screen: any, browser: any, text: string) {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially(text);
  await browser.keyboard.press('Control+a');
  return first;
}

for (const [keys, type, tag, label] of [['Control+b', 'bold', 'strong', '굵게'], ['Control+i', 'italic', 'em', '기울임'], ['Control+u', 'underline', 'u', '밑줄'], ['Control+Shift+s', 'strike', 's', '취소선'], ['Control+e', 'code', 'code', '인라인 코드']]) {
  test(`${keys} toggles ${label} on the selection`, async ({ screen, browser }) => {
    const first = await typeAndSelectAll(screen, browser, '서식 테스트');
    await browser.keyboard.press(keys);
    await expect(browser.locator(`[data-testid="block-1"] .block-input ${tag}`)).toHaveText('서식 테스트');
    expect(await savedBlocks(browser)).toEqual([{ type: 'text', text: '서식 테스트', marks: [{ start: 0, end: 6, type }] }]);
    await expect(screen.getByRole('button', label, { exact: true })).toHaveAttribute('aria-pressed', 'true');
    await browser.keyboard.press(keys);
    await expect(browser.locator(`[data-testid="block-1"] .block-input ${tag}`)).toHaveCount(0);
    expect((await savedBlocks(browser))[0].marks).toEqual([]);
    await expect(first).toHaveText('서식 테스트');
  });
}

test('formatting part of a block keeps the rest plain and survives a reload', async ({ screen, browser }) => {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('앞 가운데 뒤');
  await browser.keyboard.press('Home');
  await browser.keyboard.press('ArrowRight'); await browser.keyboard.press('ArrowRight');
  for (let i = 0; i < 3; i++) await browser.keyboard.press('Shift+ArrowRight');
  await browser.keyboard.press('Control+b');
  expect((await savedBlocks(browser))[0].marks).toEqual([{ start: 2, end: 5, type: 'bold' }]);
  await browser.reload();
  await expect(browser.locator('[data-testid="block-1"] .block-input strong')).toHaveText('가운데');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('앞 가운데 뒤');
});

test('the format toolbar appears for a selection and applies marks', async ({ screen, browser }) => {
  await typeAndSelectAll(screen, browser, '도구 모음');
  await expect(screen.getByRole('toolbar', '텍스트 서식')).toBeVisible();
  await screen.getByRole('button', '굵게', { exact: true }).tap();
  await screen.getByRole('button', '기울임', { exact: true }).tap();
  expect((await savedBlocks(browser))[0].marks).toEqual([{ start: 0, end: 5, type: 'bold' }, { start: 0, end: 5, type: 'italic' }]);
  await browser.keyboard.press('End');
  await expect(screen.getByRole('toolbar', '텍스트 서식')).toBeHidden();
});

test('a link can be added, edited through Ctrl+K, and removed', async ({ screen, browser }) => {
  await typeAndSelectAll(screen, browser, 'Folio 문서');
  await browser.keyboard.press('Control+k');
  const input = screen.getByLabel('링크 주소');
  await expect(input).toBeFocused();
  await input.fill('example.com/docs');
  await input.press('Enter');
  const link = browser.locator('[data-testid="block-1"] .block-input a');
  await expect(link).toHaveAttribute('href', 'https://example.com/docs');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect((await savedBlocks(browser))[0].marks).toEqual([{ start: 0, end: 8, type: 'link', value: 'https://example.com/docs' }]);
  await screen.getByRole('button', '링크', { exact: true }).tap();
  await expect(screen.getByLabel('링크 주소')).toHaveValue('https://example.com/docs');
  await screen.getByRole('button', '링크 제거').tap();
  await expect(link).toHaveCount(0);
  expect((await savedBlocks(browser))[0].marks).toEqual([]);
});

test('unsafe link addresses are refused', async ({ screen, browser }) => {
  await typeAndSelectAll(screen, browser, '위험한 링크');
  await browser.keyboard.press('Control+k');
  await screen.getByLabel('링크 주소').fill('javascript:alert(1)');
  await screen.getByLabel('링크 주소').press('Enter');
  await expect(browser.locator('#toast')).toContainText('http, https, mailto 주소만');
  await expect(browser.locator('[data-testid="block-1"] .block-input a')).toHaveCount(0);
  expect((await savedBlocks(browser))[0].marks).toEqual([]);
});

test('Ctrl+K without a selection still opens search', async ({ screen, browser }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('검색');
  await browser.keyboard.press('Control+k');
  await expect(browser.locator('.search-modal')).toBeVisible();
});

test('text and background colours can be set and cleared', async ({ screen, browser }) => {
  await typeAndSelectAll(screen, browser, '색상 글자');
  await screen.getByRole('button', '색상', { exact: true }).tap();
  await screen.getByRole('button', '글자색 파랑').tap();
  await screen.getByRole('button', '배경색 노랑').tap();
  await expect(browser.locator('[data-testid="block-1"] .block-input [data-color="blue"]')).toHaveText('색상 글자');
  await expect(browser.locator('[data-testid="block-1"] .block-input [data-bg="yellow"]')).toHaveText('색상 글자');
  expect((await savedBlocks(browser))[0].marks).toEqual([{ start: 0, end: 5, type: 'color', value: 'blue' }, { start: 0, end: 5, type: 'bg', value: 'yellow' }]);
  await screen.getByRole('button', '글자색 기본').tap();
  expect((await savedBlocks(browser))[0].marks).toEqual([{ start: 0, end: 5, type: 'bg', value: 'yellow' }]);
});

for (const [typed, type, tag] of [['**굵게**', 'bold', 'strong'], ['*기울임*', 'italic', 'em'], ['`코드`', 'code', 'code'], ['~~취소~~', 'strike', 's']]) {
  test(`inline Markdown ${typed} converts while typing`, async ({ screen, browser }) => {
    const first = screen.getByLabel('블록 1 내용');
    await first.pressSequentially(`앞 ${typed} 뒤`);
    const inner = typed.replace(/[*`~]/g, '');
    await expect(first).toHaveText(`앞 ${inner} 뒤`);
    await expect(browser.locator(`[data-testid="block-1"] .block-input ${tag}`)).toHaveText(inner);
    expect(await savedBlocks(browser)).toEqual([{ type: 'text', text: `앞 ${inner} 뒤`, marks: [{ start: 2, end: 2 + inner.length, type }] }]);
  });
}

test('typing after Ctrl+B with only a caret is bold until toggled off', async ({ screen, browser }) => {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('보통 ');
  await browser.keyboard.press('Control+b');
  await browser.keyboard.type('굵게');
  await browser.keyboard.press('Control+b');
  await browser.keyboard.type(' 다시');
  await expect(first).toHaveText('보통 굵게 다시');
  expect((await savedBlocks(browser))[0].marks).toEqual([{ start: 3, end: 5, type: 'bold' }]);
});

test('splitting and merging blocks keeps marks on the right text', async ({ screen, browser }) => {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('가나 **다라** 마바');
  for (let i = 0; i < 4; i++) await browser.keyboard.press('ArrowLeft');
  await browser.keyboard.press('Enter');
  expect(await savedBlocks(browser)).toEqual([
    { type: 'text', text: '가나 다', marks: [{ start: 3, end: 4, type: 'bold' }] },
    { type: 'text', text: '라 마바', marks: [{ start: 0, end: 1, type: 'bold' }] },
  ]);
  await browser.keyboard.press('Backspace');
  expect(await savedBlocks(browser)).toEqual([{ type: 'text', text: '가나 다라 마바', marks: [{ start: 3, end: 5, type: 'bold' }] }]);
});

test('pasting several lines creates several plain blocks', async ({ screen, browser }) => {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('시작:');
  await paste(browser, '첫째\r\n\r\n둘째\n셋째');
  expect(await savedBlocks(browser)).toEqual([
    { type: 'text', text: '시작:첫째', marks: [] }, { type: 'text', text: '둘째', marks: [] }, { type: 'text', text: '셋째', marks: [] },
  ]);
  await expect(screen.getByLabel('블록 3 내용')).toBeFocused();
  await expect(browser.locator('.block-input b')).toHaveCount(0);
});

test('pasting lines inside a list continues the list', async ({ screen, browser }) => {
  await screen.getByLabel('블록 1 내용').pressSequentially('- 하나');
  await paste(browser, '\n둘\n셋');
  expect((await savedBlocks(browser)).map((b: any) => [b.type, b.text])).toEqual([['bullet', '하나'], ['bullet', '둘'], ['bullet', '셋']]);
});

test('undo restores formatting changes', async ({ screen, browser }) => {
  await typeAndSelectAll(screen, browser, '되돌리기');
  await browser.keyboard.press('Control+b');
  await browser.keyboard.press('Control+z');
  expect((await savedBlocks(browser))[0].marks).toEqual([]);
  await browser.keyboard.press('Control+Shift+z');
  expect((await savedBlocks(browser))[0].marks).toEqual([{ start: 0, end: 4, type: 'bold' }]);
});

test('code blocks never take inline formatting', async ({ screen, browser }) => {
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('```');
  await first.pressSequentially('a **b** c');
  await browser.keyboard.press('Control+a');
  await browser.keyboard.press('Control+b');
  await expect(first).toHaveText('a **b** c');
  expect(await savedBlocks(browser)).toEqual([{ type: 'code', text: 'a **b** c', marks: [] }]);
});

test('Markdown export writes inline formatting', async ({ screen, browser }) => {
  await screen.getByLabel('페이지 제목').fill('서식 내보내기');
  const first = screen.getByLabel('블록 1 내용');
  await first.pressSequentially('**굵게** 그리고 `코드` 와 ~~취소~~');
  const file = await browser.waitForDownload(() => screen.getByRole('button', '내보내기', { exact: true }).tap());
  expect(await readFile(file.absolutePath, 'utf8')).toContain('**굵게** 그리고 `코드` 와 ~~취소~~');
});
