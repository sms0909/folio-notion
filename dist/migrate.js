// Storage format upgrades. Each step takes the previous shape and returns the next one;
// `migrate` runs on every load and import, so older backups keep working.
import { projectDatabase } from './database-model.js';
export const CURRENT_VERSION = 4;
export const BACKUP_KEY = 'folio.workspace.v1.backup';
export const supportedVersions = [1, 2, 3, 4];
// v1 → v2: blocks may carry inline `marks`. Nothing has to be rewritten, only relabelled.
function toV2(data) { data.version = 2; return data; }
// v2 → v3: the single shared task list becomes one database per database page.
// The tasks go to the project page; every other database page starts empty.
function toV3(data) {
  const tasks = Array.isArray(data.tasks) ? data.tasks : []; const prefs = data.settings.database || {};
  const pages = data.pages.filter(p => p.type === 'database'); const live = pages.filter(p => !p.deleted);
  let owner = live.find(p => p.id === 'projects') || live[0];
  if (!owner && tasks.length) {
    if (data.pages.length < 1000) {
      owner = { id: data.pages.some(p => p.id === 'projects') ? crypto.randomUUID() : 'projects', title: '프로젝트', icon: 'grid', parentId: null, type: 'database', blocks: [], favorite: false, deleted: false, deletedBatch: null, updatedAt: new Date().toISOString() };
      data.pages.push(owner); pages.push(owner);
    } else owner = pages[0];
  }
  data.databases = {};
  for (const p of pages) data.databases[p.id] = p === owner ? projectDatabase(tasks, prefs) : projectDatabase();
  delete data.tasks; delete data.settings.database; data.version = 3;
  return data;
}
// v3 → v4: pages gain covers and layout options, blocks gain page links and tables of contents,
// and the workspace gains templates. All of it is optional, so nothing has to be rewritten.
function toV4(data) { data.version = 4; return data; }
export function migrate(data) {
  if (data.version === 1) data = toV2(data);
  if (data.version === 2) data = toV3(data);
  if (data.version === 3) data = toV4(data);
  return data;
}
// Keeps the untouched pre-upgrade data once, so a failed upgrade can be recovered by hand.
export function keepBackup(raw) {
  try { if (localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, raw); } catch {}
}
