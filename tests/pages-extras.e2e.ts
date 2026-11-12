import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(async ({ app }) => { await app.open('/'); });

const stored = (browser: any) => browser.evaluate(() => JSON.parse(localStorage.getItem('folio.mirror.v1')!));
const pageOf = async (browser: any, title: string) => (await stored(browser)).pages.find((p: any) => p.title === title);
async function newPage(screen: any, title: string) {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill(title);
}
const openPage = (screen: any, title: string) => screen.getByRole('button', `페이지 열기: ${title}`, { exact: true }).tap();
async function pageMenu(screen: any, item: string, role = 'menuitem') {
  await screen.getByRole('button', '페이지 더보기').tap();
  await screen.getByRole(role, item, { exact: true }).tap();
}
async function tempFile(name: string, content: string) {
  const dir = await mkdtemp(join(tmpdir(), 'folio-e2e-')); const path = join(dir, name); await writeFile(path, content); return path;
}
async function linkFromSlash(screen: any, block: number, target: string) {
  await screen.getByLabel(`블록 ${block} 내용`).pressSequentially('/링크');
  await screen.getByRole('option', '페이지 링크', { exact: true }).tap();
  await screen.getByLabel('페이지 검색').fill(target);
  await screen.getByRole('button', `페이지 선택: ${target}`, { exact: true }).tap();
}

test('page icon can be a built-in icon or an emoji and persists', async ({ screen, browser }) => {
  await newPage(screen, '아이콘 페이지');
  await screen.getByRole('button', '페이지 아이콘 변경').tap();
  await screen.getByRole('button', '아이콘: 별', { exact: true }).tap();
  expect((await pageOf(browser, '아이콘 페이지')).icon).toBe('star');
  await screen.getByRole('button', '페이지 아이콘 변경').tap();
  await expect(screen.getByRole('button', '아이콘: 별', { exact: true })).toHaveAttribute('aria-pressed', 'true');
  await screen.getByRole('button', '이모지: 🚀', { exact: true }).tap();
  await browser.reload();
  expect((await pageOf(browser, '아이콘 페이지')).icon).toBe('🚀');
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('아이콘 페이지');
});

test('a typed emoji becomes the icon and plain text is refused', async ({ screen, browser }) => {
  await newPage(screen, '직접 입력');
  await screen.getByRole('button', '페이지 아이콘 변경').tap();
  await screen.getByLabel('이모지 직접 입력').fill('abc');
  await screen.getByRole('button', '적용', { exact: true }).tap();
  await expect(browser.locator('#toast')).toContainText('이모지 하나를 입력해 주세요.');
  await screen.getByLabel('이모지 직접 입력').fill('🍀 행운');
  await screen.getByRole('button', '적용', { exact: true }).tap();
  expect((await pageOf(browser, '직접 입력')).icon).toBe('🍀');
});

test('cover can be added, changed and removed', async ({ screen, browser }) => {
  await newPage(screen, '커버 페이지');
  await expect(screen.getByTestId('page-cover')).toHaveCount(0);
  await screen.getByRole('button', '커버 추가').tap();
  await screen.getByRole('button', '커버: 바다', { exact: true }).tap();
  await expect(screen.getByTestId('page-cover')).toHaveAttribute('data-cover', 'ocean');
  await browser.reload();
  await expect(screen.getByTestId('page-cover')).toHaveAttribute('data-cover', 'ocean');
  await screen.getByRole('button', '커버 변경').tap();
  await screen.getByRole('button', '커버: 숲', { exact: true }).tap();
  await expect(screen.getByTestId('page-cover')).toHaveAttribute('data-cover', 'forest');
  await screen.getByRole('button', '커버 변경').tap();
  await screen.getByRole('menuitem', '커버 제거').tap();
  await expect(screen.getByTestId('page-cover')).toHaveCount(0);
  expect((await pageOf(browser, '커버 페이지')).cover).toBeUndefined();
});

