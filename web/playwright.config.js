import { defineConfig, devices } from '@playwright/test'

// Single nominal e2e (D2-A): runs against a live stack (front served by Vite, API + DB up).
// Kept deliberately minimal — error cases live in the Vitest/RTL suites.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
