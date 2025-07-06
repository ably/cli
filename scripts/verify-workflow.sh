#!/bin/bash
# Workflow verification script - ensures all required steps are completed

set -e

echo "🔍 Verifying development workflow..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
WORKFLOW_PASSED=true

# Step 1: Build
echo -e "\n1️⃣  Running build..."
if pnpm prepare > /tmp/build.log 2>&1; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    cat /tmp/build.log
    WORKFLOW_PASSED=false
fi

# Step 2: Lint
echo -e "\n2️⃣  Running linter..."
if pnpm exec eslint . > /tmp/lint.log 2>&1; then
    echo -e "${GREEN}✓ Linting passed${NC}"
else
    echo -e "${RED}✗ Linting failed${NC}"
    cat /tmp/lint.log
    WORKFLOW_PASSED=false
fi

# Step 3: Tests
echo -e "\n3️⃣  Running unit tests..."
if pnpm test:unit > /tmp/test.log 2>&1; then
    echo -e "${GREEN}✓ Unit tests passed${NC}"
else
    echo -e "${RED}✗ Unit tests failed${NC}"
    tail -50 /tmp/test.log
    WORKFLOW_PASSED=false
fi

# Step 4: Check for debug artifacts
echo -e "\n4️⃣  Checking for debug artifacts..."
DEBUG_FILES=$(find . -name "test-*.mjs" -o -name "*debug*.ts" -o -name "*debug*.js" 2>/dev/null | grep -v node_modules | grep -v dist || true)
if [ -z "$DEBUG_FILES" ]; then
    echo -e "${GREEN}✓ No debug artifacts found${NC}"
else
    echo -e "${YELLOW}⚠ Found debug artifacts:${NC}"
    echo "$DEBUG_FILES"
    echo -e "${YELLOW}Please clean up these files${NC}"
fi

# Check for console.log statements
CONSOLE_LOGS=$(grep -r "console\.log" src/ --include="*.ts" --include="*.js" 2>/dev/null || true)
if [ -z "$CONSOLE_LOGS" ]; then
    echo -e "${GREEN}✓ No console.log statements found${NC}"
else
    echo -e "${YELLOW}⚠ Found console.log statements:${NC}"
    echo "$CONSOLE_LOGS" | head -10
    echo -e "${YELLOW}Consider removing or converting to proper logging${NC}"
fi

# Summary
echo -e "\n📋 Workflow Summary:"
if [ "$WORKFLOW_PASSED" = true ]; then
    echo -e "${GREEN}✅ All workflow steps passed!${NC}"
    echo -e "${GREEN}Your changes are ready for commit.${NC}"
    exit 0
else
    echo -e "${RED}❌ Workflow verification failed!${NC}"
    echo -e "${RED}Please fix the issues above before committing.${NC}"
    exit 1
fi