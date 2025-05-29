import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { DOCKER_NETWORK_NAME } from "../config/server-config.js";
import { log, logError } from "../utils/logger.js";

const require = createRequire(import.meta.url);
const Dockerode = require("dockerode");

// Simplified __dirname calculation
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Variable to store AppArmor profile status - checked once on startup
let isAppArmorProfileLoaded = false;

// Global docker instance for network operations
const docker = new Dockerode();

// Read seccomp profile content once on startup
let seccompProfileContent: string;

// Initialize security configurations
export function initializeSecurity(): void {
  // Read seccomp profile content once on startup
  // Use __dirname to get the correct path relative to the security service location
  // server/dist/src/services/ -> ../../../docker/seccomp-profile.json (go up to server/, then to docker/)
  const seccompProfilePath = path.resolve(__dirname, '../../../docker/seccomp-profile.json');
  try {
    const seccompProfileContentRaw = fs.readFileSync(seccompProfilePath, 'utf8');
    seccompProfileContent = JSON.stringify(JSON.parse(seccompProfileContentRaw));
    log("Seccomp profile loaded successfully.");
  } catch (error) {
    logError(`Failed to load or parse seccomp profile at ${seccompProfilePath}: ${error}`);
    seccompProfileContent = '{}';
  }

  // Initialize AppArmor status
  checkAppArmorProfileStatus();
}

// Function to check AppArmor profile status ONCE on startup
export function checkAppArmorProfileStatus(): void {
  try {
      log("Checking AppArmor profile status...");
      // Check if our AppArmor profile exists in the standard location
      const appArmorCheck = execSync('apparmor_parser -QT /etc/apparmor.d/docker-ably-cli-sandbox 2>/dev/null || echo "notfound"').toString().trim();

      if (appArmorCheck === 'notfound') {
          log('AppArmor profile not found or not loaded, will use unconfined.');
          isAppArmorProfileLoaded = false;
      } else {
          log('AppArmor profile found and seems loaded.');
          isAppArmorProfileLoaded = true;
      }
  } catch (error) {
      log(`AppArmor check command failed, assuming profile not loaded: ${error instanceof Error ? error.message : String(error)}`);
      isAppArmorProfileLoaded = false;
  }
}

/**
 * Get security options for Docker container creation
 */
export function getSecurityOptions(): string[] {
  // Configure security options using file content
  const securityOpt = [
    'no-new-privileges',
    `seccomp=${seccompProfileContent}` // Pass profile content directly
  ];

  // Use the pre-checked AppArmor status
  if (isAppArmorProfileLoaded) {
    log('Applying AppArmor profile: ably-cli-sandbox-profile');
    securityOpt.push('apparmor=ably-cli-sandbox-profile');
  } else {
    log('Applying AppArmor profile: unconfined');
    securityOpt.push('apparmor=unconfined');
  }

  return securityOpt;
}

/**
 * Check if the specified Docker network exists
 */
export async function containerNetworkExists(): Promise<boolean> {
    try {
        log(`Checking if network ${DOCKER_NETWORK_NAME} exists...`);
        const networks = await docker.listNetworks({
            filters: { name: [DOCKER_NETWORK_NAME] }
        });
        return networks.length > 0;
    } catch (error) {
        logError(`Error checking network existence: ${error}`);
        return false; // Fallback to default network on error
    }
}

/**
 * Create a Docker network with security restrictions
 */
export async function createSecureNetwork(): Promise<void> {
    try {
        log('Setting up secure Docker network for containers...');

        // Check if network already exists
        const networks = await docker.listNetworks({
            filters: { name: [DOCKER_NETWORK_NAME] }
        });

        if (networks.length > 0) {
            log(`Network ${DOCKER_NETWORK_NAME} already exists, skipping creation`);
            return;
        }

        // Create a new network with restrictions
        await docker.createNetwork({
            Name: DOCKER_NETWORK_NAME,
            Driver: 'bridge',
            Internal: false, // Allow internet access but we'll restrict with rules
            EnableIPv6: false,
            Options: {
                'com.docker.network.bridge.enable_ip_masquerade': 'true',
                'com.docker.network.driver.mtu': '1500'
            },
            Labels: {
                'managed-by': 'ably-cli-terminal-server',
                'purpose': 'security-hardened-network'
            }
        });

        log(`Created secure network: ${DOCKER_NETWORK_NAME}`);

        // Note: Additional network filtering (like iptables rules or DNS filtering)
        // should be set up in the Docker host or through a custom entrypoint script
        // We'll document this requirement in Security-Hardening.md
    } catch (error) {
        logError(`Error creating secure network: ${error}`);
        // Continue even if network creation fails - we'll fall back to default
    }
}

/**
 * Get the AppArmor profile status
 */
export function getAppArmorStatus(): boolean {
  return isAppArmorProfileLoaded;
} 