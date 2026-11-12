import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

beforeEach(async ({ app }) => { await app.open('/'); });

const stored = (browser: any) => browser.evaluate(() => JSON.parse(localStorage.getItem('folio.mirror.v1')!));
const projects = async (browser: any) => (await stored(browser)).databases.projects;
const names = (browser: any) => browser.evaluate(() => [...document.querySelectorAll('tbody .task-name > span:first-of-type')].map(el => el.textContent));
const tool = (screen: any, name: string) => screen.getByRole('button', name, { exact: true });
const done = (screen: any) => screen.getByRole('button', '완료', { exact: true }).tap();
async function addProperty(screen: any, name: string, type: string) {
  await tool(screen, '속성').tap();
  await screen.getByRole('button', '속성 추가', { exact: true }).tap();
  await screen.getByLabel('속성 속성 이름').fill(name);
  await screen.getByLabel(`${name} 속성 유형`).selectOption(type);
}
async function addView(screen: any, type: string) {
  await screen.getByRole('button', '보기 추가', { exact: true }).tap();
  await screen.getByRole('menuitem', type, { exact: true }).tap();
}

test('version 2 tasks become database rows with the note as a block', async ({ screen, browser }) => {
  await screen.getByLabel('브랜드 가이드 정리 담당자').fill('저장');
  await browser.evaluate(() => {
    // What a browser that used Folio before it had a server still holds.
    const data = JSON.parse(localStorage.getItem('folio.mirror.v1')!);
    data.version = 2; delete data.databases; data.settings.name = '옛 공간';
    data.tasks = [{ id: 'old-task', title: '옛 작업', status: '진행 중', priority: '높음', assignee: '지수', date: '2026-03-02', note: '옛 메모' }];
    data.settings.database = { view: 'board', status: 'all', sort: 'asc' };
    localStorage.setItem('folio.workspace.v1', JSON.stringify(data));
  });
  await browser.reload();
  await screen.getByRole('button', '설정', { exact: true }).tap();
  await screen.getByRole('button', '서버로 옮기기').tap();
  await expect(browser.locator('#toast')).toContainText('워크스페이스 1개를 서버로 옮겼습니다.');
  await expect(screen.getByRole('button', '서버로 옮기기')).toHaveCount(0);
  await screen.getByRole('button', '닫기', { exact: true }).tap();
  await screen.getByRole('button', '워크스페이스 전환').tap();
  await screen.getByRole('menuitem', '워크스페이스 선택: 옛 공간', { exact: true }).tap();
  await expect(screen.getByTestId('workspace-name')).toHaveText('옛 공간');
  await expect(screen.getByRole('tab', '보드', { exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(screen.getByRole('region', '진행 중')).toContainText('옛 작업');
  await screen.getByRole('tab', '표', { exact: true }).tap();
  await expect(screen.getByLabel('옛 작업 담당자')).toHaveValue('지수');
  await expect(screen.getByLabel('옛 작업 마감일')).toHaveValue('2026-03-02');
  await screen.getByRole('button', '작업 열기: 옛 작업').tap();
  await screen.getByRole('button', '페이지로 열기').tap();
  await expect(screen.getByLabel('블록 1 내용')).toHaveText('옛 메모');
  const data = await stored(browser);
  expect(data.version).toBe(4);
  expect(data.tasks).toBeUndefined();
  expect(data.databases.projects.rows.map((r: any) => r.title)).toEqual(['옛 작업']);
  expect(data.databases.projects.quick.sort).toBe('asc');
});

test('a number property can be added, filled and totalled', async ({ screen, browser }) => {
  await addProperty(screen, '예산', '숫자');
  await done(screen);
  await screen.getByLabel('브랜드 가이드 정리 예산').fill('1200');
  await screen.getByLabel('10월 회고 작성 예산').fill('300.5');
  await screen.getByLabel('예산 계산').selectOption('합계');
  const id = (await projects(browser)).properties.find((p: any) => p.name === '예산').id;
  await expect(screen.getByTestId(`total-${id}`)).toHaveText('1500.5');
  await screen.getByLabel('브랜드 가이드 정리 예산').fill('200');
  await expect(screen.getByTestId(`total-${id}`)).toHaveText('500.5');
  await screen.getByLabel('예산 계산').selectOption('평균');
  await expect(screen.getByTestId(`total-${id}`)).toHaveText('250.25');
  await browser.reload();
  await expect(screen.getByLabel('브랜드 가이드 정리 예산')).toHaveValue('200');
  await expect(screen.getByLabel('예산 계산')).toHaveValue('avg');
  await expect(screen.getByTestId(`total-${id}`)).toHaveText('250.25');
});

test('typing in a text cell keeps focus and saves every keystroke', async ({ screen, browser }) => {
  const cell = screen.getByLabel('브랜드 가이드 정리 담당자');
  await cell.fill('');
  await cell.pressSequentially('김민수');
  await expect(cell).toBeFocused();
  const db = await projects(browser);
  expect(db.rows.find((r: any) => r.title === '브랜드 가이드 정리').values.assignee).toBe('김민수');
});

test('a property can be renamed, hidden, moved and deleted', async ({ screen, browser }) => {
  await tool(screen, '속성').tap();
  await screen.getByLabel('담당자 속성 이름').fill('책임자');
  await screen.getByLabel('우선순위 속성 표시').tap();
  await screen.getByRole('button', '마감일 속성 위로').tap();
  await done(screen);
  await expect(screen.getByLabel('브랜드 가이드 정리 책임자')).toHaveValue('나');
  await expect(screen.getByLabel('브랜드 가이드 정리 우선순위')).toHaveCount(0);
  expect(await browser.evaluate(() => [...document.querySelectorAll('.db-table thead th')].map(el => el.textContent!.trim()))).toEqual(['Aa작업 이름', '상태', '마감일', '책임자']);
  await tool(screen, '속성').tap();
  await screen.getByRole('button', '책임자 속성 삭제', { exact: true }).tap();
  await screen.getByRole('button', '책임자 속성 삭제 확인').tap();
  await done(screen);
  await browser.reload();
  await expect(screen.getByLabel('브랜드 가이드 정리 책임자')).toHaveCount(0);
  await expect(screen.getByLabel('브랜드 가이드 정리 상태')).toBeVisible();
  const db = await projects(browser);
  expect(db.properties.map((p: any) => p.name)).toEqual(['상태', '우선순위', '마감일']);
  expect(Object.keys(db.rows[0].values)).not.toContain('assignee');
});

test('select options can be added, coloured, renamed and deleted', async ({ screen, browser }) => {
  await tool(screen, '속성').tap();
  await screen.getByLabel('상태 새 옵션').fill('보류');
  await screen.getByLabel('상태 새 옵션').press('Enter');
  await screen.getByLabel('상태 옵션 4 색상').selectOption('보라');
  await screen.getByLabel('상태 옵션 3 이름').fill('끝남');
  await done(screen);
  await expect(screen.getByLabel('워크스페이스 구조 잡기 상태')).toHaveValue('끝남');
  await screen.getByLabel('브랜드 가이드 정리 상태').selectOption('보류');
  await expect(screen.getByLabel('브랜드 가이드 정리 상태')).toHaveAttribute('class', 'cell-select purple');
  await tool(screen, '속성').tap();
  await screen.getByRole('button', '상태 옵션 4 삭제').tap();
  await done(screen);
  await expect(screen.getByLabel('브랜드 가이드 정리 상태')).toHaveValue('');
  const db = await projects(browser);
  expect(db.properties[0].options).toEqual(['시작 전', '진행 중', '끝남']);
  expect(db.rows.find((r: any) => r.title === '워크스페이스 구조 잡기').values.status).toBe('끝남');
});

test('a multi-select cell toggles options from its menu', async ({ screen, browser }) => {
  await addProperty(screen, '태그', '다중 선택');
  for (const name of ['디자인', '문서']) { await screen.getByLabel('태그 새 옵션').fill(name); await screen.getByRole('button', '태그 옵션 추가').tap(); }
  await done(screen);
  await screen.getByRole('button', '브랜드 가이드 정리 태그').tap();
  await screen.getByRole('menuitemcheckbox', '디자인').tap();
  await screen.getByRole('menuitemcheckbox', '문서').tap();
  await expect(screen.getByRole('menuitemcheckbox', '문서')).toHaveAttribute('aria-checked', 'true');
  await screen.getByRole('menuitemcheckbox', '디자인').tap();
  await browser.keyboard.press('Escape');
  await expect(screen.getByRole('button', '브랜드 가이드 정리 태그')).toHaveText('문서');
  await browser.reload();
  await expect(screen.getByRole('button', '브랜드 가이드 정리 태그')).toHaveText('문서');
});

test('checkbox and URL properties work in the table', async ({ screen, browser }) => {
  await addProperty(screen, '승인', '체크박스');
  await screen.getByRole('button', '속성 추가', { exact: true }).tap();
  await screen.getByLabel('속성 속성 이름').fill('링크');
  await screen.getByLabel('링크 속성 유형').selectOption('URL');
  await done(screen);
  await screen.getByLabel('브랜드 가이드 정리 승인').check();
  await screen.getByLabel('브랜드 가이드 정리 링크', { exact: true }).fill('https://example.com/guide');
  await screen.getByLabel('브랜드 가이드 정리 링크', { exact: true }).press('Enter');
  await expect(screen.getByRole('link', '브랜드 가이드 정리 링크 열기')).toHaveAttribute('href', 'https://example.com/guide');
  await browser.reload();
  await expect(screen.getByLabel('브랜드 가이드 정리 승인')).toBeChecked();
  await expect(screen.getByLabel('브랜드 가이드 정리 링크', { exact: true })).toHaveValue('https://example.com/guide');
});

test('changing a property type converts what it can', async ({ screen, browser }) => {
  await tool(screen, '속성').tap();
  await screen.getByLabel('담당자 속성 유형').selectOption('선택');
  await done(screen);
  await expect(screen.getByLabel('브랜드 가이드 정리 담당자')).toHaveValue('나');
  const db = await projects(browser);
  expect(db.properties.find((p: any) => p.id === 'assignee').options).toContain('나');
});

test('an advanced filter narrows every view and survives a reload', async ({ screen, browser }) => {
  await tool(screen, '필터').tap();
  await screen.getByRole('button', '필터 추가').tap();
  await screen.getByLabel('필터 1 속성').selectOption('우선순위');
  await screen.getByLabel('필터 1 값').selectOption('높음');
  await done(screen);
  const high = (await projects(browser)).rows.filter((r: any) => r.values.priority === '높음').map((r: any) => r.title);
  expect(high.length).toBeGreaterThan(0);
  expect(await names(browser)).toEqual(high);
  await expect(browser.locator('#database-count')).toContainText(`${high.length}개의 작업 · 전체 4개`);
  await browser.reload();
  expect(await names(browser)).toEqual(high);
  await tool(screen, '필터').tap();
  await screen.getByRole('button', '필터 1 삭제').tap();
  await done(screen);
  await expect(browser.locator('tbody tr[data-row]')).toHaveCount(4);
});

test('a title filter and a date filter combine', async ({ screen, browser }) => {
  await tool(screen, '필터').tap();
  await screen.getByRole('button', '필터 추가').tap();
  await screen.getByLabel('필터 1 값').fill('작성');
  await screen.getByRole('button', '필터 추가').tap();
  await screen.getByLabel('필터 2 속성').selectOption('마감일');
  await screen.getByLabel('필터 2 조건').selectOption('이후');
  await screen.getByLabel('필터 2 값').fill('2026-01-01');
  await done(screen);
  expect(await names(browser)).toEqual(['10월 회고 작성']);
  await tool(screen, '필터').tap();
  await screen.getByLabel('필터 2 값').fill('2030-01-01');
  await done(screen);
  await expect(screen.getByText('조건에 맞는 작업이 없습니다.', { exact: true })).toBeVisible();
});

test('sort rules order the rows and are saved per view', async ({ screen, browser }) => {
  await tool(screen, '정렬').tap();
  await screen.getByRole('button', '정렬 추가').tap();
  await screen.getByLabel('정렬 1 방향').selectOption('내림차순');
  await done(screen);
  const sorted = [...(await projects(browser)).rows.map((r: any) => r.title)].sort((a: string, b: string) => b.localeCompare(a, 'ko'));
  expect(await names(browser)).toEqual(sorted);
  await browser.reload();
  expect(await names(browser)).toEqual(sorted);
  await screen.getByRole('tab', '보드', { exact: true }).tap();
  await screen.getByRole('tab', '표', { exact: true }).tap();
  expect(await names(browser)).toEqual(sorted);
});

test('the table can be grouped by a select property', async ({ screen, browser }) => {
  await tool(screen, '보기 설정').tap();
  await screen.getByLabel('그룹화 속성').selectOption('우선순위');
  await done(screen);
  await expect(browser.locator('.group-row')).toHaveCount(3);
  await expect(browser.locator('.group-row').first()).toContainText('높음');
  await browser.reload();
  await expect(browser.locator('.group-row')).toHaveCount(3);
});

test('a list view can be added, renamed and deleted', async ({ screen, browser }) => {
  await addView(screen, '목록');
  await expect(screen.getByRole('tab', '목록', { exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(screen.getByRole('listitem')).toHaveCount(4);
  await tool(screen, '보기 설정').tap();
  await screen.getByLabel('보기 이름').fill('한눈에');
  await done(screen);
  await expect(screen.getByRole('tab', '한눈에', { exact: true })).toBeVisible();
  await browser.reload();
  await expect(screen.getByRole('tab', '한눈에', { exact: true })).toHaveAttribute('aria-selected', 'true');
  await tool(screen, '보기 설정').tap();
  await screen.getByRole('button', '보기 삭제').tap();
  await expect(screen.getByRole('tab', '한눈에', { exact: true })).toHaveCount(0);
  await expect(screen.getByRole('tab', '표', { exact: true })).toHaveAttribute('aria-selected', 'true');
  expect((await projects(browser)).views.map((v: any) => v.name)).toEqual(['표', '보드']);
});

test('the calendar view places rows on their dates', async ({ screen, browser }) => {
  await addView(screen, '캘린더');
  const now = new Date();
  await expect(browser.locator('#calendar-month')).toHaveText(`${now.getFullYear()}년 ${now.getMonth() + 1}월`);
  await screen.getByRole('button', `${now.getMonth() + 1}월 15일 작업 추가`).tap();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
  await expect(screen.getByLabel('작업 마감일')).toHaveValue(iso);
  await screen.getByLabel('작업 이름').fill('캘린더에서 만든 작업');
  await screen.getByRole('button', '작업 저장', { exact: true }).tap();
  await expect(screen.getByRole('gridcell', `${now.getMonth() + 1}월 15일`, { exact: true })).toContainText('캘린더에서 만든 작업');
  await screen.getByRole('button', '다음 달').tap();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  await expect(browser.locator('#calendar-month')).toHaveText(`${next.getFullYear()}년 ${next.getMonth() + 1}월`);
  await expect(screen.getByRole('button', '작업 열기: 캘린더에서 만든 작업')).toHaveCount(0);
  await screen.getByRole('button', '오늘', { exact: true }).tap();
  await expect(screen.getByRole('button', '작업 열기: 캘린더에서 만든 작업')).toBeVisible();
});

test('a new row dated in another month moves the calendar there', async ({ screen, browser }) => {
  await addView(screen, '캘린더');
  await screen.getByRole('button', '새 작업', { exact: true }).tap();
  await screen.getByLabel('작업 이름').fill('먼 미래 작업');
  await screen.getByLabel('작업 마감일').fill('2031-05-09');
  await screen.getByRole('button', '작업 저장', { exact: true }).tap();
  await expect(browser.locator('#calendar-month')).toHaveText('2031년 5월');
  await expect(screen.getByRole('gridcell', '5월 9일', { exact: true })).toContainText('먼 미래 작업');
});

test('the gallery view shows a card per row with a body preview', async ({ screen, browser }) => {
  await addView(screen, '갤러리');
  await expect(browser.locator('.gallery-card:not(.gallery-new)')).toHaveCount(4);
  const first = (await projects(browser)).rows.find((r: any) => r.blocks.length);
  await expect(screen.getByRole('button', `작업 열기: ${first.title}`)).toContainText(first.blocks[0].text.slice(0, 20));
});

test('the board can group by another property and add into a column', async ({ screen, browser }) => {
  await screen.getByRole('tab', '보드', { exact: true }).tap();
  await tool(screen, '보기 설정').tap();
  await screen.getByLabel('그룹화 속성').selectOption('우선순위');
  await done(screen);
  await expect(screen.getByRole('region', '높음', { exact: true })).toContainText('브랜드 가이드 정리');
  await screen.getByRole('button', '낮음 작업 추가').tap();
  await expect(screen.getByLabel('작업 우선순위')).toHaveValue('낮음');
  await screen.getByLabel('작업 이름').fill('낮은 우선순위 작업');
  await screen.getByRole('button', '작업 저장', { exact: true }).tap();
  await expect(screen.getByRole('region', '낮음', { exact: true })).toContainText('낮은 우선순위 작업');
});

test('a row opens as a page with editable properties and blocks', async ({ screen, browser }) => {
  await screen.getByRole('button', '페이지 열기: 프로젝트', { exact: true }).tap();
  await screen.getByRole('button', '작업 열기: 브랜드 가이드 정리').tap();
  await screen.getByRole('button', '페이지로 열기').tap();
  await expect(screen.getByLabel('작업 제목')).toHaveValue('브랜드 가이드 정리');
  await screen.getByLabel('작업 제목').fill('브랜드 가이드 2판');
  await screen.getByLabel('브랜드 가이드 2판 상태').selectOption('완료');
  const count = (await projects(browser)).rows[0].blocks.length;
  const last = screen.getByLabel(`블록 ${count} 내용`);
  await last.focus(); await browser.keyboard.press('Control+End');
  await browser.keyboard.press('Enter');
  await browser.keyboard.type('# 다음 단계');
  await browser.keyboard.press('Enter');
  await browser.keyboard.type('검수 일정 잡기');
  await expect(screen.getByLabel(`블록 ${count + 1} 내용`)).toHaveText('다음 단계');
  await browser.keyboard.press('Control+z');
  await screen.getByRole('button', '데이터베이스로 돌아가기').tap();
  await expect(screen.getByLabel('브랜드 가이드 2판 상태')).toHaveValue('완료');
  await browser.reload();
  const row = (await projects(browser)).rows.find((r: any) => r.title === '브랜드 가이드 2판');
  expect(row.values.status).toBe('완료');
  expect(row.blocks.map((b: any) => b.text)).toContain('다음 단계');
  expect(row.blocks.find((b: any) => b.text === '다음 단계').type).toBe('h1');
});

test('the row menu moves, duplicates and deletes rows', async ({ screen, browser }) => {
  const before = await names(browser);
  await screen.getByRole('button', `${before[0]} 순서 이동`).tap();
  await screen.getByRole('menuitem', '아래로 이동').tap();
  expect(await names(browser)).toEqual([before[1], before[0], before[2], before[3]]);
  await screen.getByRole('button', `${before[0]} 순서 이동`).tap();
  await screen.getByRole('menuitem', '복제').tap();
  await expect(browser.locator('tbody tr[data-row]')).toHaveCount(5);
  await screen.getByRole('button', `${before[3]} 순서 이동`).tap();
  await screen.getByRole('menuitem', '삭제').tap();
  await expect(screen.getByRole('button', `작업 열기: ${before[3]}`)).toHaveCount(0);
  await browser.reload();
  const after = await names(browser);
  expect(after.length).toBe(4);
  expect(after.slice(0, 2)).toEqual([before[1], before[0]]);
});

test('workspace search finds rows and opens them as pages', async ({ screen, browser }) => {
  await screen.getByRole('button', '검색', { exact: true }).tap();
  await screen.getByRole('searchbox', '워크스페이스 검색').fill('회고');
  await screen.getByRole('button', '검색 결과: 10월 회고 작성 (프로젝트)').tap();
  await expect(screen.getByLabel('작업 제목')).toHaveValue('10월 회고 작성');
  await expect(browser.locator('#row-crumb')).toHaveText('10월 회고 작성');
});

test('a new database can be added under a page and used', async ({ screen, browser }) => {
  await screen.getByRole('button', '페이지 열기: 아이디어 노트', { exact: true }).tap();
  await screen.getByRole('button', '데이터베이스 추가').tap();
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('새 데이터베이스');
  await screen.getByLabel('페이지 제목').fill('독서 목록');
  await expect(screen.getByRole('table', '독서 목록 데이터베이스')).toBeVisible();
  await screen.getByRole('button', '새 항목', { exact: true }).tap();
  await screen.getByLabel('항목 이름').fill('데미안');
  await screen.getByRole('button', '항목 저장', { exact: true }).tap();
  await tool(screen, '속성').tap();
  await screen.getByLabel('항목 호칭').fill('책');
  await done(screen);
  await expect(screen.getByRole('button', '책 열기: 데미안')).toBeVisible();
  await expect(screen.getByRole('button', '새 책', { exact: true })).toBeVisible();
  await browser.reload();
  await expect(screen.getByRole('button', '책 열기: 데미안')).toBeVisible();
  const data = await stored(browser);
  const page = data.pages.find((p: any) => p.title === '독서 목록');
  expect(page.type).toBe('database');
  expect(data.pages.find((p: any) => p.id === page.parentId).title).toBe('아이디어 노트');
  expect(data.databases[page.id].rows[0].title).toBe('데미안');
});

test('the slash menu creates a database subpage', async ({ screen, browser }) => {
  await screen.getByRole('button', '새 페이지', { exact: true }).tap();
  await screen.getByLabel('페이지 제목').fill('기획');
  await screen.getByLabel('블록 1 내용').pressSequentially('/데이터베이스');
  await browser.keyboard.press('Enter');
  await expect(screen.getByLabel('페이지 제목')).toHaveValue('새 데이터베이스');
  const data = await stored(browser);
  const parent = data.pages.find((p: any) => p.title === '기획');
  expect(parent.blocks[0].text).toBe('');
  expect(data.pages.find((p: any) => p.title === '새 데이터베이스').parentId).toBe(parent.id);
});

test('a backup carries properties, views and rows', async ({ screen, browser }) => {
  await addProperty(screen, '예산', '숫자');
  await done(screen);
  await screen.getByLabel('브랜드 가이드 정리 예산').fill('77');
  await addView(screen, '갤러리');
  await screen.getByRole('button', '설정', { exact: true }).tap();
  const file = await browser.waitForDownload(() => screen.getByRole('button', '워크스페이스 내보내기').tap());
  const data = JSON.parse(await readFile(file.absolutePath, 'utf8'));
  data.settings.name = '복원본';
  const dir = await mkdtemp(join(tmpdir(), 'folio-e2e-')); const path = join(dir, 'backup.json'); await writeFile(path, JSON.stringify(data));
  await browser.evaluate(() => { localStorage.clear(); });
  await browser.reload();
  await expect(screen.getByLabel('브랜드 가이드 정리 예산')).toHaveCount(0);
  await screen.getByRole('button', '설정', { exact: true }).tap();
  await screen.getByLabel('백업 파일 선택').setInputFiles(path);
  await screen.getByRole('button', '백업으로 교체').tap();
  await expect(screen.getByTestId('workspace-name')).toHaveText('복원본');
  await expect(screen.getByRole('tab', '갤러리', { exact: true })).toHaveAttribute('aria-selected', 'true');
  await screen.getByRole('tab', '표', { exact: true }).tap();
  await expect(screen.getByLabel('브랜드 가이드 정리 예산')).toHaveValue('77');
});

test('a backup with a broken database is refused', async ({ screen, browser }) => {
  await screen.getByRole('button', '설정', { exact: true }).tap();
  const file = await browser.waitForDownload(() => screen.getByRole('button', '워크스페이스 내보내기').tap());
  const data = JSON.parse(await readFile(file.absolutePath, 'utf8'));
  data.databases.projects.rows[0].values.status = '없는 상태';
  const dir = await mkdtemp(join(tmpdir(), 'folio-e2e-')); const path = join(dir, 'backup.json'); await writeFile(path, JSON.stringify(data));
  await screen.getByLabel('백업 파일 선택').setInputFiles(path);
  await expect(screen.getByRole('button', '백업으로 교체')).toBeHidden();
});

test('the calendar view fits a phone without sideways page scroll', async ({ screen, browser }) => {
  await browser.setViewport({ width: 390, height: 800 });
  await addView(screen, '캘린더');
  await expect(browser.locator('#calendar-month')).toBeVisible();
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
