#!/bin/bash
set -e

# --- Global Non-Interactive & CI Environment Settings ---
# These are set to ensure all sub-commands (pnpm, oclif, tests, etc.)
# run in a non-interactive, CI-friendly, and basic terminal mode.
export CI=true
export ABLY_INTERACTIVE=false # Specific to oclif to prevent interactive prompts
export TERM=dumb              # Prevents complex terminal manipulations (e.g., screen clearing)
export NO_COLOR=1             # Disables colorized output and associated ANSI codes
export SUPPRESS_CONTROL_API_ERRORS=true # Custom flag for our ControlApi service

echo "🚀 Running Pre-Push Validation..."

# Global cleanup function
cleanup() {
  if [ -n "$SERVER_PID" ] && ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "   Cleaning up: stopping terminal server (PID: $SERVER_PID)..."
    kill -TERM $SERVER_PID 2>/dev/null || true
    sleep 2
    # Force kill if still running
    if ps -p $SERVER_PID > /dev/null 2>&1; then
      kill -KILL $SERVER_PID 2>/dev/null || true
    fi
  fi
  
  # Also kill any orphaned processes
  pkill -f "bin/run.js.*subscribe" 2>/dev/null || true
  pkill -f "terminal-server" 2>/dev/null || true

  # Remove temporary server log file if it exists
  if [ -n "$SERVER_LOG_FILE" ] && [ -f "$SERVER_LOG_FILE" ]; then
    rm -f "$SERVER_LOG_FILE" || true
  fi
}

# Set trap to ensure cleanup runs on any exit
trap cleanup EXIT INT TERM

# Helper function to find a free port
find_free_port() {
  # Use Node.js to find a free port starting from a base port
  local base_port=${1:-8080}
  node -e "
    const net = require('net');
    function findFreePort(startPort) {
      return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, () => {
          const port = server.address().port;
          server.close(() => resolve(port));
        });
        server.on('error', () => {
          findFreePort(startPort + 1).then(resolve).catch(reject);
        });
      });
    }
    findFreePort($base_port).then(port => {
      console.log(port);
      process.exit(0);
    }).catch(err => {
      console.error('Failed to find free port:', err);
      process.exit(1);
    });
  "
}

# -----------------------------------------------------------------------------
# Utility: run command, capture output, only show on failure
# -----------------------------------------------------------------------------
run_quiet() {
  local LOG_FILE
  local CMD_EXIT_CODE
  LOG_FILE=$(mktemp /tmp/ably-prepush-step.XXXXXX)
  # Prepend CI=true, ABLY_INTERACTIVE=false, and TERM=dumb to ensure non-interactive behavior
  # and prevent complex terminal manipulations by sub-commands.
  if CI=true ABLY_INTERACTIVE=false TERM=dumb "$@" >"$LOG_FILE" 2>&1; then
    # Success – we keep log for troubleshooting but do not show
    rm -f "$LOG_FILE" 2>/dev/null || true
    return 0
  else
    CMD_EXIT_CODE=$?
    echo -e "   ❌ Command failed (exit $CMD_EXIT_CODE). Showing output:\n" >&2
    cat "$LOG_FILE" >&2
    rm -f "$LOG_FILE" 2>/dev/null || true
    exit $CMD_EXIT_CODE
  fi
}

# Step 1: Build and prepare (suppress noisy Control API warnings unless failed)
echo "📦 Step 1: Building project..."
run_quiet pnpm prepare
echo "   ✅ Build succeeded"

# Step 2: Lint check
echo "🧹 Step 2: Running linter..."
run_quiet pnpm exec eslint .
echo "   ✅ Lint passed"

# Step 3: Unit tests (fast)
echo "🧪 Step 3: Running unit tests..."
run_quiet pnpm test:unit --reporter min
echo "   ✅ Unit tests passed"

# Step 4: Basic E2E tests (critical path)
echo "🎯 Step 4: Running basic E2E tests..."
run_quiet pnpm test:e2e:basic --reporter min
echo "   ✅ Basic E2E tests passed"

# Step 5: Integration tests
echo "🔗 Step 5: Running integration tests..."
run_quiet pnpm test:integration --reporter min
echo "   ✅ Integration tests passed"

# Step 6: Server tests
echo "🖥️  Step 6: Running server tests..."
run_quiet sh -c "cd server && pnpm test:unit --reporter min"
echo "   ✅ Server tests passed"

# Step 7: Fast load tests (with local server)
echo "🚀 Step 7: Running fast load tests..."
echo "   Finding free ports for test servers..."

# Find free ports to avoid collisions
TERMINAL_PORT=$(find_free_port 8080)
DIAGNOSTICS_PORT=$(find_free_port $((TERMINAL_PORT + 1)))

echo "   Using terminal server port: $TERMINAL_PORT"
echo "   Using diagnostics server port: $DIAGNOSTICS_PORT"

# Build server first (suppress noisy TypeScript output)
echo "   Building terminal server..."
cd server
run_quiet pnpm build
echo "   ✅ Server build succeeded"
cd ..

# Start terminal server in background with detected port, capturing logs
echo "   Starting terminal server on port $TERMINAL_PORT..."
# Capture server logs to a temporary file so we can show them **only** if tests fail
SERVER_LOG_FILE=$(mktemp /tmp/ably-terminal-server-logs.XXXXXX)
# shellcheck disable=SC2091
( cd server && PORT=$TERMINAL_PORT pnpm start ) >"$SERVER_LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "   Terminal server started with PID: $SERVER_PID (logs: $SERVER_LOG_FILE)"

# Wait for server to be ready (max 30 seconds)
echo "   Waiting for terminal server to start..."
for i in {1..30}; do
  if nc -z localhost $TERMINAL_PORT 2>/dev/null; then
    echo "   ✅ Terminal server is ready on port $TERMINAL_PORT"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "   ❌ Terminal server failed to start within 30 seconds"
    exit 1
  fi
  sleep 1
done

# Run fast load tests with the detected port
echo "   Running fast load tests..."
LOG_LEVEL=0 TERMINAL_PORT=$TERMINAL_PORT DIAGNOSTICS_PORT=$DIAGNOSTICS_PORT pnpm test:load:ci --reporter min
LOAD_TEST_EXIT_CODE=$?

# Return to root directory
cd ..

# Check if load tests passed (cleanup will be handled by trap)
if [ $LOAD_TEST_EXIT_CODE -ne 0 ]; then
    echo "❌ Fast load tests failed"
    echo "   Displaying terminal server logs (last 500 lines):"
    tail -n 500 "$SERVER_LOG_FILE" || true
    exit 1
else
    echo "   Fast load tests passed. (Terminal server logs captured at $SERVER_LOG_FILE – not displayed)"
fi

echo "✅ All pre-push validation steps completed successfully!"
echo ""
echo "🎉 Your code is ready for push!" 