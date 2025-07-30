#!/bin/bash

# Script to run Web CLI E2E tests against a local server
# This is useful for testing against a locally running web CLI server

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEFAULT_SERVER_URL="http://localhost:3000"
SERVER_URL=${WEB_CLI_SERVER_URL:-$DEFAULT_SERVER_URL}

echo -e "${BLUE}Web CLI E2E Tests - Local Server${NC}"
echo "================================="
echo "Server URL: $SERVER_URL"

# Check if we have the required environment variables
if [ -z "$E2E_ABLY_API_KEY" ]; then
    echo -e "${RED}Error: E2E_ABLY_API_KEY environment variable is not set${NC}"
    exit 1
fi

# Parse arguments
TEST_PATTERN=${1:-"test/e2e/web-cli/*.test.ts"}
CONFIG_FILE=${2:-"test/e2e/web-cli/playwright.config.ts"}

# Export the server URL for tests to use
export WEB_CLI_SERVER_URL="$SERVER_URL"

# Check if server is running
echo -e "${BLUE}Checking if server is running at $SERVER_URL...${NC}"
if ! curl -s -o /dev/null -w "%{http_code}" "$SERVER_URL" | grep -q "200\|301\|302"; then
    echo -e "${RED}Error: Server is not responding at $SERVER_URL${NC}"
    echo "Please start the web CLI server first with: pnpm --filter @ably/react-web-cli dev"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"

# Build the project first
echo -e "${BLUE}Building project...${NC}"
pnpm run build

# Install Playwright if needed
echo -e "${BLUE}Ensuring Playwright is installed...${NC}"
pnpm exec playwright install --with-deps chromium

# Run the tests
echo -e "${BLUE}Running tests...${NC}"
echo "Test pattern: $TEST_PATTERN"

if pnpm exec playwright test --config "$CONFIG_FILE" $TEST_PATTERN; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi