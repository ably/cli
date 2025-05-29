import { pathToFileURL } from 'node:url';
import { initializeServer } from "./services/websocket-server.js";
import { log as _log, logError } from "./utils/logger.js";

// Determine if this file is being executed directly via `node server/dist/index.js` (or compiled variant)
// versus being imported as a library (e.g. from unit tests). When imported we must NOT automatically
// start a WebSocket server, otherwise tests will spawn background processes that occupy port 8080
// and prevent the test runner from exiting within its watchdog timeout.
const __isDirectRun = import.meta.url === (process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined);

// --- Server Initialization (using top-level await) ---

if (__isDirectRun) {
  try {
    await initializeServer();

    // Handle Node.js debugger disconnection
    // Use type assertion for Node.js internal properties
    const nodeProcess = process as unknown as {
      _debugProcess?: (pid: number) => void;
      _debugEnd?: () => void;
      pid?: number;
    };

    if (nodeProcess._debugProcess && nodeProcess.pid) {
      process.on('SIGINT', () => {
        // Disable the debugger on first SIGINT to allow clean exit
        if (nodeProcess._debugEnd) {
          nodeProcess._debugEnd();
        }
      });
    }
  } catch (error) {
    logError("Server failed unexpectedly:");
    logError(error);
    process.exit(1);
  }
}

// Export main functionality for programmatic use
export { initializeServer, startServer } from "./services/websocket-server.js";
export { log, logError } from "./utils/logger.js";

// Export test hooks for testing
export { __testHooks, __deleteSessionForTest } from "./services/session-manager.js"; 