// Keeps the workspace on screen and the one on the server the same.
//
// The server sends the workspace along with the page, so the app starts without waiting. Every
// edit is written to this browser at once (the "mirror") and sent to the server a moment later
// as the entities that changed (see wire.js). If the page closes before the server answered,
// the mirror is picked up again on the next visit.
import { session, api } from './session.js';
import { flatten, diff, compose } from './wire.js';
import { initialWorkspace, validateWorkspace } from './store.js';

export const MIRROR_KEY = 'folio.mirror.v1';
export const SYNC_KEY = 'folio.sync.v1';
export const CONFLICT_KEY = 'folio.mirror.v1.conflict';
const PUSH_DELAY = 400;
const CHECK_EVERY = 30000;
const KEEPALIVE_LIMIT = 60000;

const boot = JSON.parse(document.querySelector('#folio-workspace')?.textContent || 'null');
export const workspace = { id: boot?.id ?? null, list: boot?.workspaces ?? [] };

let rev = boot?.rev ?? 0;
let acked = new Map();          // what the server holds, as far as this tab knows
let lastFlat = null;            // the latest flattened state; its order values are reused
let hooks = { current: () => null, replace: () => {}, status: () => {} };
let blocked = !boot;            // nothing is saved while the workspace could not be read
let edits = 0; let sentEdits = 0; let dirty = false;
let inflight = null; let running = null; let timer = null; let retryIn = 0;
let failure = '';               // why the last save did not reach the server
let stale = false;               // the page was sent with an older workspace than this browser had
let saves = 0;                   // how many saves the server has confirmed
let checking = false; let checkAgain = false; let lastCheck = Date.now();

const readJSON = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
function writeMeta() {
  try { localStorage.setItem(SYNC_KEY, JSON.stringify({ user: session.user?.id, workspace: workspace.id, rev, dirty, inflight: inflight?.push ?? null })); } catch {}
}
const entriesOf = map => [...map].map(([key, raw]) => [key, JSON.parse(raw)]);
const textsOf = entities => new Map(entities.map(([key, value]) => [key, JSON.stringify(value)]));

// Reads the workspace the server sent. Returns { state, error, notice }.
export function start() {
  if (!boot) return { state: initialWorkspace(), error: '워크스페이스를 불러오지 못했습니다. 페이지를 새로 고쳐 주세요.' };
  let state; let composed;
  try { composed = compose(boot.entities); state = validateWorkspace(composed.state); }
  catch { blocked = true; return { state: initialWorkspace(), error: '서버에 저장된 데이터를 읽지 못했습니다. 덮어쓰지 않도록 저장을 멈췄습니다. 관리자에게 문의해 주세요.' }; }
  acked = textsOf(boot.entities); lastFlat = { map: acked, lists: composed.lists };
  let notice = '';
  const meta = readJSON(SYNC_KEY);
  // A reload can be answered from before this tab's last save landed; then this browser's copy is the newer one.
  const older = !!meta && meta.rev > boot.rev;
  if (meta && (meta.dirty || older) && meta.user === session.user?.id && meta.workspace === boot.id) {
    // Edits this browser made that the server may not have yet.
    const raw = localStorage.getItem(MIRROR_KEY);
    const mine = older || boot.rev === meta.rev || (boot.rev === meta.rev + 1 && !!boot.lastPush && boot.lastPush === meta.inflight);
    if (mine) { try { state = validateWorkspace(JSON.parse(raw)); stale = older; if (meta.dirty) { dirty = true; edits = 1; } } catch {} }
    else if (raw) { try { localStorage.setItem(CONFLICT_KEY, raw); } catch {} notice = '다른 곳에서 워크스페이스가 바뀌어, 이 브라우저에서 저장하지 못했던 마지막 변경은 반영하지 않았습니다.'; }
  }
  if (!dirty) { try { localStorage.setItem(MIRROR_KEY, JSON.stringify(state)); } catch {} }
  writeMeta();
  return { state, error: '', notice };
}

// `current()` gives the state on screen, `replace(state)` puts a newer one there,
// `status(kind)` shows 'saving' | 'saved' | 'error'.
export function attach(next) {
  hooks = next;
  if (dirty) schedule(0);
  if (stale) check(true);
  window.addEventListener('online', () => { if (dirty) schedule(0); check(true); });
  window.addEventListener('focus', () => check());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(() => { if (!document.hidden) check(); }, CHECK_EVERY);
  window.addEventListener('pagehide', leave);
}

export const failed = () => blocked || !!failure;
export const failureText = () => failure || (blocked ? '저장 안 됨' : '');

function schedule(delay = PUSH_DELAY) { clearTimeout(timer); timer = setTimeout(() => { timer = null; push(); }, delay); }

// Call after every change to the state. Returns false when nothing is being saved.
export function save(state) {
  if (blocked) return false;
  try { localStorage.setItem(MIRROR_KEY, JSON.stringify(state)); } catch {}
  edits++;
  if (!dirty) { dirty = true; writeMeta(); }
  if (!failure) hooks.status('saving');
  schedule();
  return true;
}

function prepare() {
  const flat = flatten(hooks.current(), lastFlat); const ops = diff(acked, flat.map); lastFlat = flat;
  if (!ops.length) return null;
  const push = crypto.randomUUID();
  return { push, flat, edits, text: `{"base":${rev},"push":"${push}","ops":[${ops.map(([key, raw]) => `[${JSON.stringify(key)},${raw ?? 'null'}]`).join(',')}]}` };
}

function settle() {
  if (edits !== sentEdits || !dirty) return;
  dirty = false; writeMeta(); hooks.status('saved');
}

