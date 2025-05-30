# Ably CLI Terminal Server Setup & Overview

This document describes the Ably CLI Terminal Server, its purpose, how it works, and how to set it up as a systemd service on a fresh Ubuntu server (tested on 22.04 LTS and 24.04 LTS), including **Caddy** as a reverse proxy for automatic HTTPS using Let's Encrypt.

## Overview

The Terminal Server is a WebSocket server that allows users to interact with the Ably CLI through a web interface (like the example in `examples/web-cli`). It creates a secure, containerized environment where CLI commands can be executed remotely.

### How It Works

1. The server runs a secure Docker container (`ably-cli-sandbox`) that encapsulates the Ably CLI and its dependencies.
2. It establishes WebSocket connections (via WSS when using Caddy) to handle client requests.
3. **Authentication passthrough**: The server passes credentials directly to the Ably CLI without validation - authentication is handled by the Ably SDK within the container.
4. Commands sent by clients are executed within the restricted container environment.
5. Output from the commands is streamed back to the client in real-time.

### Authentication Model

**Important**: The terminal server does **NOT** verify Ably API keys or tokens. Instead:

- Credentials are passed directly from the client to the Ably CLI within the container
- Authentication and authorization are handled by the Ably SDK/API
- The server validates the session integrity and prevents session hijacking
- Rate limiting protects against abuse, but doesn't validate API credentials
- Invalid credentials will result in Ably API errors being returned to the client

This design allows the server to support all Ably authentication methods (API keys, tokens, client certificates) without needing to understand or validate them.

## Prerequisites

- A server running Ubuntu 22.04 LTS (Jammy Jellyfish) or 24.04 LTS (Noble Numbat).
- `sudo` privileges on the server.
- A registered **domain name** (e.g., `your-domain.example.com`) with **DNS A and/or AAAA records** pointing to the public IP address of your server.
- Internet connectivity to download dependencies and clone the repository.
- **Ports 80 and 443** open on your server's firewall (e.g., AWS Security Group) to allow incoming HTTP and HTTPS traffic for Let's Encrypt certificate validation and Caddy operation.

## Quick Setup

This single command downloads the setup script from the GitHub repository and executes it. It handles installing dependencies (Node.js, pnpm, Docker, Caddy), cloning the repository, building the project, creating a service user, and setting up the systemd services for both the terminal server and Caddy.

**Security Warning:** Always review scripts from the internet before running them with `sudo`.

### Installing from the main branch:

```bash
curl -sSL https://raw.githubusercontent.com/ably/cli/main/server/scripts/setup-server.sh > /tmp/setup.sh && chmod +x /tmp/setup.sh && sudo -E /tmp/setup.sh
```

### Installing from a custom branch:

```bash
# Replace 'your-branch-name' with the desired branch name
BRANCH="your-branch-name" bash -c 'curl -sSL "https://raw.githubusercontent.com/ably/cli/${BRANCH}/server/scripts/setup-server.sh" > /tmp/setup.sh && chmod +x /tmp/setup.sh && BRANCH="${BRANCH}" sudo -E /tmp/setup.sh'
```

For example, to install from a branch named `feature/container-hardening`:

```bash
BRANCH="feature/container-hardening" bash -c 'curl -sSL "https://raw.githubusercontent.com/ably/cli/${BRANCH}/server/scripts/setup-server.sh" > /tmp/setup.sh && chmod +x /tmp/setup.sh && BRANCH="${BRANCH}" sudo -E /tmp/setup.sh'
```

The setup script will automatically use the specified branch when cloning the repository for installation.

## Post-Setup Configuration

After the script completes successfully, you **must** configure the environment variables:

1.  **Edit the configuration file:**
    ```bash
    sudo nano /etc/ably-terminal-server/config.env
    ```

2.  **Set required variables:**
    *   `SERVER_DOMAIN`: **REQUIRED.** Replace `your-domain.example.com` with the actual domain name pointing to your server. Caddy uses this for automatic HTTPS.
    *   `ADMIN_EMAIL`: **REQUIRED.** Replace `your-email@example.com` with your email address. Let's Encrypt uses this for certificate expiration notices.
    *   `TERMINAL_SERVER_PORT`: Ensure this is the desired internal port for the Node.js WebSocket server (default is `8080`). This port does **not** need to be exposed publicly; Caddy proxies traffic to it.
    *   Review optional variables like `DOCKER_IMAGE_NAME` and `MAX_SESSIONS` if needed.

