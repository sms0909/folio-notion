import { STORAGE_KEY, initialWorkspace, validateWorkspace, uid } from './store.js';
export const REGISTRY_KEY = 'folio.workspaces.v1';
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/;
export const workspaceId = state => idPattern.test(state.workspaceId || '') ? state.workspaceId : 'default';
function readRegistry() {
  const raw = localStorage.getItem(REGISTRY_KEY);
  if (!raw) return [];
  const registry = JSON.parse(raw);
  if (registry.version !== 1 || !Array.isArray(registry.entries) || registry.entries.length > 20) throw new Error('워크스페이스 목록을 읽지 못했습니다. 현재 문서를 백업해 주세요.');
  const ids = new Set();
  for (const entry of registry.entries) {
    if (!entry || !idPattern.test(entry.id || '') || ids.has(entry.id) || !entry.snapshot) throw new Error('워크스페이스 목록이 올바르지 않습니다.');
    ids.add(entry.id);
  }
  return registry.entries;
}
export function listWorkspaces(state) {
  const id = workspaceId(state);
  const entries = readRegistry().map(entry => ({ id: entry.id, name: entry.id === id ? state.settings.name : validateWorkspace(entry.snapshot).settings.name }));
  if (!entries.some(entry => entry.id === id)) entries.unshift({ id, name: state.settings.name });
  return entries;
}
export function switchLocalWorkspace(state, targetId, newName = null) {
  const entries = readRegistry();
  const id = workspaceId(state);
  const currentSnapshot = validateWorkspace({ ...structuredClone(state), workspaceId: id });
  const currentEntry = entries.find(entry => entry.id === id);
  if (currentEntry) currentEntry.snapshot = currentSnapshot;
  else entries.push({ id, snapshot: currentSnapshot });
  let target;
  if (newName !== null) {
    const name = newName.trim();
    if (!name || name.length > 120) throw new Error('워크스페이스 이름을 1~120자로 입력해 주세요.');
    if (entries.length >= 20) throw new Error('워크스페이스는 최대 20개까지 만들 수 있습니다.');
    if (entries.some(entry => entry.snapshot.settings.name === name)) throw new Error('같은 이름의 워크스페이스가 있습니다.');
    const snapshot = initialWorkspace();
    snapshot.settings.name = name; snapshot.tasks = []; snapshot.workspaceId = `workspace-${uid()}`;
    target = { id: snapshot.workspaceId, snapshot }; entries.push(target);
  } else target = entries.find(entry => entry.id === targetId);
  if (!target) throw new Error('워크스페이스를 찾지 못했습니다.');
  const next = validateWorkspace({ ...structuredClone(target.snapshot), workspaceId: target.id });
  // Archive current edits before touching the canonical active workspace. If the
  // second write fails, the old active data remains readable and archived.
  localStorage.setItem(REGISTRY_KEY, JSON.stringify({ version: 1, entries }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
