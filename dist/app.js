import { databaseHTML as renderDatabaseHTML, databaseResults, filteredTasks } from './database-view.js';
import { icon } from './icons.js';
import { block, uid, statuses, priorities, blockTypes, loadWorkspace, initialWorkspace, saveWorkspace, STORAGE_KEY, createPage, duplicatePage, trashPage, restorePage, descendants, validateWorkspace, pageMarkdown } from './store.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
let state; let startupError = '';
try { state = loadWorkspace(); } catch { state = initialWorkspace(); startupError = '저장된 데이터를 읽지 못했습니다. 기존 저장 파일을 덮어쓰지 않도록 백업을 먼저 확인해 주세요.'; }
let persistenceBlocked = !!startupError;
let lastSavedRaw = null;
try { lastSavedRaw = localStorage.getItem(STORAGE_KEY); } catch {}
const savedDatabase = state.settings.database || {};
const ui = { sidebar: false, collapsed: false, view: savedDatabase.view === 'board' ? 'board' : 'table', query: '', status: statuses.includes(savedDatabase.status) ? savedDatabase.status : '', sort: ['asc', 'desc'].includes(savedDatabase.sort) ? savedDatabase.sort : 'none', menu: null, blockMenu: null, modal: null, expanded: new Set(['wiki']), lastFocus: null, pendingImport: null, draggedTask: null, draggedBlock: null };
const current = () => state.pages.find(p => p.id === state.activeId && !p.deleted) || state.pages.find(p => !p.deleted);
const pageName = page => page.title.trim() || '제목 없음';
const formatDate = value => value ? `${Number(value.slice(5, 7))}월 ${Number(value.slice(8, 10))}일` : '날짜 없음';
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `visible${error ? ' error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.className = '', 3300);
}
function persist() {
  current().updatedAt = new Date().toISOString();
  try { if (persistenceBlocked) throw new Error(); if (localStorage.getItem(STORAGE_KEY) !== lastSavedRaw) { persistenceBlocked = true; throw new Error(); } saveWorkspace(state); lastSavedRaw = localStorage.getItem(STORAGE_KEY); if ($('#save-state')) $('#save-state').innerHTML = `${icon('check')}<span>저장됨</span>`; }
  catch { if ($('#save-state')) $('#save-state').innerHTML = '<span class="save-error">저장 안 됨 · 백업 필요</span>'; if (!persist.warned) { toast('브라우저에 저장하지 못했습니다. 설정에서 백업을 내보내 주세요.', true); persist.warned = true; } }
}
function go(id) { state.activeId = id; ui.sidebar = false; ui.menu = null; ui.blockMenu = null; persist(); render(); $('.main-scroll').scrollTop = 0; }
function addPage(options = {}) { if (state.pages.length >= 1000) { toast('페이지는 최대 1,000개까지 만들 수 있습니다.', true); return; } const page = createPage(state, options); if (page.parentId) ui.expanded.add(page.parentId); persist(); ui.sidebar = false; closeModal(false); render(); $('#page-title').focus(); $('#page-title').select(); }
function navButton(action, label, glyph, extra = '') { return `<button class="nav-button" data-action="${action}" ${extra}>${icon(glyph)}<span>${label}</span></button>`; }
function tree(parentId = null, depth = 0) {
  return state.pages.filter(p => p.parentId === parentId && !p.deleted).map(p => {
    const hasChildren = state.pages.some(c => c.parentId === p.id && !c.deleted);
    return `<div class="tree-row ${p.id === state.activeId ? 'active' : ''}" style="--depth:${depth}">
      <button class="tree-toggle ${ui.expanded.has(p.id) ? 'expanded' : ''} ${!hasChildren ? 'leaf' : ''}" data-action="expand" data-id="${esc(p.id)}" aria-label="${esc(pageName(p))} 하위 페이지" aria-expanded="${ui.expanded.has(p.id)}">${icon('chevron')}</button>
      <button class="page-link" data-action="open" data-id="${esc(p.id)}" aria-label="페이지 열기: ${esc(pageName(p))}" ${p.id === state.activeId ? 'aria-current="page"' : ''}>${icon(p.icon)}<span data-page-name="${esc(p.id)}">${esc(pageName(p))}</span></button>
      <button class="tree-add" data-action="subpage" data-id="${esc(p.id)}" aria-label="${esc(pageName(p))} 하위 페이지 추가">${icon('plus')}</button>
    </div>${hasChildren && ui.expanded.has(p.id) ? tree(p.id, depth + 1) : ''}`;
  }).join('');
}
function sidebar() {
  const fav = state.pages.filter(p => p.favorite && !p.deleted);
  return `<aside class="sidebar ${ui.sidebar ? 'mobile-open' : ''} ${ui.collapsed ? 'desktop-collapsed' : ''}">
    <div class="workspace-switch"><button class="workspace-brand" data-action="settings" aria-label="워크스페이스 설정"><span class="brand-icon">f<span>.</span></span><span data-testid="workspace-name">${esc(state.settings.name)}</span>${icon('down')}</button><button class="icon-button sidebar-collapse" data-action="collapse" aria-label="사이드바 닫기">${icon('collapse')}</button></div>
    <nav aria-label="워크스페이스"><div class="primary-nav">
      ${navButton('search', '검색', 'search', 'aria-label="검색"')}<span class="keyhint">Ctrl K</span>
      ${navButton('open-home', '홈', 'home')}${navButton('templates', '템플릿', 'template')}
    </div>
    <div class="nav-section"><div class="section-heading">즐겨찾기<span>${icon('star')}</span></div>${fav.length ? fav.map(p => `<button class="favorite-link" data-action="open" data-id="${esc(p.id)}" aria-label="즐겨찾기 페이지: ${esc(pageName(p))}">${icon(p.icon)}<span data-page-name="${esc(p.id)}">${esc(pageName(p))}</span></button>`).join('') : '<p class="sidebar-hint">자주 찾는 페이지에 별을 눌러 보세요.</p>'}</div>
    <div class="nav-section private-pages"><div class="section-heading">개인 페이지<button class="icon-button" data-action="new" aria-label="빠른 페이지 만들기">${icon('plus')}</button></div>${tree()}<button class="new-page" data-action="new" aria-label="새 페이지">${icon('plus')}새 페이지</button></div>
    <div class="sidebar-bottom">${navButton('account', '계정', 'user', 'aria-label="계정"')}${navButton('settings', '설정', 'settings', 'aria-label="설정"')}${navButton('trash', '휴지통', 'trash', 'aria-label="휴지통"')}<div class="local-note">${icon('shield')}이 브라우저에 안전하게 저장</div></div></nav>
    <div class="sidebar-footer"><span class="folio-wordmark">folio<span>.</span></span><a class="footer-signout" href="/signout-with-chatgpt?return_to=%2F" target="_top" aria-label="ChatGPT 로그아웃">${icon('external')}로그아웃</a></div>
  </aside>`;
}
function breadcrumb(page) {
  const chain = []; let cursor = page; const seen = new Set();
  while (cursor && !seen.has(cursor.id)) { seen.add(cursor.id); chain.unshift(cursor); cursor = state.pages.find(p => p.id === cursor.parentId); }
  return chain.map((p, i) => `${i ? '<span class="crumb-sep">/</span>' : ''}<button data-action="open" data-id="${esc(p.id)}" class="crumb">${icon(p.icon)}<span data-page-name="${esc(p.id)}">${esc(pageName(p))}</span></button>`).join('');
}
function blockHTML(b, i) {
  const num = i + 1;
  return `<div class="block-row block-${b.type}" data-testid="block-${num}" data-type="${b.type}" data-block-id="${esc(b.id)}" draggable="false">
    <div class="block-tools"><button class="block-tool" data-action="add-block" data-id="${esc(b.id)}" aria-label="블록 ${num} 아래 추가">${icon('plus')}</button><button class="block-tool" data-action="block-menu" data-id="${esc(b.id)}" aria-label="블록 ${num} 메뉴" draggable="true" data-drag-block="${esc(b.id)}">${icon('grip')}</button></div>
    ${b.type === 'todo' ? `<input class="todo-check" type="checkbox" data-check="${esc(b.id)}" aria-label="할 일 ${num} 완료" ${b.checked ? 'checked' : ''}>` : ''}
    ${b.type === 'bullet' ? '<span class="bullet-dot">•</span>' : ''}${b.type === 'callout' ? `<span class="callout-icon">${icon('bulb')}</span>` : ''}
    ${b.type === 'divider' ? '<hr>' : `<textarea class="block-input ${b.checked ? 'checked' : ''}" rows="1" maxlength="100000" aria-label="블록 ${num} 내용" data-edit-block="${esc(b.id)}" placeholder="${b.type === 'h1' ? '제목 1' : b.type === 'h2' ? '제목 2' : '내용을 입력하거나 / 로 블록 추가'}" spellcheck="false">${esc(b.text)}</textarea>`}
  </div>`;
}
function editor(page) {
  return `<div class="editor" aria-label="페이지 편집기">${page.blocks.map(blockHTML).join('')}</div><button class="add-block-line" data-action="append-block">${icon('plus')}블록 추가<span>/ 를 눌러 더 많은 옵션 보기</span></button>`;
}
function quickLinks() {
  return `<div class="quick-links"><button data-action="open" data-id="wiki" class="quick-card"><span class="card-icon sage">${icon('book')}</span><span><strong>팀 위키</strong><small>함께 쌓아가는 지식</small></span>${icon('arrow')}</button><button data-action="open" data-id="ideas" class="quick-card"><span class="card-icon peach">${icon('bulb')}</span><span><strong>아이디어 노트</strong><small>떠오르는 생각을 놓치지 않도록</small></span>${icon('arrow')}</button></div>`;
}
function render() {
  const page = current(); state.activeId = page.id;
  document.documentElement.dataset.theme = state.settings.theme;
  document.title = `${pageName(page)} — Folio`;
  $('#app').innerHTML = `${sidebar()}${ui.sidebar ? '<div class="mobile-scrim" data-action="close-sidebar"></div>' : ''}<main class="main-shell ${ui.collapsed ? 'expanded-main' : ''}">
    <header class="topbar"><div class="topbar-left"><button class="icon-button sidebar-open" data-action="open-sidebar" aria-label="사이드바 열기">${icon('menu')}</button><div class="breadcrumbs">${breadcrumb(page)}</div></div><div class="topbar-right"><span id="save-state" class="save-state">${icon('check')}<span>저장됨</span></span><button class="icon-button favorite-toggle ${page.favorite ? 'is-favorite' : ''}" data-action="favorite" aria-label="${page.favorite ? '즐겨찾기 해제' : '즐겨찾기 추가'}">${icon('star')}</button><button class="button export-button" data-action="export-page">${icon('download')}내보내기</button><button class="icon-button" data-action="page-menu" aria-label="페이지 더보기">${icon('more')}</button></div></header>
    <div class="main-scroll">${page.type === 'home' ? '<div class="cover"><img src="/cover.svg" alt="햇살과 올리브 나무가 있는 추상 풍경"><span>ROOM FOR YOUR NEXT BIG IDEA.</span><span class="cover-label">YOUR PERSONAL SPACE</span></div>' : '<div class="page-spacer"></div>'}
    <article class="page-content ${page.type === 'home' ? 'with-cover' : ''}"><div class="page-icon ${page.type === 'home' ? 'home-page-icon' : ''}">${icon(page.icon)}</div><div class="page-title-line"><input id="page-title" aria-label="페이지 제목" value="${esc(page.title)}" maxlength="500" placeholder="제목 없음" spellcheck="false"></div><div class="page-meta"><span>${icon('clock')}나만의 속도로, 매일 조금씩</span><span class="meta-dot">·</span><span>개인 페이지</span></div>
    ${page.type !== 'database' ? editor(page) : ''}${page.type === 'home' ? quickLinks() : ''}${page.type === 'database' || page.type === 'home' ? '<section id="database" class="database" aria-label="프로젝트 관리"></section>' : ''}
    ${page.type === 'document' ? `<div class="document-bottom"><button class="button" data-action="subpage" data-id="${esc(page.id)}">${icon('plus')}하위 페이지 추가</button><span>기록은 생각을 선명하게 만듭니다.</span></div>` : ''}<footer class="page-footer"><span class="footer-logo">f.</span><span>조금 더 정리된 생각, 조금 더 가벼운 하루.</span><span class="footer-shortcut">${icon('shield')}로컬 자동 저장</span></footer></article></div></main>`;
  renderDatabase(); resizeBlocks(); if (ui.menu) renderPageMenu(); if (ui.blockMenu) renderBlockMenu(ui.blockMenu);
  if (persistenceBlocked || persist.warned) $('#save-state').innerHTML = '<span class="save-error">저장 안 됨 · 백업 필요</span>';
}
function resizeBlocks() { $$('.block-input').forEach(el => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }); }
function renderDatabase() { if ($('#database')) $('#database').innerHTML = renderDatabaseHTML(state.tasks, ui, !persistenceBlocked && !persist.warned); }
function refreshDatabaseResults() {
  if (!$('#database-results')) return;
  $('#database-results').innerHTML = databaseResults(state.tasks, ui);
  refreshDatabaseSummary();
  const clear = $('[data-action="clear-db-search"]'); if (clear) clear.hidden = !ui.query;
}
function refreshDatabaseSummary() {
  if ($('#database-count')) $('#database-count').textContent = `${filteredTasks(state.tasks, ui).length}개의 작업${ui.status || ui.query.trim() ? ` · 전체 ${state.tasks.length}개` : ''}`;
  if ($('.database-total')) $('.database-total').textContent = `전체 ${state.tasks.filter(t => t.status === '완료').length} / ${state.tasks.length} 완료`;
  if ($('#database-save-state')) $('#database-save-state').textContent = persistenceBlocked || persist.warned ? '저장 안 됨 · 백업 필요' : '모든 변경 사항 저장됨';
}
function saveDatabasePrefs() { state.settings.database = { view: ui.view, status: ui.status, sort: ui.sort }; persist(); }
function openAccount() {
  const hosted = location.hostname.endsWith('.chatgpt.site');
  showModal('account', '계정 및 로그인', `<div class="account-summary">${icon('user')}<div><strong>${hosted ? 'ChatGPT로 보호된 워크스페이스' : '로컬 미리보기'}</strong><p>${hosted ? '앱 접근 권한은 현재 로그인한 ChatGPT 계정으로 확인합니다.' : '로컬 서버에는 ChatGPT 로그인 세션이 없습니다.'}</p></div></div><p class="dialog-description">계정을 바꾸려면 로그아웃 후 다시 로그인하세요. 접근 권한이 있는 계정만 앱을 열 수 있습니다.</p><div class="privacy-note">${icon('shield')}<div><strong>로그아웃해도 이 브라우저의 문서는 삭제되지 않습니다.</strong><p>문서는 계정별 서버 저장이 아닌 브라우저 저장 방식입니다. 공용 기기에서는 백업 후 브라우저 데이터를 관리하세요.</p></div></div><div class="account-actions"><a class="button" href="/signin-with-chatgpt?return_to=%2F" target="_top">ChatGPT 로그인</a><a class="button primary" href="/signout-with-chatgpt?return_to=%2F" target="_top">ChatGPT 로그아웃</a></div>`);
}
function refreshSidebar() { const holder = document.createElement('div'); holder.innerHTML = sidebar(); $('.sidebar').replaceWith(holder.firstElementChild); }
function updateTitleUI() { $$('[data-page-name]').filter(el => el.dataset.pageName === current().id).forEach(el => { el.textContent = pageName(current()); }); document.title = `${pageName(current())} — Folio`; }
const typeOptions = [ ['text', '텍스트', 'text', '일반 텍스트를 입력합니다'], ['h1', '제목 1', 'text', '큰 섹션 제목'], ['h2', '제목 2', 'text', '중간 크기의 제목'], ['bullet', '글머리 기호', 'bullet', '간결하게 목록을 작성합니다'], ['todo', '할 일 목록', 'check', '완료할 일을 체크합니다'], ['quote', '인용', 'quote', '기억하고 싶은 문장'], ['callout', '콜아웃', 'bulb', '중요한 정보를 강조합니다'], ['divider', '구분선', 'more', '내용 사이에 여백을 만듭니다'] ];
function removePopovers() { $$('.popover').forEach(el => el.remove()); ui.menu = null; ui.blockMenu = null; }
function renderPageMenu() {
  removePopovers(); ui.menu = true;
  const el = document.createElement('div'); el.className = 'popover page-menu'; el.setAttribute('role', 'menu');
  el.innerHTML = `<button role="menuitem" data-action="duplicate">${icon('copy')}페이지 복제</button><button role="menuitem" data-action="move-page">${icon('file')}페이지 이동</button><button role="menuitem" data-action="subpage" data-id="${esc(current().id)}">${icon('plus')}하위 페이지 추가</button><button role="menuitem" data-action="export-page">${icon('download')}Markdown 내보내기</button><div class="menu-divider"></div><button class="danger" role="menuitem" data-action="delete-page">${icon('trash')}휴지통으로 이동</button>`;
  document.body.append(el);
}
function renderBlockMenu(id) {
  removePopovers(); ui.blockMenu = id;
  const b = current().blocks.find(b => b.id === id); if (!b) return;
  const anchor = $(`[data-block-id="${id}"]`); const bounds = anchor.getBoundingClientRect();
  const el = document.createElement('div'); el.className = 'popover block-menu'; el.setAttribute('role', 'listbox'); el.setAttribute('aria-label', '블록 유형');
  el.style.top = `${Math.max(12, Math.min(bounds.bottom + 3, window.innerHeight - 460))}px`; el.style.left = `${Math.max(10, Math.min(bounds.left + 15, window.innerWidth - 270))}px`;
  el.innerHTML = `<div class="menu-caption">블록으로 전환</div>${typeOptions.map(([type, label, glyph, description]) => `<button role="option" aria-label="${label}" aria-selected="${b.type === type}" data-action="block-type" data-type="${type}" data-id="${id}"><span class="type-icon">${icon(glyph)}</span><span><strong>${label}</strong><small>${description}</small></span></button>`).join('')}<div class="menu-divider"></div><div class="block-actions"><button data-action="block-up" data-id="${id}" aria-label="블록 위로 이동">위로</button><button data-action="block-down" data-id="${id}" aria-label="블록 아래로 이동">아래로</button><button class="danger" data-action="block-delete" data-id="${id}">${icon('trash')}삭제</button></div>`;
  document.body.append(el);
}
function showModal(name, title, body, size = '') {
  removePopovers(); ui.lastFocus = document.activeElement; ui.modal = name; $('#app').inert = true;
  $('#overlay-root').innerHTML = `<div class="modal-backdrop" data-backdrop="true"><section class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="닫기">${icon('close')}</button></div><div class="modal-body">${body}</div></section></div>`;
  requestAnimationFrame(() => ($('[autofocus]', $('#overlay-root')) || $('input,select,textarea,button', $('.modal-body')) || $('.modal-header button'))?.focus());
}
function closeModal(restore = true) { $('#app').inert = false; $('#overlay-root').innerHTML = ''; ui.modal = null; ui.pendingImport = null; if (restore && ui.lastFocus?.isConnected) ui.lastFocus.focus(); }
function searchResults(q = '') {
  const query = q.trim().toLowerCase(); const pages = state.pages.filter(p => !p.deleted && (!query || `${p.title} ${p.blocks.map(b => b.text).join(' ')}`.toLowerCase().includes(query)));
  return `<div class="search-caption">${query ? `검색 결과 ${pages.length}개` : '워크스페이스의 페이지'}</div>${pages.length ? pages.map(p => `<button class="search-result" data-action="search-open" data-id="${esc(p.id)}" aria-label="검색 결과: ${esc(pageName(p))}">${icon(p.icon)}<span><strong>${esc(pageName(p))}</strong><small>${esc((p.blocks.find(b => query && b.text.toLowerCase().includes(query))?.text || p.blocks[0]?.text || '프로젝트 데이터베이스').slice(0, 100))}</small></span>${icon('arrow')}</button>`).join('') : '<div class="empty-state">검색 결과가 없습니다.<small>다른 단어로 검색해 보세요.</small></div>'}`;
}
function openSearch() { showModal('search', '무엇을 찾고 있나요?', `<label class="search-main">${icon('search')}<input type="search" aria-label="워크스페이스 검색" placeholder="페이지와 내용 검색…" autofocus><kbd>ESC</kbd></label><div id="search-results">${searchResults()}</div>`, 'search-modal'); }
function openTask(id, status = '시작 전') {
  const task = state.tasks.find(t => t.id === id) || { id: '', title: '', status, priority: '보통', assignee: '', date: '', note: '' };
  showModal('task', task.id ? '작업 상세' : '새로운 작업', `<form id="task-form" data-task-id="${esc(task.id)}"><label class="field-label">작업 이름<input name="title" aria-label="작업 이름" value="${esc(task.title)}" required maxlength="500" placeholder="어떤 일을 할까요?" autofocus></label><div class="form-grid"><label class="field-label">상태<select name="status" aria-label="작업 상태">${statuses.map(s => `<option ${task.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field-label">우선순위<select name="priority" aria-label="작업 우선순위">${priorities.map(s => `<option ${task.priority === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label class="field-label">담당자<input name="assignee" aria-label="작업 담당자" value="${esc(task.assignee)}" maxlength="100" placeholder="담당자 이름"></label><label class="field-label">마감일<input type="date" name="date" aria-label="작업 마감일" value="${esc(task.date)}"></label></div><label class="field-label">메모<textarea name="note" aria-label="작업 메모" rows="4" maxlength="100000" placeholder="추가로 기록할 내용이 있나요?">${esc(task.note)}</textarea></label><div class="form-footer">${task.id ? `<button type="button" class="button danger" data-action="delete-task" data-id="${esc(task.id)}">${icon('trash')}작업 삭제</button>` : '<span></span>'}<button class="button primary" type="submit">작업 저장</button></div></form>`);
}
function openSettings() {
  showModal('settings', '워크스페이스 설정', `<form id="settings-form"><div class="settings-intro"><span class="brand-icon">f.</span><div><strong>나만의 공간, 나만의 방식</strong><p>집중하기 좋은 워크스페이스를 만들어 보세요.</p></div></div><label class="field-label">워크스페이스 이름<input name="name" aria-label="워크스페이스 이름" maxlength="120" required value="${esc(state.settings.name)}"></label><label class="field-label">화면 테마<select name="theme" aria-label="화면 테마"><option value="light" ${state.settings.theme === 'light' ? 'selected' : ''}>라이트 · 밝고 편안하게</option><option value="dark" ${state.settings.theme === 'dark' ? 'selected' : ''}>다크 · 차분하게 집중</option></select></label><div class="privacy-note">${icon('shield')}<div><strong>데이터는 이 브라우저에 저장됩니다.</strong><p>서버 동기화나 실시간 협업은 제공하지 않습니다. 브라우저 데이터를 지우기 전에 백업을 내려받으세요.</p></div></div><div class="backup-actions"><button type="button" class="button" data-action="export-workspace">${icon('download')}워크스페이스 내보내기</button><button type="button" class="button" data-action="import-workspace">${icon('upload')}백업 가져오기</button><input type="file" id="import-file" aria-label="백업 파일 선택" accept=".json,application/json" hidden></div><div id="import-feedback" role="alert"></div><div class="form-footer"><span></span><button type="submit" class="button primary">설정 저장</button></div></form>`);
}
function openTrash() {
  const pages = state.pages.filter(p => p.deleted);
  showModal('trash', '휴지통', `<p class="dialog-description">삭제한 페이지와 내용은 복원할 수 있습니다.</p>${pages.length ? pages.map(p => `<div class="trash-row"><span>${icon(p.icon)}${esc(pageName(p))}</span><button class="button small" data-action="restore" data-id="${esc(p.id)}" aria-label="복원: ${esc(pageName(p))}">${icon('restore')}복원</button></div>`).join('') : '<div class="empty-state">휴지통이 비어 있습니다.<small>삭제한 페이지가 여기에 표시됩니다.</small></div>'}`);
}
const templates = [
  { title: '팀 회의록', label: '회의록', icon: 'calendar', description: '안건부터 결정 사항, 다음 액션까지.', blocks: () => [block('h2', '회의 안건'), block('bullet', '논의할 주제를 입력하세요.'), block('h2', '결정 사항'), block('text'), block('h2', '다음 액션'), block('todo', '담당자와 마감일 정하기')] },
  { title: '주간 계획', label: '주간 계획', icon: 'check', description: '이번 주의 목표와 작은 성취를 기록해요.', blocks: () => [block('h2', '이번 주 가장 중요한 일'), block('todo', '이번 주 목표 1'), block('todo', '이번 주 목표 2'), block('h2', '한 주 돌아보기'), block('text', '이번 주에 배운 점은 무엇인가요?')] },
  { title: '독서 노트', label: '독서 노트', icon: 'book', description: '읽은 책을 나만의 지식으로 남겨요.', blocks: () => [block('h2', '책 소개'), block('text', '책 제목과 저자를 기록하세요.'), block('h2', '마음에 남은 문장'), block('quote', '기억하고 싶은 문장을 적어 보세요.'), block('h2', '나의 생각'), block('text')] },
];
function openTemplates() { showModal('templates', '작은 시작을 돕는 템플릿', `<p class="dialog-description">빈 페이지 앞에서 망설이지 않도록. 나에게 맞는 틀을 골라 보세요.</p><div class="template-grid">${templates.map((t, i) => `<button class="template-card" data-action="use-template" data-index="${i}" aria-label="${t.label} 템플릿 사용"><span class="template-preview preview-${i}">${icon(t.icon)}<i></i><i></i><i></i></span><strong>${t.label}</strong><small>${t.description}</small><span class="template-cta">템플릿 사용 ${icon('arrow')}</span></button>`).join('')}</div>`, 'wide-modal'); }
function download(name, content, type) { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name.replace(/[<>:"/\\|?*]/g, '_'); link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
function focusBlock(id) { const el = $(`[data-edit-block="${id}"]`); el?.focus(); if (el) el.setSelectionRange(el.value.length, el.value.length); }

document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target) { if (!event.target.closest('.popover')) removePopovers(); if (event.target.dataset.backdrop) closeModal(); return; }
  const { action, id } = target.dataset;
  if (!['block-type', 'block-menu', 'page-menu', 'block-delete', 'block-up', 'block-down'].includes(action)) removePopovers();
  switch (action) {
    case 'open': if (state.pages.some(p => p.id === id && !p.deleted)) go(id); else toast('이 페이지는 휴지통에 있습니다.', true); break;
    case 'open-home': go(state.pages.find(p => p.type === 'home' && !p.deleted)?.id || state.pages.find(p => !p.deleted).id); break;
    case 'new': addPage(); break;
    case 'subpage': addPage({ parentId: id }); break;
    case 'expand': ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id); refreshSidebar(); break;
    case 'open-sidebar': if (window.innerWidth > 760) ui.collapsed = false; else ui.sidebar = true; render(); break;
    case 'close-sidebar': ui.sidebar = false; render(); break;
    case 'collapse': ui.sidebar = false; if (window.innerWidth > 760) ui.collapsed = !ui.collapsed; render(); break;
    case 'favorite': current().favorite = !current().favorite; persist(); render(); break;
    case 'page-menu': renderPageMenu(); break;
    case 'duplicate': if (state.pages.length >= 1000) { toast('페이지는 최대 1,000개까지 만들 수 있습니다.', true); break; } duplicatePage(state, current()); persist(); render(); toast('페이지를 복제했습니다.'); break;
    case 'delete-page': trashPage(state, current().id); persist(); render(); toast('페이지를 휴지통으로 옮겼습니다.'); break;
    case 'restore': restorePage(state, id); persist(); render(); openTrash(); toast('페이지를 복원했습니다.'); break;
    case 'search': openSearch(); break;
    case 'search-open': closeModal(false); go(id); break;
    case 'templates': openTemplates(); break;
    case 'use-template': { const t = templates[Number(target.dataset.index)]; addPage({ title: t.title, icon: t.icon, blocks: t.blocks() }); toast('템플릿으로 페이지를 만들었습니다.'); break; }
    case 'settings': openSettings(); break;
    case 'trash': openTrash(); break;
    case 'close-modal': closeModal(); break;
    case 'view-table': ui.view = 'table'; saveDatabasePrefs(); renderDatabase(); break;
    case 'view-board': ui.view = 'board'; saveDatabasePrefs(); renderDatabase(); break;
    case 'sort': ui.sort = ui.sort === 'none' ? 'asc' : ui.sort === 'asc' ? 'desc' : 'none'; saveDatabasePrefs(); renderDatabase(); break;
    case 'clear-db-search': ui.query = ''; $('[aria-label="데이터베이스 검색"]').value = ''; refreshDatabaseResults(); $('[aria-label="데이터베이스 검색"]').focus(); break;
    case 'account': openAccount(); break;
    case 'new-task': if (state.tasks.length >= 5000) { toast('작업은 최대 5,000개까지 만들 수 있습니다.', true); break; } openTask(null, target.dataset.status || ui.status || '시작 전'); break;
    case 'edit-task': openTask(id); break;
    case 'delete-task': state.tasks = state.tasks.filter(t => t.id !== id); persist(); closeModal(); renderDatabase(); toast('작업을 삭제했습니다.'); break;
    case 'export-page': download(`${pageName(current())}.md`, pageMarkdown(current()), 'text/markdown;charset=utf-8'); toast('페이지를 Markdown으로 내보냈습니다.'); break;
    case 'export-workspace': download('folio-workspace-backup.json', JSON.stringify(state, null, 2), 'application/json'); toast('백업 파일을 내보냈습니다.'); break;
    case 'import-workspace': $('#import-file').click(); break;
    case 'confirm-import': if (ui.pendingImport) { state = ui.pendingImport; persistenceBlocked = false; lastSavedRaw = localStorage.getItem(STORAGE_KEY); persist.warned = false; persist(); closeModal(false); render(); toast('백업을 가져왔습니다.'); } break;
    case 'cancel-import': ui.pendingImport = null; $('#import-feedback').innerHTML = ''; break;
    case 'append-block': { const b = block(); current().blocks.push(b); persist(); render(); focusBlock(b.id); break; }
    case 'add-block': { const index = current().blocks.findIndex(b => b.id === id); const b = block(); current().blocks.splice(index + 1, 0, b); persist(); render(); focusBlock(b.id); break; }
    case 'block-menu': renderBlockMenu(id); break;
    case 'block-type': { const b = current().blocks.find(b => b.id === id); b.type = target.dataset.type; if (b.text === '/') b.text = ''; removePopovers(); persist(); render(); focusBlock(id); break; }
    case 'block-delete': { current().blocks = current().blocks.filter(b => b.id !== id); if (!current().blocks.length) current().blocks.push(block()); removePopovers(); persist(); render(); break; }
    case 'block-up': case 'block-down': { const list = current().blocks; const i = list.findIndex(b => b.id === id); const j = i + (action === 'block-up' ? -1 : 1); if (j >= 0 && j < list.length) [list[i], list[j]] = [list[j], list[i]]; removePopovers(); persist(); render(); break; }
    case 'move-page': { const excluded = descendants(state, current().id); showModal('move', '페이지 이동', `<form id="move-form"><label class="field-label">상위 페이지<select name="parent" aria-label="이동할 상위 페이지"><option value="">개인 페이지 (최상위)</option>${state.pages.filter(p => !p.deleted && !excluded.has(p.id)).map(p => `<option value="${esc(p.id)}" ${p.id === current().parentId ? 'selected' : ''}>${esc(pageName(p))}</option>`).join('')}</select></label><div class="form-footer"><span></span><button class="button primary">이동</button></div></form>`); break; }
  }
});
document.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'page-title') { current().title = el.value; persist(); updateTitleUI(); }
  if (el.dataset.editBlock) { const b = current().blocks.find(b => b.id === el.dataset.editBlock); b.text = el.value.slice(0, 100000); if (el.value !== b.text) el.value = b.text; persist(); el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; if (el.value === '/') renderBlockMenu(b.id); else if (ui.blockMenu === b.id && !el.value.startsWith('/')) removePopovers(); }
  if (el.getAttribute('aria-label') === '워크스페이스 검색') $('#search-results').innerHTML = searchResults(el.value);
  if (el.getAttribute('aria-label') === '데이터베이스 검색') { ui.query = el.value; refreshDatabaseResults(); }
  if (el.dataset.taskField === 'assignee') { const task = state.tasks.find(t => t.id === el.dataset.id); if (task) { task.assignee = el.value.slice(0, 100); persist(); refreshDatabaseSummary(); } }
});
document.addEventListener('change', async event => {
  const el = event.target;
  if (el.dataset.check) { current().blocks.find(b => b.id === el.dataset.check).checked = el.checked; persist(); $(`[data-edit-block="${el.dataset.check}"]`).classList.toggle('checked', el.checked); }
  if (el.getAttribute('aria-label') === '상태 필터') { ui.status = el.value; saveDatabasePrefs(); renderDatabase(); }
  if (['status', 'priority', 'date'].includes(el.dataset.taskField)) {
    const task = state.tasks.find(t => t.id === el.dataset.id);
    if (task) { task[el.dataset.taskField] = el.value; persist(); refreshDatabaseResults(); }
  }
  if (el.id === 'import-file' && el.files[0]) {
    try { if (el.files[0].size > 5_000_000) throw new Error('5MB 이하의 파일을 선택해 주세요.'); ui.pendingImport = validateWorkspace(JSON.parse(await el.files[0].text())); $('#import-feedback').innerHTML = `<div class="import-confirm"><p>현재 워크스페이스를 백업의 페이지 ${ui.pendingImport.pages.length}개로 교체합니다. 먼저 현재 데이터를 내보내는 것을 권장합니다.</p><button type="button" class="button danger" data-action="confirm-import">백업으로 교체</button><button type="button" class="button" data-action="cancel-import">가져오기 취소</button></div>`; }
    catch (error) { ui.pendingImport = null; $('#import-feedback').textContent = error.message || '백업을 읽을 수 없습니다.'; }
    el.value = '';
  }
});
document.addEventListener('submit', event => {
  event.preventDefault(); const form = event.target; const data = new FormData(form);
  if (form.id === 'task-form') {
    const title = String(data.get('title')).trim(); if (!title) { $('[name="title"]', form).focus(); return; }
    const id = form.dataset.taskId || uid(); const item = { id, title, status: data.get('status'), priority: data.get('priority'), assignee: String(data.get('assignee')).trim(), date: data.get('date'), note: String(data.get('note')).slice(0, 100000) };
    const index = state.tasks.findIndex(t => t.id === id); if (index === -1) state.tasks.push(item); else state.tasks[index] = item;
    if (index === -1) {
      if (ui.query && !`${item.title} ${item.status} ${item.priority} ${item.assignee} ${item.date}`.toLowerCase().includes(ui.query.trim().toLowerCase())) ui.query = '';
      if (ui.status && ui.status !== item.status) ui.status = '';
      state.settings.database = { view: ui.view, status: ui.status, sort: ui.sort };
    }
    persist(); closeModal(); renderDatabase(); toast('작업을 저장했습니다.');
  }
  if (form.id === 'settings-form') { const name = String(data.get('name')).trim(); if (!name) return; state.settings.name = name; state.settings.theme = data.get('theme'); persist(); closeModal(false); render(); toast('설정을 저장했습니다.'); }
  if (form.id === 'move-form') { current().parentId = data.get('parent') || null; if (current().parentId) ui.expanded.add(current().parentId); persist(); closeModal(false); render(); toast('페이지를 이동했습니다.'); }
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); return; }
  if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === 'n') { event.preventDefault(); addPage(); return; }
  if (event.key === 'Escape') { removePopovers(); closeModal(); if (ui.sidebar) { ui.sidebar = false; render(); } }
  if (ui.modal && event.key === 'Tab') { const controls = $$('button:not([disabled]), a[href], input:not([hidden]), select, textarea, [tabindex="0"]', $('.modal')).filter(el => el.getClientRects().length); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  const el = event.target;
  if (el.dataset.editBlock && event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); removePopovers(); const index = current().blocks.findIndex(b => b.id === el.dataset.editBlock); const old = current().blocks[index]; const start = el.selectionStart; const b = block(['todo', 'bullet'].includes(old.type) ? old.type : 'text', el.value.slice(el.selectionEnd)); old.text = el.value.slice(0, start); current().blocks.splice(index + 1, 0, b); persist(); render(); focusBlock(b.id); }
  if (el.dataset.editBlock && event.key === 'Backspace' && !el.value && current().blocks.length > 1) { event.preventDefault(); const list = current().blocks; const index = list.findIndex(b => b.id === el.dataset.editBlock); const focusId = list[Math.max(0, index - 1)].id; list.splice(index, 1); persist(); render(); focusBlock(focusId); }
});
document.addEventListener('dragstart', event => { const task = event.target.closest('[data-drag-task]'); const b = event.target.closest('[data-drag-block]'); if (task) { ui.draggedTask = task.dataset.dragTask; event.dataTransfer.setData('text/plain', ui.draggedTask); } if (b) { ui.draggedBlock = b.dataset.dragBlock; event.dataTransfer.setData('text/plain', ui.draggedBlock); } });
document.addEventListener('dragover', event => { if (event.target.closest('[data-drop-status]') || (ui.draggedBlock && event.target.closest('[data-block-id]'))) event.preventDefault(); });
document.addEventListener('drop', event => { const column = event.target.closest('[data-drop-status]'); const targetBlock = event.target.closest('[data-block-id]'); if (column && ui.draggedTask) { event.preventDefault(); const t = state.tasks.find(t => t.id === ui.draggedTask); if (t) { t.status = column.dataset.dropStatus; persist(); renderDatabase(); } } if (targetBlock && ui.draggedBlock) { event.preventDefault(); const list = current().blocks; const from = list.findIndex(b => b.id === ui.draggedBlock); const to = list.findIndex(b => b.id === targetBlock.dataset.blockId); if (from >= 0 && to >= 0) { const [item] = list.splice(from, 1); list.splice(to, 0, item); persist(); render(); } } ui.draggedTask = null; ui.draggedBlock = null; });
document.addEventListener('dragend', () => { ui.draggedTask = null; ui.draggedBlock = null; });
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY || event.key === null) { persistenceBlocked = true; if ($('#save-state')) $('#save-state').innerHTML = '<span class="save-error">다른 탭 변경 · 새로고침 필요</span>'; toast('다른 탭의 최신 변경을 보호하기 위해 자동 저장을 멈췄습니다. 현재 편집 내용은 백업한 뒤 새로고침하세요.', true); } });
window.addEventListener('resize', resizeBlocks);
render();
if (startupError) toast(startupError, true);
