# Docker Container Security Hardening

This document outlines the security measures implemented to harden the Docker containers used in the Ably CLI's web terminal feature.

## Security Architecture Overview

The terminal server implements a defense-in-depth security model:

1. **Authentication Passthrough**: Server validates session integrity without inspecting Ably credentials
2. **Container Isolation**: Each session runs in a heavily restricted Docker container
3. **Network Security**: Controlled network access with restricted outbound connections
4. **Resource Limits**: Comprehensive resource controls to prevent abuse
5. **Monitoring & Audit**: Extensive logging and security event tracking

### Authentication Security Model

**Important Security Note**: The terminal server does NOT validate Ably API keys or tokens. This design provides several security benefits:

- **Credential Protection**: Server never stores or processes sensitive Ably credentials
- **Forward Compatibility**: Supports all current and future Ably authentication methods
- **Reduced Attack Surface**: Server cannot be compromised to access stored credentials
- **Audit Trail**: All authentication is handled by Ably's systems with proper audit logging

Instead, the server focuses on:
- Session integrity protection (preventing session hijacking)
- Rate limiting to prevent abuse
- Container security to isolate execution
- Network controls to limit unauthorized access

## Implemented Security Measures

### 1. Filesystem Security

We've implemented a read-only filesystem approach with controlled write access:

- Set `ReadonlyRootfs: true` to make the container's root filesystem read-only
- Added tmpfs mounts for necessary writable directories with `noexec` flag:
  - `/tmp`: 64MB with `rw,noexec,nosuid` flags
  - `/run`: 32MB with `rw,noexec,nosuid` flags
- Created a dedicated volume for the `~/.ably` config directory using tmpfs with secure permissions (mode 0o700)

### 2. Resource Limits

To prevent resource exhaustion and abuse, we've implemented the following limits:

- Set process limits using `PidsLimit: 50` to prevent fork bombs
- Memory limits:
  - 256MB memory limit
  - Disabled swap by setting `MemorySwap` equal to `Memory`
- Limited CPU usage to 1 CPU using `NanoCpus: 1 * 1000000000`

### 3. Session Management

Enhanced session management with proper timeout mechanisms:

- Implemented inactivity timeout (10 minutes) to terminate idle sessions
- Added maximum session duration limit (30 minutes)
- Added proper cleanup and notification to users before session termination

### 4. Network Security

- Created a dedicated Docker network (`ably_cli_restricted`) for containers
- Dropped unnecessary network capabilities:
  - `NET_ADMIN` - preventing modification of network settings
  - `NET_BIND_SERVICE` - preventing binding to privileged ports
  - `NET_RAW` - preventing use of raw sockets
- Implemented network filtering with iptables:
  - Restricted outbound traffic to allowed domains
  - Set up DNS filtering
  - Blocked raw socket access
- Added TCP wrappers (`hosts.allow` and `hosts.deny`) for additional network protection

### 5. Command Injection Prevention

- Implemented enhanced shell script that prevents command injection:
  - Added validation for shell operators and special characters
  - Replaced `eval` with direct argument passing
  - Properly sanitizing input to prevent shell escapes

### 6. System Call Filtering

- Created a custom seccomp profile:
  - Whitelisted only necessary syscalls
  - Explicitly blocked dangerous syscalls
  - Restricted socket syscalls to only TCP/IP (AF_INET) and local (AF_UNIX)
  - Blocked process tracing and other potentially dangerous operations

## Planned Security Enhancements

### 1. User Namespace Remapping

✅ **Implemented**

User namespace remapping provides enhanced security by mapping the container's root user to a non-privileged user on the host system:

- Added explicit configuration for user namespace remapping in `server/docker/User-Namespace-Remapping.md`
- Updated container creation to be fully compatible with user namespaces
- Set proper file permissions for remapped container user
- See detailed instructions in `docs/User-Namespace-Remapping.md`

### 2. AppArmor Profile

✅ **Implemented**

An AppArmor profile restricts the container's access to the filesystem and system resources:

- Created a custom AppArmor profile in `server/docker/apparmor-profile.conf`
- Implemented an AppArmor installation script in `server/docker/install-apparmor.sh`
- Added dynamic AppArmor profile detection in container creation process
- The profile limits executable binaries to only those required and restricts filesystem access

### 3. Enhanced Logging and Monitoring

✅ **Implemented**

