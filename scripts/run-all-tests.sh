#!/bin/bash
# Run all tests with proper isolation to avoid module loading issues

set -e

echo "🚀 Running all tests with proper isolation..."
echo ""

# Track overall results
FAILED_SUITES=()
OVERALL_EXIT_CODE=0

# Function to run a test suite
run_suite() {
  local suite_name=$1
  local suite_cmd=$2
  
  echo "========================================"
  echo "Running: $suite_name"
  echo "Command: $suite_cmd"
  echo "========================================"
  
  if $suite_cmd; then
    echo "✅ $suite_name passed"
  else
    local exit_code=$?
    echo "❌ $suite_name failed with exit code $exit_code"
    FAILED_SUITES+=("$suite_name")
    OVERALL_EXIT_CODE=$exit_code
  fi
  
  echo ""
}

# Run test suites in order
run_suite "Unit Tests" "pnpm test:unit"
run_suite "Integration Tests" "pnpm test:integration"

# Run E2E test groups separately to avoid resource exhaustion
run_suite "E2E Core Tests" "pnpm run test:e2e:basic"
run_suite "E2E Auth Tests" "./scripts/run-tests.sh 'test/e2e/auth/**/*.test.ts' --timeout 120000"
run_suite "E2E Channels Tests" "pnpm test:e2e:channels"
run_suite "E2E Connections Tests" "./scripts/run-tests.sh 'test/e2e/connections/**/*.test.ts' --timeout 180000"
run_suite "E2E Control Tests" "pnpm test:e2e:control"
run_suite "E2E Rooms Tests" "pnpm test:e2e:rooms"
run_suite "E2E Spaces Tests" "pnpm test:e2e:spaces"
run_suite "E2E Bench Tests" "./scripts/run-tests.sh 'test/e2e/bench/**/*.test.ts' --timeout 120000"

# Run hook tests
run_suite "Hook Tests" "./scripts/run-tests.sh 'test/hooks/**/*.test.ts' --timeout 60000"

# Summary
echo "========================================"
echo "Test Summary"
echo "========================================"

if [ $OVERALL_EXIT_CODE -eq 0 ]; then
  echo "✅ All test suites passed!"
  echo ""
  echo "Note: Web CLI (Playwright) tests are run separately with 'pnpm test:playwright'"
else
  echo "❌ Some test suites failed:"
  for failed in "${FAILED_SUITES[@]}"; do
    echo "  - $failed"
  done
fi

exit $OVERALL_EXIT_CODE