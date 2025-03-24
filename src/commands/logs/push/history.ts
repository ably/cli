import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'
import { formatJson, isJsonData } from '../../../utils/json-formatter.js'

export default class LogsPushHistory extends AblyBaseCommand {
  static override description = 'Retrieve push notification log history'

  static override examples = [
    '$ ably logs push history',
    '$ ably logs push history --limit 20',
    '$ ably logs push history --direction forwards',
    '$ ably logs push history --json',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    limit: Flags.integer({
      description: 'Maximum number of logs to retrieve',
      default: 100,
    }),
    direction: Flags.string({
      description: 'Direction of log retrieval',
      options: ['backwards', 'forwards'],
      default: 'backwards',
    }),
    json: Flags.boolean({
      description: 'Output results in JSON format',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LogsPushHistory)

    let client: Ably.Rest | null = null;

    try {
      // Get API key from flags or config
      const apiKey = flags['api-key'] || await this.configManager.getApiKey()
      if (!apiKey) {
        await this.ensureAppAndKey(flags)
        return
      }

      // Create the Ably REST client
      const options: Ably.ClientOptions = this.getClientOptions(flags)
      client = new Ably.Rest(options)

      const channelName = '[meta]log:push'
      const channel = client.channels.get(channelName)

      this.log(`Retrieving history from ${chalk.cyan(channelName)}...`)
      
      // Get message history
      const historyOptions = {
        limit: flags.limit,
        direction: flags.direction as 'backwards' | 'forwards',
      }

      const historyPage = await channel.history(historyOptions)
      const items = historyPage.items
      
      if (items.length === 0) {
        this.log('No push log messages found in history.')
        return
      }
      
      if (flags.json) {
        // Output in JSON format
        this.log(JSON.stringify(items.map(message => ({
          timestamp: new Date(message.timestamp).toISOString(),
          channel: channelName,
          event: message.name,
          data: message.data,
        })), null, 2))
        return
      }

      // Format and display the log messages
      for (const message of items) {
        const timestamp = new Date(message.timestamp).toISOString()
        const event = message.name || 'unknown'
        
        // Color-code different event types based on severity
        let eventColor = chalk.blue
        
        // For push log events - based on examples and severity
        if (message.data && typeof message.data === 'object' && 'severity' in message.data) {
          const severity = message.data.severity as string
          if (severity === 'error') {
            eventColor = chalk.red
          } else if (severity === 'warning') {
            eventColor = chalk.yellow
          } else if (severity === 'info') {
            eventColor = chalk.green
          } else if (severity === 'debug') {
            eventColor = chalk.blue
          }
        }

        // Format the log output
        this.log(`${chalk.dim(`[${timestamp}]`)} Channel: ${chalk.cyan(channelName)} | Event: ${eventColor(event)}`)
        if (message.data) {
          this.log('Data:')
          if (isJsonData(message.data)) {
            this.log(formatJson(message.data))
          } else {
            this.log(String(message.data))
          }
        }
        this.log('')
      }

      this.log(`Displayed ${items.length} push log messages.`)

    } catch (error: unknown) {
      const err = error as Error
      this.error(err.message)
    }
  }
} 