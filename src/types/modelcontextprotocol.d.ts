declare module '@modelcontextprotocol/sdk' {
  export interface ServerOptions {
    capabilities?: {
      markdown?: boolean;
      schemas?: boolean;
    };
    resources?: Resource[];
    tools?: Tool[];
  }

  export interface Resource {
    description: string;
    fetch: (params?: any) => Promise<any>;
    name: string;
    parameters?: any[];
    title: string;
  }

  export interface Tool {
    description: string;
    execute: (params: any) => Promise<any>;
    name: string;
    parameters: any;
  }

  export interface Server {
    start(): Promise<void>;
  }

  export function createServer(options: ServerOptions): Server;
  export function createResource(resource: { parameters?: any[] } & Omit<Resource, 'parameters'>): Resource;
  export function createStringParam(name: string, description: string, options?: { required: boolean }): any;
} 