# Workplan: WebContainers Spike for React Web CLI

This plan outlines an **exploratory spike** to determine whether the React Web CLI can run **entirely in-browser** using **StackBlitz WebContainers** instead of relying on the server-hosted Docker `terminal-server.ts`.  The primary objective is to prove technical feasibility, identify blockers, and gather metrics (startup time, bundle size, memory / CPU, limits).

**Advantages we hope to validate**

1. Zero server resources – no Docker host to maintain.
2. Security – user code executes inside the browser sandbox.
3. Simpler deployment architecture (static CDN + WASM runtime).
4. Potential offline usage once assets are cached.

**Non-goals for this spike**

* Feature-parity or production-ready polish.
* Comprehensive test-coverage or CI integration.
* Migration of existing E2E / unit tests – only minimal PoC validation.

> **Success criteria:** A demo page in `examples/web-cli` that, when opened, spawns a WebContainer, installs or loads the Ably CLI, and yields an interactive shell in the existing `AblyCliTerminal` component with no server connection required.

---

## Phase 0 – Background Research (1 day)

| Step | Task | Outcome |
|------|------|---------|
| 0.1 | **Deep-dive into current implementation** – Read `scripts/terminal-server.ts`, `packages/react-web-cli`, `examples/web-cli`. Diagram data-flow (WebSocket ↔ Docker TTY ↔ Xterm) and identify Docker assumptions (env vars, file system, TTY resize). | ✅ Diagram created at `docs/architecture/webcli-current.mmd` |
| 0.2 | **Study WebContainers docs & sample** – Tutorial 7 "Add interactivity" <https://webcontainers.io/tutorial/7-add-interactivity>, Guides intro <https://webcontainers.io/guides/introduction>.  Enumerate API surface (boot, mount, spawn, jsh shell, files snapshot, process API, limitations – 500 MB FS, Node 18). | ✅ Notes recorded in `docs/arch/webcontainers-notes.md` |
| 0.3 | **Identify CLI runtime requirements** – Node version, native deps (none), env vars (`ABLY_API_KEY`, `ABLY_ACCESS_TOKEN`), binary size (~15 MB).  Decide on install strategy: *npm install* inside container vs. mount pre-packed `node_modules`. | ✅ Requirements & decision logged in notes (pre-bundled FS chosen) |

---

## Phase 1 – Minimal WebContainer Boot (1 day)

| Step | Task |
|------|------|
| 1.1 | Create new util `packages/react-web-cli/src/webcontainer/bootstrap.ts` that: <br>• awaits `WebContainer.boot()` <br>• mounts an in-memory file tree containing a minimal `package.json` with `@ably/cli` as dependency (initially empty). <br>• spawns `jsh` and pipes stdio to callbacks. |
| 1.2 | Add lightweight **feature flag** (`useWebContainer` boolean prop) to `AblyCliTerminal`.  When enabled, skip WebSocket logic and instead invoke WebContainer bootstrap.
| 1.3 | Re-use existing `Xterm.js` piping logic from the tutorial: connect terminal onData → `process.input.write`, and container output → `terminal.write`.
| 1.4 | Hard-code credentials (API Key, token) via `process.env` when spawning shell for now; pass from React props later.
| 1.5 | Verify manual commands like `node -v`, `npx ably --version` work in browser.

Deliverable: screen-capture gif stored in `docs/workplans/resources/webcontainers-spike-poc.gif`.

---

## Phase 2 – Fast Startup Strategy (2 days)

The npm install inside WebContainer can take 15-30 s which is not acceptable UX.  We will experiment with two acceleration techniques.

| Step | Task |
|------|------|
| 2.1 | **Pre-bundled FS snapshot** – Locally run a build script (`scripts/build-webcontainer-fs.ts`) that:<br>• creates a temp WebContainer<br>• `pnpm add @ably/cli`<br>• zips the entire `.wc` FS to `assets/webcontainer-fs.tgz`.<br>The React app then fetches & `untar` this tarball into the container on first boot (~3-5 s download, <10 MB compressed). |
| 2.2 | **ESBuild single-file bundle** – Explore packaging Ably CLI as a single JS file (using `pkg` or `ncc`) and copy it directly (no `node_modules`).  Measure size and startup time. |
| 2.3 | Record metrics (cold boot, warm boot, memory) for each method in `docs/workplans/resources/webcontainers-metrics.csv` and choose the winner.  Target ≤ 5 s cold boot on 100 Mbps link. |

---

## Phase 3 – Integration with Existing React Component (1 day)

| Step | Task |
|------|------|
| 3.1 | Extend `AblyCliTerminal` props: `mode: "docker" | "webcontainer"` (default `docker`).  Preserve backwards compatibility.
| 3.2 | Map existing connection status handling to WebContainer lifecycle:<br>• `connecting` – while booting + loading FS<br>• `connected` – when shell prompt ready<br>• `disconnected` – when WebContainer process exits or tab hidden (mirror existing visibility logic). |
| 3.3 | Wire terminal resize events (`onResize`) to `process.resize({cols, rows})`.
| 3.4 | Forward env credentials on every new container spawn (API key / token props).
| 3.5 | Remove / stub reconnection logic – for PoC, a WebContainer restart requires full page refresh; document limitation. |

---

## Phase 4 – PoC Validation & Limit Assessment (0.5 day)

1. Demo typical workflows: `ably help`, `ably channels publish demo "hi"`, `ably spaces create ...` (will fail due to CORS REST calls – record finding).
2. Stress-test: run 10 commands quickly, observe CPU / memory via Chrome devtools.
3. Identify blocked features – Control-API HTTPS requests must succeed; verify WebContainers network access (should work – outbound fetch proxied).  Capture any CORS issues.
4. Log open questions (file download, large output scrolling, sandbox limits, persistent FS across sessions).

Results captured in a spike report `docs/spikes/webcontainers-spike-2025-05.md`.

---

## Phase 5 – Decision & Next Steps (0.5 day)

* Evaluate against success criteria.
* If **viable**, draft follow-up workplan for production hardening (tests, split-screen, session persistence using IndexedDB, quota management, offline cache, security review).
* If **not viable**, document blockers (performance, network, package size) and fall back to Docker approach.

---

### Testing Strategy (minimal for spike)

* Manual smoke tests only – no automated CI.
* Basic Vitest unit for bootstrap util to assert that `WebContainer.boot` returns and `spawn('node', ['-v'])` outputs semver.
* Add perf measurements via `performance.now()` instrumentation (boot time, first prompt).

---

### Ownership & Checklist

* **Spike owner:** _<your name>_
* **Target completion:** **14 May 2025** (3 developer-days total).
* **Deliverables:** PoC demo url, metrics table, spike report, this workplan updated with findings.

| Status Key | Meaning |
|------------|---------|
| `[ ]` | Not started |
| `[~]` | In progress |
| `[x]` | Complete |

> Mark each step table row with status boxes during execution.

---

*Remember: this is an **exploratory spike** – embrace shortcuts but log every compromise so we can address them in a follow-up production workplan.* 