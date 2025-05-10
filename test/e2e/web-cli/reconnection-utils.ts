import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

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

async function waitForPortFree(port: number, timeout = 10000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (Date.now() - start > timeout) {
      throw new Error(`Port ${port} did not free within ${timeout}ms`);
    }

    const isFree = await new Promise<boolean>((resolve) => {
      const tester = net
        .createServer()
        .once('error', () => resolve(false))
        .once('listening', () => {
          tester.close();
          resolve(true);
        })
        .listen(port, '127.0.0.1');
    });

    if (isFree) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function waitForProcessExit(proc: ChildProcess, timeout = 15000): Promise<void> {
  if (proc.exitCode !== null) return; // already exited
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore error if already dead */ }
      resolve();
    }, timeout);
    proc.once('exit', () => { clearTimeout(timer); resolve(); });
  });
}

export async function stopTerminalServer(proc: ChildProcess | null, port?: number): Promise<void> {
  if (!proc) return;
  try { proc.kill('SIGTERM'); } catch { /* ignore if process already exited */ }
  await waitForProcessExit(proc);

  if (port) {
    try { await waitForPortFree(port, 10000); } catch { /* ignore */ }
  }
}

export async function stopWebServer(proc: ChildProcess | null): Promise<void> {
  if (!proc) return;
  try { proc.kill('SIGTERM'); } catch { /* ignore if process already exited */ }
  await waitForProcessExit(proc);
} 