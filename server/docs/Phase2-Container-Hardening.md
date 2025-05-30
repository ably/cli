# Phase 2: Container Hardening Implementation

## Overview

Phase 2 implements comprehensive container hardening with enhanced security profiles, strict network enforcement, and automated lifecycle management. This phase builds upon Phase 1's security foundations to provide defense-in-depth container protection.

## Key Improvements

### 2.1 Enhanced Security Profile Management

#### Seccomp Profile Handling
- **Temporary File Management**: Seccomp profiles are now written to temporary files with restricted permissions (0o600) instead of inline JSON
- **Profile Verification**: Automatic validation of seccomp profile structure and syscall rules before container creation
- **Fail-Fast Behavior**: Security initialization fails immediately if profiles are missing or invalid
- **Resource Cleanup**: Automatic cleanup of temporary files on process exit

```typescript
// Example: Enhanced seccomp handling
function createSeccompTempFile(profileContent: string): string {
  const tempFile = path.join(os.tmpdir(), `ably-cli-seccomp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tempFile, profileContent, { mode: 0o600 });
  return tempFile;
}
```

#### AppArmor Profile Enforcement
- **No Fallback Policy**: Removed `apparmor=unconfined` fallback - server refuses to start without proper AppArmor profile
- **System Verification**: Checks if AppArmor is enabled and the required profile is loaded
- **Enforcement Status**: Validates profile is in enforce mode when possible

```typescript
// Example: Strict AppArmor verification
function verifyAppArmorProfile(): boolean {
  const profileCheck = execSync('apparmor_parser -QT /etc/apparmor.d/docker-ably-cli-sandbox 2>/dev/null || echo "notfound"').toString().trim();
  if (profileCheck === 'notfound') {
    throw new Error("Required AppArmor profile 'docker-ably-cli-sandbox' is not found or loaded");
  }
  return true;
}
```

### 2.2 Network Security Hardening

#### Secure Network Enforcement
- **Mandatory Network**: Server refuses to start without the `ably_cli_restricted` network
- **Inter-Container Isolation**: Disabled inter-container communication (`enable_icc: false`)
- **Host Binding Restriction**: Network traffic bound only to localhost (`127.0.0.1`)
- **Configuration Verification**: Validates existing networks have proper security labels

```typescript
// Example: Network security configuration
await docker.createNetwork({
  Name: DOCKER_NETWORK_NAME,
  Driver: 'bridge',
  Options: {
    'com.docker.network.bridge.enable_icc': 'false',
    'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1'
  },
  Labels: {
    'security-level': 'restricted'
  }
});
```

### 2.3 Enhanced Container Lifecycle Management

#### Resource Limit Verification
- **Post-Creation Validation**: Verifies all resource limits are actually applied after container creation
- **Security Option Verification**: Confirms seccomp, AppArmor, and no-new-privileges are active
- **Configurable Limits**: Environment variables for customizing resource constraints

```typescript
// Example: Container limit verification
const CONTAINER_LIMITS = {
  memory: parseInt(process.env.CONTAINER_MEMORY_LIMIT || '268435456'), // 256MB
  nanoCpus: parseInt(process.env.CONTAINER_CPU_LIMIT || '1000000000'), // 1 CPU
  pidsLimit: parseInt(process.env.CONTAINER_PIDS_LIMIT || '50'), // 50 processes
};
```

#### Advanced Security Capabilities
- **Extended Capability Dropping**: Removed 10 capabilities including `SYS_ADMIN`, `SYS_PTRACE`, `DAC_OVERRIDE`, `SETUID`, `SETGID`
- **Kernel Memory Limits**: Added kernel memory restrictions (10% of main memory)
- **OOM Killer Policy**: Allows OOM killer to prevent system-wide issues
- **Namespace Isolation**: Private IPC and PID namespaces

#### Automated Cleanup
- **Smart Auto-Removal**: Custom implementation since Docker doesn't allow changing AutoRemove after creation
- **Exit Event Handling**: Containers automatically removed when sessions end
- **Graceful Termination**: Proper stop and remove sequence with error handling

```typescript
// Example: Auto-removal implementation
export async function enableAutoRemoval(container: DockerContainer): Promise<void> {
  const cleanup = async () => {
    const inspect = await container.inspect();
    if (inspect.State.Running) {
      await container.stop();
    }
    await container.remove();
  };
  
  const stream = await container.attach({ stream: true, logs: false });
  stream.on('end', cleanup);
  stream.on('close', cleanup);
}
```

## Security Features Summary

### Applied Security Hardening
- ✅ **Read-only filesystem** with specific writable tmpfs mounts
- ✅ **Non-root user execution** (appuser) with user namespace compatibility
- ✅ **Seccomp filtering** with verified temporary file profiles
- ✅ **AppArmor enforcement** with strict profile requirements
- ✅ **Network isolation** with restricted bridge network
- ✅ **Resource constraints** with verification
- ✅ **Capability dropping** (10 dangerous capabilities removed)
- ✅ **Namespace isolation** (private IPC/PID)
- ✅ **Automated cleanup** with graceful termination

### Resource Limits (Configurable)
| Resource | Default | Environment Variable | Purpose |
|----------|---------|---------------------|---------|
| Memory | 256MB | `CONTAINER_MEMORY_LIMIT` | RAM usage limit |
| CPU | 1.0 | `CONTAINER_CPU_LIMIT` | CPU time limit |
| PIDs | 50 | `CONTAINER_PIDS_LIMIT` | Process count limit |
| Tmpfs | 64MB | `CONTAINER_TMPFS_SIZE` | Temporary storage |
| Config Dir | 10MB | `CONTAINER_CONFIG_SIZE` | Ably config storage |

## Error Handling & Fail-Fast Behavior

### Security Initialization Failures
```typescript
try {
  initializeSecurity();
} catch (error) {
  throw new Error(`Cannot start server without proper security: ${error}`);
}
```

### Network Requirement Failures
```typescript
await enforceSecureNetwork();
// Throws if ably_cli_restricted network doesn't exist
```

### Container Creation Failures
- Security profile verification failure → Container creation blocked
- Resource limit mismatch → Container removed, session terminated
- Network attachment failure → Immediate cleanup

## Configuration Requirements

### Host System Requirements
1. **AppArmor Profile**: Must have `docker-ably-cli-sandbox` profile loaded and enforced
2. **Docker Network**: Must have `ably_cli_restricted` network created with security labels
3. **Seccomp Profile**: Must have valid `docker/seccomp-profile.json` in project root

### Environment Variables
```bash
# Resource limits (optional)
CONTAINER_MEMORY_LIMIT=268435456    # 256MB in bytes
CONTAINER_CPU_LIMIT=1000000000      # 1 CPU in nanocpus
CONTAINER_PIDS_LIMIT=50             # Maximum processes
CONTAINER_TMPFS_SIZE=67108864       # 64MB tmpfs
CONTAINER_CONFIG_SIZE=10485760      # 10MB config dir

