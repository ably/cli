import { defineConfig } from 'playwright/test';
import { sharedConfig } from '../../playwright.shared';
import path from 'node:path';

// Get test group from environment variable
const TEST_GROUP = process.env.TEST_GROUP || 'all';

// Rate limit configuration per test group
const rateLimitConfig = {
  auth: {
    connectionsPerBatch: 10,     // Auth tests can handle more connections
    pauseDuration: 30000,        // 30s pause between batches
  },
  session: {
    connectionsPerBatch: 5,      // Session tests are more intensive
    pauseDuration: 65000,        // 65s pause to ensure rate limit reset
  },
  ui: {
    connectionsPerBatch: 8,      // UI tests are lighter
    pauseDuration: 40000,        // 40s pause
  },
  'rate-limit': {
    connectionsPerBatch: 5,      // Rate limit test needs careful handling
    pauseDuration: 65000,        // Full rate limit window
  },
  all: {
    connectionsPerBatch: 5,      // Default conservative settings
    pauseDuration: 65000,
  },
};

const currentRateLimitConfig = rateLimitConfig[TEST_GROUP] || rateLimitConfig.all;

export default defineConfig({
  ...sharedConfig,
  testDir: '.',
  outputDir: path.join(__dirname, '..', '..', '..', 'test-results', `web-cli-${TEST_GROUP}`),
  
  // Timeout configuration based on test group
  timeout: TEST_GROUP === 'session' ? 180000 : 120000,  // 3 min for session tests, 2 min for others
  globalTimeout: TEST_GROUP === 'session' ? 1200000 : 900000, // 20 min vs 15 min
  
  // Always use serial mode for rate limiting, but optimize per group
  fullyParallel: false,
  workers: 1,
  
  // Retries disabled in CI to avoid rate limit issues
  retries: process.env.CI ? 0 : 1,
  
  use: {
    ...sharedConfig.use,
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: process.env.CI ? 'retain-on-failure' : 'off',
    
    // Custom context options for rate limiting
    contextOptions: {
      // Pass rate limit config to tests
      rateLimitConfig: currentRateLimitConfig,
    },
  },

  reporter: [
    ['list'],
    ['json', { outputFile: `test-results/web-cli-${TEST_GROUP}-results.json` }],
    ['html', { outputFolder: `playwright-report/web-cli-${TEST_GROUP}`, open: 'never' }],
  ],

  // Projects configuration
  projects: [
    {
      name: `chromium-${TEST_GROUP}`,
      use: {
        ...sharedConfig.projects?.[0]?.use,
        viewport: { width: 1280, height: 720 },
      },
    },
  ],

  globalSetup: path.join(__dirname, 'global-setup.ts'),
  globalTeardown: path.join(__dirname, 'global-teardown.ts'),
});

// Export rate limit config for tests to use
export { currentRateLimitConfig };