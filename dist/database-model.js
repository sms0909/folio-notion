// Databases: each database page owns a schema (`properties`), `rows` and saved `views`.
// A row is a small page of its own: a title, one value per property and a block body.
export const propertyTypes = [['text', '텍스트'], ['number', '숫자'], ['select', '선택'], ['multi', '다중 선택'], ['date', '날짜'], ['checkbox', '체크박스'], ['url', 'URL']];
export const viewTypes = [['table', '표', 'table'], ['board', '보드', 'board'], ['list', '목록', 'bullet'], ['calendar', '캘린더', 'calendar'], ['gallery', '갤러리', 'grid']];
export const calcs = [['none', '계산 없음'], ['count', '개수'], ['filled', '값 있음'], ['empty', '비어 있음'], ['sum', '합계'], ['avg', '평균'], ['min', '최소'], ['max', '최대']];
// [name, label] of the colours an option of a select property may take.
export const optionColors = [['neutral', '기본'], ['gray', '회색'], ['blue', '파랑'], ['green', '초록'], ['yellow', '노랑'], ['red', '빨강'], ['purple', '보라']];
export const limits = { databases: 200, properties: 50, options: 100, rows: 5000, views: 20, filters: 20, sorts: 10 };
const typeNames = propertyTypes.map(([type]) => type);
const viewNames = viewTypes.map(([type]) => type);
const numeric = ['sum', 'avg', 'min', 'max'];
const uid = () => crypto.randomUUID();
const isId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
const isText = (value, max) => typeof value === 'string' && value.length <= max;
export const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export const hasOptions = prop => prop.type === 'select' || prop.type === 'multi';

// [operator, label, needs a value]
const textOps = [['contains', '포함', true], ['not_contains', '포함하지 않음', true], ['is', '일치', true], ['empty', '비어 있음', false], ['not_empty', '비어 있지 않음', false]];
const opsByType = {
  text: textOps, url: textOps, title: textOps,
  number: [['eq', '=', true], ['neq', '≠', true], ['gt', '>', true], ['lt', '<', true], ['gte', '≥', true], ['lte', '≤', true], ['empty', '비어 있음', false], ['not_empty', '비어 있지 않음', false]],
  select: [['is', '일치', true], ['is_not', '일치하지 않음', true], ['empty', '비어 있음', false], ['not_empty', '비어 있지 않음', false]],
  multi: [['contains', '포함', true], ['not_contains', '포함하지 않음', true], ['empty', '비어 있음', false], ['not_empty', '비어 있지 않음', false]],
  date: [['is', '같은 날', true], ['before', '이전', true], ['after', '이후', true], ['empty', '비어 있음', false], ['not_empty', '비어 있지 않음', false]],
  checkbox: [['checked', '선택됨', false], ['unchecked', '선택 안 됨', false]],
};
const allOps = [...new Set(Object.values(opsByType).flat().map(([op]) => op))];
export const titleProp = db => ({ id: 'title', name: `${db.itemName} 이름`, type: 'title' });
export const propOf = (db, id) => id === 'title' ? titleProp(db) : db.properties.find(p => p.id === id);
export const operators = type => opsByType[type] || textOps;
export const activeView = db => db.views.find(v => v.id === db.activeViewId) || db.views[0];
export const visibleProps = (db, view) => db.properties.filter(p => !view.hidden.includes(p.id));
export const quickFilterProp = db => db.properties.find(p => p.type === 'select');
export const quickSortProp = db => db.properties.find(p => p.type === 'date');
export const groupProp = (db, view) => db.properties.find(p => p.id === view.groupBy && p.type === 'select') || (view.type === 'board' ? quickFilterProp(db) : null);
export const dateProp = (db, view) => db.properties.find(p => p.id === view.dateProp && p.type === 'date') || quickSortProp(db);

