declare module '@modelcontextprotocol/sdk' {
  export interface ServerOptions {
    resources?: Resource[];
    tools?: Tool[];
    capabilities?: {
      markdown?: boolean;
      schemas?: boolean;
    };
  }

  export interface Resource {
    name: string;
    title: string;
    description: string;
    fetch: (params?: any) => Promise<any>;
    parameters?: any[];
  }

  export interface Tool {
    name: string;
    description: string;
    parameters: any;
    execute: (params: any) => Promise<any>;
  }

  export interface Server {
    start(): Promise<void>;
  }

  export function createServer(options: ServerOptions): Server;
  export function createResource(resource: Omit<Resource, 'parameters'> & { parameters?: any[] }): Resource;
  export function createStringParam(name: string, description: string, options?: { required: boolean }): any;
} 