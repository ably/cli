import { teardownWebServer } from './shared-setup';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '.rate-limiter-state.json');

async function globalTeardown() {
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log('[Global Teardown] Starting...');
  }
  
  // Stop the shared web server
  await teardownWebServer();
  
  // Clean up rate limiter state file
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
      if (!process.env.CI || process.env.VERBOSE_TESTS) {
        console.log('[Global Teardown] Cleaned up rate limiter state file');
      }
    }
  } catch (error) {
    console.warn('[Global Teardown] Failed to clean up rate limiter state:', error);
  }
  
  if (!process.env.CI || process.env.VERBOSE_TESTS) {
    console.log('[Global Teardown] Complete.');
  }
}

export default globalTeardown;