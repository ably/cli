#!/bin/bash

# Fast Load Testing Script for Ably CLI Terminal Server
# This script runs load tests with relaxed rate limiting for faster execution

echo "🚀 Starting Fast Load Tests for Ably CLI Terminal Server"
echo ""

# Check if server is running
if ! curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo "❌ Terminal server is not running on localhost:8080"
    echo "   Please start the server first with: pnpm start"
    exit 1
fi

echo "✅ Server detected on localhost:8080"
echo ""

# Set environment variables for faster testing
export DISABLE_RATE_LIMITING_FOR_TESTS=true
export MAX_CONNECTIONS_PER_IP_PER_MINUTE=1000
export CONNECTION_THROTTLE_WINDOW_MS=5000
export MAX_RESUME_ATTEMPTS_PER_SESSION_PER_MINUTE=100

echo "🔧 Test Configuration:"
echo "   - Rate limiting: DISABLED"
echo "   - Max connections per IP: 1000/minute"
echo "   - Throttle window: 5 seconds"
echo "   - Max resume attempts: 100/minute"
echo ""

echo "🧪 Running optimized load tests..."
echo ""

# Run the load tests
npm test tests/performance/load-test.test.ts

exit_code=$?

echo ""
if [ $exit_code -eq 0 ]; then
    echo "✅ All load tests completed successfully!"
else
    echo "❌ Some load tests failed (exit code: $exit_code)"
    echo ""
    echo "💡 If tests are still failing due to rate limiting:"
    echo "   1. Wait a few minutes for rate limits to clear"
    echo "   2. Restart the server to reset rate limiting state"
    echo "   3. Or temporarily disable rate limiting in server config"
fi

echo ""
echo "🏁 Fast load testing complete"
exit $exit_code 