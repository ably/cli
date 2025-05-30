import { pathToFileURL } from 'node:url';
import { log as _log, logError } from "./utils/logger.js";
import { initializeServer } from "./services/websocket-server.js";

// Export test hooks for unit tests
export { __testHooks, __deleteSessionForTest } from "./services/session-manager.js";

// Export logger functions for external use
export { log, logError, logSecure } from "./utils/logger.js";

// Export session utilities for external use
export { computeCredentialHash } from "./utils/session-utils.js";

// Export session manager functions for external use
export { 
  generateSessionId, 
  getSessions, 
  getSession, 
  setSession, 
  deleteSession, 
  getSessionCount 
} from "./services/session-manager.js";

// Main server startup
async function main() {
    try {
        _log("Starting Ably CLI Terminal Server...");
        const server = await initializeServer();
        _log(`Server started successfully on port ${process.env.PORT || 8080}`);
        
        // Keep the process alive
        process.on('SIGINT', () => {
            _log('Received SIGINT, shutting down gracefully...');
            server.close(() => {
                process.exit(0);
            });
        });
    } catch (error: unknown) {
        logError("Server failed unexpectedly:");
        logError(error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
            logError(error.stack);
        }
        process.exit(1);
    }
}

// Start the server if this file is run directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
} 