import {Flags} from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import {AblyBaseCommand} from '../../../base-command.js'
import { formatJson, isJsonData } from '../../../utils/json-formatter.js'

export default class LogsAppHistory extends AblyBaseCommand {
  static override description = 'Retrieve application log history'

  static override examples = [
    '$ ably logs app history',
    '$ ably logs app history --limit 20',
    '$ ably logs app history --direction forwards',
    '$ ably logs app history --json',
    '$ ably logs app history --pretty-json']

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    direction: Flags.string({
      default: 'backwards',
      description: 'Direction of log retrieval',
      options: ['backwards', 'forwards'],
    }),
    limit: Flags.integer({
      default: 100,
      description: 'Maximum number of logs to retrieve',
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(LogsAppHistory)

    try {
      // Get API key from flags or config
      const apiKey = flags['api-key'] || await this.configManager.getApiKey()
      if (!apiKey) {
        await this.ensureAppAndKey(flags)
        return
      }

      // Create a REST client
      const options: Ably.ClientOptions = this.getClientOptions(flags)
      const client = new Ably.Rest(options)

      // Get the channel
      const channel = client.channels.get('[meta]log:app')

      // Build history query parameters
      const historyParams: Ably.RealtimeHistoryParams = {
        direction: flags.direction as 'backwards' | 'forwards',
        limit: flags.limit,
      }

      // Get history
      const history = await channel.history(historyParams)
      const messages = history.items

      // Output results based on format
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          messages: messages.map(msg => ({
            clientId: msg.clientId,
            connectionId: msg.connectionId,
            data: msg.data,
            encoding: msg.encoding,
            id: msg.id,
            name: msg.name,
            timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString()
          })),
          success: true
        }, flags))
      } else {
        if (messages.length === 0) {
          this.log('No application logs found in history.')
          return
        }

        this.log(`Found ${chalk.cyan(messages.length.toString())} application logs:`)
        this.log('')

        for (const [index, message] of messages.entries()) {
          const timestamp = message.timestamp
            ? new Date(message.timestamp).toISOString()
            : 'Unknown timestamp'

          this.log(chalk.dim(`[${index + 1}] ${timestamp}`))
          
          // Event name
          if (message.name) {
            const color = this.getColorForEventName(message.name);
            this.log(`Event: ${color(message.name)}`)
          }
          
          // Display message data
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

        if (messages.length === flags.limit) {
          this.log(chalk.yellow(`Showing maximum of ${flags.limit} logs. Use --limit to show more.`))
        }
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: error instanceof Error ? error.message : String(error),
          success: false
        }, flags))
      } else {
        this.error(`Error retrieving application logs: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  // Helper function to determine chalk color based on event name
  private getColorForEventName(eventName: string) {
    if (eventName.includes('success')) {
      return chalk.green;
    }
 
    if (eventName.includes('failed') || eventName.includes('error')) {
      return chalk.red;
    }
 
    if (eventName.includes('warning')) {
      return chalk.yellow;
    }
    
    return chalk.white; // Default color
  }
} 