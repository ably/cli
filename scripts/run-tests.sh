#!/bin/bash
# Script to run tests with optional debugging support
#
# Environment Variables for Debugging:
#   E2E_DEBUG=true              - Enable detailed test debugging output
#   ABLY_CLI_TEST_SHOW_OUTPUT=true - Show detailed CLI output during tests
#   TEST_DEBUG=true             - Enable general test debugging (alias for E2E_DEBUG)
#
# Command Line Flags for Debugging:
#   --debug                     - Enable debugging (sets E2E_DEBUG=true)
#   --show-output              - Show CLI output (sets ABLY_CLI_TEST_SHOW_OUTPUT=true)
#   --verbose                  - Enable verbose output (sets both debug flags)
#
# Examples:
#   pnpm test:e2e --debug                          # Run E2E tests with debugging
#   pnpm test:e2e --verbose                        # Run E2E tests with full verbose output
#   E2E_DEBUG=true pnpm test:e2e                   # Run E2E tests with debug env var
#   pnpm test:e2e test/e2e/commands/rooms* --debug # Debug specific rooms tests

# Capture all arguments
ARGS=("$@")

# Initialize debug flags
DEBUG_MODE=false
SHOW_OUTPUT=false

# Check environment variables for debugging
if [[ "${E2E_DEBUG:-false}" == "true" || "${TEST_DEBUG:-false}" == "true" ]]; then
  DEBUG_MODE=true
fi

if [[ "${ABLY_CLI_TEST_SHOW_OUTPUT:-false}" == "true" ]]; then
  SHOW_OUTPUT=true
fi

# Process command line arguments for debug flags
PROCESSED_ARGS=()
for arg in "${ARGS[@]}"; do
  case "$arg" in
    --debug)
      DEBUG_MODE=true
      echo "Debug mode enabled via --debug flag"
      ;;
    --show-output)
      SHOW_OUTPUT=true
      echo "CLI output display enabled via --show-output flag"
      ;;
    --verbose)
      DEBUG_MODE=true
      SHOW_OUTPUT=true
      echo "Verbose mode enabled via --verbose flag (debug + show-output)"
      ;;
    *)
      PROCESSED_ARGS+=("$arg")
      ;;
  esac
done

# Replace original ARGS with processed ones (debug flags removed)
ARGS=("${PROCESSED_ARGS[@]}")

# Load .env file if it exists (to check for API keys in debug mode)
if [[ -f ".env" && -s ".env" ]]; then
  # Export variables from .env file only if it has content
  set -a # automatically export all variables
  source .env
  set +a # stop automatically exporting
fi

# Set up debugging environment if enabled
if [[ "$DEBUG_MODE" == "true" ]]; then
  export E2E_DEBUG=true
  export TEST_DEBUG=true
  echo "=== TEST DEBUG MODE ENABLED ==="
  echo "Starting debug run at $(date)"
  echo "Environment variables:"
  echo "  E2E_DEBUG=true"
  echo "  TEST_DEBUG=true"
  
  # Add trace options to NODE_OPTIONS (preserve existing options)
  if [[ -z "$NODE_OPTIONS" ]]; then
    export NODE_OPTIONS="--trace-warnings --trace-deprecation"
  else
    export NODE_OPTIONS="$NODE_OPTIONS --trace-warnings --trace-deprecation"
  fi
  echo "  NODE_OPTIONS=$NODE_OPTIONS"
fi

if [[ "$SHOW_OUTPUT" == "true" ]]; then
  export ABLY_CLI_TEST_SHOW_OUTPUT=true
  echo "  ABLY_CLI_TEST_SHOW_OUTPUT=true"
fi

# Show debug status and API key warning
if [[ "$DEBUG_MODE" == "true" ]]; then
  if [[ -z "$E2E_ABLY_API_KEY" ]]; then
    echo ""
    echo "WARNING: E2E_ABLY_API_KEY is not set"
    echo "E2E tests will likely fail without a valid API key"
  else
    echo "  E2E_ABLY_API_KEY is configured"
  fi
  echo "================================="
  echo ""
fi

# Pre-test cleanup if debugging
if [[ "$DEBUG_MODE" == "true" ]]; then
  echo "Cleaning up any existing processes..."
  pkill -f "bin/run.js" || true
  pkill -f "ably" || true
  sleep 1
fi

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

# Configure Node.js warnings based on debug mode
if [[ "$DEBUG_MODE" == "true" ]]; then
  # In debug mode, show all warnings for troubleshooting
  MOCHA_NODE_SETUP="CURSOR_DISABLE_DEBUGGER=true NODE_OPTIONS=\"$NODE_OPTIONS --no-inspect --unhandled-rejections=strict\" node --import 'data:text/javascript,import { register } from \"node:module\"; import { pathToFileURL } from \"node:url\"; register(\"ts-node/esm\", pathToFileURL(\"./\"), { project: \"./tsconfig.test.json\" });'"