# Security options (automatic detection)
# No configuration needed - profiles detected and verified automatically
```

## Monitoring & Logging

### Security Status Monitoring
```typescript
const status = getSecurityStatus();
// Returns: { initialized, seccompEnabled, appArmorEnabled, networkReady }
```

### Enhanced Logging
- **Secure Logging**: Automatic redaction of sensitive fields in logs
- **Container Lifecycle**: Detailed logging of creation, verification, and cleanup
- **Security Events**: Profile loading, verification, and failure events
- **Resource Usage**: Memory, CPU, and PID limit verification logs

## Testing & Verification

### Manual Verification Commands
```bash
# Check security profiles
docker container inspect <container_id> | jq '.HostConfig.SecurityOpt'

# Verify resource limits
docker container inspect <container_id> | jq '.HostConfig | {Memory, NanoCpus, PidsLimit}'

# Check network configuration
docker network inspect ably_cli_restricted | jq '.[0].Options'

# Verify capabilities
docker container inspect <container_id> | jq '.HostConfig.CapDrop'
```

### Expected Security Features
- SecurityOpt should include: `no-new-privileges`, `seccomp=/tmp/ably-cli-seccomp-*`, `apparmor=ably-cli-sandbox-profile`
- CapDrop should include: `ALL`, `NET_ADMIN`, `NET_BIND_SERVICE`, `NET_RAW`, `SYS_ADMIN`, `SYS_PTRACE`, `SYS_MODULE`, `DAC_OVERRIDE`, `SETUID`, `SETGID`
- ReadonlyRootfs should be `true`
- NetworkMode should be `ably_cli_restricted`

## Implementation Status

✅ **Phase 2.1**: Security Profile Improvements - **COMPLETED**
- Temporary file seccomp profiles
- Fail-fast AppArmor enforcement  
- Profile verification before container creation

✅ **Phase 2.2**: Network Security Hardening - **COMPLETED**
- Mandatory secure network enforcement
- Inter-container communication disabled
- Host binding restrictions

✅ **Phase 2.3**: Container Lifecycle Management - **COMPLETED**  
- Resource limit verification
- Enhanced capability dropping
- Automated cleanup with graceful termination

## Next Phase

**Phase 3: DoS & Resource Protection** will focus on:
- Rate limiting and request throttling
- Buffer overflow protection
- Build process security hardening
- Advanced resource monitoring

See `docs/Phase3-DoS-Resource-Protection.md` for details. 