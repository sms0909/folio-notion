import { test, beforeEach } from '@e2e-dev/web';
import { expect } from 'e2e';
import { createHmac } from 'node:crypto';

// 화면에 나온 설정 키로 인증 앱과 같은 6자리 코드를 만든다. offset 은 30초 단위.
function totp(secret: string, offset = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset));
  const mac = createHmac('sha1', key).update(counter).digest();
  const at = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(at) & 0x7fffffff) % 1000000).padStart(6, '0');
}

const ADMIN = 'admin@folio.test';

async function signIn(screen: any, email: string) {
  await screen.getByRole('link', 'Google 계정으로 로그인').tap();
  await screen.getByLabel('이메일').fill(email);
  await screen.getByRole('button', '계속', { exact: true }).tap();
}

async function enroll(screen: any, browser: any) {
  await expect(screen.getByRole('heading', 'OTP 등록')).toBeVisible();
  await expect(screen.getByRole('img', 'OTP 등록용 QR 코드')).toBeVisible();
  const secret: string = await browser.evaluate(() => (document.querySelector('#otp-secret') as HTMLInputElement).value);
  await screen.getByLabel('인증 코드').fill(totp(secret));
  await screen.getByRole('button', 'OTP 등록 완료').tap();
  await expect(screen.getByRole('heading', '복구 코드 보관')).toBeVisible();
  const codes: string[] = await browser.evaluate(() => [...document.querySelectorAll('.auth-codes li')].map(item => item.textContent));
  await screen.getByRole('button', '보관했습니다. 계속').tap();
  await expect(screen.getByRole('button', '계정', { exact: true })).toBeVisible();
  return { secret, codes };
}

async function useRecovery(screen: any, code: string) {
  await expect(screen.getByRole('heading', 'OTP 확인')).toBeVisible();
  await screen.getByRole('button', '휴대폰이 없나요? 복구 코드 사용').tap();
  await screen.getByLabel('복구 코드').fill(code);
  await screen.getByRole('button', '확인', { exact: true }).tap();
}

// 실제 가입 절차로 만든 계정을 지우고 로그인 화면에서 시작한다.
beforeEach(async ({ app }) => { await app.open('/auth/test/reset'); });

test('signed-out visitors see the login screen and only the configured admin may log in first', async ({ screen, app }) => {
  await expect(screen.getByRole('heading', 'Folio에 로그인')).toBeVisible();
  await expect(screen.getByRole('button', '계정', { exact: true })).toHaveCount(0);
  await signIn(screen, 'stranger@example.com');
  await expect(screen.getByRole('alert')).toContainText('아직 관리자가 로그인하지 않았습니다');
  await signIn(screen, 'unverified@example.com');
  await expect(screen.getByRole('alert')).toContainText('이메일 확인을 마치지 않은 계정');
  await app.screenshot('auth-login-denied');
});

test('first admin must enroll OTP and every later login asks for a fresh code', async ({ screen, browser, app }) => {
  await signIn(screen, ADMIN);
  await expect(screen.getByRole('heading', 'OTP 등록')).toBeVisible();
  await app.screenshot('auth-otp-setup');
  await screen.getByLabel('인증 코드').fill('000000');
  await screen.getByRole('button', 'OTP 등록 완료').tap();
  await expect(screen.getByRole('alert')).toContainText('인증 코드가 맞지 않습니다');
  const { secret, codes } = await enroll(screen, browser);
  expect(codes.length).toBe(10);
  await screen.getByRole('button', '계정', { exact: true }).tap();
  const dialog = screen.getByRole('dialog', '계정 및 로그인');
  await expect(dialog).toContainText(`${ADMIN} · 관리자`);
  await expect(dialog.getByRole('link', '관리자 화면', { exact: true })).toBeVisible();
  await dialog.getByRole('button', '로그아웃', { exact: true }).tap();
  await signIn(screen, ADMIN);
  await expect(screen.getByRole('heading', 'OTP 확인')).toBeVisible();
  // 등록 때 쓴 코드는 다시 쓸 수 없다.
  await screen.getByLabel('인증 코드').fill(totp(secret, -1));
  await screen.getByRole('button', '확인', { exact: true }).tap();
  await expect(screen.getByRole('alert')).toContainText('인증 코드가 맞지 않습니다');
  await screen.getByLabel('인증 코드').fill(totp(secret, 1));
  await screen.getByRole('button', '확인', { exact: true }).tap();
  await expect(screen.getByRole('button', '계정', { exact: true })).toBeVisible();
});

