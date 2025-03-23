import fs from 'fs'
import path from 'path'
import os from 'os'
import toml from 'toml'

export interface AccountConfig {
  accessToken: string
  tokenId?: string
  userEmail?: string
  accountId?: string
  accountName?: string
  apps?: {
    [appId: string]: {
      apiKey?: string
    }
  }
}

export interface AblyConfig {
  current?: {
    account?: string
    app?: string
  }
  accounts: {
    [alias: string]: AccountConfig
  }
}

export class ConfigManager {
  private configDir: string
  private configPath: string
  private config: AblyConfig = {
    accounts: {}
  }

  constructor() {
    this.configDir = path.join(os.homedir(), '.ably')
    this.configPath = path.join(this.configDir, 'config')
    this.ensureConfigDirExists()
    this.loadConfig()
  }

  private ensureConfigDirExists(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { mode: 0o700 }) // Secure permissions
    }
  }

  private loadConfig(): void {
    if (fs.existsSync(this.configPath)) {
      try {
        const configContent = fs.readFileSync(this.configPath, 'utf-8')
        this.config = toml.parse(configContent) as AblyConfig
        
        // Ensure config has the expected structure
        if (!this.config.accounts) {
          this.config.accounts = {}
        }
      } catch (error) {
        throw new Error(`Failed to load Ably config: ${error}`)
      }
    }
  }

  public saveConfig(): void {
    try {
      // Format the config as TOML
      const tomlContent = this.formatToToml(this.config)
      
      // Write the config to disk
      fs.writeFileSync(this.configPath, tomlContent, { mode: 0o600 }) // Secure file permissions
    } catch (error) {
      throw new Error(`Failed to save Ably config: ${error}`)
    }
  }

  // Format to TOML manually since toml library doesn't support stringify
  private formatToToml(config: AblyConfig): string {
    let result = ''

    // Write current section
    if (config.current) {
      result += '[current]\n'
      if (config.current.account) {
        result += `account = "${config.current.account}"\n`
      }
      if (config.current.app) {
        result += `app = "${config.current.app}"\n`
      }
      result += '\n'
    }

    // Write accounts section
    for (const [alias, account] of Object.entries(config.accounts)) {
      result += `[accounts.${alias}]\n`
      result += `accessToken = "${account.accessToken}"\n`
      
      if (account.tokenId) {
        result += `tokenId = "${account.tokenId}"\n`
      }
      
      if (account.userEmail) {
        result += `userEmail = "${account.userEmail}"\n`
      }
      
      if (account.accountId) {
        result += `accountId = "${account.accountId}"\n`
      }
      
      if (account.accountName) {
        result += `accountName = "${account.accountName}"\n`
      }
      
      // Write apps section for this account
      if (account.apps && Object.keys(account.apps).length > 0) {
        for (const [appId, appConfig] of Object.entries(account.apps)) {
          result += `[accounts.${alias}.apps.${appId}]\n`
          
          if (appConfig.apiKey) {
            result += `apiKey = "${appConfig.apiKey}"\n`
          }
          
          result += '\n'
        }
      } else {
        result += '\n'
      }
    }

    return result
  }

  // Get the current account alias
  public getCurrentAccountAlias(): string | undefined {
    return this.config.current?.account
  }

  // Get the current account configuration
  public getCurrentAccount(): AccountConfig | undefined {
    const currentAlias = this.getCurrentAccountAlias()
    if (!currentAlias) return undefined
    
    return this.config.accounts[currentAlias]
  }

  // Get access token for the current account or specific alias
  public getAccessToken(alias?: string): string | undefined {
    if (alias) {
      return this.config.accounts[alias]?.accessToken
    }
    
    const currentAccount = this.getCurrentAccount()
    return currentAccount?.accessToken
  }

  // Store account information with an optional alias
  public storeAccount(accessToken: string, alias: string = 'default', accountInfo?: {
    tokenId?: string
    userEmail?: string
    accountId?: string
    accountName?: string
  }): void {
    // Create or update the account entry
    this.config.accounts[alias] = {
      accessToken,
      ...accountInfo,
      apps: this.config.accounts[alias]?.apps || {}
    }
    
    // Set as current account if it's the first one or no current account is set
    if (!this.config.current || !this.config.current.account) {
      this.config.current = { account: alias }
    }
    
    this.saveConfig()
  }

  // Switch to a different account
  public switchAccount(alias: string): boolean {
    if (!this.config.accounts[alias]) {
      return false
    }
    
    if (!this.config.current) {
      this.config.current = {}
    }
    
    this.config.current.account = alias
    this.saveConfig()
    return true
  }

  // Store API key for an app
  public storeAppKey(appId: string, apiKey: string, accountAlias?: string): void {
    const alias = accountAlias || this.getCurrentAccountAlias() || 'default'
    
    // Ensure the account and apps structure exists
    if (!this.config.accounts[alias]) {
      throw new Error(`Account "${alias}" not found`)
    }
    
    if (!this.config.accounts[alias].apps) {
      this.config.accounts[alias].apps = {}
    }
    
    // Store the API key
    this.config.accounts[alias].apps[appId] = {
      apiKey
    }
    
    this.saveConfig()
  }

  // Set current app
  public setCurrentApp(appId: string): void {
    if (!this.config.current) {
      this.config.current = {}
    }
    
    this.config.current.app = appId
    this.saveConfig()
  }

  // Get current app ID
  public getCurrentAppId(): string | undefined {
    return this.config.current?.app
  }

  // Get API key for current app or specific app ID
  public getApiKey(appId?: string): string | undefined {
    const currentAccount = this.getCurrentAccount()
    if (!currentAccount || !currentAccount.apps) return undefined
    
    const targetAppId = appId || this.getCurrentAppId()
    if (!targetAppId) return undefined
    
    return currentAccount.apps[targetAppId]?.apiKey
  }

  // List all accounts
  public listAccounts(): { alias: string, account: AccountConfig }[] {
    return Object.entries(this.config.accounts).map(([alias, account]) => ({
      alias,
      account
    }))
  }

  // Remove an account
  public removeAccount(alias: string): boolean {
    if (!this.config.accounts[alias]) {
      return false
    }
    
    delete this.config.accounts[alias]
    
    // If the removed account was the current one, clear the current account selection
    if (this.config.current?.account === alias) {
      delete this.config.current.account
    }
    
    this.saveConfig()
    return true
  }

  // Get path to config file
  public getConfigPath(): string {
    return this.configPath
  }
} 