import { defineConfig, devices } from 'playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.test.ts',
  
  // Global setup/teardown for shared web server
  globalSetup: path.join(__dirname, 'global-setup.ts'),
  globalTeardown: path.join(__dirname, 'global-teardown.ts'),
  
  // Timeout configuration
  timeout: 90000, // 90s per test (increased for rate limiting)
  globalTimeout: 900000, // 15 minutes total (increased for rate limiting)
  
  // Parallel execution settings - CRITICAL for rate limiting
  fullyParallel: false, // MUST run tests serially to enforce rate limits
  workers: 1, // MUST use single worker to prevent concurrent connections
  maxFailures: 0, // Stop on first failure to identify issues quickly
  
  // Retry configuration
  retries: 0, // No retries to identify flaky tests clearly
  
  // Reporter configuration - quiet when passing, verbose when failing
  reporter: process.env.CI || process.env.VERBOSE_TESTS
    ? [['list', { printSteps: true }]]
    : [['list', { printSteps: false }], ['html', { open: 'never' }]],
  
  // Shared test configuration
  use: {
    // Base URL will be set by global setup
    baseURL: process.env.WEB_CLI_TEST_URL,
    
    // Viewport
    viewport: { width: 1280, height: 720 },
    
    // Collect trace only on failure
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    
    // Suppress console messages unless in verbose mode
    launchOptions: {
      args: process.env.VERBOSE_TESTS ? [] : ['--disable-logging'],
    },
  },
  
  // Configure projects
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  
  // Output folder
  outputDir: path.join(__dirname, '../../../test-results'),
});