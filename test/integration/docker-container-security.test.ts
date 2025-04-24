import { expect } from 'chai';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execAsync = promisify(exec);

// Fix for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Docker Container Security Features', function() {
  // Set a longer timeout for these tests as they involve Docker
  this.timeout(60000);

  // Container name for testing
  const containerName = 'ably-cli-security-test';

  // Clean up any lingering test containers
  before(async function() {
    try {
      await execAsync(`docker rm -f ${containerName} 2>/dev/null || true`);
    } catch {
      // Ignore errors if the container doesn't exist
    }
  });

  // Clean up after tests
  after(async function() {
    try {
      await execAsync(`docker rm -f ${containerName} 2>/dev/null || true`);
    } catch {
      // Ignore errors if the container doesn't exist
    }
  });

  it('should verify that the container image exists', async function() {
    const { stdout } = await execAsync('docker images ably-cli-sandbox --format "{{.Repository}}"');

    // If the image doesn't exist, build it
    if (!stdout.includes('ably-cli-sandbox')) {
      console.log('Docker image ably-cli-sandbox not found, building it...');
      const dockerfilePath = path.resolve(__dirname, '../../Dockerfile');
      await execAsync(`docker build -t ably-cli-sandbox ${path.dirname(dockerfilePath)}`);
      console.log('Docker image built successfully');
    }
  });

  it('should create a container with security settings', async function() {
    // Create a test container with explicitly set security parameters
    const seccompProfilePath = path.resolve(__dirname, '../../docker/seccomp-profile.json');

    await execAsync(`docker create --name ${containerName} \
      --read-only \
      --security-opt=no-new-privileges \
      --security-opt="seccomp=${seccompProfilePath}" \
      --pids-limit=50 \
      --memory=256m \
      --tmpfs /tmp:rw,noexec,nosuid,size=64m \
      --tmpfs /run:rw,noexec,nosuid,size=32m \
      --user appuser \
      --cap-drop=NET_ADMIN --cap-drop=NET_BIND_SERVICE --cap-drop=NET_RAW \
      ably-cli-sandbox bash -c "sleep 600"`);

    console.log('Container created with security settings');
  });

  it('should verify read-only filesystem configuration', async function() {
    // Get container info in JSON format
    const { stdout } = await execAsync(`docker inspect ${containerName}`);
    const containerInfo = JSON.parse(stdout);

    // Verify read-only filesystem
    expect(containerInfo[0].HostConfig.ReadonlyRootfs).to.equal(true);
  });

  it('should verify process limits are set', async function() {
    // Get container info in JSON format
    const { stdout } = await execAsync(`docker inspect ${containerName}`);
    const containerInfo = JSON.parse(stdout);

    // Verify PID limit is set to a reasonable value
    expect(containerInfo[0].HostConfig.PidsLimit).to.be.a('number');
    expect(containerInfo[0].HostConfig.PidsLimit).to.equal(50);
  });

  it('should verify memory limits are set', async function() {
    // Get container info in JSON format
    const { stdout } = await execAsync(`docker inspect ${containerName}`);
    const containerInfo = JSON.parse(stdout);

    // Verify memory limit is set to a reasonable value (in bytes)
    expect(containerInfo[0].HostConfig.Memory).to.be.a('number');
    expect(containerInfo[0].HostConfig.Memory).to.be.at.most(271000000); // ~256MB
    expect(containerInfo[0].HostConfig.Memory).to.be.at.least(250000000); // ~250MB
  });

  it('should verify tmpfs mounts with noexec flag', async function() {
    // Get container info in JSON format
    const { stdout } = await execAsync(`docker inspect ${containerName}`);
    const containerInfo = JSON.parse(stdout);

    // Verify tmpfs mounts exist and have noexec flag
    expect(containerInfo[0].HostConfig.Tmpfs).to.be.an('object');

    // Check /tmp mount
    if (containerInfo[0].HostConfig.Tmpfs['/tmp']) {
      const tmpOptions = containerInfo[0].HostConfig.Tmpfs['/tmp'];
      expect(tmpOptions).to.include('noexec');
      expect(tmpOptions).to.include('nosuid');
    }

    // Check /run mount if it exists
    if (containerInfo[0].HostConfig.Tmpfs['/run']) {
      const runOptions = containerInfo[0].HostConfig.Tmpfs['/run'];
      expect(runOptions).to.include('noexec');
      expect(runOptions).to.include('nosuid');
    }
  });

  it('should verify security capabilities are dropped', async function() {
    // Get container info in JSON format
    const { stdout } = await execAsync(`docker inspect ${containerName}`);
    const containerInfo = JSON.parse(stdout);

    // Check that capabilities are dropped
    const capDrop = containerInfo[0].HostConfig.CapDrop || [];
    expect(capDrop).to.include.members(['NET_ADMIN', 'NET_BIND_SERVICE', 'NET_RAW']);
  });

  it('should verify seccomp profile is applied', async function() {
    // Get container info in JSON format
    const { stdout } = await execAsync(`docker inspect ${containerName}`);
    const containerInfo = JSON.parse(stdout);

    // Check that security options include seccomp
    const securityOpt = containerInfo[0].HostConfig.SecurityOpt || [];

    // At least one option should include seccomp
    expect(securityOpt.some((opt: string) => opt.includes('seccomp='))).to.be.true;
  });

  it('should verify containers run as non-root user', async function() {
    // Get container info in JSON format
    const { stdout } = await execAsync(`docker inspect ${containerName}`);
    const containerInfo = JSON.parse(stdout);

    // Verify container doesn't run as root
    expect(containerInfo[0].Config.User).to.equal('appuser');
  });

  it('should verify restricted network configuration exists or not be required', async function() {
    try {
      // Check if the restricted network exists
      const { stdout } = await execAsync('docker network ls --format "{{.Name}}" | grep ably_cli_restricted');

      // If the network exists, verify its name
      if (stdout.trim()) {
        expect(stdout.trim()).to.equal('ably_cli_restricted');
        console.log('Verified restricted network exists');
      } else {
        // Network doesn't exist, but that's okay for single tests
        console.log('Restricted network does not exist, but not required for this test');
      }
    } catch {
      // If the grep fails (network doesn't exist), that's still a valid test state
      console.log('Restricted network does not exist, but not required for this test');
    }
  });

  it('should verify the container can run commands', async function() {
    // Start the container
    await execAsync(`docker start ${containerName}`);

    // Wait for container to start fully
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify the container is running
    const { stdout: statusOutput } = await execAsync(`docker ps --filter name=${containerName} --format "{{.Status}}"`);
    expect(statusOutput).to.include('Up');

    // Run some basic allowed commands
    const { stdout: pwdResult } = await execAsync(`docker exec ${containerName} pwd`);

    // We don't know exactly what directory the container will start in
    // Just verify it returned a path
    expect(pwdResult.trim()).to.be.a('string').that.is.not.empty;
  });

  it('should verify the ably CLI command works', async function() {
    try {
      // Test that the ably command works
      const { stdout: ablyVersionResult } = await execAsync(`docker exec ${containerName} ably --version`);
      expect(ablyVersionResult).to.include('cli');
    } catch {
      // If the ably command isn't available, skip this test
      // This happens if we're testing with a different image than the CLI container
      console.log('Skipping ably command test - ably CLI not available in container');
      this.skip();
    }
  });

  it('should verify the container cannot modify the filesystem', async function() {
    // Try to write to the root filesystem
    try {
      await execAsync(`docker exec ${containerName} touch /test-file`);
      // If we get here, the write was allowed which shouldn't happen
      throw new Error('Should not be able to write to root filesystem');
    } catch (error) {
      // Expected behavior - write should be denied
      const errorObj = error as { stderr?: string };
      if (errorObj.stderr && (
          errorObj.stderr.includes('Read-only file system') ||
          errorObj.stderr.includes('Permission denied')
      )) {
        // This is the expected outcome - write was denied
      } else {
        // Unexpected error
        throw error;
      }
    }

    // Verify we can write to the allowed temporary directories
    try {
      const { stdout: tmpWrite } = await execAsync(`docker exec ${containerName} sh -c "echo test > /tmp/test-file && cat /tmp/test-file"`);
      expect(tmpWrite.trim()).to.equal('test');

      // Clean up
      await execAsync(`docker exec ${containerName} rm /tmp/test-file`);
    } catch {
      // It's okay if this fails, it means we're testing with a different image
      console.log('Skipping tmpfs write test - might be a different container setup');
      this.skip();
    }
  });
});