3.  **Save and close** the file (Ctrl+X, then Y, then Enter in `nano`).

4.  **Verify DNS:** Double-check that your domain name's DNS records are correctly pointing to your server's public IP address. DNS changes can take time to propagate.

## Starting and Managing the Services

Once configured, you can manage the services using `systemctl`:

*   **Start the services (first time):**
    ```bash
    # Start the backend Node.js server first
    sudo systemctl start ably-terminal-server
    # Then start the Caddy reverse proxy
    sudo systemctl start caddy
    ```

*   **Check the status:**
    ```bash
    # Check Node.js backend
    sudo systemctl status ably-terminal-server
    # Check Caddy proxy (useful for HTTPS issues)
    sudo systemctl status caddy
    ```

*   **View live logs:**
    ```bash
    # View Node.js backend logs
    sudo journalctl -f -u ably-terminal-server
    # View Caddy logs (useful for HTTPS issues)
    sudo journalctl -f -u caddy
    ```

*   **Stop the services:**
    ```bash
    sudo systemctl stop caddy
    sudo systemctl stop ably-terminal-server
    ```

*   **Restart the services (after configuration changes):**
    ```bash
    sudo systemctl restart ably-terminal-server
    sudo systemctl restart caddy
    ```

*   **Enable the services to start on boot (already done by the script):**
    ```bash
    sudo systemctl enable ably-terminal-server
    sudo systemctl enable caddy
    ```

*   **Disable the services from starting on boot:**
    ```bash
    sudo systemctl disable caddy
    sudo systemctl disable ably-terminal-server
    ```

## Diagnostics

If you encounter issues with the CLI, the Web CLI example, or the terminal server, you can run diagnostic scripts to help identify the problem.

### Container Diagnostics

This script tests the `ably-cli-sandbox` Docker image itself, verifying its build process, internal permissions, and script execution independent of the running terminal server.

To test the container:

```bash
cd /path/to/ably/cli

# Run using pnpm
pnpm diagnostics:container
```

*(Note: This script uses `sudo` internally if needed for Docker commands)*

This script will:
    - Build the `ably-cli-sandbox` image.
    - Run basic checks inside the container (user, permissions).
    - Attempt to execute the internal scripts (`network-security.sh`, `restricted-shell.sh`) in a test mode.
    - Attempt to start the container with its default entrypoint, **providing dummy Ably credentials** for basic startup validation.
    - Report success or failure at each step.

Review the output of this script to diagnose container-specific issues.

### Server Diagnostics

This script tests the connection and basic functionality of a *running* terminal server instance. It connects to the server, sends dummy credentials, and attempts to run a simple command (`ably help`).

