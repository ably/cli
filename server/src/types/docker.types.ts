import type * as DockerodeTypes from "dockerode";

// Type definitions for Docker objects
export type DockerContainer = DockerodeTypes.Container;
export type DockerExec = DockerodeTypes.Exec;
export type Container = DockerodeTypes.Container;

// Type for Docker event
export interface DockerEvent {
  stream?: string;
  errorDetail?: { message: string };
  [key: string]: unknown;
}

// Enhanced container creation options
export interface ContainerCreateOptions {
  name?: string;
  labels?: Record<string, string>;
  networkMode?: string;
  memory?: number;
  nanoCpus?: number;
  readonlyRootfs?: boolean;
  securityOpt?: string[];
  capDrop?: string[];
  capAdd?: string[];
  hostConfig?: Record<string, any>;
  containerConfig?: Record<string, any>;
} 