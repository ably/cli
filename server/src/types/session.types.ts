import { WebSocket } from "ws";
import * as stream from "node:stream";
import type { DockerContainer, DockerExec } from "./docker.types.js";

export type ClientSession = {
  ws: WebSocket;
  authenticated: boolean;
  timeoutId: NodeJS.Timeout;
  container?: DockerContainer;
  execInstance?: DockerExec;
  stdinStream?: stream.Duplex;
  stdoutStream?: stream.Duplex;
  sessionId: string;
  // Add activity tracking fields
  lastActivityTime: number;
  creationTime: number;
  // Add flag to track if attachment is in progress
  isAttaching: boolean;
  // SHA-256 hash of apiKey|accessToken captured at first auth, used to validate resume attempts
  credentialHash?: string;
  // Ring buffer of recent stdout/stderr lines for resume support
  outputBuffer?: string[];
  // timer started when ws disconnects; if it fires the session is cleaned
  orphanTimer?: NodeJS.Timeout;
  // Debugging flag for incoming client keystrokes
  _debugLoggedFirstKey?: boolean;
}; 