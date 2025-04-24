#!/bin/bash
# Script to run tests

# Capture all arguments
ARGS=("$@")

# Check if any argument specifically targets the web-cli test file
USE_PLAYWRIGHT=false
PLAYWRIGHT_TEST_FILE=""
for arg in "${ARGS[@]}"; do
  if [[ "$arg" == *"web-cli.test.ts" ]]; then
    USE_PLAYWRIGHT=true
    PLAYWRIGHT_TEST_FILE="$arg"
    break
  fi
done

# Default runner command parts (Mocha related)
# NOTE: root-hooks are removed as the file was deleted.
MOCHA_RUNNER_CMD="./node_modules/mocha/bin/mocha --require ./test/setup.ts --forbid-only --allow-uncaught"
MOCHA_NODE_SETUP="CURSOR_DISABLE_DEBUGGER=true NODE_OPTIONS=\" --no-inspect --unhandled-rejections=strict\" node --import 'data:text/javascript,import { register } from \"node:module\"; import { pathToFileURL } from \"node:url\"; register(\"ts-node/esm\", pathToFileURL(\"./\"), { project: \"./tsconfig.test.json\" });'"

if $USE_PLAYWRIGHT; then
  # Use Playwright runner
  echo "Using Playwright test runner for Web CLI tests..."
  # Pass ONLY the specific web-cli test file to Playwright
  COMMAND="pnpm exec playwright test $PLAYWRIGHT_TEST_FILE"
  echo "Executing command: $COMMAND"
elif [[ "${ARGS[0]}" == "test/**/*.test.ts" ]]; then
  # Running all tests (default pattern) - use Mocha, exclude web-cli
  echo "Using Mocha test runner for all suites (excluding Web CLI E2E)..."
  MOCHA_ARGS=$(printf " %q" "${ARGS[@]}")
  # Add exclude flag specifically for the full run
  EXCLUDE_OPTION="--exclude test/e2e/web-cli/web-cli.test.ts"
  # Removed --exit flag
  COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD$MOCHA_ARGS $EXCLUDE_OPTION"
  echo "Executing command: $COMMAND"
else
  # Running specific Mocha tests (pattern or file)
  echo "Using Mocha test runner..."
  MOCHA_ARGS=$(printf " %q" "${ARGS[@]}")
  # Removed --exit flag
  COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD$MOCHA_ARGS"
  echo "Executing command: $COMMAND"
fi

# Set an outer timeout (in seconds) - default 180s or 3 minutes
# Increased from 120s to give more buffer
OUTER_TIMEOUT=180

# Run the tests with the determined runner
eval $COMMAND &

TEST_PID=$!

# Wait for the test to complete with timeout - compatible with macOS
echo "Test process running with PID $TEST_PID"

# Define a default timeout if OUTER_TIMEOUT is not set (already set above)
# : ${OUTER_TIMEOUT:=300} # Default to 300 seconds (5 minutes) - Using 180s now

# Start a timer
SECONDS=0

# Check if process is still running in a loop
while kill -0 $TEST_PID 2>/dev/null; do
  if [ $SECONDS -gt $OUTER_TIMEOUT ]; then
    echo "Tests did not complete within $OUTER_TIMEOUT seconds. Forcefully terminating."
    kill -9 $TEST_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# Wait for the test process to retrieve its exit code
wait $TEST_PID
EXIT_CODE=$?
echo "Tests exited with code $EXIT_CODE"

# Add a small delay to allow any final async operations/network messages to settle
echo "Adding 1s delay before final exit..."
sleep 1

exit $EXIT_CODE
