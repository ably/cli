import WebSocket from 'ws';
import process from 'node:process';

// --- Configuration ---
const DEFAULT_URL = 'ws://localhost:8080';
// Use environment variable or argument, fallback to default
const targetUrl = process.env.TERMINAL_SERVER_URL || process.argv[2] || DEFAULT_URL;

// Dummy credentials (structurally valid)
const DUMMY_API_KEY = 'dummy.key:secret';
const DUMMY_ACCESS_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWFnbm9zdGljIiwiaWF0IjoxNTE2MjM5MDIyfQ.dummy_signature';
const CONNECTION_TIMEOUT = 30000; // 30 seconds
const RESPONSE_TIMEOUT_DEFAULT = 20000;  // 20 seconds default
const RESPONSE_TIMEOUT_STATUS = 25000; // 25 seconds specifically for status check

// --- Helper Functions ---
function log(message: string): void {
  console.log(`[DIAGNOSTICS_SERVER] ${message}`);
}

function logError(message: unknown): void {
  console.error(`[DIAGNOSTICS_SERVER_ERROR] ${message instanceof Error ? message.message : String(message)}`);
}

// --- Main Diagnostic Logic (Top-Level Await) ---
let ws: WebSocket | null = null;
let connectionTimeoutId: NodeJS.Timeout | null = null;
let responseTimeoutId: NodeJS.Timeout | null = null;
let testStage = 0; // 0: Connecting, 1: Waiting for prompt, 2: Waiting for `ably` response, 3: Waiting for `ably help status` response
let receivedOutput = ''; // Accumulate output

try {
  log(`Attempting to connect to terminal server at: ${targetUrl}`);
  ws = new WebSocket(targetUrl);

  connectionTimeoutId = setTimeout(() => {
    logError(`Connection timed out after ${CONNECTION_TIMEOUT / 1000} seconds.`);
    ws?.terminate(); // Force close
    process.exit(1);
  }, CONNECTION_TIMEOUT);

  await new Promise<void>((resolve, reject) => {
    ws?.on('open', () => {
      clearTimeout(connectionTimeoutId!);
      log('WebSocket connection opened successfully.');
      log('Sending authentication payload...');
      ws?.send(JSON.stringify({
        apiKey: DUMMY_API_KEY,
        accessToken: DUMMY_ACCESS_TOKEN,
        environmentVariables: { NODE_ENV: 'test' },
      }));
      testStage = 1; // Move to waiting for prompt
      // Set timeout for initial prompt
      responseTimeoutId = setTimeout(() => reject(new Error('Timeout waiting for initial prompt')), RESPONSE_TIMEOUT_DEFAULT);
    });

    ws?.on('message', (data: Buffer) => {
      const message = data.toString();
      receivedOutput += message; // Accumulate output
      // process.stdout.write(message); // Optional: log raw output

      try {
        switch (testStage) {
          case 1: {
            // Waiting for initial prompt
            if (message.includes('$')) { // Check for prompt
              clearTimeout(responseTimeoutId!);
              log('Received initial prompt ($). Server seems ready.');
              log('Sending basic command: ably');
              ws?.send('ably\n');
              testStage = 2; // Move to waiting for ably response
              receivedOutput = ''; // Reset buffer for next command output
              responseTimeoutId = setTimeout(() => reject(new Error('Timeout waiting for `ably` response')), RESPONSE_TIMEOUT_DEFAULT);
            }
            break;
          }

          case 2: {
            // Waiting for `ably` response
            // Check for common command names in the output more flexibly
            if (receivedOutput.includes('accounts') || receivedOutput.includes('apps') || receivedOutput.includes('channels') || receivedOutput.includes('help')) {
              clearTimeout(responseTimeoutId!);
              log('Received expected output from `ably` command.');
              log('Sending command: ably help status');
              ws?.send('ably help status\n');
              testStage = 3; // Move to waiting for status response
              receivedOutput = ''; // Reset buffer
              // Use slightly longer timeout for status check
              responseTimeoutId = setTimeout(() => reject(new Error('Timeout waiting for `ably help status` response')), RESPONSE_TIMEOUT_STATUS);
            }
            break;
          }

          case 3: { // Waiting for `ably help status` response
            // Check only for the header, indicating the command ran and accessed the status service
            if (receivedOutput.includes('Ably service status')) {
              clearTimeout(responseTimeoutId!);
              log('Received expected output header from "ably help status". Diagnostics successful!');
              ws?.close(1000, 'Test Complete');
              resolve(); // Test passed
            }
            break;
          }
        }
      } catch (error) {
        reject(error); // Reject promise on error within message handler
      }
    });

    ws?.on('error', (error) => {
      reject(new Error(`WebSocket error: ${error.message}`)); // Reject promise on error
    });

    ws?.on('close', (code, reason) => {
      const reasonStr = reason.toString();
      log(`WebSocket closed. Code: ${code}, Reason: ${reasonStr}`);
      // If the promise hasn't resolved (test didn't pass), reject it.
      reject(new Error(`WebSocket closed unexpectedly (Code: ${code}) before test completion.`));
    });
  });

  // If we reach here, the promise resolved, meaning success
  process.exit(0);

} catch (error) {
  logError(error);
  ws?.terminate(); // Ensure connection is closed on error
  process.exit(1); // Exit with error code
} finally {
  // Final cleanup of timeouts
  if (connectionTimeoutId) clearTimeout(connectionTimeoutId);
  if (responseTimeoutId) clearTimeout(responseTimeoutId);
}