export const emptyValue = prop => prop.type === 'multi' ? [] : prop.type === 'number' ? null : prop.type === 'checkbox' ? false : '';
// Coerces anything (form input, converted or imported data) into a valid value for the property.
export function cleanValue(prop, raw) {
  switch (prop.type) {
    case 'number': { const n = raw === '' || raw === null || raw === undefined || typeof raw === 'boolean' || Array.isArray(raw) ? NaN : Number(raw); return Number.isFinite(n) ? n : null; }
    case 'select': return prop.options.includes(raw) ? raw : '';
    case 'multi': return [...new Set(Array.isArray(raw) ? raw : [raw])].filter(v => prop.options.includes(v));
    case 'date': return isDate(raw) ? raw : '';
    case 'checkbox': return raw === true || raw === 'true' || raw === 'on';
    default: return Array.isArray(raw) ? raw.join(', ').slice(0, 2000) : raw === null || raw === undefined || raw === false ? '' : String(raw).slice(0, 2000);
  }
}
export const valueOf = (row, prop) => prop.id === 'title' ? row.title : row.values[prop.id] === undefined ? emptyValue(prop) : row.values[prop.id];
const isEmpty = value => value === '' || value === null || value === false || (Array.isArray(value) && !value.length);
export const valueText = (row, prop) => { const v = valueOf(row, prop); return prop.type === 'checkbox' ? (v ? '선택됨' : '') : Array.isArray(v) ? v.join(', ') : v === null ? '' : String(v); };
export const rowText = (db, row) => [row.title, ...db.properties.map(p => valueText(row, p))].join(' ');

export function makeRow(db, title = '', preset = {}) {
  const values = {};
  for (const p of db.properties) values[p.id] = cleanValue(p, preset[p.id] ?? p.default ?? emptyValue(p));
  return { id: uid(), title, values, blocks: [] };
}
const makeView = (type, name, extra = {}) => ({ id: uid(), name, type, filters: [], sorts: [], groupBy: null, dateProp: null, hidden: [], totals: {}, ...extra });
export function addView(db, type) {
  const label = viewTypes.find(([t]) => t === type)[1]; let name = label; let n = 2;
  while (db.views.some(v => v.name === name)) name = `${label} ${n++}`;
  const view = makeView(type, name); db.views.push(view); db.activeViewId = view.id; return view;
}
export function makeDatabase() {
  return { itemName: '항목', properties: [{ id: uid(), name: '태그', type: 'multi', options: [] }, { id: uid(), name: '날짜', type: 'date' }], rows: [], views: [makeView('table', '표')], activeViewId: null, quick: { filter: '', sort: 'none' } };
}
export const statuses = ['시작 전', '진행 중', '완료'];
export const priorities = ['높음', '보통', '낮음'];
// The project tracker that ships with every workspace. `tasks` and `prefs` come from older saves.
export function projectDatabase(tasks = [], prefs = {}, text = value => ({ id: uid(), type: 'text', text: value, checked: false })) {
  const db = {
    itemName: '작업',
    properties: [{ id: 'status', name: '상태', type: 'select', options: [...statuses], default: '시작 전', colors: { '진행 중': 'blue', '완료': 'green' } }, { id: 'priority', name: '우선순위', type: 'select', options: [...priorities], default: '보통', colors: { '높음': 'red', '보통': 'yellow', '낮음': 'gray' } }, { id: 'assignee', name: '담당자', type: 'text' }, { id: 'date', name: '마감일', type: 'date' }],
    rows: [], views: [makeView('table', '표', { id: 'table' }), makeView('board', '보드', { id: 'board', groupBy: 'status' })],
    activeViewId: prefs.view === 'board' ? 'board' : 'table',
    quick: { filter: statuses.includes(prefs.status) ? prefs.status : '', sort: ['asc', 'desc'].includes(prefs.sort) ? prefs.sort : 'none' },
  };
  db.rows = tasks.map(t => ({ id: t.id, title: t.title, values: { status: t.status, priority: t.priority, assignee: t.assignee, date: t.date }, blocks: t.note ? [text(t.note)] : [] }));
  return db;
}

