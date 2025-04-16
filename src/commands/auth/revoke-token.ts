import { Args, Flags } from '@oclif/core'
import * as Ably from 'ably'
import * as https from 'node:https'

import { AblyBaseCommand } from '../../base-command.js'

export default class RevokeTokenCommand extends AblyBaseCommand {
  static args = {
    token: Args.string({
      description: 'Token to revoke',
      name: 'token',
      required: true,
    }),
  }

  static description = 'Revokes the token provided'

  static examples = [
    '$ ably auth revoke-token TOKEN',
    '$ ably auth revoke-token TOKEN --client-id clientid',
    '$ ably auth revoke-token TOKEN --json',
    '$ ably auth revoke-token TOKEN --pretty-json']

  static flags = {
    ...AblyBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID to use (uses current app if not specified)',
      env: 'ABLY_APP_ID',
    }),
    
    'client-id': Flags.string({
      char: 'c',
      description: 'Client ID to revoke tokens for',
    }),
    'debug': Flags.boolean({
      default: false,
      description: 'Show debug information',
    }),
  }

  // Property to store the Ably client
  private ablyClient?: Ably.Realtime

  async run(): Promise<void> {
    const { args, flags } = await this.parse(RevokeTokenCommand)
    
    // Get app and key
    const appAndKey = await this.ensureAppAndKey(flags)
    if (!appAndKey) {
      return
    }
    
    const { apiKey } = appAndKey
    const { token } = args
    
    try {
      if (flags.debug) {
        this.log(`Debug: Using API key: ${apiKey.replace(/:.+/, ':***')}`)
      }
      
      // Create Ably client the same way as in channels list command
      const client = await this.createAblyClient(flags)
      if (!client) return
      
      this.ablyClient = client
      
      // Create Ably REST client with client options
      const rest = new Ably.Rest(this.getClientOptions(flags))
      
      const clientId = flags['client-id'] || token
      
      if (!flags['client-id']) {
        // We need to warn the user that we're using the token as a client ID
        this.warn('Revoking a specific token is only possible if it has a client ID or revocation key')
        this.warn('For advanced token revocation options, see: https://ably.com/docs/auth/revocation')
        this.warn('Using the token argument as a client ID for this operation')
      }
      
      // Extract the keyName (appId.keyId) from the API key
      const keyParts = apiKey.split(':')
      if (keyParts.length !== 2) {
        this.error('Invalid API key format. Expected format: appId.keyId:secret')
        return
      }
      
      const keyName = keyParts[0] // This gets the appId.keyId portion
      const secret = keyParts[1]
      
      // Create the properly formatted body for token revocation
      const requestBody = {
        targets: [`clientId:${clientId}`]
      }
      
      if (flags.debug) {
        this.log(`Debug: Sending request to endpoint: /keys/${keyName}/revokeTokens`)
        this.log(`Debug: Request body: ${JSON.stringify(requestBody)}`)
      }

      try {
        // Make direct HTTPS request to Ably REST API
        const response = await this.makeHttpRequest(keyName, secret, requestBody, flags.debug)
        
        if (flags.debug) {
          this.log(`Debug: Response received:`)
          this.log(JSON.stringify(response, null, 2))
        }
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            message: 'Token revocation processed successfully',
            response,
            success: true,
          }, flags))
        } else {
          this.log('Token successfully revoked')
        }
      } catch (requestError: unknown) {
        // Handle specific API errors
        if (flags.debug) {
          this.log(`Debug: API Error:`)
          this.log(JSON.stringify(requestError, null, 2))
        }
        
        const error = requestError as Error
        if (error.message && error.message.includes('token_not_found')) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              error: 'Token not found or already revoked',
              success: false,
            }, flags))
          } else {
            this.log('Error: Token not found or already revoked')
          }
        } else {
          throw requestError
        }
      }
    } catch (error) {
      let errorMessage = 'Unknown error'
      
      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error && typeof error === 'object') {
        errorMessage = JSON.stringify(error)
      }
      
      this.error(`Error revoking token: ${errorMessage}`)
    } finally {
      // Close the client if it exists
      if (this.ablyClient) {
        this.ablyClient.close()
      }
    }
  }
  
  // Helper method to make a direct HTTP request to the Ably REST API
  private makeHttpRequest(keyName: string, secret: string, requestBody: any, debug: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      const encodedAuth = Buffer.from(`${keyName}:${secret}`).toString('base64')
      
      const options = {
        headers: {
          'Accept': 'application/json',
          'Authorization': `Basic ${encodedAuth}`,
          'Content-Type': 'application/json'
        },
        hostname: 'rest.ably.io',
        method: 'POST',
        path: `/keys/${keyName}/revokeTokens`,
        port: 443
      }
      
      if (debug) {
        this.log(`Debug: Making HTTPS request to: https://${options.hostname}${options.path}`)
      }
      
      const req = https.request(options, (res) => {
        let data = ''
        
        res.on('data', (chunk) => {
          data += chunk
        })
        
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const jsonResponse = data.length > 0 ? JSON.parse(data) : null
              resolve(jsonResponse)
            } catch {
              resolve(data)
            }
          } else {
            reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`))
          }
        })
      })
      
      req.on('error', (error) => {
        reject(error)
      })
      
      req.write(JSON.stringify(requestBody))
      req.end()
    })
  }
} 