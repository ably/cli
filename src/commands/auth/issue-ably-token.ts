import { Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../base-command.js'
import * as Ably from 'ably'
import { randomUUID } from 'crypto'

export default class IssueAblyTokenCommand extends AblyBaseCommand {
  static description = 'Creates an Ably Token with capabilities'

  static examples = [
    '$ ably auth issue-ably-token',
    '$ ably auth issue-ably-token --capability \'{"*":["*"]}\'',
    '$ ably auth issue-ably-token --client-id "client123" --ttl 3600',
    '$ ably auth issue-ably-token --client-id "none" --ttl 3600',
    '$ ably auth issue-ably-token --format json',
    '$ ably auth issue-ably-token --token-only',
    '$ ably channels publish --token "$(ably auth issue-ably-token --token-only)" my-channel "Hello"',
  ]

  static flags = {
    ...AblyBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID to use (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
    capability: Flags.string({
      description: 'Capabilities JSON string (e.g. {"channel":["publish","subscribe"]})',
      default: '{"*":["*"]}',
    }),
    'client-id': Flags.string({
      description: 'Client ID to associate with the token. Use "none" to explicitly issue a token with no client ID, otherwise a default will be generated.',
    }),
    ttl: Flags.integer({
      description: 'Time to live in seconds',
      default: 3600, // 1 hour
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
    'token-only': Flags.boolean({
      description: 'Output only the token string without any formatting or additional information',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(IssueAblyTokenCommand)
    
    // Get app and key
    const appAndKey = await this.ensureAppAndKey(flags)
    if (!appAndKey) {
      return
    }
    
    const { appId, apiKey } = appAndKey
    
    try {
      // Display auth info if not token-only output
      if (!flags['token-only']) {
        this.showAuthInfoIfNeeded(flags)
      }
      
      // Parse capabilities
      let capabilities
      try {
        capabilities = JSON.parse(flags.capability)
      } catch (error) {
        this.error(`Invalid capability JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Create token params
      const tokenParams: Ably.TokenParams = {
        capability: capabilities,
        ttl: flags.ttl * 1000, // Convert to milliseconds for Ably SDK
      }
      
      // Handle client ID - use special "none" value to explicitly indicate no clientId
      if (flags['client-id']) {
        if (flags['client-id'].toLowerCase() === 'none') {
          // No client ID - leave clientId undefined in the token params
        } else {
          // Use the provided client ID
          tokenParams.clientId = flags['client-id']
        }
      } else {
        // Generate a default client ID
        tokenParams.clientId = `ably-cli-${randomUUID().substring(0, 8)}`
      }
      
      // Create Ably REST client and request token
      const rest = new Ably.Rest({ key: apiKey })
      const tokenRequest = await rest.auth.createTokenRequest(tokenParams)
      
      // Use the token request to get an actual token
      const tokenDetails = await rest.auth.requestToken(tokenRequest)
      
      // If token-only flag is set, output just the token string
      if (flags['token-only']) {
        this.log(tokenDetails.token)
        return
      }
      
      if (flags.format === 'json') {
        this.log(JSON.stringify({
          token: tokenDetails.token,
          type: 'ably',
          issued: new Date(tokenDetails.issued).toISOString(),
          expires: new Date(tokenDetails.expires).toISOString(),
          ttl: flags.ttl,
          clientId: tokenDetails.clientId || null,
          capability: tokenDetails.capability,
        }))
      } else {
        this.log('Generated Ably Token:')
        this.log(`Token: ${tokenDetails.token}`)
        this.log(`Type: Ably`)
        this.log(`Issued: ${new Date(tokenDetails.issued).toISOString()}`)
        this.log(`Expires: ${new Date(tokenDetails.expires).toISOString()}`)
        this.log(`TTL: ${flags.ttl} seconds`)
        this.log(`Client ID: ${tokenDetails.clientId || 'None'}`)
        this.log(`Capability: ${JSON.stringify(tokenDetails.capability, null, 2)}`)
      }
    } catch (error) {
      this.error(`Error issuing Ably token: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 