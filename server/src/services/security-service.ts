import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DOCKER_NETWORK_NAME, IS_CI, IS_DEVELOPMENT } from "../config/server-config.js";
import { logSecure, logError } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");

// Simplified __dirname calculation
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Security profile state
let seccompProfilePath: string | null = null;
let isAppArmorProfileLoaded = false;
let securityInitialized = false;
let securityDegraded = false; // Track if we're running in degraded mode

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
 * Initialize security configurations with CI-aware graceful degradation
 */
export function initializeSecurity(): void {
  if (securityInitialized) {
    logSecure("Security already initialized, skipping...");
    return;
  }

  if (IS_DEVELOPMENT) {
    logSecure("Development environment detected - using graceful security degradation mode");
  }

  logSecure("Initializing security profiles...", { 
    environment: IS_DEVELOPMENT ? 'development' : IS_CI ? 'CI' : 'production',
    failFast: !IS_DEVELOPMENT && !IS_CI
  });

  try {
    // Load and verify seccomp profile
    const seccompProfileSourcePath = path.resolve(__dirname, '../../../docker/seccomp-profile.json');
    
    if (fs.existsSync(seccompProfileSourcePath)) {
      try {
        const seccompProfileContent = fs.readFileSync(seccompProfileSourcePath, 'utf8');
        
        // Validate JSON structure
        const profileData = JSON.parse(seccompProfileContent);
        if (!profileData.defaultAction || !Array.isArray(profileData.syscalls)) {
          throw new Error("Invalid seccomp profile structure");
        }
        
        // In development mode, skip custom seccomp to avoid Docker parsing issues
        if (IS_DEVELOPMENT) {
          logSecure("Development mode: Skipping custom seccomp profile to avoid Docker compatibility issues");
          seccompProfilePath = null;
        } else {
          // Create temporary file for seccomp profile
          seccompProfilePath = createSeccompTempFile(seccompProfileContent);
          
          // Verify the temporary file is valid
          if (!verifySeccompProfile(seccompProfilePath)) {
            throw new Error("Seccomp profile verification failed");
          }
          
          logSecure("Seccomp profile loaded successfully");
        }
      } catch (error) {
        if (IS_DEVELOPMENT || IS_CI) {
          logSecure(`${IS_DEVELOPMENT ? 'Development' : IS_CI ? 'CI' : 'production'} mode: Seccomp profile failed (${error}) - continuing without seccomp`);
          seccompProfilePath = null;
          securityDegraded = true;
        } else {
          throw error;
        }
      }
    } else {
      const error = `Seccomp profile not found at ${seccompProfileSourcePath}`;
      if (IS_DEVELOPMENT || IS_CI) {
        logSecure(`${IS_DEVELOPMENT ? 'Development' : IS_CI ? 'CI' : 'production'} mode: ${error} - continuing without seccomp`);
        seccompProfilePath = null;
      } else {
        throw new Error(error);
      }
    }
    
    // Verify AppArmor profile with CI-aware handling
    try {
      isAppArmorProfileLoaded = verifyAppArmorProfile();
      if (!isAppArmorProfileLoaded) {
        throw new Error("AppArmor profile verification failed");
      }
    } catch (error) {
      if (IS_DEVELOPMENT || IS_CI) {
        logSecure(`${IS_DEVELOPMENT ? 'Development' : IS_CI ? 'CI' : 'production'} mode: AppArmor failed (${error}) - continuing without AppArmor`);
        isAppArmorProfileLoaded = false;
        securityDegraded = true;
      } else {
        throw new Error(`AppArmor profile verification failed - required for secure operation: ${error}`);
      }
    }
    
    securityInitialized = true;
    
    if (securityDegraded && (IS_DEVELOPMENT || IS_CI)) {
      logSecure("Security initialization completed with degraded security for development or CI", {
        seccompEnabled: Boolean(seccompProfilePath),
        appArmorEnabled: isAppArmorProfileLoaded,
        environment: IS_DEVELOPMENT ? 'development' : IS_CI ? 'CI' : 'production'
      });
    } else {
      logSecure("Security initialization completed successfully", {
        seccompEnabled: Boolean(seccompProfilePath),
        appArmorEnabled: isAppArmorProfileLoaded,
        environment: IS_DEVELOPMENT ? 'development' : IS_CI ? 'CI' : 'production'
      });
    }
    
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
 * Get security options for Docker container creation with CI-aware configuration
 */
export function getSecurityOptions(): string[] {
  if (!securityInitialized) {
    throw new Error("Security not initialized - call initializeSecurity() first");
  }
  
  const securityOpt: string[] = [];
  
  // Always include no-new-privileges
  securityOpt.push('no-new-privileges');
  
  // Add seccomp if available
  if (seccompProfilePath) {
    // Re-verify profile before use
    if (verifySeccompProfile(seccompProfilePath)) {
      securityOpt.push(`seccomp=${seccompProfilePath}`);
    } else {
      if (IS_DEVELOPMENT || IS_CI) {
        logSecure("Development or CI mode: Seccomp profile verification failed during container creation - skipping seccomp");
      } else {
        throw new Error("Seccomp profile verification failed during container creation");
      }
    }
  } else if (IS_DEVELOPMENT || IS_CI) {
    logSecure("Development or CI mode: No seccomp profile available - using default Docker seccomp");
  }
  
  // Add AppArmor if available
  if (isAppArmorProfileLoaded) {
    securityOpt.push('apparmor=ably-cli-sandbox-profile');
  } else if (IS_DEVELOPMENT || IS_CI) {
    logSecure("Development or CI mode: No AppArmor profile available - using default Docker AppArmor");
  }
  
  const securityLevel = securityDegraded ? 'degraded' : 'full';
  logSecure("Security options prepared for container creation", {
    seccompProfile: seccompProfilePath ? path.basename(seccompProfilePath) : 'none',
    appArmorProfile: isAppArmorProfileLoaded ? 'ably-cli-sandbox-profile' : 'default',
    optionsCount: securityOpt.length,
    securityLevel,
    environment: IS_DEVELOPMENT ? 'development' : IS_CI ? 'CI' : 'production'
  });
  
  return securityOpt;
}

/**
 * Check if the specified Docker network exists with CI-aware handling
 */
export async function containerNetworkExists(): Promise<boolean> {
  try {
    logSecure(`Checking for network: ${DOCKER_NETWORK_NAME}`, {
      environment: IS_DEVELOPMENT ? 'development' : IS_CI ? 'CI' : 'production'
    });
    
    const networks = await docker.listNetworks({
      filters: { name: [DOCKER_NETWORK_NAME] }
    });
    
    const exists = networks.length > 0;
    
    if (exists) {
      logSecure(`Network verified: ${DOCKER_NETWORK_NAME}`);
    } else {
      if (IS_DEVELOPMENT || IS_CI) {
        logSecure(`${IS_DEVELOPMENT ? 'Development' : IS_CI ? 'CI' : 'production'} mode: Network '${DOCKER_NETWORK_NAME}' not found - will use default bridge network`);
      } else {
        logError(`Required secure network '${DOCKER_NETWORK_NAME}' does not exist`);
      }
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
 * Enforce secure network requirement with CI-aware handling
 */
export async function enforceSecureNetwork(): Promise<void> {
  const networkExists = await containerNetworkExists();
  
  if (!networkExists) {
    if (IS_DEVELOPMENT || IS_CI) {
      logSecure(`${IS_DEVELOPMENT ? 'Development' : IS_CI ? 'CI' : 'production'} mode: Required network '${DOCKER_NETWORK_NAME}' not available - containers will use default bridge network`);
      return; // Allow graceful degradation in development or CI
    } else {
      throw new Error(`Required secure network '${DOCKER_NETWORK_NAME}' does not exist. Run network setup first.`);
    }
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
  securityDegraded = false;
}

/**
 * Get security status for monitoring
 */
export function getSecurityStatus(): {
  initialized: boolean;
  seccompEnabled: boolean;
  appArmorEnabled: boolean;
  networkReady: boolean;
  degraded: boolean;
  environment: string;
} {
  return {
    initialized: securityInitialized,
    seccompEnabled: Boolean(seccompProfilePath),
    appArmorEnabled: isAppArmorProfileLoaded,
    networkReady: false, // Will be checked separately
    degraded: securityDegraded,
    environment: IS_DEVELOPMENT ? 'development' : IS_CI ? 'CI' : 'production'
  };
}

// Clean up on process exit only (not on module unload)
process.on('exit', cleanupSecurity);
process.on('SIGINT', cleanupSecurity);
process.on('SIGTERM', cleanupSecurity); 