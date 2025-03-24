import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ConnectionsTest extends AblyBaseCommand {
  static override description = 'Test connection to Ably'

  static override examples = [
    '$ ably connections test',
    '$ ably connections test --transport ws',
    '$ ably connections test --transport xhr',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    transport: Flags.string({
      description: 'Transport protocol to use (ws for WebSockets, xhr for HTTP)',
      options: ['ws', 'xhr', 'all'],
      default: 'all',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ConnectionsTest)

    try {
      // Get client options
      const options: Ably.ClientOptions = this.getClientOptions(flags)
      
      // Test results
      let wsSuccess = false
      let xhrSuccess = false
      let wsError: Error | null = null
      let xhrError: Error | null = null

      // WebSocket connection test if specified
      if (flags.transport === 'all' || flags.transport === 'ws') {
        this.log('Testing WebSocket connection to Ably...')
        
        try {
          const wsOptions: Ably.ClientOptions = {
            ...options,
            transportParams: {
              preferWebSockets: true,
              disallowXHR: true
            }
          }
          const wsClient = new Ably.Realtime(wsOptions)
          
          await new Promise<void>((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
              reject(new Error('Connection timeout after 10 seconds'))
            }, 10000)
            
            wsClient.connection.once('connected', () => {
              clearTimeout(connectionTimeout)
              wsSuccess = true
              this.log(`${chalk.green('✓')} WebSocket connection successful`)
              this.log(`  Connection ID: ${chalk.cyan(wsClient.connection.id || 'unknown')}`)
              wsClient.close()
              resolve()
            })
            
            wsClient.connection.once('failed', (stateChange) => {
              clearTimeout(connectionTimeout)
              wsError = stateChange.reason || new Error('Connection failed')
              this.log(`${chalk.red('✗')} WebSocket connection failed: ${wsError.message}`)
              wsClient.close()
              resolve()
            })
          })
        } catch (error) {
          wsError = error as Error
          this.log(`${chalk.red('✗')} WebSocket connection failed: ${wsError.message}`)
        }
      }

      // XHR connection test if specified
      if (flags.transport === 'all' || flags.transport === 'xhr') {
        this.log('Testing HTTP connection to Ably...')
        
        try {
          const xhrOptions: Ably.ClientOptions = {
            ...options,
            transportParams: {
              disallowWebSockets: true
            }
          }
          const xhrClient = new Ably.Realtime(xhrOptions)
          
          await new Promise<void>((resolve, reject) => {
            const connectionTimeout = setTimeout(() => {
              reject(new Error('Connection timeout after 10 seconds'))
            }, 10000)
            
            xhrClient.connection.once('connected', () => {
              clearTimeout(connectionTimeout)
              xhrSuccess = true
              this.log(`${chalk.green('✓')} HTTP connection successful`)
              this.log(`  Connection ID: ${chalk.cyan(xhrClient.connection.id || 'unknown')}`)
              xhrClient.close()
              resolve()
            })
            
            xhrClient.connection.once('failed', (stateChange) => {
              clearTimeout(connectionTimeout)
              xhrError = stateChange.reason || new Error('Connection failed')
              this.log(`${chalk.red('✗')} HTTP connection failed: ${xhrError.message}`)
              xhrClient.close()
              resolve()
            })
          })
        } catch (error) {
          xhrError = error as Error
          this.log(`${chalk.red('✗')} HTTP connection failed: ${xhrError.message}`)
        }
      }

      // Output summary
      this.log('')
      this.log('Connection Test Summary:')
      
      if (flags.transport === 'all') {
        // If both were tested
        const allSuccess = wsSuccess && xhrSuccess
        const partialSuccess = wsSuccess || xhrSuccess

        if (allSuccess) {
          this.log(`${chalk.green('✓')} All connection tests passed successfully`)
        } else if (partialSuccess) {
          this.log(`${chalk.yellow('!')} Some connection tests succeeded, but others failed`)
        } else {
          this.log(`${chalk.red('✗')} All connection tests failed`)
        }
      } else if (flags.transport === 'ws') {
        if (wsSuccess) {
          this.log(`${chalk.green('✓')} WebSocket connection test passed successfully`)
        } else {
          this.log(`${chalk.red('✗')} WebSocket connection test failed`)
        }
      } else if (flags.transport === 'xhr') {
        if (xhrSuccess) {
          this.log(`${chalk.green('✓')} HTTP connection test passed successfully`)
        } else {
          this.log(`${chalk.red('✗')} HTTP connection test failed`)
        }
      }

    } catch (error: unknown) {
      const err = error as Error
      this.error(err.message)
    }
  }
} 