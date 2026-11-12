// Documents this browser kept before Folio had a server. They are never changed or removed
// here; "moving" copies them to the server as new workspaces of the signed-in person.
import { api } from './session.js';
import { validateWorkspace } from './store.js';

const ACTIVE_KEY = 'folio.workspace.v1';
const REGISTRY_KEY = 'folio.workspaces.v1';
const HISTORY_KEY = 'folio.history.v1';
// Ids of the old workspaces that were already copied.
export const MOVED_KEY = 'folio.legacy.moved.v1';

const readJSON = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const movedIds = () => { const ids = readJSON(MOVED_KEY); return new Set(Array.isArray(ids) ? ids : []); };

// Every old workspace that can still be read: [{ id, state }]. The open one comes first.
function read() {
  const found = new Map();
  const add = (id, data) => {
    if (typeof id !== 'string' || !id || found.has(id) || !data) return;
    try { found.set(id, validateWorkspace(structuredClone(data))); } catch {}
  };
  const active = readJSON(ACTIVE_KEY);
  if (active) add(typeof active.workspaceId === 'string' && active.workspaceId ? active.workspaceId : 'default', active);
  const registry = readJSON(REGISTRY_KEY);
  if (Array.isArray(registry?.entries)) for (const entry of registry.entries.slice(0, 20)) add(entry?.id, entry?.snapshot);
  return [...found].map(([id, state]) => ({ id, state }));
}

// What is waiting to be moved: [{ id, name, pages }], or null when there is nothing.
export function legacyData() {
  const moved = movedIds();
  const list = read().filter(w => !moved.has(w.id)).map(w => ({ id: w.id, name: w.state.settings.name, pages: w.state.pages.filter(p => !p.deleted).length }));
  return list.length ? list : null;
}

// Copies the old workspaces and their page history to the server.
// Resolves to { moved, failed, error }: how many went well, how many did not, and why.
export async function moveLegacy() {
  const moved = movedIds(); const history = readJSON(HISTORY_KEY) || {};
  let done = 0; let failed = 0; let error = '';
  for (const { id, state } of read()) {
    if (moved.has(id)) continue;
    try {
      const copy = structuredClone(state); delete copy.workspaceId;
      const created = await api('/api/workspaces', { method: 'POST', body: { state: copy } });
      moved.add(id); done++;
      try { localStorage.setItem(MOVED_KEY, JSON.stringify([...moved])); } catch {}
      // Page history is a bonus: a version that cannot be stored does not undo the move.
      const pages = history[id] && typeof history[id] === 'object' ? history[id] : {};
      for (const [pageId, versions] of Object.entries(pages)) {
        if (!Array.isArray(versions) || !state.pages.some(p => p.id === pageId)) continue;
        for (const v of versions) {
          const at = Date.parse(v?.at);
          if (!Array.isArray(v?.blocks) || typeof v.title !== 'string' || !Number.isFinite(at)) continue;
          await api(`/api/workspaces/${created.id}/pages/${encodeURIComponent(pageId)}/versions`, { method: 'POST', body: { title: v.title, blocks: v.blocks, at } }).catch(() => {});
        }
      }
    } catch (problem) { failed++; error = problem.message; }
  }
  return { moved: done, failed, error };
}