test('full width and small text are remembered per page', async ({ screen, browser }) => {
  await newPage(screen, '넓은 페이지');
  await pageMenu(screen, '전체 너비', 'menuitemcheckbox');
  await pageMenu(screen, '작은 글씨', 'menuitemcheckbox');
  await browser.reload();
  await expect(browser.locator('.page-content.full-width.small-text')).toHaveCount(1);
  await screen.getByRole('button', '페이지 더보기').tap();
  await expect(screen.getByRole('menuitemcheckbox', '전체 너비', { exact: true })).toHaveAttribute('aria-checked', 'true');
  await screen.getByRole('menuitemcheckbox', '전체 너비', { exact: true }).tap();
  await expect(browser.locator('.page-content.full-width')).toHaveCount(0);
  const page = await pageOf(browser, '넓은 페이지');
  expect(page.fullWidth).toBeUndefined(); expect(page.smallText).toBe(true);
});

test('trash can be searched and a page deleted for good after confirming', async ({ screen, browser }) => {
  for (const title of ['버릴 메모', '남길 초안']) { await newPage(screen, title); await pageMenu(screen, '휴지통으로 이동'); }
  await screen.getByRole('button', '휴지통', { exact: true }).tap();
  await expect(screen.getByText('삭제한 페이지 2개')).toBeVisible();
  await screen.getByLabel('휴지통 검색').fill('메모');
  await expect(screen.getByText('검색 결과 1개')).toBeVisible();
  await expect(screen.getByRole('button', '복원: 남길 초안', { exact: true })).toHaveCount(0);
  await screen.getByRole('button', '영구 삭제: 버릴 메모', { exact: true }).tap();
  expect((await stored(browser)).pages.some((p: any) => p.title === '버릴 메모')).toBe(true);
  await expect(screen.getByRole('button', '영구 삭제 확인: 버릴 메모', { exact: true })).toBeFocused();
  await screen.getByRole('button', '영구 삭제 확인: 버릴 메모', { exact: true }).tap();
  await expect(browser.locator('#toast')).toContainText('페이지를 영구 삭제했습니다.');
  const data = await stored(browser);
  expect(data.pages.some((p: any) => p.title === '버릴 메모')).toBe(false);
  expect(data.pages.some((p: any) => p.title === '남길 초안' && p.deleted)).toBe(true);
});

test('emptying the trash removes every deleted page with its subpages', async ({ screen, browser }) => {
  await newPage(screen, '부모 문서');
  await pageMenu(screen, '하위 페이지 추가');
  await screen.getByLabel('페이지 제목').fill('자식 문서');
  await openPage(screen, '부모 문서');
  await pageMenu(screen, '휴지통으로 이동');
  await newPage(screen, '다른 문서'); await pageMenu(screen, '휴지통으로 이동');
  await screen.getByRole('button', '휴지통', { exact: true }).tap();
  await screen.getByRole('button', '휴지통 비우기', { exact: true }).tap();
  await screen.getByRole('button', '휴지통 비우기 확인', { exact: true }).tap();
  await expect(screen.getByRole('dialog', '휴지통')).toContainText('휴지통이 비어 있습니다.');
  const titles = (await stored(browser)).pages.map((p: any) => p.title);
  for (const title of ['부모 문서', '자식 문서', '다른 문서']) expect(titles).not.toContain(title);
  await browser.reload();
  await expect(screen.getByLabel('페이지 제목')).toBeVisible();
});