function matches(db, row, filter) {
  const prop = propOf(db, filter.prop); if (!prop) return true;
  const op = operators(prop.type).find(([name]) => name === filter.op); if (!op || (op[2] && filter.value === '')) return true;
  const value = valueOf(row, prop); const text = valueText(row, prop).toLocaleLowerCase(); const want = filter.value.toLocaleLowerCase();
  switch (filter.op) {
    case 'empty': return isEmpty(value);
    case 'not_empty': return !isEmpty(value);
    case 'checked': return value === true;
    case 'unchecked': return value !== true;
    case 'contains': return prop.type === 'multi' ? value.includes(filter.value) : text.includes(want);
    case 'not_contains': return prop.type === 'multi' ? !value.includes(filter.value) : !text.includes(want);
    case 'is': return prop.type === 'select' || prop.type === 'date' ? value === filter.value : text === want;
    case 'is_not': return value !== filter.value;
    case 'before': return value !== '' && value < filter.value;
    case 'after': return value !== '' && value > filter.value;
  }
  const n = Number(filter.value); if (!Number.isFinite(n)) return true; if (value === null) return false;
  return { eq: value === n, neq: value !== n, gt: value > n, lt: value < n, gte: value >= n, lte: value <= n }[filter.op];
}
// Empty values always sort last, whichever the direction.
function compare(db, a, b, sort) {
  const prop = propOf(db, sort.prop); if (!prop) return 0;
  const x = valueOf(a, prop); const y = valueOf(b, prop);
  if (isEmpty(x) || isEmpty(y)) return prop.type === 'checkbox' ? (x === y ? 0 : (x ? 1 : -1) * (sort.dir === 'desc' ? -1 : 1)) : isEmpty(x) ? (isEmpty(y) ? 0 : 1) : -1;
  const order = prop.type === 'number' ? x - y : prop.type === 'select' ? prop.options.indexOf(x) - prop.options.indexOf(y) : prop.type === 'checkbox' ? 0 : valueText(a, prop).localeCompare(valueText(b, prop), 'ko');
  return sort.dir === 'desc' ? -order : order;
}
// Rows of a view after the database-wide quick filter, the view's own filters (all must match),
// the search text, and the sort rules.
export function visibleRows(db, view, query = '') {
  const quick = quickFilterProp(db); const q = query.trim().toLocaleLowerCase();
  const rows = db.rows.filter(row => (!db.quick.filter || !quick || valueOf(row, quick) === db.quick.filter) && view.filters.every(f => matches(db, row, f)) && (!q || rowText(db, row).toLocaleLowerCase().includes(q)));
  const date = quickSortProp(db);
  const sorts = [...(db.quick.sort !== 'none' && date ? [{ prop: date.id, dir: db.quick.sort }] : []), ...view.sorts];
  if (sorts.length) rows.sort((a, b) => { for (const s of sorts) { const order = compare(db, a, b, s); if (order) return order; } return 0; });
  return rows;
}
export const isFiltered = (db, view, query) => !!(query.trim() || (db.quick.filter && quickFilterProp(db)) || view.filters.length);
export const isSorted = (db, view) => !!((db.quick.sort !== 'none' && quickSortProp(db)) || view.sorts.length);
// Splits rows by a select property, in option order; rows without a value come last.
export function groups(prop, rows, always = false) {
  const out = prop.options.map(option => ({ key: option, label: option, rows: rows.filter(r => valueOf(r, prop) === option) }));
  const rest = rows.filter(r => valueOf(r, prop) === '');
  if (rest.length) out.push({ key: '', label: `${prop.name} 없음`, rows: rest });
  return always ? out : out.filter(g => g.rows.length);
}
export const calcsFor = prop => calcs.filter(([name]) => prop.type === 'number' || !numeric.includes(name));
export function total(prop, rows, calc) {
  const values = rows.map(r => valueOf(r, prop)); const filled = values.filter(v => !isEmpty(v));
  if (calc === 'count') return String(rows.length);
  if (calc === 'filled') return String(filled.length);
  if (calc === 'empty') return String(values.length - filled.length);
  if (!numeric.includes(calc) || prop.type !== 'number') return '';
  const numbers = values.filter(v => v !== null); if (!numbers.length) return '-';
  const result = calc === 'sum' ? numbers.reduce((a, b) => a + b, 0) : calc === 'avg' ? numbers.reduce((a, b) => a + b, 0) / numbers.length : calc === 'min' ? Math.min(...numbers) : Math.max(...numbers);
  return String(Math.round(result * 100) / 100);
}
// Weeks (Sunday first) covering a month, as ISO dates; days outside the month are null.
export function monthWeeks(month) {
  const [year, m] = month.split('-').map(Number); const first = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(); const days = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
export function shiftMonth(month, delta) {
  const [year, m] = month.split('-').map(Number); const date = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Changing a property's type keeps whatever part of the old values still makes sense.
export function changeType(db, prop, type) {
  if (prop.type === type) return;
  const old = { ...prop }; prop.type = type; delete prop.default;
  if (hasOptions(prop)) {
    const seen = hasOptions(old) ? old.options : [...new Set(db.rows.map(r => valueText(r, old).trim()).filter(Boolean))].map(v => v.slice(0, 100));
    prop.options = seen.filter(v => !v.includes(',')).slice(0, limits.options);
  } else { delete prop.options; delete prop.colors; }
  for (const row of db.rows) {
    const value = valueOf(row, old);
    row.values[prop.id] = cleanValue(prop, type === 'multi' ? (Array.isArray(value) ? value : [valueText(row, old).trim().slice(0, 100)]) : type === 'select' ? (Array.isArray(value) ? value[0] : valueText(row, old).trim().slice(0, 100)) : type === 'checkbox' ? !isEmpty(value) : Array.isArray(value) ? value.join(', ') : value);
  }
  repair(db);
}
export const parseOptions = text => [...new Set(String(text).split(',').map(v => v.trim().slice(0, 100)).filter(Boolean))].slice(0, limits.options);
// After the schema changes, drops everything that points at properties or options that are gone.
export function repair(db) {
  const ids = new Set(db.properties.map(p => p.id)); const known = id => id === 'title' || ids.has(id);
  for (const p of db.properties) {
    if (p.default !== undefined && !(p.type === 'select' && p.options.includes(p.default))) delete p.default;
    if (p.colors) for (const key of Object.keys(p.colors)) if (!p.options.includes(key)) delete p.colors[key];
  }
  for (const row of db.rows) {
    for (const key of Object.keys(row.values)) if (!ids.has(key)) delete row.values[key];
    for (const p of db.properties) row.values[p.id] = cleanValue(p, valueOf(row, p));
  }
  for (const view of db.views) {
    view.filters = view.filters.filter(f => known(f.prop)).map(f => {
      const prop = propOf(db, f.prop); const ops = operators(prop.type); const op = ops.find(([name]) => name === f.op) || ops[0];
      return { prop: f.prop, op: op[0], value: !op[2] || (hasOptions(prop) && !prop.options.includes(f.value)) ? '' : f.value };
    });
    view.sorts = view.sorts.filter(s => known(s.prop));
    view.hidden = view.hidden.filter(id => ids.has(id));
    if (!db.properties.some(p => p.id === view.groupBy && p.type === 'select')) view.groupBy = null;
    if (!db.properties.some(p => p.id === view.dateProp && p.type === 'date')) view.dateProp = null;
    for (const [id, calc] of Object.entries(view.totals)) { const p = db.properties.find(p => p.id === id); if (!p || !calcsFor(p).some(([name]) => name === calc)) delete view.totals[id]; }
  }
  const quick = quickFilterProp(db); if (!quick || !quick.options.includes(db.quick.filter)) db.quick.filter = '';
  if (!db.views.some(v => v.id === db.activeViewId)) db.activeViewId = db.views[0].id;
}
// Renames an option everywhere it is used. Returns false when the new name is taken or not usable.
export function renameOption(db, prop, from, to) {
  const name = String(to).trim().slice(0, 100); const index = prop.options.indexOf(from);
  if (index < 0 || !name || name.includes(',') || (name !== from && prop.options.includes(name))) return false;
  prop.options[index] = name;
  if (prop.default === from) prop.default = name;
  if (prop.colors && prop.colors[from] !== undefined) { prop.colors[name] = prop.colors[from]; if (name !== from) delete prop.colors[from]; }
  for (const row of db.rows) { const v = row.values[prop.id]; if (Array.isArray(v)) row.values[prop.id] = v.map(x => x === from ? name : x); else if (v === from) row.values[prop.id] = name; }
  for (const view of db.views) for (const f of view.filters) if (f.prop === prop.id && f.value === from) f.value = name;
  if (quickFilterProp(db) === prop && db.quick.filter === from) db.quick.filter = name;
  return true;
}
// A copy with fresh row and block ids, for duplicated database pages.
export function copyDatabase(db) {
  const copy = structuredClone(db);
  for (const row of copy.rows) { row.id = uid(); row.blocks = row.blocks.map(b => ({ ...b, id: uid() })); }
  return copy;
}

function validValue(prop, value) {
  switch (prop.type) {
    case 'number': return value === null || (typeof value === 'number' && Number.isFinite(value));
    case 'select': return value === '' || prop.options.includes(value);
    case 'multi': return Array.isArray(value) && new Set(value).size === value.length && value.every(v => prop.options.includes(v));
    case 'date': return value === '' || isDate(value);
    case 'checkbox': return typeof value === 'boolean';
    default: return isText(value, 2000);
  }
}
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
// Throws unless `db` is well formed. `validBlocks` checks a row body and `rowIds` collects ids across databases.
export function validateDatabase(db, validBlocks, rowIds) {
  const fail = () => { throw new Error('데이터베이스 데이터가 올바르지 않습니다.'); };
  if (!plain(db) || !isText(db.itemName, 20) || !db.itemName.trim() || !Array.isArray(db.properties) || db.properties.length > limits.properties || !Array.isArray(db.rows) || db.rows.length > limits.rows || !Array.isArray(db.views) || db.views.length < 1 || db.views.length > limits.views) fail();
  if (!plain(db.quick) || !isText(db.quick.filter, 100) || !['none', 'asc', 'desc'].includes(db.quick.sort)) fail();
  const props = new Map();
  for (const p of db.properties) {
    if (!plain(p) || !isId(p.id) || p.id === 'title' || props.has(p.id) || !isText(p.name, 100) || !p.name.trim() || !typeNames.includes(p.type)) fail();
    if (hasOptions(p) ? !(Array.isArray(p.options) && p.options.length <= limits.options && new Set(p.options).size === p.options.length && p.options.every(o => isText(o, 100) && o.trim() && !o.includes(','))) : p.options !== undefined) fail();
    if (p.default !== undefined && !(p.type === 'select' && p.options.includes(p.default))) fail();
    if (p.colors !== undefined && !(hasOptions(p) && plain(p.colors) && Object.entries(p.colors).every(([option, color]) => p.options.includes(option) && optionColors.some(([name]) => name === color)))) fail();
    props.set(p.id, p);
  }
  for (const row of db.rows) {
    if (!plain(row) || !isId(row.id) || rowIds.has(row.id) || !isText(row.title, 500) || !plain(row.values) || !Array.isArray(row.blocks) || row.blocks.length > 10000) fail();
    rowIds.add(row.id);
    for (const [key, value] of Object.entries(row.values)) if (!props.has(key) || !validValue(props.get(key), value)) fail();
    validBlocks(row.blocks);
  }
  const views = new Set(); const known = id => id === 'title' || props.has(id);
  for (const v of db.views) {
    if (!plain(v) || !isId(v.id) || views.has(v.id) || !isText(v.name, 100) || !v.name.trim() || !viewNames.includes(v.type)) fail();
    if (!Array.isArray(v.filters) || v.filters.length > limits.filters || !v.filters.every(f => plain(f) && known(f.prop) && allOps.includes(f.op) && isText(f.value, 500))) fail();
    if (!Array.isArray(v.sorts) || v.sorts.length > limits.sorts || !v.sorts.every(s => plain(s) && known(s.prop) && ['asc', 'desc'].includes(s.dir))) fail();
    if (!(v.groupBy === null || props.get(v.groupBy)?.type === 'select') || !(v.dateProp === null || props.get(v.dateProp)?.type === 'date')) fail();
    if (!Array.isArray(v.hidden) || !v.hidden.every(id => props.has(id)) || !plain(v.totals) || !Object.entries(v.totals).every(([id, calc]) => props.has(id) && calcs.some(([name]) => name === calc))) fail();
    views.add(v.id);
  }
  if (!views.has(db.activeViewId)) fail();
}
