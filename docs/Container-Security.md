# Docker Container Security

Following the simple shell restrictions added in [../scripts/restricted-shell.sh](../scripts/restricted-shell.sh), the following security hardening strategy is being put in place to prevent abuse and risk of security compromises of the host.

## Phase 1: Essential Security Enhancements

1. Read-Only Filesystem with Controlled Write Access

- Make the container filesystem read-only
- Mount a tmpfs volume for /tmp with noexec flag
- Create a dedicated volume for the ~/.ably config directory with controlled permissions

2. Enhanced Resource Limits

- Add explicit process limits (pids-limit)
- Set memory limits to prevent resource exhaustion
- Add CPU quotas to prevent CPU abuse

3. Improved Network Controls

- Implement outbound filtering to only allow Ably API endpoints
- Block raw socket access explicitly

## Phase 2: Advanced Security Hardening

1. User Namespace Remapping

- Enable Docker's user namespace remapping
- Configure the daemon to map container's root to a high-numbered unprivileged user on the host

2. Custom Seccomp Profile

- Create a tailored seccomp profile that allows only the system calls needed by the Ably CLI
- Block potentially dangerous syscalls like mount, pivot_root, etc.

3. AppArmor Profile

- Develop a custom AppArmor profile to strictly control file access
- Allow read-write access only to the required config paths
- Deny execution of any binaries except the allowed ones

## Phase 3: Monitoring and Defense-in-Depth

1. Enhanced Logging and Monitoring

- Implement additional logging for attempted security violations
- Add monitoring for containers that exceed resource limits or make unusual API calls

2. Session Auto-Termination

- Enhance session timeouts for both inactivity and maximum session duration
- Implement graceful termination with user notification

3. Audit and Testing

- Perform security audits of the container configuration
- Conduct penetration testing to verify the effectiveness of security measures