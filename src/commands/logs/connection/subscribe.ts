import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'
import { formatJson, isJsonData } from '../../../utils/json-formatter.js'

export default class LogsConnectionSubscribe extends AblyBaseCommand {
  static override description = 'Stream logs from [meta]connection meta channel'

  static override examples = [
    '$ ably logs connection subscribe',
    '$ ably logs connection subscribe --rewind 10',
    '$ ably logs connection subscribe --json',
    '$ ably logs connection subscribe --pretty-json'
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    rewind: Flags.integer({
      description: 'Number of messages to rewind when subscribing',
      default: 0,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LogsConnectionSubscribe)

    let client: Ably.Realtime | null = null;
    const channelName = '[meta]connection'

    try {
      // Create the Ably client
      client = await this.createAblyClient(flags)
      if (!client) return

      const channelOptions: Ably.ChannelOptions = {}
      
      // Configure rewind if specified
      if (flags.rewind > 0) {
        channelOptions.params = {
          ...channelOptions.params,
          rewind: flags.rewind.toString(),
        }
      }

      const channel = client.channels.get(channelName, channelOptions)

      // Setup connection state change handler
      client.connection.on('connected', () => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            status: 'connected',
            channel: channelName
          }, flags))
        } else {
          this.log(`Subscribing to ${chalk.cyan(channelName)}...`)
          this.log('Press Ctrl+C to exit')
          this.log('')
        }
      })

      client.connection.on('disconnected', () => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            status: 'disconnected',
            channel: channelName
          }, flags))
        } else {
          this.log('Disconnected from Ably')
        }
      })

      client.connection.on('failed', (err: Ably.ConnectionStateChange) => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            status: 'failed',
            error: err.reason?.message || 'Unknown error',
            channel: channelName
          }, flags))
        } else {
          this.error(`Connection failed: ${err.reason?.message || 'Unknown error'}`)
        }
      })

      // Subscribe to the channel
      channel.subscribe((message) => {
        const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString()
        const event = message.name || 'unknown'
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            channel: channelName,
            event,
            data: message.data,
            encoding: message.encoding,
            clientId: message.clientId,
            connectionId: message.connectionId,
            id: message.id
          }, flags))
          return
        }

        // Color-code different event types
        let eventColor = chalk.blue
        
        // For connection events
        if (event.includes('connected') || event.includes('online')) {
          eventColor = chalk.green
        } else if (event.includes('disconnected') || event.includes('offline')) {
          eventColor = chalk.yellow
        } else if (event.includes('failed')) {
          eventColor = chalk.red
        } else if (event.includes('suspended')) {
          eventColor = chalk.gray
        }

        // Format the log output
        this.log(`${chalk.dim(`[${timestamp}]`)} Channel: ${chalk.cyan(channelName)} | Event: ${eventColor(event)}`)
        if (message.data) {
          if (isJsonData(message.data)) {
            this.log('Data:')
            this.log(formatJson(message.data))
          } else {
            this.log(`Data: ${message.data}`)
          }
        }
        this.log('')
      })

      // Set up cleanup for when the process is terminated
      const cleanup = () => {
        if (!this.shouldOutputJson(flags)) {
          this.log('\nUnsubscribing and closing connection...')
        }

        if (client) {
          client.connection.once('closed', () => {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: true,
                status: 'closed',
                channel: channelName
              }, flags))
            } else {
              this.log('Connection closed')
            }
          })
          client.close()
        }
      }

      // Handle process termination
      process.on('SIGINT', () => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            status: 'unsubscribed',
            channel: channelName
          }, flags))
        } else {
          this.log('\nSubscription ended')
        }
        cleanup()
        process.exit(0)
      })

      // Wait indefinitely
      await new Promise(() => {})
    } catch (error: unknown) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          channel: channelName
        }, flags))
      } else {
        const err = error as Error
        this.error(err.message)
      }
    } finally {
      if (client) {
        client.close()
      }
    }
  }
} 