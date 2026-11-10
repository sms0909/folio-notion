// In-memory undo/redo for the block editor. Each page keeps up to LIMIT snapshots
// of its block list; nothing here is persisted.
const LIMIT = 50;
const stacks = new Map();
let burst = { key: '', at: 0 };
const stack = id => stacks.get(id) || stacks.set(id, { undo: [], redo: [] }).get(id);
export function snapshot(page) {
  const s = stack(page.id);
  s.undo.push(JSON.stringify(page.blocks)); if (s.undo.length > LIMIT) s.undo.shift();
  s.redo = []; burst = { key: '', at: 0 };
}
// Consecutive typing in one block collapses into a single undo step.
export function typing(page, blockId) {
  const key = `${page.id}:${blockId}`; const now = Date.now();
  if (burst.key !== key || now - burst.at > 1000) snapshot(page);
  burst = { key, at: now };
}
function step(page, from, to) {
  const s = stack(page.id); if (!s[from].length) return false;
  s[to].push(JSON.stringify(page.blocks)); page.blocks = JSON.parse(s[from].pop());
  burst = { key: '', at: 0 }; return true;
}
export const undo = page => step(page, 'undo', 'redo');
export const redo = page => step(page, 'redo', 'undo');
export function clearHistory() { stacks.clear(); burst = { key: '', at: 0 }; }
