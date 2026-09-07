import { defineConfig, devices } from '@playwright/test';

// Runs against the production build (`npm run build` first): the exact bundle that ships to GitHub Pages.
const BASE = '/personal-library-backup-merger/';
const PORT = Number(process.env.E2E_PORT ?? 4173);
const URL = `http://localhost:${PORT}${BASE}`;
// Locally reuse the installed Edge (no browser download); CI installs Playwright's Chromium.
const channel = process.env.CI ? undefined : 'msedge';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
});
