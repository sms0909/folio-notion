// 관리자 화면: 초대, 사용자, 감사 기록.
import { session, api } from './session.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const app = document.querySelector('#app');
const when = ms => ms ? new Date(ms).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
const ROLE = { admin: '관리자', member: '멤버' };
const ACTION = {
  'user.join': '가입', 'login.google': 'Google 로그인', 'login.otp': 'OTP 통과', 'login.denied': '로그인 거부', logout: '로그아웃',
  'otp.enable': 'OTP 등록', 'otp.fail': 'OTP 실패', 'otp.locked': 'OTP 잠금', 'otp.reset': 'OTP 초기화',
  'invite.create': '초대', 'invite.cancel': '초대 취소', 'user.role': '역할 변경', 'user.disable': '사용 중지', 'user.enable': '사용 재개',
};
let data = { users: [], invites: [] }, entries = [], message = { text: '', error: false }, confirming = 0;

const roleSelect = (name, value, label) => `<select name="${name}" aria-label="${esc(label)}">${Object.entries(ROLE).map(([key, text]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${text}</option>`).join('')}</select>`;

function render() {
  const users = data.users.map(user => {
    const self = user.id === session.user.id;
    return `<tr><td>${esc(user.email)}${self ? ' (나)' : ''}</td><td>${esc(user.name)}</td><td>${self ? ROLE[user.role] : `<span data-user="${user.id}">${roleSelect('role', user.role, `${user.email} 역할`)}</span>`}</td><td>${user.disabled ? '사용 중지' : '사용 중'}</td><td>${user.otp ? '등록' : '미등록'}</td><td>${when(user.last_login_at)}</td><td>${self ? '' : `<div class="admin-actions"><button type="button" class="admin-btn" data-admin="toggle" data-user="${user.id}" aria-label="${esc(user.email)} ${user.disabled ? '사용 재개' : '사용 중지'}">${user.disabled ? '사용 재개' : '사용 중지'}</button><button type="button" class="admin-btn" data-admin="reset-otp" data-user="${user.id}" aria-label="${esc(user.email)} OTP 초기화${confirming === user.id ? ' 확인' : ''}">${confirming === user.id ? '한 번 더 눌러 초기화' : 'OTP 초기화'}</button></div>`}</td></tr>`;
  }).join('');
  const invites = data.invites.map(invite => `<tr><td>${esc(invite.email)}</td><td>${ROLE[invite.role]}</td><td>${when(invite.created_at)}</td><td><button type="button" class="admin-btn" data-admin="cancel-invite" data-invite="${invite.id}" aria-label="${esc(invite.email)} 초대 취소">초대 취소</button></td></tr>`).join('');
  const audit = entries.map(entry => `<tr><td>${when(entry.at)}</td><td>${esc(entry.actor_email || '-')}</td><td>${esc(ACTION[entry.action] || entry.action)}</td><td class="wrap">${esc([entry.target, entry.detail].filter(Boolean).join(' · '))}</td><td>${esc(entry.ip)}</td></tr>`).join('');
  app.innerHTML = `<main class="admin-page"><div class="admin-head"><h1>관리자</h1><a href="/">워크스페이스로 돌아가기</a></div><p class="admin-lead">초대받은 Google 계정만 Folio에 가입할 수 있습니다.</p>
<p class="admin-msg ${message.error ? 'error' : ''}" role="status" aria-label="처리 결과">${esc(message.text)}</p>
<h2 id="invite-title">사용자 초대</h2><form class="admin-invite" data-admin-form="invite" aria-labelledby="invite-title"><label>초대할 이메일<input name="email" type="email" required placeholder="name@gmail.com" autocomplete="off"></label><label>역할${roleSelect('role', 'member', '초대 역할')}</label><button class="admin-btn primary" type="submit">초대하기</button></form>
<h2>대기 중인 초대</h2><div class="admin-scroll">${invites ? `<table class="admin-table" aria-label="대기 중인 초대"><thead><tr><th>이메일</th><th>역할</th><th>초대한 때</th><th>관리</th></tr></thead><tbody>${invites}</tbody></table>` : '<p class="admin-empty">대기 중인 초대가 없습니다.</p>'}</div>
<h2>사용자</h2><div class="admin-scroll"><table class="admin-table" aria-label="사용자"><thead><tr><th>이메일</th><th>이름</th><th>역할</th><th>상태</th><th>OTP</th><th>마지막 로그인</th><th>관리</th></tr></thead><tbody>${users}</tbody></table></div>
<h2>감사 기록</h2><div class="admin-scroll">${audit ? `<table class="admin-table" aria-label="감사 기록"><thead><tr><th>시각</th><th>계정</th><th>동작</th><th>내용</th><th>IP</th></tr></thead><tbody>${audit}</tbody></table>` : '<p class="admin-empty">기록이 없습니다.</p>'}</div></main>`;
}

async function refresh() {
  [data, { entries }] = await Promise.all([api('/api/admin/overview'), api('/api/admin/audit')]);
  render();
}

async function run(work, done) {
  try { await work(); message = { text: done, error: false }; }
  catch (error) { message = { text: error.message, error: true }; }
  await refresh().catch(() => render());
}

app.addEventListener('submit', event => {
  const form = event.target.closest('[data-admin-form="invite"]');
  if (!form) return;
  event.preventDefault();
  const body = Object.fromEntries(new FormData(form));
  run(() => api('/api/admin/invites', { method: 'POST', body }), `${body.email} 님을 초대했습니다.`);
});

app.addEventListener('change', event => {
  const holder = event.target.closest('[data-user]');
  if (!holder || event.target.name !== 'role') return;
  run(() => api(`/api/admin/users/${holder.dataset.user}`, { method: 'PATCH', body: { role: event.target.value } }), '역할을 바꿨습니다.');
});

app.addEventListener('click', event => {
  const button = event.target.closest('[data-admin]');
  if (!button) return;
  const user = data.users.find(item => String(item.id) === button.dataset.user);
  if (button.dataset.admin === 'cancel-invite') run(() => api(`/api/admin/invites/${button.dataset.invite}`, { method: 'DELETE' }), '초대를 취소했습니다.');
  if (button.dataset.admin === 'toggle') run(() => api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { disabled: !user.disabled } }), user.disabled ? `${user.email} 계정을 다시 사용할 수 있습니다.` : `${user.email} 계정을 사용 중지했습니다.`);
  if (button.dataset.admin === 'reset-otp' && confirming !== user.id) { confirming = user.id; render(); return; }
  confirming = 0;
  if (button.dataset.admin === 'reset-otp') run(() => api(`/api/admin/users/${user.id}/reset-otp`, { method: 'POST' }), `${user.email} 의 OTP를 초기화했습니다.`);
});

document.title = 'Folio — 관리자';
if (session.user.role !== 'admin') app.innerHTML = '<main class="admin-page"><div class="admin-head"><h1>관리자</h1><a href="/">워크스페이스로 돌아가기</a></div><p class="admin-lead">관리자만 볼 수 있는 화면입니다.</p></main>';
else refresh().catch(error => { message = { text: error.message, error: true }; render(); });
