# Ably CLI Terminal Server

This directory contains the WebSocket terminal server that provides a secure, containerized bash environment for the Ably CLI Web interface.

## Overview

The terminal server enables users to run Ably CLI commands through a web browser by:
- Accepting WebSocket connections from the React Web CLI component
- Creating secure Docker containers with restricted capabilities
- Proxying terminal I/O between the web client and containerized CLI
- Managing session lifecycle, authentication, and cleanup

## Directory Structure

```
server/
├── src/                          # Server source code
│   ├── index.ts                  # Main server entry point
│   ├── types/                    # TypeScript type definitions
│   ├── services/                 # Core services (modular architecture)
│   ├── utils/                    # Utility functions
│   └── config/                   # Configuration management
├── docker/                       # Docker container configuration
├── scripts/                      # Deployment and utility scripts
├── tests/                        # Server-specific tests
│   ├── unit/                     # Unit tests
│   ├── integration/              # Integration tests
│   └── performance/              # Load and performance tests
├── package.json                  # Server dependencies
└── tsconfig.json                 # TypeScript configuration
```

## Development

### Prerequisites
- Node.js 22.0.0 or higher
- Docker (for container management)
- pnpm (package manager)

### Setup
```bash
# Install dependencies
pnpm install

# Build the server
pnpm build

# Start the server
pnpm start
```

### Development Commands
```bash
# Development with hot reload
pnpm dev

# Run all tests
pnpm test

# Run specific test suites
pnpm test:unit         # Unit tests
pnpm test:integration  # Integration tests
pnpm test:security     # Security tests

# Load testing (requires external server)
pnpm test:load:fast    # Fast load tests (CI-friendly)
pnpm test:load:ci      # CI-optimized load tests
pnpm test:load         # Full load tests

# Linting and cleanup
pnpm lint
pnpm clean
```

## Load Testing

The server includes comprehensive load testing to validate performance and reliability under stress.

### Quick Start
```bash
# Terminal 1: Start the server
pnpm terminal-server

# Terminal 2: Run fast load tests
pnpm test:load:fast
```

### Test Categories
- **Connection Rate Limiting**: Tests concurrent connection handling and rate limiting
- **Session Management**: Tests session creation, limits, and cleanup
- **Container Resource Limits**: Tests Docker container creation and resource constraints
- **Performance Benchmarks**: Measures connection and session creation times

### Configuration
Load tests automatically adjust based on environment:

**Local Development (Default):**
- 10 anonymous sessions, 10 authenticated sessions
- 12 concurrent connections
- Full rate limiting enabled

**CI Environment (Auto-detected):**
- 3 anonymous sessions, 3 authenticated sessions  
- 5 concurrent connections
- Rate limiting disabled for stability

**Custom Configuration:**
```bash
# Custom resource limits
ANONYMOUS_SESSION_TEST_COUNT=5 pnpm test:load:fast

# Custom server URL
TERMINAL_SERVER_URL=wss://my-server.com pnpm test:load:fast

# Force CI mode locally
CI=true pnpm test:load:fast
```

## Features

### Core Functionality
- WebSocket connections on configurable ports
- Docker container management with security hardening
- Session management with authentication
- Reconnection and session resumption
- Resource cleanup and monitoring

### Security Features
- Read-only root filesystem
- User namespace remapping
- AppArmor profiles
- Seccomp filtering
- Network restrictions
- Resource limits (memory, CPU, processes)
- Rate limiting and DoS protection

### Monitoring & Debugging
- Health check endpoints (`/health`, `/stats`)
- Session/container reconciliation (`/reconcile`)
- Comprehensive logging and audit trails
- Performance monitoring and metrics
- Automatic cleanup and resource recovery

### Enhanced Reliability (Phases 2-6)
- Container leak prevention
- Synchronized session and container cleanup
- Intelligent server startup cleanup
- Continuous health monitoring
- Multi-server deployment awareness
- Graceful shutdown and error handling 