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

## Planned Security Enhancements

### 1. Network Access Control

- Implement DNS or proxy-based filtering to restrict outbound connections to allowed domains
- Block all raw socket access and limit connections to only necessary endpoints
- Set up egress filtering rules to only allow traffic to defined Ably endpoints

### 2. User Namespace Remapping

- Configure Docker daemon for user namespace remapping
- Map container root user to non-privileged user on the host
- Document proper host configuration for user namespace remapping

### 3. Seccomp Profile

- Develop a custom seccomp profile that allows only necessary syscalls
- Whitelist required operations while blocking potentially dangerous system calls
- Test and verify the profile doesn't break required CLI functionality

### 4. AppArmor Profile

- Create an AppArmor profile with strict filesystem access controls
- Limit executable paths to only required binaries
- Implement mandatory access control for all container processes

### 5. Enhanced Logging and Monitoring

- Configure logging for blocked syscalls and AppArmor violations
- Implement monitoring for container resource usage
- Create alerting for potential security breaches

## Implementation Plan

The following steps outline our implementation approach for remaining security measures:

1. Complete network security hardening with proper DNS filtering and egress rules
2. Implement and test seccomp profile for syscall filtering
3. Create and test AppArmor profile for access control
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
