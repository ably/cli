#!/bin/bash
# Run web-cli tests with optimized rate limiting settings

echo "Running web-cli tests with optimized rate limiting..."
echo "Using AGGRESSIVE rate limit config (9 connections per batch, 61s pause)"
echo ""

# Use aggressive rate limiting for faster local testing
export RATE_LIMIT_CONFIG=AGGRESSIVE

# Run the tests
pnpm test:e2e:web-cli

# For even faster testing without rate limits (use with caution):
# export DISABLE_RATE_LIMIT=true
# pnpm test:e2e:web-cli