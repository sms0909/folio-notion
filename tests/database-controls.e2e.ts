import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';

beforeEach(async ({ app }) => { await app.open('/'); });

test('status priority assignee and due date are editable directly in the table', async ({ screen, browser, app }) => {
  await screen.getByLabel('브랜드 가이드 정리 상태').selectOption('완료');
  await screen.getByLabel('브랜드 가이드 정리 우선순위').selectOption('낮음');
  await screen.getByLabel('브랜드 가이드 정리 담당자').fill('민수');
  await screen.getByLabel('브랜드 가이드 정리 마감일').fill('2027-01-05');
  await screen.getByLabel('브랜드 가이드 정리 마감일').press('Tab');
  await browser.reload();
  await expect(screen.getByLabel('브랜드 가이드 정리 상태')).toHaveValue('완료');
  await expect(screen.getByLabel('브랜드 가이드 정리 우선순위')).toHaveValue('낮음');
  await expect(screen.getByLabel('브랜드 가이드 정리 담당자')).toHaveValue('민수');
  await expect(screen.getByLabel('브랜드 가이드 정리 마감일')).toHaveValue('2027-01-05');
  await browser.setViewport({ width: 1440, height: 1000 });
  await screen.getByRole('table', '프로젝트 데이터베이스').scrollIntoView();
  await app.screenshot('project-table-direct-editing');
});

test('view filter and sort survive a reload', async ({ screen, browser }) => {
  await screen.getByLabel('상태 필터').selectOption('완료');
  await screen.getByRole('button', '마감일순 정렬', { exact: true }).tap();
  await screen.getByRole('tab', '보드', { exact: true }).tap();
  await browser.reload();
  await expect(screen.getByRole('tab', '보드', { exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(screen.getByLabel('상태 필터')).toHaveValue('완료');
  await expect(screen.getByRole('button', '마감일순 정렬', { exact: true })).toHaveAttribute('data-sort', 'asc');
});

test('new task inherits the selected status and remains visible', async ({ screen }) => {
  await screen.getByLabel('상태 필터').selectOption('완료');
  await screen.getByRole('button', '새 작업', { exact: true }).tap();
  await expect(screen.getByLabel('작업 상태')).toHaveValue('완료');
  await screen.getByLabel('작업 이름').fill('필터 안에서 만든 작업');
  await screen.getByRole('button', '작업 저장', { exact: true }).tap();
  await expect(screen.getByRole('button', '작업 열기: 필터 안에서 만든 작업')).toBeVisible();
});

test('sort cycles through ascending descending and original order', async ({ screen, browser }) => {
  const titles = () => browser.evaluate(() => [...document.querySelectorAll('tbody .task-name > span:first-of-type')].map(el => el.textContent));
  const original = await titles();
  await screen.getByRole('button', '마감일순 정렬', { exact: true }).tap();
  expect((await titles())[0]).toBe('워크스페이스 구조 잡기');
  await screen.getByRole('button', '마감일순 정렬', { exact: true }).tap();
  expect((await titles())[0]).toBe('10월 회고 작성');
  await screen.getByRole('button', '마감일순 정렬', { exact: true }).tap();
  expect(await titles()).toEqual(original);
});

test('search clear restores rows and reports an empty result correctly', async ({ screen }) => {
  await screen.getByRole('searchbox', '데이터베이스 검색').fill('검색결과가없는문장');
  await expect(screen.getByText('조건에 맞는 작업이 없습니다.', { exact: true })).toBeVisible();
  await screen.getByRole('button', '데이터베이스 검색 지우기').tap();
  await expect(screen.getByRole('button', '작업 열기: 브랜드 가이드 정리')).toBeVisible();
  await expect(screen.getByRole('searchbox', '데이터베이스 검색')).toHaveValue('');
});

test('board drag updates status in the table and survives reload', async ({ screen, browser }) => {
  await screen.getByRole('tab', '보드', { exact: true }).tap();
  await screen.getByRole('button', '작업 열기: 브랜드 가이드 정리').dragTo(screen.getByRole('region', '완료'));
  await screen.getByRole('tab', '표', { exact: true }).tap();
  await expect(screen.getByLabel('브랜드 가이드 정리 상태')).toHaveValue('완료');
  await browser.reload();
  await expect(screen.getByLabel('브랜드 가이드 정리 상태')).toHaveValue('완료');
});

test('account dialog exposes native top-level sign-out without clearing local work', async ({ screen, browser }) => {
  await screen.getByRole('button', '계정', { exact: true }).tap();
  await expect(screen.getByRole('heading', '계정 및 로그인')).toBeVisible();
  const link = screen.getByRole('dialog', '계정 및 로그인').getByRole('link', 'ChatGPT 로그아웃', { exact: true });
  await expect(link).toHaveAttribute('href', '/signout-with-chatgpt?return_to=%2F');
  await expect(link).toHaveAttribute('target', '_top');
  await expect(screen.getByText('로그아웃해도 이 브라우저의 문서는 삭제되지 않습니다.', { exact: true })).toBeVisible();
  await browser.route('**/signout-with-chatgpt?*', route => route.fulfill({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<h1>플랫폼 로그아웃 경로 도착</h1>' }));
  await link.tap();
  await expect(screen.getByRole('heading', '플랫폼 로그아웃 경로 도착')).toBeVisible();
});

test('account dialog keyboard reaches login logout and closes the focus loop', async ({ screen, browser, app }) => {
  await screen.getByRole('button', '계정', { exact: true }).tap();
  const dialog = screen.getByRole('dialog', '계정 및 로그인');
  await dialog.getByRole('button', '닫기', { exact: true }).focus();
  await browser.keyboard.press('Tab');
  await expect(dialog.getByRole('link', 'ChatGPT 로그인', { exact: true })).toBeFocused();
  await browser.keyboard.press('Tab');
  await expect(dialog.getByRole('link', 'ChatGPT 로그아웃', { exact: true })).toBeFocused();
  await browser.keyboard.press('Tab');
  await expect(dialog.getByRole('button', '닫기', { exact: true })).toBeFocused();
  await app.screenshot('account-login-logout');
});

test('typing in database search preserves the same focused input and caret', async ({ screen, browser }) => {
  const search = screen.getByRole('searchbox', '데이터베이스 검색');
  await search.focus();
  await browser.evaluate(() => { (window as any).originalSearch = document.activeElement; });
  await browser.keyboard.type('브랜드');
  await expect(search).toHaveValue('브랜드');
  expect(await browser.evaluate(() => document.activeElement === (window as any).originalSearch)).toBe(true);
  await browser.keyboard.press('Home');
  await browser.keyboard.type('새');
  await expect(search).toHaveValue('새브랜드');
});
