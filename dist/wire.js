// The shape a workspace takes between the browser and the server: a flat set of entities,
// each addressed by a key. The server stores every entity in a row of its own, so two people
// changing different blocks never overwrite each other. Used by both the browser and the server.
//
//   ws                 { name }
//   prefs              { data: { activeId, settings } }           (kept per member)
//   page/<id>          { parent, pos, type, title, icon, deleted, data }
//   block/<id>         { owner: 'page' | 'row' | 'tpl', of, parent, pos, type, text, data }
//   db/<page id>       { data }
//   prop/<db>/<id>     { pos, data }
//   view/<db>/<id>     { pos, data }
//   row/<id>           { db, pos, title, values }
//   tpl/<id>           { pos, title, icon }
//
// Blocks form a tree: `parent` names the block one level up and `pos` orders the blocks of one
// owner from top to bottom. The editor works on the same tree flattened into a list with indents.
import { CURRENT_VERSION } from './migrate.js';

const MAX_INDENT = 6;
const indentOf = b => Math.min(MAX_INDENT, Math.max(0, Number.isInteger(b.indent) ? b.indent : 0));

// Order values for a list. Items that kept their place keep their value, so inserting or
// removing a few items changes only those items. Values are rounded to nine decimals so they
// come back from the database exactly as they were sent.
function positions(ids, prev) {
  const n = ids.length; const fresh = () => ids.map((_, i) => i + 1);
  if (!prev || !prev.ids.length) return fresh();
  const old = prev.ids; const was = prev.pos;
  let head = 0; while (head < n && head < old.length && ids[head] === old[head]) head++;
  if (head === n && n === old.length) return was;
  let tail = 0; while (tail < n - head && tail < old.length - head && ids[n - 1 - tail] === old[old.length - 1 - tail]) tail++;
  const middle = n - head - tail; const pos = new Array(n);
  for (let i = 0; i < head; i++) pos[i] = was[i];
  for (let i = 0; i < tail; i++) pos[n - 1 - i] = was[old.length - 1 - i];
  if (!middle) return pos;
  if (!head && !tail) return fresh();
  const low = head ? was[head - 1] : null; const high = tail ? was[old.length - tail] : null;
  const step = low === null || high === null ? 1 : (high - low) / (middle + 1);
  if (!(step > 1e-6) || n > 100000) return fresh();
  const start = low === null ? high - middle - 1 : low;
  for (let i = 0; i < middle; i++) pos[head + i] = Math.round((start + (i + 1) * step) * 1e9) / 1e9;
  return pos;
}

// Turns a workspace into entities. `prev` is the result of an earlier call (or of `compose`);
// its order values are reused where the order did not change.
// Returns { map: key → JSON text, lists: list name → { ids, pos } }.
export function flatten(state, prev = null) {
  const map = new Map(); const lists = new Map();
  const put = (key, value) => map.set(key, JSON.stringify(value));
  const place = (name, ids) => { const pos = positions(ids, prev?.lists.get(name)); lists.set(name, { ids, pos }); return pos; };
  const putBlocks = (owner, of, list) => {
    const pos = place(`blocks/${of}`, list.map(b => b.id)); const open = [];
    list.forEach((b, i) => {
      const { id, type, text, indent: _, ...data } = b; const indent = indentOf(b);
      while (open.length && open.at(-1).indent >= indent) open.pop();
      const depth = open.length ? open.at(-1).depth + 1 : 0;
      // An indent the tree cannot express (a jump of two levels) is kept beside it.
      if (indent !== depth) data.indent = indent;
      put(`block/${id}`, { owner, of, parent: open.at(-1)?.id ?? null, pos: pos[i], type, text, data });
      open.push({ id, indent, depth });
    });
  };
  const { name, ...settings } = state.settings;
  put('ws', { name });
  put('prefs', { data: { activeId: state.activeId, settings } });
  const pagePos = place('pages', state.pages.map(p => p.id));
  state.pages.forEach((page, i) => {
    const { id, title, icon, parentId, type, blocks, deleted, ...data } = page;
    put(`page/${id}`, { parent: parentId, pos: pagePos[i], type, title, icon, deleted, data });
    putBlocks('page', id, blocks);
  });
  for (const [dbId, db] of Object.entries(state.databases || {})) {
    const { properties, views, rows, ...data } = db;
    put(`db/${dbId}`, { data });
    const propPos = place(`props/${dbId}`, properties.map(p => p.id));
    properties.forEach((p, i) => put(`prop/${dbId}/${p.id}`, { pos: propPos[i], data: p }));
    const viewPos = place(`views/${dbId}`, views.map(v => v.id));
    views.forEach((v, i) => put(`view/${dbId}/${v.id}`, { pos: viewPos[i], data: v }));
    const rowPos = place(`rows/${dbId}`, rows.map(r => r.id));
    rows.forEach((row, i) => {
      put(`row/${row.id}`, { db: dbId, pos: rowPos[i], title: row.title, values: row.values });
      putBlocks('row', row.id, row.blocks);
    });
  }
  const templates = state.templates || [];
  const tplPos = place('tpls', templates.map(t => t.id));
  templates.forEach((t, i) => {
    put(`tpl/${t.id}`, { pos: tplPos[i], title: t.title, icon: t.icon });
    putBlocks('tpl', t.id, t.blocks);
  });
  return { map, lists };
}

