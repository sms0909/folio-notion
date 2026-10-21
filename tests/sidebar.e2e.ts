import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';

beforeEach(async ({ app }) => { await app.open('/'); });

test('workspace dropdown provides workspace creation settings and native account controls', async ({ screen, app }) => {
  await screen.getByRole('button', '워크스페이스 전환').tap();
  await expect(screen.getByRole('menuitem', '워크스페이스 만들기')).toBeVisible();
  await expect(screen.getByRole('menuitem', '워크스페이스 설정')).toBeVisible();
  await expect(screen.getByRole('menuitem', '계정 관리')).toBeVisible();
  await expect(screen.getByRole('link', '다른 ChatGPT 계정으로 로그인')).toHaveAttribute('target', '_top');
  await app.screenshot('workspace-switcher');
});

test('new local workspace isolates pages and switching back restores edited original', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('원래 공간의 비공개 문서');
  await screen.getByLabel('블록 1 내용').fill('원래 공간에 보존할 내용');
  await screen.getByRole('button', '워크스페이스 전환').tap();
  await screen.getByRole('menuitem', '워크스페이스 만들기').tap();
  await screen.getByLabel('새 워크스페이스 이름').fill('사이드 프로젝트');
  await screen.getByRole('button', '워크스페이스 생성', { exact: true }).tap();
  await expect(screen.getByTestId('workspace-name')).toHaveText('사이드 프로젝트');
  await expect(screen.getByRole('button', '페이지 열기: 원래 공간의 비공개 문서', { exact: true })).toBeHidden();
  await browser.reload();
  await expect(screen.getByTestId('workspace-name')).toHaveText('사이드 프로젝트');
  await screen.getByRole('button', '워크스페이스 전환').tap();
  await screen.getByRole('menuitem', '워크스페이스 선택: Goodus의 워크스페이스', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('원래 공간의 비공개 문서');
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('원래 공간에 보존할 내용');
});

test('sidebar menu renames an inactive page without editing the current page', async ({ screen }) => {
  await screen.getByRole('button', '페이지 메뉴: 아이디어 노트', { exact: true }).tap();
  await screen.getByRole('menuitem', '이름 바꾸기', { exact: true }).tap();
  await screen.getByLabel('페이지 이름').fill('새 아이디어');
  await screen.getByRole('button', '이름 저장', { exact: true }).tap();
  await expect(screen.getByRole('button', '페이지 열기: 새 아이디어', { exact: true })).toBeVisible();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('나의 워크스페이스');
});

test('sidebar favorite action targets its own page', async ({ screen }) => {
  await screen.getByRole('button', '페이지 메뉴: 아이디어 노트', { exact: true }).tap();
  await screen.getByRole('menuitem', '즐겨찾기에 추가', { exact: true }).tap();
  await expect(screen.getByRole('button', '즐겨찾기 페이지: 아이디어 노트', { exact: true })).toBeVisible();
});

