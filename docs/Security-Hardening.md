# Docker CLI Environment Security Hardening

This document outlines the security measures implemented to harden the Docker container environment used for the Ably CLI web terminal.

## Overview

The Ably CLI web terminal allows users to interact with the Ably CLI through a browser interface. This is implemented by running the Ably CLI in a Docker container and connecting to it via a WebSocket server. To ensure a secure environment, several security measures have been implemented.

## Current Security Measures

### Read-Only Filesystem

The container's root filesystem is set to read-only to prevent any modifications to the system files, which helps mitigate the impact of potential attacks.

```typescript
// In terminal-server.ts - createContainer function
ReadonlyRootfs: true,
```

### Controlled Write Access

While the root filesystem is read-only, specific directories need to be writable for the CLI to function properly:

1. **Temporary Files**: `/tmp` and `/run` are mounted as tmpfs volumes with the `noexec` flag to prevent execution of any files written there:
   ```typescript
   Tmpfs: {
       '/tmp': 'rw,noexec,nosuid,size=64m',
       '/run': 'rw,noexec,nosuid,size=32m'
   }
   ```

2. **Configuration Directory**: The `~/.ably` directory is mounted as a tmpfs volume with limited size and secure permissions:
   ```typescript
   Mounts: [
       {
           Type: 'tmpfs',
           Target: '/home/appuser/.ably',
           TmpfsOptions: {
               SizeBytes: 10 * 1024 * 1024, // 10MB
               Mode: 0o700 // Secure permissions
           }
       }
   ]
   ```

### Resource Limits

The container has strict resource limits to prevent resource exhaustion and potential denial of service:

```typescript
// Process limits
PidsLimit: 50, // Limit to 50 processes

// Memory limits
Memory: 256 * 1024 * 1024, // 256MB
MemorySwap: 256 * 1024 * 1024, // Disable swap

// CPU limits
NanoCpus: 1 * 1000000000, // Limit to 1 CPU
```

### Session Timeouts

To prevent sessions from running indefinitely or being left idle, two types of timeouts are implemented:

1. **Inactivity Timeout**: Sessions are terminated after 10 minutes of inactivity
2. **Maximum Duration**: Sessions cannot run for more than 30 minutes regardless of activity

```typescript
// Constants for timeouts
const MAX_IDLE_TIME_MS = 10 * 60 * 1000;      // 10 minutes of inactivity
const MAX_SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes total

// Session monitoring
function startSessionMonitoring() {
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
      // Check for inactivity timeout
      if (now - session.lastActivityTime > MAX_IDLE_TIME_MS) {
        terminateSession(sessionId, "Session timed out due to inactivity");
      }

      // Check for max duration timeout
      if (now - session.creationTime > MAX_SESSION_DURATION_MS) {
        terminateSession(sessionId, "Maximum session duration reached");
      }
    }
  }, 30 * 1000);
}
```

### Non-Root User

The container runs as a non-root user (`appuser`), which is defined in the Dockerfile:

```dockerfile
# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# ...

# Switch to the non-root user
USER appuser
```

### Restricted Shell

The Docker container uses a custom restricted shell script (`/scripts/restricted-shell.sh`) that only allows the `ably` command and `exit` to be executed. This helps prevent users from running arbitrary commands.

### Capabilities

All capabilities are dropped from the container, preventing it from performing privileged operations:

```typescript
CapDrop: ['ALL'],
```

### No New Privileges

The container is configured to prevent any process from gaining new privileges, which blocks privilege escalation:

```typescript
SecurityOpt: ['no-new-privileges'],
```

### Auto-Removal

Containers are automatically removed when they stop, which helps ensure no remnants of user sessions remain:

```typescript
AutoRemove: true,
```

## Planned Security Enhancements

The following security measures are planned for future implementation:

1. **Network Security**: Further restrict network access to only allow connections to Ably endpoints
2. **User Namespace Remapping**: Enable Docker's user namespace remapping for additional isolation
3. **Custom Seccomp Profile**: Create a tailored seccomp profile to restrict system calls
4. **AppArmor Profile**: Implement an AppArmor profile for additional access control
5. **Enhanced Logging and Monitoring**: Set up better logging and monitoring for security events
6. **Security Testing**: Develop automated tests for the security configuration

## Best Practices for Container Security

- Regularly update the Docker image and dependencies to address security vulnerabilities
- Monitor and review logs for any suspicious activity
- Periodically audit the security configuration against current best practices
- Apply the principle of least privilege for all components
- Follow defense in depth by implementing multiple layers of security

## References

- [Docker Security Documentation](https://docs.docker.com/engine/security/)
- [Linux Capabilities](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- [Seccomp Security Profiles](https://docs.docker.com/engine/security/seccomp/)
- [AppArmor Profiles for Docker](https://docs.docker.com/engine/security/apparmor/)
