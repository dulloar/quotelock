import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testIgnore: 'demo-real.spec.ts', timeout: 300000, reporter: 'list', outputDir: 'test-results',
  use: {
    channel: 'chromium',
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    launchOptions: { slowMo: 350 },
  },
  webServer: [
    { command: 'PORT=3002 node src/server.ts', cwd: '../backend', url: 'http://localhost:3002/api/eventos', reuseExistingServer: false, timeout: 30000 },
    { command: 'VITE_API_URL=http://localhost:3002 npx vite --port 5174 --strictPort', cwd: '../web', url: 'http://localhost:5174', reuseExistingServer: false, timeout: 60000 },
  ],
});
