// Saved versions of pages ("page history"). They live in their own storage entry, apart from
// the workspace, so backups stay small and a full history can never block saving the workspace.
export const HISTORY_KEY = 'folio.history.v1';
export const KEEP = 10;
// Above this many characters the oldest versions are dropped, whichever page they belong to.
export const MAX_SIZE = 1_500_000;
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
const usable = s => plain(s) && typeof s.id === 'string' && typeof s.at === 'string' && typeof s.title === 'string' && s.title.length <= 500 && Array.isArray(s.blocks);
function read() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY)); if (!plain(data)) return {};
    for (const [ws, pages] of Object.entries(data)) {
      if (!plain(pages)) { delete data[ws]; continue; }
      for (const [id, list] of Object.entries(pages)) { if (Array.isArray(list)) pages[id] = list.filter(usable); else delete pages[id]; }
    }
    return data;
  } catch { return {}; }
}
// Writes the history, dropping the oldest versions until it fits. Returns how many were dropped,
// or -1 when even the version in `keep` could not be stored.
function write(data, keep = null) {
  let pruned = 0;
  for (;;) {
    const raw = JSON.stringify(data);
    if (raw.length <= MAX_SIZE) { try { localStorage.setItem(HISTORY_KEY, raw); return pruned; } catch {} }
    let oldest = null;
    for (const pages of Object.values(data)) for (const list of Object.values(pages)) for (const s of list) if (s !== keep && (!oldest || s.at < oldest.s.at)) oldest = { list, s };
    if (!oldest) { if (keep) for (const pages of Object.values(data)) for (const [id, list] of Object.entries(pages)) pages[id] = list.filter(s => s !== keep); try { localStorage.setItem(HISTORY_KEY, JSON.stringify(data)); } catch {} return -1; }
    oldest.list.splice(oldest.list.indexOf(oldest.s), 1); pruned++;
  }
}
// Newest first.
export function versions(ws, pageId) { return [...(read()[ws]?.[pageId] || [])].reverse(); }
// Saves the page as a new version unless it equals the latest one.
// Returns { saved, pruned, same }: `pruned` counts older versions dropped to make room,
// `same` tells that nothing changed since the latest version.
export function saveVersion(ws, page) {
  const data = read(); const pages = data[ws] ||= {}; const list = pages[page.id] ||= [];
  const last = list.at(-1);
  if (last && last.title === page.title && JSON.stringify(last.blocks) === JSON.stringify(page.blocks)) return { saved: false, pruned: 0, same: true };
  const version = { id: crypto.randomUUID(), at: new Date().toISOString(), title: page.title, blocks: structuredClone(page.blocks) };
  list.push(version); let pruned = Math.max(0, list.length - KEEP); list.splice(0, pruned);
  // Trimming a page to its newest versions is routine; only versions lost to the size limit are reported.
  pruned = write(data, version);
  return { saved: pruned >= 0, pruned: Math.max(0, pruned), same: false };
}
export function dropVersions(ws, pageIds = null) {
  const data = read(); if (!data[ws]) return;
  if (pageIds) for (const id of pageIds) delete data[ws][id]; else delete data[ws];
  write(data);
}
