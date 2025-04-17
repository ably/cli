import fetch from 'node-fetch'

export interface ControlApiOptions {
  accessToken: string
  controlHost?: string
}

export interface App {
  accountId: string
  apnsUsesSandboxCert?: boolean
  created: number
  id: string
  modified: number
  name: string
  status: string
  tlsOnly: boolean
  [key: string]: unknown;
}

export interface AppStats {
  appId?: string
  entries: {
    [key: string]: number
  }
  intervalId: string
  schema?: string
  unit: string
}

// Since account stats have the same structure as app stats
export type AccountStats = AppStats;

export interface Key {
  appId: string
  capability: unknown;
  created: number;
  id: string
  key: string
  modified: number;
  name: string
  revocable: boolean;
  status: string;
}

export interface Namespace {
  appId: string;
  authenticated?: boolean;
  batchingEnabled?: boolean;
  batchingInterval?: number;
  conflationEnabled?: boolean;
  conflationInterval?: number;
  conflationKey?: string;
  created: number;
  exposeTimeSerial?: boolean;
  id: string;
  modified: number;
  persistLast?: boolean;
  persisted: boolean;
  populateChannelRegistry?: boolean;
  pushEnabled: boolean;
  tlsOnly?: boolean;
}

export interface Rule {
  _links?: {
    self: string;
  };
  appId: string;
  created: number;
  id: string;
  modified: number;
  requestMode: string;
  ruleType: string;
  source: {
    channelFilter: string;
    type: string;
  };
  target: unknown;
  version: string;
}

export interface Queue {
  amqp: {
    queueName: string;
    uri: string;
  };
  appId: string;
  deadletter: boolean;
  deadletterId: string;
  id: string;
  maxLength: number;
  messages: {
    ready: number;
    total: number;
    unacknowledged: number;
  };
  name: string;
  region: string;
  state: string;
  stats: {
    acknowledgementRate: null | number;
    deliveryRate: null | number;
    publishRate: null | number;
  };
  stomp: {
    destination: string;
    host: string;
    uri: string;
  };
  ttl: number;
}

export interface HelpResponse {
  answer: string;
  links: {
    breadcrumbs: string[];
    description: null | string;
    label: string;
    title: string;
    type: string;
    url: string;
  }[];
}

export interface Conversation {
  messages: {
    content: string;
    role: 'assistant' | 'user';
  }[];
}

// Response type for Control API /me endpoint
export interface MeResponse {
  account: { id: string; name: string };
  user: { email: string };
}

export class ControlApi {
  private accessToken: string
  private controlHost: string

  constructor(options: ControlApiOptions) {
    this.accessToken = options.accessToken
    this.controlHost = options.controlHost || 'control.ably.net'
  }

  // Ask a question to the Ably AI agent
  async askHelp(question: string, conversation?: Conversation): Promise<HelpResponse> {
    const payload = { 
      question,
      ...(conversation && { context: conversation.messages })
    };
    
    return this.request<HelpResponse>('/help', 'POST', payload);
  }

  // Create a new app
  async createApp(appData: { name: string, tlsOnly?: boolean }): Promise<App> {
    // First get the account ID from /me endpoint
    const meResponse = await this.getMe()
    const accountId = meResponse.account.id
    
    // Use correct path with account ID prefix
    return this.request<App>(`/accounts/${accountId}/apps`, 'POST', appData)
  }

  // Create a new key for an app
  async createKey(appId: string, keyData: {
    capability?: Record<string, string[]>
    name: string,
  }): Promise<Key> {
    return this.request<Key>(`/apps/${appId}/keys`, 'POST', keyData)
  }

  async createNamespace(appId: string, namespaceData: {
    authenticated?: boolean;
    batchingEnabled?: boolean;
    batchingInterval?: number;
    channelNamespace: string;
    conflationEnabled?: boolean;
    conflationInterval?: number;
    conflationKey?: string;
    exposeTimeSerial?: boolean;
    persistLast?: boolean;
    persisted?: boolean;
    populateChannelRegistry?: boolean;
    pushEnabled?: boolean;
    tlsOnly?: boolean;
  }): Promise<Namespace> {
    return this.request<Namespace>(`/apps/${appId}/namespaces`, 'POST', namespaceData)
  }

