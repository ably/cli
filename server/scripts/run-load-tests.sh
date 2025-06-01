#!/bin/bash

# Simple Load Testing Script for Ably CLI Terminal Server
# This script runs load tests one-off as requested

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Ably CLI Terminal Server Load Testing Suite ===${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the server directory${NC}"
    exit 1
fi

# CI-friendly configuration defaults
if [ "$CI" = "true" ] || [ "$GITHUB_ACTIONS" = "true" ]; then
    echo -e "${YELLOW}CI environment detected - using reduced resource limits${NC}"
    # Reduced limits for CI to prevent resource exhaustion
    export ANONYMOUS_SESSION_TEST_COUNT="${ANONYMOUS_SESSION_TEST_COUNT:-3}"
    export AUTHENTICATED_SESSION_TEST_COUNT="${AUTHENTICATED_SESSION_TEST_COUNT:-3}"
    export CONCURRENT_CONNECTION_TEST_COUNT="${CONCURRENT_CONNECTION_TEST_COUNT:-5}"
    export CONNECTION_DELAY_MS="${CONNECTION_DELAY_MS:-200}"
    export SESSION_DELAY_MS="${SESSION_DELAY_MS:-100}"
    export DISABLE_RATE_LIMITING_FOR_TESTS="true"
    echo -e "${BLUE}CI Configuration:${NC}"
    echo -e "  Anonymous sessions: $ANONYMOUS_SESSION_TEST_COUNT"
    echo -e "  Authenticated sessions: $AUTHENTICATED_SESSION_TEST_COUNT"
    echo -e "  Concurrent connections: $CONCURRENT_CONNECTION_TEST_COUNT"
else
    echo -e "${GREEN}Local environment detected - using default resource limits${NC}"
    # Default values for local testing (can be overridden by env vars)
    export ANONYMOUS_SESSION_TEST_COUNT="${ANONYMOUS_SESSION_TEST_COUNT:-10}"
    export AUTHENTICATED_SESSION_TEST_COUNT="${AUTHENTICATED_SESSION_TEST_COUNT:-10}"
    export CONCURRENT_CONNECTION_TEST_COUNT="${CONCURRENT_CONNECTION_TEST_COUNT:-12}"
    export CONNECTION_DELAY_MS="${CONNECTION_DELAY_MS:-100}"
    export SESSION_DELAY_MS="${SESSION_DELAY_MS:-50}"
    echo -e "${BLUE}Local Configuration:${NC}"
    echo -e "  Anonymous sessions: $ANONYMOUS_SESSION_TEST_COUNT"
    echo -e "  Authenticated sessions: $AUTHENTICATED_SESSION_TEST_COUNT"
    echo -e "  Concurrent connections: $CONCURRENT_CONNECTION_TEST_COUNT"
fi

echo ""

# Set default server URL if not provided
if [ -z "$TERMINAL_SERVER_URL" ]; then
    export TERMINAL_SERVER_URL="ws://localhost:8080"
    echo -e "${YELLOW}Using default server URL: $TERMINAL_SERVER_URL${NC}"
else
    echo -e "${GREEN}Using server URL: $TERMINAL_SERVER_URL${NC}"
fi

# Check if server is running (optional)
echo -e "${BLUE}Checking if terminal server is accessible...${NC}"
if command -v nc >/dev/null 2>&1; then
    SERVER_HOST=$(echo $TERMINAL_SERVER_URL | sed 's/ws[s]*:\/\///' | cut -d':' -f1)
    SERVER_PORT=$(echo $TERMINAL_SERVER_URL | sed 's/ws[s]*:\/\///' | cut -d':' -f2 | cut -d'/' -f1)
    
    if [ -z "$SERVER_PORT" ]; then
        SERVER_PORT=8080
    fi
    
    if nc -z "$SERVER_HOST" "$SERVER_PORT" 2>/dev/null; then
        echo -e "${GREEN}✓ Server appears to be running on $SERVER_HOST:$SERVER_PORT${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: Cannot connect to $SERVER_HOST:$SERVER_PORT${NC}"
        echo -e "${YELLOW}  Make sure the terminal server is running before starting tests${NC}"
        echo -e "${YELLOW}  Run: cd .. && pnpm terminal-server${NC}"
    fi
else
    echo -e "${YELLOW}⚠ Warning: 'nc' not available, skipping server connectivity check${NC}"
fi

echo ""

# Function to find and execute mocha reliably
find_and_run_mocha() {
    local test_file="$1"
    local grep_pattern="$2"
    
    # Ensure the test file is built
    if [ ! -f "$test_file" ]; then
        echo -e "${YELLOW}Building server first...${NC}"
        if ! npm run build >/dev/null 2>&1; then
            echo -e "${RED}✗ Build failed${NC}"
            return 1
        fi
    fi
    
    # Try different methods to run mocha, in order of preference
    
    # Method 1: Try pnpm exec (should work in pnpm workspaces)
    if command -v pnpm >/dev/null 2>&1; then
        echo -e "${BLUE}Trying pnpm exec mocha...${NC}"
        if pnpm exec mocha "$test_file" --grep "$grep_pattern" 2>/dev/null; then
            return 0
        fi
    fi
    
    # Method 2: Try npx (should work if mocha is in package.json)
    if command -v npx >/dev/null 2>&1; then
        echo -e "${BLUE}Trying npx mocha...${NC}"
        if npx mocha "$test_file" --grep "$grep_pattern" 2>/dev/null; then
            return 0
        fi
    fi
    
    # Method 3: Try global mocha
    if command -v mocha >/dev/null 2>&1; then
        echo -e "${BLUE}Trying global mocha...${NC}"
        if mocha "$test_file" --grep "$grep_pattern" 2>/dev/null; then
            return 0
        fi
    fi
    
    # Method 4: Try local mocha binary from parent workspace
    if [ -x "../node_modules/.bin/mocha" ]; then
        echo -e "${BLUE}Trying parent workspace mocha...${NC}"
        if ../node_modules/.bin/mocha "$test_file" --grep "$grep_pattern" 2>/dev/null; then
            return 0
        fi
    fi
    
    # Method 5: Try direct node execution with mocha from workspace
    if [ -f "../node_modules/mocha/bin/mocha.js" ]; then
        echo -e "${BLUE}Trying direct node execution...${NC}"
        if node ../node_modules/mocha/bin/mocha.js "$test_file" --grep "$grep_pattern" 2>/dev/null; then
            return 0
        fi
    fi
    
    # Method 6: Try to install mocha and run
    echo -e "${YELLOW}No working mocha found, trying to install...${NC}"
    if npm install --no-save mocha >/dev/null 2>&1; then
        if npx mocha "$test_file" --grep "$grep_pattern" 2>/dev/null; then
            return 0
        fi
    fi
    
    # All methods failed
    echo -e "${RED}✗ Could not execute mocha tests${NC}"
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo -e "  1. Try: cd .. && pnpm install"
    echo -e "  2. Try: npm install -g mocha"
    echo -e "  3. Or run manually: node dist/tests/performance/load-test.test.js"
    return 1
}

# Function to run a specific test category
run_test_category() {
    local category=$1
    local grep_pattern=$2
    
    echo -e "${BLUE}Running $category tests...${NC}"
    
    if find_and_run_mocha "dist/tests/performance/load-test.test.js" "$grep_pattern"; then
        echo -e "${GREEN}✓ $category tests completed${NC}"
        return 0
    else
        echo -e "${RED}✗ $category tests failed${NC}"
        return 1
    fi
}

# Parse command line arguments
case "$1" in
    "connection"|"connections")
        echo -e "${BLUE}Running Connection Rate Limiting tests only...${NC}"
        run_test_category "Connection Rate Limiting" "Connection Rate Limiting"
        ;;
    "session"|"sessions")
        echo -e "${BLUE}Running Session Management tests only...${NC}"
        run_test_category "Session Management" "Session Management"
        ;;
    "container"|"containers"|"docker")
        echo -e "${BLUE}Running Container Resource Limits tests only...${NC}"
        run_test_category "Container Resource Limits" "Container Resource Limits"
        ;;
    "performance"|"perf"|"benchmark")
        echo -e "${BLUE}Running Performance Benchmarks only...${NC}"
        run_test_category "Performance Benchmarks" "Performance Benchmarks"
        ;;
    "fast"|"ci")
        echo -e "${BLUE}Running fast CI-friendly tests...${NC}"
        echo -e "${YELLOW}Using reduced resource limits for fast execution${NC}"
        
        # Override with CI-friendly values
        export ANONYMOUS_SESSION_TEST_COUNT="3"
        export AUTHENTICATED_SESSION_TEST_COUNT="3"
        export CONCURRENT_CONNECTION_TEST_COUNT="5"
        export CONNECTION_DELAY_MS="200"
        export SESSION_DELAY_MS="100"
        export DISABLE_RATE_LIMITING_FOR_TESTS="true"
        
        # Run subset of tests for CI
        success_count=0
        total_count=2
        
        if run_test_category "Connection Rate Limiting" "Connection Rate Limiting"; then
            ((success_count++))
        fi
        echo ""
        
        if run_test_category "Session Management" "Session Management"; then
            ((success_count++))
        fi
        echo ""
        
        # Summary
        echo -e "${BLUE}=== Fast Load Testing Summary ===${NC}"
        echo -e "Completed: $success_count/$total_count test categories"
        
        if [ $success_count -eq $total_count ]; then
            echo -e "${GREEN}✓ Fast load tests completed successfully!${NC}"
            exit 0
        else
            echo -e "${RED}✗ Some fast load tests failed${NC}"
            exit 1
        fi
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [test-category]"
        echo ""
        echo "Test categories:"
        echo "  connection    - Run connection rate limiting tests"
        echo "  session       - Run session management tests" 
        echo "  container     - Run container resource limit tests"
        echo "  performance   - Run performance benchmark tests"
        echo "  fast          - Run fast CI-friendly subset of tests"
        echo "  all (default) - Run all load tests"
        echo ""
        echo "Environment variables:"
        echo "  TERMINAL_SERVER_URL                     - WebSocket URL (default: ws://localhost:8080)"
        echo "  ANONYMOUS_SESSION_TEST_COUNT            - Number of anonymous sessions to test"
        echo "  AUTHENTICATED_SESSION_TEST_COUNT        - Number of authenticated sessions to test"
        echo "  CONCURRENT_CONNECTION_TEST_COUNT        - Number of concurrent connections to test"
        echo "  CONNECTION_DELAY_MS                     - Delay between connections (ms)"
        echo "  SESSION_DELAY_MS                        - Delay between session attempts (ms)"
        echo "  DISABLE_RATE_LIMITING_FOR_TESTS         - Disable rate limiting (true/false)"
        echo ""
        echo "Examples:"
        echo "  $0                              # Run all tests"
        echo "  $0 fast                         # Run CI-friendly tests"
        echo "  $0 connection                   # Run connection tests only"
        echo "  CI=true $0 all                  # Run with CI resource limits"
        echo "  TERMINAL_SERVER_URL=wss://example.com $0  # Use custom server"
        exit 0
        ;;
    ""|"all")
        echo -e "${BLUE}Running all load tests...${NC}"
        echo -e "${YELLOW}This may take several minutes and consume significant resources${NC}"
        echo ""
        
        # Run all test categories
        success_count=0
        total_count=4
        
        if run_test_category "Connection Rate Limiting" "Connection Rate Limiting"; then
            ((success_count++))
        fi
        echo ""
        
        if run_test_category "Session Management" "Session Management"; then
            ((success_count++))
        fi
        echo ""
        
        if run_test_category "Container Resource Limits" "Container Resource Limits"; then
            ((success_count++))
        fi
        echo ""
        
        if run_test_category "Performance Benchmarks" "Performance Benchmarks"; then
            ((success_count++))
        fi
        echo ""
        
        # Summary
        echo -e "${BLUE}=== Load Testing Summary ===${NC}"
        echo -e "Completed: $success_count/$total_count test categories"
        
        if [ $success_count -eq $total_count ]; then
            echo -e "${GREEN}✓ All load tests completed successfully!${NC}"
            exit 0
        else
            echo -e "${RED}✗ Some load tests failed${NC}"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}Unknown test category: $1${NC}"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Load testing completed!${NC}" 