// 워크스페이스 저장소. 브라우저와 주고받는 모양(엔티티)은 dist/wire.js 에 적혀 있다.
import { randomUUID } from 'node:crypto';
import { one, pool, query, transaction } from './db.mjs';
import { flatten } from '../dist/wire.js';
import { blockTypes, initialWorkspace, validateWorkspace } from '../dist/store.js';

export const WORKSPACE_LIMIT = 20;
export const VERSION_KEEP = 30;
const MAX_OPS = 400000;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
const PAGE_TYPES = ['document', 'home', 'database'];
const OWNERS = ['page', 'row', 'tpl'];

export const invalid = (message = '요청한 내용이 올바르지 않습니다.') => Object.assign(new Error(message), { statusCode: 400, shown: message });
const id = value => { if (typeof value !== 'string' || !ID.test(value)) throw invalid(); return value; };
const idOrNull = value => value === null || value === undefined ? null : id(value);
const text = (value, max) => { if (typeof value !== 'string' || value.length > max) throw invalid(); return value; };
const pos = value => { if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(); return value; };
const oneOf = (value, list) => { if (!list.includes(value)) throw invalid(); return value; };
const json = (value, max) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const raw = JSON.stringify(value);
  if (raw.length > max) throw invalid('한 번에 저장하기에는 내용이 너무 큽니다.');
  return raw;
};

const UPSERT = {
  page: 'INSERT INTO pages (workspace_id, id, parent_id, position, type, title, icon, deleted, data, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE parent_id = VALUES(parent_id), position = VALUES(position), type = VALUES(type), title = VALUES(title), icon = VALUES(icon), deleted = VALUES(deleted), data = VALUES(data), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by)',
  block: 'INSERT INTO blocks (workspace_id, id, owner_kind, owner_id, parent_id, position, type, text, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE owner_kind = VALUES(owner_kind), owner_id = VALUES(owner_id), parent_id = VALUES(parent_id), position = VALUES(position), type = VALUES(type), text = VALUES(text), data = VALUES(data)',
  db: 'INSERT INTO `databases` (workspace_id, id, data) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
  prop: 'INSERT INTO db_properties (workspace_id, db_id, id, position, data) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE position = VALUES(position), data = VALUES(data)',
  view: 'INSERT INTO db_views (workspace_id, db_id, id, position, data) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE position = VALUES(position), data = VALUES(data)',
  row: 'INSERT INTO db_rows (workspace_id, id, db_id, position, title, `values`) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE db_id = VALUES(db_id), position = VALUES(position), title = VALUES(title), `values` = VALUES(`values`)',
  tpl: 'INSERT INTO templates (workspace_id, id, position, title, icon) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE position = VALUES(position), title = VALUES(title), icon = VALUES(icon)',
};
const REMOVE = {
  page: 'DELETE FROM pages WHERE workspace_id = ? AND id = ?',
  block: 'DELETE FROM blocks WHERE workspace_id = ? AND id = ?',
  db: 'DELETE FROM `databases` WHERE workspace_id = ? AND id = ?',
  prop: 'DELETE FROM db_properties WHERE workspace_id = ? AND db_id = ? AND id = ?',
  view: 'DELETE FROM db_views WHERE workspace_id = ? AND db_id = ? AND id = ?',
  row: 'DELETE FROM db_rows WHERE workspace_id = ? AND id = ?',
  tpl: 'DELETE FROM templates WHERE workspace_id = ? AND id = ?',
};

