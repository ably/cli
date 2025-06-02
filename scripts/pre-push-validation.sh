#!/bin/bash
set -e

echo "🚀 Running Pre-Push Validation..."

# Global cleanup function
cleanup() {
  if [ -n "$SERVER_PID" ] && ps -p $SERVER_PID > /dev/null 2>&1; then
    echo "   Cleaning up: stopping terminal server (PID: $SERVER_PID)..."
    kill -TERM $SERVER_PID 2>/dev/null || true
    sleep 2
    # Force kill if still running
    if ps -p $SERVER_PID > /dev/null 2>&1; then
      kill -KILL $SERVER_PID 2>/dev/null || true
    fi
  fi
  
  # Also kill any orphaned processes
  pkill -f "bin/run.js.*subscribe" 2>/dev/null || true
  pkill -f "terminal-server" 2>/dev/null || true
}

# Set trap to ensure cleanup runs on any exit
trap cleanup EXIT INT TERM

# Helper function to find a free port
find_free_port() {
  # Use Node.js to find a free port starting from a base port
  local base_port=${1:-8080}
  node -e "
    const net = require('net');
    function findFreePort(startPort) {
      return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, () => {
          const port = server.address().port;
          server.close(() => resolve(port));
        });
        server.on('error', () => {
          findFreePort(startPort + 1).then(resolve).catch(reject);
        });
      });
    }
    findFreePort($base_port).then(port => {
      console.log(port);
      process.exit(0);
    }).catch(err => {
      console.error('Failed to find free port:', err);
      process.exit(1);
    });
  "
}

# Step 1: Build and prepare
echo "📦 Step 1: Building project..."
pnpm prepare

# Step 2: Lint check
echo "🧹 Step 2: Running linter..."
pnpm exec eslint .

# Step 3: Unit tests (fast)
echo "🧪 Step 3: Running unit tests..."
pnpm test:unit --reporter min

# Step 4: Basic E2E tests (critical path)
echo "🎯 Step 4: Running basic E2E tests..."
pnpm test:e2e:basic --reporter min

# Step 5: Integration tests
echo "🔗 Step 5: Running integration tests..."
pnpm test:integration --reporter min

# Step 6: Server tests
echo "🖥️  Step 6: Running server tests..."
cd server && pnpm test:unit --reporter min && cd ..

# Step 7: Fast load tests (with local server)
echo "🚀 Step 7: Running fast load tests..."
echo "   Finding free ports for test servers..."

# Find free ports to avoid collisions
TERMINAL_PORT=$(find_free_port 8080)
DIAGNOSTICS_PORT=$(find_free_port $((TERMINAL_PORT + 1)))

echo "   Using terminal server port: $TERMINAL_PORT"
echo "   Using diagnostics server port: $DIAGNOSTICS_PORT"

# Build server first
echo "   Building terminal server..."
cd server && pnpm build

# Start terminal server in background with detected port
echo "   Starting terminal server on port $TERMINAL_PORT..."
PORT=$TERMINAL_PORT pnpm start &
SERVER_PID=$!
echo "   Terminal server started with PID: $SERVER_PID"

# Wait for server to be ready (max 30 seconds)
echo "   Waiting for terminal server to start..."
for i in {1..30}; do
  if nc -z localhost $TERMINAL_PORT 2>/dev/null; then
    echo "   ✅ Terminal server is ready on port $TERMINAL_PORT"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "   ❌ Terminal server failed to start within 30 seconds"
    exit 1
  fi
  sleep 1
done

# Run fast load tests with the detected port
echo "   Running fast load tests..."
TERMINAL_PORT=$TERMINAL_PORT DIAGNOSTICS_PORT=$DIAGNOSTICS_PORT pnpm test:load:ci --reporter min
LOAD_TEST_EXIT_CODE=$?

# Return to root directory
cd ..

# Check if load tests passed (cleanup will be handled by trap)
if [ $LOAD_TEST_EXIT_CODE -ne 0 ]; then
    echo "❌ Fast load tests failed"
    exit 1
fi

echo "✅ All pre-push validation steps completed successfully!"
echo ""
echo "🎉 Your code is ready for push!" 