  async createQueue(appId: string, queueData: {
    maxLength?: number;
    name: string;
    region?: string;
    ttl?: number;
  }): Promise<Queue> {
    return this.request<Queue>(`/apps/${appId}/queues`, 'POST', queueData)
  }

  // ruleData can vary significantly based on ruleType (source, target)
  async createRule(appId: string, ruleData: any): Promise<Rule> {
    return this.request<Rule>(`/apps/${appId}/rules`, 'POST', ruleData)
  }

  // Delete an app
  async deleteApp(appId: string): Promise<void> {
    // Delete app uses /apps/{appId} path
    return this.request<void>(`/apps/${appId}`, 'DELETE')
  }

  async deleteNamespace(appId: string, namespaceId: string): Promise<void> {
    return this.request<void>(`/apps/${appId}/namespaces/${namespaceId}`, 'DELETE')
  }

  async deleteQueue(appId: string, queueName: string): Promise<void> {
    return this.request<void>(`/apps/${appId}/queues/${queueName}`, 'DELETE')
  }

  async deleteRule(appId: string, ruleId: string): Promise<void> {
    return this.request<void>(`/apps/${appId}/rules/${ruleId}`, 'DELETE')
  }

  // Get account stats
  async getAccountStats(
    options: { 
      by?: string, 
      end?: number, 
      limit?: number, 
      start?: number, 
      unit?: string 
    } = {}
  ): Promise<AccountStats[]> {
    const queryParams = new URLSearchParams()
    if (options.start) queryParams.append('start', options.start.toString())
    if (options.end) queryParams.append('end', options.end.toString())
    if (options.by) queryParams.append('by', options.by)
    if (options.limit) queryParams.append('limit', options.limit.toString())
    if (options.unit) queryParams.append('unit', options.unit)

    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''
    
    // First get the account ID from /me endpoint
    const meResponse = await this.getMe()
    const accountId = meResponse.account.id
    
    // Account stats require the account ID in the path
    return this.request<AccountStats[]>(`/accounts/${accountId}/stats${queryString}`)
  }

  // Get an app by ID
  async getApp(appId: string): Promise<App> {
    // There's no single app GET endpoint, need to get all apps and filter
    const apps = await this.listApps()
    const app = apps.find(a => a.id === appId)
    
    if (!app) {
      throw new Error(`App with ID "${appId}" not found`)
    }
    
    return app
  }

  // Get app stats
  async getAppStats(
    appId: string, 
    options: { 
      by?: string, 
      end?: number, 
      limit?: number, 
      start?: number, 
      unit?: string 
    } = {}
  ): Promise<AppStats[]> {
    const queryParams = new URLSearchParams()
    if (options.start) queryParams.append('start', options.start.toString())
    if (options.end) queryParams.append('end', options.end.toString())
    if (options.by) queryParams.append('by', options.by)
    if (options.limit) queryParams.append('limit', options.limit.toString())
    if (options.unit) queryParams.append('unit', options.unit)

    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : ''
    
    // App ID-specific operations don't need account ID in the path
    return this.request<AppStats[]>(`/apps/${appId}/stats${queryString}`)
  }

  // Get a specific key by ID or key value
  async getKey(appId: string, keyIdOrValue: string): Promise<Key> {
    // Check if it's a full key (containing colon) or just an ID
    const isFullKey = keyIdOrValue.includes(':')
    
    if (isFullKey) {
      // If it's a full key, we need to list all keys and find the matching one
      const keys = await this.listKeys(appId)
      const matchingKey = keys.find(k => k.key === keyIdOrValue)
      
      if (!matchingKey) {
        throw new Error(`Key "${keyIdOrValue}" not found`)
      }
      
      return matchingKey
    }
 
      // If it's just an ID, we can fetch it directly
      return this.request<Key>(`/apps/${appId}/keys/${keyIdOrValue}`)
    
  }

  // Get user and account info
  async getMe(): Promise<MeResponse> {
    return this.request<MeResponse>('/me')
  }

  async getNamespace(appId: string, namespaceId: string): Promise<Namespace> {
    return this.request<Namespace>(`/apps/${appId}/namespaces/${namespaceId}`)
  }

  async getRule(appId: string, ruleId: string): Promise<Rule> {
    return this.request<Rule>(`/apps/${appId}/rules/${ruleId}`)
  }

