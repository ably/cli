import { teardownWebServer } from './shared-setup';

async function globalTeardown() {
  console.log('[Global Teardown] Starting...');
  
  // Stop the shared web server
  await teardownWebServer();
  
  console.log('[Global Teardown] Complete.');
}

export default globalTeardown;