**To test the default local server (ws://localhost:8080):**

```bash
# Navigate to the project root
cd /path/to/ably/cli

# Run the script
pnpm diagnostics:server
```

**To test a remote or custom server:**

```bash
# Navigate to the project root
cd /path/to/ably/cli

# Set the URL environment variable OR pass as an argument
TERMINAL_SERVER_URL="wss://your-server-domain.com" pnpm diagnostics:server
# OR
pnpm diagnostics:server wss://your-server-domain.com
```

This script helps verify if the terminal server is reachable, accepting connections, authenticating correctly (with dummy credentials), and responding to basic commands.

## Role of Caddy

Caddy acts as a secure entry point to your terminal server:

-   **Reverse Proxy:** It listens on standard HTTPS port 443 and forwards valid requests to the Node.js terminal server running internally (e.g., on `localhost:8080`).
-   **Automatic HTTPS:** It automatically obtains and renews TLS certificates from Let's Encrypt for the configured `SERVER_DOMAIN`.
-   **WebSocket Proxying:** The configuration includes necessary headers for WebSocket connections to function correctly through the proxy.

## Script Details (`server/scripts/setup-server.sh`)

The setup script performs the following actions:

1. System Checks.
2. Install Prerequisites (incl. `ufw` for firewall).
3. Install Docker.
4. Install Node.js & pnpm.
5. **Install Caddy:** Installs the Caddy web server using its official repository.
6. Create Service User/Group (`ablysrv`).
7. Clone Repository.
8. Set Permissions.
9. Install Dependencies & Build.
10. Install AppArmor Profile.
11. **Create Configuration:** Creates `/etc/ably-terminal-server/config.env` with placeholders for domain, email, and ports.
12. **Create Node.js Systemd Service:** Creates `/etc/systemd/system/ably-terminal-server.service`.
13. **Create Caddyfile:** Creates `/etc/caddy/Caddyfile` with reverse proxy configuration using environment variables.
14. **Configure Caddy Systemd Service:** Adds an override to load environment variables for Caddy.
15. **Configure Firewall:** Allows SSH, HTTP (port 80), and HTTPS (port 443) through UFW.
16. **Enable Services:** Reloads systemd and enables both `ably-terminal-server` and `caddy` services to start on boot.
17. Provides Instructions.

## Operational Runbook

This section provides operational procedures for managing the terminal server in production.

### Daily Operations

#### Health Checks
```bash
# Check service status
sudo systemctl status ably-terminal-server
sudo systemctl status caddy

# Check service logs for errors
sudo journalctl -u ably-terminal-server --since "1 hour ago" | grep -i error
sudo journalctl -u caddy --since "1 hour ago" | grep -i error

# Verify HTTPS certificate status
curl -I https://your-domain.example.com/health

# Check container resource usage
docker stats --no-stream | grep ably-cli-sandbox
```

#### Rate Limiting Monitoring
```bash
# Check for rate limiting events
sudo journalctl -u ably-terminal-server --since "1 hour ago" | grep -i "rate"

# Monitor active sessions
sudo journalctl -u ably-terminal-server --since "1 hour ago" | grep "session_created\|session_terminated"

# Check for security events
sudo journalctl -u ably-terminal-server --since "1 hour ago" | grep "AUDIT"
```

### Weekly Operations

#### Performance Review
```bash
# Analyze session duration patterns
sudo journalctl -u ably-terminal-server --since "1 week ago" | grep "session_duration" | awk '{print $NF}' | sort -n

# Check memory and CPU trends
# (Requires monitoring system integration)

# Review rate limiting effectiveness
sudo journalctl -u ably-terminal-server --since "1 week ago" | grep "rate_limit" | wc -l
```

#### Security Audit
```bash
# Review security events
sudo journalctl -u ably-terminal-server --since "1 week ago" | grep "severity.*high\|severity.*critical"

# Check for failed authentication attempts
sudo journalctl -u ably-terminal-server --since "1 week ago" | grep "authentication_failed"

# Verify container security settings
docker inspect ably-cli-sandbox | jq '.[]|{SecurityOpt,ReadonlyRootfs,HostConfig.PidsLimit}'
```

### Monthly Operations

#### Configuration Review
- Review and update rate limiting thresholds based on usage patterns
- Update security configurations if needed
- Check for software updates (Node.js, Docker, Caddy)
- Review SSL certificate renewal (automated but verify)

#### Backup and Recovery
```bash
# Backup configuration
sudo cp /etc/ably-terminal-server/config.env /backup/ably-config-$(date +%Y%m%d).env

# Test disaster recovery procedures
# (Should be documented separately)
```

### Incident Response

#### High CPU/Memory Usage
```bash
# Identify resource-heavy containers
docker stats --no-stream

# Check for runaway processes
sudo journalctl -u ably-terminal-server --since "30 minutes ago" | grep "memory\|cpu"

# Emergency container cleanup
docker container prune -f

# Restart service if necessary
sudo systemctl restart ably-terminal-server
```

#### SSL Certificate Issues
```bash
# Check certificate status
sudo caddy validate --config /etc/caddy/Caddyfile

# Force certificate renewal
sudo systemctl restart caddy

# Check Let's Encrypt rate limits
sudo journalctl -u caddy | grep -i "rate limit"
```

#### Security Incidents
```bash
# Emergency: Disable service
sudo systemctl stop ably-terminal-server

# Review recent connections
sudo journalctl -u ably-terminal-server --since "1 hour ago" | grep "connection_established"

# Block specific IPs (if needed)
sudo ufw deny from <suspicious-ip>

# Generate incident report
sudo journalctl -u ably-terminal-server --since "2 hours ago" > incident-$(date +%Y%m%d-%H%M).log
```

### Scaling Operations

#### Horizontal Scaling
The terminal server can be scaled horizontally by:

1. **Load Balancer Setup**
   - Deploy multiple server instances
   - Use sticky sessions for WebSocket connections
   - Configure health checks on `/health` endpoint

2. **Session Persistence**
   - Consider external session storage (Redis) for multi-instance deployments
   - Update rate limiting to use shared storage

3. **Container Orchestration**
   - Use Docker Swarm or Kubernetes for container management
   - Implement auto-scaling based on CPU/memory metrics

#### Vertical Scaling
```bash
# Increase container resource limits
# Edit /etc/ably-terminal-server/config.env
MAX_MEMORY_MB=512
MAX_SESSIONS_PER_USER=5

# Update Docker daemon settings for more containers
sudo systemctl edit docker.service
# Add:
# [Service]
# ExecStart=
# ExecStart=/usr/bin/dockerd --max-concurrent-downloads=6 --default-ulimit nofile=65536:65536
```

### Monitoring Integration

#### Prometheus Metrics
The server can expose metrics for Prometheus monitoring:

```bash
# Enable metrics endpoint
ENABLE_METRICS=true
METRICS_PORT=9090

# Add to /etc/ably-terminal-server/config.env
```

#### Log Aggregation
For centralized logging:

```bash
# Configure log forwarding to ELK/Grafana
# Add to systemd service:
sudo systemctl edit ably-terminal-server

[Service]
Environment=LOG_LEVEL=2
Environment=STRUCTURED_LOGGING=true
```

### Backup and Recovery

#### Configuration Backup
```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/backup/ably-terminal-server"
DATE=$(date +%Y%m%d)

mkdir -p "$BACKUP_DIR"
sudo cp -r /etc/ably-terminal-server/ "$BACKUP_DIR/config-$DATE/"
sudo cp /etc/caddy/Caddyfile "$BACKUP_DIR/caddy-$DATE.conf"
sudo systemctl status ably-terminal-server > "$BACKUP_DIR/status-$DATE.txt"
```

#### Disaster Recovery
```bash
# Restore from backup
sudo systemctl stop ably-terminal-server caddy
sudo cp -r /backup/ably-terminal-server/config-latest/* /etc/ably-terminal-server/
sudo cp /backup/ably-terminal-server/caddy-latest.conf /etc/caddy/Caddyfile
sudo systemctl start caddy ably-terminal-server
```

### Performance Tuning

#### Node.js Optimization
```bash
# Add to /etc/ably-terminal-server/config.env
NODE_OPTIONS="--max-old-space-size=2048 --gc-interval=100"
UV_THREADPOOL_SIZE=16
```

#### Docker Optimization
```bash
# Optimize Docker daemon
sudo nano /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2"
}
```

### Troubleshooting Guide

#### Common Issues

**WebSocket Connection Failures**
1. Check Caddy proxy configuration
2. Verify SSL certificate validity
3. Check firewall rules (ports 80, 443)
4. Review WebSocket upgrade headers

**Container Creation Failures**
1. Check Docker daemon status
2. Verify image availability: `docker images | grep ably-cli-sandbox`
3. Check resource limits and available memory
4. Review security profile conflicts

**High Resource Usage**
1. Monitor container resource consumption
2. Check for memory leaks in long-running sessions
3. Review rate limiting effectiveness
4. Consider session timeout adjustments

**Authentication Issues**
Remember: The server doesn't validate Ably credentials
1. Check if Ably API is accessible from container
2. Verify network connectivity to Ably endpoints
3. Review client-side credential passing
4. Check for API key format issues in client

## References

For more detailed information, see:
- [Rate Limiting Documentation](Rate-Limiting.md)
- [Security Hardening](Security-Hardening.md)
- [Container Security](Container-Security.md)
- [Troubleshooting Guide](Troubleshooting.md)
