// 테스트 모드 전용 가짜 Google 로그인. 실제와 같은 OIDC 절차(state, nonce, PKCE, 서명 검증)를 그대로 태운다.
import { createHash, randomBytes } from 'node:crypto';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { config } from '../config.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const FIELDS = ['client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge'];

export async function mockOidcRoutes(app) {
  if (!config.test) throw new Error('가짜 로그인은 테스트 모드에서만 등록합니다.');
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'folio-test', alg: 'RS256', use: 'sig' };
  const codes = new Map();
  const issuer = config.google.issuer[0];

  app.get('/auth/test/oidc/authorize', async (req, reply) => {
    const hidden = FIELDS.map(name => `<input type="hidden" name="${name}" value="${esc(req.query[name])}">`).join('');
    return reply.type('text/html; charset=utf-8').send(`<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>테스트용 Google 로그인</title><link rel="stylesheet" href="/auth.css"></head><body class="auth-body"><main class="auth-card"><h1>테스트용 Google 로그인</h1><p class="auth-lead">실제 Google 대신 쓰는 개발용 화면입니다.</p><form method="post" action="/auth/test/oidc/authorize" class="auth-form">${hidden}<label>이메일<input name="email" type="email" required autofocus></label><label>이름<input name="name" type="text"></label><button class="auth-primary" type="submit">계속</button></form></main></body></html>`);
  });

  app.post('/auth/test/oidc/authorize', async (req, reply) => {
    const body = req.body ?? {};
    if (body.client_id !== config.google.clientId || body.redirect_uri !== `${config.publicUrl}/auth/google/callback`) return reply.code(400).send({ error: '잘못된 요청입니다.' });
    const code = randomBytes(24).toString('base64url');
    const email = String(body.email ?? '').trim().toLowerCase();
    codes.set(code, { email, name: String(body.name ?? '').trim() || email.split('@')[0], nonce: body.nonce, challenge: body.code_challenge, at: Date.now() });
    return reply.redirect(`${body.redirect_uri}?${new URLSearchParams({ code, state: body.state ?? '' })}`);
  });

  app.post('/auth/test/oidc/token', async (req, reply) => {
    const body = req.body ?? {};
    const entry = codes.get(body.code);
    codes.delete(body.code);
    const challenge = createHash('sha256').update(String(body.code_verifier ?? '')).digest('base64url');
    if (!entry || Date.now() - entry.at > 60000 || body.client_secret !== config.google.clientSecret || challenge !== entry.challenge) return reply.code(400).send({ error: 'invalid_grant' });
    const idToken = await new SignJWT({ email: entry.email, email_verified: !entry.email.startsWith('unverified'), name: entry.name, nonce: entry.nonce })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer).setAudience(config.google.clientId)
      .setSubject(`mock-${createHash('sha256').update(entry.email).digest('hex').slice(0, 20)}`).setIssuedAt().setExpirationTime('5m').sign(privateKey);
    return { id_token: idToken, token_type: 'Bearer', expires_in: 300 };
  });

  app.get('/auth/test/oidc/jwks', async () => ({ keys: [jwk] }));
}
