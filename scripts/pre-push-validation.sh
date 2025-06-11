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
  # Kill any orphaned processes
  pkill -f "bin/run.js.*subscribe" 2>/dev/null || true
}

# Set trap to ensure cleanup runs on any exit
trap cleanup EXIT INT TERM

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


echo "✅ All pre-push validation steps completed successfully!"
echo ""
echo "🎉 Your code is ready for push!" 