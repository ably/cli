import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

// For ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const EXAMPLE_DIR = path.resolve(__dirname, '../../../examples/web-cli');
// Terminal server is now hosted externally at wss://web-cli.ably.com

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