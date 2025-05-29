# Server Migration Plan - Phase 2 Complete

## Component Categorization

### ✅ MOVED TO SERVER (Phase 1 Complete)

#### Core Server Files
- **`scripts/terminal-server.ts`** → `server/src/terminal-server.ts`
  - ✅ Main WebSocket server (1713 lines) - **REFACTORED IN PHASE 2**

- **`scripts/session-utils.ts`** → `server/src/utils/session-utils.ts`
  - ✅ Session credential hashing utilities

- **`scripts/diagnostics-server.ts`** → `server/src/diagnostics-server.ts`
  - ✅ Server diagnostic utilities

#### Docker/Container Components
- **`docker/`** → `server/docker/`
  - ✅ `seccomp-profile.json` - Security profile
  - ✅ `apparmor-profile.conf` - AppArmor configuration
  - ✅ `enhanced-restricted-shell.sh` - Container shell script
  - ✅ `security-monitor.sh` - Security monitoring
  - ✅ `network-security.sh` - Network configuration
  - ✅ `install-apparmor.sh` - AppArmor installation
  - ✅ `run-ably-command.sh` - Command execution
  - ✅ `test-dockerfile` - Testing Dockerfile
  - ✅ `test-security.sh` - Security testing
  - ✅ `README.md` - Docker documentation

#### Server Scripts
- **`scripts/setup-terminal-server.sh`** → `server/scripts/setup-server.sh`
  - ✅ Server deployment and setup script (400 lines)

- **`scripts/run-dev-container.sh`** → `server/scripts/run-dev-container.sh`
  - ✅ Development container runner

- **`scripts/diagnostics-container.sh`** → `server/scripts/diagnostics-container.sh`
  - ✅ Container diagnostic utilities

- **`scripts/run-web-mode-cli.sh`** → `server/scripts/run-web-mode-cli.sh`
  - ✅ Web CLI mode execution script

#### Server Tests
- **`test/integration/terminal-server.test.ts`** → `server/tests/integration/terminal-server.test.ts`
  - ✅ Basic terminal server integration tests - **UPDATED FOR PHASE 2**

- **`test/integration/docker-container-security.test.ts`** → `server/tests/integration/docker-container-security.test.ts`
  - ✅ Docker security feature tests - **UPDATED FOR PHASE 2**

- **`test/unit/scripts/placeholder-cleanup.test.ts`** → `server/tests/unit/placeholder-cleanup.test.ts`
  - ✅ Terminal server session cleanup tests - **UPDATED FOR PHASE 2**

- **`test/unit/scripts/session-resume.test.ts`** → `server/tests/unit/session-resume.test.ts`
  - ✅ Session resumption logic tests - **UPDATED FOR PHASE 2**

### ✅ REFACTORED IN PHASE 2 (Complete)

The monolithic `terminal-server.ts` (1713 lines) has been successfully refactored into clean, modular components:

#### Type Definitions
- **`server/src/types/docker.types.ts`** - Docker container and event types
- **`server/src/types/session.types.ts`** - Session management types
- **`server/src/types/websocket.types.ts`** - WebSocket message types

#### Configuration
- **`server/src/config/server-config.ts`** - Centralized server configuration

#### Utilities
- **`server/src/utils/logger.ts`** - Centralized logging
- **`server/src/utils/session-utils.ts`** - Session credential hashing (moved)
- **`server/src/utils/stream-handler.ts`** - Terminal I/O and container attachment

#### Services
- **`server/src/services/auth-service.ts`** - JWT token validation
- **`server/src/services/docker-manager.ts`** - Container lifecycle management
- **`server/src/services/security-service.ts`** - AppArmor, seccomp, network security
- **`server/src/services/session-manager.ts`** - Session lifecycle and monitoring
- **`server/src/services/websocket-server.ts`** - WebSocket server orchestration

#### Entry Point
- **`server/src/index.ts`** - Main entry point with startup logic

#### Configuration Files
- **`server/package.json`** - Server dependencies and scripts
- **`server/tsconfig.json`** - TypeScript configuration

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

### 🔄 WEB CLI TESTS TO BE UPDATED (Phase 4)

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

## Current Status

### ✅ **Phase 1 Complete**: Server Code Identification and Organization
- All server-related code identified and copied to `server/` directory
- Proper directory structure established
- No breaking changes to existing codebase

### ✅ **Phase 2 Complete**: Server Code Refactoring
- Monolithic `terminal-server.ts` broken into 13 focused modules
- Clear separation of concerns established
- All tests updated with new import paths
- Server can now be developed independently
- Clean, maintainable architecture achieved

### ✅ **Phase 3 Complete**: Server Code Migration
- Removed old server files from main repository scripts/ directory
- Updated all test imports to use new modular server structure
- Updated TypeScript and ESLint configurations
- Updated server setup script for new architecture
- All linting, building, and testing passes
- Server and client code fully separated

### 🔄 **Ready for Phase 4**: Update client tests to use public endpoint
- Update example tests to use `web-cli.ably.com`
- Update React component tests to use public endpoint
- Ensure client tests have no server dependencies

### 📋 **Future Phases**
- **Phase 5**: Final cleanup and CI/CD updates

## Phase 2 Results

### Directory Structure Created
```