test('slash command links a page and the target shows a backlink', async ({ screen }) => {
  await newPage(screen, '대상 문서');
  await newPage(screen, '출발 문서');
  await linkFromSlash(screen, 1, '대상 문서');
  await expect(screen.getByRole('button', '페이지 링크: 대상 문서', { exact: true })).toBeVisible();
  await expect(screen.getByLabel('블록 2 내용')).toBeFocused();
  await screen.getByRole('button', '페이지 링크: 대상 문서', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('대상 문서');
  await expect(screen.getByRole('navigation', '백링크')).toContainText('이 페이지를 링크한 곳 1개');
  await screen.getByRole('button', '백링크: 출발 문서', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('출발 문서');
});

test('typing [[ opens the page picker and keeps the text', async ({ screen, browser }) => {
  await newPage(screen, '참고 자료');
  await newPage(screen, '회의록');
  await screen.getByLabel('블록 1 내용').pressSequentially('자세한 내용은 [[');
  await expect(screen.getByRole('dialog', '페이지 링크')).toBeVisible();
  await screen.getByLabel('페이지 검색').fill('참고');
  await screen.getByRole('button', '페이지 선택: 참고 자료', { exact: true }).tap();
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('자세한 내용은 ');
  await expect(screen.getByRole('button', '페이지 링크: 참고 자료', { exact: true })).toBeVisible();
  await browser.reload();
  await expect(screen.getByRole('button', '페이지 링크: 참고 자료', { exact: true })).toBeVisible();
});

test('a link follows a rename and shows when its page is deleted', async ({ screen }) => {
  await newPage(screen, '옛 이름');
  await newPage(screen, '링크 모음');
  await linkFromSlash(screen, 1, '옛 이름');
  await openPage(screen, '옛 이름');
  await screen.getByLabel('페이지 제목').fill('새 이름');
  await openPage(screen, '링크 모음');
  await expect(screen.getByRole('button', '페이지 링크: 새 이름', { exact: true })).toBeVisible();
  await openPage(screen, '새 이름');
  await pageMenu(screen, '휴지통으로 이동');
  await openPage(screen, '링크 모음');
  await expect(screen.getByText('삭제된 페이지')).toBeVisible();
  await expect(screen.getByRole('button', '페이지 링크: 새 이름', { exact: true })).toHaveCount(0);
});

test('table of contents lists headings and follows edits', async ({ screen }) => {
  await newPage(screen, '목차 문서');
  await screen.getByLabel('블록 1 내용').pressSequentially('/목차');
  await screen.getByRole('option', '목차', { exact: true }).tap();
  const toc = screen.getByRole('navigation', '목차');
  await expect(toc).toContainText('제목 블록을 추가하면');
  await screen.getByLabel('블록 2 내용').pressSequentially('# 개요');
  await browser_enter(screen);
  await screen.getByLabel('블록 3 내용').pressSequentially('## 세부 계획');
  await expect(toc.getByRole('button', '개요', { exact: true })).toBeVisible();
  await expect(toc.getByRole('button', '세부 계획', { exact: true })).toBeVisible();
  await toc.getByRole('button', '개요', { exact: true }).tap();
  await expect(screen.getByLabel('블록 2 내용')).toBeFocused();
});
async function browser_enter(screen: any) { await screen.getByLabel('블록 2 내용').press('Enter'); }

test('a page can be saved as a template, used and deleted', async ({ screen, browser }) => {
  await newPage(screen, '주간 회고');
  await screen.getByLabel('블록 1 내용').fill('잘한 점');
  await pageMenu(screen, '템플릿으로 저장');
  await expect(browser.locator('#toast')).toContainText('템플릿으로 저장했습니다.');
  await browser.reload();
  await screen.getByRole('button', '템플릿', { exact: true }).tap();
  await expect(screen.getByText('내 템플릿 1개')).toBeVisible();
  await screen.getByRole('button', '내 템플릿 사용: 주간 회고', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('주간 회고');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('잘한 점');
  expect((await stored(browser)).pages.filter((p: any) => p.title === '주간 회고').length).toBe(2);
  await screen.getByRole('button', '템플릿', { exact: true }).tap();
  await screen.getByRole('button', '템플릿 삭제: 주간 회고', { exact: true }).tap();
  await screen.getByRole('button', '템플릿 삭제 확인: 주간 회고', { exact: true }).tap();
  await expect(screen.getByText('내 템플릿 0개')).toBeVisible();
  expect((await stored(browser)).templates).toEqual([]);
});

test('a Markdown file is imported as a new page', async ({ screen, browser }) => {
  const path = await tempFile('여행 계획.md', '# 제주 여행\n\n첫째 날 일정\n\n## 준비물\n\n- 우산\n- [x] 항공권\n\n> 천천히 걷기\n');
  await screen.getByRole('button', '설정', { exact: true }).tap();
  await screen.getByLabel('Markdown 파일 선택').setInputFiles(path);
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('제주 여행');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('첫째 날 일정');
  const page = await pageOf(browser, '제주 여행');
  expect(page.blocks.map((b: any) => b.type)).toEqual(['text', 'h2', 'bullet', 'todo', 'quote']);
  expect(page.blocks[3].checked).toBe(true);
});

test('a CSV file is imported as a database and exported again', async ({ screen, browser }) => {
  const path = await tempFile('도서 목록.csv', '제목,쪽수,읽음,메모\n"데미안, 개정판",248,true,"좋은 ""고전"""\n모비 딕,720,false,\n');
  await screen.getByRole('button', '설정', { exact: true }).tap();
  await screen.getByLabel('CSV 파일 선택').setInputFiles(path);
  await expect(browser.locator('#toast')).toContainText('CSV 파일에서 2개 행을 가져왔습니다.');
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('도서 목록');
  await browser.reload();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('도서 목록');
  const data = await stored(browser); const page = data.pages.find((p: any) => p.title === '도서 목록'); const db = data.databases[page.id];
  expect(db.rows.map((r: any) => r.title)).toEqual(['데미안, 개정판', '모비 딕']);
  expect(db.properties.map((p: any) => [p.name, p.type])).toEqual([['쪽수', 'number'], ['읽음', 'checkbox'], ['메모', 'text']]);
  await screen.getByRole('button', '페이지 더보기').tap();
  const file = await browser.waitForDownload(() => screen.getByRole('menuitem', 'CSV 내보내기').tap());
  const csv = await readFile(file.absolutePath, 'utf8');
  expect(csv).toContain('이름,쪽수,읽음,메모');
  expect(csv).toContain('"데미안, 개정판",248,');
  expect(csv).toContain('"좋은 ""고전"""');
});

test('a page is exported as a standalone HTML file', async ({ screen, browser }) => {
  await newPage(screen, 'HTML <내보내기>');
  await screen.getByLabel('블록 1 내용').pressSequentially('# 큰 제목');
  await screen.getByLabel('블록 1 내용').press('Enter');
  await screen.getByLabel('블록 2 내용').pressSequentially('본문 <b>그대로</b>');
  await screen.getByRole('button', '페이지 더보기').tap();
  const file = await browser.waitForDownload(() => screen.getByRole('menuitem', 'HTML 내보내기').tap());
  const html = await readFile(file.absolutePath, 'utf8');
  expect(html).toContain('<!doctype html>');
  expect(html).toContain('HTML &lt;내보내기&gt;');
  expect(html).toContain('큰 제목</h1>');
  expect(html).toContain('본문 &lt;b&gt;그대로&lt;/b&gt;');
  expect(html).not.toContain('<script');
});

test('print opens the browser print dialog', async ({ screen, browser }) => {
  await newPage(screen, '인쇄할 문서');
  await browser.evaluate(() => { (window as any).printed = 0; window.print = () => { (window as any).printed++; }; });
  await pageMenu(screen, '인쇄');
  expect(await browser.evaluate(() => (window as any).printed)).toBe(1);
});

test('page history keeps versions and restores one', async ({ screen, browser }) => {
  await newPage(screen, '기록 문서');
  await screen.getByLabel('블록 1 내용').fill('첫 내용');
  await openPage(screen, '나의 워크스페이스');
  await openPage(screen, '기록 문서');
  await screen.getByLabel('블록 1 내용').fill('둘째 내용');
  await pageMenu(screen, '페이지 기록');
  await expect(screen.getByText('저장된 버전 2개')).toBeVisible();
  await screen.getByRole('button', '지금 버전 저장').tap();
  await expect(browser.locator('#toast')).toContainText('마지막 버전과 내용이 같습니다.');
  await screen.getByRole('button', '버전 2 복원', { exact: true }).tap();
  await expect(browser.locator('#toast')).toContainText('선택한 버전으로 복원했습니다.');
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('첫 내용');
  await browser.reload();
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('첫 내용');
  await pageMenu(screen, '페이지 기록');
  await expect(screen.getByText('저장된 버전 2개')).toBeVisible();
});

test('page history keeps at most thirty versions of a page', async ({ screen, browser }) => {
  await newPage(screen, '자주 고치는 문서');
  await screen.getByLabel('블록 1 내용').fill('처음');
  await expect(browser.locator('#save-state')).toContainText('저장됨');
  const answers = await browser.evaluate(async () => {
    const csrf = JSON.parse(document.querySelector('#folio-session')!.textContent!).csrf;
    const ws = JSON.parse(document.querySelector('#folio-workspace')!.textContent!).id;
    const save = (i: number) => fetch(`/api/workspaces/${ws}${location.pathname.replace('/p/', '/pages/')}/versions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify({ title: '자주 고치는 문서', blocks: [{ id: 'b', type: 'text', text: `수정 ${i}`, checked: false }] }) }).then(r => r.status);
    return Promise.all(Array.from({ length: 33 }, (_, i) => save(i)));
  });
  expect(answers.every((status: number) => status === 200)).toBe(true);
  await pageMenu(screen, '페이지 기록');
  await expect(screen.getByText('저장된 버전 30개')).toBeVisible();
  await expect(screen.getByRole('button', '버전 31 복원', { exact: true })).toHaveCount(0);
});

test('page history is kept on the server and names who saved it', async ({ screen, browser }) => {
  await newPage(screen, '기록 문서');
  await screen.getByLabel('블록 1 내용').fill('새 내용');
  await pageMenu(screen, '페이지 기록');
  await expect(screen.getByText('저장된 버전 1개')).toBeVisible();
  await screen.getByRole('button', '닫기').tap();
  await expect(browser.locator('#save-state')).toContainText('저장됨');
  await browser.evaluate(() => { localStorage.clear(); });
  await browser.reload();
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('새 내용');
  await pageMenu(screen, '페이지 기록');
  await expect(screen.getByText('저장된 버전 1개')).toBeVisible();
  await expect(screen.getByRole('dialog', '페이지 기록')).toContainText('블록 1개 · Goodus');
});

test('backups carry icons, covers, links and templates', async ({ screen, browser }) => {
  await newPage(screen, '백업 대상');
  await newPage(screen, '백업 문서');
  await screen.getByRole('button', '페이지 아이콘 변경').tap();
  await screen.getByRole('button', '이모지: 🎯', { exact: true }).tap();
  await screen.getByRole('button', '커버 추가').tap();
  await screen.getByRole('button', '커버: 민트', { exact: true }).tap();
  await linkFromSlash(screen, 1, '백업 대상');
  await pageMenu(screen, '템플릿으로 저장');
  await screen.getByRole('button', '설정', { exact: true }).tap();
  const file = await browser.waitForDownload(() => screen.getByRole('button', '워크스페이스 내보내기').tap());
  const data = JSON.parse(await readFile(file.absolutePath, 'utf8'));
  expect(data.version).toBe(4);
  const page = data.pages.find((p: any) => p.title === '백업 문서');
  expect(page.icon).toBe('🎯'); expect(page.cover).toBe('mint');
  expect(page.blocks[0].type).toBe('page');
  expect(page.blocks[0].target).toBe(data.pages.find((p: any) => p.title === '백업 대상').id);
  expect(data.templates.map((t: any) => t.title)).toEqual(['백업 문서']);
  await screen.getByLabel('백업 파일 선택').setInputFiles(file.absolutePath);
  await screen.getByRole('button', '백업으로 교체').tap();
  await openPage(screen, '백업 문서');
  await expect(screen.getByTestId('page-cover')).toHaveAttribute('data-cover', 'mint');
  await expect(screen.getByRole('button', '페이지 링크: 백업 대상', { exact: true })).toBeVisible();
});
