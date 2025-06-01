import { WebSocket } from "ws";
import { Duplex } from "node:stream";
import * as stream from "node:stream";
import type { ClientSession } from "../types/session.types.js";
import type { ServerStatusMessage } from "../types/websocket.types.js";
import { OUTPUT_BUFFER_MAX_LINES } from "../config/server-config.js";
import { log, logError } from "./logger.js";
import { terminateSession, scheduleOrphanCleanup, cleanupSession } from "../services/session-manager.js";

export function pipeStreams(
  ws: WebSocket,
  containerStream: Duplex,
  session?: ClientSession,
  isRawTty = false,
): void {
  try {
    log('Setting up bidirectional piping between WebSocket and container stream');
    let firstChunkReceived = false; // Flag to log only the first chunk

    if (isRawTty) {
      // Handle potential fragmented handshake JSON that appears **once**
      let handshakeHandled = false;

      containerStream.on('data', (chunk: Buffer) => {
        // Fast path once handshake removed
        if (handshakeHandled) {
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
          if (session) {
            const txt = chunk.toString('utf8');
            if (!session.outputBuffer) session.outputBuffer = [];
            session.outputBuffer.push(txt);
          }
          return;
        }

        // Still looking for handshake
        const text = chunk.toString('utf8');
        const handshakeRegex = /\{[^}]*stream[^}]*stdin[^}]*stdout[^}]*stderr[^}]*hijack[^}]*\}/;
        const match = text.match(handshakeRegex);

        if (match) {
          log('Swallowed Docker attach handshake JSON (regex match)');
          handshakeHandled = true;
          const before = text.slice(0, match.index);
          const after = text.slice(match.index! + match[0].length);

          if (before.length > 0 && ws.readyState === WebSocket.OPEN) ws.send(before);
          if (after.length > 0 && ws.readyState === WebSocket.OPEN) ws.send(after);

          if (session) {
            if (!session.outputBuffer) session.outputBuffer = [];
            if (before.length > 0) session.outputBuffer.push(before);
            if (after.length > 0) session.outputBuffer.push(after);
          }
        } else {
          // No handshake in this chunk → forward as-is
          if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
          if (session) {
            if (!session.outputBuffer) session.outputBuffer = [];
            session.outputBuffer.push(text);
          }
        }
      });
    } else {
      // Demultiplexed stream (non-TTY exec)
      let processingBuffer = Buffer.alloc(0);

      containerStream.on('data', (chunk: Buffer) => {
        processingBuffer = Buffer.concat([processingBuffer, chunk]);

        // Process complete frames
        while (processingBuffer.length >= 8) {
          const streamType = processingBuffer[0]; // 1=stdout, 2=stderr
          const payloadSize = processingBuffer.readUInt32BE(4);

          if (processingBuffer.length < 8 + payloadSize) {
            break; // Wait for more data
          }

          const payload = processingBuffer.slice(8, 8 + payloadSize);

          if (!firstChunkReceived) {
            log(`First chunk received from container (type ${streamType}, size ${payloadSize})`);
            firstChunkReceived = true;
          }

          if (streamType === 1 || streamType === 2) {
            if (ws.readyState === WebSocket.OPEN) ws.send(payload);

            if (session) {
              const text = payload.toString('utf8');
              if (!session.outputBuffer) session.outputBuffer = [];
              session.outputBuffer.push(text);
              if (session.outputBuffer.length > OUTPUT_BUFFER_MAX_LINES) {
                session.outputBuffer.splice(0, session.outputBuffer.length - OUTPUT_BUFFER_MAX_LINES);
              }
            }
          }

          processingBuffer = processingBuffer.slice(8 + payloadSize);
        }
      });
    }

    // ------------------------------------------------------------------
    // Detect when the user terminates the shell (e.g. by typing `exit`).
    // When the underlying container stream ends we notify the client and
    // close the WebSocket with an application-specific code (4000). This is
    // treated as a *non-recoverable* disconnect by the React component so
    // it will show a prompt instead of auto-reconnecting.
    // ------------------------------------------------------------------
    const handleStreamTermination = (label: string) => {
      try {
        log(`Container stream ${label} – signalling session end to client`);
        if (ws.readyState === WebSocket.OPEN) {
          const endMsg: ServerStatusMessage = {
            type: 'status',
            payload: 'disconnected',
            reason: 'Session ended by user',
          };
          ws.send(JSON.stringify(endMsg));
          // Give the message a moment to flush before closing
          setTimeout(() => {
            try {
              ws.close(4000, 'user-exit');
            } catch { /* ignore */ }
          }, 10);
        }
      } catch (error) {
        logError(`Error while handling stream termination: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Ensure container/session cleanup (graceful=false because CLI already exited)
      if (session) {
        void terminateSession(session.sessionId, 'User exit', false, 4000);
      }
    };

    containerStream.on('end', () => handleStreamTermination('end'));
    containerStream.on('close', () => handleStreamTermination('close'));
    containerStream.on('error', (error) => {
      logError(`Container stream error: ${error}`);
      handleStreamTermination('error');
    });

  } catch (error) {
    logError(`Failed to pipe streams: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Helper to safely close WebSocket stream
export function safeCloseWsStream(wsStream: Duplex): void {
  if (wsStream && !wsStream.destroyed) {
    log("Closing WebSocket stream.");
    wsStream.destroy();
  }
}

// --- Container Attachment Logic ---

export async function attachToContainer(session: ClientSession, ws: WebSocket): Promise<void> {
    if (!session.container) {
        logError(`Container not found for session ${session.sessionId} during attach.`);
        try {
            const errorMsg: ServerStatusMessage = { type: "status", payload: "error", reason: "Internal server error: Container not found" };
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(errorMsg));
        } catch { logError('Failed to send error status for container not found'); }
        await terminateSession(session.sessionId, "Container not found", false);
        return;
    }

    // Mark that attachment is starting
    session.isAttaching = true;

    // If we're re-attaching during a session resume we must close the old
    // streams first; otherwise Docker will keep the previous hijacked
    // connection open which steals STDIN and leaves the new attachment
    // read-only.
    if (session.stdinStream && !session.stdinStream.destroyed) {
      // Detach termination listeners so that destroying the old stream while
      // re-attaching doesn't trigger the "user exit" path that would
      // otherwise call terminateSession and kill the container.
      session.stdinStream.removeAllListeners('end');
      session.stdinStream.removeAllListeners('close');
      session.stdinStream.removeAllListeners('error');
      safeCloseWsStream(session.stdinStream);
    }
    if (session.stdoutStream && session.stdoutStream !== session.stdinStream && !session.stdoutStream.destroyed) {
      session.stdoutStream.removeAllListeners('end');
      session.stdoutStream.removeAllListeners('close');
      session.stdoutStream.removeAllListeners('error');
      safeCloseWsStream(session.stdoutStream as unknown as Duplex);
    }

    // Attach directly to the container's main TTY so that the same shell
    // process stays alive across WebSocket reconnects. Docker allows
    // multiple attachments to a running container provided TTY=true.

    let containerStream = await session.container.attach({
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
    }) as stream.Duplex;

    session.stdinStream = containerStream;
    session.stdoutStream = containerStream;
    // We are no longer using per-resume exec instances
    session.execInstance = undefined;
    // Reset per-attach debug flag so we can log the first keystroke again
    session._debugLoggedFirstKey = false;

    log(`Attached stream to container ${session.container.id} for session ${session.sessionId}`);
    session.isAttaching = false;

    // Send "connected" status message AFTER streams are attached but BEFORE piping starts
    try {
        if (ws.readyState === WebSocket.OPEN) {
            const connectedMsg: ServerStatusMessage = { type: "status", payload: "connected" };
            log(`[Server] Sending 'connected' status to session ${session.sessionId}`);
            ws.send(JSON.stringify(connectedMsg));

            // Immediately follow with a hello that contains the sessionId for the client to log/store
            const helloMsg = { type: "hello", sessionId: session.sessionId };
            log(`[Server] Sending 'hello' message to session ${session.sessionId}`);
            ws.send(JSON.stringify(helloMsg));
        } else {
            logError(`WebSocket not open when sending connected/hello to ${session.sessionId}, readyState: ${ws.readyState}`);
            await terminateSession(session.sessionId, "WebSocket not ready for status messages", false);
            return;
        }
    } catch (error) {
        logError(`Error sending 'connected' status to ${session.sessionId}: ${error}`);
        await terminateSession(session.sessionId, "Failed to confirm connection status", false);
        return;
    }
    
    // Add a small delay before piping to allow client to process "connected" status
    await new Promise(resolve => setTimeout(resolve, 50)); 

    // Now start piping after sending connected status and adding delay
    pipeStreams(ws, containerStream, session, true);

    // NOTE: We no longer inject an extra "\n" after attach because it caused
    // double prompts both on first load and on every resume. The restricted
    // shell prints its banner and prompt unconditionally, so an extra newline
    // is unnecessary and confusing.

    // Helper function to handle stream errors and cleanup
    const handleStreamError = (error: Error | null = null) => {
        if (error) {
            logError(`Stream error for session ${session.sessionId}: ${error.message}`);
        }
        safeCloseWsStream(containerStream);
        if (session.authenticated) {
            scheduleOrphanCleanup(session);
        } else {
            cleanupSession(session.sessionId);
        }
    };

    ws.on("close", async (code, reason) => {
        log(
            `WebSocket closed for session ${session.sessionId}. Code: ${code}, Reason: ${reason && reason.length > 0 ? reason.toString() : "No reason given"}. isAttaching: ${session.isAttaching}`,
        );
        // If attachment was in progress and ws closed, it's an abrupt client disconnect
        if (session.isAttaching) {
            log(`Client ${session.sessionId} disconnected during attachment process.`);
        }
        // Ensure session is cleaned up. terminateSession handles sending 'disconnected' if ws is still open,
        // but here ws is already closing/closed.
        scheduleOrphanCleanup(session);
    });

    ws.on("error", async (error: Error) => {
        logError(`WebSocket stream error for session ${session.sessionId}: ${error.message}`);
        handleStreamError();
    });

    containerStream.on('close', () => {
        log(`Container stream closed for session ${session.sessionId}`);
        handleStreamError();
    });
    
    containerStream.on('error', (error) => {
        handleStreamError(error);
    });
}

// --- Message Handlers ---

export function handleExecResize(
  session: ClientSession,
  data: { cols: number; rows: number },
): void {
  const { cols, rows } = data;
  log(`Resizing TTY for session ${session.sessionId} to ${cols}x${rows}`);
  if (session.execInstance) {
    session.execInstance
      .resize({ h: rows, w: cols })
      .catch((error: Error) => {
        logError(`Error resizing exec TTY for session ${session.sessionId}: ${error.message}`);
      });
  } else if (session.container) {
    session.container
      .resize({ h: rows, w: cols })
      .catch((error: Error) => {
        logError(`Container resize failed for session ${session.sessionId}: ${error.message}`);
      });
  }
}

export function handleMessage(session: ClientSession, message: Buffer): void {
    // Update last activity time
    session.lastActivityTime = Date.now();

    // Special handling for control commands like resize
    try {
        // First attempt to parse as JSON for control messages (resize)
        try {
            // Only try to parse larger messages (control messages are usually JSON)
            // Skip this for single characters & control keys
            if (message.length > 3) {
                const msgStr = message.toString('utf8');
                // Use a more specific type than 'any'
                let parsed: {
                    type?: string;
                    data?: unknown;
                    cols?: unknown;
                    rows?: unknown;
                    [key: string]: unknown;
                } | null = null;
                try {
                    parsed = JSON.parse(msgStr);
                } catch (_error) {
                    void _error; // Not JSON, continue with raw input handling
                }

                // Process JSON control messages (resize etc.)
                if (parsed && typeof parsed === 'object' && parsed !== null) {
                    if ('type' in parsed && parsed.type === 'resize') {
                        // Handle resize message in two possible formats
                        if ('data' in parsed && parsed.data && typeof parsed.data === 'object') {
                            // Format 1: { type: 'resize', data: { cols, rows } }
                            const resizeData = parsed.data as { cols?: unknown, rows?: unknown };
                            if (typeof resizeData.cols === 'number' && typeof resizeData.rows === 'number') {
                                handleExecResize(session, { cols: resizeData.cols, rows: resizeData.rows });
                                return;
                            }
                        } else if ('cols' in parsed && 'rows' in parsed) {
                            // Format 2: { type: 'resize', cols, rows }
                            const parsedObj = parsed as { cols?: unknown, rows?: unknown };
                            if (typeof parsedObj.cols === 'number' && typeof parsedObj.rows === 'number') {
                                handleExecResize(session, { cols: parsedObj.cols, rows: parsedObj.rows });
                                return;
                            }
                        }
                    } else if ('type' in parsed && parsed.type === 'data' && 'data' in parsed && // Data messages should be written directly to container
                        session.stdinStream && !session.stdinStream.destroyed) {
                            session.stdinStream.write(parsed.data as string | Buffer);
                            return;
                        }
                }
            }
        } catch (_error) {
            void _error; // Not JSON, continue with raw input handling
        }

        // Direct pass-through for raw input (both regular characters and control keys)
        if (session.stdinStream && !session.stdinStream.destroyed) {
            // Debug: log the very first keystroke we receive after an attach to
            // confirm that STDIN is reaching the server side. We store a flag
            // on the session so we only log once per attachment.
            if (!session._debugLoggedFirstKey) {
              const preview = message.subarray(0, 20).toString('utf8');
              log(`First client input after attach for session ${session.sessionId}: ${JSON.stringify(preview)}`);
              session._debugLoggedFirstKey = true;
            }

            session.stdinStream.write(message);
        } else {
            // Only log if stream is not available (avoiding noise for normal keypresses)
            logError(`Cannot write input: container stream unavailable for session ${session.sessionId}`);
        }
    } catch (error) {
        logError(`Error processing input for session ${session.sessionId}: ${error instanceof Error ? error.message : String(error)}`);
        // Last resort fallback
        if (session.stdinStream && !session.stdinStream.destroyed) {
            try {
                // Attempt raw write as fallback
                session.stdinStream.write(message);
            } catch (error) {
                logError(`Failed to write input as fallback: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
} 