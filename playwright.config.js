// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'line',
  webServer: {
    command: 'PORT=9876 node server.js',
    url: 'http://localhost:9876/src/hse-feature-intake.html',
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:9876',
    // Use installed Google Chrome when Playwright’s downloaded Chromium is missing (common on ARM/Mac).
    channel: 'chrome',
  },
});
