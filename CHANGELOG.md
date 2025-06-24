# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.1] - 2025-06-24

### Added

- Enhanced Web CLI mode restrictions with separate handling for authenticated and anonymous users
  - Authenticated users can now access control plane commands (e.g., `auth:keys:list`, `apps:list`)
  - Anonymous users are restricted from privacy-sensitive and authentication-required commands
- Wildcard pattern support for command restrictions (e.g., `config*`, `mcp*`)
- Clearer error messages that guide users to appropriate actions (login or install locally)

### Fixed

- Domain-scoped credential storage for enhanced security
- React Web CLI unit test failures
- CI reliability improvements around rate limits
- Web CLI mode now properly differentiates between authenticated and anonymous states

### Security

- Credentials are now properly scoped per domain, preventing cross-domain credential access
- Anonymous Web CLI users cannot access commands that might expose other users' activity

## [0.8.0] - 2025-06-20

### Changed

- Refactored client creation methods to provide type-specific alternatives
  - Deprecated `createAblyClient()` method in favor of:
    - `createAblyRestClient()` - Returns `Promise<Ably.Rest | null>`
    - `createAblyRealtimeClient()` - Returns `Promise<Ably.Realtime | null>`
  - This eliminates the need for type casting and improves type safety
  - All 50+ command files updated to use the appropriate method
  - All test files updated to match new method signatures

### Added

- Web CLI authentication support with credential validation UI
- Auto-update notifications to inform users about new CLI versions
- Auto-completion support for improved command discovery
- Standardized topic command display with `BaseTopicCommand`
- Restricted mode for Web CLI to handle anonymous users
- User agent header (`ably-cli`) in all data and control plane requests
- Reconnection attempt counter that resets on manual reconnect
- Line break between countdown and install instructions in reconnection display

### Fixed

- Presence CLI regression where commands were not working correctly
- Meta channel names for connection lifecycle logs (now use `[meta]connection.lifecycle`)
- Multi-line JSON handling in connection lifecycle tests
- E2E test failures for web-cli application with proper authentication scenarios
- Playwright E2E tests for rate limiting and server disconnection scenarios
- Credentials no longer baked into test builds
- Various linting errors across the codebase
- Consistent authentication recommendations when not logged in
- Help and list commands now have standardized output format

### Removed

- Obsolete TODO comments that have been completed
- Old test skip logic that was no longer needed

## [0.7.7] - 2025-06-14

### Fixed

- Updated React Web CLI README to reflect server separation
- Default to public CLI endpoint in development

### Changed

- Updated GitHub Actions to use checkout@v4
- Added release workflow for automated releases
- Updated CONTRIBUTING.md with release workflow documentation

## [0.7.6] - 2025-06-14

### Fixed

- Ensured README is properly visible in npm package

## [0.7.5] - 2025-06-14

### Fixed

- Explicitly linked to README in npm package configuration

## [0.7.4] - 2025-06-14

### Fixed

- Resolved npm package publishing issues

### Removed

- Cleaned up old Markdown files

## [0.7.3] - 2025-06-14

### Fixed

- Fixed global installs that were broken by npm link issues

## [0.7.2] - 2025-06-14

### Fixed

- Included README in npm package

## [0.7.1] - 2025-06-13

### Fixed

- Initial patch release after v0.7.0 with minor fixes

## [0.7.0] - 2025-06-13

### Security

- Fixed critical security vulnerabilities in dependencies:
  - Updated `brace-expansion` to 1.1.12+ and 2.0.2+ to fix ReDoS vulnerability
  - Updated `tar-fs` to 2.1.3+ to fix directory traversal vulnerability
  - Applied pnpm overrides to enforce secure versions across all transitive dependencies

### Changed

- **BREAKING**: Complete removal of all server-related code from git history
  - Git history has been rewritten to remove all traces of terminal server implementation
  - Repository size reduced by 71% (from 68MB to 20MB)
  - All old branches and tags that referenced server code have been removed
  - Contributors will need to re-clone the repository after this update

### Fixed

- Fixed environment-dependent test skips by correcting environment variable names
- Updated .env.example to remove obsolete variables
- Ensured all tests run consistently in CI environments

### Added

- Added placeholder file (server/REMOVED.md) to indicate server code has been moved
- Added comprehensive documentation for the server migration process

### Removed

- Removed all server-related files from git history including:
  - Server directory and all its contents
  - Docker configurations
  - Terminal server scripts
  - Server-specific tests and documentation
- Removed unnecessary test skip logic that was checking for environment variables

## [0.6.0] - 2025-06-12

### Changed

- **BREAKING**: Terminal server functionality has been moved to a separate private repository (`@ably/cli-terminal-server`).
  - Removed server-specific dependencies and configurations
  - Updated documentation to reflect the separation
  - Web CLI now connects to the production endpoint `wss://web-cli.ably.com` by default

### Added

- Instructions in CONTRIBUTING.md for Ably engineers to test against local terminal server

### Removed

- Server directory and all terminal server implementation code
- Server-related test files that were specific to server implementation

### Notes

- The terminal server is now maintained in a private repository
- Web CLI functionality remains fully operational using the production terminal server endpoint
- For local development against terminal server, see CONTRIBUTING.md

## [0.5.0] - 2024-05-15

### Added

- Enhanced Web CLI with improved connection status display and animations.
- Support for Docker container development with `pnpm dev:container`.
- Improved bench tooling for performance testing.
- Self-contained connection-status overlay with tests for Web CLI.
- Postinstall notice for better user experience.
- Support for `--filter` option to the pnpm test runner.
- Split-screen support planning in terminal.
- Defer first WebSocket connection until terminal is visible.
- Add inactivity timeout for web connections.
- New convenience development commands.

