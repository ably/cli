#!/bin/bash
set -euo pipefail

# Phase 4: History Rewrite DRY RUN Script
# This script analyzes what would be removed without actually doing it

echo "=== Phase 4: History Rewrite DRY RUN ==="
echo "This will analyze files to be removed without modifying anything"
echo ""

# Check if git-filter-repo is installed
if ! command -v git-filter-repo &> /dev/null; then
    echo "ERROR: git-filter-repo is not installed!"
    echo "Please install it first:"
    echo "  brew install git-filter-repo  # macOS"
    echo "  pip install git-filter-repo   # Python"
    exit 1
fi

# Create paths file
cat > /tmp/paths-to-remove-dryrun.txt << 'EOF'
# Root level files
Dockerfile
.dockerignore

# Scripts directory - server files
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

# Test files - server specific
test/integration/terminal-server.test.ts
test/integration/docker-container-security.test.ts
test/e2e/core/diagnostics.test.ts
test/unit/scripts/session-utils.test.ts
test/unit/scripts/session-resume.test.ts
test/unit/scripts/placeholder-cleanup.test.ts

# GitHub workflows - server specific
.github/workflows/terminal-server-tests.yml
.github/workflows/container-security-tests.yml

# Documentation - server/security specific
docs/Server-Setup.md
docs/Container-Security.md
docs/Security-Hardening.md
docs/Security-Testing-Auditing.md
docs/User-Namespace-Remapping.md
docs/CI-Docker-Tests.md
docs/workplans/2025-05-terminal-server-improvements.md

# Server directory (entire directory and all contents)
server/

# Phase migration documents
PHASE_2_3_IMPLEMENTATION.md
MIGRATION_PLAN.md
EOF

echo "Files that would be removed from history:"
echo "=========================================="
cat /tmp/paths-to-remove-dryrun.txt | grep -v '^#' | grep -v '^$'

echo ""
echo "Analyzing commit messages that would be scrubbed..."
echo "==================================================="

# Search for commits with sensitive terms
git log --oneline | grep -iE "(security|hardening|rate.?limit|dos|container|docker|terminal.?server|websocket.?server|apparmor|seccomp|namespace|isolation|sandbox)" | head -20 || echo "No sensitive commits found in recent history"

echo ""
echo "File size impact analysis:"
echo "========================="
echo "Current repository size:"
du -sh .git

echo ""
echo "Files currently in history that match removal patterns:"
git log --all --name-only --pretty=format: | sort -u | grep -E "(server/|docker/|terminal-server|diagnostics-server|container-security|security-hardening)" | wc -l | xargs echo "Number of matching files:"

echo ""
echo "This is a DRY RUN - no changes were made"
echo "To execute the actual history rewrite, run: ./scripts/phase4-history-rewrite.sh"

rm -f /tmp/paths-to-remove-dryrun.txt