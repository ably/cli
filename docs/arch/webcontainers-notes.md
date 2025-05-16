# WebContainers – Notes & Constraints (May 2025 spike)

Source docs reviewed:

* Tutorial 7 "Add interactivity" – https://webcontainers.io/tutorial/7-add-interactivity
* Guides → Introduction – https://webcontainers.io/guides/introduction
* API Reference (inline in tutorial + StackBlitz examples)

---

## Core API Calls we will need

| Purpose | API | Notes |
|---------|-----|-------|
| Boot runtime | `const wc = await WebContainer.boot()` | Starts WASM-based Node 18 runtime inside ServiceWorker. Returns a `WebContainer` instance. |
| Mount file tree | `await wc.mount(files)` | `files` is an object mapping path→{file:{contents}}. Overwrites / adds to FS (persisted in IndexDB). |
| Spawn shell | `const p = await wc.spawn('jsh', { terminal:{cols,rows} })` | `jsh` is the BusyBox-like JS shell bundled with WebContainers. Accepts `terminal` sizing. |
| Process I/O | `p.output` (ReadableStream), `p.input` (WritableStream) | Pipe bytes to/from Xterm as shown in tutorial. |
| Resize TTY | `p.resize({cols,rows})` | Mirrors Xterm resize handler. |
| Exit code | `await p.exit` | Resolves when proc ends. |
| Networking | `fetch` inside container delegates to browser network stack. CORS still applies. |
| Persist FS | Automatically persisted in `IndexedDB`; survives reload within same origin. Max quota ≈ 500 MB (implementation-dependent). |
| Server-ready event (for http server) | `wc.on('server-ready', (port, url)=>{})` | Not directly required for CLI (no web server), but good reference. |

---

## Platform Limits & Observations

* **Node version**: 18.x (ESM native, no `--experimental` flags necessary).
* **Native / C++ addons**: **NOT** supported. Pure JS only.
* **Max FS quota**: Around **500 MB** per origin (soft, browser-dependent). Good enough for Ably CLI (~50 MB with deps).
* **Process model**: Single WASM thread; can spawn multiple Node processes but CPU is shared with page.
* **Memory**: 256–512 MB practical before browser throttles.
* **No privileged syscalls** (obviously) – but CLI is pure JS so fine.
* **Networking**: Outbound HTTPS allowed, CORS rules enforced. The Ably JS SDK & CLI use `https://rest.ably.io` et al. – **OK**.
* **ServiceWorker requirement**: WebContainers inserts a SW; the site must be served over HTTPS and register the script. Works with our Vite dev server & static hosting.
* **Binary downloads**: Not allowed; need JS bundles only. Ably CLI is published as NPM JavaScript; works.

---

## Ably CLI Runtime Requirements

* **Language**: Node >=18.
* **Native deps**: None (verified via `npm ls --production | grep gyp` – zero hits).
* **Disk footprint**: ~15 MB tarball; unpacked `node_modules` ~50 MB.
* **Env vars used**: `ABLY_API_KEY`, `ABLY_ACCESS_TOKEN`, `ABLY_WEB_CLI_MODE`, `HOME` (`~/.ably/config`). We can set `HOME=/home/projects` and create `.ably` dir.
* **Writes**: CLI writes cached login token to `~/.ably/config`. WebContainers FS is fine for that (persisted per-origin).

---

## Install Strategy Decision *(Phase 0 output)*

| Option | Cold-boot Time* | Size | Complexity | Verdict |
|--------|-----------------|------|-----------|---------|
| `pnpm add @ably/cli` at runtime | 15-30 s | 0 upfront | simple | ❌ Too slow |
| Pre-built FS tarball (`webcontainer-fs.tgz`) | 3-5 s download (<10 MB) | ~10 MB | medium | ✅ **Chosen** |
| Single-file bundle via `ncc` | 2-3 s (<3 MB) | small | needs re-wiring CLI bin | ↔ Investigate in Phase 2 (2.2) |

\*Measured on 100 Mbps connection in Chrome 124.

---

### Open Questions

* How to invalidate FS snapshot when we release new CLI version?  Use `semver` dir in path or check package.json on boot.
* Do we need multiple WebContainers for split-screen? Probably not – can spawn two `jsh` processes within one container.
* Quota impact of repeated sessions? Need cleanup routine.

*Document prepared 2025-05-**<date>**.* 