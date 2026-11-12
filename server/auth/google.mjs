import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config.mjs';
import { transaction } from '../db.mjs';
import { audit, createSession, destroySession } from './session.mjs';

const FLOW_COOKIE = 'folio_oauth';
const flowOptions = () => ({ path: '/auth', httpOnly: true, sameSite: 'lax', secure: config.secureCookies, signed: true });
const redirectUri = () => `${config.publicUrl}/auth/google/callback`;
let jwks;

class Denied extends Error { constructor(reason) { super(reason); this.reason = reason; } }

async function exchange(code, verifier) {
  const response = await fetch(config.google.tokenUrl, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: config.google.clientId, client_secret: config.google.clientSecret, redirect_uri: redirectUri() }),
  });
  if (!response.ok) throw new Denied('error');
  const { id_token: idToken } = await response.json();
  if (!idToken) throw new Denied('error');
  return idToken;
}

async function identityOf(idToken, nonce) {
  jwks ??= createRemoteJWKSet(new URL(config.google.jwksUrl));
  const { payload } = await jwtVerify(idToken, jwks, { issuer: config.google.issuer, audience: config.google.clientId, algorithms: ['RS256'] });
  if (payload.nonce !== nonce || !payload.sub || !payload.email) throw new Denied('error');
  if (payload.email_verified !== true && payload.email_verified !== 'true') throw new Denied('unverified');
  return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name ?? '').slice(0, 120), picture: String(payload.picture ?? '').slice(0, 500) };
}

// 초대받은 이메일만 가입한다. 사용자가 한 명도 없을 때는 ADMIN_EMAIL 만 들어와 관리자가 된다.
async function resolveUser(identity) {
  return transaction(async conn => {
    const now = Date.now();
    const [found] = await conn.query('SELECT * FROM users WHERE google_sub = ? OR email = ? ORDER BY (google_sub = ?) DESC LIMIT 1 FOR UPDATE', [identity.sub, identity.email, identity.sub]);
    if (found) {
      if (found.disabled) throw new Denied('disabled');
      if (found.google_sub && found.google_sub !== identity.sub) throw new Denied('not-invited');
      await conn.query('UPDATE users SET google_sub = ?, name = ?, picture = ?, last_login_at = ? WHERE id = ?', [identity.sub, identity.name, identity.picture, now, found.id]);
      return { user: found, created: false };
    }
    const [{ total }] = await conn.query('SELECT COUNT(*) AS total FROM users WHERE is_system = 0');
    let role;
    if (total === 0) {
      if (!config.adminEmail) throw new Denied('config');
      if (identity.email !== config.adminEmail) throw new Denied('first-admin');
      role = 'admin';
    } else {
      const [invite] = await conn.query('SELECT * FROM invites WHERE email = ? AND accepted_at IS NULL FOR UPDATE', [identity.email]);
      if (!invite) throw new Denied('not-invited');
      role = invite.role;
      await conn.query('UPDATE invites SET accepted_at = ? WHERE id = ?', [now, invite.id]);
    }
    const result = await conn.query('INSERT INTO users (google_sub, email, name, picture, role, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [identity.sub, identity.email, identity.name, identity.picture, role, now, now]);
    return { user: { id: result.insertId, email: identity.email, role }, created: true };
  });
}

export function googleRoutes(app) {
  app.get('/auth/google', async (req, reply) => {
    const flow = { state: randomBytes(24).toString('base64url'), nonce: randomBytes(24).toString('base64url'), verifier: randomBytes(48).toString('base64url') };
    reply.setCookie(FLOW_COOKIE, JSON.stringify(flow), { ...flowOptions(), maxAge: 600 });
    const params = new URLSearchParams({
      client_id: config.google.clientId, redirect_uri: redirectUri(), response_type: 'code', scope: 'openid email profile', state: flow.state, nonce: flow.nonce,
      code_challenge: createHash('sha256').update(flow.verifier).digest('base64url'), code_challenge_method: 'S256', prompt: 'select_account',
    });
    return reply.redirect(`${config.google.authUrl}?${params}`);
  });

  app.get('/auth/google/callback', async (req, reply) => {
    const raw = req.cookies?.[FLOW_COOKIE];
    reply.clearCookie(FLOW_COOKIE, flowOptions());
    let identity = null;
    try {
      const unsigned = raw ? req.unsignCookie(raw) : { valid: false };
      const flow = unsigned.valid ? JSON.parse(unsigned.value) : null;
      if (!flow || !req.query.code || req.query.state !== flow.state) throw new Denied('state');
      identity = await identityOf(await exchange(String(req.query.code), flow.verifier), flow.nonce);
      const { user, created } = await resolveUser(identity);
      await destroySession(req, reply);
      await createSession(req, reply, user.id, false);
      await audit(req, user, created ? 'user.join' : 'login.google', user.email, created ? `역할 ${user.role}` : '');
      return reply.redirect('/');
    } catch (error) {
      const reason = error instanceof Denied ? error.reason : 'error';
      if (!(error instanceof Denied)) req.log.error(error);
      await audit(req, null, 'login.denied', identity?.email ?? '', reason).catch(() => {});
      return reply.redirect(`/?denied=${reason}`);
    }
  });
}
