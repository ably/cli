# Docker Container Security Testing and Auditing

This document outlines the procedures for testing and auditing the security measures implemented for the Ably CLI's web terminal Docker container.

## Automated Security Testing

Automated tests are crucial for continuously verifying the container's security posture. These tests should be integrated into the CI/CD pipeline.

### CI Implementation

The `.github/workflows/container-security-tests.yml` workflow implements automated security tests that run on every PR and push to the main branch that affects the Docker configuration. The workflow performs the following tests:

1. **Dockerfile Linting:** Uses hadolint to check the Dockerfile for best practices and security issues.
2. **Configuration Verification:** Inspects the container configuration to ensure security settings like ReadonlyRootfs and PidsLimit are properly set.
3. **Filesystem Restrictions:** Tests that the root filesystem is read-only, appropriate directories are writable, and noexec is enforced on tmpfs mounts.
4. **Command Restrictions:** Verifies that the restricted shell blocks command injection attempts via pipe (`|`), semicolon (`;`), and other shell operators.
5. **Network Restrictions:** Tests connectivity to allowed Ably domains and verifies that connections to disallowed domains are blocked.
6. **Security Monitoring:** Confirms that the security logging directory exists and is properly configured.
7. **Vulnerability Scanning:** Uses Trivy to scan the container image for known vulnerabilities.

### Local Testing Script

A bash script `docker/test-security.sh` has been created to allow developers to run the same security tests locally. This script:

1. Builds the Docker image if it doesn't exist
2. Runs a comprehensive set of tests to verify security configurations
3. Provides clear, colorized output of test results

To run the tests locally:

```bash
cd docker
./test-security.sh
```

This enables developers to verify container security before committing changes.

### Additional Tests to Consider

1.  **Dockerfile Linting & Scanning:**
    *   Use tools like `hadolint` to check the `Dockerfile` for best practice violations.
    *   Integrate container vulnerability scanning (e.g., Trivy, Snyk) to detect known vulnerabilities in the base image and installed packages.

2.  **Configuration Verification Tests:**
    *   Build the Docker image.
    *   Run a temporary container based on the image.
    *   **Filesystem Checks:**
        *   Verify the root filesystem is read-only (`touch /testfile` should fail).
        *   Verify `tmpfs` mounts (`/tmp`, `/run`, `~/.ably`) exist and have `noexec` applied (attempt to execute a simple script from these locations).
    *   **Resource Limit Checks:**
        *   Inspect the running container's configuration (`docker inspect`) to confirm `PidsLimit`, `Memory`, `MemorySwap`, and `NanoCpus` match the intended values.
        *   (Optional) Attempt to exceed limits (e.g., fork bomb, memory allocation) and verify container termination/restriction.
    *   **Network Security Checks:**
        *   Attempt to connect to disallowed domains/IPs (e.g., `curl google.com`) and verify failure.
        *   Verify connections to allowed Ably endpoints succeed (e.g., `curl https://rest.ably.io/time`).
        *   Verify raw socket usage is blocked.
    *   **Seccomp Profile Checks:**
        *   Attempt to use a blocked syscall (e.g., `ptrace`) and verify failure/logging.
    *   **AppArmor Profile Checks:**
        *   Attempt to execute a non-whitelisted binary and verify failure/logging.
        *   Attempt to access restricted file paths and verify failure/logging.
    *   **User Namespace Checks (if enabled):**
        *   Verify the container runs as a non-root user (`id -u` inside the container should not be 0).
        *   Verify file ownership within the container maps correctly to the host's subuid/subgid range.
    *   **Restricted Shell Checks:**
        *   Attempt command injection techniques (`|`, `&`, `;`, `$()`, etc.) in the restricted shell and verify they are blocked.
        *   Verify only `ably` and `exit` commands are permitted.

3.  **Security Monitoring Script Test:**
    *   Trigger events that should be logged (e.g., blocked network connection, AppArmor denial) and verify logs appear in `/var/log/ably-cli-security/` inside the container.

## Regular Security Audits

Regular manual audits complement automated testing.

**Frequency:** Quarterly (or more often if significant changes occur).

**Workflow:**

1.  **Review Documentation:**
    *   Review `docs/Security-Hardening.md` to ensure it accurately reflects the current implementation.
    *   Review this document (`docs/Security-Testing-Auditing.md`) for relevance and completeness.
2.  **Review Configuration Files:**
    *   Manually inspect the `Dockerfile`.
    *   Review `docker/network-security.sh`, `docker/enhanced-restricted-shell.sh`, `docker/security-monitor.sh`.
    *   Review `docker/seccomp-profile.json`.
    *   Review `docker/apparmor-profile.conf` (if AppArmor is active).
3.  **Review Automated Test Results:**
    *   Analyze recent CI/CD test runs for failures or warnings related to security tests.
4.  **Dependency Vulnerability Check:**
    *   Manually trigger or review results from vulnerability scanners (e.g., `npm audit`, container scanners) for both the Node.js application and the container's OS packages. Update dependencies as needed.
5.  **Threat Modeling Review:**
    *   Re-evaluate potential attack vectors based on any new features or changes to the CLI or Docker environment.
6.  **Incident Review:**
    *   Review any security incidents or near-misses since the last audit.
7.  **Update Documentation:**
    *   Update hardening and testing documentation based on audit findings.
8.  **Report Findings:**
    *   Document audit findings, required actions, and responsible parties.

## Security Hardening Documentation Reference

For a detailed overview of the implemented security measures, please refer to [docs/Security-Hardening.md](Security-Hardening.md).
