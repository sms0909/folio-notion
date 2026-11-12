import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (existsSync('.env')) process.loadEnvFile('.env');
const env = process.env;
const clean = value => String(value ?? '').trim();

const test = process.argv.includes('--test') || env.FOLIO_TEST === '1';
const production = env.NODE_ENV === 'production';
if (test && production) throw new Error('테스트 모드(--test, FOLIO_TEST)는 NODE_ENV=production 에서 켤 수 없습니다.');

const port = Number(env.PORT || 4317);
const host = clean(env.HOST) || '127.0.0.1';
const publicUrl = (clean(env.PUBLIC_URL) || `http://127.0.0.1:${port}`).replace(/\/+$/, '');
const local = `http://127.0.0.1:${port}/auth/test/oidc`;

export const config = {
  test, production, port, host, publicUrl,
  secureCookies: publicUrl.startsWith('https://'),
  adminEmail: (clean(env.ADMIN_EMAIL) || (test ? 'admin@folio.test' : '')).toLowerCase(),
  sessionSecret: clean(env.SESSION_SECRET) || (test ? randomBytes(32).toString('hex') : ''),
  sessionDays: 14,
  dataDir: clean(env.DATA_DIR) || 'data',
  google: test
    ? { clientId: 'folio-test-client', clientSecret: 'folio-test-secret', issuer: [local], authUrl: '/auth/test/oidc/authorize', tokenUrl: `${local}/token`, jwksUrl: `${local}/jwks` }
    : { clientId: clean(env.GOOGLE_CLIENT_ID), clientSecret: clean(env.GOOGLE_CLIENT_SECRET), issuer: ['https://accounts.google.com', 'accounts.google.com'], authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token', jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs' },
  db: {
    host: clean(env.DB_HOST), port: Number.parseInt(env.DB_PORT || '3306', 10), user: clean(env.DB_USER), password: env.DB_PASSWORD ?? '',
    database: test ? clean(env.TEST_DB_NAME) || 'folio_test' : clean(env.DB_NAME) || 'folio',
    ssl: /^(1|true|yes)$/i.test(clean(env.DB_SSL)),
  },
};

export function configProblems() {
  const problems = [];
  if (!config.db.host || !config.db.user) problems.push('DB_HOST, DB_USER 가 필요합니다.');
  if (!test) {
    if (config.sessionSecret.length < 32) problems.push('SESSION_SECRET 은 32자 이상이어야 합니다.');
    if (!config.adminEmail) problems.push('ADMIN_EMAIL 이 필요합니다.');
    if (!config.google.clientId || !config.google.clientSecret) problems.push('GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET 이 필요합니다.');
    if (production && !config.secureCookies) problems.push('PUBLIC_URL 은 https:// 로 시작해야 합니다.');
  }
  return problems;
}
