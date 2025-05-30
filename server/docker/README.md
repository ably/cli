# Docker Security Configuration Test Scripts

This directory contains scripts and configuration files related to Docker container security hardening for the Ably CLI web terminal.

## Test Scripts

### `test-security.sh`

This script provides a way to verify that Docker container security settings are correctly configured. It tests:

1. Read-only root filesystem
2. Process limits (PID limits)
3. Temporary filesystem (tmpfs) settings with noexec flags

#### Usage

```bash
# Run from the docker directory
./test-security.sh
```

The script will:

1. Create a test container with security settings
2. Inspect the container configuration
3. Verify that security settings are correctly applied
4. Report success or failure for each setting

## Custom Test Files

- `test-dockerfile`: A minimal Dockerfile for testing security settings

## Security Configuration Files

- `enhanced-restricted-shell.sh`: A restricted shell script that prevents command injection
- `network-security.sh`: Script to configure network security restrictions
- `seccomp-profile.json`: System call filtering profile for Docker containers
- `apparmor-profile.conf`: AppArmor profile for additional security
- `install-apparmor.sh`: Script to install and configure AppArmor
- `security-monitor.sh`: Script for monitoring and logging security events

## CI Integration

The security tests are also integrated into the CI pipeline using GitHub Actions. See `.github/workflows/container-security-tests.yml` for the CI configuration.

## Related Documentation

For more information about the security hardening measures implemented, see:

- [Container-Security.md](../docs/Container-Security.md)
- [Security-Hardening.md](../docs/Security-Hardening.md)
- [Security-Testing-Auditing.md](../docs/Security-Testing-Auditing.md)
- [User-Namespace-Remapping.md](../docs/User-Namespace-Remapping.md)
