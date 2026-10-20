export const STORAGE_KEY = 'folio.workspace.v1';
export const statuses = ['시작 전', '진행 중', '완료'];
export const priorities = ['높음', '보통', '낮음'];
export const blockTypes = ['text', 'h1', 'h2', 'bullet', 'todo', 'quote', 'callout', 'divider'];
export const uid = () => crypto.randomUUID();
export const block = (type = 'text', text = '', checked = false) => ({ id: uid(), type, text, checked });
export function makePage(title = '제목 없음', options = {}) {
  return { id: uid(), title, icon: 'file', parentId: null, type: 'document', blocks: [block()], favorite: false, deleted: false, deletedBatch: null, updatedAt: new Date().toISOString(), ...options };
}
export function initialWorkspace() {
  const home = makePage('나의 워크스페이스', { id: 'home', icon: 'sun', favorite: true, type: 'home', blocks: [
    block('h2', '좋은 생각은, 여기서 시작해요.'),
    block('text', '흩어진 생각을 모으고, 중요한 일에 집중하는 나만의 공간입니다. 작은 아이디어를 다음 프로젝트로 만들어 보세요.'),
    block('callout', '작게 시작하세요. 빈 줄에 / 를 입력하면 제목, 할 일, 인용 등 다양한 블록을 추가할 수 있어요.'),
  ] });
  const projects = makePage('프로젝트', { id: 'projects', icon: 'grid', type: 'database', favorite: true, blocks: [] });
  const wiki = makePage('팀 위키', { id: 'wiki', icon: 'book', blocks: [block('h1', '함께 만드는 지식'), block('text', '자주 찾는 정보와 팀의 일하는 방식을 한곳에 정리해요.'), block('h2', '우리가 일하는 방식'), block('bullet', '명확하게 기록하고, 편하게 공유합니다.'), block('bullet', '작은 실험으로 더 좋은 방법을 발견합니다.'), block('todo', '새로운 팀원 온보딩 문서 작성')] });
  const ideas = makePage('아이디어 노트', { id: 'ideas', icon: 'bulb', blocks: [block('h2', '아직 다듬어지지 않아도 괜찮아요.'), block('text', '지금 떠오른 생각을 기록해 보세요.'), block('bullet', '한 주를 돌아보는 나만의 루틴 만들기'), block('quote', '위대한 일은 작은 일들이 모여 이루어진다.')] });
  const meeting = makePage('주간 회의', { id: 'meeting', parentId: 'wiki', icon: 'calendar', blocks: [block('h2', '이번 주의 이야기'), block('text', '논의할 주제를 여기에 적어 주세요.'), block('todo', '다음 액션 정리하기')] });
  return { version: 1, activeId: home.id, settings: { name: 'Goodus의 워크스페이스', theme: 'light' }, pages: [home, projects, wiki, ideas, meeting], tasks: [
    { id: uid(), title: '브랜드 가이드 정리', status: '진행 중', priority: '높음', assignee: '나', date: '2026-10-24', note: '컬러, 타이포그래피, 컴포넌트 원칙을 한 문서로 정리합니다.' },
    { id: uid(), title: '워크스페이스 구조 잡기', status: '완료', priority: '보통', assignee: '나', date: '2026-10-20', note: '' },
    { id: uid(), title: '새로운 아이디어 모으기', status: '시작 전', priority: '보통', assignee: '', date: '2026-10-28', note: '' },
    { id: uid(), title: '10월 회고 작성', status: '시작 전', priority: '낮음', assignee: '나', date: '2026-10-30', note: '' },
  ] };
}
const isText = (value, max = 100000) => typeof value === 'string' && value.length <= max;
const isId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
export function validateWorkspace(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.pages) || data.pages.length < 1 || data.pages.length > 1000 || !Array.isArray(data.tasks) || data.tasks.length > 5000) throw new Error('올바른 Folio 백업 파일이 아닙니다.');
  if (!data.settings || !isText(data.settings.name, 120) || !['light', 'dark'].includes(data.settings.theme)) throw new Error('워크스페이스 설정이 올바르지 않습니다.');
  const ids = new Set(); const blocks = new Set();
  for (const p of data.pages) {
    if (!isId(p.id) || ids.has(p.id) || !isText(p.title, 500) || !['document', 'home', 'database'].includes(p.type) || !isText(p.icon, 30) || typeof p.favorite !== 'boolean' || typeof p.deleted !== 'boolean' || !Array.isArray(p.blocks) || p.blocks.length > 10000 || !(p.parentId === null || isId(p.parentId)) || !isText(p.updatedAt, 100) || !(p.deletedBatch == null || isId(p.deletedBatch))) throw new Error('페이지 데이터가 올바르지 않습니다.');
    ids.add(p.id);
    for (const b of p.blocks) {
      if (!isId(b.id) || blocks.has(b.id) || !blockTypes.includes(b.type) || !isText(b.text) || typeof b.checked !== 'boolean') throw new Error('블록 데이터가 올바르지 않습니다.');
      blocks.add(b.id);
    }
  }
  const byId = new Map(data.pages.map(p => [p.id, p]));
  for (const p of data.pages) {
    let cursor = p; const seen = new Set();
    while (cursor.parentId !== null) {
      if (seen.has(cursor.id) || !byId.has(cursor.parentId)) throw new Error('페이지 계층 구조가 올바르지 않습니다.');
      seen.add(cursor.id); cursor = byId.get(cursor.parentId);
    }
    if (!p.deleted && p.parentId && byId.get(p.parentId).deleted) throw new Error('삭제된 상위 페이지에 활성 페이지가 있습니다.');
  }
  const taskIds = new Set();
  for (const t of data.tasks) {
    if (!isId(t.id) || taskIds.has(t.id) || !isText(t.title, 500) || !statuses.includes(t.status) || !priorities.includes(t.priority) || !isText(t.assignee, 100) || !isText(t.note) || !isText(t.date, 10) || (t.date && (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || Number.isNaN(Date.parse(t.date)) || new Date(t.date).toISOString().slice(0, 10) !== t.date))) throw new Error('작업 데이터가 올바르지 않습니다.');
    taskIds.add(t.id);
  }
  if (!data.pages.some(p => !p.deleted)) throw new Error('활성 페이지가 하나 이상 필요합니다.');
  const normalized = structuredClone(data);
  if (!normalized.pages.some(p => p.id === normalized.activeId && !p.deleted)) normalized.activeId = normalized.pages.find(p => !p.deleted).id;
  return normalized;
}
export function loadWorkspace() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? validateWorkspace(JSON.parse(raw)) : initialWorkspace();
}
export function saveWorkspace(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
export function createPage(state, options = {}) {
  const page = makePage(options.title || '제목 없음', options);
  state.pages.push(page); state.activeId = page.id; return page;
}
export function duplicatePage(state, source) {
  const copy = structuredClone(source);
  const suffix = ' (복사본)';
  Object.assign(copy, { id: uid(), title: `${(source.title || '제목 없음').slice(0, 500 - suffix.length)}${suffix}`, favorite: false, updatedAt: new Date().toISOString(), blocks: copy.blocks.map(b => ({ ...b, id: uid() })) });
  state.pages.push(copy); state.activeId = copy.id; return copy;
}
export function descendants(state, id) {
  const ids = new Set([id]); let changed = true;
  while (changed) { changed = false; for (const p of state.pages) if (ids.has(p.parentId) && !ids.has(p.id)) { ids.add(p.id); changed = true; } }
  return ids;
}
export function trashPage(state, id) {
  const batch = uid(); const ids = descendants(state, id);
  state.pages.forEach(p => { if (ids.has(p.id) && !p.deleted) { p.deleted = true; p.deletedBatch = batch; } });
  if (!state.pages.some(p => !p.deleted)) createPage(state, { title: '새로운 시작' });
  state.activeId = state.pages.find(p => !p.deleted).id;
}
export function restorePage(state, id) {
  const page = state.pages.find(p => p.id === id); const batch = page.deletedBatch;
  const ids = descendants(state, id);
  state.pages.forEach(p => { if (ids.has(p.id) && p.deleted && p.deletedBatch === batch) { p.deleted = false; p.deletedBatch = null; } });
  if (page.parentId && state.pages.find(p => p.id === page.parentId)?.deleted) page.parentId = null;
}
export function pageMarkdown(page) {
  const prefixes = { text: '', h1: '# ', h2: '## ', bullet: '- ', quote: '> ', callout: '> ', todo: '- [ ] ', divider: '' };
  return `# ${page.title || '제목 없음'}\n\n` + page.blocks.map(b => b.type === 'divider' ? '---' : (b.type === 'todo' && b.checked ? '- [x] ' : prefixes[b.type]) + b.text).join('\n\n') + '\n';
}
