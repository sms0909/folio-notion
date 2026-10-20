import { icon } from './icons.js';
import { statuses, priorities } from './store.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tone = value => ({ '완료': 'green', '진행 중': 'blue', '높음': 'red', '낮음': 'gray' }[value] || 'neutral');
const badge = value => `<span class="badge ${tone(value)}"><i></i>${esc(value)}</span>`;
export function filteredTasks(tasks, prefs) {
  const query = prefs.query.trim().toLocaleLowerCase();
  const result = tasks.filter(t => (!prefs.status || t.status === prefs.status) && `${t.title} ${t.status} ${t.priority} ${t.assignee} ${t.date}`.toLocaleLowerCase().includes(query));
  if (prefs.sort === 'asc' || prefs.sort === 'desc') result.sort((a, b) => {
    if (!a.date) return b.date ? 1 : 0;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date) * (prefs.sort === 'desc' ? -1 : 1);
  });
  return result;
}
const options = (values, selected) => values.map(value => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(value)}</option>`).join('');
function taskRow(t) {
  const name = esc(t.title); const id = esc(t.id);
  return `<tr data-task-row="${id}"><td><button class="task-name" data-action="edit-task" data-id="${id}" aria-label="작업 열기: ${name}">${icon('file')}<span>${name}</span><span class="row-open">열기 ${icon('external')}</span></button></td>
    <td><select class="cell-select ${tone(t.status)}" data-task-field="status" data-id="${id}" aria-label="${name} 상태">${options(statuses, t.status)}</select></td>
    <td><select class="cell-select priority ${tone(t.priority)}" data-task-field="priority" data-id="${id}" aria-label="${name} 우선순위">${options(priorities, t.priority)}</select></td>
    <td><input class="cell-input" data-task-field="assignee" data-id="${id}" aria-label="${name} 담당자" value="${esc(t.assignee)}" placeholder="미지정" maxlength="100"></td>
    <td><input class="cell-input cell-date" type="date" data-task-field="date" data-id="${id}" aria-label="${name} 마감일" value="${esc(t.date)}"></td></tr>`;
}
export function databaseResults(tasks, prefs) {
  const rows = filteredTasks(tasks, prefs);
  if (prefs.view === 'table') return `<div class="table-wrap"><table aria-label="프로젝트 데이터베이스"><thead><tr><th class="title-column"><span class="property-type">Aa</span>작업 이름</th><th>${icon('clock')}상태</th><th>${icon('filter')}우선순위</th><th>${icon('user')}담당자</th><th>${icon('calendar')}마감일</th></tr></thead><tbody>${rows.map(taskRow).join('')}</tbody></table>${!rows.length ? '<div class="db-empty">조건에 맞는 작업이 없습니다.</div>' : ''}<button class="table-new" data-action="new-task">${icon('plus')}새 항목</button></div>`;
  return `<div class="board">${statuses.map(s => `<section class="board-column" role="region" aria-label="${s}" data-drop-status="${s}"><div class="board-column-heading">${badge(s)}<span>${rows.filter(t => t.status === s).length}</span><button class="icon-button" data-action="new-task" data-status="${s}" aria-label="${s} 작업 추가">${icon('plus')}</button></div>${rows.filter(t => t.status === s).map(t => `<button class="board-card" draggable="true" data-drag-task="${esc(t.id)}" data-action="edit-task" data-id="${esc(t.id)}" aria-label="작업 열기: ${esc(t.title)}"><span>${icon('file')}${esc(t.title)}</span><div>${badge(t.priority)}<small>${t.date ? esc(t.date.replaceAll('-', '. ')) : '마감일 없음'}</small></div></button>`).join('')}<button class="board-new" data-action="new-task" data-status="${s}">${icon('plus')}새 작업 추가</button></section>`).join('')}</div>`;
}
export function databaseHTML(tasks, prefs, saved = true) {
  return `<div class="database-heading"><div><span class="eyebrow">MAKE IT HAPPEN</span><h2>한 걸음씩, 프로젝트</h2><p>셀을 눌러 바로 수정하거나 작업 이름을 눌러 상세 내용을 여세요.</p></div><span class="database-total">전체 ${tasks.filter(t => t.status === '완료').length} / ${tasks.length} 완료</span></div>
    <div class="database-toolbar"><div class="db-tabs" role="tablist" aria-label="데이터베이스 보기"><button role="tab" aria-selected="${prefs.view === 'table'}" class="${prefs.view === 'table' ? 'selected' : ''}" data-action="view-table">${icon('table')}표</button><button role="tab" aria-selected="${prefs.view === 'board'}" class="${prefs.view === 'board' ? 'selected' : ''}" data-action="view-board">${icon('board')}보드</button></div>
    <div class="db-actions"><label class="db-search">${icon('search')}<input type="search" aria-label="데이터베이스 검색" placeholder="작업 검색" value="${esc(prefs.query)}"></label><button class="icon-button db-search-clear" data-action="clear-db-search" aria-label="데이터베이스 검색 지우기" ${prefs.query ? '' : 'hidden'}>${icon('close')}</button><select aria-label="상태 필터" class="filter-select"><option value="">모든 상태</option>${options(statuses, prefs.status)}</select><button class="sort-button ${prefs.sort !== 'none' ? 'toggled' : ''}" data-action="sort" data-sort="${prefs.sort}" aria-label="마감일순 정렬" aria-pressed="${prefs.sort !== 'none'}" title="${prefs.sort === 'asc' ? '마감일 오름차순 · 다시 누르면 내림차순' : prefs.sort === 'desc' ? '마감일 내림차순 · 다시 누르면 정렬 해제' : '마감일 정렬'}">${icon('sort')}<span>${prefs.sort === 'asc' ? '오름차순' : prefs.sort === 'desc' ? '내림차순' : '정렬'}</span></button><button class="button primary small" data-action="new-task" aria-label="새 작업">${icon('plus')}새 작업</button></div></div>
    <div id="database-results">${databaseResults(tasks, prefs)}</div><div class="database-footer"><span id="database-count">${filteredTasks(tasks, prefs).length}개의 작업${prefs.status || prefs.query.trim() ? ` · 전체 ${tasks.length}개` : ''}</span><span id="database-save-state">${saved ? '모든 변경 사항 저장됨' : '저장 안 됨 · 백업 필요'}</span></div>`;
}
