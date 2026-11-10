// Inline formatting. A block keeps plain `text` plus `marks`: [{ start, end, type, value? }].
// `value` is the address of a link or the name of a text/background colour.
import { HOLD } from './blocks.js';
export const markTypes = ['bold', 'italic', 'underline', 'strike', 'code', 'link', 'color', 'bg'];
export const colors = [['gray', '회색'], ['brown', '갈색'], ['orange', '주황'], ['yellow', '노랑'], ['green', '초록'], ['blue', '파랑'], ['purple', '보라'], ['pink', '분홍'], ['red', '빨강']];
const colorNames = colors.map(([name]) => name);
const valued = ['link', 'color', 'bg'];
// Only web and mail addresses become links; anything else (javascript:, data:) is refused.
export function safeHref(value) {
  const href = String(value ?? '').trim(); if (!href || href.length > 2000 || /\s/.test(href)) return null;
  const full = /^(https?:\/\/|mailto:)/i.test(href) ? href : `https://${href}`;
  try { return ['http:', 'https:', 'mailto:'].includes(new URL(full).protocol) ? full : null; } catch { return null; }
}
const validValue = (type, value) => type === 'link' ? typeof value === 'string' && safeHref(value) === value : valued.includes(type) ? colorNames.includes(value) : value === undefined;
export function validMarks(marks, length) {
  return Array.isArray(marks) && marks.length <= 5000 && marks.every(m => m && markTypes.includes(m.type) && Number.isInteger(m.start) && Number.isInteger(m.end) && m.start >= 0 && m.start < m.end && m.end <= length && validValue(m.type, m.value));
}
const key = m => `${m.type}:${m.value ?? ''}`;
const make = (start, end, type, value) => valued.includes(type) ? { start, end, type, value } : { start, end, type };
// Clamps marks to the text, drops empty ones, and merges touching marks of the same kind.
export function normalizeMarks(marks, length) {
  const groups = new Map();
  for (const m of marks || []) {
    const start = Math.max(0, m.start); const end = Math.min(length, m.end); if (end <= start) continue;
    if (!groups.has(key(m))) groups.set(key(m), []);
    groups.get(key(m)).push(make(start, end, m.type, m.value));
  }
  const out = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.start - b.start); let last = null;
    for (const m of list) { if (last && m.start <= last.end) last.end = Math.max(last.end, m.end); else out.push(last = m); }
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end || markTypes.indexOf(a.type) - markTypes.indexOf(b.type));
}
const without = (marks, start, end, type) => marks.flatMap(m => m.type !== type || m.end <= start || m.start >= end ? [m] : [make(m.start, start, m.type, m.value), make(end, m.end, m.type, m.value)].filter(part => part.end > part.start));
export const covers = (marks, start, end, type) => normalizeMarks(marks, Infinity).some(m => m.type === type && m.start <= start && m.end >= end);
// Plain marks flip on and off; links and colours are set to `value`, or cleared when it is null.
export function toggleMark(marks, start, end, type, value = null) {
  const rest = without(marks || [], start, end, type);
  const add = valued.includes(type) ? value !== null : !covers(marks || [], start, end, type);
  return normalizeMarks(add ? [...rest, make(start, end, type, value)] : rest, Infinity);
}
// Marks that would apply to a character typed at `offset` (they follow the character on its left).
export const marksAt = (marks, offset) => (marks || []).filter(m => m.start < offset && m.end >= offset);
export const marksIn = (marks, start, end) => (marks || []).filter(m => m.start <= start && m.end >= end);
export const sliceMarks = (marks, start, end) => (marks || []).filter(m => m.end > start && m.start < end).map(m => make(Math.max(m.start, start) - start, Math.min(m.end, end) - start, m.type, m.value));
export const shiftMarks = (marks, delta) => (marks || []).map(m => make(m.start + delta, m.end + delta, m.type, m.value));
// Moves marks after replacing `removed` characters at `at` with `inserted` new ones.
export function spliceMarks(marks, at, removed, inserted) {
  const after = at + removed; const delta = inserted - removed;
  return (marks || []).map(m => make(m.start < at ? m.start : m.start >= after ? m.start + delta : at + inserted, m.end < at ? m.end : m.end >= after ? m.end + delta : at, m.type, m.value)).filter(m => m.end > m.start);
}
function segments(text, marks) {
  const cuts = [...new Set([0, text.length, ...marks.flatMap(m => [m.start, m.end])])].filter(n => n >= 0 && n <= text.length).sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) out.push({ start: cuts[i], text: text.slice(cuts[i], cuts[i + 1]), marks: marks.filter(m => m.start <= cuts[i] && m.end >= cuts[i + 1]) });
  return out;
}
const tags = { bold: ['<strong>', '</strong>'], italic: ['<em>', '</em>'], underline: ['<u>', '</u>'], strike: ['<s>', '</s>'], code: ['<code class="inline-code">', '</code>'] };
function wrap(html, marks, esc) {
  for (const type of ['bg', 'color', 'strike', 'underline', 'italic', 'bold', 'code', 'link']) {
    const m = marks.find(m => m.type === type); if (!m) continue;
    if (type === 'link') html = `<a href="${esc(m.value)}" target="_blank" rel="noopener noreferrer">${html}</a>`;
    else if (type === 'color' || type === 'bg') html = `<span data-${type}="${esc(m.value)}">${html}</span>`;
    else html = tags[type][0] + html + tags[type][1];
  }
  return html;
}
// `hold` ({ offset, marks }) adds an empty, invisible run at the caret so the next typed
// characters take exactly those marks instead of the ones around the caret.
export function renderInline(text, marks, esc, hold = null) {
  const list = normalizeMarks(marks, text.length); const out = []; let held = !hold;
  const holder = () => { held = true; return wrap(HOLD, hold.marks, esc); };
  for (const s of segments(text, list)) {
    if (!held && hold.offset <= s.start) out.push(holder());
    if (!held && hold.offset < s.start + s.text.length) {
      const at = hold.offset - s.start;
      out.push(wrap(esc(s.text.slice(0, at)), s.marks, esc), holder(), wrap(esc(s.text.slice(at)), s.marks, esc));
    } else out.push(wrap(esc(s.text), s.marks, esc));
  }
  if (!held) out.push(holder());
  return out.join('');
}
const tagMarks = { STRONG: 'bold', B: 'bold', EM: 'italic', I: 'italic', U: 'underline', S: 'strike', STRIKE: 'strike', DEL: 'strike', CODE: 'code' };
// Formatting carried by the elements around `node`, as marks without a range.
export function nodeMarks(node, root) {
  const out = [];
  for (; node && node !== root; node = node.parentNode) {
    const href = node.nodeName === 'A' ? safeHref(node.getAttribute('href')) : null;
    if (tagMarks[node.nodeName]) out.push({ type: tagMarks[node.nodeName] });
    if (href) out.push({ type: 'link', value: href });
    if (colorNames.includes(node.dataset?.color)) out.push({ type: 'color', value: node.dataset.color });
    if (colorNames.includes(node.dataset?.bg)) out.push({ type: 'bg', value: node.dataset.bg });
  }
  return out;
}
// Reads the text and marks back out of an edited block.
export function readInline(el) {
  let text = ''; const marks = []; const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const data = walker.currentNode.data.replaceAll(HOLD, ''); if (!data) continue;
    const start = text.length; text += data;
    for (const m of nodeMarks(walker.currentNode.parentNode, el)) marks.push(make(start, text.length, m.type, m.value));
  }
  return { text, marks: normalizeMarks(marks, text.length) };
}
const inlineRules = [[/\*\*([^*\n]+)\*\*$/, 'bold', 2], [/(?<![*\w])\*([^*\n]+)\*$/, 'italic', 1], [/(?<!`)`([^`\n]+)`$/, 'code', 1], [/~~([^~\n]+)~~$/, 'strike', 2]];
// Turns a just-closed **bold**, *italic*, `code` or ~~strike~~ run before the caret into a mark.
export function inlineShortcut(text, marks, caret) {
  const before = text.slice(0, caret);
  for (const [pattern, type, size] of inlineRules) {
    const m = pattern.exec(before); if (!m || m[1] !== m[1].trim()) continue;
    const start = m.index; const end = start + m[1].length;
    const moved = spliceMarks(spliceMarks(marks, caret - size, size, 0), start, size, 0);
    const next = before.slice(0, start) + m[1] + text.slice(caret);
    return { text: next, marks: normalizeMarks([...moved, make(start, end, type)], next.length), caret: end, type };
  }
  return null;
}
export function toMarkdown(text, marks) {
  return segments(text, normalizeMarks(marks, text.length)).map(s => {
    const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.text); if (!body) return s.text;
    const has = type => s.marks.find(m => m.type === type); let out = body;
    if (has('code')) out = `\`${out}\``;
    if (has('strike')) out = `~~${out}~~`;
    if (has('underline')) out = `<u>${out}</u>`;
    if (has('italic')) out = `*${out}*`;
    if (has('bold')) out = `**${out}**`;
    if (has('link')) out = `[${out}](${has('link').value})`;
    return lead + out + trail;
  }).join('');
}
