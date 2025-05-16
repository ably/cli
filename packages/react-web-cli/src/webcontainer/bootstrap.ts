import type { WebContainer, WebContainerProcess } from '@webcontainer/api';

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

/**
 * Boot a StackBlitz WebContainer instance and launch an interactive `jsh` shell.
 * The returned helper exposes `write` and `resize` utilities so the caller can
 * hook it up to an Xterm.js instance.
 */
export async function bootstrapShell(options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const { cols = 80, rows = 24, onOutput, env = {} } = options;

  const wc = await getWebContainer();

  // 2) Prepare minimal filesystem
  const files: Parameters<WebContainer['mount']>[0] = {
    'package.json': {
      file: {
        contents: JSON.stringify(
          {
            name: 'ably-webcli-spike',
            private: true,
            type: 'module',
            dependencies: {
              '@ably/cli': 'latest',
            },
          },
          null,
          2,
        ),
      },
    },
  };

  await wc.mount(files);

  // 3) Spawn the shell (`jsh` is built-in). We pass env vars for credentials.
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

  const writer = proc.input.getWriter();

  return {
    webcontainer: wc,
    process: proc,
    write(data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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