test('admin invites a member, and can reset their OTP or disable the account', async ({ screen, browser, app }) => {
  await signIn(screen, ADMIN);
  const admin = await enroll(screen, browser);
  await app.open('/admin');
  await screen.getByLabel('초대할 이메일').fill('member@example.com');
  await screen.getByRole('button', '초대하기').tap();
  await expect(screen.getByRole('status', '처리 결과')).toContainText('member@example.com 님을 초대했습니다.');
  await expect(screen.getByRole('table', '대기 중인 초대')).toContainText('member@example.com');
  await app.screenshot('admin-invite');

  await app.open('/auth/test/noauto');
  await signIn(screen, 'stranger@example.com');
  await expect(screen.getByRole('alert')).toContainText('초대받지 않은 계정입니다');
  await signIn(screen, 'member@example.com');
  await enroll(screen, browser);
  await screen.getByRole('button', '계정', { exact: true }).tap();
  await expect(screen.getByRole('dialog', '계정 및 로그인')).toContainText('member@example.com · 멤버');
  await app.open('/admin');
  await expect(screen.getByText('관리자만 볼 수 있는 화면입니다.', { exact: true })).toBeVisible();
  expect(await browser.evaluate(async () => (await fetch('/api/admin/overview')).status)).toBe(403);

  await app.open('/auth/test/noauto');
  await signIn(screen, ADMIN);
  await useRecovery(screen, admin.codes[0]);
  await expect(screen.getByRole('button', '계정', { exact: true })).toBeVisible();
  await app.open('/admin');
  await expect(screen.getByRole('table', '사용자')).toContainText('member@example.com');
  await expect(screen.getByRole('table', '감사 기록')).toContainText('초대');
  await screen.getByRole('button', 'member@example.com OTP 초기화', { exact: true }).tap();
  await screen.getByRole('button', 'member@example.com OTP 초기화 확인', { exact: true }).tap();
  await expect(screen.getByRole('status', '처리 결과')).toContainText('OTP를 초기화했습니다.');

  await app.open('/auth/test/noauto');
  await signIn(screen, 'member@example.com');
  await expect(screen.getByRole('heading', 'OTP 등록')).toBeVisible();

  await app.open('/auth/test/noauto');
  await signIn(screen, ADMIN);
  await useRecovery(screen, admin.codes[1]);
  await expect(screen.getByRole('button', '계정', { exact: true })).toBeVisible();
  await app.open('/admin');
  await screen.getByRole('button', 'member@example.com 사용 중지', { exact: true }).tap();
  await expect(screen.getByRole('status', '처리 결과')).toContainText('계정을 사용 중지했습니다.');
  await app.open('/auth/test/noauto');
  await signIn(screen, 'member@example.com');
  await expect(screen.getByRole('alert')).toContainText('사용이 중지된 계정입니다');
});

test('a recovery code works once and repeated wrong codes lock OTP for a while', async ({ screen, browser, app }) => {
  await signIn(screen, ADMIN);
  const { codes } = await enroll(screen, browser);
  await app.open('/auth/test/noauto');
  await signIn(screen, ADMIN);
  await useRecovery(screen, codes[0]);
  await expect(screen.getByRole('button', '계정', { exact: true })).toBeVisible();
  await app.open('/auth/test/noauto');
  await signIn(screen, ADMIN);
  await useRecovery(screen, codes[0]);
  await expect(screen.getByRole('alert')).toContainText('이미 사용했습니다');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await screen.getByLabel('복구 코드').fill(`wrong-code${attempt}`);
    await screen.getByRole('button', '확인', { exact: true }).tap();
    await expect(screen.getByRole('alert')).toContainText(attempt < 3 ? `남은 횟수 ${3 - attempt}번` : '15분 뒤에 다시 시도');
  }
  await browser.reload();
  await expect(screen.getByRole('alert')).toContainText('15분 뒤에 다시 시도');
});

test('state-changing requests without the CSRF token are refused', async ({ screen, browser }) => {
  await signIn(screen, ADMIN);
  await enroll(screen, browser);
  expect(await browser.evaluate(async () => (await fetch('/auth/logout', { method: 'POST' })).status)).toBe(403);
  expect(await browser.evaluate(async () => (await fetch('/api/admin/invites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"email":"x@example.com"}' })).status)).toBe(403);
  await browser.reload();
  await expect(screen.getByRole('button', '계정', { exact: true })).toBeVisible();
});
