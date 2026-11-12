import { randomBytes } from 'node:crypto';
import { config } from '../config.mjs';
import { one, query } from '../db.mjs';
import { sha256 } from './totp.mjs';

export const COOKIE = 'folio_sid';
const DAY = 86400000;
const cookieOptions = () => ({ path: '/', httpOnly: true, sameSite: 'lax', secure: config.secureCookies });

export async function audit(req, actor, action, target = '', detail = '') {
  await query('INSERT INTO audit_log (at, actor_id, actor_email, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [Date.now(), actor?.id ?? null, actor?.email ?? '', action, String(target).slice(0, 254), String(detail).slice(0, 1000), req?.ip ?? '']);
}

export async function createSession(req, reply, userId, otpVerified) {
  const token = randomBytes(32).toString('base64url');
  const csrf = randomBytes(32).toString('base64url');
  const now = Date.now();
  await query('INSERT INTO sessions (id, user_id, otp_verified, csrf, created_at, expires_at, last_seen_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [sha256(token), userId, otpVerified ? 1 : 0, csrf, now, now + config.sessionDays * DAY, now, req.ip ?? '', String(req.headers['user-agent'] ?? '').slice(0, 300)]);
  reply.setCookie(COOKIE, token, { ...cookieOptions(), maxAge: config.sessionDays * 86400 });
  return { csrf };
}

export async function destroySession(req, reply) {
  const token = req.cookies?.[COOKIE];
  if (token) await query('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
  reply.clearCookie(COOKIE, cookieOptions());
}

// 로그인 단계가 바뀔 때(OTP 통과 등) 토큰을 새로 발급해 세션 고정을 막는다.
export async function rotateSession(req, reply, userId, otpVerified) {
  await destroySession(req, reply);
  return createSession(req, reply, userId, otpVerified);
}

export async function loadSession(req) {
  const token = req.cookies?.[COOKIE];
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const session = await one('SELECT * FROM sessions WHERE id = ?', [id]);
  if (!session) return null;
  const now = Date.now();
  if (session.expires_at <= now) { await query('DELETE FROM sessions WHERE id = ?', [id]); return null; }
  const user = await one('SELECT * FROM users WHERE id = ?', [session.user_id]);
  if (!user || user.disabled) { await query('DELETE FROM sessions WHERE id = ?', [id]); return null; }
  if (now - session.last_seen_at > 300000) await query('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [now, id]);
  return { session, user };
}

export function stateOf(auth) {
  if (!auth) return 'anonymous';
  if (!auth.user.otp_confirmed_at) return 'otp-setup';
  if (!auth.session.otp_verified) return 'otp-verify';
  return 'ready';
}

export const publicUser = user => ({ id: user.id, email: user.email, name: user.name, picture: user.picture, role: user.role });

export async function purgeExpired() {
  await query('DELETE FROM sessions WHERE expires_at <= ?', [Date.now()]);
}
