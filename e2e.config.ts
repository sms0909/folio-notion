import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
  tests: ['tests/**/*.e2e.ts'],
  workers: 2,
  timeout: 45000,
  actionTimeout: 8000,
  assertionTimeout: 4000,
  trace: 'on',
  targets: [{
    name: 'chromium',
    engine: web(),
    app: {
      url: process.env.APP_URL ?? 'http://127.0.0.1:4317',
      command: { executable: 'node', args: ['server.mjs'], reuseExisting: true, log: '.e2e/logs/app.log' },
    },
  }],
} satisfies E2EConfig;
