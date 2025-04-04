import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class LogsChannelLifecycle extends AblyBaseCommand {
  static override description = 'Stream logs from [meta]channel.lifecycle meta channel'

  static override examples = [
    '$ ably logs channel-lifecycle subscribe',
    '$ ably logs channel-lifecycle subscribe --rewind 10',
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
    const {flags} = await this.parse(LogsChannelLifecycle)

    let client: Ably.Realtime | null = null;

    try {
      // Create the Ably client
      client = await this.createAblyClient(flags)
      if (!client) return

      const channelName = '[meta]channel.lifecycle'
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
        
        // For channel lifecycle events
        if (event.includes('attached')) {
          eventColor = chalk.green
        } else if (event.includes('detached')) {
          eventColor = chalk.yellow
        } else if (event.includes('failed')) {
          eventColor = chalk.red
        } else if (event.includes('suspended')) {
          eventColor = chalk.magenta
        }

        // Format the log output
        this.log(`${chalk.dim(`[${timestamp}]`)} Channel: ${chalk.cyan(channelName)} | Event: ${eventColor(event)}`)
        if (message.data) {
          this.log(`Data: ${JSON.stringify(message.data, null, 2)}`)
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