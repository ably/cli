import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'
import { formatJson, isJsonData } from '../../../utils/json-formatter.js'

export default class AppsLogsHistory extends AblyBaseCommand {
  static override description = 'Alias for `ably logs app history`'

  static override examples = [
    '$ ably apps logs history',
    '$ ably apps logs history --limit 20',
    '$ ably apps logs history --direction forwards',
    '$ ably apps logs history --json',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    limit: Flags.integer({
      description: 'Maximum number of messages to retrieve',
      default: 100,
    }),
    direction: Flags.string({
      description: 'Direction of message retrieval',
      options: ['backwards', 'forwards'],
      default: 'backwards',
    }),
    json: Flags.boolean({
      description: 'Output results in JSON format',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(AppsLogsHistory)
    
    let client: Ably.Rest | null = null
    
    try {
      // Get API key from flags or config
      const apiKey = flags['api-key'] || await this.configManager.getApiKey()
      if (!apiKey) {
        await this.ensureAppAndKey(flags)
        return
      }
      
      // Create a REST client
      const options: Ably.ClientOptions = this.getClientOptions(flags)
      client = new Ably.Rest(options)
      
      // Get the channel
      const channel = client.channels.get('[meta]log:app')
      
      // Build history query parameters
      const historyParams: Ably.RealtimeHistoryParams = {
        limit: flags.limit,
        direction: flags.direction as 'backwards' | 'forwards',
      }
      
      // Get history
      const history = await channel.history(historyParams)
      const messages = history.items
      
      // Output results based on format
      if (flags.json) {
        this.log(JSON.stringify(messages, null, 2))
      } else {
        if (messages.length === 0) {
          this.log('No app logs found in history.')
          return
        }
        
        this.log(`Found ${chalk.cyan(messages.length.toString())} app logs:`)
        this.log('')
        
        messages.forEach((message, index) => {
          const timestamp = message.timestamp 
            ? new Date(message.timestamp).toISOString() 
            : 'Unknown timestamp'
          
          this.log(chalk.dim(`[${index + 1}] ${timestamp}`))
          if (message.name) {
            this.log(`Event: ${chalk.yellow(message.name)}`)
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
        })
        
        if (messages.length === flags.limit) {
          this.log(chalk.yellow(`Showing maximum of ${flags.limit} logs. Use --limit to show more.`))
        }
      }
    } catch (error) {
      this.error(`Error retrieving app logs: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 