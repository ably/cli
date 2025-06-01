import { 
  cleanupAllSessions,
  cleanupStaleContainers
} from './services/session-manager.js';
import { 
  initializeRateLimiting,
  shutdownRateLimiting
} from './services/rate-limiting-service.js';
import { 
  clearAllSessionTracking
} from './services/session-tracking-service.js';
import { initializeServer } from './services/websocket-server.js';
import { PORT } from './config/server-config.js';
import { log as logger } from './utils/logger.js';

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

async function startTerminalServer(): Promise<void> {
  try {
    logger('🚀 Starting Ably CLI Terminal Server...');

    // Clean up stale containers on startup
    await cleanupStaleContainers();

    // Initialize rate limiting
    initializeRateLimiting();

    // Use the existing WebSocket server initialization
    const websocketServer = await initializeServer();

    logger(`✅ Terminal Server listening on port ${PORT}`);
    logger(`   Health check endpoint: http://localhost:${PORT}/health`);
    logger(`   WebSocket endpoint: ws://localhost:${PORT}`);

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      logger(`\n🛑 Received ${signal}. Shutting down gracefully...`);
      
      try {
        // Close HTTP server
        websocketServer.close(() => {
          logger('HTTP server closed');
        });

        // Clean up sessions
        await cleanupAllSessions();
        logger('Sessions cleaned up');

        // Shut down rate limiting
        shutdownRateLimiting();
        logger('Rate limiting stopped');

        // Clear session tracking
        clearAllSessionTracking();
        logger('Session tracking cleared');

        logger('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger(`Error during shutdown: ${error}`);
        process.exit(1);
      }
    };

    // Register signal handlers
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle unhandled rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger(`Unhandled Promise Rejection: ${promise} reason: ${reason}`);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger(`Uncaught Exception: ${error}`);
      process.exit(1);
    });

  } catch (error) {
    logger(`Failed to start terminal server: ${error}`);
    process.exit(1);
  }
}

// Only start the server if this file is run directly (using top-level await as preferred)
if (import.meta.url === `file://${process.argv[1]}`) {
  await startTerminalServer();
}

export { startTerminalServer };
