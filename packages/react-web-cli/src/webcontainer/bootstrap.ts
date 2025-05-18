import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
// We will lazily import fflate only in the browser context where snapshot loading runs.
type UntarFn = (buf: Uint8Array, cb: (name: string, data: Uint8Array) => void) => void;

let gunzipSync: (b: Uint8Array) => Uint8Array;
let strFromU8: (a: Uint8Array) => string;
let untarSync: UntarFn;

async function ensureFflate() {
  if (gunzipSync !== undefined) return;
  // eslint-disable-next-line @typescript-eslint/await-thenable
  const mod: any = await import('fflate');
  gunzipSync = mod.gunzipSync;
  strFromU8 = mod.strFromU8;
  untarSync = mod.untarSync ?? mod.untar; // fallback
}

export interface BootstrapResult {
  webcontainer: WebContainer;
  process: WebContainerProcess;
  /** Write raw data to the running shell */
  write: (data: string | Uint8Array) => void;
  /** Resize the TTY columns & rows */
  resize: (cols: number, rows: number) => void;
}

export interface BootstrapOptions {
  cols?: number;
  rows?: number;
  /** Called whenever the shell emits output bytes. */
  onOutput?: (data: string) => void;
  /** Optional environment variables to inject */
  env?: Record<string, string>;
}

let wcPromise: Promise<WebContainer> | null = null;

async function getWebContainer(): Promise<WebContainer> {
  if (wcPromise) return wcPromise;
  const { WebContainer } = await import('@webcontainer/api');
  wcPromise = WebContainer.boot();
  return wcPromise;
}

// No pre-baked snapshot – we install @ably/cli at runtime.  Keeping helper
// around for potential future snapshot support (returning empty FS for now).
async function loadSnapshot(): Promise<Record<string, { file: { contents: string } }>> {
  return {};
}

/**
 * Boot a StackBlitz WebContainer instance and launch an interactive `jsh` shell.
 * The returned helper exposes `write` and `resize` utilities so the caller can
 * hook it up to an Xterm.js instance.
 */
export async function bootstrapShell(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const { cols = 80, rows = 24, onOutput, env = {} } = options;

  const wc = await getWebContainer();

  // 2) Attempt binary snapshot fast-path (.wcs)
  try {
    const resp = await fetch('/assets/ably.wcs');
    if (!resp.ok) throw new Error('no snapshot');
    const buf = new Uint8Array(await resp.arrayBuffer());
    await wc.mount(buf);
  } catch {
    // Fallback: minimal fs + npm install (very slow but ensures dev works)
    const fallbackFs = {
      'package.json': {
        file: { contents: '{"name":"ably-webcli-fallback","private":true}' },
      },
    } as Parameters<WebContainer['mount']>[0];
    await wc.mount(fallbackFs);

    // Install @ably/cli inside WebContainer (cold boot ~2-3 s, warm <1 s)
    const installProc = await wc.spawn('npm', [
      'install', '--omit=dev', '--no-audit', '--no-fund', '@ably/cli'],
      { terminal: { cols, rows } });
    await installProc.exit;
  }

  // 3) Spawn the shell (`jsh` is built-in). We pass env vars for credentials.
  const spawnStart = performance.now();
  const proc = await wc.spawn('jsh', {
    terminal: {
      cols,
      rows,
    },
    env,
  });

  // 4) Pipe stdout/stderr to callback
  if (onOutput) {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    proc.output.pipeTo(
      new WritableStream({
        write(chunk) {
          onOutput(chunk as unknown as string);
        },
      }),
    );
  }

  // Single writer for session to avoid locking errors
  const writer = proc.input.getWriter();

  return {
    webcontainer: wc,
    process: proc,
    write(data) {
      writer.write(data as any);
    },
    resize(newCols, newRows) {
      try {
        // Some processes may be in exited state; ignore failures
        // eslint-disable-next-line @typescript-eslint/await-thenable
        Promise.resolve(proc.resize({ cols: newCols, rows: newRows })).catch(() => {});
      } catch {
        /* ignore */
      }
    },
  };
} 