// 엔티티 변경([키, 값 | null])을 검사해서 저장한다. 값이 null 이면 지운다.
export async function applyOps(conn, ws, userId, ops) {
  if (!Array.isArray(ops) || ops.length > MAX_OPS) throw invalid();
  const now = Date.now();
  const put = { page: [], block: [], db: [], prop: [], view: [], row: [], tpl: [] };
  const gone = { page: [], block: [], db: [], prop: [], view: [], row: [], tpl: [] };
  let name = null; let prefs = null;
  for (const op of ops) {
    if (!Array.isArray(op) || typeof op[0] !== 'string') throw invalid();
    const [key, v] = op; const parts = key.split('/'); const kind = parts[0];
    if (kind === 'ws' || kind === 'prefs') {
      if (parts.length !== 1 || !v || typeof v !== 'object') throw invalid();
      if (kind === 'ws') { name = text(v.name, 120).trim(); if (!name) throw invalid(); } else prefs = json(v.data, 20000);
      continue;
    }
    const nested = kind === 'prop' || kind === 'view';
    if (!put[kind] || parts.length !== (nested ? 3 : 2)) throw invalid();
    const ids = parts.slice(1).map(id);
    if (v === null) { gone[kind].push([ws, ...ids]); continue; }
    if (!v || typeof v !== 'object') throw invalid();
    if (kind === 'page') put.page.push([ws, ids[0], idOrNull(v.parent), pos(v.pos), oneOf(v.type, PAGE_TYPES), text(v.title, 500), text(v.icon, 30), v.deleted ? 1 : 0, json(v.data, 4000), now, userId]);
    else if (kind === 'block') put.block.push([ws, ids[0], oneOf(v.owner, OWNERS), id(v.of), idOrNull(v.parent), pos(v.pos), oneOf(v.type, blockTypes), text(v.text, 100000), json(v.data, 400000)]);
    else if (kind === 'db') put.db.push([ws, ids[0], json(v.data, 20000)]);
    else if (nested) put[kind].push([ws, ids[0], ids[1], pos(v.pos), json(v.data, 400000)]);
    else if (kind === 'row') put.row.push([ws, ids[0], id(v.db), pos(v.pos), text(v.title, 500), json(v.values, 1000000)]);
    else put.tpl.push([ws, ids[0], pos(v.pos), text(v.title, 500), text(v.icon, 30)]);
  }
  if (name !== null) await conn.query('UPDATE workspaces SET name = ? WHERE id = ?', [name, ws]);
  if (prefs !== null) await conn.query('UPDATE workspace_members SET prefs = ? WHERE workspace_id = ? AND user_id = ?', [prefs, ws, userId]);
  for (const kind of Object.keys(put)) {
    if (gone[kind].length) await conn.batch(REMOVE[kind], gone[kind]);
    if (put[kind].length) await conn.batch(UPSERT[kind], put[kind]);
  }
  // 영구 삭제한 페이지는 저장된 버전도 함께 지운다.
  if (gone.page.length) await conn.batch('DELETE FROM page_versions WHERE workspace_id = ? AND page_id = ?', gone.page);
}

// 변경을 저장하고 워크스페이스 판 번호를 올린다. 같은 push 가 다시 오면(응답을 못 받고 재시도) 한 번만 반영한다.
export async function pushOps(ws, userId, push, ops) {
  if (typeof push !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(push)) throw invalid();
  return transaction(async conn => {
    const [row] = await conn.query('SELECT rev, last_push FROM workspaces WHERE id = ? FOR UPDATE', [ws]);
    if (row.last_push === push) return { rev: row.rev, repeated: true };
    await applyOps(conn, ws, userId, ops);
    await conn.query('UPDATE workspaces SET rev = rev + 1, last_push = ? WHERE id = ?', [push, ws]);
    return { rev: row.rev + 1 };
  });
}

// 워크스페이스 전체를 엔티티 목록으로 읽는다. 값의 필드 순서는 dist/wire.js 의 flatten 과 같다.
export async function readWorkspace(ws, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const [head] = await conn.query('SELECT w.name, w.rev, w.last_push, m.prefs FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ? WHERE w.id = ?', [userId, ws]);
    if (!head) return null;
    const entities = [['ws', { name: head.name }], ['prefs', { data: head.prefs ? JSON.parse(head.prefs) : {} }]];
    for (const p of await conn.query('SELECT id, parent_id, position, type, title, icon, deleted, data FROM pages WHERE workspace_id = ?', [ws])) entities.push([`page/${p.id}`, { parent: p.parent_id, pos: p.position, type: p.type, title: p.title, icon: p.icon, deleted: !!p.deleted, data: JSON.parse(p.data) }]);
    for (const b of await conn.query('SELECT id, owner_kind, owner_id, parent_id, position, type, text, data FROM blocks WHERE workspace_id = ?', [ws])) entities.push([`block/${b.id}`, { owner: b.owner_kind, of: b.owner_id, parent: b.parent_id, pos: b.position, type: b.type, text: b.text, data: JSON.parse(b.data) }]);
    for (const d of await conn.query('SELECT id, data FROM `databases` WHERE workspace_id = ?', [ws])) entities.push([`db/${d.id}`, { data: JSON.parse(d.data) }]);
    for (const p of await conn.query('SELECT db_id, id, position, data FROM db_properties WHERE workspace_id = ?', [ws])) entities.push([`prop/${p.db_id}/${p.id}`, { pos: p.position, data: JSON.parse(p.data) }]);
    for (const v of await conn.query('SELECT db_id, id, position, data FROM db_views WHERE workspace_id = ?', [ws])) entities.push([`view/${v.db_id}/${v.id}`, { pos: v.position, data: JSON.parse(v.data) }]);
    for (const r of await conn.query('SELECT id, db_id, position, title, `values` FROM db_rows WHERE workspace_id = ?', [ws])) entities.push([`row/${r.id}`, { db: r.db_id, pos: r.position, title: r.title, values: JSON.parse(r.values) }]);
    for (const t of await conn.query('SELECT id, position, title, icon FROM templates WHERE workspace_id = ?', [ws])) entities.push([`tpl/${t.id}`, { pos: t.position, title: t.title, icon: t.icon }]);
    return { id: ws, rev: head.rev, lastPush: head.last_push, entities };
  } finally {
    await conn.query('COMMIT').catch(() => {});
    conn.release();
  }
}