### Changed

- Improved UI styling and state persistence in Web CLI.
- Enhanced example UI with integrated CliDrawer component.
- Optimized prepare script to avoid redundant build steps.
- Improved specificity for terminal server connection resume functionality.
- Switched from npm to pnpm as the preferred package manager.
- Web CLI no longer reconnects automatically for idle connections.
- Silenced React terminal noise and added opt-in debug logging.

### Fixed

- Addressed numerous CI and build issues.
- Fixed flakey tests in various test suites.
- Resolved CPU issues with Ora spinner.
- Fixed restricted shell parsing error.
- Resolved history command issue with API key environment variable and silent failures.
- Fixed terminal issues related to color support in Docker containers.
- Improved reconnection stability.
- Fixed hijack messages leaking into terminal interface.
- Fixed TypeScript errors in Web CLI e2e tests.
- Made Docker capability tests compatible with different Docker API versions.
- Resolved React unit test drift from implementation.
- Fixed package mismatch issues.
- Removed messageId argument from room reactions.

## [0.4.0] - 2024-04-28

### Added

- Comprehensive AI Assistance guidelines (`.cursor/rules/AI-Assistance.mdc`).
- Mandatory development workflow definition (`.cursor/rules/Workflow.mdc`, `CONTRIBUTING.md`).
- Detailed `Debugging.md` and `Troubleshooting.md` guides in `docs/`.
- Formalized `CONTRIBUTING.md` in the root directory.

### Changed

- Significantly restructured and enhanced `docs/Testing.md` with clear strategies, examples, and folder structure.
- Refactored `.cursor/rules/` for clarity, consistency, and improved AI guidance.
- Updated `README.md` to link to new contribution and workflow documents.
- Standardized documentation file naming (`Title-Case-With-Hyphens.md`).
- Simplified `Product-Requirements.md`.

### Fixed

- Persistent failures in Web CLI Playwright E2E tests related to incorrect WebSocket URL usage (`examples/web-cli/src/App.tsx`).
- Corrected inaccurate release dates in previous `CHANGELOG.md` entries.
- Minor typos and formatting inconsistencies in documentation.

## [0.3.4] - 2025-04-20

### Added

- Apache 2.0 LICENSE file.
- Project Structure documentation.
- `.editorconfig` for IDE formatting consistency.
- Initial test strategy and proposed test coverage.

### Changed

- Improved terminal server with timestamps in logging.
- Enhanced error handling in `AblyCliTerminal.tsx`.
- Improved project documentation organization and clarity.
- Applied consistent formatting across all files via `.editorconfig`.

### Fixed

- Terminal server regressions following TypeScript/lint fixes.
- React mismatch issues in Web-CLI.
- Fixed variable redeclaration in `channel-rules/update.ts`.
- Ensured bottom line of terminal is always visible and resize works correctly.
- Fixed dependency issues in `package.json`.
- Various linting errors.

## [0.3.3] - 2025-04-19

### Fixed

- Dependency update (vite 6.2.4 to 6.2.6).
- Various linting issues and improvements across the codebase.
- Ensured test runs are supported with GitHub Actions.
- Improved consistency of `process.exit()` usage (using `this.exit()`).
- Fixed `unicorn/no-array-push-push` linting error.

### Added

- ESLint v9 compatibility and standardized configuration.
- Mocha support for testing framework.
- "Did you mean" functionality for command suggestions via `command_not_found` hook.

### Changed

- Updated oclif dependencies for consistency.

## [0.3.2] - 2025-04-14

### Added

- Support for `--verbose` logging flag.
- MCP Server section to `README.md`.

### Fixed

- Formatting in `Product-Requirements.md`.

## [0.3.1] - 2025-04-11

### Added

- Experimental Model Context Protocol (MCP) server (`src/mcp/mcp-server.ts`).

### Fixed

- Bug in Control API access for MCP server.
- Dependency update (vite 6.2.4 to 6.2.5).

## [0.3.0] - 2025-04-11

### Added

- React Web CLI component (`packages/react-web-cli`).
- Terminal server for Web CLI (`scripts/terminal-server.ts`).
- Example Web CLI implementation (`examples/web-cli`).
- Standardized stats display service (`src/services/stats-display.ts`).
- `--web-cli-help` command.

### Changed

- Standardized CLI command status reporting.
- Improved help command intuitiveness.
- Refactored handling of interactive commands and history in Web CLI.
- Updated Cursor rules to reference `Product-Requirements.md`.
- Improved build dependability.

### Fixed

- Various bugs related to Web CLI (Ctrl-C handling, prompt behavior, history).
- Prevented exit from terminal with Ctrl-C (SIGINT) in Web CLI server.

## [0.2.6] - 2025-04-01

### Added

- `ably apps switch` command.

### Changed

- Improved handling of missing API keys and access tokens.

### Fixed

- Added missing `switch` command to `ably apps` topic help.

## [0.2.5] - 2025-04-01

### Added

- Screenshot to `README.md`.

### Changed

- Improved welcome screen with ASCII logo and colorization.

### Fixed

- Ensured alias commands show errors for invalid requests.

## [0.2.4] - 2025-03-31

### Added

- Ably AI Agent integration (`ably help ask`).
- Support for follow-up questions (`--continue`) with the AI agent.
- `ably help contact`, `ably help support`, `ably help status` commands.

### Changed

- Ensured consistent help output when topic commands are called without subcommands.
- Improved alias handling and error display for invalid commands.

### Fixed

- Ensured `--control-host` argument works for all commands.
- Replaced colons with spaces in `ably channels occupancy` and `