// 관리용 명령.  node server/cli.mjs users | reset-otp <이메일>
import { config } from './config.mjs';
import { one, pool, query } from './db.mjs';
import { resetOtp } from './routes/admin.mjs';

const [command, email] = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
try {
  if (command === 'users') {
    const users = await query('SELECT email, role, disabled, otp_confirmed_at IS NOT NULL AS otp FROM users WHERE is_system = 0 ORDER BY created_at');
    for (const user of users) console.log(`${user.email}\t${user.role}\t${user.disabled ? '사용 중지' : '사용 중'}\tOTP ${user.otp ? '등록' : '미등록'}`);
    if (!users.length) console.log('사용자가 없습니다.');
  } else if (command === 'reset-otp' && email) {
    const user = await one('SELECT id, email FROM users WHERE email = ?', [email.toLowerCase()]);
    if (!user) { console.error(`사용자를 찾을 수 없습니다: ${email}`); process.exitCode = 1; }
    else {
      await resetOtp(user.id);
      await query('INSERT INTO audit_log (at, actor_email, action, target, detail) VALUES (?, ?, ?, ?, ?)', [Date.now(), 'cli', 'otp.reset', user.email, '서버 명령']);
      console.log(`${user.email} 의 OTP 를 초기화했습니다. 다음 로그인 때 다시 등록합니다.`);
    }
  } else {
    console.log(`사용법 (DB: ${config.db.database})\n  node server/cli.mjs users\n  node server/cli.mjs reset-otp <이메일>`);
    process.exitCode = 1;
  }
} finally { await pool.end(); }