export const memberOf = (ws, userId) => one('SELECT w.id, w.name, w.rev, m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id WHERE w.id = ? AND m.user_id = ?', [ws, userId]);
export const listWorkspaces = userId => query('SELECT w.id, w.name FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id WHERE m.user_id = ? ORDER BY m.created_at, w.id', [userId]);

async function insertWorkspace(conn, userId, state) {
  const ws = `ws-${randomUUID()}`; const now = Date.now();
  await conn.query('INSERT INTO workspaces (id, name, owner_id, rev, created_at) VALUES (?, ?, ?, 1, ?)', [ws, state.settings.name, userId, now]);
  await conn.query('INSERT INTO workspace_members (workspace_id, user_id, role, created_at) VALUES (?, ?, ?, ?)', [ws, userId, 'owner', now]);
  await applyOps(conn, ws, userId, [...flatten(state).map].map(([key, raw]) => [key, JSON.parse(raw)]));
  return ws;
}

// 새 워크스페이스를 만든다. `state` 를 주면 그 내용(백업, 예전 브라우저 데이터)으로 채운다.
export async function createWorkspace(userId, { name = null, state = null }) {
  let content;
  if (state) {
    try { content = validateWorkspace(state); } catch (error) { throw invalid(error.message); }
    delete content.workspaceId;
  } else {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed || trimmed.length > 120) throw invalid('워크스페이스 이름을 1~120자로 입력해 주세요.');
    content = initialWorkspace(); content.settings.name = trimmed;
    for (const db of Object.values(content.databases)) db.rows = [];
  }
  return transaction(async conn => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [userId]);
    const mine = await conn.query('SELECT w.name FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id WHERE m.user_id = ?', [userId]);
    if (mine.length >= WORKSPACE_LIMIT) throw invalid(`워크스페이스는 최대 ${WORKSPACE_LIMIT}개까지 만들 수 있습니다.`);
    if (!state && mine.some(row => row.name === content.settings.name)) throw invalid('같은 이름의 워크스페이스가 있습니다.');
    return insertWorkspace(conn, userId, content);
  });
}

export const openWorkspace = (ws, userId) => query('UPDATE users SET current_workspace = ? WHERE id = ?', [ws, userId]);

