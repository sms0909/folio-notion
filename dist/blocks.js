// Block-level editing rules (Markdown shortcuts, numbering, indentation, toggles)
// and the caret helpers the editor needs for contenteditable blocks.
export const MAX_INDENT = 6;
export const MAX_TEXT = 100000;
export const listTypes = ['bullet', 'numbered', 'todo', 'toggle'];
export const staticTypes = ['divider', 'toc', 'page'];
const shortcuts = [[/^#$/, 'h1'], [/^##$/, 'h2'], [/^###$/, 'h3'], [/^[-*]$/, 'bullet'], [/^\d{1,9}\.$/, 'numbered'], [/^\[\]$/, 'todo'], [/^>$/, 'quote']];
export const markdownShortcut = prefix => shortcuts.find(([pattern]) => pattern.test(prefix))?.[1] || null;
export const indentOf = b => Math.min(MAX_INDENT, Math.max(0, Number.isInteger(b.indent) ? b.indent : 0));
export function numbering(blocks) {
  const counters = [];
  return blocks.map(b => {
    const depth = indentOf(b);
    counters.length = depth + 1;
    counters[depth] = b.type === 'numbered' ? (counters[depth] || 0) + 1 : 0;
    return counters[depth];
  });
}
export function hiddenBlocks(blocks) {
  const hidden = new Set(); let closed = null;
  for (const b of blocks) {
    const depth = indentOf(b);
    if (closed !== null && depth > closed) { hidden.add(b.id); continue; }
    closed = b.type === 'toggle' && b.open === false ? depth : null;
  }
  return hidden;
}
export function subtreeEnd(blocks, index) {
  const depth = indentOf(blocks[index]); let end = index + 1;
  while (end < blocks.length && indentOf(blocks[end]) > depth) end++;
  return end;
}
export function shiftIndent(blocks, index, delta) {
  const depth = indentOf(blocks[index]);
  if (delta > 0 && (index === 0 || depth >= MAX_INDENT || depth > indentOf(blocks[index - 1]))) return false;
  if (delta < 0 && depth === 0) return false;
  const end = subtreeEnd(blocks, index);
  for (let i = index; i < end; i++) blocks[i].indent = Math.min(MAX_INDENT, Math.max(0, indentOf(blocks[i]) + delta));
  return true;
}
export function slashMatches(options, query) {
  const q = query.trim().toLocaleLowerCase();
  return options.filter(([type, label, , , keywords = '']) => !q || `${label} ${type} ${keywords}`.toLocaleLowerCase().includes(q));
}

export function readText(el) {
  let text = ''; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) text += walker.currentNode.data;
  return text;
}
export function selectionOffsets(el) {
  const selection = getSelection(); if (!selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null;
  const measure = (node, offset) => { const r = document.createRange(); r.selectNodeContents(el); r.setEnd(node, offset); return r.toString().length; };
  return { start: measure(range.startContainer, range.startOffset), end: measure(range.endContainer, range.endOffset) };
}
function locate(el, offset) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node; let last = null;
  while ((node = walker.nextNode())) {
    if (offset <= node.data.length) return [node, offset];
    offset -= node.data.length; last = node;
  }
  return last ? [last, last.data.length] : [el, 0];
}
export function setSelection(el, start, end = start) {
  const range = document.createRange();
  range.setStart(...locate(el, start)); range.setEnd(...locate(el, end));
  const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
}
// True when the caret sits on the first (direction < 0) or last visual line of the block.
export function caretOnEdge(el, direction) {
  const selection = getSelection(); if (!selection.rangeCount || !selection.isCollapsed) return false;
  const rect = selection.getRangeAt(0).getClientRects()[0]; if (!rect) return true;
  const box = el.getBoundingClientRect(); const line = parseFloat(getComputedStyle(el).lineHeight) || 20;
  return direction < 0 ? rect.top - box.top < line * .75 : box.bottom - rect.bottom < line * .75;
}
