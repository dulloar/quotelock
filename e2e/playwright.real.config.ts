import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'demo-real.spec.ts', timeout: 15 * 60 * 1000, reporter: 'list',
  outputDir: 'test-results-real',
  use: {
    channel: 'chromium', headless: false,
    baseURL: 'http://localhost:5173',
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    launchOptions: { slowMo: 250 },
  },
});
