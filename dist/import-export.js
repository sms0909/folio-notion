// Bringing files in (Markdown → page, CSV → database) and taking pages out (HTML, CSV).
import { block, uid } from './store.js';
import { MAX_TEXT, indentOf, numbering } from './blocks.js';
import { normalizeMarks, renderInline, safeHref } from './richtext.js';
import { makeDatabase, cleanValue, valueOf, isDate, limits } from './database-model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const MAX_IMPORT_SIZE = 2_000_000;

const inlineRules = [[/^\*\*([^*\n]+?)\*\*/, 'bold'], [/^~~([^~\n]+?)~~/, 'strike'], [/^`([^`\n]+)`/, 'code'], [/^\*([^*\s][^*\n]*?)\*/, 'italic'], [/^_([^_\s][^_\n]*?)_(?!\w)/, 'italic'], [/^<u>([^<\n]+)<\/u>/, 'underline']];
// Reads inline Markdown (**bold**, *italic*, ~~strike~~, `code`, <u>, [text](url)) into text and marks.
function inline(source) {
  let text = ''; const marks = [];
  const walk = s => {
    let i = 0;
    while (i < s.length) {
      const next = s.slice(i).search(/[[*~`_<\\]/);
      if (next < 0) { text += s.slice(i); return; }
      text += s.slice(i, i + next); i += next;
      const rest = s.slice(i, i + 4000); const start = text.length;
      const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest); const href = link && safeHref(link[2]);
      if (href) { walk(link[1]); if (text.length > start) marks.push({ start, end: text.length, type: 'link', value: href }); i += link[0].length; continue; }
      const rule = inlineRules.find(([pattern]) => pattern.test(rest));
      if (rule) {
        const m = rule[0].exec(rest);
        if (rule[1] === 'code') text += m[1]; else walk(m[1]);
        if (text.length > start) marks.push({ start, end: text.length, type: rule[1] });
        i += m[0].length; continue;
      }
      if (rest[0] === '\\' && /[\\`*_{}[\]()#+\-.!~>]/.test(rest[1] || '')) { text += rest[1]; i += 2; continue; }
      text += rest[0]; i++;
    }
  };
  walk(source);
  return { text, marks };
}
// Turns a Markdown file into a page title and blocks. Unknown syntax stays as plain text.
export function markdownToPage(source, fallbackTitle = '가져온 페이지') {
  const lines = String(source).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  const items = []; let title = null; let open = null; const widths = [];
  // Nesting follows how far a line is indented relative to the lines above it, whatever the indent width.
  const depthOf = lead => { while (widths.length && widths.at(-1) >= lead) widths.pop(); widths.push(lead); return Math.min(6, widths.length - 1); };
  const add = (type, raw, depth = 0, extra = {}) => { open = { type, raw, depth, ...extra }; items.push(open); };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; const lead = /^[ \t]*/.exec(line)[0].replace(/\t/g, '    ').length; const t = line.trim();
    const fence = /^(```|~~~)/.exec(t);
    if (fence) {
      const body = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) { body.push(lines[i].slice(Math.min(lead, /^[ \t]*/.exec(lines[i])[0].length))); i++; }
      add('code', body.join('\n'), depthOf(lead)); open = null; continue;
    }
    if (!t) { open = null; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*?)\s*#*$/.exec(t))) {
      widths.length = 0;
      if (m[1].length === 1 && title === null && !items.length) title = inline(m[2]).text; else add(`h${Math.min(3, m[1].length)}`, m[2]);
      open = null;
    } else if (/^([-*_])(\s*\1){2,}$/.test(t)) { widths.length = 0; add('divider', ''); open = null; }
    else if ((m = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(t))) { add('todo', m[2], depthOf(lead), { checked: m[1] !== ' ' }); open = null; }
    else if ((m = /^[-*+]\s+(.*)$/.exec(t))) { add('bullet', m[1], depthOf(lead)); open = null; }
    else if ((m = /^\d{1,9}[.)]\s+(.*)$/.exec(t))) { add('numbered', m[1], depthOf(lead)); open = null; }
    else if ((m = /^>\s?(.*)$/.exec(t))) { if (open?.type === 'quote') open.raw += `\n${m[1]}`; else add('quote', m[1], depthOf(lead)); }
    else if (open?.type === 'text') open.raw += ` ${t}`;
    else add('text', t, depthOf(lead));
  }
  const truncated = items.length > 10000;
  const blocks = items.slice(0, 10000).map(item => {
    const parsed = item.type === 'code' || item.type === 'divider' ? { text: item.raw, marks: [] } : inline(item.raw);
    const b = block(item.type, parsed.text.slice(0, MAX_TEXT), !!item.checked);
    const marks = normalizeMarks(parsed.marks, b.text.length); if (marks.length) b.marks = marks;
    if (item.depth) b.indent = item.depth;
    return b;
  });
  // A block can sit at most one level below the block above it.
  blocks.forEach((b, i) => { const max = i ? indentOf(blocks[i - 1]) + 1 : 0; if (indentOf(b) > max) b.indent = max; if (!b.indent) delete b.indent; });
  return { title: (title ?? fallbackTitle).trim().slice(0, 500) || '가져온 페이지', blocks: blocks.length ? blocks : [block()], truncated };
}

