#!/bin/bash
# Script to run tests and forcefully terminate any hanging processes

# Capture test pattern and timeout option
TEST_PATTERN="$1"
shift
TIMEOUT_OPTION=""
EXTRA_OPTIONS=""

# Process remaining arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --timeout)
      TIMEOUT_OPTION="$1 $2"
      shift 2
      ;;
    *)
      EXTRA_OPTIONS="$EXTRA_OPTIONS $1"
      shift
      ;;
  esac
done

# Check if the test pattern matches a specific file
if [[ "$TEST_PATTERN" == *".test.ts" && ! "$TEST_PATTERN" == *"*"* ]]; then
  # When running a specific test file, just run that file
  SELECTED_PATTERNS="$TEST_PATTERN"
  echo "Running specific test file: $SELECTED_PATTERNS"
elif [[ "$TEST_PATTERN" == "test/**/*.test.ts" && -z "$EXTRA_OPTIONS" ]]; then
  # When running all tests, explicitly list each test directory and the specific integration tests
  SELECTED_PATTERNS="test/unit/**/*.test.ts test/integration/docker-container-security.test.ts test/integration/terminal-server.test.ts test/e2e/**/*.test.ts"
  echo "Running all test suites"
  echo "- Unit tests"
  echo "- Integration tests (Docker Security, Terminal Server)"
  echo "- E2E tests"
else
  # For all other patterns, use what was provided
  SELECTED_PATTERNS="$TEST_PATTERN"
  echo "Running tests with pattern: $SELECTED_PATTERNS"
fi

echo "Timeout option: $TIMEOUT_OPTION"
if [[ -n "$EXTRA_OPTIONS" ]]; then
  echo "Extra options: $EXTRA_OPTIONS"
fi

# Set an outer timeout (in seconds) - default 120s or 2 minutes
OUTER_TIMEOUT=120

# Run the tests with the specified patterns and timeout
# Using shell process group to ensure all child processes are terminated
CURSOR_DISABLE_DEBUGGER=true NODE_OPTIONS="--no-inspect --unhandled-rejections=strict" \
  node --import 'data:text/javascript,import { register } from "node:module"; import { pathToFileURL } from "node:url"; register("ts-node/esm", pathToFileURL("./"), { project: "./tsconfig.test.json" });' \
  ./node_modules/mocha/bin/mocha --require ./test/setup.ts --forbid-only --allow-uncaught $SELECTED_PATTERNS $TIMEOUT_OPTION $EXTRA_OPTIONS --exit &

TEST_PID=$!

# Wait for the test to complete with timeout - compatible with macOS
echo "Test process running with PID $TEST_PID"

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
exit $EXIT_CODE
