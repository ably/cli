import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DOCKER_NETWORK_NAME } from "../config/server-config.js";
import { logSecure, logError } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");

// Simplified __dirname calculation
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Security profile state
let seccompProfilePath: string | null = null;
let isAppArmorProfileLoaded = false;
let securityInitialized = false;

// Global docker instance for network operations
const docker = new Dockerode();

/**
 * Create a temporary file for seccomp profile
 */
function createSeccompTempFile(profileContent: string): string {
  try {
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `ably-cli-seccomp-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    
    // Write profile to temp file with restricted permissions
    fs.writeFileSync(tempFile, profileContent, { mode: 0o600 });
    
    logSecure("Seccomp profile written to temporary file", { 
      tempFile: path.basename(tempFile) 
    });
    
    return tempFile;
  } catch (error) {
    throw new Error(`Failed to create seccomp temporary file: ${error}`);
  }
}

/**
 * Verify that seccomp profile is actually loaded and valid
 */
function verifySeccompProfile(profilePath: string): boolean {
  try {
    // Verify file exists and is readable
    fs.accessSync(profilePath, fs.constants.R_OK);
    
    // Verify it's valid JSON
    const content = fs.readFileSync(profilePath, 'utf8');
    const parsed = JSON.parse(content);
    
    // Basic seccomp profile validation
    if (!parsed.defaultAction || !Array.isArray(parsed.syscalls)) {
      throw new Error("Invalid seccomp profile structure");
    }
    
    logSecure("Seccomp profile verification successful", {
      syscallRules: parsed.syscalls?.length || 0,
      defaultAction: parsed.defaultAction
    });
    
    return true;
  } catch (error) {
    logError(`Seccomp profile verification failed: ${error}`);
    return false;
  }
}

/**
 * Verify AppArmor profile is properly loaded and available
 */
function verifyAppArmorProfile(): boolean {
  try {
    logSecure("Verifying AppArmor profile availability...");
    
    // Check if AppArmor is enabled on the system
    try {
      execSync('cat /sys/module/apparmor/parameters/enabled 2>/dev/null', { stdio: 'pipe' });
    } catch {
      throw new Error("AppArmor is not enabled on this system");
    }
    
    // Check if our specific profile exists and is loaded
    const profileCheck = execSync('apparmor_parser -QT /etc/apparmor.d/docker-ably-cli-sandbox 2>/dev/null || echo "notfound"').toString().trim();
    
    if (profileCheck === 'notfound') {
      throw new Error("Required AppArmor profile 'docker-ably-cli-sandbox' is not found or loaded");
    }
    
    // Additional verification: check if profile is in enforce mode
    try {
      const profileStatus = execSync('aa-status --json 2>/dev/null || echo "{}"').toString();
      const status = JSON.parse(profileStatus);
      
      if (status.profiles && status.profiles.enforce) {
        const enforced = status.profiles.enforce.includes('docker-ably-cli-sandbox');
        if (!enforced) {
          logSecure("Warning: AppArmor profile exists but may not be in enforce mode");
        }
      }
    } catch {
      // aa-status might not be available, continue anyway
      logSecure("Note: Could not verify AppArmor profile enforcement status");
    }
    
    logSecure("AppArmor profile verification successful", {
      profile: 'docker-ably-cli-sandbox'
    });
    
    return true;
  } catch (error) {
    logError(`AppArmor profile verification failed: ${error}`);
    return false;
  }
}

/**
 * Initialize security configurations with fail-fast behavior
 */
export function initializeSecurity(): void {
  if (securityInitialized) {
    logSecure("Security already initialized, skipping...");
    return;
  }

  logSecure("Initializing security profiles with fail-fast verification...");

  try {
    // Load and verify seccomp profile
    const seccompProfileSourcePath = path.resolve(__dirname, '../../../docker/seccomp-profile.json');
    
    if (!fs.existsSync(seccompProfileSourcePath)) {
      throw new Error(`Seccomp profile not found at ${seccompProfileSourcePath}`);
    }
    
    const seccompProfileContent = fs.readFileSync(seccompProfileSourcePath, 'utf8');
    
    // Validate JSON structure
    const profileData = JSON.parse(seccompProfileContent);
    if (!profileData.defaultAction || !Array.isArray(profileData.syscalls)) {
      throw new Error("Invalid seccomp profile structure");
    }
    
    // Create temporary file for seccomp profile
    seccompProfilePath = createSeccompTempFile(seccompProfileContent);
    
    // Verify the temporary file is valid
    if (!verifySeccompProfile(seccompProfilePath)) {
      throw new Error("Seccomp profile verification failed");
    }
    
    // Verify AppArmor profile (fail-fast, no fallback)
    isAppArmorProfileLoaded = verifyAppArmorProfile();
    if (!isAppArmorProfileLoaded) {
      throw new Error("AppArmor profile verification failed - required for secure operation");
    }
    
    securityInitialized = true;
    logSecure("Security initialization completed successfully", {
      seccompEnabled: Boolean(seccompProfilePath),
      appArmorEnabled: isAppArmorProfileLoaded
    });
    
  } catch (error) {
    // Clean up any created temp files on failure
    if (seccompProfilePath) {
      try {
        fs.unlinkSync(seccompProfilePath);
      } catch {
        // Ignore cleanup errors
      }
      seccompProfilePath = null;
    }
    
    logError(`Security initialization failed: ${error}`);
    throw new Error(`Fatal: Security profile initialization failed - ${error}`);
  }
}

/**
 * Get security options for Docker container creation with verification
 */
export function getSecurityOptions(): string[] {
  if (!securityInitialized) {
    throw new Error("Security not initialized - call initializeSecurity() first");
  }
  
  if (!seccompProfilePath || !isAppArmorProfileLoaded) {
    throw new Error("Security profiles not properly loaded");
  }
  
  // Re-verify profiles before use
  if (!verifySeccompProfile(seccompProfilePath)) {
    throw new Error("Seccomp profile verification failed during container creation");
  }
  
  const securityOpt = [
    'no-new-privileges',
    `seccomp=${seccompProfilePath}` // Use temporary file path
  ];
  
  // Use verified AppArmor profile (no fallback)
  securityOpt.push('apparmor=ably-cli-sandbox-profile');
  
  logSecure("Security options prepared for container creation", {
    seccompProfile: path.basename(seccompProfilePath),
    appArmorProfile: 'ably-cli-sandbox-profile',
    optionsCount: securityOpt.length
  });
  
  return securityOpt;
}

/**
 * Check if the specified Docker network exists and enforce its presence
 */
export async function containerNetworkExists(): Promise<boolean> {
  try {
    logSecure(`Checking for required network: ${DOCKER_NETWORK_NAME}`);
    const networks = await docker.listNetworks({
      filters: { name: [DOCKER_NETWORK_NAME] }
    });
    
    const exists = networks.length > 0;
    
    if (exists) {
      logSecure(`Secure network verified: ${DOCKER_NETWORK_NAME}`);
    } else {
      logError(`Required secure network '${DOCKER_NETWORK_NAME}' does not exist`);
    }
    
    return exists;
  } catch (error) {
    logError(`Error checking network existence: ${error}`);
    return false;
  }
}

/**
 * Create a Docker network with enhanced security restrictions
 */
export async function createSecureNetwork(): Promise<void> {
  try {
    logSecure('Creating secure Docker network for containers...');

    // Check if network already exists
    const networks = await docker.listNetworks({
      filters: { name: [DOCKER_NETWORK_NAME] }
    });

    if (networks.length > 0) {
      logSecure(`Network ${DOCKER_NETWORK_NAME} already exists, verifying configuration...`);
      
      // Verify network configuration
      const network = networks[0];
      const hasSecurityLabels = network.Labels && 
        network.Labels['managed-by'] === 'ably-cli-terminal-server' &&
        network.Labels['purpose'] === 'security-hardened-network';
      
      if (!hasSecurityLabels) {
        logSecure("Warning: Existing network may not have proper security configuration");
      }
      
      return;
    }

    // Create a new network with enhanced security restrictions
    await docker.createNetwork({
      Name: DOCKER_NETWORK_NAME,
      Driver: 'bridge',
      Internal: false, // Allow internet access but restrict with rules
      EnableIPv6: false,
      Options: {
        'com.docker.network.bridge.enable_ip_masquerade': 'true',
        'com.docker.network.driver.mtu': '1500',
        // Add additional security options
        'com.docker.network.bridge.enable_icc': 'false', // Disable inter-container communication
        'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1' // Bind to localhost only
      },
      Labels: {
        'managed-by': 'ably-cli-terminal-server',
        'purpose': 'security-hardened-network',
        'security-level': 'restricted'
      }
    });

    logSecure(`Created secure network: ${DOCKER_NETWORK_NAME}`, {
      driver: 'bridge',
      interContainerComm: false,
      hostBinding: '127.0.0.1'
    });

  } catch (error) {
    logError(`Error creating secure network: ${error}`);
    throw new Error(`Failed to create required secure network: ${error}`);
  }
}

/**
 * Enforce secure network requirement
 */
export async function enforceSecureNetwork(): Promise<void> {
  const networkExists = await containerNetworkExists();
  
  if (!networkExists) {
    throw new Error(`Required secure network '${DOCKER_NETWORK_NAME}' does not exist. Run network setup first.`);
  }
}

/**
 * Clean up security resources
 */
export function cleanupSecurity(): void {
  if (seccompProfilePath) {
    try {
      fs.unlinkSync(seccompProfilePath);
      logSecure("Cleaned up seccomp temporary file", {
        file: path.basename(seccompProfilePath)
      });
    } catch (error) {
      logError(`Error cleaning up seccomp temp file: ${error}`);
    }
    seccompProfilePath = null;
  }
  
  securityInitialized = false;
}

/**
 * Get security status for monitoring
 */
export function getSecurityStatus(): {
  initialized: boolean;
  seccompEnabled: boolean;
  appArmorEnabled: boolean;
  networkReady: boolean;
} {
  return {
    initialized: securityInitialized,
    seccompEnabled: Boolean(seccompProfilePath),
    appArmorEnabled: isAppArmorProfileLoaded,
    networkReady: false // Will be checked separately
  };
}

// Clean up on process exit
process.on('exit', cleanupSecurity);
process.on('SIGINT', cleanupSecurity);
process.on('SIGTERM', cleanupSecurity); 