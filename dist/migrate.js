// Storage format upgrades. Each step takes the previous shape and returns the next one;
// `migrate` runs on every load and import, so older backups keep working.
export const CURRENT_VERSION = 2;
export const BACKUP_KEY = 'folio.workspace.v1.backup';
export const supportedVersions = [1, 2];
// v1 → v2: blocks may carry inline `marks`. Nothing has to be rewritten, only relabelled.
function toV2(data) { data.version = 2; return data; }
export function migrate(data) {
  if (data.version === 1) data = toV2(data);
  return data;
}
// Keeps the untouched pre-upgrade data once, so a failed upgrade can be recovered by hand.
export function keepBackup(raw) {
  try { if (localStorage.getItem(BACKUP_KEY) === null) localStorage.setItem(BACKUP_KEY, raw); } catch {}
}
