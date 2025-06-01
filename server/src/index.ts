import { pathToFileURL } from 'node:url';
import { log as _log, logError } from "./utils/logger.js";
import { initializeServer } from "./services/websocket-server.js";
import { cleanupStaleContainers, monitorContainerHealth } from "./services/session-manager.js";
import { clearAllSessionTracking } from "./services/session-tracking-service.js";

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

// Main server startup with Phase 2 and 3 enhancements
try {
  _log("Starting Ably CLI Terminal Server...");
  
  // Phase 3: Enhanced startup cleanup - Clean up any stale containers from previous instances
  _log("Phase 3: Performing enhanced startup cleanup...");
  await cleanupStaleContainers();
  
  // Clear any leftover session tracking from previous instances
  clearAllSessionTracking();
  
  const server = await initializeServer();
  _log(`Server started successfully on port ${process.env.PORT || 8080}`);
  
  // Phase 2: Start container health monitoring
  containerHealthInterval = setInterval(async () => {
    try {
      await monitorContainerHealth();
    } catch (error) {
      logError(`Container health monitoring error: ${error}`);
    }
  }, 120 * 1000); // Every 2 minutes
  _log("Phase 2: Container health monitoring started");
  
  // Enhanced graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    _log(`Received ${signal}. Starting enhanced graceful shutdown...`);
    
    // Stop container health monitoring
    if (containerHealthInterval) {
      clearInterval(containerHealthInterval);
      _log("Container health monitoring stopped");
    }
    
    // Clear session tracking
    clearAllSessionTracking();
    
    server.close(() => {
      _log("✓ Enhanced graceful shutdown completed");
      process.exit(0);
    });
  };
  
  // Keep the process alive with enhanced shutdown
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  
} catch (error: unknown) {
  logError("Server failed unexpectedly:");
  logError(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    logError(error.stack);
  }
  process.exit(1);
}
