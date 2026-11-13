import { sidebarHTML, sidebarSettings } from './sidebar-view.js';
import * as sync from './sync.js';
import { legacyData, moveLegacy } from './legacy.js';
import { databaseHTML as renderDatabaseHTML, databaseResults, countText, totalText, rowFormHTML, rowPropsHTML, filterPanelHTML, sortPanelHTML, propsPanelHTML, viewPanelHTML, josa, rowName } from './database-view.js';
import { limits, propertyTypes, viewTypes, optionColors, propOf, operators, activeView, quickFilterProp, groupProp, dateProp, cleanValue, valueOf, rowText, makeRow, addView, makeDatabase, visibleRows, isSorted, calcsFor, total, shiftMonth, changeType, repair, renameOption } from './database-model.js';
import { icon } from './icons.js';
import { session, logout } from './session.js';
import { HOLD, MAX_TEXT, listTypes, staticTypes, markdownShortcut, indentOf, numbering, hiddenBlocks, subtreeEnd, shiftIndent, slashMatches, readText, selectionOffsets, setSelection, caretOnEdge } from './blocks.js';
import * as history from './history.js';
import { colors, safeHref, normalizeMarks, toggleMark, covers, marksAt, marksIn, sliceMarks, shiftMarks, spliceMarks, renderInline, readInline, nodeMarks, inlineShortcut } from './richtext.js';
import { block, uid, blockTypes, createPage, duplicatePage, trashPage, restorePage, descendants, movePage, validateWorkspace, pageMarkdown, covers as pageCovers, TEMPLATE_LIMIT, copyBlocks, purgePages } from './store.js';
import { MAX_IMPORT_SIZE, markdownToPage, parseCSV, csvToDatabase, databaseCSV, pageHTML as exportHTML } from './import-export.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
// The workspace arrives with the page; see sync.js.
const started = sync.start();
let state = started.state;
// How saving is going: 'saved', 'saving' or 'error'.
let saveKind = started.error ? 'error' : 'saved';
const KEEP = 30;
// A message to show after the page is loaded again.
const NOTICE_KEY = 'folio.notice';
const savedSidebar = sidebarSettings(state);
const thisMonth = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; };
// `row` is `{ db, id }` while a database row is open as a page; `query` and `month` belong to the database on screen.
// `confirm` names the delete button that was pressed once and now asks to be pressed again.
const ui = { sidebar: false, collapsed: savedSidebar.collapsed, sidebarPrefs: savedSidebar, searchScope: 'all', searchSort: 'recent', searchQuery: '', draggedPage: null, query: '', row: null, month: thisMonth(), panel: null, confirmProp: null, staleCells: false, menu: null, blockMenu: null, modal: null, expanded: new Set(savedSidebar.expanded), lastFocus: null, pendingImport: null, draggedRow: null, draggedBlock: null, confirm: null, linking: null, trashQuery: '', dirty: new Set(), snapAt: new Map() };
const current = () => state.pages.find(p => p.id === state.activeId && !p.deleted) || state.pages.find(p => !p.deleted);
const dbPage = id => state.pages.find(p => p.id === id);
// The home page shows the project tracker (or, without one, the first database).
function homeDbId() { const live = state.pages.filter(p => p.type === 'database' && !p.deleted); return (live.find(p => p.id === 'projects') || live[0])?.id || null; }
const shownDbId = () => current().type === 'database' ? current().id : current().type === 'home' ? homeDbId() : null;
const shownDb = () => state.databases[shownDbId()] || null;
const openRow = () => ui.row && current().id === ui.row.db ? state.databases[ui.row.db]?.rows.find(r => r.id === ui.row.id) || null : null;
const activeDb = () => openRow() ? state.databases[ui.row.db] : shownDb();
// What the block editor edits: the open row, or else the current page.
const doc = () => openRow() || current();
const pageName = page => page.title.trim() || '제목 없음';
const formatDate = value => value ? `${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일` : '날짜 없음';
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `visible${error ? ' error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = '', 3300);
}
// Pages edited since their last saved version. A version is saved when the page is left
// and after every ten minutes of editing.
const SNAP_EVERY = 600_000;
// The version holds the page as it is right now; the server answers later. Returns that answer.
function keepVersion(page, manual = false, leaving = false) {
  ui.dirty.delete(page.id); ui.snapAt.set(page.id, Date.now());
  const done = sync.saveVersion(page.id, { title: page.title, blocks: page.blocks }, leaving).catch(() => ({ saved: false, same: false }));
  if (manual) done.then(result => toast(result.saved ? '현재 버전을 저장했습니다.' : result.same ? '마지막 버전과 내용이 같습니다.' : '페이지 기록을 저장하지 못했습니다.', !result.saved && !result.same));
  return done;
}
// `leaving` is set while the page is being closed.
function flushVersions(leaving = false) {
  for (const id of [...ui.dirty]) { const page = state.pages.find(p => p.id === id && !p.deleted); if (page) keepVersion(page, false, leaving === true); else ui.dirty.delete(id); }
}
function trackEdit() {
  const page = current(); if (openRow() || page.type === 'database') return;
  ui.dirty.add(page.id);
  if (!ui.snapAt.has(page.id)) ui.snapAt.set(page.id, Date.now());
  else if (Date.now() - ui.snapAt.get(page.id) >= SNAP_EVERY) keepVersion(page);
}
function persist(touch = true) {
  if (touch) { current().updatedAt = new Date().toISOString(); trackEdit(); }
  if (sync.save(state)) return true;
  showSaveState('error'); return false;
}
const saveStateHTML = () => saveKind === 'error' ? `<span class="save-error">${esc(sync.failureText() || '저장 안 됨')}</span>` : saveKind === 'saving' ? '<span>저장 중…</span>' : `${icon('check')}<span>저장됨</span>`;
// Called by sync.js whenever saving starts, succeeds or fails. `message` explains a refusal.
function showSaveState(kind, message = '') {
  saveKind = kind;
  if ($('#save-state')) $('#save-state').innerHTML = saveStateHTML();
  if ($('#database-save-state')) $('#database-save-state').textContent = kind === 'error' ? sync.failureText() || '저장 안 됨' : kind === 'saving' ? '저장 중…' : '모든 변경 사항 저장됨';
  if (kind === 'saved') persist.warned = false;
  else if (kind === 'error' && !persist.warned) { persist.warned = true; toast(message || '서버에 저장하지 못했습니다. 연결되면 다시 저장합니다. 중요한 내용은 설정에서 백업을 내보내 주세요.', true); }
}
// The address shows the open page (and row), so links can be shared and Back works.
function addressOf() { const row = openRow(); return `/p/${current().id}${row ? `?row=${encodeURIComponent(row.id)}` : ''}`; }
function syncAddress() {
  const address = addressOf(); if (location.pathname + location.search === address) { syncAddress.ready = true; return; }
  if (syncAddress.ready) window.history.pushState(null, '', address); else window.history.replaceState(null, '', address);
  syncAddress.ready = true;
}
// Opens what the address names. Returns false when that page does not exist (any more).
function openAddress() {
  const id = location.pathname.match(/^\/p\/([^/]+)$/)?.[1]; if (!id) return true;
  const page = state.pages.find(p => p.id === id && !p.deleted); if (!page) return false;
  const rowId = new URLSearchParams(location.search).get('row');
  state.activeId = page.id; ui.row = rowId && state.databases[page.id]?.rows.some(r => r.id === rowId) ? { db: page.id, id: rowId } : null;
  return true;
}
function saveSidebar() {
  ui.sidebarPrefs.collapsed = ui.collapsed;
  ui.sidebarPrefs.expanded = [...ui.expanded];
  state.settings.sidebar = structuredClone(ui.sidebarPrefs);
  persist(false);
}
function rememberPage(id) {
  ui.sidebarPrefs.recents = [id, ...ui.sidebarPrefs.recents.filter(item => item !== id)].slice(0, 20);
}
function go(id) { flushVersions(); state.activeId = id; rememberPage(id); ui.sidebar = false; ui.menu = null; ui.blockMenu = null; ui.row = null; ui.query = ''; saveSidebar(); render(); $('.main-scroll').scrollTop = 0; }
// `setup` runs on the new page before it is saved, for pages that need more than blocks.
function addPage(options = {}, setup = null) { if (state.pages.length >= 1000) { toast('페이지는 최대 1,000개까지 만들 수 있습니다.', true); return false; } flushVersions(); const page = createPage(state, options); setup?.(page); linkChild(page); if (page.parentId) ui.expanded.add(page.parentId); ui.sidebarPrefs.closed.pages = false; ui.row = null; ui.query = ''; rememberPage(page.id); persist(); saveSidebar(); ui.sidebar = false; closeModal(false); render(); $('#page-title').focus(); $('#page-title').select(); return true; }
function sidebar() { return sidebarHTML(state, ui); }
function breadcrumb(page) {
  const chain = []; let cursor = page; const seen = new Set();
  while (cursor && !seen.has(cursor.id)) { seen.add(cursor.id); chain.unshift(cursor); cursor = state.pages.find(p => p.id === cursor.parentId); }
  return chain.map((p, i) => `${i ? '<span class="crumb-sep">/</span>' : ''}<button data-action="open" data-id="${esc(p.id)}" class="crumb">${icon(p.icon)}<span data-page-name="${esc(p.id)}">${esc(pageName(p))}</span></button>`).join('');
}
const livePage = id => state.pages.find(p => p.id === id && !p.deleted);
// The title of a linked page, or null when the page is gone.
const titleOf = id => { const page = livePage(id); return page ? pageName(page) : null; };
function tocHTML(blocks) {
  const heads = blocks.filter(b => /^h[123]$/.test(b.type) && b.text.trim());
  return heads.map(b => `<button class="toc-item toc-${b.type}" data-action="toc-jump" data-id="${esc(b.id)}">${esc(b.text)}</button>`).join('') || '<p class="toc-empty">제목 블록을 추가하면 목차가 만들어집니다.</p>';
}
function refreshToc() { for (const el of $$('[data-toc]')) el.innerHTML = tocHTML(doc().blocks); }
// Blocks without text of their own: divider, table of contents, image and page link.
function staticHTML(b, context) {
  if (b.type === 'divider') return '<hr>';
  if (b.type === 'image') return `<figure class="image-block"><img src="/api/files/${esc(b.file)}" alt="${esc(b.text || '이미지')}"></figure>`;
  if (b.type === 'toc') return `<nav class="toc" aria-label="목차" data-toc>${tocHTML(context.blocks)}</nav>`;
  const target = livePage(b.target);
  return target ? `<button class="page-link-block" data-action="open" data-id="${esc(target.id)}" aria-label="페이지 링크: ${esc(pageName(target))}">${icon(target.icon)}<span>${esc(pageName(target))}</span>${icon('arrow')}</button>` : `<span class="page-link-block missing">${icon('file')}<span>삭제된 페이지</span></span>`;
}
const linksTo = (blocks, id) => blocks.some(b => b.type === 'page' && b.target === id);
// As in Notion, a page made inside another one shows up in the body of its parent.
function linkChild(page) {
  const parent = livePage(page.parentId); if (!parent || parent.type === 'database' || linksTo(parent.blocks, page.id)) return;
  const last = parent.blocks.at(-1); const link = { ...block('page'), target: page.id };
  parent.blocks.splice(last?.type === 'text' && !last.text ? parent.blocks.length - 1 : parent.blocks.length, 0, link);
}
function unlinkChild(page, parentId = page.parentId) {
  const parent = state.pages.find(p => p.id === parentId); if (!parent) return;
  const rest = list => list.filter(b => !(b.type === 'page' && b.target === page.id));
  parent.blocks = rest(parent.blocks); if (!parent.blocks.length && parent.type !== 'database') parent.blocks.push(block());
  for (const row of state.databases[parent.id]?.rows || []) row.blocks = rest(row.blocks);
}
function trash(id) { const page = state.pages.find(p => p.id === id); if (page) unlinkChild(page); trashPage(state, id); }
function restore(id) { restorePage(state, id); linkChild(state.pages.find(p => p.id === id)); }
function reparent(id, parentId = null, beforeId = null) {
  const page = state.pages.find(p => p.id === id); const old = page?.parentId ?? null;
  movePage(state, id, parentId, beforeId);
  if (page.parentId !== old) { unlinkChild(page, old); linkChild(page); }
}
// The block of a page that lives inside this one stands for the page: taking the block away
// moves the page to the trash, and bringing it back (undo) restores the page.
const linkedPages = () => new Set(doc().blocks.filter(b => b.type === 'page').map(b => b.target));
function settleChildren(before) {
  const now = linkedPages(); const owner = current().id;
  for (const id of before) if (!now.has(id) && livePage(id)?.parentId === owner) { trashPage(state, id); toast('페이지를 휴지통으로 옮겼습니다.'); }
  for (const id of now) { const page = state.pages.find(p => p.id === id); if (!before.has(id) && page?.deleted && page.parentId === owner) restorePage(state, id); }
}
// Pages and database rows that hold a link to the page.
function backlinksHTML(pageId) {
  const items = [];
  for (const p of state.pages) {
    if (p.deleted || p.id === pageId) continue;
    if (linksTo(p.blocks, pageId)) items.push(`<button data-action="open" data-id="${esc(p.id)}" aria-label="백링크: ${esc(pageName(p))}">${icon(p.icon)}<span>${esc(pageName(p))}</span></button>`);
    for (const row of state.databases[p.id]?.rows || []) if (linksTo(row.blocks, pageId)) items.push(`<button data-action="search-open-row" data-db="${esc(p.id)}" data-id="${esc(row.id)}" aria-label="백링크: ${esc(rowName(row))} (${esc(pageName(p))})">${icon('file')}<span>${esc(rowName(row))}</span><small>${esc(pageName(p))}</small></button>`);
  }
  return items.length ? `<nav class="backlinks" aria-label="백링크"><h2>${icon('arrow')}이 페이지를 링크한 곳 ${items.length}개</h2>${items.join('')}</nav>` : '';
}
const hasCover = page => !!page.cover || page.type === 'home';
function coverHTML(page) {
  if (page.cover) return `<div class="cover page-cover cover-${page.cover}" data-testid="page-cover" data-cover="${page.cover}"></div>`;
  return page.type === 'home' ? '<div class="cover"><img src="/cover.svg" alt="햇살과 올리브 나무가 있는 추상 풍경"><span>ROOM FOR YOUR NEXT BIG IDEA.</span><span class="cover-label">YOUR PERSONAL SPACE</span></div>' : '<div class="page-spacer"></div>';
}
const placeholders = { h1: '제목 1', h2: '제목 2', h3: '제목 3', code: '코드를 입력하세요', toggle: '토글' };
// A trailing line break needs a <br> so the browser gives the last empty line a box.
const inlineHTML = (b, hold = null) => `${renderInline(b.text, b.type === 'code' ? [] : b.marks, esc, hold)}${b.text.endsWith('\n') ? '<br>' : ''}`;
function blockHTML(b, i, context) {
  const num = i + 1; const open = b.open !== false;
  return `<div class="block-row block-${b.type}" data-testid="block-${num}" data-type="${b.type}" data-block-id="${esc(b.id)}" data-indent="${indentOf(b)}" style="--indent:${indentOf(b)}" ${context.hidden.has(b.id) ? 'hidden' : ''} draggable="false">
    <div class="block-tools"><button class="block-tool" data-action="add-block" data-id="${esc(b.id)}" aria-label="블록 ${num} 아래 추가">${icon('plus')}</button><button class="block-tool" data-action="block-menu" data-id="${esc(b.id)}" aria-label="블록 ${num} 메뉴" draggable="true" data-drag-block="${esc(b.id)}">${icon('grip')}</button></div>
    ${b.type === 'todo' ? `<input class="todo-check" type="checkbox" data-check="${esc(b.id)}" aria-label="할 일 ${num} 완료" ${b.checked ? 'checked' : ''}>` : ''}
    ${b.type === 'bullet' ? '<span class="bullet-dot">•</span>' : ''}${b.type === 'callout' ? `<span class="callout-icon">${icon('bulb')}</span>` : ''}
    ${b.type === 'numbered' ? `<span class="number-marker" data-testid="block-${num}-number">${context.numbers[i]}.</span>` : ''}${b.type === 'toggle' ? `<button class="toggle-arrow ${open ? 'open' : ''}" data-action="toggle-open" data-id="${esc(b.id)}" aria-label="토글 ${num} ${open ? '접기' : '펼치기'}" aria-expanded="${open}">${icon('chevron')}</button>` : ''}
    ${staticTypes.includes(b.type) ? staticHTML(b, context) : `<div class="block-input ${b.checked ? 'checked' : ''}" contenteditable="true" role="textbox" aria-multiline="true" maxlength="${MAX_TEXT}" aria-label="블록 ${num} 내용" data-edit-block="${esc(b.id)}" data-placeholder="${placeholders[b.type] || '내용을 입력하거나 / 로 블록 추가'}" spellcheck="false">${inlineHTML(b)}</div>`}
  </div>`;
}
function editor(page) {
  const context = { numbers: numbering(page.blocks), hidden: hiddenBlocks(page.blocks), blocks: page.blocks };
  return `<div class="editor" aria-label="페이지 편집기">${page.blocks.map((b, i) => blockHTML(b, i, context)).join('')}</div><button class="add-block-line" data-action="append-block">${icon('plus')}블록 추가<span>/ 를 눌러 더 많은 옵션 보기</span></button>`;
}
function quickLinks() {
  return `<div class="quick-links"><button data-action="open" data-id="wiki" class="quick-card"><span class="card-icon sage">${icon('book')}</span><span><strong>팀 위키</strong><small>함께 쌓아가는 지식</small></span>${icon('arrow')}</button><button data-action="open" data-id="ideas" class="quick-card"><span class="card-icon peach">${icon('bulb')}</span><span><strong>아이디어 노트</strong><small>떠오르는 생각을 놓치지 않도록</small></span>${icon('arrow')}</button></div>`;
}
function render() {
  const page = current(); state.activeId = page.id; const row = openRow(); if (!row) ui.row = null;
  const db = row && state.databases[page.id]; const shown = row ? null : shownDbId();
  document.documentElement.style.setProperty('--sidebar-width', `${ui.sidebarPrefs.width}px`);
  document.documentElement.dataset.theme = state.settings.theme;
  document.title = `${row ? rowName(row) : pageName(page)} — Folio`;
  const footer = `<footer class="page-footer"><span class="footer-logo">f.</span><span>조금 더 정리된 생각, 조금 더 가벼운 하루.</span><span class="footer-shortcut">${icon('shield')}자동 저장</span></footer>`;
  const content = row ? `<div class="page-spacer"></div><article class="page-content row-page"><button class="row-back" data-action="close-row" aria-label="데이터베이스로 돌아가기">${icon('arrow')}<span>${esc(pageName(page))}</span></button><div class="page-icon">${icon('file')}</div><div class="page-title-line"><input id="row-title" aria-label="${esc(db.itemName)} 제목" value="${esc(row.title)}" maxlength="500" placeholder="제목 없음" spellcheck="false"></div><div id="row-props" class="row-props" role="group" aria-label="${esc(db.itemName)} 속성">${rowPropsHTML(db, row)}</div>
    ${editor(row)}<div class="document-bottom"><button class="button danger" data-action="delete-row" data-id="${esc(row.id)}">${icon('trash')}${esc(db.itemName)} 삭제</button><span>${esc(pageName(page))}의 ${esc(db.itemName)}</span></div>${footer}</article>`
    : `${coverHTML(page)}
    <article class="page-content${hasCover(page) ? ' with-cover' : ''}${page.fullWidth ? ' full-width' : ''}${page.smallText ? ' small-text' : ''}"><button class="page-icon ${hasCover(page) ? 'home-page-icon' : ''}" data-action="icon-picker" aria-label="페이지 아이콘 변경" aria-haspopup="true">${icon(page.icon)}</button><div class="page-title-line"><input id="page-title" aria-label="페이지 제목" value="${esc(page.title)}" maxlength="500" placeholder="제목 없음" spellcheck="false"></div><div class="page-meta"><span>${icon('clock')}나만의 속도로, 매일 조금씩</span><span class="meta-dot">·</span><span>개인 페이지</span><button class="meta-button" data-action="cover-picker" aria-haspopup="true">${icon('sparkles')}${page.cover ? '커버 변경' : '커버 추가'}</button></div>
    ${page.type !== 'database' ? editor(page) : ''}${page.type === 'home' ? quickLinks() : ''}${shown ? `<section id="database" class="database" aria-label="${esc(pageName(dbPage(shown)))} 관리"></section>` : ''}
    ${backlinksHTML(page.id)}${page.type === 'document' ? `<div class="document-bottom"><span class="document-buttons"><button class="button" data-action="subpage" data-id="${esc(page.id)}">${icon('plus')}하위 페이지 추가</button><button class="button" data-action="new-database" data-id="${esc(page.id)}">${icon('table')}데이터베이스 추가</button></span><span>기록은 생각을 선명하게 만듭니다.</span></div>` : ''}${footer}</article>`;
  $('#app').innerHTML = `${sidebar()}${ui.sidebar ? '<div class="mobile-scrim" data-action="close-sidebar"></div>' : ''}<main class="main-shell ${ui.collapsed ? 'expanded-main' : ''}">
    <header class="topbar"><div class="topbar-left"><button class="icon-button sidebar-open" data-action="open-sidebar" aria-label="사이드바 열기">${icon('menu')}</button><div class="breadcrumbs">${breadcrumb(page)}${row ? `<span class="crumb-sep">/</span><span class="crumb crumb-current">${icon('file')}<span id="row-crumb">${esc(rowName(row))}</span></span>` : ''}</div></div><div class="topbar-right"><span id="save-state" class="save-state">${saveStateHTML()}</span>${row ? '' : `<button class="icon-button favorite-toggle ${page.favorite ? 'is-favorite' : ''}" data-action="favorite" aria-label="${page.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${icon('star')}</button>`}<button class="button export-button" data-action="export-page">${icon('download')}내보내기</button>${row ? '' : `<button class="icon-button" data-action="page-menu" aria-label="페이지 더보기">${icon('more')}</button>`}</div></header>
    <div class="main-scroll">${content}</div></main>`;
  renderDatabase(); if (ui.menu) renderPageMenu(); if (ui.blockMenu) renderBlockMenu(ui.blockMenu);
  syncAddress();
}
const dbContext = () => ({ query: ui.query, month: ui.month, saved: saveKind !== 'error', heading: shownDbId() === 'projects' });
const pageRef = id => ({ id, title: pageName(dbPage(id)) });
const focusKey = key => $$('[data-focus]').find(el => el.dataset.focus === key);
// Redrawing replaces the controls inside `root`; focus returns to the control with the same `data-focus` key.
function keepFocus(root, redraw) {
  const active = document.activeElement; const key = root.contains(active) ? active.dataset.focus : null;
  const caret = key && active.matches('input:not([type])') ? [active.selectionStart, active.selectionEnd] : null;
  redraw();
  const next = key && $$('[data-focus]', root).find(el => el.dataset.focus === key); if (!next) return;
  next.focus(); if (caret) next.setSelectionRange(...caret);
}
function renderDatabase() {
  const id = shownDbId(); const db = state.databases[id]; const el = $('#database'); if (!el || !db) return;
  keepFocus(el, () => { el.innerHTML = renderDatabaseHTML(db, pageRef(id), dbContext()); });
}
// Redraws the rows only (or the properties of the open row), leaving the toolbar and its search box alone.
function refreshDatabaseResults() {
  ui.staleCells = false;
  const row = openRow();
  if (row) { const el = $('#row-props'); keepFocus(el, () => { el.innerHTML = rowPropsHTML(state.databases[ui.row.db], row); }); return; }
  const id = shownDbId(); const db = state.databases[id]; const el = $('#database-results'); if (!el || !db) return;
  keepFocus(el, () => { el.innerHTML = databaseResults(db, pageRef(id), dbContext()); });
  refreshDatabaseSummary();
  const clear = $('[data-action="clear-db-search"]'); if (clear) clear.hidden = !ui.query;
}
function refreshDatabaseSummary() {
  const db = shownDb(); if (!db) return;
  if ($('#database-count')) $('#database-count').textContent = countText(db, ui.query);
  if ($('.database-total')) $('.database-total').textContent = totalText(db);
  if ($('#database-save-state')) $('#database-save-state').textContent = saveKind === 'error' ? sync.failureText() || '저장 안 됨' : saveKind === 'saving' ? '저장 중…' : '모든 변경 사항 저장됨';
}
// While a cell is being typed in, only the numbers under the table follow along.
function refreshTotals() {
  const db = shownDb(); if (!db || openRow()) return;
  const view = activeView(db); const rows = visibleRows(db, view, ui.query);
  for (const p of db.properties) { const out = $(`[data-testid="total-${p.id}"]`); if (out) out.textContent = total(p, rows, view.totals[p.id]); }
  refreshDatabaseSummary();
}
function cellTarget(el) {
  const db = activeDb(); const row = db?.rows.find(r => r.id === el.dataset.id); const prop = db?.properties.find(p => p.id === el.dataset.cell);
  return row && prop ? { db, row, prop } : null;
}
// Labels start with the name of the thing they belong to; a rename updates them without a redraw.
function relabel(root, from, to) {
  for (const el of $$('[aria-label]', root)) { const label = el.getAttribute('aria-label'); if (label.startsWith(`${from} `)) el.setAttribute('aria-label', `${to} ${label.slice(from.length + 1)}`); }
}
function popMenu(html, anchor, label = '') {
  removePopovers(); const el = document.createElement('div'); el.className = 'popover page-menu'; el.setAttribute('role', 'menu'); if (label) el.setAttribute('aria-label', label);
  el.innerHTML = html; document.body.append(el); positionMenu(el, anchor); $('button', el)?.focus(); return el;
}
function optionMenu(anchor) {
  const t = cellTarget(anchor); if (!t) return; const value = valueOf(t.row, t.prop);
  popMenu(`<div class="menu-caption">${esc(t.prop.name)}</div>${t.prop.options.map(o => `<button role="menuitemcheckbox" aria-checked="${value.includes(o)}" data-action="toggle-option" data-id="${esc(t.row.id)}" data-cell="${esc(t.prop.id)}" data-value="${esc(o)}"><span class="badge ${t.prop.colors?.[o] || 'neutral'}"><i></i>${esc(o)}</span><span class="option-check">${icon('check')}</span></button>`).join('') || '<p class="menu-empty">속성 편집에서 옵션을 추가하세요.</p>'}`, anchor, `${rowName(t.row)} ${t.prop.name}`).classList.add('option-menu');
}
function rowMenu(id, anchor) {
  const db = shownDb(); const row = db?.rows.find(r => r.id === id); if (!row) return; const rid = esc(id);
  popMenu(`<div class="menu-caption">${esc(rowName(row))}</div><button role="menuitem" data-action="row-page" data-id="${rid}">${icon('external')}페이지로 열기</button><button role="menuitem" data-action="row-up" data-id="${rid}">${icon('sort')}위로 이동</button><button role="menuitem" data-action="row-down" data-id="${rid}">${icon('sort')}아래로 이동</button><button role="menuitem" data-action="row-duplicate" data-id="${rid}">${icon('copy')}복제</button><div class="menu-divider"></div><button class="danger" role="menuitem" data-action="delete-row" data-id="${rid}">${icon('trash')}삭제</button>`, anchor);
}
function viewMenu(anchor) {
  popMenu(`<div class="menu-caption">보기 추가</div>${viewTypes.map(([type, label, glyph]) => `<button role="menuitem" data-action="add-view-type" data-type="${type}">${icon(glyph)}${label}</button>`).join('')}`, anchor);
}
// Moves a row one step among the rows currently shown.
function moveRow(id, direction) {
  const db = shownDb(); const row = db?.rows.find(r => r.id === id); if (!row) return; const view = activeView(db);
  if (isSorted(db, view)) { toast('정렬 중에는 순서를 바꿀 수 없습니다.', true); return; }
  const shown = visibleRows(db, view, ui.query); const other = shown[shown.indexOf(row) + direction]; if (!other) return;
  const from = db.rows.indexOf(row); const to = db.rows.indexOf(other); db.rows.splice(from, 1); db.rows.splice(to, 0, row);
  persist(); renderDatabase(); focusKey(`g:${id}`)?.focus();
}
function duplicateRow(id) {
  const db = shownDb(); const index = db ? db.rows.findIndex(r => r.id === id) : -1; if (index < 0) return;
  if (db.rows.length >= limits.rows) { toast(`${josa(db.itemName, '은', '는')} 최대 5,000개까지 만들 수 있습니다.`, true); return; }
  const source = db.rows[index]; const suffix = ' (복사본)';
  db.rows.splice(index + 1, 0, { id: uid(), title: `${source.title.slice(0, 500 - suffix.length)}${suffix}`, values: structuredClone(source.values), blocks: source.blocks.map(b => ({ ...structuredClone(b), id: uid() })) });
  persist(); renderDatabase(); toast(`${josa(db.itemName, '을', '를')} 복제했습니다.`);
}
function deleteRow(id) {
  const db = activeDb(); if (!db || !db.rows.some(r => r.id === id)) return;
  db.rows = db.rows.filter(r => r.id !== id); persist();
  if (ui.row?.id === id) { ui.row = null; render(); } else renderDatabase();
  if (ui.modal) closeModal();
  toast(`${josa(db.itemName, '을', '를')} 삭제했습니다.`);
}
function dropDraggedRow(target) {
  const db = shownDb(); const row = db?.rows.find(r => r.id === ui.draggedRow); if (!row) return; const view = activeView(db);
  if (target.dataset.dropGroup !== undefined) { const prop = groupProp(db, view); if (!prop) return; row.values[prop.id] = cleanValue(prop, target.dataset.dropGroup); }
  else if (target.dataset.dropDate) { const prop = dateProp(db, view); if (!prop) return; row.values[prop.id] = cleanValue(prop, target.dataset.dropDate); }
  else {
    const other = db.rows.find(r => r.id === target.dataset.row); if (!other || other === row) return;
    if (isSorted(db, view)) { toast('정렬 중에는 순서를 바꿀 수 없습니다.', true); return; }
    const from = db.rows.indexOf(row); const to = db.rows.indexOf(other); db.rows.splice(from, 1); db.rows.splice(to, 0, row);
  }
  persist(); renderDatabase();
}
function openRowForm(dbId, rowId = null, preset = {}) {
  const db = state.databases[dbId]; if (!db) return; const row = rowId ? db.rows.find(r => r.id === rowId) : null; if (rowId && !row) return;
  if (!row && db.rows.length >= limits.rows) { toast(`${josa(db.itemName, '은', '는')} 최대 5,000개까지 만들 수 있습니다.`, true); return; }
  showModal('row', row ? `${esc(db.itemName)} 상세` : `새로운 ${esc(db.itemName)}`, rowFormHTML(dbId, db, row, preset));
}
// Shows a row as a page of its own: title, properties and a block body.
function openRowPage(dbId, rowId) {
  const row = state.databases[dbId]?.rows.find(r => r.id === rowId); const page = dbPage(dbId); if (!row || !page || page.deleted) return;
  if (!row.blocks.length) row.blocks.push(block());
  state.activeId = dbId; rememberPage(dbId); ui.sidebar = false; ui.query = ''; ui.row = { db: dbId, id: rowId };
  removePopovers(); saveSidebar(); render(); $('.main-scroll').scrollTop = 0;
}
function addDatabase(parentId, then = null) {
  if (Object.keys(state.databases).length >= limits.databases) { toast('데이터베이스는 최대 200개까지 만들 수 있습니다.', true); return false; }
  return addPage({ parentId, title: '새 데이터베이스', type: 'database', icon: 'table', blocks: [] }, page => { const db = makeDatabase(); db.activeViewId = db.views[0].id; state.databases[page.id] = db; then?.(page); });
}
const panels = { filter: ['필터', filterPanelHTML], sort: ['정렬', sortPanelHTML], props: ['속성 편집', propsPanelHTML], view: ['보기 설정', viewPanelHTML] };
function openPanel(name) {
  const db = shownDb(); if (!db || !panels[name]) return;
  ui.panel = name; ui.confirmProp = null;
  showModal('db-panel', panels[name][0], `<div id="db-panel">${panels[name][1](db)}</div>`, name === 'props' ? 'wide-modal' : '');
}
// Redraws the open settings panel and the database behind it; focus goes to the control labelled `label`.
function refreshPanel(label = document.activeElement?.getAttribute('aria-label')) {
  const db = shownDb(); const el = $('#db-panel'); if (!db || !el) return;
  el.innerHTML = panels[ui.panel][1](db, ui.confirmProp); renderDatabase();
  ((label && $$('[aria-label]', el).find(node => node.getAttribute('aria-label') === label && !node.disabled)) || $('.form-footer button', el))?.focus();
}
function addOption(propId) {
  const db = shownDb(); const prop = db?.properties.find(p => p.id === propId); const input = $$('[data-new-option]').find(el => el.dataset.newOption === propId); if (!prop || !input) return;
  const name = input.value.trim().slice(0, 100);
  if (!name || name.includes(',') || prop.options.includes(name)) { toast(!name ? '옵션 이름을 입력하세요.' : name.includes(',') ? '옵션 이름에는 쉼표를 쓸 수 없습니다.' : '이미 있는 옵션입니다.', true); input.focus(); return; }
  if (prop.options.length >= limits.options) { toast('옵션은 최대 100개까지 추가할 수 있습니다.', true); return; }
  prop.options.push(name); persist(); refreshPanel(`${prop.name} 새 옵션`);
}
// Names typed in a panel apply at once, without redrawing it, so the next click still lands.
function onPanelInput(el) {
  const db = shownDb(); if (!db || el.tagName !== 'INPUT' || el.type === 'checkbox' || el.dataset.newOption) return;
  const view = activeView(db); const prop = db.properties.find(p => p.id === el.dataset.propId);
  if (el.dataset.filter !== undefined) { const f = view.filters[Number(el.dataset.filter)]; if (!f) return; f.value = el.value.slice(0, 500); }
  else if (el.dataset.dbField === 'itemName') { const name = el.value.trim().slice(0, 20); if (!name) return; db.itemName = name; }
  else if (el.dataset.viewField === 'name') { const name = el.value.trim().slice(0, 100); if (!name) return; view.name = name; }
  else if (el.dataset.propField === 'name' && prop) { const name = el.value.trim().slice(0, 100); if (!name) return; relabel(el.closest('.prop-item'), prop.name, name); prop.name = name; }
  else if (el.dataset.optionField === 'name' && prop) {
    const index = Number(el.dataset.index); const from = prop.options[index]; if (!renameOption(db, prop, from, el.value)) return;
    const choice = [...($('[data-prop-field="default"]', el.closest('.prop-item'))?.options || [])].find(o => o.value === from);
    if (choice) choice.value = choice.textContent = prop.options[index];
  } else return;
  persist(); renderDatabase(); if (el.dataset.viewField) refreshSidebar();
}
function onPanelChange(el) {
  const db = shownDb(); if (!db) return; const view = activeView(db); const prop = db.properties.find(p => p.id === el.dataset.propId);
  if (el.tagName === 'INPUT' && el.type !== 'checkbox') {
    // Text was applied while typing; a name that could not be used falls back to the stored one.
    const stored = el.dataset.dbField ? db.itemName : el.dataset.viewField ? view.name : el.dataset.propField === 'name' ? prop?.name : el.dataset.optionField === 'name' ? prop?.options[Number(el.dataset.index)] : null;
    if (typeof stored === 'string' && el.value.trim() !== stored) { el.value = stored; toast('사용할 수 없는 이름이라 이전 값으로 되돌렸습니다.', true); }
    return;
  }
  ui.confirmProp = null;
  if (el.dataset.filter !== undefined) {
    const f = view.filters[Number(el.dataset.filter)]; if (!f) return;
    if (el.dataset.part === 'prop') { const next = propOf(db, el.value); if (!next) return; f.prop = el.value; f.op = operators(next.type)[0][0]; f.value = ''; }
    else if (el.dataset.part === 'op') { const op = operators(propOf(db, f.prop).type).find(([name]) => name === el.value); if (!op) return; f.op = op[0]; if (!op[2]) f.value = ''; }
    else f.value = el.value.slice(0, 500);
  } else if (el.dataset.sortRule !== undefined) {
    const s = view.sorts[Number(el.dataset.sortRule)]; if (!s) return;
    if (el.dataset.part === 'dir') s.dir = el.value === 'desc' ? 'desc' : 'asc'; else if (propOf(db, el.value)) s.prop = el.value;
  } else if (el.dataset.viewField === 'type') { if (viewTypes.some(([type]) => type === el.value)) view.type = el.value; }
  else if (el.dataset.viewField === 'groupBy' || el.dataset.viewField === 'dateProp') view[el.dataset.viewField] = el.value || null;
  else if (el.dataset.propField === 'type' && prop) { if (propertyTypes.some(([type]) => type === el.value)) changeType(db, prop, el.value); }
  else if (el.dataset.propField === 'visible' && prop) view.hidden = el.checked ? view.hidden.filter(id => id !== prop.id) : [...new Set([...view.hidden, prop.id])];
  else if (el.dataset.propField === 'default' && prop) { if (prop.options.includes(el.value)) prop.default = el.value; else delete prop.default; }
  else if (el.dataset.optionField === 'color' && prop) {
    const name = prop.options[Number(el.dataset.index)]; if (name === undefined || !optionColors.some(([color]) => color === el.value)) return;
    prop.colors ||= {}; if (el.value === 'neutral') delete prop.colors[name]; else prop.colors[name] = el.value;
    if (!Object.keys(prop.colors).length) delete prop.colors;
  } else return;
  repair(db); persist(); refreshPanel(); if (el.dataset.viewField) refreshSidebar();
}
function openAccount() {
  const { user } = session;
  const admin = user.role === 'admin';
  showModal('account', '계정 및 로그인', `<div class="account-summary">${icon('user')}<div><strong>${esc(user.name || user.email)}</strong><p>${esc(user.email)} · ${admin ? '관리자' : '멤버'}</p></div></div><p class="dialog-description">Google 계정과 OTP로 로그인했습니다. 계정을 바꾸려면 로그아웃한 뒤 다시 로그인하세요.</p><div class="privacy-note">${icon('shield')}<div><strong>문서는 서버에 저장됩니다.</strong><p>로그아웃하면 이 브라우저에 남은 사본을 지웁니다. 다시 로그인하면 어느 기기에서든 이어서 쓸 수 있습니다.</p></div></div><div class="account-actions">${admin ? '<a class="button" href="/admin">관리자 화면</a>' : ''}<button type="button" class="button primary" data-action="logout">로그아웃</button></div>`);
}
function refreshSidebar() { const holder = document.createElement('div'); holder.innerHTML = sidebar(); $('.sidebar').replaceWith(holder.firstElementChild); }
function updateTitleUI() { $$('[data-page-name]').filter(el => el.dataset.pageName === current().id).forEach(el => { el.textContent = pageName(current()); }); document.title = `${pageName(current())} — Folio`; }
const typeOptions = [ ['text', '텍스트', 'text', '일반 텍스트를 입력합니다', 'text paragraph 문단'], ['h1', '제목 1', 'text', '큰 섹션 제목', 'heading'], ['h2', '제목 2', 'text', '중간 크기의 제목', 'heading'], ['h3', '제목 3', 'text', '작은 크기의 제목', 'heading'], ['bullet', '글머리 기호', 'bullet', '간결하게 목록을 작성합니다', 'list 목록'], ['numbered', '번호 매기기 목록', 'numbered', '순서가 있는 목록을 작성합니다', 'list ordered 숫자'], ['todo', '할 일 목록', 'check', '완료할 일을 체크합니다', 'checkbox 체크'], ['toggle', '토글 목록', 'chevron', '내용을 접고 펼칩니다', 'collapse 접기'], ['quote', '인용', 'quote', '기억하고 싶은 문장', 'blockquote'], ['callout', '콜아웃', 'bulb', '중요한 정보를 강조합니다', '강조'], ['code', '코드', 'code', '고정폭 글꼴로 코드를 적습니다', 'pre 코드 블록'], ['divider', '구분선', 'more', '내용 사이에 여백을 만듭니다', 'hr line 선'], ['toc', '목차', 'numbered', '제목 블록으로 목차를 만듭니다', 'toc contents 차례'], ['page', '페이지 링크', 'file', '다른 페이지로 가는 링크를 넣습니다', 'link mention 링크 연결'] ];
// The slash menu can also create a database, as a subpage of the current page.
const databaseOption = ['database', '데이터베이스', 'table', '하위 페이지로 데이터베이스를 만듭니다', 'db 표 table'];
// "페이지" makes a new page inside this one; the block it was typed in becomes the link to it.
const imageOption = ['image', '이미지', 'upload', '이미지 파일을 올려 넣습니다', 'image picture photo 사진 그림'];
const subpageOption = ['subpage', '페이지', 'file', '이 페이지 안에 새 페이지를 만듭니다', 'page 하위 새 페이지 sub'];
const menuOptions = () => openRow() ? [...typeOptions, imageOption] : [typeOptions[0], subpageOption, ...typeOptions.slice(1), imageOption, databaseOption];
function removePopovers() { $$('.popover').forEach(el => el.remove()); ui.menu = null; ui.blockMenu = null; ui.slash = null; }
function positionMenu(el, anchor) {
  if (!anchor) return;
  const r = anchor.getBoundingClientRect();
  el.style.right = 'auto'; el.style.left = `${Math.max(8, Math.min(r.right + 5, innerWidth - 242))}px`;
  document.body.append(el);
  el.style.top = `${Math.max(8, Math.min(r.top, innerHeight - el.offsetHeight - 8))}px`;
}
function renderPageMenu(pageId = current().id, anchor = null) {
  removePopovers(); ui.menu = true;
  const page = state.pages.find(p => p.id === pageId && !p.deleted); if (!page) return;
  const id = esc(page.id); const isDb = page.type === 'database';
  const item = (action, glyph, label) => `<button role="menuitem" data-action="${action}" data-id="${id}">${icon(glyph)}${label}</button>`;
  const check = (action, glyph, label, on) => `<button role="menuitemcheckbox" aria-checked="${!!on}" data-action="${action}" data-id="${id}">${icon(glyph)}${label}<span class="menu-check">${icon('check')}</span></button>`;
  const el = document.createElement('div'); el.className = 'popover page-menu'; el.setAttribute('role', 'menu');
  el.innerHTML = `<div class="menu-caption">${esc(pageName(page))}</div>${item('rename-page', 'text', '이름 바꾸기')}${item('sidebar-favorite', 'star', page.favorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가')}${item('duplicate', 'copy', '페이지 복제')}${item('copy-link', 'external', '링크 복사')}${item('move-page', 'file', '페이지 이동')}${item('sibling-up', 'sort', '위로 이동')}${item('sibling-down', 'sort', '아래로 이동')}${item('subpage', 'plus', '하위 페이지 추가')}
    <div class="menu-divider"></div>${check('toggle-full-width', 'grid', '전체 너비', page.fullWidth)}${check('toggle-small-text', 'text', '작은 글씨', page.smallText)}${isDb ? '' : item('page-history', 'clock', '페이지 기록') + item('save-template', 'template', '템플릿으로 저장')}
    <div class="menu-divider"></div>${item('export-page', 'download', 'Markdown 내보내기')}${item('export-html', 'download', 'HTML 내보내기')}${isDb ? item('export-csv', 'download', 'CSV 내보내기') : ''}${item('print-page', 'external', '인쇄')}
    <div class="menu-divider"></div><button class="danger" role="menuitem" data-action="delete-page" data-id="${id}">${icon('trash')}휴지통으로 이동</button>`;
  document.body.append(el); positionMenu(el, anchor);
}
function placeBelow(el, anchor) {
  const r = anchor.getBoundingClientRect();
  el.style.right = 'auto'; el.style.left = `${Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(r.bottom + 6, innerHeight - el.offsetHeight - 8))}px`;
}
const iconChoices = [['file', '문서'], ['book', '책'], ['bulb', '전구'], ['calendar', '달력'], ['check', '체크'], ['star', '별'], ['home', '집'], ['table', '표'], ['board', '보드'], ['grid', '격자'], ['user', '사람'], ['sun', '해'], ['moon', '달'], ['sparkles', '반짝임'], ['clock', '시계'], ['code', '코드'], ['quote', '인용'], ['text', '글자'], ['shield', '방패'], ['template', '템플릿']];
const emojiChoices = ['📄', '📝', '📚', '💡', '🎯', '🚀', '✅', '📅', '🔥', '⭐', '❤️', '🌱', '🏠', '💼', '🎨', '🧠', '☕', '🎵', '✈️', '🔒'];
function iconPicker(anchor) {
  const now = current().icon;
  const el = popMenu(`<div class="menu-caption">기본 아이콘</div><div class="icon-grid" role="group" aria-label="기본 아이콘">${iconChoices.map(([name, label]) => `<button data-action="set-icon" data-icon="${name}" aria-label="아이콘: ${label}" aria-pressed="${now === name}">${icon(name)}</button>`).join('')}</div><div class="menu-caption">이모지</div><div class="icon-grid" role="group" aria-label="이모지">${emojiChoices.map(e => `<button data-action="set-icon" data-icon="${e}" aria-label="이모지: ${e}" aria-pressed="${now === e}">${e}</button>`).join('')}</div><form id="emoji-form"><input name="emoji" aria-label="이모지 직접 입력" placeholder="다른 이모지 입력" maxlength="30" autocomplete="off"><button class="button small primary">적용</button></form>`, anchor, '페이지 아이콘');
  el.classList.add('icon-menu'); placeBelow(el, anchor);
}
function setIcon(name) { current().icon = name; persist(); removePopovers(); render(); $('.page-icon').focus(); }
// The first emoji of what was typed, or '' when it does not start with one.
function firstEmoji(text) {
  const first = [...new Intl.Segmenter().segment(text.trim())][0]?.segment || '';
  return first.length <= 30 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(first) ? first : '';
}
function coverPicker(anchor) {
  const page = current();
  const el = popMenu(`<div class="menu-caption">커버</div><div class="cover-grid" role="group" aria-label="커버 선택">${pageCovers.map(([name, label]) => `<button class="cover-swatch cover-${name}" data-action="set-cover" data-cover="${name}" aria-label="커버: ${label}" aria-pressed="${page.cover === name}"></button>`).join('')}</div>${page.cover ? `<button role="menuitem" data-action="set-cover" data-cover="">${icon('close')}커버 제거</button>` : ''}`, anchor, '페이지 커버');
  el.classList.add('cover-menu'); placeBelow(el, anchor);
}
function openWorkspaceMenu(anchor) {
  removePopovers();
  const workspaces = sync.workspace.list.map(w => w.id === sync.workspace.id ? { ...w, name: state.settings.name } : w);
  const el = document.createElement('div'); el.className = 'popover workspace-menu'; el.setAttribute('role', 'menu');
  el.innerHTML = `<div class="menu-caption">내 워크스페이스</div>${workspaces.map(w => `<button role="menuitem" data-action="switch-workspace" data-workspace="${esc(w.id)}" aria-label="워크스페이스 선택: ${esc(w.name)}"><span class="workspace-avatar">${esc(w.name.slice(0, 1))}</span><span>${esc(w.name)}</span>${w.id === sync.workspace.id ? icon('check') : ''}</button>`).join('')}<div class="menu-divider"></div><button role="menuitem" data-action="new-workspace">${icon('plus')}워크스페이스 만들기</button><button role="menuitem" data-action="settings">${icon('settings')}워크스페이스 설정</button><button role="menuitem" data-action="account">${icon('user')}계정 관리</button>${session.user.role === 'admin' ? `<a role="menuitem" href="/admin">${icon('shield')}관리자 화면</a>` : ''}<button role="menuitem" data-action="logout">${icon('external')}로그아웃</button>`;
  document.body.append(el); const bounds = anchor.getBoundingClientRect(); el.style.left = `${Math.min(bounds.left, innerWidth - 300)}px`; el.style.top = `${bounds.bottom + 7}px`;
}
// Opens another workspace (or makes one called `name`). The page is loaded again with it.
async function activateWorkspace(id, name = null) {
  if (id === sync.workspace.id) { removePopovers(); return; }
  if (activateWorkspace.busy) return;
  activateWorkspace.busy = true;
  try {
    flushVersions();
    if (!await sync.flush()) { toast('현재 공간을 저장하지 못해 전환하지 않았습니다. 연결을 확인하거나 먼저 백업해 주세요.', true); return; }
    if (name !== null) id = await sync.createWorkspace({ name });
    try { sessionStorage.setItem(NOTICE_KEY, '워크스페이스를 전환했습니다.'); } catch {}
    await sync.openWorkspace(id);
  } catch (error) { try { sessionStorage.removeItem(NOTICE_KEY); } catch {} toast(error.message || '워크스페이스를 전환하지 못했습니다.', true); }
  finally { activateWorkspace.busy = false; }
}
// Puts a newer state from the server on screen, keeping the caret where it was.
function adopt(next) {
  const here = state.activeId; const row = ui.row;
  state = next;
  if (state.pages.some(p => p.id === here && !p.deleted)) state.activeId = here;
  ui.row = row && state.databases[row.db]?.rows.some(r => r.id === row.id) ? row : null;
  showAdopted();
}
// Redrawing waits while a dialog or menu is open, text is being composed, or a field is being typed in.
function showAdopted() {
  clearTimeout(showAdopted.timer);
  const focus = document.activeElement;
  const active = focus?.closest?.('[data-edit-block]');
  if (ui.modal || $('.popover') || ui.composing || (!active && focus?.matches?.('input, textarea, select, [contenteditable="true"]'))) { showAdopted.timer = setTimeout(showAdopted, 400); return; }
  const caret = active ? { id: active.dataset.editBlock, ...selectionOffsets(active) } : null;
  const scroll = $('.main-scroll')?.scrollTop ?? 0;
  render();
  if ($('.main-scroll')) $('.main-scroll').scrollTop = scroll;
  const el = caret && $(`[data-edit-block="${CSS.escape(caret.id)}"]`);
  if (el) { el.focus(); if (caret.start !== undefined) setSelection(el, caret.start, caret.end); }
}
function sectionMenu(key, anchor) {
  removePopovers(); const el = document.createElement('div'); el.className = 'popover page-menu'; el.setAttribute('role', 'menu');
  el.innerHTML = `<button role="menuitem" data-action="section-up" data-section="${key}">섹션 위로</button><button role="menuitem" data-action="section-down" data-section="${key}">섹션 아래로</button>${key === 'pages' ? '<div class="menu-divider"></div><button role="menuitem" data-action="sidebar-manual">수동 정렬</button><button role="menuitem" data-action="sidebar-updated">최근 수정순</button><button role="menuitem" data-action="sidebar-limit" data-limit="5">5개 표시</button><button role="menuitem" data-action="sidebar-limit" data-limit="10">10개 표시</button><button role="menuitem" data-action="sidebar-limit" data-limit="1000">모두 표시</button>' : ''}`;
  document.body.append(el); positionMenu(el, anchor);
}
function reorderSibling(id, direction) {
  const page = state.pages.find(p => p.id === id); const siblings = state.pages.filter(p => !p.deleted && p.parentId === page.parentId); const i = siblings.indexOf(page); const j = i + direction;
  if (j < 0 || j >= siblings.length) return;
  movePage(state, id, page.parentId, direction < 0 ? siblings[j].id : siblings[j + 1]?.id || null);
  ui.sidebarPrefs.pageSort = 'manual'; saveSidebar(); render();
}
// With `slash` the menu is driven from the keyboard while focus stays in the block:
// it lists only the types matching the text typed after "/".
function renderBlockMenu(id, slash = null) {
  removePopovers();
  const b = doc().blocks.find(b => b.id === id); if (!b) return;
  const options = slash ? slashMatches(menuOptions(), slash.query) : typeOptions; if (!options.length) return;
  ui.blockMenu = id; ui.slash = slash && { query: slash.query, active: Math.min(Math.max(0, slash.active), options.length - 1) };
  const anchor = $(`[data-block-id="${id}"]`); const bounds = anchor.getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'popover block-menu'; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', '블록 유형');
  const top = Math.max(12, Math.min(bounds.bottom + 3, window.innerHeight - 460));
  el.style.top = `${top}px`; el.style.maxHeight = `${window.innerHeight - top - 12}px`; el.style.left = `${Math.max(10, Math.min(bounds.left + 15, window.innerWidth - 270))}px`;
  el.innerHTML = `<div class="menu-caption">${slash?.query ? `"${esc(slash.query)}" 검색 결과` : '블록으로 전환'}</div>${options.map(([type, label, glyph, description], i) => `<button role="option" aria-label="${label}" aria-selected="${slash ? i === ui.slash.active : b.type === type}" data-action="block-type" data-type="${type}" data-id="${id}"><span class="type-icon">${icon(glyph)}</span><span><strong>${label}</strong><small>${description}</small></span></button>`).join('')}${slash?.query ? '' : `<div class="menu-divider"></div><div class="block-actions"><button data-action="block-up" data-id="${id}" aria-label="블록 위로 이동">위로</button><button data-action="block-down" data-id="${id}" aria-label="블록 아래로 이동">아래로</button><button data-action="block-duplicate" data-id="${id}" aria-label="블록 복제">${icon('copy')}복제</button><button class="danger" data-action="block-delete" data-id="${id}">${icon('trash')}삭제</button></div>`}`;
  document.body.append(el);
  if (slash) $('[aria-selected="true"]', el)?.scrollIntoView({ block: 'nearest' });
}
function showModal(name, title, body, size = '') {
  removePopovers(); ui.lastFocus = document.activeElement; ui.modal = name; $('#app').inert = true;
  $('#overlay-root').innerHTML = `<div class="modal-backdrop" data-backdrop="true"><section class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><div class="modal-body">${body}</div></section></div>`;
  requestAnimationFrame(() => ($('[autofocus]', $('#overlay-root')) || $('input,select,textarea,button', $('.modal-body')) || $('.modal-header button'))?.focus());
}
function closeModal(restore = true) {
  $('#app').inert = false; $('#overlay-root').innerHTML = ''; ui.modal = null; ui.pendingImport = null; ui.linking = null; ui.confirm = null;
  const last = ui.lastFocus; if (restore) (last?.isConnected ? last : last?.dataset?.focus && focusKey(last.dataset.focus))?.focus();
}
function searchResults(q = '') {
  const query = q.trim().toLocaleLowerCase(); const recents = ui.sidebarPrefs.recents;
  let pages = state.pages.filter(p => !p.deleted && (!query || (ui.searchScope === 'title' ? p.title : `${p.title} ${p.blocks.map(b => b.text).join(' ')}`).toLocaleLowerCase().includes(query)));
  if (ui.searchSort === 'title') pages.sort((a, b) => pageName(a).localeCompare(pageName(b), 'ko'));
  else if (ui.searchSort === 'updated') pages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  else pages.sort((a, b) => (recents.indexOf(a.id) < 0 ? 999 : recents.indexOf(a.id)) - (recents.indexOf(b.id) < 0 ? 999 : recents.indexOf(b.id)));
  // Searching also finds database rows by their title, values and body.
  const rows = [];
  if (query && ui.modal === 'search') for (const p of state.pages) {
    const db = state.databases[p.id]; if (p.deleted || !db) continue;
    for (const row of db.rows) { if (rows.length >= 50) break; if ((ui.searchScope === 'title' ? row.title : `${rowText(db, row)} ${row.blocks.map(b => b.text).join(' ')}`).toLocaleLowerCase().includes(query)) rows.push({ p, db, row }); }
  }
  const prefix = ui.modal === 'library' ? '목록 페이지' : '검색 결과';
  const pageHTML = pages.map(p => `<button class="search-result" data-action="search-open" data-id="${esc(p.id)}" aria-label="${prefix}: ${esc(pageName(p))}">${icon(p.icon)}<span><strong>${esc(pageName(p))}</strong><small>${esc((p.blocks.find(b => query && b.text.toLowerCase().includes(query))?.text || p.blocks[0]?.text || (p.type === 'database' ? `${pageName(p)} 데이터베이스` : '')).slice(0, 100))}</small></span>${icon('arrow')}</button>`).join('');
  const rowHTML = rows.map(({ p, db, row }) => `<button class="search-result" data-action="search-open-row" data-db="${esc(p.id)}" data-id="${esc(row.id)}" aria-label="${prefix}: ${esc(rowName(row))} (${esc(pageName(p))})">${icon('file')}<span><strong>${esc(rowName(row))}</strong><small>${esc(pageName(p))} · ${esc(db.itemName)}</small></span>${icon('arrow')}</button>`).join('');
  return `<div class="search-caption">${query ? `검색 결과 ${pages.length + rows.length}개` : ui.searchSort === 'recent' ? '최근 방문한 페이지부터 표시' : '워크스페이스의 모든 페이지'}</div>${pageHTML + rowHTML || '<div class="empty-state">검색 결과가 없습니다.<small>다른 단어로 검색해 보세요.</small></div>'}`;
}
function openSearch(library = false) {
  ui.searchQuery = ''; ui.searchScope = 'all'; ui.searchSort = library ? 'title' : 'recent';
  showModal(library ? 'library' : 'search', library ? '전체 페이지' : '무엇을 찾고 있나요?', `<label class="search-main">${icon('search')}<input type="search" aria-label="워크스페이스 검색" placeholder="페이지와 내용 검색…" autofocus><kbd>ESC</kbd></label><div class="search-filters"><label>범위<select aria-label="검색 범위"><option value="all">제목과 내용</option><option value="title">제목만</option></select></label><label>정렬<select aria-label="검색 정렬"><option value="recent" ${!library ? 'selected' : ''}>최근 방문순</option><option value="updated">최근 수정순</option><option value="title" ${library ? 'selected' : ''}>이름순</option></select></label></div><div id="search-results"></div>`, 'search-modal');
  $('#search-results').innerHTML = searchResults();
}
// Documents this browser kept before there was a server, offered for moving.
function legacyHTML() {
  const list = legacyData(); if (!list) return '';
  return `<div class="import-files" id="legacy-move"><strong>이 브라우저에 있던 문서</strong><p>서버에 저장하기 전에 이 브라우저에서 쓰던 워크스페이스 ${list.length}개(${esc(list.map(w => `${w.name} · 페이지 ${w.pages}개`).join(', '))})가 남아 있습니다. 서버로 옮기면 새 워크스페이스로 추가되고, 이 브라우저의 원본은 그대로 둡니다.</p><div class="backup-actions"><button type="button" class="button" data-action="move-legacy">${icon('upload')}서버로 옮기기</button></div></div>`;
}
async function moveLegacyData(button) {
  button.disabled = true;
  const result = await moveLegacy().catch(error => ({ moved: 0, failed: 1, error: error.message }));
  await sync.refreshWorkspaces().catch(() => {});
  if ($('#legacy-move')) $('#legacy-move').outerHTML = legacyHTML();
  if (result.failed) toast(`${result.moved ? `${result.moved}개를 옮겼지만 ` : ''}${result.failed}개는 옮기지 못했습니다. ${result.error}`, true);
  else toast(`워크스페이스 ${result.moved}개를 서버로 옮겼습니다. 왼쪽 위 워크스페이스 메뉴에서 열 수 있습니다.`);
}
function openSettings() {
  showModal('settings', '워크스페이스 설정', `<form id="settings-form"><div class="settings-intro"><span class="brand-icon">f.</span><div><strong>나만의 공간, 나만의 방식</strong><p>집중하기 좋은 워크스페이스를 만들어 보세요.</p></div></div><label class="field-label">워크스페이스 이름<input name="name" aria-label="워크스페이스 이름" maxlength="120" required value="${esc(state.settings.name)}"></label><label class="field-label">화면 테마<select name="theme" aria-label="화면 테마"><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>라이트 · 밝고 편안하게</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>다크 · 차분하게 집중</option></select></label><div class="privacy-note">${icon('shield')}<div><strong>데이터는 서버에 자동 저장됩니다.</strong><p>로그인하면 어느 기기에서든 같은 문서를 볼 수 있습니다. 중요한 문서는 백업 파일로도 내려받아 두세요.</p></div></div>${legacyHTML()}<div class="backup-actions"><button type="button" class="button" data-action="export-workspace">${icon('download')}워크스페이스 내보내기</button><button type="button" class="button" data-action="import-workspace">${icon('upload')}백업 가져오기</button><input type="file" id="import-file" aria-label="백업 파일 선택" accept=".json,application/json" hidden></div><div class="import-files"><strong>파일 가져오기</strong><p>Markdown 파일은 새 페이지로, CSV 파일은 새 데이터베이스로 가져옵니다.</p><div class="backup-actions"><button type="button" class="button" data-action="import-md">${icon('upload')}Markdown 가져오기</button><button type="button" class="button" data-action="import-csv">${icon('upload')}CSV 가져오기</button><input type="file" id="import-md" aria-label="Markdown 파일 선택" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden><input type="file" id="import-csv" aria-label="CSV 파일 선택" accept=".csv,text/csv" hidden></div></div><div id="import-feedback" role="alert"></div><div class="form-footer"><span></span><button type="submit" class="button primary">설정 저장</button></div></form>`);
}
// Redraws a list inside the open dialog; focus goes to the control labelled `label`.
function refreshList(el, html, label = null) {
  if (!el) return; el.innerHTML = html;
  ((label && $$('[aria-label]', el).find(node => node.getAttribute('aria-label') === label)) || $('input,button', $('.modal-body')))?.focus();
}
function trashHTML() {
  const all = state.pages.filter(p => p.deleted); const query = ui.trashQuery.trim().toLocaleLowerCase();
  if (!all.length) return '<div class="empty-state">휴지통이 비어 있습니다.<small>삭제한 페이지가 여기에 표시됩니다.</small></div>';
  const pages = all.filter(p => pageName(p).toLocaleLowerCase().includes(query)); const emptying = ui.confirm === 'empty-trash';
  return `<div class="list-head"><span>${query ? `검색 결과 ${pages.length}개` : `삭제한 페이지 ${all.length}개`}</span><button class="button small danger" data-action="empty-trash" aria-label="${emptying ? '휴지통 비우기 확인' : '휴지통 비우기'}">${icon('trash')}${emptying ? '정말 모두 삭제' : '휴지통 비우기'}</button></div>${pages.map(p => {
    const name = esc(pageName(p)); const sure = ui.confirm === `purge:${p.id}`;
    return `<div class="trash-row"><span>${icon(p.icon)}${name}</span><span class="row-actions"><button class="button small" data-action="restore" data-id="${esc(p.id)}" aria-label="복원: ${name}">${icon('restore')}복원</button><button class="button small danger" data-action="purge-page" data-id="${esc(p.id)}" aria-label="${sure ? '영구 삭제 확인' : '영구 삭제'}: ${name}">${sure ? '정말 삭제' : '영구 삭제'}</button></span></div>`;
  }).join('') || '<div class="empty-state">검색 결과가 없습니다.<small>다른 이름으로 찾아 보세요.</small></div>'}`;
}
const refreshTrash = (label = null) => refreshList($('#trash-list'), trashHTML(), label);
function openTrash() {
  ui.trashQuery = '';
  showModal('trash', '휴지통', `<p class="dialog-description">삭제한 페이지는 복원하거나 영구 삭제할 수 있습니다. 영구 삭제한 페이지는 되돌릴 수 없습니다.</p><label class="search-main list-search">${icon('search')}<input type="search" aria-label="휴지통 검색" placeholder="삭제한 페이지 검색…"></label><div id="trash-list">${trashHTML()}</div>`);
}
// Removes pages from the trash for good, with everything that pointed at them.
function purge(ids) {
  const gone = purgePages(state, ids);
  ui.sidebarPrefs.recents = ui.sidebarPrefs.recents.filter(id => !gone.has(id));
  for (const id of gone) { ui.expanded.delete(id); ui.dirty.delete(id); ui.snapAt.delete(id); }
  saveSidebar(); render(); refreshTrash();
}
const templates = [
  { title: '팀 회의록', label: '회의록', icon: 'calendar', description: '안건부터 결정 사항, 다음 액션까지.', blocks: () => [block('h2', '회의 안건'), block('bullet', '논의할 주제를 입력하세요.'), block('h2', '결정 사항'), block('text'), block('h2', '다음 액션'), block('todo', '담당자와 마감일 정하기')] },
  { title: '주간 계획', label: '주간 계획', icon: 'check', description: '이번 주의 목표와 작은 성취를 기록해요.', blocks: () => [block('h2', '이번 주 가장 중요한 일'), block('todo', '이번 주 목표 1'), block('todo', '이번 주 목표 2'), block('h2', '한 주 돌아보기'), block('text', '이번 주에 배운 점은 무엇인가요?')] },
  { title: '독서 노트', label: '독서 노트', icon: 'book', description: '읽은 책을 나만의 지식으로 남겨요.', blocks: () => [block('h2', '책 소개'), block('text', '책 제목과 저자를 기록하세요.'), block('h2', '마음에 남은 문장'), block('quote', '기억하고 싶은 문장을 적어 보세요.'), block('h2', '나의 생각'), block('text')] },
];
function templatesHTML() {
  const mine = state.templates || [];
  return `<p class="dialog-description">빈 페이지 앞에서 망설이지 않도록. 나에게 맞는 틀을 골라 보세요.</p><div class="template-grid">${templates.map((t, i) => `<button class="template-card" data-action="use-template" data-index="${i}" aria-label="${t.label} 템플릿 사용"><span class="template-preview preview-${i}">${icon(t.icon)}<i></i><i></i><i></i></span><strong>${t.label}</strong><small>${t.description}</small><span class="template-cta">템플릿 사용 ${icon('arrow')}</span></button>`).join('')}</div>
    <div class="list-head my-templates-head"><span>내 템플릿 ${mine.length}개</span></div>${mine.map(t => {
    const name = esc(t.title.trim() || '제목 없음'); const sure = ui.confirm === `template:${t.id}`;
    return `<div class="trash-row"><span>${icon(t.icon)}${name}<small>블록 ${t.blocks.length}개</small></span><span class="row-actions"><button class="button small" data-action="use-my-template" data-id="${esc(t.id)}" aria-label="내 템플릿 사용: ${name}">사용</button><button class="button small danger" data-action="delete-template" data-id="${esc(t.id)}" aria-label="${sure ? '템플릿 삭제 확인' : '템플릿 삭제'}: ${name}">${sure ? '정말 삭제' : '삭제'}</button></span></div>`;
  }).join('') || '<p class="list-empty">페이지 메뉴의 “템플릿으로 저장”으로 자주 쓰는 페이지를 템플릿으로 만들 수 있습니다.</p>'}`;
}
function openTemplates() { showModal('templates', '작은 시작을 돕는 템플릿', `<div id="templates-body">${templatesHTML()}</div>`, 'wide-modal'); }
function saveTemplate(page) {
  state.templates ||= [];
  if (state.templates.length >= TEMPLATE_LIMIT) { toast(`템플릿은 최대 ${TEMPLATE_LIMIT}개까지 저장할 수 있습니다.`, true); return; }
  state.templates.push({ id: uid(), title: page.title.slice(0, 500), icon: page.icon, blocks: copyBlocks(page.blocks) });
  persist(false); toast('템플릿으로 저장했습니다.');
}
// The page picker links a page from the block in `linking`: { id, cut } where `cut` is
// the typed text ("[[" or a slash command) to remove from that block.
function pickerHTML(q = '') {
  const query = q.trim().toLocaleLowerCase();
  const pages = state.pages.filter(p => !p.deleted && pageName(p).toLocaleLowerCase().includes(query)).slice(0, 50);
  return pages.map(p => `<button class="search-result" data-action="pick-page" data-id="${esc(p.id)}" aria-label="페이지 선택: ${esc(pageName(p))}">${icon(p.icon)}<span><strong>${esc(pageName(p))}</strong><small>${p.type === 'database' ? '데이터베이스' : '페이지'}</small></span>${icon('arrow')}</button>`).join('') || '<div class="empty-state">찾는 페이지가 없습니다.<small>다른 이름으로 찾아 보세요.</small></div>';
}
function openPagePicker(linking) {
  showModal('page-picker', '페이지 링크', `<label class="search-main">${icon('search')}<input type="search" aria-label="페이지 검색" placeholder="연결할 페이지 이름…" autofocus><kbd>ESC</kbd></label><div id="page-picker-results">${pickerHTML()}</div>`, 'search-modal');
  ui.linking = linking;
}
function linkPage(targetId) {
  const linking = ui.linking; closeModal(false);
  const list = doc().blocks; const index = list.findIndex(b => b.id === linking?.id); const b = list[index]; if (!b || !livePage(targetId)) return;
  if (list.length >= 9998) { toast('블록은 페이지당 최대 10,000개까지 만들 수 있습니다.', true); return; }
  remember();
  if (linking.cut) { const [from, to] = linking.cut; setMarks(b, spliceMarks(marksOf(b), from, to - from, 0)); b.text = b.text.slice(0, from) + b.text.slice(to); setMarks(b, marksOf(b)); }
  // An empty block becomes the link; otherwise the link goes below the text.
  let link = b;
  if (b.text) { link = { ...block('page'), target: targetId }; if (indentOf(b)) link.indent = indentOf(b); list.splice(index + 1, 0, link); }
  else { b.type = 'page'; b.target = targetId; b.checked = false; delete b.marks; delete b.open; }
  const at = list.indexOf(link); let next = list[at + 1];
  if (!next || staticTypes.includes(next.type)) { next = block(); if (indentOf(link)) next.indent = indentOf(link); list.splice(at + 1, 0, next); }
  persist(); render(); focusBlock(next.id, 0);
}
const stamp = at => new Date(at).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
// `list` is what the server keeps for the page, newest first; null while it is being fetched.
function historyHTML(page, list) {
  const id = esc(page.id);
  if (!list) return '<div class="empty-state">버전을 불러오는 중…</div>';
  return `<div class="list-head"><span>저장된 버전 ${list.length}개</span><button class="button small" data-action="save-version" data-id="${id}">${icon('plus')}지금 버전 저장</button></div>${list.map((v, i) => `<div class="trash-row"><span>${icon('clock')}<span class="version-name"><strong>${esc(stamp(v.at))}</strong><small>${esc(v.title.trim() || '제목 없음')} · 블록 ${v.blockCount}개${v.author ? ` · ${esc(v.author)}` : ''}</small></span></span><button class="button small" data-action="restore-version" data-id="${id}" data-version="${esc(v.id)}" aria-label="버전 ${i + 1} 복원">${icon('restore')}복원</button></div>`).join('') || '<div class="empty-state">아직 저장된 버전이 없습니다.<small>페이지를 편집하고 다른 페이지로 이동하면 버전이 남습니다.</small></div>'}`;
}
// Fills the open history dialog once `after` (a version being saved) has settled.
async function refreshHistory(page, after = null) {
  await after;
  let html;
  try { html = historyHTML(page, await sync.listVersions(page.id)); } catch (error) { html = `<div class="empty-state">${esc(error.message)}</div>`; }
  const el = $('#history-list'); if (el && el.dataset.page === page.id) refreshList(el, html);
}
function openHistory(page) {
  const saving = ui.dirty.has(page.id) ? keepVersion(page) : null;
  showModal('history', '페이지 기록', `<p class="dialog-description">페이지를 떠날 때와 편집 중 10분마다 버전을 저장합니다. 페이지마다 최근 ${KEEP}개를 서버에 보관하며, 백업 파일에는 들어가지 않습니다.</p><div id="history-list" data-page="${esc(page.id)}">${historyHTML(page, null)}</div>`);
  refreshHistory(page, saving);
}
async function restoreVersion(page, versionId) {
  let version; try { version = await sync.readVersion(page.id, versionId); } catch (error) { toast(error.message, true); return; }
  page = state.pages.find(p => p.id === page.id && !p.deleted); if (!page) return;
  let blocks; try { blocks = copyBlocks(version.blocks); } catch (error) { toast('이 버전은 읽을 수 없어 복원하지 않았습니다.', true); return; }
  keepVersion(page); history.snapshot(page);
  page.title = version.title; page.blocks = blocks.length ? blocks : [block()]; page.updatedAt = new Date().toISOString();
  persist(false); closeModal(false); render(); toast('선택한 버전으로 복원했습니다.');
}
function importMarkdown(text, name) {
  const { title, blocks, truncated } = markdownToPage(text, name);
  if (addPage({ title, blocks })) toast(truncated ? '블록 10,000개까지만 가져왔습니다.' : 'Markdown 파일을 페이지로 가져왔습니다.', truncated);
}
function importCSV(text, name) {
  if (Object.keys(state.databases).length >= limits.databases) throw new Error('데이터베이스는 최대 200개까지 만들 수 있습니다.');
  const { db, truncated } = csvToDatabase(parseCSV(text)); repair(db);
  if (addPage({ title: name, type: 'database', icon: 'table', blocks: [] }, page => { state.databases[page.id] = db; })) toast(truncated ? 'CSV 파일의 일부만 가져왔습니다. (행 5,000개, 속성 50개까지)' : `CSV 파일에서 ${db.rows.length}개 행을 가져왔습니다.`, truncated);
}
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name.replace(/[<>:"/\\|?*]/g, '_'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
const editable = id => $(`[data-edit-block="${id}"]`);
function focusBlock(id, offset = null) { const el = editable(id); if (el) { el.focus(); setSelection(el, offset ?? readText(el).length); } else $(`[data-block-id="${id}"] [data-action="block-menu"]`)?.focus(); }
const remember = () => history.snapshot(doc());
const marksOf = b => b.marks || [];
// Code blocks stay plain; every other block keeps only marks that still fit its text.
function setMarks(b, marks) { const next = b.type === 'code' ? [] : normalizeMarks(marks, b.text.length); if (next.length) b.marks = next; else delete b.marks; }
function setBlockContent(el, b, caret = null) { el.innerHTML = inlineHTML(b); if (caret !== null) setSelection(el, caret); }
function insertIntoBlock(el, b, pos, text) {
  history.typing(doc(), b.id);
  const marks = spliceMarks(marksOf(b), pos.start, pos.end - pos.start, text.length);
  b.text = (b.text.slice(0, pos.start) + text + b.text.slice(pos.end)).slice(0, MAX_TEXT); setMarks(b, marks);
  setBlockContent(el, b, Math.min(pos.start + text.length, b.text.length)); persist();
}
// Converts a block to another type from the slash menu or a Markdown shortcut,
// keeping the text from offset `from` on (nothing when `from` is null).
function convertBlock(b, type, from = null) {
  const list = doc().blocks; const marks = from === null ? [] : sliceMarks(marksOf(b), from, b.text.length);
  b.type = type; delete b.target; b.text = from === null ? '' : b.text.slice(from); setMarks(b, marks); removePopovers();
  if (!staticTypes.includes(type)) { persist(); render(); focusBlock(b.id, 0); return; }
  const index = list.indexOf(b); let next = list[index + 1];
  if (!next || staticTypes.includes(next.type)) { next = block(); list.splice(index + 1, 0, next); }
  persist(); render(); focusBlock(next.id, 0);
}
function visibleNeighbor(index, direction) {
  const list = doc().blocks; const hidden = hiddenBlocks(list);
  for (let i = index + direction; i >= 0 && i < list.length; i += direction) if (!hidden.has(list[i].id) && !staticTypes.includes(list[i].type)) return list[i];
  return null;
}
function duplicateBlock(id) {
  const list = doc().blocks; const index = list.findIndex(b => b.id === id); if (index < 0) return;
  if (list.length >= 10000) { toast('블록은 페이지당 최대 10,000개까지 만들 수 있습니다.', true); return; }
  remember(); const copy = { ...structuredClone(list[index]), id: uid() };
  list.splice(index + 1, 0, copy); removePopovers(); persist(); render(); focusBlock(copy.id);
}
function undoRedo(redo) {
  const focused = document.activeElement?.dataset?.editBlock;
  const linked = linkedPages();
  if (!(redo ? history.redo : history.undo)(doc())) { toast(redo ? '다시 실행할 작업이 없습니다.' : '실행 취소할 작업이 없습니다.'); return; }
  settleChildren(linked);
  removePopovers(); persist(); render();
  const list = doc().blocks; focusBlock((list.find(b => b.id === focused) || list.at(-1)).id);
}

function deleteBlock(id) {
  const list = doc().blocks; const at = list.findIndex(b => b.id === id); if (at < 0) return;
  remember(); const linked = linkedPages();
  list.splice(at, 1); if (!list.length) list.push(block());
  settleChildren(linked); removePopovers(); persist(); render();
  return list[Math.min(at, list.length - 1)];
}
// A selected block, as in Notion: click its handle (or an image or divider), or press Esc while
// typing in it. Delete or Backspace then removes the whole block; the arrows move the selection.
const selectedRow = () => $('.block-row.selected');
function clearSelected() { for (const row of $$('.block-row.selected')) row.classList.remove('selected'); }
function selectBlock(id, blur = true) {
  clearSelected(); const row = $(`[data-block-id="${id}"]`); if (!row) return;
  row.classList.add('selected'); if (blur) document.activeElement?.blur?.();
}
document.addEventListener('focusin', event => { if (event.target.closest?.('[data-edit-block]')) clearSelected(); });
document.addEventListener('keydown', event => {
  const row = selectedRow();
  if (event.key === 'Escape' && !row && event.target.dataset?.editBlock && !$('.popover') && !ui.modal && !event.isComposing) { selectBlock(event.target.dataset.editBlock); return; }
  if (!row || ui.modal || event.ctrlKey || event.metaKey || event.altKey || event.target.matches('input,textarea,select,[contenteditable="true"]')) return;
  const id = row.dataset.blockId;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault(); const next = deleteBlock(id); if (next) selectBlock(next.id);
  } else if (event.target.closest('.popover,button')) return; // the keys belong to the menu or the button
  else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault(); removePopovers();
    let other = row; do { other = event.key === 'ArrowUp' ? other.previousElementSibling : other.nextElementSibling; } while (other && (!other.dataset.blockId || other.hidden));
    if (other) { selectBlock(other.dataset.blockId); other.scrollIntoView({ block: 'nearest' }); }
  } else if (event.key === 'Enter') { event.preventDefault(); removePopovers(); clearSelected(); focusBlock(id); }
  else if (event.key === 'Escape') clearSelected();
}, true);
document.addEventListener('click', event => {
  const still = event.target.closest('.block-image,.block-divider'); const handle = event.target.closest('[data-action="block-menu"]');
  if (handle) selectBlock(handle.dataset.id, false); else if (still && !event.target.closest('.block-tools')) selectBlock(still.dataset.blockId); else if (!event.target.closest('.popover')) clearSelected();
  const link = event.target.closest('.block-input a[href]');
  if (link) { event.preventDefault(); if (getSelection().isCollapsed && safeHref(link.getAttribute('href'))) window.open(link.href, '_blank', 'noopener'); }
  const target = event.target.closest('[data-action]');
  if (!target) { if (!event.target.closest('.popover')) removePopovers(); if (event.target.dataset.backdrop) closeModal(); return; }
  const { action, id } = target.dataset;
  if (!['block-type', 'block-menu', 'page-menu', 'block-delete', 'block-up', 'block-down', 'block-duplicate', 'toggle-option'].includes(action)) removePopovers();
  const confirming = ui.confirmProp; ui.confirmProp = null; const armed = ui.confirm; ui.confirm = null;
  switch (action) {
    case 'open': if (state.pages.some(p => p.id === id && !p.deleted)) go(id); else toast('이 페이지는 휴지통에 있습니다.', true); break;
    case 'open-home': go(state.pages.find(p => p.type === 'home' && !p.deleted)?.id || state.pages.find(p => !p.deleted).id); break;
    case 'new': addPage(); break;
    case 'subpage': addPage({ parentId: id }); break;
    case 'expand': ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id); saveSidebar(); refreshSidebar(); break;
    case 'open-sidebar': if (window.innerWidth > 760) ui.collapsed = false; else ui.sidebar = true; saveSidebar(); render(); break;
    case 'close-sidebar': ui.sidebar = false; render(); break;
    case 'collapse': ui.sidebar = false; if (window.innerWidth > 760) ui.collapsed = !ui.collapsed; saveSidebar(); render(); break;
    case 'favorite': current().favorite = !current().favorite; persist(); render(); break;
    case 'page-menu': renderPageMenu(); break;
    case 'duplicate': if (state.pages.length >= 1000) { toast('페이지는 최대 1,000개까지 만들 수 있습니다.', true); break; } linkChild(duplicatePage(state, state.pages.find(p => p.id === id) || current())); persist(); render(); toast('페이지를 복제했습니다.'); break;
    case 'delete-page': trash(id || current().id); persist(); render(); toast('페이지를 휴지통으로 옮겼습니다.'); break;
    case 'restore': restore(id); persist(); render(); refreshTrash(); toast('페이지를 복원했습니다.'); break;
    case 'search': openSearch(); break;
    case 'library': openSearch(true); break;
    case 'search-open': closeModal(false); go(id); break;
    case 'templates': openTemplates(); break;
    case 'use-template': { const t = templates[Number(target.dataset.index)]; addPage({ title: t.title, icon: t.icon, blocks: t.blocks() }); toast('템플릿으로 페이지를 만들었습니다.'); break; }
    case 'settings': openSettings(); break;
    case 'trash': openTrash(); break;
    case 'purge-page': { const page = state.pages.find(p => p.id === id && p.deleted); if (!page) break; if (armed !== `purge:${id}`) { ui.confirm = `purge:${id}`; refreshTrash(`영구 삭제 확인: ${pageName(page)}`); break; } purge([id]); toast('페이지를 영구 삭제했습니다.'); break; }
    case 'empty-trash': { if (armed !== 'empty-trash') { ui.confirm = 'empty-trash'; refreshTrash('휴지통 비우기 확인'); break; } purge(state.pages.filter(p => p.deleted).map(p => p.id)); toast('휴지통을 비웠습니다.'); break; }
    case 'use-my-template': { const t = state.templates?.find(t => t.id === id); if (!t) break; const blocks = copyBlocks(t.blocks); if (addPage({ title: t.title, icon: t.icon, blocks: blocks.length ? blocks : [block()] })) toast('템플릿으로 페이지를 만들었습니다.'); break; }
    case 'delete-template': { const t = state.templates?.find(t => t.id === id); if (!t) break; const name = t.title.trim() || '제목 없음'; if (armed !== `template:${id}`) { ui.confirm = `template:${id}`; refreshList($('#templates-body'), templatesHTML(), `템플릿 삭제 확인: ${name}`); break; } state.templates = state.templates.filter(item => item !== t); persist(false); refreshList($('#templates-body'), templatesHTML()); toast('템플릿을 삭제했습니다.'); break; }
    case 'save-template': saveTemplate(state.pages.find(p => p.id === id) || current()); break;
    case 'icon-picker': iconPicker(target); break;
    case 'set-icon': setIcon(target.dataset.icon); break;
    case 'cover-picker': coverPicker(target); break;
    case 'set-cover': { const page = current(); if (pageCovers.some(([name]) => name === target.dataset.cover)) page.cover = target.dataset.cover; else delete page.cover; persist(); render(); $('[data-action="cover-picker"]').focus(); break; }
    case 'toggle-full-width': case 'toggle-small-text': { const page = state.pages.find(p => p.id === id) || current(); const key = action === 'toggle-full-width' ? 'fullWidth' : 'smallText'; if (page[key]) delete page[key]; else page[key] = true; persist(false); render(); break; }
    case 'page-history': openHistory(state.pages.find(p => p.id === id) || current()); break;
    case 'save-version': { const page = state.pages.find(p => p.id === id); if (!page) break; refreshHistory(page, keepVersion(page, true)); break; }
    case 'restore-version': { const page = state.pages.find(p => p.id === id); if (page) restoreVersion(page, target.dataset.version); break; }
    case 'pick-page': linkPage(id); break;
    case 'toc-jump': focusBlock(id, 0); $(`[data-block-id="${id}"]`)?.scrollIntoView({ block: 'start' }); break;
    case 'export-html': { const page = state.pages.find(p => p.id === id) || current(); download(`${pageName(page)}.html`, exportHTML(page, { titleOf, db: state.databases[page.id] || null }), 'text/html;charset=utf-8'); toast('페이지를 HTML로 내보냈습니다.'); break; }
    case 'export-csv': { const page = state.pages.find(p => p.id === id) || current(); const db = state.databases[page.id]; if (!db) break; download(`${pageName(page)}.csv`, databaseCSV(db), 'text/csv;charset=utf-8'); toast('데이터베이스를 CSV로 내보냈습니다.'); break; }
    case 'print-page': if (id && id !== current().id && livePage(id)) go(id); window.print(); break;
    case 'import-md': $('#import-md').click(); break;
    case 'import-csv': $('#import-csv').click(); break;
    case 'close-modal': closeModal(); break;
    case 'db-view': { const db = shownDb(); if (db?.views.some(v => v.id === target.dataset.view)) { db.activeViewId = target.dataset.view; persist(false); renderDatabase(); } break; }
    case 'add-view': viewMenu(target); break;
    case 'add-view-type': { const db = shownDb(); if (!db || !viewTypes.some(([type]) => type === target.dataset.type)) break; if (db.views.length >= limits.views) { toast('보기는 최대 20개까지 만들 수 있습니다.', true); break; } const view = addView(db, target.dataset.type); persist(); renderDatabase(); refreshSidebar(); focusKey(`v:${view.id}`)?.focus(); break; }
    case 'quick-sort': { const db = shownDb(); if (!db) break; db.quick.sort = db.quick.sort === 'none' ? 'asc' : db.quick.sort === 'asc' ? 'desc' : 'none'; persist(false); renderDatabase(); break; }
    case 'clear-db-search': ui.query = ''; $('[aria-label="데이터베이스 검색"]').value = ''; refreshDatabaseResults(); $('[aria-label="데이터베이스 검색"]').focus(); break;
    case 'calendar-move': ui.month = Number(target.dataset.delta) ? shiftMonth(ui.month, Number(target.dataset.delta)) : thisMonth(); refreshDatabaseResults(); break;
    case 'db-panel': openPanel(target.dataset.panel); break;
    case 'account': openAccount(); break;
    case 'logout': flushVersions(); sync.forget().then(saved => { if (saved) return logout(); toast('저장하지 못한 변경이 있어 로그아웃하지 않았습니다. 연결을 확인하거나 먼저 백업해 주세요.', true); }).catch(error => toast(error.message, true)); break;
    case 'move-legacy': moveLegacyData(target); break;
    case 'copy-link': { const page = state.pages.find(p => p.id === id) || current(); removePopovers(); navigator.clipboard.writeText(`${location.origin}/p/${page.id}`).then(() => toast('페이지 링크를 복사했습니다.'), () => toast('링크를 복사하지 못했습니다.', true)); break; }
    case 'new-row': { const db = shownDb(); if (!db) break; const preset = {}; const quick = quickFilterProp(db); if (quick && db.quick.filter) preset[quick.id] = db.quick.filter; if (target.dataset.prop) preset[target.dataset.prop] = target.dataset.value; openRowForm(shownDbId(), null, preset); break; }
    case 'open-row': openRowForm(shownDbId(), id); break;
    case 'row-menu': rowMenu(id, target); break;
    case 'row-page': openRowPage(shownDbId(), id); break;
    case 'search-open-row': closeModal(false); openRowPage(target.dataset.db, id); break;
    case 'close-row': { const rowId = ui.row?.id; ui.row = null; render(); focusKey(`o:${rowId}`)?.focus(); break; }
    case 'row-up': case 'row-down': moveRow(id, action === 'row-up' ? -1 : 1); break;
    case 'row-duplicate': duplicateRow(id); break;
    case 'delete-row': deleteRow(id); break;
    case 'option-menu': optionMenu(target); break;
    case 'toggle-option': { const t = cellTarget(target); if (!t) break; const value = valueOf(t.row, t.prop); const name = target.dataset.value; t.row.values[t.prop.id] = t.prop.options.filter(o => o === name ? !value.includes(o) : value.includes(o)); persist(); target.setAttribute('aria-checked', t.row.values[t.prop.id].includes(name)); refreshDatabaseResults(); break; }
    case 'new-database': addDatabase(id); break;
    case 'filter-add': { const view = activeView(shownDb()); if (view.filters.length >= limits.filters) { toast('필터는 최대 20개까지 추가할 수 있습니다.', true); break; } view.filters.push({ prop: 'title', op: 'contains', value: '' }); persist(); refreshPanel(`필터 ${view.filters.length} 속성`); break; }
    case 'filter-remove': activeView(shownDb()).filters.splice(Number(target.dataset.index), 1); persist(); refreshPanel(null); break;
    case 'sort-add': { const view = activeView(shownDb()); if (view.sorts.length >= limits.sorts) { toast('정렬은 최대 10개까지 추가할 수 있습니다.', true); break; } view.sorts.push({ prop: 'title', dir: 'asc' }); persist(); refreshPanel(`정렬 ${view.sorts.length} 속성`); break; }
    case 'sort-remove': activeView(shownDb()).sorts.splice(Number(target.dataset.index), 1); persist(); refreshPanel(null); break;
    case 'prop-add': { const db = shownDb(); if (db.properties.length >= limits.properties) { toast('속성은 최대 50개까지 추가할 수 있습니다.', true); break; } let name = '속성'; let n = 2; while (db.properties.some(p => p.name === name)) name = `속성 ${n++}`; db.properties.push({ id: uid(), name, type: 'text' }); persist(); refreshPanel(`${name} 속성 이름`); break; }
    case 'prop-move': { const db = shownDb(); const i = db.properties.findIndex(p => p.id === id); const j = i + Number(target.dataset.delta); if (i >= 0 && j >= 0 && j < db.properties.length) { [db.properties[i], db.properties[j]] = [db.properties[j], db.properties[i]]; persist(); refreshPanel(); } break; }
    case 'prop-delete': { const db = shownDb(); const prop = db.properties.find(p => p.id === id); if (!prop) break; if (confirming !== id) { ui.confirmProp = id; refreshPanel(`${prop.name} 속성 삭제 확인`); break; } db.properties = db.properties.filter(p => p !== prop); repair(db); persist(); refreshPanel(null); toast('속성을 삭제했습니다.'); break; }
    case 'option-add': addOption(id); break;
    case 'option-delete': { const db = shownDb(); const prop = db.properties.find(p => p.id === id); if (!prop?.options) break; prop.options.splice(Number(target.dataset.index), 1); repair(db); persist(); refreshPanel(`${prop.name} 새 옵션`); break; }
    case 'view-delete': { const db = shownDb(); if (db.views.length < 2) break; db.views = db.views.filter(v => v !== activeView(db)); db.activeViewId = db.views[0].id; persist(); renderDatabase(); refreshSidebar(); closeModal(); toast('보기를 삭제했습니다.'); break; }
    case 'export-page': { const row = !id && openRow(); const page = state.pages.find(p => p.id === id) || current(); download(`${row ? rowName(row) : pageName(page)}.md`, pageMarkdown(row || page, titleOf), 'text/markdown;charset=utf-8'); toast('페이지를 Markdown으로 내보냈습니다.'); break; }
    case 'export-workspace': download('folio-workspace-backup.json', JSON.stringify(state, null, 2), 'application/json'); toast('백업 파일을 내보냈습니다.'); break;
    case 'import-workspace': $('#import-file').click(); break;
    case 'confirm-import': if (ui.pendingImport) { state = ui.pendingImport; delete state.workspaceId; ui.pendingImport = null; history.clearHistory(); ui.dirty.clear(); ui.snapAt.clear(); ui.query = ''; ui.row = null; ui.sidebarPrefs = sidebarSettings(state); ui.expanded = new Set(ui.sidebarPrefs.expanded); ui.collapsed = ui.sidebarPrefs.collapsed; persist(); closeModal(false); render(); toast('백업을 가져왔습니다.'); } break;
    case 'cancel-import': ui.pendingImport = null; $('#import-feedback').innerHTML = ''; break;
    case 'append-block': { remember(); const b = block(); doc().blocks.push(b); persist(); render(); focusBlock(b.id); break; }
    case 'add-block': { remember(); const list = doc().blocks; const index = list.findIndex(b => b.id === id); const b = block(); if (indentOf(list[index])) b.indent = indentOf(list[index]); list.splice(subtreeEnd(list, index), 0, b); persist(); render(); focusBlock(b.id); break; }
    case 'block-menu': renderBlockMenu(id); break;
    case 'block-type': { const b = doc().blocks.find(b => b.id === id); const type = target.dataset.type; if (type === 'page') { openPagePicker({ id, cut: ui.slash || b.text === '/' ? [0, b.text.length] : null }); break; } if (type === 'image') { if (ui.slash || b.text === '/') { b.text = ''; delete b.marks; persist(); } removePopovers(); render(); focusBlock(id); chooseImages(id); break; } remember(); if (type === 'database' || type === 'subpage') {
      // As in Notion: the block becomes the new page, and that page opens.
      const link = page => { b.type = 'page'; b.target = page.id; b.checked = false; delete b.open; };
      b.text = ''; delete b.marks; removePopovers(); persist();
      if (!(type === 'database' ? addDatabase(current().id, link) : addPage({ parentId: current().id }, link))) { render(); focusBlock(id); }
      break;
    } if (ui.slash) { convertBlock(b, type); break; } b.type = type; delete b.target; if (b.text === '/') b.text = ''; setMarks(b, marksOf(b)); removePopovers(); persist(); render(); focusBlock(id); break; }
    case 'block-duplicate': duplicateBlock(id); break;
    case 'format': applyMark(target.dataset.type); break;
    case 'format-panel': ui.format.panel = ui.format.panel === target.dataset.panel ? null : target.dataset.panel; renderFormatBar(); if (ui.format.panel === 'link') $('#format-bar input').focus(); break;
    case 'format-color': applyMark(target.dataset.kind, target.dataset.value || null, ui.format); break;
    case 'format-unlink': applyMark('link', null, ui.format); break;
    case 'toggle-open': { const b = doc().blocks.find(b => b.id === id); remember(); b.open = b.open === false; persist(); render(); $(`[data-block-id="${id}"] .toggle-arrow`)?.focus(); break; }
    case 'block-delete': deleteBlock(id); break;
    case 'block-up': case 'block-down': { remember(); const list = doc().blocks; const i = list.findIndex(b => b.id === id); const j = i + (action === 'block-up' ? -1 : 1); if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; removePopovers(); persist(); render(); break; }
    case 'move-page': { const page = state.pages.find(p => p.id === id) || current(); const excluded = descendants(state, page.id); showModal('move', '페이지 이동', `<form id="move-form" data-page-id="${esc(page.id)}"><label class="field-label">상위 페이지<select name="parent" aria-label="이동할 상위 페이지"><option value="">개인 페이지 (최상위)</option>${state.pages.filter(p => !p.deleted && !excluded.has(p.id)).map(p => `<option value="${esc(p.id)}" ${p.id === page.parentId ? 'selected' : ''}>${esc(pageName(p))}</option>`).join('')}</select></label><div class="form-footer"><span></span><button class="button primary">이동</button></div></form>`); break; }
    case 'workspace-menu': openWorkspaceMenu(target); break;
    case 'switch-workspace': activateWorkspace(target.dataset.workspace); break;
    case 'new-workspace': showModal('workspace-create', '워크스페이스 만들기', '<p class="dialog-description">문서와 프로젝트를 나누어 담는 공간입니다. 서버에 저장되어 어느 기기에서든 열 수 있습니다.</p><form id="workspace-form"><label class="field-label">이름<input aria-label="새 워크스페이스 이름" name="name" required maxlength="120" autofocus placeholder="예: 사이드 프로젝트"></label><div class="form-footer"><span></span><button class="button primary">워크스페이스 생성</button></div></form>'); break;
    case 'sidebar-page-menu': renderPageMenu(id, target); break;
    case 'sidebar-favorite': { const page = state.pages.find(p => p.id === id); page.favorite = !page.favorite; persist(false); render(); break; }
    case 'rename-page': { const page = state.pages.find(p => p.id === id); showModal('rename', '페이지 이름 바꾸기', `<form id="rename-form" data-page-id="${esc(id)}"><label class="field-label">이름<input aria-label="페이지 이름" name="title" maxlength="500" value="${esc(page.title)}" autofocus></label><div class="form-footer"><span></span><button class="button primary">이름 저장</button></div></form>`); break; }
    case 'sibling-up': reorderSibling(id, -1); break;
    case 'sibling-down': reorderSibling(id, 1); break;
    case 'toggle-section': ui.sidebarPrefs.closed[target.dataset.section] = !ui.sidebarPrefs.closed[target.dataset.section]; saveSidebar(); refreshSidebar(); break;
    case 'section-menu': sectionMenu(target.dataset.section, target); break;
    case 'section-up': case 'section-down': { const order = ui.sidebarPrefs.order; const i = order.indexOf(target.dataset.section); const j = i + (action === 'section-up' ? -1 : 1); if (j >= 0 && j < order.length) [order[i], order[j]] = [order[j], order[i]]; saveSidebar(); refreshSidebar(); break; }
    case 'sidebar-manual': ui.sidebarPrefs.pageSort = 'manual'; saveSidebar(); refreshSidebar(); break;
    case 'sidebar-updated': ui.sidebarPrefs.pageSort = 'updated'; saveSidebar(); refreshSidebar(); break;
    case 'sidebar-limit': ui.sidebarPrefs.limit = Number(target.dataset.limit); saveSidebar(); refreshSidebar(); break;
    case 'sidebar-db-view': { go(id); const db = state.databases[id]; if (db?.views.some(v => v.id === target.dataset.view)) { db.activeViewId = target.dataset.view; persist(false); renderDatabase(); } break; }
  }
});
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'page-title') { current().title = el.value; persist(); updateTitleUI(); if (current().type === 'database') { $('.db-table')?.setAttribute('aria-label', `${pageName(current())} 데이터베이스`); $('#database').setAttribute('aria-label', `${pageName(current())} 관리`); } }
  if (el.dataset.editBlock) onBlockInput(el, event);
  if (el.getAttribute('aria-label') === '워크스페이스 검색') { ui.searchQuery = el.value; $('#search-results').innerHTML = searchResults(el.value); }
  if (el.getAttribute('aria-label') === '페이지 검색') $('#page-picker-results').innerHTML = pickerHTML(el.value);
  if (el.getAttribute('aria-label') === '휴지통 검색') { ui.trashQuery = el.value; $('#trash-list').innerHTML = trashHTML(); }
  if (el.id === 'row-title') { const row = openRow(); if (row) { relabel($('#row-props'), rowName(row), el.value.trim() || '제목 없음'); row.title = el.value; persist(); $('#row-crumb').textContent = rowName(row); document.title = `${rowName(row)} — Folio`; } }
  if (el.getAttribute('aria-label') === '데이터베이스 검색') { ui.query = el.value; refreshDatabaseResults(); }
  if (el.dataset.cell) { const t = cellTarget(el); if (t && ['text', 'url', 'number'].includes(t.prop.type)) { t.row.values[t.prop.id] = cleanValue(t.prop, el.value); persist(); ui.staleCells = true; refreshTotals(); } }
  if (ui.modal === 'db-panel' && el.closest('#db-panel')) onPanelInput(el);
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (el.getAttribute('aria-label') === '검색 범위') { ui.searchScope = el.value; $('#search-results').innerHTML = searchResults(ui.searchQuery); }
  if (el.getAttribute('aria-label') === '검색 정렬') { ui.searchSort = el.value; $('#search-results').innerHTML = searchResults(ui.searchQuery); }
  if (el.dataset.check) { remember(); doc().blocks.find(b => b.id === el.dataset.check).checked = el.checked; persist(); $(`[data-edit-block="${el.dataset.check}"]`).classList.toggle('checked', el.checked); }
  if (el.dataset.quick === 'filter') { const db = shownDb(); if (db) { db.quick.filter = quickFilterProp(db)?.options.includes(el.value) ? el.value : ''; persist(false); refreshDatabaseResults(); } }
  if (el.dataset.total) { const db = shownDb(); const prop = db?.properties.find(p => p.id === el.dataset.total); if (prop) { const view = activeView(db); if (el.value !== 'none' && calcsFor(prop).some(([name]) => name === el.value)) view.totals[prop.id] = el.value; else delete view.totals[prop.id]; persist(false); refreshDatabaseResults(); } }
  if (el.dataset.cell) { const t = cellTarget(el); if (t && ['select', 'date', 'checkbox'].includes(t.prop.type)) { t.row.values[t.prop.id] = cleanValue(t.prop, t.prop.type === 'checkbox' ? el.checked : el.value); persist(); refreshDatabaseResults(); } }
  if (ui.modal === 'db-panel' && el.closest('#db-panel')) onPanelChange(el);
  if ((el.id === 'import-md' || el.id === 'import-csv') && el.files[0]) {
    const file = el.files[0]; const kind = el.id; el.value = '';
    try {
      if (file.size > MAX_IMPORT_SIZE) throw new Error('2MB 이하의 파일을 선택해 주세요.');
      const name = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 500) || '가져온 페이지';
      if (kind === 'import-md') importMarkdown(await file.text(), name); else importCSV(await file.text(), name);
    } catch (error) { if ($('#import-feedback')) $('#import-feedback').textContent = error.message || '파일을 읽을 수 없습니다.'; }
  }
  if (el.id === 'import-file' && el.files[0]) {
    try { if (el.files[0].size > 5_000_000) throw new Error('5MB 이하의 파일을 선택해 주세요.'); ui.pendingImport = validateWorkspace(JSON.parse(await el.files[0].text())); $('#import-feedback').innerHTML = `<div class="import-confirm"><p>현재 워크스페이스를 백업의 페이지 ${ui.pendingImport.pages.length}개로 교체합니다. 먼저 현재 데이터를 내보내는 것을 권장합니다.</p><button type="button" class="button danger" data-action="confirm-import">백업으로 교체</button><button type="button" class="button" data-action="cancel-import">가져오기 취소</button></div>`; }
    catch (error) { ui.pendingImport = null; $('#import-feedback').textContent = error.message || '백업을 읽을 수 없습니다.'; }
    el.value = '';
  }
});
document.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target; const data = new FormData(form);
  if (form.id === 'row-form') {
    const db = state.databases[form.dataset.db]; if (!db) return;
    const title = String(data.get('title')).trim().slice(0, 500); if (!title) { $('[name="title"]', form).focus(); return; }
    let row = db.rows.find(r => r.id === form.dataset.rowId); const created = !row;
    if (created) { if (db.rows.length >= limits.rows) return; row = makeRow(db); db.rows.push(row); }
    row.title = title;
    for (const p of db.properties) row.values[p.id] = cleanValue(p, p.type === 'multi' ? data.getAll(`p-${p.id}`) : p.type === 'checkbox' ? data.has(`p-${p.id}`) : data.get(`p-${p.id}`));
    if (created) {
      // A new row must not vanish behind the search or the quick filter.
      const view = activeView(db);
      if (ui.query && !visibleRows(db, view, ui.query).includes(row)) ui.query = '';
      if (!visibleRows(db, view, ui.query).includes(row)) db.quick.filter = '';
      const date = view.type === 'calendar' && dateProp(db, view); if (date && valueOf(row, date)) ui.month = valueOf(row, date).slice(0, 7);
    }
    persist();
    if (event.submitter?.value === 'page') { closeModal(false); openRowPage(form.dataset.db, row.id); }
    else { renderDatabase(); closeModal(); }
    toast(`${josa(db.itemName, '을', '를')} 저장했습니다.`);
  }
  if (form.id === 'settings-form') { const name = String(data.get('name')).trim(); if (!name) return; state.settings.name = name; state.settings.theme = data.get('theme'); persist(); closeModal(false); render(); toast('설정을 저장했습니다.'); }
  if (form.id === 'move-form') { try { const parent = data.get('parent') || null; reparent(form.dataset.pageId, parent); if (parent) ui.expanded.add(parent); saveSidebar(); closeModal(false); render(); toast('페이지를 이동했습니다.'); } catch (error) { toast(error.message, true); } }
  if (form.id === 'rename-form') { const page = state.pages.find(p => p.id === form.dataset.pageId); page.title = String(data.get('title')).trim().slice(0, 500) || '제목 없음'; page.updatedAt = new Date().toISOString(); persist(false); closeModal(false); render(); }
  if (form.id === 'link-form') { const href = safeHref(data.get('href')); if (!href) { toast('http, https, mailto 주소만 연결할 수 있습니다.', true); return; } applyMark('link', href, ui.format); }
  if (form.id === 'emoji-form') { const emoji = firstEmoji(String(data.get('emoji'))); if (!emoji) { toast('이모지 하나를 입력해 주세요.', true); $('input', form).focus(); return; } setIcon(emoji); }
  if (form.id === 'workspace-form') activateWorkspace(null, String(data.get('name')));
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.code === 'Backslash') { event.preventDefault(); if (innerWidth <= 760) ui.sidebar = !ui.sidebar; else ui.collapsed = !ui.collapsed; saveSidebar(); render(); return; }
  if (event.target.matches('.sidebar-resizer') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const width = event.key === 'Home' ? 220 : event.key === 'End' ? 420 : ui.sidebarPrefs.width + (event.key === 'ArrowRight' ? 10 : -10); ui.sidebarPrefs.width = Math.min(420, Math.max(220, width)); saveSidebar(); render(); $('.sidebar-resizer').focus(); return; }
  const menu = event.target.closest('.popover');
  if (menu && !event.target.matches('input') && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const items = $$('button:not([disabled]),a[href]', menu); const i = items.indexOf(document.activeElement); const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[next]?.focus(); return; }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase()) && !ui.modal && !event.target.matches('input,textarea,select') && (current().type !== 'database' || openRow())) { event.preventDefault(); undoRedo(event.shiftKey || event.key.toLowerCase() === 'y'); return; }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!openLinkEditor()) openSearch(); return; }
  if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); addPage(); return; }
  if (event.key === 'Escape') { closeFormatBar(true); removePopovers(); if (ui.modal) closeModal(); if (ui.sidebar) { ui.sidebar = false; render(); } }
  if (ui.modal && event.key === 'Tab') { const controls = $$('button:not([disabled]), a[href], input:not([hidden]), select, textarea, [tabindex="0"]', $('.modal')).filter(el => el.getClientRects().length); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  if (event.key === 'Enter' && event.target.matches?.('input[data-cell]:not([type="checkbox"])')) { event.preventDefault(); refreshDatabaseResults(); return; }
  if (event.key === 'Enter' && event.target.dataset?.newOption) { event.preventDefault(); addOption(event.target.dataset.newOption); return; }
  if (event.target.dataset?.editBlock) onBlockKeydown(event, event.target);
});
// The invisible caret holder has done its job once real text sits next to it.
function dropUsedHold(el) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); const used = [];
  while (walker.nextNode()) if (walker.currentNode.data.includes(HOLD) && walker.currentNode.data.length > 1) used.push(walker.currentNode);
  if (!used.length) return;
  const pos = selectionOffsets(el);
  for (const node of used) node.data = node.data.replaceAll(HOLD, '');
  if (pos) setSelection(el, pos.start, pos.end);
}
function onBlockInput(el, event) {
  const page = doc(); const b = page.blocks.find(b => b.id === el.dataset.editBlock); if (!b) return;
  const { text, marks } = readInline(el);
  history.typing(page, b.id);
  b.text = text.slice(0, MAX_TEXT); setMarks(b, marks);
  if (text.length > MAX_TEXT) setBlockContent(el, b, MAX_TEXT);
  else if (!text && el.firstChild) el.replaceChildren();
  persist();
  if (/^h[123]$/.test(b.type)) refreshToc();
  // The menu follows the text while Korean is still being composed, too.
  if (event.isComposing) { showSlash(b, true); return; }
  dropUsedHold(el);
  if (applyShortcut(b, el, event) || applyInlineShortcut(b, el, event)) return;
  // Typing "[[" opens the page picker to link a page.
  if (b.type !== 'code' && event.inputType === 'insertText' && event.data === '[') { const pos = selectionOffsets(el); if (pos && pos.start === pos.end && b.text.slice(pos.start - 2, pos.start) === '[[') { openPagePicker({ id: b.id, cut: [pos.start - 2, pos.start] }); return; } }
  showSlash(b);
}
// Opens, filters or closes the slash menu to match what the block says.
function showSlash(b, composing = false) {
  const slash = /^\/(\S{0,30})$/.exec(b.text);
  if (b.text === '/') renderBlockMenu(b.id, { query: '', active: 0 });
  else if (slash && ((ui.blockMenu === b.id && ui.slash) || composing)) renderBlockMenu(b.id, { query: slash[1], active: 0 });
  else if (ui.blockMenu === b.id && (ui.slash || !b.text.startsWith('/'))) removePopovers();
}
// Markdown shortcuts fire only for text typed one key at a time, so pasted text such as "# title" stays literal.
function applyShortcut(b, el, event) {
  if (b.type !== 'text' || event.inputType !== 'insertText' || !event.data || event.data.length !== 1) return false;
  const pos = selectionOffsets(el); if (!pos || pos.start !== pos.end) return false;
  const before = b.text.slice(0, pos.start); let type = null;
  if (event.data === ' ' && before.endsWith(' ')) type = markdownShortcut(before.slice(0, -1));
  else if (event.data === '`' && before === '```') type = 'code';
  else if (event.data === '-' && b.text === '---') type = 'divider';
  if (!type) return false;
  remember(); convertBlock(b, type, type === 'divider' ? null : pos.start);
  return true;
}
// Inline Markdown such as **bold** converts as soon as its closing mark is typed.
function applyInlineShortcut(b, el, event) {
  if (b.type === 'code' || event.inputType !== 'insertText' || !event.data || !'*`~'.includes(event.data)) return false;
  const pos = selectionOffsets(el); if (!pos || pos.start !== pos.end) return false;
  const result = inlineShortcut(b.text, marksOf(b), pos.start); if (!result) return false;
  b.text = result.text; setMarks(b, result.marks);
  // Typing continues unformatted after the converted run.
  el.innerHTML = inlineHTML(b, { offset: result.caret, marks: marksAt(result.marks, result.caret).filter(m => m.type !== result.type) });
  setSelection(el, result.caret); persist();
  return true;
}
// Toggles formatting on the selection (`range` when the selection has moved into the toolbar).
// With only a caret, it changes the formatting of what is typed next.
function applyMark(type, value = null, range = null) {
  const id = range?.id || document.activeElement?.dataset?.editBlock; const el = id && editable(id);
  const b = el && doc().blocks.find(b => b.id === id); if (!b || b.type === 'code') return;
  const pos = range || selectionOffsets(el); if (!pos) return;
  if (pos.start === pos.end) {
    if (['link', 'color', 'bg'].includes(type)) return;
    const active = nodeMarks(getSelection().anchorNode, el);
    el.innerHTML = inlineHTML(b, { offset: pos.start, marks: active.some(m => m.type === type) ? active.filter(m => m.type !== type) : [...active, { type }] });
    setSelection(el, pos.start); return;
  }
  remember(); setMarks(b, toggleMark(marksOf(b), pos.start, pos.end, type, value)); persist();
  setBlockContent(el, b); el.focus(); setSelection(el, pos.start, pos.end);
  if (ui.format && type === 'link') ui.format.panel = null;
  showFormatBar();
}
const formatButtons = [['bold', '굵게', 'B'], ['italic', '기울임', 'I'], ['underline', '밑줄', 'U'], ['strike', '취소선', 'S'], ['code', '인라인 코드', '&lt;/&gt;']];
function renderFormatBar() {
  const f = ui.format; const bar = $('#format-bar'); const b = f && doc().blocks.find(b => b.id === f.id); if (!b || !bar) return;
  const marks = marksOf(b); const inRange = type => marksIn(marks, f.start, f.end).find(m => m.type === type);
  const swatches = (kind, label) => `<div class="swatch-row" role="group" aria-label="${label}"><span>${label}</span><button type="button" class="swatch" data-action="format-color" data-kind="${kind}" data-value="" aria-label="${label} 기본" aria-pressed="${!inRange(kind)}">가</button>${colors.map(([name, title]) => `<button type="button" class="swatch" data-action="format-color" data-kind="${kind}" data-value="${name}" aria-label="${label} ${title}" aria-pressed="${inRange(kind)?.value === name}"><span data-${kind}="${name}">가</span></button>`).join('')}</div>`;
  bar.innerHTML = `<div class="format-buttons">${formatButtons.map(([type, label, glyph]) => `<button type="button" class="format-${type}" data-action="format" data-type="${type}" aria-label="${label}" aria-pressed="${covers(marks, f.start, f.end, type)}">${glyph}</button>`).join('')}<button type="button" data-action="format-panel" data-panel="link" aria-label="링크" aria-pressed="${!!inRange('link')}" aria-expanded="${f.panel === 'link'}">${icon('external')}</button><button type="button" class="format-color" data-action="format-panel" data-panel="color" aria-label="색상" aria-expanded="${f.panel === 'color'}">A</button></div>
    ${f.panel === 'link' ? `<form id="link-form"><input name="href" aria-label="링크 주소" placeholder="https://example.com" maxlength="2000" value="${esc(inRange('link')?.value || '')}"><button class="button primary small">적용</button>${inRange('link') ? '<button type="button" class="button small" data-action="format-unlink">링크 제거</button>' : ''}</form>` : ''}${f.panel === 'color' ? `<div class="format-colors">${swatches('color', '글자색')}${swatches('bg', '배경색')}</div>` : ''}`;
}
// Shows the formatting toolbar above the current text selection, or hides it when there is none.
function showFormatBar() {
  let bar = $('#format-bar');
  if (bar?.contains(document.activeElement)) return;
  const el = document.activeElement?.dataset?.editBlock ? document.activeElement : null;
  const pos = el && selectionOffsets(el); const b = el && doc().blocks.find(b => b.id === el.dataset.editBlock);
  if (!pos || pos.start === pos.end || !b || b.type === 'code' || ui.modal) { closeFormatBar(); return; }
  const same = ui.format && ui.format.id === b.id && ui.format.start === pos.start && ui.format.end === pos.end;
  ui.format = { id: b.id, start: pos.start, end: pos.end, panel: same ? ui.format.panel : null };
  if (!bar) { bar = document.createElement('div'); bar.id = 'format-bar'; bar.className = 'format-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '텍스트 서식'); document.body.append(bar); }
  renderFormatBar();
  const rect = getSelection().getRangeAt(0).getBoundingClientRect(); const above = rect.top - bar.offsetHeight - 8;
  bar.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - bar.offsetWidth - 8))}px`;
  bar.style.top = `${above < 8 ? rect.bottom + 8 : above}px`;
}
function closeFormatBar(restore = false) {
  const bar = $('#format-bar'); if (!bar) return;
  const inside = bar.contains(document.activeElement); const f = ui.format;
  bar.remove(); ui.format = null;
  if (restore && inside && f && editable(f.id)) focusBlock(f.id, f.end);
}
function openLinkEditor() {
  const el = document.activeElement?.dataset?.editBlock ? document.activeElement : null; const pos = el && selectionOffsets(el);
  if (!pos || pos.start === pos.end) return false;
  showFormatBar(); if (!ui.format) return false;
  ui.format.panel = 'link'; renderFormatBar(); $('#format-bar input').focus(); return true;
}
// Pasting keeps plain text only; several lines become several blocks.
function pasteText(el, text) {
  const list = doc().blocks; const index = list.findIndex(b => b.id === el.dataset.editBlock); const b = list[index]; if (!b) return;
  const pos = selectionOffsets(el) || { start: b.text.length, end: b.text.length };
  const lines = text.split('\n'); removePopovers();
  if (b.type === 'code' || lines.length === 1) { insertIntoBlock(el, b, pos, text); return; }
  remember();
  const marks = marksOf(b); const tail = { text: b.text.slice(pos.end), marks: sliceMarks(marks, pos.end, b.text.length) };
  b.text = (b.text.slice(0, pos.start) + lines[0]).slice(0, MAX_TEXT); setMarks(b, sliceMarks(marks, 0, pos.start));
  const room = Math.max(0, 10000 - list.length); const rest = lines.slice(1).filter(line => line.trim());
  if (rest.length > room) toast('블록은 페이지당 최대 10,000개까지 만들 수 있습니다.', true);
  const type = ['bullet', 'numbered', 'todo'].includes(b.type) ? b.type : 'text';
  const added = rest.slice(0, room).map(line => { const next = block(type, line.slice(0, MAX_TEXT)); if (indentOf(b)) next.indent = indentOf(b); return next; });
  list.splice(index + 1, 0, ...added);
  const last = added.at(-1) || b; const joint = last.text.length;
  const merged = [...marksOf(last), ...shiftMarks(tail.marks, joint)]; last.text = (last.text + tail.text).slice(0, MAX_TEXT); setMarks(last, merged);
  persist(); render(); focusBlock(last.id, joint);
}
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const IMAGE_LIMIT = 20 * 1048576;
const imagesIn = files => [...(files || [])].filter(file => file.type.startsWith('image/'));
// Uploads the images and puts each in a block of its own below the block `anchorId`.
async function insertImages(files, anchorId) {
  let added = 0;
  for (const file of files) {
    if (!IMAGE_TYPES.includes(file.type)) { toast('PNG, JPG, GIF, WebP 이미지만 넣을 수 있습니다.', true); continue; }
    if (file.size > IMAGE_LIMIT) { toast('이미지는 20MB까지 넣을 수 있습니다.', true); continue; }
    if (!added) toast('이미지를 올리는 중…');
    let saved; try { saved = await sync.uploadFile(file); } catch (error) { toast(error.message, true); continue; }
    // The upload takes a while: the page may have changed meanwhile.
    const list = doc().blocks; const at = list.findIndex(b => b.id === anchorId);
    if (at < 0) { toast('페이지가 바뀌어 이미지를 넣지 못했습니다.', true); return; }
    remember();
    const anchor = list[at]; const image = { ...block('image', saved.name.slice(0, 200)), file: saved.id };
    if (indentOf(anchor)) image.indent = indentOf(anchor);
    // An empty line gives its place to the image and stays below it.
    const empty = anchor.type === 'text' && !anchor.text;
    list.splice(empty ? at : at + 1, 0, image);
    if (!empty) anchorId = image.id;
    if (list.at(-1) === image) list.push(block());
    added++; persist(); render();
    const next = list[list.indexOf(image) + 1]; if (next) focusBlock(next.id, 0);
  }
  if (added) toast(added > 1 ? `이미지 ${added}개를 넣었습니다.` : '이미지를 넣었습니다.');
}
function chooseImages(anchorId) {
  const input = document.createElement('input'); input.type = 'file'; input.accept = IMAGE_TYPES.join(','); input.multiple = true;
  input.addEventListener('change', () => { if (input.files.length) insertImages([...input.files], anchorId); });
  input.click();
}
document.addEventListener('paste', event => {
  const el = (event.target.closest ? event.target : event.target.parentElement)?.closest('[data-edit-block]'); if (!el) return;
  event.preventDefault();
  const text = (event.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
  const images = text ? [] : imagesIn(event.clipboardData?.files);
  if (images.length) insertImages(images, el.dataset.editBlock); else if (text) pasteText(el, text);
});
// Browser-native formatting commands would write markup this editor does not track.
document.addEventListener('beforeinput', event => { if (event.target.dataset?.editBlock && event.inputType.startsWith('format')) event.preventDefault(); });
// Keep the text selection while the toolbar buttons are pressed.
document.addEventListener('mousedown', event => { if (event.target.closest?.('#format-bar') && !event.target.closest('input')) event.preventDefault(); });
document.addEventListener('selectionchange', showFormatBar);
function onBlockKeydown(event, el) {
  if (event.isComposing) return;
  const page = doc(); const list = page.blocks; const index = list.findIndex(b => b.id === el.dataset.editBlock); const b = list[index]; if (!b) return;
  const mod = event.ctrlKey || event.metaKey; const key = event.key;
  const pos = selectionOffsets(el) || { start: b.text.length, end: b.text.length };
  if (ui.slash && ui.blockMenu === b.id && ['ArrowDown', 'ArrowUp', 'Enter'].includes(key)) {
    event.preventDefault();
    if (key === 'Enter') { $('.block-menu [aria-selected="true"]')?.click(); return; }
    const count = slashMatches(menuOptions(), ui.slash.query).length;
    renderBlockMenu(b.id, { query: ui.slash.query, active: (ui.slash.active + (key === 'ArrowDown' ? 1 : -1) + count) % count });
    return;
  }
  const format = mod && !event.altKey && ({ b: 'bold', i: 'italic', u: 'underline', e: 'code' }[event.shiftKey ? '' : key.toLowerCase()] || (event.shiftKey && key.toLowerCase() === 's' ? 'strike' : null));
  if (format) { event.preventDefault(); applyMark(format); return; }
  if (key === 'Enter' && (event.shiftKey || (b.type === 'code' && !mod))) { event.preventDefault(); insertIntoBlock(el, b, pos, '\n'); return; }
  if (key === 'Enter') {
    event.preventDefault(); removePopovers();
    if (list.length >= 10000) { toast('블록은 페이지당 최대 10,000개까지 만들 수 있습니다.', true); return; }
    remember();
    if (!b.text && listTypes.includes(b.type)) { if (indentOf(b)) b.indent = indentOf(b) - 1; else b.type = 'text'; persist(); render(); focusBlock(b.id); return; }
    const open = b.type === 'toggle' && b.open !== false;
    const next = block(['todo', 'bullet', 'numbered'].includes(b.type) || (b.type === 'toggle' && !open) ? b.type : 'text');
    if (b.type !== 'code') { const marks = marksOf(b); next.text = b.text.slice(pos.end); setMarks(next, sliceMarks(marks, pos.end, b.text.length)); b.text = b.text.slice(0, pos.start); setMarks(b, sliceMarks(marks, 0, pos.start)); }
    const depth = Math.min(6, indentOf(b) + (open ? 1 : 0)); if (depth) next.indent = depth;
    list.splice(b.type === 'toggle' && !open ? subtreeEnd(list, index) : index + 1, 0, next);
    persist(); render(); focusBlock(next.id, 0); return;
  }
  if (key === 'Backspace' && pos.start === 0 && pos.end === 0 && !mod) {
    if (b.type !== 'text') { event.preventDefault(); remember(); b.type = 'text'; setMarks(b, marksOf(b)); persist(); render(); focusBlock(b.id, 0); return; }
    if (indentOf(b)) { event.preventDefault(); remember(); shiftIndent(list, index, -1); persist(); render(); focusBlock(b.id, 0); return; }
    if (!b.text) {
      if (list.length < 2) return;
      event.preventDefault(); remember(); const focusId = list[index ? index - 1 : index + 1].id; list.splice(index, 1); persist(); render(); focusBlock(focusId); return;
    }
    if (!index) return;
    event.preventDefault(); remember(); const previous = list[index - 1];
    if (staticTypes.includes(previous.type)) { const linked = linkedPages(); list.splice(index - 1, 1); settleChildren(linked); persist(); render(); focusBlock(b.id, 0); return; }
    const target = visibleNeighbor(index, -1) || previous; const joint = target.text.length;
    const merged = [...marksOf(target), ...shiftMarks(marksOf(b), joint)];
    target.text = (target.text + b.text).slice(0, MAX_TEXT); setMarks(target, merged); list.splice(index, 1); persist(); render(); focusBlock(target.id, joint); return;
  }
  if (key === 'Tab' && !mod && !event.altKey) {
    event.preventDefault();
    if (b.type === 'code') { if (!event.shiftKey) insertIntoBlock(el, b, pos, '  '); return; }
    const before = JSON.stringify(list);
    if (shiftIndent(list, index, event.shiftKey ? -1 : 1)) { history.snapshot({ id: page.id, blocks: JSON.parse(before) }); persist(); render(); focusBlock(b.id, pos.start); }
    return;
  }
  if ((key === 'ArrowUp' || key === 'ArrowDown') && !event.shiftKey && !mod && !event.altKey && caretOnEdge(el, key === 'ArrowUp' ? -1 : 1)) {
    const target = visibleNeighbor(index, key === 'ArrowUp' ? -1 : 1);
    if (target) { event.preventDefault(); removePopovers(); focusBlock(target.id, Math.min(pos.start, target.text.length)); }
    return;
  }
  if (mod && !event.shiftKey && !event.altKey && key.toLowerCase() === 'd') { event.preventDefault(); duplicateBlock(b.id); }
}
document.addEventListener('dragstart', event => { const row = event.target.closest('[data-drag-row]'); const b = event.target.closest('[data-drag-block]'); if (row) { ui.draggedRow = row.dataset.dragRow; event.dataTransfer.setData('text/plain', ui.draggedRow); } if (b) { ui.draggedBlock = b.dataset.dragBlock; event.dataTransfer.setData('text/plain', ui.draggedBlock); } });
document.addEventListener('dragover', event => { if (!event.target.closest) return; if ((ui.draggedRow && event.target.closest('[data-drop-group],[data-drop-date],[data-row]')) || ((ui.draggedBlock || event.dataTransfer?.types.includes('Files')) && event.target.closest('[data-block-id]'))) event.preventDefault(); });
document.addEventListener('drop', event => { const origin = event.target.closest ? event.target : event.target.parentElement; const dropped = imagesIn(event.dataTransfer?.files); const onto = origin?.closest('[data-block-id]'); if (dropped.length && onto) { event.preventDefault(); insertImages(dropped, onto.dataset.blockId); return; } if (!ui.draggedBlock && !ui.draggedRow && !ui.draggedPage && origin?.closest('[data-edit-block]')) { event.preventDefault(); return; } const place = ui.draggedRow && event.target.closest('[data-drop-group],[data-drop-date],[data-row]'); const targetBlock = event.target.closest('[data-block-id]'); if (place) { event.preventDefault(); dropDraggedRow(place); } if (targetBlock && ui.draggedBlock) { event.preventDefault(); const list = doc().blocks; const from = list.findIndex(b => b.id === ui.draggedBlock); const to = list.findIndex(b => b.id === targetBlock.dataset.blockId); if (from >= 0 && to >= 0) { remember(); const [item] = list.splice(from, 1); list.splice(to, 0, item); persist(); render(); } } ui.draggedRow = null; ui.draggedBlock = null; });
document.addEventListener('dragend', () => { ui.draggedRow = null; ui.draggedBlock = null; });
// Text typed into a cell is saved at once; the rows are sorted and filtered again when focus leaves them.
document.addEventListener('focusout', event => { const root = event.target.closest?.('#database-results,#row-props'); if (root && ui.staleCells && !root.contains(event.relatedTarget)) setTimeout(() => { if (ui.staleCells) refreshDatabaseResults(); }, 0); });
document.addEventListener('compositionstart', () => { ui.composing = true; });
document.addEventListener('compositionend', () => { ui.composing = false; });
// Back and Forward walk through the pages that were open.
window.addEventListener('popstate', () => {
  flushVersions(); const before = state.activeId;
  if (!openAddress()) { toast('페이지를 찾을 수 없습니다.', true); syncAddress(); return; }
  if (state.activeId !== before) rememberPage(state.activeId);
  ui.menu = null; ui.blockMenu = null; ui.query = ''; closeModal(false); removePopovers(); saveSidebar(); render();
});
document.addEventListener('contextmenu', event => {
  const row = event.target.closest('[data-sidebar-page]');
  if (!row) return;
  event.preventDefault(); renderPageMenu(row.dataset.sidebarPage, row);
  $('.page-menu [role="menuitem"]')?.focus();
});
document.addEventListener('keydown', event => {
  const row = event.target.closest('[data-sidebar-page]');
  if (row && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) { event.preventDefault(); renderPageMenu(row.dataset.sidebarPage, row); $('.page-menu [role="menuitem"]')?.focus(); }
});
let resizing = null;
document.addEventListener('pointerdown', event => {
  if (!event.target.matches('.sidebar-resizer') || event.button !== 0) return;
  event.preventDefault(); resizing = { pointerId: event.pointerId, x: event.clientX, width: ui.sidebarPrefs.width };
  event.target.setPointerCapture(event.pointerId); document.documentElement.classList.add('resizing-sidebar');
});
document.addEventListener('pointermove', event => {
  if (!resizing || resizing.pointerId !== event.pointerId) return;
  ui.sidebarPrefs.width = Math.round(Math.min(420, Math.max(220, resizing.width + event.clientX - resizing.x)));
  document.documentElement.style.setProperty('--sidebar-width', `${ui.sidebarPrefs.width}px`);
  $('.sidebar-resizer')?.setAttribute('aria-valuenow', String(ui.sidebarPrefs.width));
});
function endSidebarResize(event) { if (resizing?.pointerId === event.pointerId) { resizing = null; document.documentElement.classList.remove('resizing-sidebar'); saveSidebar(); } }
document.addEventListener('pointerup', endSidebarResize);
document.addEventListener('pointercancel', endSidebarResize);
function clearPageDropHighlights() { $$('.drop-inside,.drop-before,.drop-after,.drop-highlight').forEach(el => el.classList.remove('drop-inside', 'drop-before', 'drop-after', 'drop-highlight')); }
function pageDropPosition(event) {
  const row = event.target.closest('[data-sidebar-page]');
  if (!row) return null;
  const bounds = row.getBoundingClientRect(); const offset = (event.clientY - bounds.top) / bounds.height;
  return { row, position: offset < .24 ? 'before' : offset > .76 ? 'after' : 'inside' };
}
document.addEventListener('dragstart', event => {
  const page = event.target.closest('[data-drag-page]'); if (!page) return;
  ui.draggedPage = page.dataset.dragPage; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', ui.draggedPage); document.documentElement.classList.add('dragging-page');
});
document.addEventListener('dragover', event => {
  if (!ui.draggedPage) return;
  const drop = pageDropPosition(event); const special = event.target.closest('[data-root-drop],[data-drop-favorite],[data-action="trash"]');
  if (!drop && !special) return;
  event.preventDefault(); event.dataTransfer.dropEffect = 'move'; clearPageDropHighlights();
  if (drop) drop.row.classList.add(`drop-${drop.position}`); else special.classList.add('drop-highlight');
});
document.addEventListener('drop', event => {
  const id = ui.draggedPage; if (!id) return;
  const drop = pageDropPosition(event); const root = event.target.closest('[data-root-drop]'); const favorite = event.target.closest('[data-drop-favorite]'); const toTrash = event.target.closest('[data-action="trash"]');
  if (!drop && !root && !favorite && !toTrash) return;
  event.preventDefault(); clearPageDropHighlights(); document.documentElement.classList.remove('dragging-page'); ui.draggedPage = null;
  try {
    if (toTrash) trash(id);
    else if (drop) {
      const target = state.pages.find(p => p.id === drop.row.dataset.sidebarPage);
      if (drop.position === 'inside') { reparent(id, target.id); ui.expanded.add(target.id); }
      else { const siblings = state.pages.filter(p => !p.deleted && p.parentId === target.parentId && p.id !== id); const i = siblings.indexOf(target); const before = drop.position === 'before' ? target.id : siblings[i + 1]?.id || null; reparent(id, target.parentId, before); }
      ui.sidebarPrefs.pageSort = 'manual';
    } else if (favorite) state.pages.find(p => p.id === id).favorite = true;
    else reparent(id, null);
    saveSidebar(); render();
  } catch (error) { toast(error.message, true); }
});
document.addEventListener('dragend', () => { ui.draggedPage = null; clearPageDropHighlights(); document.documentElement.classList.remove('dragging-page'); });
window.addEventListener('pagehide', () => flushVersions(true));
sync.attach({ current: () => state, replace: adopt, status: showSaveState });
const addressFound = openAddress();
render();
{
  let notice = ''; try { notice = sessionStorage.getItem(NOTICE_KEY) || ''; sessionStorage.removeItem(NOTICE_KEY); } catch {}
  if (started.error) toast(started.error, true);
  else if (!addressFound) toast('페이지를 찾을 수 없어 마지막으로 보던 페이지를 열었습니다.', true);
  else if (started.notice) toast(started.notice, true);
  else if (notice) toast(notice);
}