// What changed between two entity maps, as [key, JSON text | null] pairs. Null removes the entity.
export function diff(before, after) {
  const ops = [];
  for (const [key, value] of after) if (before.get(key) !== value) ops.push([key, value]);
  for (const key of before.keys()) if (!after.has(key)) ops.push([key, null]);
  return ops;
}

const byPos = (a, b) => a.pos - b.pos || (a.id < b.id ? -1 : 1);

// Builds a workspace from entities ([key, value] pairs). Entities written by different people
// may not fit together (a block whose page is gone, two pages moved into each other); those are
// repaired here so the workspace always opens. Returns { state, lists } — pass the result to
// `flatten` as `prev` to keep the order values.
export function compose(entries) {
  const kinds = { page: [], block: [], db: new Map(), prop: [], view: [], row: [], tpl: [] };
  let name = 'Folio'; let prefs = {};
  for (const [key, value] of entries) {
    const [kind, id, sub] = key.split('/');
    if (kind === 'ws') name = value.name;
    else if (kind === 'prefs') prefs = value.data || {};
    else if (kind === 'db') kinds.db.set(id, value.data);
    else if (kind === 'prop' || kind === 'view') kinds[kind].push({ ...value, db: id, id: sub });
    else if (kinds[kind]) kinds[kind].push({ ...value, id });
  }
  const lists = new Map();
  const keep = (listName, items) => { items.sort(byPos); lists.set(listName, { ids: items.map(item => item.id), pos: items.map(item => item.pos) }); return items; };
  const group = (items, field) => { const groups = new Map(); for (const item of items) { if (!groups.has(item[field])) groups.set(item[field], []); groups.get(item[field]).push(item); } return groups; };
  const blocksOf = group(kinds.block, 'of');
  const takeBlocks = (owner, of) => {
    const depths = new Map();
    return keep(`blocks/${of}`, (blocksOf.get(of) || []).filter(b => b.owner === owner)).map(b => {
      const depth = depths.has(b.parent) ? depths.get(b.parent) + 1 : 0; depths.set(b.id, depth);
      const { indent: kept, ...data } = b.data || {}; const indent = Math.min(MAX_INDENT, Number.isInteger(kept) ? kept : depth);
      return { id: b.id, type: b.type, text: b.text, ...data, ...(indent ? { indent } : {}) };
    });
  };
  const pages = keep('pages', kinds.page).map(p => ({ id: p.id, title: p.title, icon: p.icon, parentId: p.parent, type: p.type, blocks: takeBlocks('page', p.id), ...p.data, deleted: !!p.deleted }));
  const pageById = new Map(pages.map(p => [p.id, p]));
  for (const page of pages) {
    const seen = new Set([page.id]); let cursor = page;
    while (cursor.parentId !== null) {
      const parent = pageById.get(cursor.parentId);
      if (!parent || seen.has(parent.id)) { cursor.parentId = null; break; }
      seen.add(parent.id); cursor = parent;
    }
  }
  for (const page of pages) if (!page.deleted && page.parentId !== null && pageById.get(page.parentId).deleted) page.parentId = null;
  const propsOf = group(kinds.prop, 'db'); const viewsOf = group(kinds.view, 'db'); const rowsOf = group(kinds.row, 'db');
  const databases = {};
  for (const page of pages) {
    if (page.type !== 'database' || !kinds.db.has(page.id)) continue;
    const id = page.id;
    databases[id] = {
      ...kinds.db.get(id),
      properties: keep(`props/${id}`, propsOf.get(id) || []).map(p => p.data),
      views: keep(`views/${id}`, viewsOf.get(id) || []).map(v => v.data),
      rows: keep(`rows/${id}`, rowsOf.get(id) || []).map(r => ({ id: r.id, title: r.title, values: r.values, blocks: takeBlocks('row', r.id) })),
    };
  }
  const templates = keep('tpls', kinds.tpl).map(t => ({ id: t.id, title: t.title, icon: t.icon, blocks: takeBlocks('tpl', t.id) }));
  const state = { version: CURRENT_VERSION, activeId: prefs.activeId ?? pages.find(p => !p.deleted)?.id ?? null, settings: { theme: 'light', ...(prefs.settings || {}), name }, pages, databases };
  if (templates.length) state.templates = templates;
  return { state, lists };
}
