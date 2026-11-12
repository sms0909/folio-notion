import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, stat, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { config } from '../config.mjs';
import { one, query } from '../db.mjs';
import { stateOf } from '../auth/session.mjs';
import { createWorkspace, invalid, listVersions, listWorkspaces, memberOf, openWorkspace, pushOps, readPage, readVersion, readWorkspace, saveVersion } from '../workspace.mjs';

const BIG = 32 * 1048576;
export const FILE_LIMIT = 50 * 1048576;
// 실행 파일과 브라우저가 화면으로 열 수 있는 문서는 받지 않는다. 받은 파일은 언제나 내려받기로만 돌려준다.
const BLOCKED = new Set(['.exe', '.dll', '.bat', '.cmd', '.com', '.msi', '.scr', '.ps1', '.vbs', '.js', '.mjs', '.jar', '.sh', '.app', '.apk', '.html', '.htm', '.xhtml', '.svg', '.php', '.lnk', '.hta', '.cpl', '.reg']);
const fileDir = ws => resolve(config.dataDir, 'files', ws);

export function workspaceRoutes(app) {
  const ready = async (req, reply) => {
    if (stateOf(req.auth) !== 'ready') return reply.code(401).send({ error: '로그인이 필요합니다.' });
  };
  const member = async (req, reply) => {
    if (stateOf(req.auth) !== 'ready') return reply.code(401).send({ error: '로그인이 필요합니다.' });
    req.ws = await memberOf(String(req.params.id), req.auth.user.id);
    if (!req.ws) return reply.code(404).send({ error: '워크스페이스를 찾을 수 없습니다.' });
  };
  app.decorateRequest('ws', null);
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer' }, (req, body, done) => done(null, body));

  app.get('/api/workspaces', { preHandler: ready }, async req => ({ workspaces: await listWorkspaces(req.auth.user.id) }));

  app.post('/api/workspaces', { preHandler: ready, bodyLimit: BIG }, async req => {
    const id = await createWorkspace(req.auth.user.id, { name: req.body?.name, state: req.body?.state });
    return { id };
  });

  app.post('/api/workspaces/:id/open', { preHandler: member }, async req => {
    await openWorkspace(req.ws.id, req.auth.user.id);
    return { ok: true };
  });

  app.get('/api/workspaces/:id', { preHandler: member }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    // `have` 는 브라우저가 가진 판 번호. 그대로라면 내용을 다시 보내지 않는다.
    if (req.query?.have !== undefined && Number(req.query.have) === req.ws.rev) return { id: req.ws.id, rev: req.ws.rev, unchanged: true };
    return readWorkspace(req.ws.id, req.auth.user.id);
  });

  app.post('/api/workspaces/:id/ops', { preHandler: member, bodyLimit: BIG }, async req => pushOps(req.ws.id, req.auth.user.id, req.body?.push, req.body?.ops));

  app.get('/api/workspaces/:id/pages/:pageId', { preHandler: member }, async (req, reply) => {
    const page = await readPage(req.ws.id, String(req.params.pageId));
    if (!page) return reply.code(404).send({ error: '페이지를 찾을 수 없습니다.' });
    return page;
  });

  app.get('/api/workspaces/:id/pages/:pageId/versions', { preHandler: member }, async req => ({ versions: await listVersions(req.ws.id, String(req.params.pageId)) }));

  app.get('/api/workspaces/:id/pages/:pageId/versions/:versionId', { preHandler: member }, async (req, reply) => {
    const version = await readVersion(req.ws.id, String(req.params.pageId), String(req.params.versionId));
    if (!version) return reply.code(404).send({ error: '버전을 찾을 수 없습니다.' });
    return version;
  });

  app.post('/api/workspaces/:id/pages/:pageId/versions', { preHandler: member, bodyLimit: 8 * 1048576 }, async req => saveVersion(req.ws.id, req.auth.user.id, String(req.params.pageId), req.body ?? {}));

  // 파일. 본문을 그대로(application/octet-stream) 올린다.
  app.post('/api/workspaces/:id/files', { preHandler: member, bodyLimit: FILE_LIMIT }, async req => {
    const name = String(req.query?.name ?? '').replace(/[\\/\u0000-\u001f"]/g, '').trim().slice(0, 255);
    if (!name || !Buffer.isBuffer(req.body) || !req.body.length) throw invalid('올릴 파일이 없습니다.');
    if (BLOCKED.has(extname(name).toLowerCase())) throw invalid('이 종류의 파일은 올릴 수 없습니다.');
    const id = randomUUID(); const dir = fileDir(req.ws.id);
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, id), req.body);
    const mime = String(req.query?.type ?? '').slice(0, 100).replace(/[^\w.+/-]/g, '') || 'application/octet-stream';
    await query('INSERT INTO files (id, workspace_id, name, size, mime, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, req.ws.id, name, req.body.length, mime, req.auth.user.id, Date.now()]);
    return { id, name, size: req.body.length, url: `/api/files/${id}` };
  });

  app.get('/api/workspaces/:id/files', { preHandler: member }, async req => ({ files: await query('SELECT f.id, f.name, f.size, f.created_at AS createdAt, u.name AS uploader FROM files f LEFT JOIN users u ON u.id = f.uploader_id WHERE f.workspace_id = ? ORDER BY f.created_at DESC', [req.ws.id]) }));

  const fileOf = async (req, reply) => {
    if (stateOf(req.auth) !== 'ready') { reply.code(401).send({ error: '로그인이 필요합니다.' }); return null; }
    const file = /^[0-9a-f-]{36}$/.test(req.params.fileId) ? await one('SELECT f.* FROM files f JOIN workspace_members m ON m.workspace_id = f.workspace_id AND m.user_id = ? WHERE f.id = ?', [req.auth.user.id, req.params.fileId]) : null;
    if (!file) { reply.code(404).send({ error: '파일을 찾을 수 없습니다.' }); return null; }
    return file;
  };

  app.get('/api/files/:fileId', async (req, reply) => {
    const file = await fileOf(req, reply);
    if (!file) return reply;
    const path = resolve(fileDir(file.workspace_id), file.id);
    try { await stat(path); } catch { return reply.code(404).send({ error: '파일을 찾을 수 없습니다.' }); }
    return reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`).header('Cache-Control', 'private, no-store').type('application/octet-stream').send(createReadStream(path));
  });

  // 지운 파일은 바로 없애지 않고 trash 폴더로 옮겨 둔다.
  app.delete('/api/files/:fileId', async (req, reply) => {
    const file = await fileOf(req, reply);
    if (!file) return reply;
    const trash = resolve(config.dataDir, 'files', 'trash');
    await mkdir(trash, { recursive: true });
    await rename(resolve(fileDir(file.workspace_id), file.id), resolve(trash, `${file.id}-${file.name}`.slice(0, 200))).catch(() => {});
    await query('DELETE FROM files WHERE id = ?', [file.id]);
    return { ok: true };
  });
}
