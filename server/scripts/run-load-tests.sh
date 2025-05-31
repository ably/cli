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
    fi
else
    echo -e "${YELLOW}⚠ Warning: 'nc' not available, skipping server connectivity check${NC}"
fi

echo ""

# Function to run a specific test category
run_test_category() {
    local category=$1
    local grep_pattern=$2
    
    echo -e "${BLUE}Running $category tests...${NC}"
    if npm test -- tests/performance/load-test.test.ts --grep "$grep_pattern" 2>/dev/null; then
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
    "help"|"-h"|"--help")
        echo "Usage: $0 [test-category]"
        echo ""
        echo "Test categories:"
        echo "  connection    - Run connection rate limiting tests"
        echo "  session       - Run session management tests" 
        echo "  container     - Run container resource limit tests"
        echo "  performance   - Run performance benchmark tests"
        echo "  all (default) - Run all load tests"
        echo ""
        echo "Environment variables:"
        echo "  TERMINAL_SERVER_URL - WebSocket URL of terminal server (default: ws://localhost:8080)"
        echo ""
        echo "Examples:"
        echo "  $0                              # Run all tests"
        echo "  $0 connection                   # Run connection tests only"
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