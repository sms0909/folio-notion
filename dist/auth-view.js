// 로그인, OTP 등록, OTP 확인 화면.
import { session, api, logout } from './session.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const app = document.querySelector('#app');
const DENIED = {
  'not-invited': '초대받지 않은 계정입니다. 관리자에게 이 Google 계정의 이메일로 초대를 요청해 주세요.',
  'first-admin': '아직 관리자가 로그인하지 않았습니다. 관리자가 먼저 로그인해야 합니다.',
  disabled: '사용이 중지된 계정입니다. 관리자에게 문의해 주세요.',
  unverified: 'Google에서 이메일 확인을 마치지 않은 계정입니다.',
  config: '서버 설정이 끝나지 않았습니다. 관리자에게 문의해 주세요.',
  state: '로그인 시간이 지났습니다. 다시 시도해 주세요.',
  error: '로그인하지 못했습니다. 다시 시도해 주세요.',
};

function card(title, body) {
  document.body.classList.add('auth-body');
  app.innerHTML = `<main class="auth-card"><div class="auth-logo" aria-hidden="true">f</div><h1>${title}</h1>${body}</main>`;
}

const who = () => `<p class="auth-who">${esc(session.user.email)} · <button type="button" class="auth-link" data-auth="logout">다른 계정으로 로그인</button></p>`;
const fail = message => { const el = app.querySelector('[role="alert"]'); el.textContent = message; el.hidden = !message; };

function login() {
  const reason = new URLSearchParams(location.search).get('denied');
  if (reason) history.replaceState(null, '', '/');
  card('Folio에 로그인', `<p class="auth-lead">초대받은 Google 계정으로 로그인하세요.</p>${reason ? `<p class="auth-error" role="alert">${esc(DENIED[reason] || DENIED.error)}</p>` : ''}<a class="auth-primary" href="/auth/google">Google 계정으로 로그인</a><p class="auth-note">로그인한 뒤 인증 앱(Google OTP)의 6자리 코드를 한 번 더 확인합니다.</p>`);
}

async function setup() {
  card('OTP 등록', `${who()}<p class="auth-lead">Folio는 모든 계정에 OTP를 사용합니다. 인증 앱을 준비하는 중입니다…</p>`);
  let data;
  try { data = await api('/auth/otp/setup', { method: 'POST' }); }
  catch (error) { card('OTP 등록', `${who()}<p class="auth-error" role="alert">${esc(error.message)}</p><button type="button" class="auth-primary" data-auth="reload">다시 시도</button>`); return; }
  card('OTP 등록', `${who()}<ol class="auth-steps"><li>휴대폰에 <strong>Google OTP</strong>(Google Authenticator) 앱을 설치합니다.</li><li>앱에서 QR 코드를 스캔하거나 설정 키를 직접 입력합니다.</li><li>앱에 표시된 6자리 코드를 아래에 입력합니다.</li></ol><img class="auth-qr" alt="OTP 등록용 QR 코드" src="data:image/svg+xml;utf8,${encodeURIComponent(data.qr)}"><label class="auth-field">설정 키<input id="otp-secret" readonly value="${esc(data.secret)}"></label><form class="auth-form" data-auth-form="enable"><label class="auth-field">인증 코드<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6자리 숫자" required></label><p class="auth-error" role="alert" hidden></p><button class="auth-primary" type="submit">OTP 등록 완료</button></form>`);
  app.querySelector('[name="code"]').focus();
}

function recovery(codes) {
  card('복구 코드 보관', `<p class="auth-lead">휴대폰을 잃어버렸을 때 OTP 대신 쓸 수 있는 코드입니다. <strong>지금만 볼 수 있으니</strong> 안전한 곳에 적어 두세요. 코드 하나는 한 번만 쓸 수 있습니다.</p><ul class="auth-codes" aria-label="복구 코드">${codes.map(code => `<li>${esc(code)}</li>`).join('')}</ul><div class="auth-row"><button type="button" class="auth-secondary" data-auth="copy-codes">복사</button><button type="button" class="auth-primary" data-auth="reload">보관했습니다. 계속</button></div><p class="auth-note" role="status"></p>`);
  app.querySelector('[data-auth="copy-codes"]').dataset.codes = codes.join('\n');
}

function verify(useRecovery = false) {
  const locked = session.lockedUntil > Date.now();
  card('OTP 확인', `${who()}<form class="auth-form" data-auth-form="verify">${useRecovery
    ? '<label class="auth-field">복구 코드<input name="recovery" autocomplete="off" placeholder="xxxxx-xxxxx" required></label>'
    : '<label class="auth-field">인증 코드<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="6자리 숫자" required></label>'}<p class="auth-error" role="alert" ${locked ? '' : 'hidden'}>${locked ? '여러 번 틀려 잠시 잠겼습니다. 15분 뒤에 다시 시도해 주세요.' : ''}</p><button class="auth-primary" type="submit">확인</button></form><button type="button" class="auth-link" data-auth="${useRecovery ? 'use-code' : 'use-recovery'}">${useRecovery ? '인증 앱 코드로 확인' : '휴대폰이 없나요? 복구 코드 사용'}</button><p class="auth-note">복구 코드도 없다면 관리자에게 OTP 초기화를 요청하세요.</p>`);
  app.querySelector('input').focus();
}

app.addEventListener('submit', async event => {
  const form = event.target.closest('[data-auth-form]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const body = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    if (form.dataset.authForm === 'enable') recovery((await api('/auth/otp/enable', { method: 'POST', body })).recoveryCodes);
    else { await api('/auth/otp/verify', { method: 'POST', body }); location.reload(); }
  } catch (error) {
    button.disabled = false;
    fail(error.data?.remaining ? `${error.message} (남은 횟수 ${error.data.remaining}번)` : error.message);
    form.querySelector('input').select();
  }
});

app.addEventListener('click', async event => {
  const action = event.target.closest('[data-auth]')?.dataset.auth;
  if (action === 'logout') await logout().catch(() => location.reload());
  if (action === 'reload') location.reload();
  if (action === 'use-recovery') verify(true);
  if (action === 'use-code') verify(false);
  if (action === 'copy-codes') {
    const note = app.querySelector('[role="status"]');
    try { await navigator.clipboard.writeText(event.target.dataset.codes); note.textContent = '복구 코드를 복사했습니다.'; }
    catch { note.textContent = '복사하지 못했습니다. 직접 적어 두세요.'; }
  }
});

if (session.state === 'otp-setup') setup();
else if (session.state === 'otp-verify') verify();
else login();