else
  # In normal mode, suppress known deprecation and experimental warnings to clean up output
  MOCHA_NODE_SETUP="CURSOR_DISABLE_DEBUGGER=true NODE_OPTIONS=\"$NODE_OPTIONS --no-inspect --unhandled-rejections=strict --no-deprecation --no-warnings\" node --import 'data:text/javascript,import { register } from \"node:module\"; import { pathToFileURL } from \"node:url\"; register(\"ts-node/esm\", pathToFileURL(\"./\"), { project: \"./tsconfig.test.json\" });'"
fi

# Add debug reporter if in debug mode
if [[ "$DEBUG_MODE" == "true" ]]; then
  MOCHA_RUNNER_CMD="$MOCHA_RUNNER_CMD --reporter spec"
fi

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
  # Ensure the pattern itself is treated as a single argument for --grep
  OTHER_ARGS+=("--grep" "$GREP_PATTERN") 
fi

# If no explicit TEST_PATTERN selected, default to all tests pattern
if [[ -z "$TEST_PATTERN" ]]; then
  TEST_PATTERN="test/**/*.test.ts"
fi

# Debug output for test execution
if [[ "$DEBUG_MODE" == "true" ]]; then
  echo "=== Test Execution Details ==="
  echo "Test pattern: $TEST_PATTERN"
  echo "Additional args: ${OTHER_ARGS[*]}"
  echo "Using Playwright: $USE_PLAYWRIGHT"
  if [[ -n "$GREP_PATTERN" ]]; then
    echo "Filter pattern: $GREP_PATTERN"
  fi
  echo "Starting test execution at: $(date)"
  echo "=============================="
  echo ""
fi

if $USE_PLAYWRIGHT; then
  # Use Playwright runner
  # Always rebuild to ensure the example app & shared packages reflect the latest code changes
  if [[ "$DEBUG_MODE" == "true" ]]; then
    echo "=== Building for Playwright Tests ==="
  fi
  echo "Building project before running Playwright tests (ensures latest TS changes are picked up)..."
  pnpm build || { echo "Root build failed, aborting Playwright run."; exit 1; }

  # ALSO rebuild the React Web CLI package so that its dist/ output includes recent edits.
  echo "Building @ably/react-web-cli package (tsup)..."
  pnpm --filter @ably/react-web-cli run build || { echo "react-web-cli build failed, aborting Playwright run."; exit 1; }
  
  # Set up cleanup handler to restore .env file
  ENV_FILE_PATH="./examples/web-cli/.env"
  ENV_FILE_BACKUP="./examples/web-cli/.env.backup"
  
  cleanup_env_file() {
    if [[ -f "$ENV_FILE_BACKUP" ]]; then
      echo "Restoring .env file in cleanup..."
      mv "$ENV_FILE_BACKUP" "$ENV_FILE_PATH"
    fi
  }
  
  # Ensure cleanup runs on exit
  trap cleanup_env_file EXIT

  # Temporarily move .env file to prevent credentials from being baked into the build
  # (Individual tests will handle their own authentication needs)
  if [[ -f "$ENV_FILE_PATH" ]]; then
    echo "Moving .env file temporarily to ensure clean build for tests..."
    mv "$ENV_FILE_PATH" "$ENV_FILE_BACKUP"
  fi

  # Pass E2E API key as VITE env var during build if available
  # This allows the app to have API key available even though .env file is moved
  BUILD_ENV=""
  if [[ -n "$E2E_ABLY_API_KEY" ]]; then
    BUILD_ENV="VITE_ABLY_API_KEY=$E2E_ABLY_API_KEY"
  fi
  
  # Rebuild the example app so the preview server serves the latest bundle that includes changed library code.
  echo "Building example web-cli app (vite build)..."
  env $BUILD_ENV pnpm --filter ./examples/web-cli run build || { 
    # Restore .env file if build fails
    if [[ -f "$ENV_FILE_BACKUP" ]]; then
      mv "$ENV_FILE_BACKUP" "$ENV_FILE_PATH"
    fi
    echo "example web-cli build failed, aborting Playwright run."; 
    exit 1; 
  }
  
  # Don't restore here - let the trap handle it to ensure it's always restored

  if [[ "$DEBUG_MODE" == "true" ]]; then
    echo "=== Running Playwright Tests ==="
  fi
  echo "Using Playwright test runner for Web CLI tests..."
  # Pass ONLY the specific web-cli test file to Playwright
  COMMAND="pnpm exec playwright test $PLAYWRIGHT_TEST_FILE"
  echo "Executing command: $COMMAND"
