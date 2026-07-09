import { defineConfig, devices } from '@playwright/test'

// The e2e suite drives the built app through a preview server. It proves the ruling
// stays uniform and the diagrams stay hand-drawn, the two things easiest to regress.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4321',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'bun run build && bunx vite preview --port 4321',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
