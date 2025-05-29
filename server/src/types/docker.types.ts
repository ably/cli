import type * as DockerodeTypes from "dockerode";

// Type definitions for Docker objects
export type DockerContainer = DockerodeTypes.Container;
export type DockerExec = DockerodeTypes.Exec;

// Type for Docker event
export interface DockerEvent {
  stream?: string;
  errorDetail?: { message: string };
  [key: string]: unknown;
} 