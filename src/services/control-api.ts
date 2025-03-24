import fetch from 'node-fetch'

export interface ControlApiOptions {
  accessToken: string
  controlHost?: string
}

export interface App {
  id: string
  name: string
  accountId: string
  status: string
  tlsOnly: boolean
  created: number
  modified: number
  apnsUsesSandboxCert?: boolean
}

export interface AppStats {
  intervalId: string
  unit: string
  appId?: string
  schema?: string
  entries: {
    [key: string]: number
  }
}

// Since account stats have the same structure as app stats
export type AccountStats = AppStats;

export interface Key {
  id: string
  appId: string
  name: string
  key: string
  capability: any;
  revocable: boolean;
  created: number;
  modified: number;
  status: string;
}

export class ControlApi {
  private accessToken: string
  private controlHost: string

  constructor(options: ControlApiOptions) {
    this.accessToken = options.accessToken
    this.controlHost = options.controlHost || 'control.ably.net'
  }

  private async request<T>(path: string, method = 'GET', body?: any): Promise<T> {
    const url = `https://${this.controlHost}/v1${path}`
    
    const options: any = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(url, options)
    
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Control API request failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    if (response.status === 204) {
      return {} as T
    }

    return await response.json() as T
  }

  // Get user and account info
  async getMe(): Promise<{ user: any, account: any }> {
    return this.request<{ user: any, account: any }>('/me')
  }

  // Get all apps
  async listApps(): Promise<App[]> {
    // First get the account ID from /me endpoint
    const meResponse = await this.getMe()
    const accountId = meResponse.account.id
    
    // Use correct path with account ID prefix
    return this.request<App[]>(`/accounts/${accountId}/apps`)
  }

  // Get an app by ID
  async getApp(appId: string): Promise<App> {
    // App ID-specific operations don't need account ID in the path
    return this.request<App>(`/apps/${appId}`)
  }

  // Create a new app
  async createApp(appData: { name: string, tlsOnly?: boolean }): Promise<App> {
    // First get the account ID from /me endpoint
    const meResponse = await this.getMe()
    const accountId = meResponse.account.id
    
    // Use correct path with account ID prefix
    return this.request<App>(`/accounts/${accountId}/apps`, 'POST', appData)
  }

  // Update an app
  async updateApp(appId: string, appData: { name?: string, tlsOnly?: boolean }): Promise<App> {
    // App ID-specific operations don't need account ID in the path
    return this.request<App>(`/apps/${appId}`, 'PATCH', appData)
  }

  // Delete an app
  async deleteApp(appId: string): Promise<void> {
    // App ID-specific operations don't need account ID in the path
    return this.request<void>(`/apps/${appId}`, 'DELETE')
  }

  // Get app stats
  async getAppStats(
    appId: string, 
    options: { 
      start?: number, 
      end?: number, 
      by?: string, 
      limit?: number, 
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

  // Get account stats
  async getAccountStats(
    options: { 
      start?: number, 
      end?: number, 
      by?: string, 
      limit?: number, 
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

  // Upload Apple Push Notification Service P12 certificate for an app
  async uploadApnsP12(
    appId: string, 
    certificateData: string, 
    options: { 
      useForSandbox?: boolean, 
      password?: string 
    } = {}
  ): Promise<{ id: string }> {
    const data = {
      p12Certificate: certificateData,
      useForSandbox: options.useForSandbox,
      password: options.password
    }
    
    // App ID-specific operations don't need account ID in the path
    return this.request<{ id: string }>(`/apps/${appId}/push/certificate`, 'POST', data)
  }

  // List all keys for an app
  async listKeys(appId: string): Promise<Key[]> {
    return this.request<Key[]>(`/apps/${appId}/keys`)
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
    } else {
      // If it's just an ID, we can fetch it directly
      return this.request<Key>(`/apps/${appId}/keys/${keyIdOrValue}`)
    }
  }

  // Update a key
  async updateKey(appId: string, keyId: string, keyData: { 
    name?: string,
    capability?: any 
  }): Promise<Key> {
    return this.request<Key>(`/apps/${appId}/keys/${keyId}`, 'PATCH', keyData)
  }

  // Revoke a key
  async revokeKey(appId: string, keyId: string): Promise<void> {
    return this.request<void>(`/apps/${appId}/keys/${keyId}`, 'DELETE')
  }
} 