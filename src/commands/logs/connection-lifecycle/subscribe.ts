import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'
import { formatJson, isJsonData } from '../../../utils/json-formatter.js'

export default class LogsConnectionLifecycleSubscribe extends AblyBaseCommand {
  static override description = 'Stream logs from [meta]connection.lifecycle meta channel'

  static override examples = [
    '$ ably logs connection-lifecycle subscribe',
    '$ ably logs connection-lifecycle subscribe --rewind 10',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    rewind: Flags.integer({
      description: 'Number of messages to rewind when subscribing',
      default: 0,
    }),
    json: Flags.boolean({
      description: 'Output results as JSON',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LogsConnectionLifecycleSubscribe)

    let client: Ably.Realtime | null = null;

    try {
      // Create the Ably client
      client = await this.createAblyClient(flags)
      if (!client) return

      const channelName = '[meta]connection.lifecycle'
      const channelOptions: Ably.ChannelOptions = {}
      
      // Configure rewind if specified
      if (flags.rewind > 0) {
        channelOptions.params = {
          ...channelOptions.params,
          rewind: flags.rewind.toString(),
        }
      }

      const channel = client.channels.get(channelName, channelOptions)

      this.log(`Subscribing to ${chalk.cyan(channelName)}...`)
      this.log('Press Ctrl+C to exit')
      this.log('')

      // Subscribe to the channel
      channel.subscribe((message) => {
        const timestamp = new Date(message.timestamp).toISOString()
        const event = message.name || 'unknown'
        
        if (flags.json) {
          // Output in JSON format
          this.log(JSON.stringify({
            timestamp,
            channel: channelName,
            event,
            data: message.data,
          }))
          return
        }

        // Color-code different event types
        let eventColor = chalk.blue
        
        // For connection lifecycle events
        if (event.includes('connection.opened') || event.includes('transport.opened')) {
          eventColor = chalk.green
        } else if (event.includes('connection.closed') || event.includes('transport.closed')) {
          eventColor = chalk.yellow
        } else if (event.includes('failed')) {
          eventColor = chalk.red
        } else if (event.includes('disconnected')) {
          eventColor = chalk.magenta
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
        if (client) {
          client.close()
        }
      }

      // Handle process termination
      process.on('SIGINT', () => {
        this.log('\nSubscription ended')
        cleanup()
        process.exit(0)
      })

      // Wait indefinitely
      await new Promise(() => {})
    } catch (error: unknown) {
      const err = error as Error
      this.error(err.message)
    } finally {
      if (client) {
        client.close()
      }
    }
  }
} 