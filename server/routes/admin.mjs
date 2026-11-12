import { one, query, transaction } from '../db.mjs';
import { audit, stateOf } from '../auth/session.mjs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['admin', 'member'];

export async function resetOtp(userId) {
  await transaction(async conn => {
    await conn.query('UPDATE users SET otp_secret = NULL, otp_confirmed_at = NULL, otp_last_step = 0, otp_fail_count = 0, otp_locked_until = 0 WHERE id = ?', [userId]);
    await conn.query('DELETE FROM recovery_codes WHERE user_id = ?', [userId]);
    await conn.query('DELETE FROM sessions WHERE user_id = ?', [userId]);
  });
}

export function adminRoutes(app) {
  const admin = async (req, reply) => {
    if (stateOf(req.auth) !== 'ready') return reply.code(401).send({ error: '로그인이 필요합니다.' });
    if (req.auth.user.role !== 'admin') return reply.code(403).send({ error: '관리자만 사용할 수 있습니다.' });
  };
  const target = async (req, reply) => {
    const user = await one('SELECT * FROM users WHERE id = ? AND is_system = 0', [Number(req.params.id)]);
    if (!user) { reply.code(404).send({ error: '사용자를 찾을 수 없습니다.' }); return null; }
    if (user.id === req.auth.user.id) { reply.code(400).send({ error: '자기 계정에는 쓸 수 없습니다.' }); return null; }
    return user;
  };

  app.get('/api/admin/overview', { preHandler: admin }, async () => ({
    users: await query('SELECT id, email, name, role, disabled, otp_confirmed_at IS NOT NULL AS otp, created_at, last_login_at FROM users WHERE is_system = 0 ORDER BY created_at'),
    invites: await query('SELECT id, email, role, created_at FROM invites WHERE accepted_at IS NULL ORDER BY created_at DESC'),
  }));

  app.post('/api/admin/invites', { preHandler: admin }, async (req, reply) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const role = ROLES.includes(req.body?.role) ? req.body.role : 'member';
    if (email.length > 254 || !EMAIL.test(email)) return reply.code(400).send({ error: '이메일 주소를 확인해 주세요.' });
    if (await one('SELECT id FROM users WHERE email = ?', [email])) return reply.code(409).send({ error: '이미 가입한 사용자입니다.' });
    if (await one('SELECT id FROM invites WHERE email = ? AND accepted_at IS NULL', [email])) return reply.code(409).send({ error: '이미 초대한 이메일입니다.' });
    await query('INSERT INTO invites (email, role, invited_by, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role), invited_by = VALUES(invited_by), created_at = VALUES(created_at), accepted_at = NULL', [email, role, req.auth.user.id, Date.now()]);
    await audit(req, req.auth.user, 'invite.create', email, `역할 ${role}`);
    return { ok: true };
  });

  app.delete('/api/admin/invites/:id', { preHandler: admin }, async (req, reply) => {
    const invite = await one('SELECT * FROM invites WHERE id = ? AND accepted_at IS NULL', [Number(req.params.id)]);
    if (!invite) return reply.code(404).send({ error: '초대를 찾을 수 없습니다.' });
    await query('DELETE FROM invites WHERE id = ?', [invite.id]);
    await audit(req, req.auth.user, 'invite.cancel', invite.email);
    return { ok: true };
  });

  app.patch('/api/admin/users/:id', { preHandler: admin }, async (req, reply) => {
    const user = await target(req, reply);
    if (!user) return reply;
    const { role, disabled } = req.body ?? {};
    if (ROLES.includes(role) && role !== user.role) {
      await query('UPDATE users SET role = ? WHERE id = ?', [role, user.id]);
      await audit(req, req.auth.user, 'user.role', user.email, `${user.role} → ${role}`);
    }
    if (typeof disabled === 'boolean' && disabled !== Boolean(user.disabled)) {
      await query('UPDATE users SET disabled = ? WHERE id = ?', [disabled ? 1 : 0, user.id]);
      if (disabled) await query('DELETE FROM sessions WHERE user_id = ?', [user.id]);
      await audit(req, req.auth.user, disabled ? 'user.disable' : 'user.enable', user.email);
    }
    return { ok: true };
  });

  app.post('/api/admin/users/:id/reset-otp', { preHandler: admin }, async (req, reply) => {
    const user = await target(req, reply);
    if (!user) return reply;
    await resetOtp(user.id);
    await audit(req, req.auth.user, 'otp.reset', user.email);
    return { ok: true };
  });

  app.get('/api/admin/audit', { preHandler: admin }, async () => ({
    entries: await query('SELECT id, at, actor_email, action, target, detail, ip FROM audit_log ORDER BY id DESC LIMIT 200'),
  }));
}
