#!/bin/bash
set -euo pipefail

# Phase 4: History Rewrite Script
# This script removes all server-related files from git history

echo "=== Phase 4: History Rewrite Script ==="
echo "This will permanently remove server files from git history!"
echo ""

# Check if git-filter-repo is installed
if ! command -v git-filter-repo &> /dev/null; then
    echo "ERROR: git-filter-repo is not installed!"
    echo "Please install it first:"
    echo "  brew install git-filter-repo  # macOS"
    echo "  pip install git-filter-repo   # Python"
    exit 1
fi

# Ensure we're in the right directory
if [ ! -f "package.json" ] || [ "$(jq -r .name package.json)" != "@ably/cli" ]; then
    echo "ERROR: Must be run from the root of the ably/cli repository!"
    exit 1
fi

# Check for clean working directory
if [ -n "$(git status --porcelain)" ]; then
    echo "ERROR: Working directory is not clean! Please commit or stash changes."
    exit 1
fi

echo "Current branch: $(git branch --show-current)"
echo "Remote URL: $(git remote get-url origin)"
echo ""
read -p "Are you sure you want to proceed? This is IRREVERSIBLE! (type 'yes' to continue): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# Create timestamp for backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo ""
echo "Step 1: Creating backup..."
BACKUP_DIR="../ably-cli-backup-$TIMESTAMP"
git clone --mirror . "$BACKUP_DIR"
echo "Backup created at: $BACKUP_DIR"

echo ""
echo "Step 2: Removing server files from history..."

# Create a comprehensive paths file
cat > /tmp/paths-to-remove.txt << 'EOF'
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

# Use git-filter-repo to remove paths
git filter-repo --paths-from-file /tmp/paths-to-remove.txt --invert-paths --force

echo ""
echo "Step 3: Creating commit message scrubbing script..."

# Create the scrub script
cat > /tmp/scrub-messages.py << 'EOF'
import re

# Sensitive patterns to scrub
sensitive_patterns = [
    r'security', r'hardening', r'rate[\s-]?limit', r'dos', r'denial[\s-]?of[\s-]?service',
    r'container', r'docker', r'session', r'exploit', r'vulnerability', r'auth[nz]',
    r'internal[\s-]?api', r'secret', r'credential', r'password', r'token',
    r'private[\s-]?key', r'cert(ificate)?', r'database', r'backend', r'proxy',
    r'firewall', r'ip[\s-]?address(es)?', r'port[\s-]?scan', r'infrastructure',
    r'apparmor', r'seccomp', r'namespace', r'isolation', r'sandbox',
    r'terminal[\s-]?server', r'websocket[\s-]?server', r'diagnostics[\s-]?server'
]

# Exclude benign contexts
benign_context = re.compile(
    r'(CLI command|client-side|frontend|React|component|example|demo|test utils|unit test)', 
    re.IGNORECASE
)

# Combine patterns
combined_sensitive_regex = re.compile(
    r'(' + '|'.join(sensitive_patterns) + r')', 
    re.IGNORECASE
)

# Check if message contains sensitive content
message_str = commit.message.decode('utf-8')
if combined_sensitive_regex.search(message_str) and not benign_context.search(message_str):
    # Log to a file for audit
    with open('/tmp/scrubbed-commits.log', 'a') as f:
        f.write(f"Scrubbed: {message_str.splitlines()[0][:80]}...\n")
    
    # Replace with generic message
    commit.message = b'[commit message redacted for security review]'
EOF

chmod +x /tmp/scrub-messages.py

echo ""
echo "Step 4: Scrubbing sensitive commit messages..."
git filter-repo --commit-callback 'exec(open("/tmp/scrub-messages.py").read())'

echo ""
echo "Step 5: Creating placeholder file..."
mkdir -p server
cat > server/REMOVED.md << 'EOF'
# Terminal Server Code Removed

The Ably CLI Terminal Server code has been moved to a private repository. 

For inquiries about the terminal server implementation, please contact Ably support or refer to the official Ably documentation.

If you're an Ably engineer working on terminal server features, please see the `CONTRIBUTING.md` file for instructions on local development.
EOF

git add server/REMOVED.md
git commit -m "feat: Add placeholder for removed server directory"

echo ""
echo "Step 6: Cleaning up..."
rm -f /tmp/paths-to-remove.txt /tmp/scrub-messages.py

echo ""
echo "=== History Rewrite Complete! ==="
echo ""
echo "IMPORTANT NEXT STEPS:"
echo "1. Review the changes carefully"
echo "2. Force push to GitHub: git push --force --all origin"
echo "3. Force push tags: git push --force --tags origin"
echo "4. Notify all contributors to re-clone the repository"
echo "5. Archive or delete old forks"
echo ""
echo "Backup location: $BACKUP_DIR"
echo "Scrubbed commits log: /tmp/scrubbed-commits.log"