// Reads CSV text into rows of cells: quoted cells, doubled quotes and line breaks inside quotes are understood.
export function parseCSV(source) {
  const s = String(source).replace(/^﻿/, '');
  const head = s.slice(0, s.search(/\r|\n|$/)); const count = c => head.split(c).length;
  const delimiter = [',', ';', '\t'].reduce((best, c) => count(c) > count(best) ? c : best);
  const rows = []; let row = []; let cell = ''; let quoted = false; let wasQuoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) { if (c !== '"') cell += c; else if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
    else if (c === '"' && cell === '' && !wasQuoted) { quoted = true; wasQuoted = true; }
    else if (c === delimiter) { row.push(cell); cell = ''; wasQuoted = false; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; wasQuoted = false; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}
// Picks the property type that fits every filled cell of a column.
function guessProperty(name, cells) {
  const filled = cells.filter(Boolean); const distinct = [...new Set(filled)];
  const prop = { id: uid(), name, type: 'text' };
  if (!filled.length) return prop;
  if (filled.every(v => /^-?\d+(\.\d+)?$/.test(v))) prop.type = 'number';
  else if (filled.every(isDate)) prop.type = 'date';
  else if (filled.every(v => /^(true|false)$/i.test(v))) prop.type = 'checkbox';
  else if (distinct.length < filled.length && distinct.length <= 20 && distinct.every(v => v.length <= 100 && !v.includes(','))) { prop.type = 'select'; prop.options = distinct; }
  else {
    // "a, b" cells whose parts keep repeating are tags.
    const parts = filled.flatMap(v => v.split(',').map(p => p.trim()).filter(Boolean)); const names = [...new Set(parts)];
    if (filled.some(v => v.includes(',')) && names.length < parts.length && names.length <= 20 && names.every(v => v.length <= 30)) { prop.type = 'multi'; prop.options = names; }
  }
  return prop;
}
// Builds a database from CSV rows: the first row names the columns and the first column is the row title.
export function csvToDatabase(rows) {
  if (rows.length < 1 || !rows[0].length) throw new Error('CSV 파일에서 표를 찾지 못했습니다.');
  const header = rows[0].map(v => v.trim().slice(0, 100)); const body = rows.slice(1, limits.rows + 1);
  const db = makeDatabase(); db.activeViewId = db.views[0].id; db.properties = []; const names = new Set();
  const columns = [];
  for (let c = 1; c < header.length && db.properties.length < limits.properties; c++) {
    let name = header[c] || `속성 ${c}`; for (let n = 2; names.has(name); n++) name = `${(header[c] || `속성 ${c}`).slice(0, 95)} ${n}`;
    names.add(name);
    const prop = guessProperty(name, body.map(r => (r[c] ?? '').trim())); db.properties.push(prop); columns.push([c, prop]);
  }
  db.rows = body.map(r => {
    const values = {};
    for (const [c, prop] of columns) {
      const raw = (r[c] ?? '').trim();
      values[prop.id] = cleanValue(prop, prop.type === 'multi' ? raw.split(',').map(p => p.trim()) : prop.type === 'checkbox' ? raw.toLowerCase() : raw);
    }
    return { id: uid(), title: (r[0] ?? '').trim().slice(0, 500), values, blocks: [] };
  });
  return { db, truncated: rows.length - 1 > limits.rows || header.length - 1 > limits.properties };
}
// Spreadsheets run cells that start with = + - @ as formulas, so such text is written with a leading quote.
const csvCell = (value, text = true) => {
  let s = String(value ?? ''); if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || s !== s.trim() ? `"${s.replaceAll('"', '""')}"` : s;
};
// Every row and property of the database, whatever the current view shows.
export function databaseCSV(db) {
  const lines = [['이름', ...db.properties.map(p => p.name)].map(v => csvCell(v))];
  for (const row of db.rows) lines.push([csvCell(row.title), ...db.properties.map(p => {
    const v = valueOf(row, p);
    return p.type === 'number' ? csvCell(v ?? '', false) : p.type === 'checkbox' ? String(v) : csvCell(Array.isArray(v) ? v.join(', ') : v);
  })]);
  return `﻿${lines.map(line => line.join(',')).join('\r\n')}\r\n`;
}

const palette = { gray: ['#85877f', '#ecece8'], brown: ['#8a6248', '#efe3d9'], orange: ['#c26a1b', '#fae4cf'], yellow: ['#a8850f', '#faf0c4'], green: ['#3f8452', '#dcedde'], blue: ['#2f6fb8', '#dbe8f8'], purple: ['#7a52ad', '#e8ddf4'], pink: ['#b8457f', '#f7dce9'], red: ['#c4443c', '#f8dcd9'] };
const exportStyle = `body{font-family:Inter,-apple-system,"Segoe UI","Malgun Gothic",sans-serif;color:#343530;line-height:1.8;max-width:760px;margin:48px auto;padding:0 24px;font-size:15px}h1.title{font-size:34px;letter-spacing:-1px;margin:0 0 28px}h1,h2,h3{line-height:1.4;margin:1.2em 0 .3em}p{margin:.35em 0;white-space:pre-wrap}ul,ol{margin:.2em 0;padding-left:1.6em}li{white-space:pre-wrap}ul.todo{list-style:none;padding-left:.2em}ul.todo .done{text-decoration:line-through;color:#92938c}blockquote{margin:.6em 0;padding:.1em 1em;border-left:3px solid #d9d9d2;color:#5c5e55;white-space:pre-wrap}.callout{background:#f6f6ee;border:1px solid #e7e7dc;border-radius:8px;padding:.7em 1em;margin:.6em 0;white-space:pre-wrap}pre{background:#f7f7f5;border:1px solid #e9e9e5;border-radius:8px;padding:14px;overflow:auto;font-size:13px;line-height:1.6}code{font-family:ui-monospace,Consolas,monospace;background:#f1f1ee;border-radius:4px;padding:1px 4px;font-size:.9em}pre code{background:none;padding:0}hr{border:0;border-top:1px solid #e9e9e5;margin:1.4em 0}a{color:#3975cb}nav.toc{border-left:2px solid #e9e9e5;padding-left:14px;margin:.8em 0}nav.toc a{display:block;text-decoration:none}.page-link{font-weight:600}table{border-collapse:collapse;width:100%;font-size:13px;margin-top:1em}th,td{border:1px solid #e9e9e5;padding:7px 10px;text-align:left;vertical-align:top}th{background:#f7f7f5}${Object.entries(palette).map(([name, [color, bg]]) => `[data-color="${name}"]{color:${color}}[data-bg="${name}"]{background:${bg}}`).join('')}`;
const listTags = { bullet: 'ul', toggle: 'ul', numbered: 'ol', todo: 'ul class="todo"' };
function blocksHTML(blocks, titleOf) {
  const numbers = numbering(blocks); const out = []; let list = null;
  const headings = blocks.map((b, i) => [b, i]).filter(([b]) => /^h[123]$/.test(b.type) && b.text.trim());
  blocks.forEach((b, i) => {
    const pad = indentOf(b) ? ` style="margin-left:${indentOf(b) * 24}px"` : ''; const text = b.type === 'code' ? esc(b.text) : renderInline(b.text, b.marks, esc);
    const tag = listTags[b.type];
    if (list && list !== tag) { out.push(`</${list.split(' ')[0]}>`); list = null; }
    if (tag) {
      if (!list) { out.push(`<${tag}>`); list = tag; }
      out.push(b.type === 'todo' ? `<li${pad} class="${b.checked ? 'done' : ''}">${b.checked ? '☑' : '☐'} ${text}</li>` : `<li${pad}${b.type === 'numbered' ? ` value="${numbers[i]}"` : ''}>${text}</li>`);
      return;
    }
    switch (b.type) {
      case 'h1': case 'h2': case 'h3': out.push(`<${b.type} id="b-${i}"${pad}>${text}</${b.type}>`); break;
      case 'quote': out.push(`<blockquote${pad}>${text}</blockquote>`); break;
      case 'callout': out.push(`<div class="callout"${pad}>${text}</div>`); break;
      case 'code': out.push(`<pre${pad}><code>${text}</code></pre>`); break;
      case 'divider': out.push('<hr>'); break;
      case 'toc': out.push(`<nav class="toc">${headings.map(([h, at]) => `<a href="#b-${at}" style="margin-left:${(Number(h.type[1]) - 1) * 16}px">${esc(h.text)}</a>`).join('')}</nav>`); break;
      case 'image': out.push(`<p${pad}><img src="/api/files/${esc(b.file)}" alt="${esc(b.text)}" style="max-width:100%"></p>`); break;
      case 'page': out.push(`<p class="page-link"${pad}>→ ${esc(titleOf(b.target) ?? '삭제된 페이지')}</p>`); break;
      default: out.push(`<p${pad}>${text || '&nbsp;'}</p>`);
    }
  });
  if (list) out.push(`</${list.split(' ')[0]}>`);
  return out.join('\n');
}
function tableHTML(db) {
  const cell = (row, p) => { const v = valueOf(row, p); return p.type === 'checkbox' ? (v ? '☑' : '☐') : Array.isArray(v) ? v.join(', ') : v ?? ''; };
  return `<table><thead><tr><th>이름</th>${db.properties.map(p => `<th>${esc(p.name)}</th>`).join('')}</tr></thead><tbody>${db.rows.map(row => `<tr><td>${esc(row.title)}</td>${db.properties.map(p => `<td>${esc(cell(row, p))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
// A page as one self-contained HTML file. A database page becomes a table of all its rows.
export function pageHTML(page, { titleOf = () => null, db = null } = {}) {
  const title = page.title.trim() || '제목 없음';
  return `<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n<style>${exportStyle}</style>\n</head>\n<body>\n<h1 class="title">${esc(title)}</h1>\n${blocksHTML(page.blocks, titleOf)}${db ? `\n${tableHTML(db)}` : ''}\n</body>\n</html>\n`;
}
