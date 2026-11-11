// HTML for databases: the toolbar, the five view layouts, cell editors, the row form and the settings panels.
import { icon } from './icons.js';
import { safeHref } from './richtext.js';
import { propertyTypes, viewTypes, optionColors, hasOptions, titleProp, operators, activeView, visibleProps, quickFilterProp, quickSortProp, groupProp, dateProp, valueOf, valueText, visibleRows, isFiltered, groups, calcsFor, total, monthWeeks } from './database-model.js';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Korean particles depend on whether the word ends in a consonant: josa('작업', '이', '가') → '작업이'.
export function josa(word, withFinal, without) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}${withFinal}(${without})`;
  return word + (code % 28 ? withFinal : without);
}
export const rowName = row => row.title.trim() || '제목 없음';
const typeIcons = { title: 'text', text: 'text', number: 'numbered', select: 'filter', multi: 'bullet', date: 'calendar', checkbox: 'check', url: 'external' };
const colorOf = (prop, option) => prop.colors?.[option] || 'neutral';
const badge = (prop, option) => `<span class="badge ${colorOf(prop, option)}"><i></i>${esc(option)}</span>`;
const option = (value, label, selected) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
const dotted = date => date.replaceAll('-', '. ');
const monthLabel = month => `${Number(month.slice(0, 4))}년 ${Number(month.slice(5, 7))}월`;
const dayLabel = date => `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;

// The editor of one value. In the table and on a row page it saves on change (`data-cell`).
export function cellHTML(row, prop) {
  const value = valueOf(row, prop); const label = `${esc(rowName(row))} ${esc(prop.name)}`;
  const common = `data-cell="${esc(prop.id)}" data-id="${esc(row.id)}" data-focus="c:${esc(row.id)}:${esc(prop.id)}" aria-label="${label}"`;
  switch (prop.type) {
    case 'select': return `<select class="cell-select ${value ? colorOf(prop, value) : 'empty'}" ${common}>${value === '' || prop.default === undefined ? option('', '없음', value === '') : ''}${prop.options.map(o => option(o, o, o === value)).join('')}</select>`;
    case 'multi': return `<button type="button" class="cell-multi" data-action="option-menu" aria-haspopup="menu" ${common}>${value.length ? value.map(o => badge(prop, o)).join('') : '<span class="cell-placeholder">선택</span>'}</button>`;
    case 'date': return `<input class="cell-input cell-date" type="date" ${common} value="${esc(value)}">`;
    case 'number': return `<input class="cell-input cell-number" type="number" step="any" ${common} value="${value === null ? '' : value}" placeholder="0">`;
    case 'checkbox': return `<input class="cell-check" type="checkbox" ${common} ${value ? 'checked' : ''}>`;
    case 'url': { const href = safeHref(value); return `<span class="cell-url"><input class="cell-input" inputmode="url" ${common} value="${esc(value)}" maxlength="2000" placeholder="https://">${href ? `<a class="cell-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer" aria-label="${label} 열기">${icon('external')}</a>` : ''}</span>`; }
    default: return `<input class="cell-input" ${common} value="${esc(value)}" maxlength="2000" placeholder="비어 있음">`;
  }
}
// A short read-only rendering of a value for cards and lists; empty values give nothing.
function chip(row, prop) {
  const value = valueOf(row, prop);
  if (prop.type === 'select') return value ? badge(prop, value) : '';
  if (prop.type === 'multi') return value.map(o => badge(prop, o)).join('');
  if (prop.type === 'date') return value ? `<small>${esc(dotted(value))}</small>` : '';
  if (prop.type === 'checkbox') return value ? `<small>${icon('check')}${esc(prop.name)}</small>` : '';
  const text = valueText(row, prop); return text ? `<small>${esc(text.slice(0, 60))}</small>` : '';
}
const chips = (row, props) => props.map(p => chip(row, p)).filter(Boolean).slice(0, 4).join('');
const openButton = (db, row, cls, body) => `<button type="button" class="${cls}" draggable="true" data-drag-row="${esc(row.id)}" data-action="open-row" data-id="${esc(row.id)}" data-focus="o:${esc(row.id)}" aria-label="${esc(db.itemName)} 열기: ${esc(rowName(row))}">${body}</button>`;
const emptyText = (db, filtered) => `<div class="db-empty">${filtered ? `조건에 맞는 ${esc(josa(db.itemName, '이', '가'))} 없습니다.` : `아직 ${esc(josa(db.itemName, '이', '가'))} 없습니다.`}</div>`;

