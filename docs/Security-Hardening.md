# Docker Container Security Hardening

This document outlines the security measures implemented to harden the Docker containers used in the Ably CLI's web terminal feature.

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

- Added explicit configuration for user namespace remapping in `docker/User-Namespace-Remapping.md`
- Updated container creation to be fully compatible with user namespaces
- Set proper file permissions for remapped container user
- See detailed instructions in `docs/User-Namespace-Remapping.md`

### 2. AppArmor Profile

✅ **Implemented**

An AppArmor profile restricts the container's access to the filesystem and system resources:

- Created a custom AppArmor profile in `docker/apparmor-profile.conf`
- Implemented an AppArmor installation script in `docker/install-apparmor.sh`
- Added dynamic AppArmor profile detection in container creation process
- The profile limits executable binaries to only those required and restricts filesystem access

### 3. Enhanced Logging and Monitoring

✅ **Implemented**

Comprehensive monitoring and logging for security events:

- Created a security monitoring script in `docker/security-monitor.sh`
- Implemented logging for:
  - AppArmor violations and denied actions
  - Seccomp blocked syscalls
  - Container resource usage and potential abuse
  - Security alerts based on threshold violations
- All security logs are collected in `/var/log/ably-cli-security/`

## Implementation Plan

The following steps outline our implementation approach for remaining security measures:

4. Document security testing and audit procedures

## Security Best Practices for Development

- All code changes must follow security review procedures
- Container configurations should be tested in isolation before deployment
- Regular security audits should be conducted to identify and address potential vulnerabilities

## References

- [Docker Security Best Practices](https://docs.docker.com/engine/security/)
- [Linux Capabilities Documentation](https://man7.org/linux/man-pages/man7/capabilities.7.html)
- [Seccomp Security Profiles](https://docs.docker.com/engine/security/seccomp/)
- [AppArmor Profiles for Docker](https://docs.docker.com/engine/security/apparmor/)
