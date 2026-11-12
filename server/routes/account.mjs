import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../config.mjs';
import { one, query, transaction } from '../db.mjs';
import { audit, createSession, destroySession, loadSession, publicUser, rotateSession, stateOf } from '../auth/session.mjs';
import { matchStep, newRecoveryCodes, newSecret, openSecret, otpauthUri, recoveryHash, sealSecret } from '../auth/totp.mjs';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60000;
export const NOAUTO = 'folio_noauto';

// 테스트 모드: 로그인하지 않은 브라우저마다 OTP 까지 끝낸 새 사용자를 만들어 준다.
async function autoLogin(req, reply) {
  const now = Date.now();
  const email = `auto-${randomBytes(6).toString('hex')}@folio.test`;
  const result = await query('INSERT INTO users (email, name, role, is_system, otp_confirmed_at, created_at, last_login_at) VALUES (?, ?, ?, 1, ?, ?, ?)', [email, '테스트 사용자', 'member', now, now, now]);
  const { csrf } = await createSession(req, reply, result.insertId, true);
  return { user: { id: result.insertId, email, name: '테스트 사용자', picture: '', role: 'member', otp_confirmed_at: now, otp_locked_until: 0 }, session: { csrf, otp_verified: 1 } };
}

// 화면과 /api/me 가 함께 쓰는 로그인 상태.
export async function sessionInfo(req, reply) {
  let auth = req.auth ?? await loadSession(req);
  if (!auth && config.test && !req.cookies?.[NOAUTO]) auth = await autoLogin(req, reply);
  return { state: stateOf(auth), user: auth ? publicUser(auth.user) : null, csrf: auth?.session.csrf ?? null, lockedUntil: auth?.user.otp_locked_until > Date.now() ? auth.user.otp_locked_until : 0 };
}

export function accountRoutes(app) {
  app.get('/api/me', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return sessionInfo(req, reply);
  });

  app.post('/auth/logout', async (req, reply) => {
    await audit(req, req.auth.user, 'logout', req.auth.user.email);
    await destroySession(req, reply);
    if (config.test) reply.setCookie(NOAUTO, '1', { path: '/' });
    return { ok: true };
  });

  app.post('/auth/otp/setup', async (req, reply) => {
    if (stateOf(req.auth) !== 'otp-setup') return reply.code(409).send({ error: 'OTP를 등록할 수 있는 상태가 아닙니다.' });
    const { user } = req.auth;
    const secret = newSecret();
    await query('UPDATE users SET otp_secret = ? WHERE id = ?', [sealSecret(secret), user.id]);
    const uri = otpauthUri(secret, user.email);
    return { secret, uri, qr: await QRCode.toString(uri, { type: 'svg', margin: 1 }) };
  });

  app.post('/auth/otp/enable', async (req, reply) => {
    if (stateOf(req.auth) !== 'otp-setup' || !req.auth.user.otp_secret) return reply.code(409).send({ error: 'OTP 등록을 처음부터 다시 진행해 주세요.' });
    const { user } = req.auth;
    const step = matchStep(openSecret(user.otp_secret), req.body?.code ?? '');
    if (!step) return reply.code(400).send({ error: '인증 코드가 맞지 않습니다. 인증 앱의 현재 코드를 입력해 주세요.' });
    const codes = newRecoveryCodes();
    await transaction(async conn => {
      await conn.query('UPDATE users SET otp_confirmed_at = ?, otp_last_step = ?, otp_fail_count = 0, otp_locked_until = 0 WHERE id = ?', [Date.now(), step, user.id]);
      await conn.query('DELETE FROM recovery_codes WHERE user_id = ?', [user.id]);
      await conn.batch('INSERT INTO recovery_codes (user_id, code_hash) VALUES (?, ?)', codes.map(code => [user.id, recoveryHash(code)]));
    });
    const { csrf } = await rotateSession(req, reply, user.id, true);
    await audit(req, user, 'otp.enable', user.email);
    return { recoveryCodes: codes, csrf };
  });

  app.post('/auth/otp/verify', async (req, reply) => {
    if (stateOf(req.auth) !== 'otp-verify') return reply.code(409).send({ error: 'OTP를 확인할 수 있는 상태가 아닙니다.' });
    const user = await one('SELECT * FROM users WHERE id = ?', [req.auth.user.id]);
    const now = Date.now();
    if (user.otp_locked_until > now) return reply.code(429).send({ error: '여러 번 틀려 잠시 잠겼습니다. 15분 뒤에 다시 시도해 주세요.', lockedUntil: user.otp_locked_until });
    const recovery = String(req.body?.recovery ?? '').trim();
    let ok = false, detail = '';
    if (recovery) {
      const result = await query('UPDATE recovery_codes SET used_at = ? WHERE user_id = ? AND code_hash = ? AND used_at IS NULL', [now, user.id, recoveryHash(recovery)]);
      ok = result.affectedRows === 1; detail = '복구 코드';
    } else {
      const step = matchStep(openSecret(user.otp_secret), req.body?.code ?? '', user.otp_last_step);
      // 같은 코드가 동시에 두 번 들어와도 한 번만 통과한다.
      if (step) ok = (await query('UPDATE users SET otp_last_step = ? WHERE id = ? AND otp_last_step < ?', [step, user.id, step])).affectedRows === 1;
    }
    if (!ok) {
      const fails = user.otp_fail_count + 1;
      const locked = fails >= MAX_FAILS;
      await query('UPDATE users SET otp_fail_count = ?, otp_locked_until = ? WHERE id = ?', [locked ? 0 : fails, locked ? now + LOCK_MS : 0, user.id]);
      await audit(req, user, locked ? 'otp.locked' : 'otp.fail', user.email);
      if (locked) return reply.code(429).send({ error: '여러 번 틀려 잠시 잠겼습니다. 15분 뒤에 다시 시도해 주세요.', lockedUntil: now + LOCK_MS });
      return reply.code(400).send({ error: recovery ? '복구 코드가 맞지 않거나 이미 사용했습니다.' : '인증 코드가 맞지 않습니다.', remaining: MAX_FAILS - fails });
    }
    await query('UPDATE users SET otp_fail_count = 0, otp_locked_until = 0 WHERE id = ?', [user.id]);
    const { csrf } = await rotateSession(req, reply, user.id, true);
    await audit(req, user, 'login.otp', user.email, detail);
    const left = recovery ? (await one('SELECT COUNT(*) AS total FROM recovery_codes WHERE user_id = ? AND used_at IS NULL', [user.id])).total : null;
    return { ok: true, csrf, recoveryLeft: left };
  });
}
