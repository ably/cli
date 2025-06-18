#!/bin/bash

# Script to systematically verify all Web CLI E2E tests
# Run each test individually to ensure they work

echo "=== Web CLI E2E Test Verification ==="
echo "Starting at: $(date)"
echo

# Simple arrays for test names and results (macOS compatible)
test_names=()
test_results=()

# Function to run a single test
run_test() {
  local test_file=$1
  local test_name=$2
  local test_desc=$3
  
  echo "Running: $test_desc"
  echo "File: $test_file"
  echo "Pattern: $test_name"
  
  # Run the test
  if pnpm exec playwright test --config test/e2e/web-cli/playwright.config.ts "$test_file" --grep "$test_name" --reporter=line 2>&1 | grep -q "1 passed"; then
    test_names+=("$test_desc")
    test_results+=("✅ PASSED")
    echo "✅ PASSED"
  else
    test_names+=("$test_desc")
    test_results+=("❌ FAILED")
    echo "❌ FAILED"
  fi
  
  echo "---"
  echo
  
  # Wait between tests to avoid rate limits
  sleep 5
}

# Run each test
echo "=== Authentication Tests ==="
run_test "test/e2e/web-cli/authentication.test.ts" "should display auth screen on initial load" "Auth: Display auth screen"
run_test "test/e2e/web-cli/authentication.test.ts" "should validate API key is required" "Auth: Validate API key required"
run_test "test/e2e/web-cli/authentication.test.ts" "should validate API key format" "Auth: Validate API key format"
run_test "test/e2e/web-cli/authentication.test.ts" "should authenticate with valid API key and show terminal" "Auth: Authenticate with valid key"
run_test "test/e2e/web-cli/authentication.test.ts" "should persist authentication state across page reloads" "Auth: Persist auth state"
run_test "test/e2e/web-cli/authentication.test.ts" "should allow changing credentials via auth settings" "Auth: Change credentials"
run_test "test/e2e/web-cli/authentication.test.ts" "should show credential display with proper redaction" "Auth: Show redacted credentials"
run_test "test/e2e/web-cli/authentication.test.ts" "should handle authentication with access token" "Auth: Handle access token"
run_test "test/e2e/web-cli/authentication.test.ts" "should clear error message when user starts typing" "Auth: Clear error on typing"
run_test "test/e2e/web-cli/authentication.test.ts" "should maintain terminal session when updating auth settings" "Auth: Maintain session"
run_test "test/e2e/web-cli/authentication.test.ts" "should automatically authenticate when API key is provided" "Auth: Auto-auth with query param"
run_test "test/e2e/web-cli/authentication.test.ts" "should allow switching from query param auth to custom auth" "Auth: Switch auth methods"

echo
echo "=== Reconnection Tests ==="
run_test "test/e2e/web-cli/reconnection.test.ts" "should handle disconnection and reconnection gracefully" "Reconnection: Handle gracefully"
run_test "test/e2e/web-cli/reconnection.test.ts" "should show reconnection status messages" "Reconnection: Show status messages"
run_test "test/e2e/web-cli/reconnection.test.ts" "should handle disconnection gracefully" "Reconnection: Handle single disconnect"

echo
echo "=== Session Resume Tests ==="
run_test "test/e2e/web-cli/session-resume.test.ts" "connects to public server and can resume session" "Session: Resume after reconnection"
run_test "test/e2e/web-cli/session-resume.test.ts" "preserves session across page reload" "Session: Preserve across reload"
run_test "test/e2e/web-cli/session-resume.test.ts" "handles session timeout gracefully" "Session: Handle timeout"

echo
echo "=== Web CLI Core Tests ==="
run_test "test/e2e/web-cli/web-cli.test.ts" "should load the terminal, connect to public server" "Core: Load and connect"
run_test "test/e2e/web-cli/web-cli.test.ts" "side drawer persists state across page reloads" "Core: Drawer persistence"
run_test "test/e2e/web-cli/web-cli.test.ts" "side drawer adapts to different screen sizes" "Core: Drawer responsive"
run_test "test/e2e/web-cli/web-cli.test.ts" "terminal maintains functionality with drawer interactions" "Core: Terminal with drawer"

echo
echo "=== Other Tests ==="
run_test "test/e2e/web-cli/prompt-integrity.test.ts" "Page reload resumes session without injecting extra blank prompts" "Prompt: No extra prompts"
run_test "test/e2e/web-cli/prompt-integrity.test.ts" "Multiple reloads should not accumulate prompts" "Prompt: Multiple reloads"
run_test "test/e2e/web-cli/reconnection-diagnostic.test.ts" "exposes correct debugging information" "Diagnostic: Debug info"
run_test "test/e2e/web-cli/reconnection-diagnostic.test.ts" "captures console logs when debugging enabled" "Diagnostic: Console logs"
run_test "test/e2e/web-cli/reconnection-diagnostic.test.ts" "debugging functions persist through reconnection" "Diagnostic: Persist debug"
run_test "test/e2e/web-cli/z-rate-limit-trigger.test.ts" "should trigger rate limit and require manual reconnection" "Rate Limit: Trigger and manual"

echo
echo "=== Test Results Summary ==="
echo "Completed at: $(date)"
echo
# Display results
for i in "${!test_names[@]}"; do
  echo "${test_results[$i]} ${test_names[$i]}"
done