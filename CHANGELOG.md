# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.3] - 2024-07-09

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

## [0.3.2] - 2024-07-04

### Added

- Support for `--verbose` logging flag.
- MCP Server section to `README.md`.

### Fixed

- Formatting in `Product-Requirements.md`.

## [0.3.1] - 2024-07-01

### Added

- Experimental Model Context Protocol (MCP) server (`src/mcp/mcp-server.ts`).

### Fixed

- Bug in Control API access for MCP server.
- Dependency update (vite 6.2.4 to 6.2.5).

## [0.3.0] - 2024-07-01 (No tag found, inferred from commits)

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

## [0.2.6] - 2024-06-17

### Added

- `ably apps switch` command.

### Changed

- Improved handling of missing API keys and access tokens.

### Fixed

- Added missing `switch` command to `ably apps` topic help.

## [0.2.5] - 2024-06-17

### Added

- Screenshot to `README.md`.

### Changed

- Improved welcome screen with ASCII logo and colorization.

### Fixed

- Ensured alias commands show errors for invalid requests.

## [0.2.4] - 2024-06-17

### Added

- Ably AI Agent integration (`ably help ask`).
- Support for follow-up questions (`--continue`) with the AI agent.
- `ably help contact`, `ably help support`, `ably help status` commands.

### Changed

- Ensured consistent help output when topic commands are called without subcommands.
- Improved alias handling and error display for invalid commands.

### Fixed

- Ensured `--control-host` argument works for all commands.
- Replaced colons with spaces in `ably channels occupancy` and `ably channels presence` command examples/help.

## [0.2.3] - 2024-06-06

### Added

- `ably spaces list` command.

## [0.2.2] - 2024-06-06

### Changed

- Improved UX for Channel Rules commands.

## [0.2.1] - 2024-06-06

### Added

- Remaining Control API commands (integrations, queues, app settings like APNS).

## [0.2.0] - 2024-06-06

### Added

- Full Ably Spaces command support (`ably spaces members`, `locations`, `cursors`, `locks`).

### Changed

- Upgraded `ably-js` dependency.

### Fixed

- Graceful handling of subscriptions on termination.

## [0.1.5] - 2024-06-06

### Added

- `ably channels batch-publish` command.
- `ably rooms occupancy`, `presence`, and `reactions` commands.
- Commands for issuing and revoking Ably Tokens and JWTs (`ably auth issue-ably-token`, `issue-jwt-token`, `revoke-token`).

### Changed

- Improved UX for `ably apps delete` and `ably apps create`.

## [0.1.4] - 2024-06-06

### Changed

- Allowed singular topic names as aliases (e.g., `ably app list` works like `ably apps list`).
- Improved live stats UI for subscribe commands.
- Improved Cursor rules.

### Fixed

- Bug preventing non-alphanumeric characters in account aliases.

## [0.1.3] - 2024-06-06

### Added

- Support for subscribing to all live and historical log streams (`ably logs ...`).

### Fixed

- Warning about installation issues due to `ably-js` typing problems (at the time).

## [0.1.2] - 2024-06-06

### Changed

- Reduced minimum required Node.js version to 18+.

## [0.1.1] - 2024-06-06

### Changed

- Updated `README.md` and added version badge.

## [0.1.0] - 2024-06-06

### Added

- Initial release candidate for NPM.
- Benchmarking commands (`ably bench publisher`, `subscriber`).
- Multi-publish support (`--count`, `--delay`) for `ably channels publish`.
- Initial Ably Chat Rooms commands (`ably rooms messages send/subscribe/get`).
- Ably Pub/Sub Presence support (`ably channels presence enter/subscribe`).
- Configuration management (`~/.ably/config`, `ably config` command).
- Account management (`ably accounts login/list/logout/current/stats/switch`).
- App management via Control API (`ably apps list/create/update/delete/stats/switch/current`, channel rules).
- API Key management (`ably auth keys list/revoke/get/update/switch/current`).
- Channel commands (`ably channels list/publish/subscribe/occupancy/history`).
- Basic connection testing (`ably connections test`).
- Initial project setup with oclif.
- Basic documentation (`README.md`, `Product-Requirements.md`).
- Cursor rules.

### Fixed

- Various initial bugs and build issues.
- Ensured app and current key stored correctly in config.
- Clean builds enforced.
