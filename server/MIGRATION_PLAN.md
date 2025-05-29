# Server Migration Plan - Phase 1 Complete

## Component Categorization

### ✅ MOVED TO SERVER (Phase 1 Complete)

#### Core Server Files
- **`scripts/terminal-server.ts`** → `server/src/terminal-server.ts`
  - Main WebSocket server (1713 lines)
  - Will be refactored into modular components in Phase 2

- **`scripts/session-utils.ts`** → `server/src/utils/session-utils.ts`
  - Session credential hashing utilities

- **`scripts/diagnostics-server.ts`** → `server/src/diagnostics-server.ts`
  - Server diagnostic utilities

#### Docker/Container Components
- **`docker/`** → `server/docker/`
  - `seccomp-profile.json` - Security profile
  - `apparmor-profile.conf` - AppArmor configuration
  - `enhanced-restricted-shell.sh` - Container shell script
  - `security-monitor.sh` - Security monitoring
  - `network-security.sh` - Network configuration
  - `install-apparmor.sh` - AppArmor installation
  - `run-ably-command.sh` - Command execution
  - `test-dockerfile` - Testing Dockerfile
  - `test-security.sh` - Security testing
  - `README.md` - Docker documentation

#### Server Scripts
- **`scripts/setup-terminal-server.sh`** → `server/scripts/setup-server.sh`
  - Server deployment and setup script (400 lines)

- **`scripts/run-dev-container.sh`** → `server/scripts/run-dev-container.sh`
  - Development container runner

- **`scripts/diagnostics-container.sh`** → `server/scripts/diagnostics-container.sh`
  - Container diagnostic utilities

- **`scripts/run-web-mode-cli.sh`** → `server/scripts/run-web-mode-cli.sh`
  - Web CLI mode execution script

#### Server Tests
- **`test/integration/terminal-server.test.ts`** → `server/tests/integration/terminal-server.test.ts`
  - Basic terminal server integration tests

- **`test/integration/docker-container-security.test.ts`** → `server/tests/integration/docker-container-security.test.ts`
  - Docker security feature tests

- **`test/unit/scripts/placeholder-cleanup.test.ts`** → `server/tests/unit/placeholder-cleanup.test.ts`
  - Terminal server session cleanup tests

- **`test/unit/scripts/session-resume.test.ts`** → `server/tests/unit/session-resume.test.ts`
  - Session resumption logic tests

### ❌ STAYS IN MAIN REPOSITORY (Client-Side)

#### React Component Package
- **`packages/react-web-cli/`** - Complete package
  - `src/AblyCliTerminal.tsx` - Main React component
  - `src/AblyCliTerminal.test.tsx` - Component unit tests
  - `src/global-reconnect.ts` - Client-side reconnection logic
  - `src/TerminalOverlay.tsx` - UI overlay component
  - All other React component files

#### Example Application
- **`examples/web-cli/`** - Complete example
  - `src/App.tsx` - Example React app
  - `tests/` - Playwright browser tests (will be updated to use web-cli.ably.com)

#### CLI Components (Not Server-Related)
- **`scripts/postinstall-welcome.ts`** - CLI installation welcome message
- **`scripts/run-tests.sh`** - General test runner (not server-specific)
- **`scripts/lint-test-paths.sh`** - General linting (not server-specific)

#### CLI Source Code
- **`src/`** - All CLI source code remains
- **`test/unit/commands/`** - CLI command tests
- **`test/integration/`** - CLI integration tests (non-server)
- **`test/e2e/core/`** - CLI end-to-end tests

### 🔄 WEB CLI TESTS TO BE UPDATED

The following tests currently depend on a local server but will be updated to use `web-cli.ably.com`:

#### Example Tests (Playwright)
- **`examples/web-cli/tests/`** - All Playwright tests
  - `error-overlay.spec.ts`
  - `reconnection.spec.ts`
  - `prompt-integrity.spec.ts`
  - `session-resume.spec.ts`
  - `web-cli.spec.ts`
  - `reconnection-diagnostic.spec.ts`

#### E2E Web CLI Tests
- **`test/e2e/web-cli/`** - Currently server-dependent
  - `web-cli.test.ts` - Will test against public endpoint
  - `reconnection.test.ts` - Will test against public endpoint
  - `session-resume.test.ts` - Will test against public endpoint
  - `prompt-integrity.test.ts` - Will test against public endpoint
  - `reconnection-diagnostic.test.ts` - Will test against public endpoint

#### CLI Diagnostics Test
- **`test/e2e/core/diagnostics.test.ts`** - References terminal server, will be updated

## Phase 1 Results

### Directory Structure Created
```
server/
├── README.md                           ✅ Created
├── MIGRATION_PLAN.md                  ✅ Created
├── src/                               ✅ Created
│   ├── terminal-server.ts             ✅ Copied
│   ├── diagnostics-server.ts          ✅ Copied
│   ├── types/                         ✅ Created (empty)
│   ├── services/                      ✅ Created (empty)
│   ├── middleware/                    ✅ Created (empty)
│   ├── utils/                         ✅ Created
│   │   └── session-utils.ts           ✅ Copied
│   └── config/                        ✅ Created (empty)
├── docker/                            ✅ Copied complete
├── scripts/                           ✅ Created
│   ├── setup-server.sh                ✅ Copied
│   ├── run-dev-container.sh           ✅ Copied
│   ├── diagnostics-container.sh       ✅ Copied
│   └── run-web-mode-cli.sh            ✅ Copied
└── tests/                             ✅ Created
    ├── unit/                          ✅ Created
    │   ├── placeholder-cleanup.test.ts ✅ Copied
    │   └── session-resume.test.ts      ✅ Copied
    ├── integration/                   ✅ Created
    │   ├── terminal-server.test.ts     ✅ Copied
    │   └── docker-container-security.test.ts ✅ Copied
    └── e2e/                          ✅ Created (empty)
```

## Next Steps (Phase 2)

1. **Create server package.json** with appropriate dependencies
2. **Create server tsconfig.json** with proper TypeScript configuration
3. **Refactor terminal-server.ts** into modular components:
   - `services/websocket-server.ts`
   - `services/docker-manager.ts`
   - `services/session-manager.ts`
   - `services/auth-service.ts`
   - `utils/stream-handler.ts`
   - `services/security-service.ts`
   - `config/server-config.ts`
4. **Update import paths** in copied tests
5. **Verify Docker functionality** from new location

## Current Status

✅ **Phase 1 Complete**: All server-related code has been identified, categorized, and copied to the `server/` directory. The original files remain in place to ensure no breaking changes.

🔄 **Ready for Phase 2**: Server code can now be refactored in isolation within the `server/` directory. 