test('sidebar duplicate creates an independent copy of the targeted page', async ({ screen }) => {
  await screen.getByRole('button', '페이지 메뉴: 아이디어 노트', { exact: true }).tap();
  await screen.getByRole('menuitem', '페이지 복제', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('아이디어 노트 (복사본)');
  await expect(screen.getByLabel('블록 1 내용')).toHaveValue('아직 다듬어지지 않아도 괜찮아요.');
});

test('drag page into another page and preserve its nesting after reload', async ({ screen, browser }) => {
  await screen.getByRole('button', '페이지 열기: 아이디어 노트', { exact: true }).dragTo(screen.getByRole('button', '페이지 열기: 팀 위키', { exact: true }));
  await browser.reload();
  const parent = await browser.evaluate(() => JSON.parse(localStorage.getItem('folio.workspace.v1')!).pages.find((p: any) => p.id === 'ideas').parentId);
  expect(parent).toBe('wiki');
  await expect(screen.getByRole('button', '페이지 열기: 아이디어 노트', { exact: true })).toBeVisible();
});

test('page menu moves a sibling up and persists manual order', async ({ screen, browser }) => {
  await screen.getByRole('button', '페이지 메뉴: 아이디어 노트', { exact: true }).tap();
  await screen.getByRole('menuitem', '위로 이동', { exact: true }).tap();
  await browser.reload();
  const names = await browser.evaluate(() => [...document.querySelectorAll('[data-sidebar-page][data-parent="root"] .page-link')].map(el => el.getAttribute('aria-label')));
  expect(names.indexOf('페이지 열기: 아이디어 노트') < names.indexOf('페이지 열기: 팀 위키')).toBe(true);
});

test('sections and nested page expansion persist across reload', async ({ screen, browser }) => {
  await screen.getByRole('button', '팀 위키 하위 페이지', { exact: true }).tap();
  await screen.getByRole('button', '즐겨찾기 섹션', { exact: true }).tap();
  await browser.reload();
  await expect(screen.getByRole('button', '즐겨찾기 섹션', { exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(screen.getByRole('button', '페이지 열기: 주간 회의', { exact: true })).toBeHidden();
});

test('sidebar width is keyboard adjustable and persists', async ({ screen, browser }) => {
  const handle = screen.getByRole('separator', '사이드바 너비 조절');
  await handle.focus();
  await handle.press('ArrowRight');
  await handle.press('ArrowRight');
  const width = await browser.evaluate(() => Math.round(document.querySelector('.sidebar')!.getBoundingClientRect().width));
  expect(width).toBe(268);
  await browser.reload();
  expect(await browser.evaluate(() => Math.round(document.querySelector('.sidebar')!.getBoundingClientRect().width))).toBe(268);
});

test('Control Backslash collapses and reopens sidebar', async ({ screen, browser }) => {
  await browser.keyboard.press('Control+Backslash');
  await expect(screen.getByRole('button', '사이드바 열기')).toBeVisible();
  expect(await browser.evaluate(() => document.querySelector('.main-shell')!.getBoundingClientRect().left)).toBe(0);
  await browser.keyboard.press('Control+Backslash');
  await expect(screen.getByRole('button', '워크스페이스 전환')).toBeVisible();
});

test('recent visits and library open the right page', async ({ screen }) => {
  await screen.getByRole('button', '페이지 열기: 아이디어 노트', { exact: true }).tap();
  await screen.getByRole('button', '홈', { exact: true }).tap();
  await screen.getByRole('button', '최근 페이지: 아이디어 노트', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('아이디어 노트');
  await screen.getByRole('button', '전체 페이지', { exact: true }).tap();
  await screen.getByRole('button', '목록 페이지: 주간 회의', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('주간 회의');
});

test('search title filter distinguishes title from document body', async ({ screen }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('문서 제목');
  await screen.getByLabel('블록 1 내용').fill('본문전용검색어887');
  await screen.getByRole('button', '검색', { exact: true }).tap();
  await screen.getByRole('searchbox', '워크스페이스 검색').fill('본문전용검색어887');
  await expect(screen.getByRole('button', '검색 결과: 문서 제목')).toBeVisible();
  await screen.getByLabel('검색 범위').selectOption({ value: 'title' });
  await expect(screen.getByRole('button', '검색 결과: 문서 제목')).toBeHidden();
});

test('pointer resizing persists the sidebar width', async ({ browser, screen }) => {
  const bounds = await browser.evaluate(() => { const r = document.querySelector('.sidebar-resizer')!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 150 }; });
  await browser.mouse.move(bounds.x, bounds.y); await browser.mouse.down();
  await browser.mouse.move(bounds.x + 72, bounds.y); await browser.mouse.up();
  await browser.reload();
  await expect(screen.getByRole('separator', '사이드바 너비 조절')).toHaveAttribute('aria-valuenow', '320');
});

test('dragging a parent into its descendant does not create a cycle', async ({ screen, browser }) => {
  await screen.getByRole('button', '페이지 열기: 팀 위키', { exact: true }).dragTo(screen.getByRole('button', '페이지 열기: 주간 회의', { exact: true }));
  await expect(screen.getByRole('status')).toContainText('자신이나 하위 페이지');
  const parents = await browser.evaluate(() => JSON.parse(localStorage.getItem('folio.workspace.v1') || '{}').pages?.map((p: any) => [p.id, p.parentId]) || []);
  expect(parents.length === 0 || parents.some(([id, parent]: any) => id === 'wiki' && parent === null)).toBe(true);
  await browser.reload();
  await expect(screen.getByRole('button', '페이지 열기: 주간 회의', { exact: true })).toBeVisible();
});

test('sidebar deletion keeps an unrelated current page open', async ({ screen }) => {
  await screen.getByRole('button', '페이지 열기: 아이디어 노트', { exact: true }).tap();
  await screen.getByRole('button', '페이지 메뉴: 팀 위키', { exact: true }).tap();
  await screen.getByRole('menuitem', '휴지통으로 이동', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('아이디어 노트');
  await expect(screen.getByRole('button', '페이지 열기: 팀 위키', { exact: true })).toBeHidden();
});

test('sidebar context menu is available with Shift F10', async ({ screen }) => {
  await screen.getByRole('button', '페이지 열기: 아이디어 노트', { exact: true }).focus();
  await screen.getByRole('button', '페이지 열기: 아이디어 노트', { exact: true }).press('Shift+F10');
  await expect(screen.getByRole('menuitem', '이름 바꾸기', { exact: true })).toBeVisible();
});

test('section order persists across reload', async ({ screen, browser }) => {
  await screen.getByRole('button', '개인 페이지 섹션 메뉴', { exact: true }).tap();
  await screen.getByRole('menuitem', '섹션 위로', { exact: true }).tap();
  await browser.reload();
  const order = await browser.evaluate(() => [...document.querySelectorAll('[data-sidebar-section]')].map(el => (el as HTMLElement).dataset.sidebarSection));
  expect(order).toEqual(['recent', 'pages', 'favorites']);
});

test('database sidebar shortcut opens the board view', async ({ screen }) => {
  await screen.getByRole('button', '프로젝트 하위 페이지', { exact: true }).tap();
  await screen.getByRole('button', '데이터베이스 보기: 프로젝트 보드', { exact: true }).tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('프로젝트');
  await expect(screen.getByRole('tab', '보드', { exact: true })).toHaveAttribute('aria-selected', 'true');
});

test('workspace switch failure preserves the original canonical data', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('저장 실패 시 보존할 원본');
  await screen.getByRole('button', '워크스페이스 전환').tap();
  await screen.getByRole('menuitem', '워크스페이스 만들기').tap();
  await screen.getByLabel('새 워크스페이스 이름').fill('저장할 수 없는 공간');
  await browser.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'folio.workspaces.v1') throw new DOMException('quota', 'QuotaExceededError'); return original.call(this, key, value); };
  });
  await screen.getByRole('button', '워크스페이스 생성', { exact: true }).tap();
  await screen.getByRole('button', '닫기', { exact: true }).tap();
  await browser.reload();
  await expect(screen.getByTestId('workspace-name')).toHaveText('Goodus의 워크스페이스');
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('저장 실패 시 보존할 원본');
});

test('mobile sidebar remains within viewport and exposes workspace controls', async ({ browser, screen, app }) => {
  await browser.setViewport({ width: 390, height: 844 });
  await screen.getByRole('button', '사이드바 열기').tap();
  await expect(screen.getByRole('button', '워크스페이스 전환')).toBeVisible();
  await expect(screen.getByRole('link', 'ChatGPT 로그아웃', { exact: true })).toBeVisible();
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await app.screenshot('mobile-sidebar');
});
