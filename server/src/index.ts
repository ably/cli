import { log as _log, logError } from "./utils/logger.js";
import { initializeServer } from "./services/websocket-server.js";
import { cleanupStaleContainers, monitorContainerHealth } from "./services/session-manager.js";
import { clearAllSessionTracking as _clearAllSessionTracking } from "./services/session-tracking-service.js";
import { RESOURCE_MONITORING_INTERVAL_MS } from "./config/server-config.js";

// Export test hooks for unit tests
export {
  getSessions,
  getSession,
  setSession,
  deleteSession,
  generateSessionId,
  cleanupSession,
  terminateSession,
  scheduleOrphanCleanup,
  canResumeSession,
  takeoverSession,
  __testHooks,
  __deleteSessionForTest,
} from "./services/session-manager.js";

// Export logger functions for external use
export { log, logError, logSecure } from "./utils/logger.js";

// Export session utilities for external use
export { computeCredentialHash } from "./utils/session-utils.js";

// Export session manager functions for external use
export { 
  getSessionCount 
} from "./services/session-manager.js";

// Container health monitoring interval
let containerHealthInterval: NodeJS.Timeout | null = null;

// Main server startup function
/**
 * Start the terminal server with all phases
 */
async function startTerminalServer(): Promise<void> {
  try {
    _log("Phase 1: Cleaning up stale containers from previous server instances...");
    await cleanupStaleContainers();
    _log("Phase 1: Stale container cleanup completed");

    // Phase 2: Start container health monitoring
    _log("Phase 2: Starting container health monitoring...");
    containerHealthInterval = setInterval(async () => {
      try {
        await monitorContainerHealth();
      } catch (error) {
        logError(`Container health monitoring error: ${error}`);
      }
    }, RESOURCE_MONITORING_INTERVAL_MS);
    _log("Phase 2: Container health monitoring started");

    // Phase 3: Initialize and start the server
    _log("Phase 3: Initializing WebSocket server...");
    // Stop container health monitoring
    if (containerHealthInterval) {
      clearInterval(containerHealthInterval);
      _log("Container health monitoring stopped");
    }
    await initializeServer();
    _log("Phase 3: Terminal server started successfully");

  } catch (error) {
    logError(`Failed to start terminal server: ${error}`);
    
    // Cleanup on error
    if (containerHealthInterval) {
      clearInterval(containerHealthInterval);
    }
    
    process.exit(1);
  }
}

// More robust detection of whether this file is being run directly
// Check multiple conditions to ensure we don't start the server during tests
const isMainModule = () => {
  // Don't start if we're in test environment
  if (process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event === 'test') {
    return false;
  }
  
  // Don't start if mocha is running
  if (process.argv.some(arg => arg.includes('mocha') || arg.includes('test'))) {
    return false;
  }
  
  // Don't start if this is being imported by another module
  if (import.meta.url !== `file://${process.argv[1]}`) {
    return false;
  }
  
  return true;
};

// Start the server using top-level await only if running directly
if (isMainModule()) {
  _log("Starting terminal server...");
  await startTerminalServer();
}
