/**
 * Shared setup for Web CLI E2E tests
 * This module manages a single web server instance for all tests
 */
import { promisify } from 'node:util';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { ChildProcess } from 'node:child_process';

const execAsync = promisify(exec);

// For ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const EXAMPLE_DIR = path.resolve(__dirname, '../../../examples/web-cli');
const WEB_CLI_DIST = path.join(EXAMPLE_DIR, 'dist');

// Shared state
let webServerProcess: ChildProcess | null = null;
let webServerPort: number | null = null;
let webServerUrl: string | null = null;
let setupPromise: Promise<void> | null = null;
let teardownPromise: Promise<void> | null = null;

// Helper function to wait for server startup
async function waitForServer(url: string, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore fetch errors (server not ready)
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server ${url} did not start within ${timeout}ms`);
}

export async function setupWebServer(): Promise<string> {
  // If already setting up, wait for it
  if (setupPromise) {
    await setupPromise;
    return webServerUrl!;
  }
  
  // If already set up, return URL
  if (webServerUrl && webServerProcess) {
    return webServerUrl;
  }
  
  setupPromise = (async () => {
    console.log('[Shared Setup] Setting up Web CLI web server...');
    
    // Ensure dist directory exists
    if (!fs.existsSync(WEB_CLI_DIST)) {
      console.log('[Shared Setup] Dist directory not found, building...');
      
      // Move any .env file temporarily
      const envFile = path.join(EXAMPLE_DIR, '.env');
      const envBackup = path.join(EXAMPLE_DIR, '.env.backup-shared');
      
      if (fs.existsSync(envFile)) {
        fs.renameSync(envFile, envBackup);
      }
      
      try {
        // Build without credentials
        await execAsync('pnpm build', { 
          cwd: EXAMPLE_DIR,
          env: {
            ...process.env,
            VITE_ABLY_API_KEY: undefined,
            VITE_ABLY_ACCESS_TOKEN: undefined,
            ABLY_API_KEY: undefined,
            E2E_ABLY_API_KEY: undefined
          }
        });
        console.log('[Shared Setup] Build completed.');
      } finally {
        // Restore .env file
        if (fs.existsSync(envBackup)) {
          fs.renameSync(envBackup, envFile);
        }
      }
    }
    
    // Find free port
    const getPortModule = await import('get-port');
    const getPort = getPortModule.default;
    webServerPort = await getPort();
    console.log(`[Shared Setup] Using port: ${webServerPort}`);
    
    // Start web server
    const { spawn } = await import('node:child_process');
    webServerProcess = spawn('npx', ['vite', 'preview', '--port', webServerPort.toString(), '--strictPort'], {
      stdio: 'pipe',
      cwd: EXAMPLE_DIR
    });
    
    // Capture server output (suppress unless debugging)
    webServerProcess.stdout?.on('data', (data: Buffer) => {
      if (process.env.DEBUG_WEB_SERVER) {
        console.log(`[Web Server]: ${data.toString().trim()}`);
      }
    });
    
    webServerProcess.stderr?.on('data', (data: Buffer) => {
      console.error(`[Web Server ERR]: ${data.toString().trim()}`);
    });
    
    // Handle unexpected exit
    webServerProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`[Shared Setup] Web server exited unexpectedly with code ${code}`);
      }
      webServerProcess = null;
      webServerUrl = null;
      webServerPort = null;
    });
    
    webServerUrl = `http://localhost:${webServerPort}`;
    await waitForServer(webServerUrl);
    console.log(`[Shared Setup] Web server started at ${webServerUrl}`);
  })();
  
  await setupPromise;
  setupPromise = null;
  return webServerUrl!;
}

export async function teardownWebServer(): Promise<void> {
  // If already tearing down, wait for it
  if (teardownPromise) {
    await teardownPromise;
    return;
  }
  
  // If not set up, nothing to do
  if (!webServerProcess) {
    return;
  }
  
  teardownPromise = (async () => {
    console.log('[Shared Setup] Tearing down web server...');
    
    if (webServerProcess) {
      webServerProcess.kill('SIGTERM');
      
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (webServerProcess) {
          webServerProcess.on('exit', () => resolve());
          setTimeout(() => resolve(), 2000); // Timeout after 2s
        } else {
          resolve();
        }
      });
      
      webServerProcess = null;
      webServerUrl = null;
      webServerPort = null;
      console.log('[Shared Setup] Web server stopped.');
    }
  })();
  
  await teardownPromise;
  teardownPromise = null;
}

export function getWebServerUrl(): string | null {
  return webServerUrl;
}

// Register cleanup on process exit
process.on('exit', () => {
  if (webServerProcess) {
    webServerProcess.kill('SIGTERM');
  }
});

process.on('SIGINT', () => {
  if (webServerProcess) {
    webServerProcess.kill('SIGTERM');
  }
  process.exit(1);
});

process.on('SIGTERM', () => {
  if (webServerProcess) {
    webServerProcess.kill('SIGTERM');
  }
  process.exit(0);
});