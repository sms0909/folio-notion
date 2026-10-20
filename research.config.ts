import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
export default {
  targets: [{ name: 'notion-public', engine: web(), app: { url: 'https://www.notion.com' } }],
  tests: ['research/**/*.e2e.ts'], workers: 1, timeout: 90000, actionTimeout: 30000,
  output: '.e2e-research', trace: 'on',
} satisfies E2EConfig;
