# Docker User Namespace Remapping

This document provides instructions for configuring user namespace remapping for the Ably CLI's container-based web terminal.

## Overview

User namespace remapping is a security feature that maps the root user inside the container to a non-privileged user on the host. This significantly reduces the security risk if a container is compromised, as the container's "root" user has very limited privileges on the host system.

## Benefits

- **Mitigates container escape vulnerabilities**: Even if an attacker gains root access within the container, they have limited privileges on the host system
- **Reduces attack surface**: Provides an additional layer of isolation between container and host
- **Follows defense-in-depth principle**: Adds another security boundary to overcome

## Requirements

- Docker daemon version 1.10 or higher
- Linux host with user namespaces enabled in the kernel

## Configuration Steps

### 1. Configure subordinate user and group IDs

On the Docker host, you need to configure the host user that will own the remapped processes:

```bash
# Create a dedicated user for Docker containers (if not already existing)
sudo useradd -r -s /bin/false dockermap

# Add subordinate UIDs and GIDs for the user
sudo usermod --add-subuids 100000-165535 dockermap
sudo usermod --add-subgids 100000-165535 dockermap

# Verify the configuration
grep dockermap /etc/subuid
grep dockermap /etc/subgid
```

### 2. Configure Docker daemon

Edit the Docker daemon configuration file:

```bash
sudo vim /etc/docker/daemon.json
```

Add the user namespace remapping configuration:

```json
{
  "userns-remap": "dockermap"
}
```

If the file already contains other settings, add this setting to the existing JSON object.

### 3. Restart the Docker daemon

```bash
sudo systemctl restart docker
```

### 4. Verify the configuration

After restarting Docker, verify that user namespace remapping is enabled:

```bash
docker info | grep -i userns
```

You should see output like: `userns: true`

## Implementation in the Ably CLI Container

The Ably CLI container is already configured to work with user namespace remapping without additional changes. Key aspects of this compatibility:

1. All files needed by the container user are properly accessible with appropriate permissions
2. The application runs as a non-root user inside the container
3. Volumes are mounted with appropriate ownership settings

## Troubleshooting

### Container fails to start after enabling user namespace remapping

If containers fail to start after enabling user namespace remapping, check:

1. Docker daemon logs: `sudo journalctl -u docker`
2. Ensure the subordinate UID/GID ranges are properly configured
3. Verify the user specified in `userns-remap` exists on the host system

### Permission issues with volumes or bind mounts

When using user namespace remapping, the container's user IDs are shifted. This may cause permission issues with volumes:

1. Use the Docker `--user` flag to specify the correct UID/GID when mounting volumes
2. For persistent data, consider setting appropriate permissions on the host paths before mounting

## Security Considerations

While user namespace remapping significantly improves container isolation, it is not a complete security solution and should be used as part of a comprehensive security strategy that includes:

- Seccomp profiles (already implemented)
- AppArmor or SELinux policies (planned implementation)
- Regular security updates and audits
- Minimal container images with reduced attack surface

## References

- [Docker Documentation: Isolate containers with user namespaces](https://docs.docker.com/engine/security/userns-remap/)
- [Linux kernel user namespace documentation](https://www.kernel.org/doc/Documentation/admin-guide/namespaces/user.rst)
