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
    
    try {
      // Get API key from flags or config
      const apiKey = flags['api-key'] || await this.configManager.getApiKey()
      if (!apiKey) {
        const appAndKey = await this.ensureAppAndKey(flags)
        if (!appAndKey) {
          this.error('No API key provided. Please specify --api-key or set an app with "ably apps switch"')
          return
        }
        flags['api-key'] = appAndKey.apiKey
      }
      
      // Show auth info at the start of the command
      this.showAuthInfoIfNeeded(flags)
      
      // Create a REST client
      const options: Ably.ClientOptions = this.getClientOptions(flags)
      const client = new Ably.Rest(options)
      
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
      
      // Display results based on format
      if (flags.format === 'json') {
        this.log(JSON.stringify(messages, null, 2))
      } else {
        if (messages.length === 0) {
          this.log('No application log messages found.')
          return
        }
        
        this.log(`Found ${chalk.cyan(messages.length.toString())} application log messages:`)
        this.log('')
        
        messages.forEach(message => {
          // Format timestamp
          const timestamp = new Date(message.timestamp).toISOString()
          this.log(`${chalk.gray(timestamp)} [${chalk.yellow(message.name || 'message')}]`)
          
          // Format data based on type
          if (typeof message.data === 'object') {
            try {
              this.log(JSON.stringify(message.data, null, 2))
            } catch {
              this.log(String(message.data))
            }
          } else {
            this.log(String(message.data))
          }
          
          this.log('') // Add a blank line between messages
        })
        
        if (messages.length === flags.limit) {
          this.log(chalk.yellow(`Showing maximum of ${flags.limit} messages. Use --limit to show more.`))
        }
      }
    } catch (error) {
      this.error(`Error retrieving application logs: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 