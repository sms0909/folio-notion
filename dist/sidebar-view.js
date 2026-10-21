import { icon } from './icons.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function sidebarSettings(state) {
  const raw = state.settings.sidebar || {};
  const ids = new Set(state.pages.map(p => p.id));
  const sections = ['recent', 'favorites', 'pages'];
  const order = Array.isArray(raw.order) ? [...new Set(raw.order.filter(id => sections.includes(id)))] : [];
  return {
    width: Math.min(420, Math.max(220, Number(raw.width) || 248)),
    collapsed: raw.collapsed === true,
    closed: Object.fromEntries(sections.map(key => [key, raw.closed?.[key] === true])),
    expanded: Array.isArray(raw.expanded) ? raw.expanded.filter(id => ids.has(id)) : ['wiki'],
    recents: Array.isArray(raw.recents) ? [...new Set(raw.recents.filter(id => ids.has(id)))].slice(0, 20) : [],
    order: [...order, ...sections.filter(id => !order.includes(id))],
    pageSort: raw.pageSort === 'updated' ? 'updated' : 'manual',
    limit: [5, 10].includes(raw.limit) ? raw.limit : 1000,
  };
}
function pageTitle(p) { return p.title.trim() || '제목 없음'; }
export function sidebarHTML(state, ui) {
  const prefs = ui.sidebarPrefs;
  const active = state.pages.filter(p => !p.deleted);
  const tree = (parentId = null, depth = 0) => {
    let rows = active.filter(p => p.parentId === parentId);
    if (prefs.pageSort === 'updated') rows = rows.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (parentId === null) rows = rows.slice(0, prefs.limit);
    return rows.map(p => {
      const title = esc(pageTitle(p));
      const children = p.type === 'database' || active.some(child => child.parentId === p.id);
      const expanded = ui.expanded.has(p.id);
      return `<div class="tree-row ${p.id === state.activeId ? 'active' : ''}" data-sidebar-page="${esc(p.id)}" data-parent="${p.parentId ? esc(p.parentId) : 'root'}" style="--depth:${depth}" role="group" aria-label="${title} 페이지 위치">
        <button class="tree-toggle ${expanded ? 'expanded' : ''} ${!children ? 'leaf' : ''}" data-action="expand" data-id="${esc(p.id)}" aria-label="${title} 하위 페이지" aria-expanded="${expanded}">${icon('chevron')}</button>
        <button class="page-link" data-action="open" data-id="${esc(p.id)}" data-drag-page="${esc(p.id)}" draggable="true" aria-label="페이지 열기: ${title}" ${p.id === state.activeId ? 'aria-current="page"' : ''}>${icon(p.icon)}<span data-page-name="${esc(p.id)}">${title}</span></button>
        <button class="tree-menu" data-action="sidebar-page-menu" data-id="${esc(p.id)}" aria-label="페이지 메뉴: ${title}">${icon('more')}</button><button class="tree-add" data-action="subpage" data-id="${esc(p.id)}" aria-label="${title} 하위 페이지 추가">${icon('plus')}</button>
      </div>${children && expanded ? `${p.type === 'database' ? `<div class="database-view-links" style="--depth:${depth + 1}"><button data-action="sidebar-db-view" data-id="${esc(p.id)}" data-view="table" aria-label="데이터베이스 보기: ${title} 표">${icon('table')}표 보기</button><button data-action="sidebar-db-view" data-id="${esc(p.id)}" data-view="board" aria-label="데이터베이스 보기: ${title} 보드">${icon('board')}보드 보기</button></div>` : ''}${tree(p.id, depth + 1)}` : ''}`;
    }).join('');
  };
  const headings = { recent: '최근 방문', favorites: '즐겨찾기', pages: '개인 페이지' };
  function section(key) {
    const closed = prefs.closed[key];
    const heading = headings[key];
    let content = '';
    if (!closed) {
      if (key === 'pages') content = `${tree()}${active.filter(p => p.parentId === null).length > prefs.limit ? '<button class="sidebar-more" data-action="library">더 보기</button>' : ''}<button class="new-page" data-action="new" aria-label="새 페이지">${icon('plus')}새 페이지</button><div class="root-drop-target" data-root-drop="true" role="group" aria-label="최상위 페이지로 이동">여기에 놓아 최상위로 이동</div>`;
      if (key === 'favorites') {
        const pages = active.filter(p => p.favorite);
        content = pages.length ? pages.map(p => `<button class="favorite-link" data-action="open" data-id="${esc(p.id)}" aria-label="즐겨찾기 페이지: ${esc(pageTitle(p))}">${icon(p.icon)}<span data-page-name="${esc(p.id)}">${esc(pageTitle(p))}</span></button>`).join('') : '<p class="sidebar-hint">페이지를 끌어 놓거나 별을 눌러 추가하세요.</p>';
      }
      if (key === 'recent') {
        const pages = prefs.recents.map(id => active.find(p => p.id === id)).filter(Boolean).slice(0, 5);
        content = pages.length ? pages.map(p => `<button class="favorite-link recent-link" data-action="open" data-id="${esc(p.id)}" aria-label="최근 페이지: ${esc(pageTitle(p))}">${icon(p.icon)}<span data-page-name="${esc(p.id)}">${esc(pageTitle(p))}</span></button>`).join('') : '<p class="sidebar-hint">방문한 페이지가 여기에 표시됩니다.</p>';
      }
    }
    return `<section class="nav-section sidebar-section section-${key}" data-sidebar-section="${key}" ${key === 'favorites' ? 'data-drop-favorite="true"' : ''}><div class="section-heading"><button class="section-toggle" data-action="toggle-section" data-section="${key}" aria-label="${heading} 섹션" aria-expanded="${!closed}">${icon('chevron')}<span>${heading}</span></button><span class="section-actions">${key === 'pages' ? `<button class="icon-button" data-action="new" aria-label="빠른 페이지 만들기">${icon('plus')}</button>` : ''}<button class="icon-button" data-action="section-menu" data-section="${key}" aria-label="${heading} 섹션 메뉴">${icon('more')}</button></span></div>${content}</section>`;
  }
  const nav = (action, title, glyph) => `<button class="nav-button" data-action="${action}" aria-label="${title}">${icon(glyph)}<span>${title}</span></button>`;
  return `<aside class="sidebar ${ui.sidebar ? 'mobile-open' : ''} ${ui.collapsed ? 'desktop-collapsed' : ''}"><div class="workspace-switch"><button class="workspace-brand" data-action="workspace-menu" aria-label="워크스페이스 전환"><span class="workspace-avatar">${esc(state.settings.name.slice(0, 1))}</span><span data-testid="workspace-name">${esc(state.settings.name)}</span>${icon('down')}</button><button class="icon-button sidebar-collapse" data-action="collapse" aria-label="사이드바 닫기">${icon('collapse')}</button></div>
    <nav aria-label="워크스페이스"><div class="primary-nav">${nav('search', '검색', 'search')}<span class="keyhint">Ctrl K</span>${nav('open-home', '홈', 'home')}${nav('library', '전체 페이지', 'grid')}${nav('templates', '템플릿', 'template')}</div><div class="sidebar-sections">${prefs.order.map(section).join('')}</div></nav>
    <div class="sidebar-utilities">${nav('account', '계정', 'user')}${nav('settings', '설정', 'settings')}${nav('trash', '휴지통', 'trash')}</div><div class="sidebar-footer"><span class="folio-wordmark">folio<span>.</span></span><a class="footer-signout" href="/signout-with-chatgpt?return_to=%2F" target="_top" aria-label="ChatGPT 로그아웃">${icon('external')}로그아웃</a></div>
    <div class="sidebar-resizer" role="separator" tabindex="0" aria-label="사이드바 너비 조절" aria-orientation="vertical" aria-valuemin="220" aria-valuemax="420" aria-valuenow="${prefs.width}"></div></aside>`;
}
