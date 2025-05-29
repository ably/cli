#!/bin/bash
# Script to run tests

# Capture all arguments
ARGS=("$@")

# Detect if we are about to run a Playwright browser test (any file inside test/e2e/web-cli/)
USE_PLAYWRIGHT=false
PLAYWRIGHT_TEST_FILE=""
for arg in "${ARGS[@]}"; do
  if [[ "$arg" == *"test/e2e/web-cli/"*".test.ts" ]]; then
    USE_PLAYWRIGHT=true
    PLAYWRIGHT_TEST_FILE="$arg" # Keep updating, last one found will be used
  fi
done

# Default runner command parts (Mocha related)
# NOTE: root-hooks are removed as the file was deleted.
MOCHA_RUNNER_CMD="./node_modules/mocha/bin/mocha --require ./test/setup.ts --forbid-only --allow-uncaught --exit"
MOCHA_NODE_SETUP="CURSOR_DISABLE_DEBUGGER=true NODE_OPTIONS=\" --no-inspect --unhandled-rejections=strict\" node --import 'data:text/javascript,import { register } from \"node:module\"; import { pathToFileURL } from \"node:url\"; register(\"ts-node/esm\", pathToFileURL(\"./\"), { project: \"./tsconfig.test.json\" });'"

# Exclude any *.test.ts file directly inside or in subdirectories under web-cli/
EXCLUDE_OPTION="--exclude 'test/e2e/web-cli/**/*.test.ts'"

# Process arguments to determine test pattern and other flags
TEST_PATTERN=""
OTHER_ARGS=()

# Support --filter <pattern> as an alias for Mocha --grep <pattern>
GREP_PATTERN=""

# Scan for --filter flag and capture its value, remove from ARGS
PROCESSED_ARGS=()
skip_next=false
for arg in "${ARGS[@]}"; do
  if $skip_next; then
    GREP_PATTERN="$arg"
    skip_next=false
    continue
  fi

  if [[ "$arg" == "--filter" ]]; then
    skip_next=true
    continue
  fi
  PROCESSED_ARGS+=("$arg")
done

# Replace original ARGS with processed ones (without --filter)
ARGS=("${PROCESSED_ARGS[@]}")

# If GREP_PATTERN set, append to OTHER_ARGS later as --grep

# First pass: Look for specific test files or patterns that aren't the default pattern
for arg in "${ARGS[@]}"; do
  # Check if this looks like a specific test file or non-default pattern
  if [[ "$arg" != "test/**/*.test.ts" && "$arg" != -* && 
        ("$arg" == *.test.ts || "$arg" == *test/**/* || "$arg" == */**/*.test.ts) ]]; then
    TEST_PATTERN="$arg"
    # If we found a specific test file/pattern, prioritize it
    break
  fi
done

# Second pass: collect all arguments that aren't test patterns
if [[ -n "$TEST_PATTERN" ]]; then
  # If we found a specific pattern, all other args are just flags
  for arg in "${ARGS[@]}"; do
    if [[ "$arg" != "$TEST_PATTERN" && "$arg" != "test/**/*.test.ts" ]]; then
      OTHER_ARGS+=("$arg")
    fi
  done
else
  # No specific pattern found, check if we have the default pattern
  for arg in "${ARGS[@]}"; do
    if [[ "$arg" == "test/**/*.test.ts" ]]; then
      TEST_PATTERN="$arg"
    elif [[ "$arg" != -* && 
           ("$arg" == *.test.ts || "$arg" == *test/**/* || "$arg" == */**/*.test.ts) ]]; then
      # Found another test pattern
      TEST_PATTERN="$arg"
    else
      # This is a regular argument (like --timeout)
      OTHER_ARGS+=("$arg")
    fi
  done
fi

# If a --filter was provided, convert to Mocha --grep flag
if [[ -n "$GREP_PATTERN" ]]; then
  OTHER_ARGS+=("--grep" "$GREP_PATTERN")
fi

# If no explicit TEST_PATTERN selected, default to all tests pattern
if [[ -z "$TEST_PATTERN" ]]; then
  TEST_PATTERN="test/**/*.test.ts"
fi

if $USE_PLAYWRIGHT; then
  # Use Playwright runner
  # Always rebuild to ensure the example app & shared packages reflect the latest code changes
  echo "Building project before running Playwright tests (ensures latest TS changes are picked up)..."
  pnpm build || { echo "Root build failed, aborting Playwright run."; exit 1; }

  # ALSO rebuild the React Web CLI package so that its dist/ output includes recent edits.
  echo "Building @ably/react-web-cli package (tsup)..."
  pnpm --filter @ably/react-web-cli run build || { echo "react-web-cli build failed, aborting Playwright run."; exit 1; }

  # Rebuild the example app so the preview server serves the latest bundle that includes changed library code.
  echo "Building example web-cli app (vite build)..."
  pnpm --filter ./examples/web-cli run build || { echo "example web-cli build failed, aborting Playwright run."; exit 1; }

  echo "Using Playwright test runner for Web CLI tests..."
  # Pass ONLY the specific web-cli test file to Playwright
  COMMAND="pnpm exec playwright test $PLAYWRIGHT_TEST_FILE"
  echo "Executing command: $COMMAND"
elif [[ -n "$TEST_PATTERN" ]]; then
  # Running a specific test file or pattern
  echo "Using Mocha test runner for specific test pattern: $TEST_PATTERN"
  
  # Generate the other args string
  OTHER_ARGS_STR=""
  for arg in "${OTHER_ARGS[@]}"; do
    OTHER_ARGS_STR+=" $arg"
  done
  
  # Treat as a "specific file" only if the pattern does **not** contain any wildcard characters
  # (i.e. "*" or "?"), otherwise it's a glob pattern and should have the EXCLUDE_OPTION appended.
  if [[ "$TEST_PATTERN" == *.test.ts && "$TEST_PATTERN" != *\** && "$TEST_PATTERN" != *\?* ]]; then
    COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD $TEST_PATTERN$OTHER_ARGS_STR"
  else
    # Quote the pattern so that the shell does not expand it prematurely, allowing Mocha to handle the glob
    COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD '$TEST_PATTERN'$OTHER_ARGS_STR $EXCLUDE_OPTION"
  fi
  
  echo "Executing command: $COMMAND"
elif [[ "${ARGS[0]}" == "test/**/*.test.ts" ]] || [[ "${ARGS[0]}" == "test/e2e/**/*.test.ts" ]]; then
  # Running all tests or all E2E tests - use Mocha, exclude web-cli
  echo "Using Mocha test runner (excluding Web CLI E2E)..."
  MOCHA_ARGS=$(printf " %q" "${ARGS[@]}")
  # Add exclude flag
  # Removed --exit flag
  COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD$MOCHA_ARGS $EXCLUDE_OPTION"
  echo "Executing command: $COMMAND"
else
  # Running with custom args but no specific pattern
  echo "Using Mocha test runner..."
  MOCHA_ARGS=$(printf " %q" "${ARGS[@]}")
  # Removed --exit flag
  COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD$MOCHA_ARGS"
  echo "Executing command: $COMMAND"
fi

# Set an outer timeout (in seconds) – 5 minutes should be sufficient even on CI
OUTER_TIMEOUT=300

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