  // Get all apps
  async listApps(): Promise<App[]> {
    // First get the account ID from /me endpoint
    const meResponse = await this.getMe()
    const accountId = meResponse.account.id
    
    // Use correct path with account ID prefix
    return this.request<App[]>(`/accounts/${accountId}/apps`)
  }

  // List all keys for an app
  async listKeys(appId: string): Promise<Key[]> {
    return this.request<Key[]>(`/apps/${appId}/keys`)
  }

  // Namespace (Channel Rules) methods
  async listNamespaces(appId: string): Promise<Namespace[]> {
    return this.request<Namespace[]>(`/apps/${appId}/namespaces`)
  }

  // Queues methods
  async listQueues(appId: string): Promise<Queue[]> {
    return this.request<Queue[]>(`/apps/${appId}/queues`)
  }

  // Rules (Integrations) methods
  async listRules(appId: string): Promise<Rule[]> {
    return this.request<Rule[]>(`/apps/${appId}/rules`)
  }

  // Revoke a key
  async revokeKey(appId: string, keyId: string): Promise<void> {
    return this.request<void>(`/apps/${appId}/keys/${keyId}`, 'DELETE')
  }

  // Update an app
  async updateApp(appId: string, appData: { name?: string, tlsOnly?: boolean }): Promise<App> {
    // Update app uses /apps/{appId} path
    return this.request<App>(`/apps/${appId}`, 'PATCH', appData)
  }

  // Update an existing key
  async updateKey(appId: string, keyId: string, keyData: { 
    capability?: Record<string, string[]>
    name?: string, 
  }): Promise<Key> {
    return this.request<Key>(`/apps/${appId}/keys/${keyId}`, 'PATCH', keyData)
  }

  async updateNamespace(appId: string, namespaceId: string, namespaceData: {
    authenticated?: boolean;
    batchingEnabled?: boolean;
    batchingInterval?: number;
    conflationEnabled?: boolean;
    conflationInterval?: number;
    conflationKey?: string;
    exposeTimeSerial?: boolean;
    persistLast?: boolean;
    persisted?: boolean;
    populateChannelRegistry?: boolean;
    pushEnabled?: boolean;
    tlsOnly?: boolean;
  }): Promise<Namespace> {
    return this.request<Namespace>(`/apps/${appId}/namespaces/${namespaceId}`, 'PATCH', namespaceData)
  }

  // ruleData can vary significantly based on ruleType (source, target)
  async updateRule(appId: string, ruleId: string, ruleData: any): Promise<Rule> {
    return this.request<Rule>(`/apps/${appId}/rules/${ruleId}`, 'PATCH', ruleData)
  }

  // Upload Apple Push Notification Service P12 certificate for an app
  async uploadApnsP12(
    appId: string, 
    certificateData: string, 
    options: { 
      password?: string 
      useForSandbox?: boolean, 
    } = {}
  ): Promise<{ id: string }> {
    const data = {
      p12Certificate: certificateData,
      password: options.password,
      useForSandbox: options.useForSandbox
    }
    
    // App ID-specific operations don't need account ID in the path
    return this.request<{ id: string }>(`/apps/${appId}/push/certificate`, 'POST', data)
  }

  private async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const url = this.controlHost.includes('local') ? `http://${this.controlHost}/api/v1${path}` : `https://${this.controlHost}/v1${path}`
    
    const options: any = {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      method
    }

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)
    
    if (!response.ok) {
      const responseBody = await response.text()
      // Attempt to parse JSON, otherwise use raw text
      let responseData: unknown = responseBody;
      try {
        responseData = JSON.parse(responseBody);
      } catch { /* Ignore parsing errors, keep as string */ }
      
      const errorDetails = {
        message: `API request failed with status ${response.status}: ${response.statusText}`,
        response: responseData, // Assign unknown type
        statusCode: response.status,
      };

      // Log the detailed error
      console.error('Control API Request Error:', JSON.stringify(errorDetails, null, 2));

      // Throw a more user-friendly error, including the message from the response if available
      let errorMessage = `API request failed (${response.status} ${response.statusText})`;
      if (typeof responseData === 'object' && responseData !== null && 'message' in responseData && typeof responseData.message === 'string') {
          errorMessage += `: ${responseData.message}`;
      } else if (typeof responseData === 'string' && responseData.length < 100) {
          // Include short string responses directly
          errorMessage += `: ${responseData}`;
      }
      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return {} as T
    }

    return await response.json() as T
  }
} 