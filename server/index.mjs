import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { config, configProblems } from './config.mjs';
import { migrate, pool, resetDatabase } from './db.mjs';
import { loadSession, purgeExpired } from './auth/session.mjs';
import { googleRoutes } from './auth/google.mjs';
import { accountRoutes, sessionInfo } from './routes/account.mjs';
import { adminRoutes } from './routes/admin.mjs';
import { workspaceRoutes } from './routes/workspace.mjs';
import { bootWorkspace } from './workspace.mjs';

const problems = configProblems();
if (problems.length) {
  console.error(`Folio 설정 오류 (.env 를 확인하세요)\n- ${problems.join('\n- ')}`);
  process.exit(1);
}

const root = resolve('dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https: http:; media-src 'self' data: blob: https:; frame-src https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

const app = Fastify({ trustProxy: true, bodyLimit: 1048576, logger: { level: 'error' } });
await app.register(cookie, { secret: config.sessionSecret });
app.decorateRequest('auth', null);

// 로그인 관련 요청은 IP 마다 분당 횟수를 제한한다.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.reset <= now) { hits.set(ip, { count: 1, reset: now + 60000 }); return false; }
  return ++entry.count > 60;
}
setInterval(() => { const now = Date.now(); for (const [ip, entry] of hits) if (entry.reset <= now) hits.delete(ip); }, 60000).unref();

const sameOrigin = req => {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host || origin === new URL(config.publicUrl).origin; } catch { return false; }
};

app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0];
  const isAuth = path.startsWith('/auth/');
  if (!isAuth && !path.startsWith('/api/')) return;
  if (isAuth && !config.test && limited(req.ip)) return reply.code(429).send({ error: '요청이 너무 많습니다. 잠시 뒤에 다시 시도해 주세요.' });
  req.auth = await loadSession(req);
  if (req.method === 'GET' || req.method === 'HEAD' || path.startsWith('/auth/test/')) return;
  const token = req.headers['x-csrf-token'];
  if (!sameOrigin(req) || !req.auth || !token || token !== req.auth.session.csrf) return reply.code(403).send({ error: '요청을 확인할 수 없습니다. 페이지를 새로 고친 뒤 다시 시도해 주세요.' });
});

app.addHook('onSend', async (req, reply) => {
  reply.header('Content-Security-Policy', CSP);
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'same-origin');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.secureCookies) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});

googleRoutes(app);
accountRoutes(app);
adminRoutes(app);
workspaceRoutes(app);
if (config.test) {
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => done(null, Object.fromEntries(new URLSearchParams(body))));
  await (await import('./auth/mock-oidc.mjs')).mockOidcRoutes(app);
  (await import('./routes/test.mjs')).testRoutes(app);
}

// 정적 파일. 확장자가 없는 경로(/admin 등)는 앱 화면으로 보내고, 로그인 상태에 맞는 스크립트를 골라 넣는다.
app.setNotFoundHandler(async (req, reply) => {
  let pathname = '';
  try { pathname = decodeURIComponent(req.url.split('?')[0]); } catch { return reply.code(400).send({ error: '잘못된 주소입니다.' }); }
  if (req.method !== 'GET' || pathname.startsWith('/api/') || pathname.startsWith('/auth/')) return reply.code(404).send({ error: '찾을 수 없습니다.' });
  const file = resolve(root, `.${extname(pathname) ? pathname : '/index.html'}`);
  if (!file.startsWith(root + sep)) return reply.code(403).send({ error: '접근할 수 없습니다.' });
  try {
    const content = await readFile(file);
    if (file === resolve(root, 'index.html')) {
      const info = await sessionInfo(req, reply);
      const script = info.state !== 'ready' ? 'auth-view' : pathname === '/admin' ? 'admin' : 'app';
      const embed = (id, data) => `<script type="application/json" id="${id}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n  `;
      // 앱 화면에는 열 워크스페이스의 내용을 함께 넣어, 화면이 서버 응답을 기다리지 않고 바로 뜨게 한다.
      const workspace = script === 'app' ? embed('folio-workspace', await bootWorkspace(info.user, pathname.match(/^\/p\/([^/]+)$/)?.[1])) : '';
      const boot = `${embed('folio-session', info)}${workspace}<script type="module" src="/${script}.js"></script>`;
      return reply.header('Cache-Control', 'no-store').type(mime['.html']).send(content.toString('utf8').replace('<!--folio:boot-->', boot));
    }
    return reply.header('Cache-Control', 'no-cache').type(mime[extname(file)] || 'application/octet-stream').send(content);
  } catch { return reply.code(404).type('text/plain; charset=utf-8').send('Not found'); }
});

app.setErrorHandler((error, req, reply) => {
  if (!error.statusCode || error.statusCode >= 500) { req.log.error(error); return reply.code(500).send({ error: '서버에서 문제가 생겼습니다.' }); }
  return reply.code(error.statusCode).send({ error: error.shown || (error.statusCode === 413 ? '보내는 내용이 너무 큽니다.' : '요청을 처리할 수 없습니다.') });
});

try {
  if (config.test) await resetDatabase();
  await migrate();
  await purgeExpired();
} catch (error) {
  console.error(`Folio: 데이터베이스(${config.db.host}:${config.db.port}/${config.db.database})를 준비하지 못했습니다 — ${error.message}`);
  process.exit(1);
}
setInterval(() => purgeExpired().catch(() => {}), 3600000).unref();

await app.listen({ port: config.port, host: config.host });
const shown = config.host === '0.0.0.0' || config.host === '::' ? `http://127.0.0.1:${config.port}` : `http://${config.host}:${config.port}`;
console.log(`Folio: ${config.production ? config.publicUrl : shown}${config.test ? ' (테스트 모드)' : ''}`);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); await pool.end(); process.exit(0); });
