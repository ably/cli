# Server File History Removal List

This document contains all file paths (both old and new) that need to be removed from the git history of the main CLI repository for security reasons.

## Files Moved from Root to /server

### Dockerfile
- **Original Path**: `Dockerfile`
- **Server Path**: `server/Dockerfile`
- **Move Commit**: Part of commit `aafa92e` (refactor server: Final Cleanup and CI/CD Updates)

## Files Moved from /scripts to /server

### Terminal Server Files
- **Original Path**: `scripts/terminal-server.ts`
- **Server Path**: `server/src/terminal-server.ts`
- **Deleted in Commit**: `508bdf9` (refactor server: Migrate Server Code)

### Diagnostics Files
- **Original Path**: `scripts/diagnostics-server.ts`
- **Server Path**: `server/src/diagnostics-server.ts`
- **Deleted in Commit**: `508bdf9`

- **Original Path**: `scripts/diagnostics-container.sh`
- **Server Path**: `server/scripts/diagnostics-container.sh`
- **Deleted in Commit**: `508bdf9`

### Session Utilities
- **Original Path**: `scripts/session-utils.ts`
- **Server Path**: `server/src/utils/session-utils.ts`
- **Deleted in Commit**: `508bdf9`

### Setup and Run Scripts
- **Original Path**: `scripts/setup-terminal-server.sh`
- **Server Path**: `server/scripts/setup-server.sh`
- **Deleted in Commit**: `508bdf9`

- **Original Path**: `scripts/run-dev-container.sh`
- **Server Path**: `server/scripts/run-dev-container.sh`
- **Deleted in Commit**: `508bdf9`

- **Original Path**: `scripts/run-web-mode-cli.sh` (renamed from `scripts/test-web-cli.sh`)
- **Server Path**: `server/scripts/run-web-mode-cli.sh`
- **Deleted in Commit**: `508bdf9`

### Restricted Shell
- **Original Path**: `scripts/restricted-shell.sh`
- **Renamed to**: `docker/enhanced-restricted-shell.sh`
- **Server Path**: `server/docker/enhanced-restricted-shell.sh`

## Files Moved from /docker to /server/docker

All docker directory files were moved:
- **Original Path**: `docker/README.md`
- **Server Path**: `server/docker/README.md`

- **Original Path**: `docker/apparmor-profile.conf`
- **Server Path**: `server/docker/apparmor-profile.conf`

- **Original Path**: `docker/enhanced-restricted-shell.sh`
- **Server Path**: `server/docker/enhanced-restricted-shell.sh`

- **Original Path**: `docker/install-apparmor.sh`
- **Server Path**: `server/docker/install-apparmor.sh`

- **Original Path**: `docker/network-security.sh`
- **Server Path**: `server/docker/network-security.sh`

- **Original Path**: `docker/run-ably-command.sh`
- **Server Path**: `server/docker/run-ably-command.sh`

- **Original Path**: `docker/seccomp-profile.json`
- **Server Path**: `server/docker/seccomp-profile.json`

- **Original Path**: `docker/security-monitor.sh`
- **Server Path**: `server/docker/security-monitor.sh`

- **Original Path**: `docker/test-dockerfile`
- **Server Path**: `server/docker/test-dockerfile`

- **Original Path**: `docker/test-security.sh`
- **Server Path**: `server/docker/test-security.sh`

## Test Files Moved

### Integration Tests
- **Original Path**: `test/integration/terminal-server.test.ts`
- **Server Path**: `server/tests/integration/terminal-server.test.ts`

- **Original Path**: `test/e2e/core/diagnostics.test.ts`
- **Server Path**: `server/tests/integration/server-diagnostics.test.ts`
- **Rename Ratio**: 81% similarity

### Unit Tests
- **Original Path**: `test/unit/scripts/session-utils.test.ts`
- **Server Path**: `server/tests/unit/session-utils.test.ts`

- **Original Path**: `test/unit/scripts/session-resume.test.ts`
- **Server Path**: `server/tests/unit/session-resume.test.ts`

## Other Server-Related Files

### GitHub Workflows
- **Path**: `.github/workflows/terminal-server-tests.yml`

### Documentation
- **Path**: `docs/Server-Setup.md`
- **Path**: `docs/workplans/2025-05-terminal-server-improvements.md`

## Complete List of All Paths to Remove

```
# Root level files
Dockerfile
.dockerignore

# Scripts directory
scripts/terminal-server.ts
scripts/diagnostics-server.ts
scripts/diagnostics-container.sh
scripts/session-utils.ts
scripts/setup-terminal-server.sh
scripts/run-dev-container.sh
scripts/run-web-mode-cli.sh
scripts/test-web-cli.sh
scripts/restricted-shell.sh
scripts/run-load-tests.sh

# Docker directory (entire directory)
docker/
docker/README.md
docker/apparmor-profile.conf
docker/enhanced-restricted-shell.sh
docker/install-apparmor.sh
docker/network-security.sh
docker/run-ably-command.sh
docker/seccomp-profile.json
docker/security-monitor.sh
docker/test-dockerfile
docker/test-security.sh

# Test files
test/integration/terminal-server.test.ts
test/integration/docker-container-security.test.ts
test/e2e/core/diagnostics.test.ts
test/unit/scripts/session-utils.test.ts
test/unit/scripts/session-resume.test.ts
test/unit/scripts/placeholder-cleanup.test.ts

# GitHub workflows
.github/workflows/terminal-server-tests.yml
.github/workflows/container-security-tests.yml

# Documentation - Security and Server specific
docs/Server-Setup.md
docs/Container-Security.md
docs/Security-Hardening.md
docs/Security-Testing-Auditing.md
docs/User-Namespace-Remapping.md
docs/CI-Docker-Tests.md
docs/workplans/2025-05-terminal-server-improvements.md

# Server directory (entire directory and all contents)
server/

# Phase migration documents (if they exist in history)
PHASE_2_3_IMPLEMENTATION.md
MIGRATION_PLAN.md
```

## Key Migration Timeline

1. **Initial Server Directory Creation**: Commit `346d9de` (refactor server: Phase 1: Identify and Categorize Components)
   - Created initial server directory structure
   - Added initial server files directly to server directory

2. **Scripts Migration**: Commit `508bdf9` (refactor server: Migrate Server Code)
   - Deleted files from scripts directory
   - Files were already added to server directory in previous commits

3. **Server Refactoring**: Commit `e782756` (refactor server: Refactor terminal-server.ts)
   - Reorganized server structure
   - Split terminal-server.ts into multiple service files

4. **Final Removal**: Commit `8c0bdcc` (feat: Remove terminal server code for separation)
   - Removed entire server directory from main CLI repository

## Recommended Approach: Use git-filter-repo

To remove all these files from git history, we recommend using `git-filter-repo` which is faster and safer than the deprecated `git filter-branch`.

### Installation:
```bash
# macOS
brew install git-filter-repo

# Linux/Python
pip install git-filter-repo
```

### Execution:
A complete script (`scripts/phase4-history-rewrite.sh`) has been created that:
1. Creates a backup of the repository
2. Removes all server-related files from history
3. Scrubs sensitive commit messages
4. Adds a placeholder file
5. Prepares the repository for force push

**Note**: This is a destructive operation that rewrites git history. Make sure to:
1. Create a backup of the repository first (the script does this automatically)
2. Coordinate with all team members
3. Force push to all remote branches after filtering
4. All team members will need to re-clone the repository
5. Update or close any open pull requests as they will become invalid