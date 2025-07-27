#!/bin/bash

# Script to run Web CLI E2E tests in parallel groups locally
# This mimics the CI parallel execution for local development

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we have the required environment variables
if [ -z "$E2E_ABLY_API_KEY" ]; then
    echo -e "${RED}Error: E2E_ABLY_API_KEY environment variable is not set${NC}"
    exit 1
fi

# Parse arguments
GROUP=${1:-all}
CONFIG_FILE=${2:-"test/e2e/web-cli/playwright-parallel.config.ts"}

echo -e "${BLUE}Web CLI E2E Parallel Test Runner${NC}"
echo "=================================="

# Function to run a test group
run_test_group() {
    local group=$1
    local tests=$2
    local description=$3
    
    echo -e "\n${YELLOW}Running $description${NC}"
    echo "Test files: $tests"
    
    export TEST_GROUP=$group
    
    # Run the tests
    if pnpm exec playwright test --config "$CONFIG_FILE" $tests; then
        echo -e "${GREEN}✓ $description passed${NC}"
        return 0
    else
        echo -e "${RED}✗ $description failed${NC}"
        return 1
    fi
}

# Build the project first
echo -e "${BLUE}Building project...${NC}"
pnpm run build
pnpm --filter @ably/react-web-cli build
(cd examples/web-cli && pnpm build)

# Install Playwright if needed
echo -e "${BLUE}Ensuring Playwright is installed...${NC}"
pnpm exec playwright install --with-deps chromium

# Track overall success
OVERALL_SUCCESS=true

case $GROUP in
    "auth")
        run_test_group "auth" \
            "test/e2e/web-cli/authentication.test.ts test/e2e/web-cli/domain-scoped-auth.test.ts" \
            "Authentication & Security Tests (18 tests)" || OVERALL_SUCCESS=false
        ;;
    
    "session")
        run_test_group "session" \
            "test/e2e/web-cli/session-resume.test.ts test/e2e/web-cli/reconnection.test.ts test/e2e/web-cli/reconnection-diagnostic.test.ts" \
            "Session & Reconnection Tests (10 tests)" || OVERALL_SUCCESS=false
        ;;
    
    "ui")
        run_test_group "ui" \
            "test/e2e/web-cli/terminal-ui.test.ts test/e2e/web-cli/web-cli.test.ts test/e2e/web-cli/prompt-integrity.test.ts" \
            "UI & Core Features Tests (8 tests)" || OVERALL_SUCCESS=false
        ;;
    
    "rate-limit")
        run_test_group "rate-limit" \
            "test/e2e/web-cli/z-rate-limit-trigger.test.ts" \
            "Rate Limit Test (1 test)" || OVERALL_SUCCESS=false
        ;;
    
    "all")
        echo -e "${BLUE}Running all test groups in sequence...${NC}"
        
        # Run each group with appropriate delays between them
        run_test_group "auth" \
            "test/e2e/web-cli/authentication.test.ts test/e2e/web-cli/domain-scoped-auth.test.ts" \
            "Authentication & Security Tests (18 tests)" || OVERALL_SUCCESS=false
        
        echo -e "${YELLOW}Waiting 30s between test groups...${NC}"
        sleep 30
        
        run_test_group "session" \
            "test/e2e/web-cli/session-resume.test.ts test/e2e/web-cli/reconnection.test.ts test/e2e/web-cli/reconnection-diagnostic.test.ts" \
            "Session & Reconnection Tests (10 tests)" || OVERALL_SUCCESS=false
        
        echo -e "${YELLOW}Waiting 30s between test groups...${NC}"
        sleep 30
        
        run_test_group "ui" \
            "test/e2e/web-cli/terminal-ui.test.ts test/e2e/web-cli/web-cli.test.ts test/e2e/web-cli/prompt-integrity.test.ts" \
            "UI & Core Features Tests (8 tests)" || OVERALL_SUCCESS=false
        
        echo -e "${YELLOW}Waiting 30s before rate limit test...${NC}"
        sleep 30
        
        run_test_group "rate-limit" \
            "test/e2e/web-cli/z-rate-limit-trigger.test.ts" \
            "Rate Limit Test (1 test)" || OVERALL_SUCCESS=false
        ;;
    
    *)
        echo -e "${RED}Invalid test group: $GROUP${NC}"
        echo "Valid groups: auth, session, ui, rate-limit, all"
        exit 1
        ;;
esac

# Summary
echo -e "\n${BLUE}Test Summary${NC}"
echo "============"

if [ "$OVERALL_SUCCESS" = true ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    echo "Check the output above for details"
    exit 1
fi