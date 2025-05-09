import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// For ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const EXAMPLE_DIR = path.resolve(__dirname, '../../../examples/web-cli');
const TERMINAL_SERVER_SCRIPT = path.resolve(__dirname, '../../../dist/scripts/terminal-server.js');

// Helper function to wait for server startup
export async function waitForServer(url: string, timeout = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return; // Server is up
      }
    } catch {
      // Ignore fetch errors (server not ready)
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Server ${url} did not start within ${timeout}ms`);
}

export async function startTerminalServer(port: number): Promise<ChildProcess> {
  console.log('Starting terminal server...');
  // Run the compiled JS script directly with node
  const terminalServerProcess = spawn('node', [
    TERMINAL_SERVER_SCRIPT
  ], {
    env: {
      ...process.env,
      PORT: port.toString(),
      NODE_ENV: 'test',
      // Provide credentials for tests (use env vars if set)
      ABLY_API_KEY: process.env.E2E_ABLY_API_KEY || 'dummy.key:secret',
      ABLY_ACCESS_TOKEN: 'dummy-token',
      TS_NODE_PROJECT: 'tsconfig.json' // Ensure ts-node uses the correct config
    },
    stdio: 'pipe',
    // Need to run from the root to resolve paths correctly in server script
    cwd: path.resolve(__dirname, '../../..')
  });

  terminalServerProcess.stdout?.on('data', (data) => console.log(`[Terminal Server]: ${data.toString().trim()}`));
  terminalServerProcess.stderr?.on('data', (data) => console.error(`[Terminal Server ERR]: ${data.toString().trim()}`));
  await waitForServer(`http://localhost:${port}/health`);
  console.log('Terminal server started.');

  return terminalServerProcess;
}

export async function startWebServer(port: number): Promise<ChildProcess> {
  console.log('Starting web server for example app with vite preview...');
  // Use npx vite preview directly
  const webServerProcess = spawn('npx', ['vite', 'preview', '--port', port.toString(), '--strictPort'], {
    stdio: 'pipe',
    cwd: EXAMPLE_DIR // Run command within the example directory
  });

  webServerProcess.stdout?.on('data', (data) => console.log(`[Web Server]: ${data.toString().trim()}`));
  webServerProcess.stderr?.on('data', (data) => console.error(`[Web Server ERR]: ${data.toString().trim()}`));

  // Use the original waitForServer for the root URL with 'serve'
  await waitForServer(`http://localhost:${port}`);
  console.log('Web server started.');

  return webServerProcess;
}

export async function stopTerminalServer(process: ChildProcess): Promise<void> {
  if (process) {
    process.kill('SIGTERM');
  }
}

export async function stopWebServer(process: ChildProcess): Promise<void> {
  if (process) {
    process.kill('SIGTERM');
  }
} 