Comprehensive monitoring and logging for security events:

- Created a security monitoring script in `server/docker/security-monitor.sh`
- Implemented logging for:
  - AppArmor violations and denied actions
  - Seccomp blocked syscalls
  - Container resource usage and potential abuse
  - Security alerts based on threshold violations
- All security logs are collected in `/var/log/ably-cli-security/`

## Implementation Plan

The following steps outline our implementation approach for remaining security measures:

4.  ✅ **Document security testing and audit procedures:** See [docs/Security-Testing-Auditing.md](Security-Testing-Auditing.md)

## Security Best Practices for Development

- All code changes must follow security review procedures
- Container configurations should be tested in isolation before deployment
- Regular security audits should be conducted to identify and address potential vulnerabilities

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Linux Capabilities Documentation](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- [Seccomp Security Profiles](https://docs.docker.com/engine/security/seccomp/)
- [AppArmor Profiles for Docker](https://docs.docker.com/engine/security/apparmor/)

## Security Best Practices for Production

### Server Hardening

#### Operating System Security
```bash
# Regular security updates
sudo apt update && sudo apt upgrade -y

# Configure automatic security updates
sudo dpkg-reconfigure -plow unattended-upgrades

# Disable unnecessary services
sudo systemctl list-unit-files --type=service --state=enabled | grep -v essential

# Configure SSH hardening
sudo nano /etc/ssh/sshd_config
# Recommended settings:
# PermitRootLogin no
# PasswordAuthentication no
# PubkeyAuthentication yes
# MaxAuthTries 3
```

#### Firewall Configuration
```bash
# Strict firewall rules
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# Rate limiting for SSH
sudo ufw limit ssh
```

#### Docker Security
```bash
# Configure Docker daemon securely
sudo nano /etc/docker/daemon.json
{
  "icc": false,
  "userland-proxy": false,
  "live-restore": true,
  "no-new-privileges": true,
  "seccomp-profile": "/etc/docker/seccomp-profile.json"
}

# Restart Docker with new settings
sudo systemctl restart docker
```

### Network Security

#### TLS Configuration
```bash
# Strong TLS configuration in Caddyfile
your-domain.example.com {
    tls {
        protocols tls1.2 tls1.3
        ciphers TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384 TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
    }
    
    # Security headers
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```

#### Network Isolation
```bash
# Create isolated Docker networks
docker network create --driver bridge \
  --subnet=172.20.0.0/16 \
  --ip-range=172.20.240.0/20 \
  --opt com.docker.network.bridge.enable_icc=false \
  ably_cli_restricted
```

### Application Security

#### Environment Configuration
```bash
# Secure environment variables
sudo nano /etc/ably-terminal-server/config.env

# Security settings
NODE_ENV=production
LOG_LEVEL=1
AUDIT_LOGGING=true
SECURE_HEADERS=true

# Rate limiting (production values)
RESUME_MAX_ATTEMPTS=3
MAX_CONCURRENT_CONNECTIONS=5
MAX_COMMANDS_PER_MINUTE=30

# Session security
SESSION_TIMEOUT_MS=1800000  # 30 minutes
MAX_SESSION_DURATION_MS=7200000  # 2 hours
SECURE_SESSION_VALIDATION=true
```

#### Container Security
```bash
# Regular container image updates
docker pull node:22-alpine
docker build -t ably-cli-sandbox:latest .

# Scan images for vulnerabilities
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  -v /tmp/trivy:/root/.cache/trivy \
  aquasec/trivy image ably-cli-sandbox:latest
```

### Monitoring and Alerting

#### Security Monitoring
```bash
# Monitor security events
sudo journalctl -u ably-terminal-server | grep "AUDIT\|severity.*high\|severity.*critical"

# Set up log rotation
sudo nano /etc/logrotate.d/ably-terminal-server
/var/log/ably-terminal-server/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    sharedscripts
}
```

#### Automated Alerting
```bash
# Create monitoring script
#!/bin/bash
# /usr/local/bin/ably-security-monitor.sh

ALERT_EMAIL="admin@example.com"
LOG_FILE="/var/log/ably-terminal-server/security.log"

# Check for critical security events
CRITICAL_EVENTS=$(journalctl -u ably-terminal-server --since "1 hour ago" | grep "severity.*critical" | wc -l)

if [ "$CRITICAL_EVENTS" -gt 0 ]; then
    echo "ALERT: $CRITICAL_EVENTS critical security events detected" | \
    mail -s "Ably Terminal Server Security Alert" "$ALERT_EMAIL"
fi

# Check for excessive rate limiting
RATE_LIMIT_EVENTS=$(journalctl -u ably-terminal-server --since "1 hour ago" | grep "rate_limit" | wc -l)

if [ "$RATE_LIMIT_EVENTS" -gt 50 ]; then
    echo "WARNING: High rate limiting activity detected ($RATE_LIMIT_EVENTS events)" | \
    mail -s "Ably Terminal Server Rate Limit Warning" "$ALERT_EMAIL"
fi
```

#### Cron Job Setup
```bash
# Add to crontab
sudo crontab -e

# Run security monitoring every hour
0 * * * * /usr/local/bin/ably-security-monitor.sh

# Daily security report
0 6 * * * /usr/local/bin/ably-security-report.sh
```

### Incident Response

#### Security Incident Playbook

1. **Immediate Response**
   ```bash
   # Stop the service
   sudo systemctl stop ably-terminal-server
   
   # Capture current state
   docker ps -a > /tmp/incident-containers.log
   sudo journalctl -u ably-terminal-server --since "2 hours ago" > /tmp/incident-logs.log
   ```

2. **Investigation**
   ```bash
   # Analyze suspicious activity
   grep "severity.*high\|severity.*critical" /tmp/incident-logs.log
   
   # Check for signs of compromise
   grep -E "(unauthorized|breach|exploit)" /tmp/incident-logs.log
   ```

3. **Containment**
   ```bash
   # Block suspicious IPs
   sudo ufw deny from <suspicious-ip>
   
   # Rotate credentials if needed
   # (Not applicable for this server, but document process)
   ```

4. **Recovery**
   ```bash
   # Clean restart
   docker system prune -f
   sudo systemctl start ably-terminal-server
   
   # Verify security settings
   ./scripts/verify-security-config.sh
   ```

### Regular Security Maintenance

#### Weekly Tasks
- Review security logs for anomalies
- Check for failed authentication attempts
- Verify container security settings
- Update rate limiting thresholds if needed

#### Monthly Tasks
- Security patch review and application
- Container image vulnerability scanning
- Rate limiting effectiveness analysis
- Security configuration audit

#### Quarterly Tasks
- Full security assessment
- Penetration testing (if applicable)
- Review and update security procedures
- Security training for operations team

### Compliance and Auditing

#### Audit Requirements
The terminal server maintains audit logs for:
- All session creation and termination events
- Rate limiting violations
- Security policy violations
- Container creation and destruction
- Network security events

#### Compliance Standards
The security measures implemented help meet various compliance requirements:
- **SOC 2 Type II**: Comprehensive logging and monitoring
- **ISO 27001**: Security controls and incident response
- **GDPR**: Data protection and audit trails
- **HIPAA**: Access controls and encryption (where applicable)

#### Log Retention
```bash
# Configure log retention policies
sudo nano /etc/ably-terminal-server/config.env

# Audit log retention (recommended minimums)
AUDIT_LOG_RETENTION_DAYS=365
SECURITY_LOG_RETENTION_DAYS=90
APPLICATION_LOG_RETENTION_DAYS=30
```

## Security Testing and Validation

### Automated Security Testing
```bash
# Container security testing
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  docker/docker-bench-security

# Network security testing
nmap -sV -sC localhost

# Application security testing
./scripts/security-test-suite.sh
```

### Manual Security Verification
```bash
# Verify security controls
./scripts/verify-security-controls.sh

# Test rate limiting
./scripts/test-rate-limiting.sh

# Validate container restrictions
./scripts/test-container-security.sh
```

For automated security testing procedures, see [Security-Testing-Auditing.md](Security-Testing-Auditing.md).

## Security Contacts and Escalation

### Security Team Contacts
- **Security Lead**: security-lead@example.com
- **Operations Team**: ops@example.com
- **Emergency Contact**: +1-xxx-xxx-xxxx

### Escalation Procedures
1. **Low Severity**: Create ticket in issue tracking system
2. **Medium Severity**: Notify operations team within 4 hours
3. **High Severity**: Immediate notification to security team
4. **Critical Severity**: Immediate escalation to emergency contact

For detailed escalation procedures, see the organization's incident response plan.
