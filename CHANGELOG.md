# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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