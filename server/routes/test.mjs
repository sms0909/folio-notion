// 테스트 모드 전용 도우미. 운영 모드에서는 등록되지 않는다.
import { config } from '../config.mjs';
import { query } from '../db.mjs';
import { destroySession } from '../auth/session.mjs';
import { NOAUTO } from './account.mjs';

export function testRoutes(app) {
  if (!config.test) throw new Error('테스트 도우미는 테스트 모드에서만 등록합니다.');

  // 자동 로그인을 끄고 로그인 화면부터 시작한다.
  app.get('/auth/test/noauto', async (req, reply) => {
    await destroySession(req, reply);
    reply.setCookie(NOAUTO, '1', { path: '/' });
    return reply.redirect('/');
  });

  // 실제 가입 절차로 만든 사용자·초대·기록을 지운다. 자동 로그인 사용자는 남긴다.
  app.get('/auth/test/reset', async (req, reply) => {
    await query('DELETE FROM invites');
    await query('DELETE FROM users WHERE is_system = 0');
    await query('DELETE FROM audit_log');
    await destroySession(req, reply);
    reply.setCookie(NOAUTO, '1', { path: '/' });
    return reply.redirect('/');
  });
}
