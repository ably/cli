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
  hostConfig?: Record<string, unknown>;
  containerConfig?: Record<string, unknown>;
}

export interface DockerContainerInfo {
  Id: string;
  Name: string;
  State: string;
  Status: string;
  Image: string;
  Created: number;
  NetworkSettings: Record<string, unknown>;
  Mounts: Record<string, unknown>[];
  Config?: {
    Env?: string[];
    Labels?: Record<string, string>;
  };
}

export interface SessionConfig {
  image: string;
  workingDir?: string;
  environment?: Record<string, string>;
  volumes?: Record<string, string>;
  timeout?: number;
  user?: string;
  cleanup?: {
    autoCleanup: boolean;
    keepContainer: boolean;
    timeout: number;
  };
  security?: {
    readOnlyRootfs: boolean;
    capDrop: string[];
    capAdd: string[];
    securityOpt: string[];
    networkMode: string;
    noNewPrivileges: boolean;
    privileged: boolean;
  };
  resource?: {
    memory: string;
    cpus: string;
    pidsLimit: number;
  };
  hostConfig?: Record<string, unknown>;
  containerConfig?: Record<string, unknown>;
} 