// 화면을 열 때 쓸 워크스페이스. 처음 온 사용자에게는 기본 워크스페이스를 만들어 준다.
// `pageId` 가 다른 내 워크스페이스의 페이지라면(공유한 링크) 그 워크스페이스로 옮긴다.
export async function bootWorkspace(user, pageId = null) {
  const ws = await transaction(async conn => {
    const [row] = await conn.query('SELECT current_workspace FROM users WHERE id = ? FOR UPDATE', [user.id]);
    const mine = (await conn.query('SELECT workspace_id AS id FROM workspace_members WHERE user_id = ? ORDER BY created_at, workspace_id', [user.id])).map(m => m.id);
    let current = mine.includes(row.current_workspace) ? row.current_workspace : mine[0] ?? null;
    if (!current) {
      const state = initialWorkspace(); state.settings.name = `${user.name || '나'}의 워크스페이스`.slice(0, 120);
      current = await insertWorkspace(conn, user.id, state);
    } else if (pageId && ID.test(pageId)) {
      const homes = (await conn.query('SELECT p.workspace_id AS id FROM pages p JOIN workspace_members m ON m.workspace_id = p.workspace_id AND m.user_id = ? WHERE p.id = ?', [user.id, pageId])).map(p => p.id);
      if (homes.length && !homes.includes(current)) current = homes[0];
    }
    if (current !== row.current_workspace) await conn.query('UPDATE users SET current_workspace = ? WHERE id = ?', [current, user.id]);
    return current;
  });
  return { ...await readWorkspace(ws, user.id), workspaces: await listWorkspaces(user.id) };
}

// 페이지 하나를 블록 트리로 읽는다.
export async function readPage(ws, pageId) {
  const page = await one('SELECT id, parent_id, type, title, icon, deleted, data FROM pages WHERE workspace_id = ? AND id = ?', [ws, pageId]);
  if (!page) return null;
  const rows = await query('SELECT id, parent_id, type, text, data FROM blocks WHERE workspace_id = ? AND owner_kind = ? AND owner_id = ? ORDER BY position, id', [ws, 'page', pageId]);
  const nodes = new Map(rows.map(b => [b.id, { id: b.id, type: b.type, text: b.text, ...JSON.parse(b.data), children: [] }]));
  const blocks = [];
  for (const b of rows) { const node = nodes.get(b.id); delete node.indent; (nodes.get(b.parent_id)?.children ?? blocks).push(node); }
  return { id: page.id, parentId: page.parent_id, type: page.type, title: page.title, icon: page.icon, deleted: !!page.deleted, ...JSON.parse(page.data), blocks };
}

// 페이지 버전. 가장 최근 것부터.
export const listVersions = (ws, pageId) => query('SELECT v.id, v.at, v.title, v.block_count AS blockCount, u.name AS author FROM page_versions v LEFT JOIN users u ON u.id = v.author_id WHERE v.workspace_id = ? AND v.page_id = ? ORDER BY v.at DESC, v.id', [ws, pageId]);

export async function readVersion(ws, pageId, versionId) {
  const row = await one('SELECT id, at, title, blocks FROM page_versions WHERE workspace_id = ? AND page_id = ? AND id = ?', [ws, pageId, versionId]);
  return row && { id: row.id, at: row.at, title: row.title, blocks: JSON.parse(row.blocks) };
}

// 바로 앞 버전과 같으면 저장하지 않는다. 페이지마다 최근 VERSION_KEEP 개만 남긴다.
export async function saveVersion(ws, userId, pageId, { title, blocks, at = null }) {
  id(pageId); text(title, 500);
  if (!Array.isArray(blocks) || blocks.length > 10000) throw invalid();
  const raw = JSON.stringify(blocks);
  if (raw.length > 4000000) throw invalid('버전으로 저장하기에는 페이지가 너무 큽니다.');
  const now = Date.now(); const when = Number.isFinite(at) && at > 0 && at < now ? Math.floor(at) : now;
  return transaction(async conn => {
    const [page] = await conn.query('SELECT id FROM pages WHERE workspace_id = ? AND id = ? FOR UPDATE', [ws, pageId]);
    if (!page) throw invalid('페이지를 찾을 수 없습니다.');
    const [last] = await conn.query('SELECT title, blocks FROM page_versions WHERE workspace_id = ? AND page_id = ? ORDER BY at DESC, id LIMIT 1', [ws, pageId]);
    if (when === now && last && last.title === title && last.blocks === raw) return { saved: false, same: true };
    await conn.query('INSERT INTO page_versions (id, workspace_id, page_id, at, author_id, title, block_count, blocks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [randomUUID(), ws, pageId, when, userId, title, blocks.length, raw]);
    const extra = await conn.query('SELECT id FROM page_versions WHERE workspace_id = ? AND page_id = ? ORDER BY at DESC, id LIMIT 1000 OFFSET ?', [ws, pageId, VERSION_KEEP]);
    if (extra.length) await conn.batch('DELETE FROM page_versions WHERE id = ?', extra.map(v => [v.id]));
    return { saved: true, same: false };
  });
}