async function run(keepalive = false) {
  if (blocked) return;
  if (!inflight) {
    sentEdits = edits; inflight = prepare();
    if (!inflight) { failure = ''; settle(); return; }
    writeMeta();
  }
  try {
    const result = await api(`/api/workspaces/${workspace.id}/ops`, { method: 'POST', text: inflight.text, keepalive: keepalive && inflight.text.length < KEEPALIVE_LIMIT });
    const expected = rev + 1;
    acked = inflight.flat.map; sentEdits = inflight.edits; inflight = null; saves++; failure = ''; retryIn = 0;
    // A later number means someone else saved in between. `rev` stays where it is until
    // check() has read what they changed.
    if (result.rev === expected) rev = result.rev; else checkAgain = true;
    writeMeta();
    if (edits !== sentEdits) schedule(0); else settle();
  } catch (error) {
    if (error.status === 401 || error.status === 403) failure = '저장 안 됨 · 다시 로그인 필요';
    else if (error.status === 404) { failure = '저장 안 됨 · 워크스페이스 없음'; blocked = true; }
    else if (error.status >= 400 && error.status < 500) { failure = '저장 안 됨 · 백업 필요'; inflight = null; }
    else { failure = '저장 안 됨 · 연결 확인'; retryIn = Math.min(30000, retryIn ? retryIn * 2 : 1000); schedule(retryIn); }
    hooks.status('error', error.status >= 400 && error.status < 500 ? error.message : '');
  }
}
function push(keepalive = false) { return running ??= run(keepalive).finally(() => { running = null; if (checkAgain) check(true); }); }

// Sends everything that is waiting and resolves when the server has it (or refused it).
export async function flush() {
  clearTimeout(timer); timer = null;
  await push();
  if (dirty && !failure) await push();
  return !dirty;
}

// The page is going away: hand the last edits to the browser to deliver.
function leave() {
  if (!dirty || blocked || running) return;
  clearTimeout(timer); timer = null; push(true);
}

// Looks for changes other people (or other tabs) saved, and folds them into the state on screen.
// What was changed here and not yet saved stays as it is.
export async function check(force = false) {
  if (blocked || checking || (!force && Date.now() - lastCheck < 3000)) return;
  checking = true; checkAgain = false; lastCheck = Date.now();
  try {
    const before = saves;
    const data = await api(`/api/workspaces/${workspace.id}?have=${rev}`);
    // An answer read while a save was on its way may not include that save: ask again afterwards.
    if (running || saves !== before) { checkAgain = true; return; }
    if (data.unchanged || data.rev <= rev) return;
    const server = textsOf(data.entities);
    const local = flatten(hooks.current(), lastFlat);
    const merged = new Map(server);
    for (const [key, raw] of diff(acked, local.map)) { if (raw === null) merged.delete(key); else merged.set(key, raw); }
    // Which page is open, and how the sidebar looks, belongs to this tab.
    merged.set('prefs', local.map.get('prefs'));
    const composed = compose(entriesOf(merged));
    let next; try { next = validateWorkspace(composed.state); } catch { return; }
    const flat = flatten(next, composed);
    acked = server; rev = data.rev; lastFlat = flat; inflight = null;
    if (diff(local.map, flat.map).length) {
      try { localStorage.setItem(MIRROR_KEY, JSON.stringify(next)); } catch {}
      hooks.replace(next);
    }
    if (diff(acked, flat.map).length) { edits++; dirty = true; schedule(0); }
    writeMeta();
  } catch {} finally { checking = false; if (checkAgain && !running) setTimeout(() => check(true), 0); }
}

// Before logging out: save what is left and forget this browser's copy.
export async function forget() {
  const saved = await flush().catch(() => false);
  if (!saved) return false;
  try { localStorage.removeItem(MIRROR_KEY); localStorage.removeItem(SYNC_KEY); localStorage.removeItem(CONFLICT_KEY); } catch {}
  blocked = true;
  return true;
}

// Workspaces of the signed-in person.
export async function createWorkspace(body) {
  const { id } = await api('/api/workspaces', { method: 'POST', body });
  return id;
}
export async function refreshWorkspaces() { workspace.list = (await api('/api/workspaces')).workspaces; }
export async function openWorkspace(id) {
  await api(`/api/workspaces/${id}/open`, { method: 'POST' });
  location.href = '/';
}

// Stores a file in the workspace. Resolves to { id, name, size, url }.
export const uploadFile = file => api(`/api/workspaces/${workspace.id}/files?name=${encodeURIComponent(file.name || '이미지')}&type=${encodeURIComponent(file.type)}`, { method: 'POST', raw: file });

// Saved versions of a page ("page history"), newest first.
const versionsPath = pageId => `/api/workspaces/${workspace.id}/pages/${encodeURIComponent(pageId)}/versions`;
export const listVersions = async pageId => (await api(versionsPath(pageId))).versions;
export const readVersion = (pageId, versionId) => api(`${versionsPath(pageId)}/${encodeURIComponent(versionId)}`);
// `copy` is { title, blocks } taken at the moment the version was asked for.
// Resolves to { saved, same }. With `leaving`, the request is left to the browser to deliver.
export async function saveVersion(pageId, copy, leaving = false) {
  if (blocked) return { saved: false, same: false };
  const text = JSON.stringify(copy);
  if (leaving) { if (text.length < KEEPALIVE_LIMIT) api(versionsPath(pageId), { method: 'POST', text, keepalive: true }).catch(() => {}); return { saved: false, same: false }; }
  await flush();
  return api(versionsPath(pageId), { method: 'POST', text });
}
