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
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

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

// Only start the server if this file is run directly
// Use proper path comparison to handle both file URLs and paths correctly
const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1] ? resolve(process.argv[1]) : null;

// Debug logging for CI troubleshooting
logger(`🔍 Server startup check:`);
logger(`   Current file: ${currentFilePath}`);
logger(`   Executed file: ${executedFilePath || 'undefined (imported)'}`);
logger(`   Match: ${executedFilePath ? currentFilePath === executedFilePath : false}`);
logger(`   NODE_ENV: ${process.env.NODE_ENV}`);
logger(`   CI: ${process.env.CI}`);

if (executedFilePath && currentFilePath === executedFilePath) {
  logger(`✅ Starting server - file was executed directly`);
  await startTerminalServer();
} else {
  logger(`⏸️  Not starting server - file was imported/required`);
}

export { startTerminalServer };