elif [[ -n "$TEST_PATTERN" ]]; then
  # Running a specific test file or pattern
  if [[ "$DEBUG_MODE" == "true" ]]; then
    echo "=== Running Mocha Tests ==="
  fi
  echo "Using Mocha test runner for specific test pattern: $TEST_PATTERN"
  
  # Generate the other args string, ensuring proper quoting for eval
  OTHER_ARGS_STR=""
  for arg in "${OTHER_ARGS[@]}"; do
    OTHER_ARGS_STR+=$(printf " %q" "$arg") # Use printf %q for robust quoting
  done
  
  # Treat as a "specific file" only if the pattern does **not** contain any wildcard characters
  # (i.e. "*" or "?"), otherwise it's a glob pattern and should have the EXCLUDE_OPTION appended.
  if [[ "$TEST_PATTERN" == *.test.ts && "$TEST_PATTERN" != *\** && "$TEST_PATTERN" != *\?* ]]; then
    COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD $TEST_PATTERN$OTHER_ARGS_STR"
  else
    # Quote the pattern so that the shell does not expand it prematurely, allowing Mocha to handle the glob
    COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD '$TEST_PATTERN'$OTHER_ARGS_STR $EXCLUDE_OPTION"
  fi
  
  if [[ "$DEBUG_MODE" == "true" ]]; then
    echo "Executing command: $COMMAND"
  fi
elif [[ "${ARGS[0]}" == "test/**/*.test.ts" ]] || [[ "${ARGS[0]}" == "test/e2e/**/*.test.ts" ]]; then
  # Running all tests or all E2E tests - use Mocha, exclude web-cli
  if [[ "$DEBUG_MODE" == "true" ]]; then
    echo "=== Running All Tests (Mocha) ==="
  fi
  echo "Using Mocha test runner (excluding Web CLI E2E)..."
  MOCHA_ARGS=$(printf " %q" "${ARGS[@]}")
  # Add exclude flag
  # Removed --exit flag
  COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD$MOCHA_ARGS $EXCLUDE_OPTION"
  if [[ "$DEBUG_MODE" == "true" ]]; then
    echo "Executing command: $COMMAND"
  fi
else
  # Running with custom args but no specific pattern
  if [[ "$DEBUG_MODE" == "true" ]]; then
    echo "=== Running Custom Test Pattern ==="
  fi
  echo "Using Mocha test runner..."
  MOCHA_ARGS=$(printf " %q" "${ARGS[@]}")
  # Removed --exit flag
  COMMAND="$MOCHA_NODE_SETUP $MOCHA_RUNNER_CMD$MOCHA_ARGS"
  if [[ "$DEBUG_MODE" == "true" ]]; then
    echo "Executing command: $COMMAND"
  fi
fi

# Set an outer timeout (in seconds) – 10 minutes should be sufficient even on CI
OUTER_TIMEOUT=600

# Function to run tests with debug logging if enabled
run_test_with_debug() {
  if [[ "$DEBUG_MODE" == "true" ]]; then
    echo ""
    echo "=== Test Execution Started ==="
    echo "Command: $COMMAND"
    echo "Started at: $(date)"
    echo "PID will be: $TEST_PID (once started)"
    echo "============================="
    echo ""
  fi
}

# Run the tests with the determined runner
eval $COMMAND &

TEST_PID=$!

# Debug logging for test execution
if [[ "$DEBUG_MODE" == "true" ]]; then
  run_test_with_debug
fi

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
    if [[ "$DEBUG_MODE" == "true" ]]; then
      echo "Checking for hanging processes..."
      ps aux | grep -E "(bin/run.js|ably)" | grep -v grep || echo "No hanging processes found"
    fi
    kill -9 $TEST_PID 2>/dev/null || true
    exit 1
  fi
  sleep 1
done

# Wait for the test process to retrieve its exit code
wait $TEST_PID
EXIT_CODE=$?

if [[ "$DEBUG_MODE" == "true" ]]; then
  echo ""
  echo "=== Test Execution Complete ==="
  echo "Finished at: $(date)"
  echo "Exit code: $EXIT_CODE"
  if [[ "$EXIT_CODE" != "0" ]]; then
    echo "Test failed with exit code: $EXIT_CODE"
    echo "Checking for hanging processes..."
    ps aux | grep -E "(bin/run.js|ably)" | grep -v grep || echo "No hanging processes found"
  fi
  echo "==============================="
  
  # Final cleanup in debug mode
  echo "Final cleanup..."
  pkill -f "bin/run.js" || true
  pkill -f "ably" || true
fi

echo "Tests exited with code $EXIT_CODE"

# Add a small delay to allow any final async operations/network messages to settle
echo "Adding 1s delay before final exit..."
sleep 1

exit $EXIT_CODE
