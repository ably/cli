import { Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../base-command.js'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'

interface JwtPayload {
  'x-ably-capability': any
  'x-ably-clientId'?: string
  'x-ably-appId': string
  iat: number
  exp: number
  jti: string
}

export default class IssueJwtTokenCommand extends AblyBaseCommand {
  static description = 'Creates an Ably JWT token with capabilities'

  static examples = [
    '$ ably auth issue-jwt-token',
    '$ ably auth issue-jwt-token --capability \'{"*":["*"]}\'',
    '$ ably auth issue-jwt-token --client-id "client123" --ttl 3600',
    '$ ably auth issue-jwt-token --client-id "none" --ttl 3600',
    '$ ably auth issue-jwt-token --format json',
    '$ ably auth issue-jwt-token --token-only',
    '$ ably channels publish --token "$(ably auth issue-jwt-token --token-only)" my-channel "Hello"',
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
    const { flags } = await this.parse(IssueJwtTokenCommand)
    
    // Get app and key
    const appAndKey = await this.ensureAppAndKey(flags)
    if (!appAndKey) {
      return
    }
    
    const { appId, apiKey } = appAndKey
    
    try {
      // Parse the API key to get keyId and keySecret
      const [keyId, keySecret] = apiKey.split(':')
      
      if (!keyId || !keySecret) {
        this.error('Invalid API key format. Expected format: keyId:keySecret')
      }
      
      // Parse capabilities
      let capabilities
      try {
        capabilities = JSON.parse(flags.capability)
      } catch (error) {
        this.error(`Invalid capability JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Create JWT payload
      const jwtPayload: JwtPayload = {
        'x-ably-capability': capabilities,
        'x-ably-appId': appId,
        'iat': Math.floor(Date.now() / 1000), // issued at
        'exp': Math.floor(Date.now() / 1000) + flags.ttl, // expiration
        'jti': randomUUID(), // unique token ID
      }
      
      // Handle client ID - use special "none" value to explicitly indicate no clientId
      let clientId: string | null = null;
      if (flags['client-id']) {
        if (flags['client-id'].toLowerCase() === 'none') {
          // No client ID - don't add it to the token
          clientId = null;
        } else {
          // Use the provided client ID
          jwtPayload['x-ably-clientId'] = flags['client-id'];
          clientId = flags['client-id'];
        }
      } else {
        // Generate a default client ID
        const defaultClientId = `ably-cli-${randomUUID().substring(0, 8)}`;
        jwtPayload['x-ably-clientId'] = defaultClientId;
        clientId = defaultClientId;
      }
      
      // Sign the JWT
      const token = jwt.sign(jwtPayload, keySecret, {
        algorithm: 'HS256',
        keyid: keyId,
      })
      
      // If token-only flag is set, output just the token string
      if (flags['token-only']) {
        this.log(token)
        return
      }
      
      if (flags.format === 'json') {
        this.log(JSON.stringify({
          token,
          type: 'jwt',
          issued: new Date(jwtPayload.iat * 1000).toISOString(),
          expires: new Date(jwtPayload.exp * 1000).toISOString(),
          ttl: flags.ttl,
          appId: appId,
          keyId: keyId,
          clientId: clientId,
          capability: capabilities,
        }))
      } else {
        this.log('Generated Ably JWT Token:')
        this.log(`Token: ${token}`)
        this.log(`Type: JWT`)
        this.log(`Issued: ${new Date(jwtPayload.iat * 1000).toISOString()}`)
        this.log(`Expires: ${new Date(jwtPayload.exp * 1000).toISOString()}`)
        this.log(`TTL: ${flags.ttl} seconds`)
        this.log(`App ID: ${appId}`)
        this.log(`Key ID: ${keyId}`)
        this.log(`Client ID: ${clientId || 'None'}`)
        this.log(`Capability: ${JSON.stringify(capabilities, null, 2)}`)
      }
    } catch (error) {
      this.error(`Error issuing JWT token: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 