function tableHTML(db, view, rows, page, filtered) {
  const props = visibleProps(db, view); const group = groupProp(db, view); const noun = esc(db.itemName);
  const tr = row => `<tr data-row="${esc(row.id)}"><td class="title-cell"><div><button type="button" class="row-grip" draggable="true" data-drag-row="${esc(row.id)}" data-action="row-menu" data-id="${esc(row.id)}" data-focus="g:${esc(row.id)}" aria-haspopup="menu" aria-label="${esc(rowName(row))} 순서 이동">${icon('grip')}</button><button type="button" class="task-name" data-action="open-row" data-id="${esc(row.id)}" data-focus="o:${esc(row.id)}" aria-label="${noun} 열기: ${esc(rowName(row))}">${icon('file')}<span>${esc(rowName(row))}</span><span class="row-open">열기 ${icon('external')}</span></button></div></td>${props.map(p => `<td class="cell-${p.type}">${cellHTML(row, p)}</td>`).join('')}</tr>`;
  const body = group ? groups(group, rows).map(g => `<tr class="group-row"><th colspan="${props.length + 1}" scope="colgroup">${g.key ? badge(group, g.key) : `<span class="badge neutral">${esc(g.label)}</span>`}<span class="group-count">${g.rows.length}</span></th></tr>${g.rows.map(tr).join('')}`).join('') : rows.map(tr).join('');
  const foot = `<tfoot><tr><td class="total-count">${rows.length}개</td>${props.map(p => { const calc = view.totals[p.id] || 'none'; return `<td><div class="total-cell"><select class="total-select" data-total="${esc(p.id)}" data-focus="t:${esc(p.id)}" aria-label="${esc(p.name)} 계산">${calcsFor(p).map(([name, label]) => option(name, label, name === calc)).join('')}</select>${calc !== 'none' ? `<output data-testid="total-${esc(p.id)}">${esc(total(p, rows, calc))}</output>` : ''}</div></td>`; }).join('')}</tr></tfoot>`;
  return `<div class="table-wrap"><table class="db-table" aria-label="${esc(page.title)} 데이터베이스" style="min-width:${230 + props.length * 120}px"><colgroup><col class="col-title">${props.map(() => '<col>').join('')}</colgroup><thead><tr><th class="title-column"><span class="property-type">Aa</span>${noun} 이름</th>${props.map(p => `<th>${icon(typeIcons[p.type])}${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${body}</tbody>${rows.length ? foot : ''}</table>${rows.length ? '' : emptyText(db, filtered)}<button type="button" class="table-new" data-action="new-row">${icon('plus')}새 ${noun} 추가</button></div>`;
}
function boardHTML(db, view, rows) {
  const group = groupProp(db, view); const noun = esc(db.itemName);
  if (!group) return `<div class="db-empty">보드 보기에는 '선택' 유형의 속성이 필요합니다.<br><button type="button" class="button small" data-action="db-panel" data-panel="props">속성 편집</button></div>`;
  const props = visibleProps(db, view).filter(p => p !== group); const columns = groups(group, rows, true);
  return `<div class="board" style="--columns:${columns.length}">${columns.map(g => `<section class="board-column" role="region" aria-label="${esc(g.label)}" data-drop-group="${esc(g.key)}"><div class="board-column-heading">${g.key ? badge(group, g.key) : `<span class="badge neutral">${esc(g.label)}</span>`}<span>${g.rows.length}</span><button type="button" class="icon-button" data-action="new-row" data-prop="${esc(group.id)}" data-value="${esc(g.key)}" aria-label="${esc(g.label)} ${noun} 추가">${icon('plus')}</button></div>${g.rows.map(row => openButton(db, row, 'board-card', `<span>${icon('file')}${esc(rowName(row))}</span><div>${chips(row, props)}</div>`)).join('')}<button type="button" class="board-new" data-action="new-row" data-prop="${esc(group.id)}" data-value="${esc(g.key)}">${icon('plus')}새 ${noun} 추가</button></section>`).join('')}</div>`;
}
function listHTML(db, view, rows, filtered) {
  const props = visibleProps(db, view); const group = groupProp(db, view);
  const item = row => `<div class="db-list-row" role="listitem" data-row="${esc(row.id)}">${openButton(db, row, 'db-list-open', `${icon('file')}<span>${esc(rowName(row))}</span>`)}<span class="db-list-props">${chips(row, props)}</span></div>`;
  const body = group ? groups(group, rows).map(g => `<div class="db-list-group">${g.key ? badge(group, g.key) : `<span class="badge neutral">${esc(g.label)}</span>`}<span class="group-count">${g.rows.length}</span></div>${g.rows.map(item).join('')}`).join('') : rows.map(item).join('');
  return `<div class="db-list" role="list" aria-label="${esc(view.name)}">${body}</div>${rows.length ? '' : emptyText(db, filtered)}<button type="button" class="table-new" data-action="new-row">${icon('plus')}새 ${esc(db.itemName)} 추가</button>`;
}
function calendarHTML(db, view, rows, month) {
  const prop = dateProp(db, view); const noun = esc(db.itemName);
  if (!prop) return `<div class="db-empty">캘린더 보기에는 '날짜' 유형의 속성이 필요합니다.<br><button type="button" class="button small" data-action="db-panel" data-panel="props">속성 편집</button></div>`;
  const today = new Date(); const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const item = row => openButton(db, row, 'calendar-item', esc(rowName(row)));
  const undated = rows.filter(r => !valueOf(r, prop));
  return `<div class="calendar-nav"><button type="button" class="icon-button" data-action="calendar-move" data-delta="-1" data-focus="m:-1" aria-label="이전 달">${icon('chevron')}</button><strong id="calendar-month" aria-live="polite">${monthLabel(month)}</strong><button type="button" class="icon-button" data-action="calendar-move" data-delta="1" data-focus="m:1" aria-label="다음 달">${icon('chevron')}</button><button type="button" class="button small" data-action="calendar-move" data-delta="0" data-focus="m:0">오늘</button><span class="calendar-prop">${icon('calendar')}${esc(prop.name)} 기준</span></div>
    <div class="calendar-scroll"><div class="calendar" role="grid" aria-label="${monthLabel(month)}"><div class="calendar-week calendar-head" role="row">${['일', '월', '화', '수', '목', '금', '토'].map(d => `<span role="columnheader">${d}</span>`).join('')}</div>${monthWeeks(month).map(week => `<div class="calendar-week" role="row">${week.map(date => date ? `<div class="calendar-day ${date === now ? 'today' : ''}" role="gridcell" aria-label="${dayLabel(date)}" data-drop-date="${date}"><div class="calendar-day-head"><span>${Number(date.slice(8))}</span><button type="button" class="icon-button" data-action="new-row" data-prop="${esc(prop.id)}" data-value="${date}" aria-label="${dayLabel(date)} ${noun} 추가">${icon('plus')}</button></div>${rows.filter(r => valueOf(r, prop) === date).map(item).join('')}</div>` : '<div class="calendar-day outside" role="gridcell"></div>').join('')}</div>`).join('')}</div></div>
    ${undated.length ? `<div class="calendar-undated" role="group" aria-label="${esc(prop.name)} 없는 ${noun}"><span>${esc(prop.name)} 없음 · ${undated.length}개</span>${undated.map(item).join('')}</div>` : ''}`;
}
function galleryHTML(db, view, rows, filtered) {
  const props = visibleProps(db, view);
  const preview = row => row.blocks.map(b => b.text.trim()).filter(Boolean).join(' ').slice(0, 140);
  return `<div class="gallery">${rows.map(row => openButton(db, row, 'gallery-card', `<span class="gallery-preview">${esc(preview(row)) || '<i>내용 없음</i>'}</span><strong>${icon('file')}${esc(rowName(row))}</strong><span class="gallery-props">${chips(row, props)}</span>`)).join('')}<button type="button" class="gallery-card gallery-new" data-action="new-row">${icon('plus')}새 ${esc(db.itemName)} 추가</button></div>${rows.length ? '' : emptyText(db, filtered)}`;
}
// `page` is `{ id, title }` of the database page; `ctx` carries the search text and the calendar month.
export function databaseResults(db, page, ctx) {
  const view = activeView(db); const rows = visibleRows(db, view, ctx.query); const filtered = isFiltered(db, view, ctx.query);
  switch (view.type) {
    case 'board': return boardHTML(db, view, rows);
    case 'list': return listHTML(db, view, rows, filtered);
    case 'calendar': return calendarHTML(db, view, rows, ctx.month);
    case 'gallery': return galleryHTML(db, view, rows, filtered);
    default: return tableHTML(db, view, rows, page, filtered);
  }
}
export function countText(db, query) {
  const view = activeView(db);
  return `${visibleRows(db, view, query).length}개의 ${db.itemName}${isFiltered(db, view, query) ? ` · 전체 ${db.rows.length}개` : ''}`;
}
// "전체 1 / 4 완료" for databases that track a status with a "완료" option.
export function totalText(db) {
  const status = db.properties.find(p => p.type === 'select' && p.options.includes('완료'));
  return status ? `전체 ${db.rows.filter(r => valueOf(r, status) === '완료').length} / ${db.rows.length} 완료` : `전체 ${db.rows.length}개`;
}
export function databaseHTML(db, page, ctx) {
  const view = activeView(db); const noun = esc(db.itemName); const filter = quickFilterProp(db); const sort = quickSortProp(db); const dir = db.quick.sort;
  const tool = (panel, label, glyph, count = 0) => `<button type="button" class="db-tool ${count ? 'toggled' : ''}" data-action="db-panel" data-panel="${panel}" data-focus="p:${panel}" aria-label="${label}" aria-haspopup="dialog">${icon(glyph)}<span>${label}</span>${count ? `<b>${count}</b>` : ''}</button>`;
  return `${ctx.heading ? `<div class="database-heading"><div><span class="eyebrow">MAKE IT HAPPEN</span><h2>한 걸음씩, 프로젝트</h2><p>셀을 눌러 바로 수정하거나 ${noun} 이름을 눌러 상세 내용을 여세요.</p></div><span class="database-total">${esc(totalText(db))}</span></div>` : ''}
    <div class="database-toolbar"><div class="db-view-bar"><div class="db-tabs" role="tablist" aria-label="데이터베이스 보기">${db.views.map(v => `<button type="button" role="tab" aria-selected="${v === view}" class="${v === view ? 'selected' : ''}" data-action="db-view" data-view="${esc(v.id)}" data-focus="v:${esc(v.id)}">${icon(viewTypes.find(([type]) => type === v.type)[2])}${esc(v.name)}</button>`).join('')}</div><button type="button" class="icon-button db-add-view" data-action="add-view" data-focus="v:add" aria-label="보기 추가" aria-haspopup="menu">${icon('plus')}</button></div>
    <div class="db-actions"><label class="db-search">${icon('search')}<input type="search" aria-label="데이터베이스 검색" placeholder="${noun} 검색" value="${esc(ctx.query)}"></label><button type="button" class="icon-button db-search-clear" data-action="clear-db-search" aria-label="데이터베이스 검색 지우기" ${ctx.query ? '' : 'hidden'}>${icon('close')}</button>
    ${filter ? `<select aria-label="${esc(filter.name)} 필터" class="filter-select" data-quick="filter" data-focus="q:filter">${option('', `모든 ${filter.name}`, !db.quick.filter)}${filter.options.map(o => option(o, o, o === db.quick.filter)).join('')}</select>` : ''}
    ${sort ? `<button type="button" class="sort-button ${dir !== 'none' ? 'toggled' : ''}" data-action="quick-sort" data-sort="${dir}" data-focus="q:sort" aria-label="${esc(sort.name)}순 정렬" aria-pressed="${dir !== 'none'}" title="${esc(sort.name)} ${dir === 'asc' ? '오름차순 · 다시 누르면 내림차순' : dir === 'desc' ? '내림차순 · 다시 누르면 정렬 해제' : '정렬'}">${icon('sort')}<span>${dir === 'asc' ? '오름차순' : dir === 'desc' ? '내림차순' : `${esc(sort.name)}순`}</span></button>` : ''}
    ${tool('filter', '필터', 'filter', view.filters.length)}${tool('sort', '정렬', 'sort', view.sorts.length)}${tool('props', '속성', 'table')}${tool('view', '보기 설정', 'settings')}
    <button type="button" class="button primary small" data-action="new-row" data-focus="new" aria-label="새 ${noun}">${icon('plus')}새 ${noun}</button></div></div>
    <div id="database-results">${databaseResults(db, page, ctx)}</div><div class="database-footer"><span id="database-count">${esc(countText(db, ctx.query))}</span><span id="database-save-state">${ctx.saved ? '모든 변경 사항 저장됨' : '저장 안 됨 · 백업 필요'}</span></div>`;
}

// The properties of a row shown at the top of its page.
export function rowPropsHTML(db, row) {
  return db.properties.map(p => `<div class="row-prop"><span class="row-prop-name">${icon(typeIcons[p.type])}${esc(p.name)}</span><div class="row-prop-value cell-${p.type}">${cellHTML(row, p)}</div></div>`).join('') || '<p class="row-props-empty">속성이 없습니다.</p>';
}
// The dialog for a new row (`row` null, values from `preset`) or a quick look at an existing one.
export function rowFormHTML(dbId, db, row, preset = {}) {
  const noun = esc(db.itemName);
  const field = p => {
    const value = row ? valueOf(row, p) : preset[p.id] ?? p.default ?? (p.type === 'multi' ? [] : p.type === 'checkbox' ? false : p.type === 'number' ? null : '');
    const name = `p-${esc(p.id)}`; const label = `${noun} ${esc(p.name)}`;
    if (p.type === 'multi') return `<fieldset class="field-label field-options"><legend>${esc(p.name)}</legend>${p.options.length ? p.options.map(o => `<label class="check-option"><input type="checkbox" name="${name}" value="${esc(o)}" aria-label="${label} ${esc(o)}" ${value.includes(o) ? 'checked' : ''}>${badge(p, o)}</label>`).join('') : '<span class="field-hint">속성 편집에서 옵션을 추가하세요.</span>'}</fieldset>`;
    if (p.type === 'checkbox') return `<label class="field-label field-check"><span>${esc(p.name)}</span><input type="checkbox" name="${name}" aria-label="${label}" ${value ? 'checked' : ''}></label>`;
    const control = p.type === 'select' ? `<select name="${name}" aria-label="${label}">${value === '' || p.default === undefined ? option('', '없음', value === '') : ''}${p.options.map(o => option(o, o, o === value)).join('')}</select>`
      : p.type === 'date' ? `<input type="date" name="${name}" aria-label="${label}" value="${esc(value)}">`
      : p.type === 'number' ? `<input type="number" step="any" name="${name}" aria-label="${label}" value="${value === null ? '' : value}">`
      : `<input name="${name}" aria-label="${label}" value="${esc(value)}" maxlength="2000" ${p.type === 'url' ? 'inputmode="url" placeholder="https://"' : ''}>`;
    return `<label class="field-label">${esc(p.name)}${control}</label>`;
  };
  const body = row ? row.blocks.map(b => b.text.trim()).filter(Boolean).join(' ').slice(0, 200) : '';
  return `<form id="row-form" data-db="${esc(dbId)}" data-row-id="${row ? esc(row.id) : ''}"><label class="field-label">${noun} 이름<input name="title" aria-label="${noun} 이름" value="${row ? esc(row.title) : ''}" required maxlength="500" placeholder="제목을 입력하세요" autofocus></label><div class="form-grid">${db.properties.map(field).join('')}</div>
    <div class="row-form-body">${icon('file')}<span>${body ? esc(body) : '본문은 페이지로 열어 블록으로 작성할 수 있습니다.'}</span></div>
    <div class="form-footer">${row ? `<button type="button" class="button danger" data-action="delete-row" data-id="${esc(row.id)}">${icon('trash')}${noun} 삭제</button>` : '<span></span>'}<span class="form-buttons"><button class="button" type="submit" name="then" value="page">${icon('external')}페이지로 열기</button><button class="button primary" type="submit">${noun} 저장</button></span></div></form>`;
}

const propOptions = (db, selected, withTitle = true) => `${withTitle ? option('title', titleProp(db).name, selected === 'title') : ''}${db.properties.map(p => option(p.id, p.name, p.id === selected)).join('')}`;
const propOrTitle = (db, id) => id === 'title' ? titleProp(db) : db.properties.find(p => p.id === id);
export function filterPanelHTML(db) {
  const view = activeView(db);
  const valueControl = (f, prop, n) => {
    const common = `data-filter="${n - 1}" data-part="value" aria-label="필터 ${n} 값"`;
    if (hasOptions(prop)) return `<select ${common}>${option('', '값 선택', !f.value)}${prop.options.map(o => option(o, o, o === f.value)).join('')}</select>`;
    return `<input ${common} ${prop.type === 'date' ? 'type="date"' : prop.type === 'number' ? 'type="number" step="any"' : 'maxlength="500" placeholder="값 입력"'} value="${esc(f.value)}">`;
  };
  return `<p class="dialog-description">'${esc(view.name)}' 보기에는 아래 조건을 모두 만족하는 ${esc(db.itemName)}만 표시됩니다.</p><div class="rule-list">${view.filters.map((f, i) => {
    const prop = propOrTitle(db, f.prop); const ops = operators(prop.type); const op = ops.find(([name]) => name === f.op) || ops[0]; const n = i + 1;
    return `<div class="rule-row"><select data-filter="${i}" data-part="prop" aria-label="필터 ${n} 속성">${propOptions(db, f.prop)}</select><select data-filter="${i}" data-part="op" aria-label="필터 ${n} 조건">${ops.map(([name, label]) => option(name, label, name === op[0])).join('')}</select>${op[2] ? valueControl(f, prop, n) : '<span class="rule-gap"></span>'}<button type="button" class="icon-button" data-action="filter-remove" data-index="${i}" aria-label="필터 ${n} 삭제">${icon('trash')}</button></div>`;
  }).join('') || '<p class="rule-empty">아직 필터가 없습니다.</p>'}</div><div class="form-footer"><button type="button" class="button small" data-action="filter-add">${icon('plus')}필터 추가</button><button type="button" class="button primary small" data-action="close-modal">완료</button></div>`;
}
export function sortPanelHTML(db) {
  const view = activeView(db);
  return `<p class="dialog-description">위에 있는 정렬부터 차례로 적용됩니다. 값이 없는 ${esc(db.itemName)}은 항상 마지막에 놓입니다.</p><div class="rule-list">${view.sorts.map((s, i) => `<div class="rule-row"><select data-sort-rule="${i}" data-part="prop" aria-label="정렬 ${i + 1} 속성">${propOptions(db, s.prop)}</select><select data-sort-rule="${i}" data-part="dir" aria-label="정렬 ${i + 1} 방향">${option('asc', '오름차순', s.dir === 'asc')}${option('desc', '내림차순', s.dir === 'desc')}</select><span class="rule-gap"></span><button type="button" class="icon-button" data-action="sort-remove" data-index="${i}" aria-label="정렬 ${i + 1} 삭제">${icon('trash')}</button></div>`).join('') || '<p class="rule-empty">아직 정렬이 없습니다.</p>'}</div><div class="form-footer"><button type="button" class="button small" data-action="sort-add">${icon('plus')}정렬 추가</button><button type="button" class="button primary small" data-action="close-modal">완료</button></div>`;
}
// `confirming` is the id of the property whose deletion waits for a second click.
export function propsPanelHTML(db, confirming = null) {
  const view = activeView(db);
  return `<label class="field-label">항목 호칭<input aria-label="항목 호칭" data-db-field="itemName" maxlength="20" value="${esc(db.itemName)}" placeholder="항목"></label><p class="dialog-description">'표시'는 '${esc(view.name)}' 보기에만 적용됩니다. 유형을 바꾸면 맞지 않는 값은 비워집니다.</p><div class="prop-list">${db.properties.map((p, i) => {
    const name = esc(p.name); const id = esc(p.id);
    return `<div class="prop-item" data-prop="${id}"><div class="prop-row"><input data-prop-field="name" data-prop-id="${id}" aria-label="${name} 속성 이름" value="${name}" maxlength="100"><select data-prop-field="type" data-prop-id="${id}" aria-label="${name} 속성 유형">${propertyTypes.map(([type, label]) => option(type, label, type === p.type)).join('')}</select><label class="prop-visible"><input type="checkbox" data-prop-field="visible" data-prop-id="${id}" aria-label="${name} 속성 표시" ${view.hidden.includes(p.id) ? '' : 'checked'}>표시</label><button type="button" class="icon-button" data-action="prop-move" data-delta="-1" data-id="${id}" aria-label="${name} 속성 위로" ${i ? '' : 'disabled'}>${icon('chevron')}</button><button type="button" class="icon-button flip" data-action="prop-move" data-delta="1" data-id="${id}" aria-label="${name} 속성 아래로" ${i < db.properties.length - 1 ? '' : 'disabled'}>${icon('chevron')}</button>${confirming === p.id ? `<button type="button" class="button small danger" data-action="prop-delete" data-id="${id}" aria-label="${name} 속성 삭제 확인">삭제 확인</button>` : `<button type="button" class="icon-button" data-action="prop-delete" data-id="${id}" aria-label="${name} 속성 삭제">${icon('trash')}</button>`}</div>
      ${hasOptions(p) ? `<div class="option-list">${p.options.map((o, n) => `<div class="option-row"><span class="badge ${colorOf(p, o)}"><i></i></span><input data-option-field="name" data-prop-id="${id}" data-index="${n}" aria-label="${name} 옵션 ${n + 1} 이름" value="${esc(o)}" maxlength="100"><select data-option-field="color" data-prop-id="${id}" data-index="${n}" aria-label="${name} 옵션 ${n + 1} 색상">${optionColors.map(([color, label]) => option(color, label, color === colorOf(p, o))).join('')}</select><button type="button" class="icon-button" data-action="option-delete" data-id="${id}" data-index="${n}" aria-label="${name} 옵션 ${n + 1} 삭제">${icon('close')}</button></div>`).join('')}<div class="option-row option-new"><input data-new-option="${id}" aria-label="${name} 새 옵션" maxlength="100" placeholder="새 옵션 이름"><button type="button" class="button small" data-action="option-add" data-id="${id}" aria-label="${name} 옵션 추가">${icon('plus')}추가</button>${p.type === 'select' ? `<label class="option-default">기본값<select data-prop-field="default" data-prop-id="${id}" aria-label="${name} 기본값">${option('', '없음', p.default === undefined)}${p.options.map(o => option(o, o, o === p.default)).join('')}</select></label>` : ''}</div></div>` : ''}</div>`;
  }).join('') || '<p class="rule-empty">속성이 없습니다.</p>'}</div><div class="form-footer"><button type="button" class="button small" data-action="prop-add">${icon('plus')}속성 추가</button><button type="button" class="button primary small" data-action="close-modal">완료</button></div>`;
}
export function viewPanelHTML(db) {
  const view = activeView(db); const selects = db.properties.filter(p => p.type === 'select'); const dates = db.properties.filter(p => p.type === 'date');
  return `<label class="field-label">보기 이름<input aria-label="보기 이름" data-view-field="name" maxlength="100" value="${esc(view.name)}"></label><div class="form-grid"><label class="field-label">보기 유형<select aria-label="보기 유형" data-view-field="type">${viewTypes.map(([type, label]) => option(type, label, type === view.type)).join('')}</select></label>
    ${view.type === 'calendar' ? `<label class="field-label">날짜 속성<select aria-label="날짜 속성" data-view-field="dateProp">${option('', dates.length ? `자동 (${dates[0].name})` : '날짜 속성 없음', !view.dateProp)}${dates.map(p => option(p.id, p.name, p.id === view.dateProp)).join('')}</select></label>` : view.type === 'gallery' ? '<span></span>' : `<label class="field-label">그룹화 속성<select aria-label="그룹화 속성" data-view-field="groupBy">${option('', view.type === 'board' ? (selects.length ? `자동 (${selects[0].name})` : '선택 속성 없음') : '그룹 없음', !view.groupBy)}${selects.map(p => option(p.id, p.name, p.id === view.groupBy)).join('')}</select></label>`}</div>
    <div class="form-footer"><button type="button" class="button danger small" data-action="view-delete" ${db.views.length > 1 ? '' : 'disabled title="마지막 보기는 삭제할 수 없습니다."'}>${icon('trash')}보기 삭제</button><button type="button" class="button primary small" data-action="close-modal">완료</button></div>`;
}
