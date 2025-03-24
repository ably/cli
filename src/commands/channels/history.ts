import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ChannelsHistory extends AblyBaseCommand {
  static override description = 'Retrieve message history for a channel'

  static override examples = [
    '$ ably channels history my-channel',
    '$ ably channels history my-channel --limit 50',
    '$ ably channels history my-channel --direction forwards',
    '$ ably channels history my-channel --format json',
    '$ ably channels history my-channel --start "2023-01-01T00:00:00Z" --end "2023-01-02T00:00:00Z"',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    'limit': Flags.integer({
      description: 'Maximum number of messages to return',
      default: 25,
    }),
    'direction': Flags.string({
      description: 'Order of messages',
      options: ['backwards', 'forwards'],
      default: 'backwards',
    }),
    'start': Flags.string({
      description: 'Start time for the history query (ISO 8601 format)',
    }),
    'end': Flags.string({
      description: 'End time for the history query (ISO 8601 format)',
    }),
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
    'cipher-key': Flags.string({
      description: 'Encryption key for decrypting messages (hex-encoded)',
    }),
    'cipher-algorithm': Flags.string({
      description: 'Encryption algorithm to use',
      default: 'aes',
    }),
    'cipher-key-length': Flags.integer({
      description: 'Length of encryption key in bits',
      default: 256,
    }),
    'cipher-mode': Flags.string({
      description: 'Cipher mode to use',
      default: 'cbc',
    }),
  }

  static override args = {
    channel: Args.string({
      description: 'Channel name to retrieve history for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsHistory)

    // Create the Ably client
    const client = await this.createAblyClient(flags)
    if (!client) return
    
    try {
      const channelName = args.channel
      
      // Setup channel options
      const channelOptions: Ably.ChannelOptions = {}
      
      // Configure encryption if cipher key is provided
      if (flags['cipher-key']) {
        channelOptions.cipher = {
          key: flags['cipher-key'],
          algorithm: flags['cipher-algorithm'],
          keyLength: flags['cipher-key-length'],
          mode: flags['cipher-mode'],
        }
      }
      
      // Get the channel
      const channel = client.channels.get(channelName, channelOptions)
      
      // Build history query parameters
      const historyParams: Ably.RealtimeHistoryParams = {
        limit: flags.limit,
        direction: flags.direction as 'backwards' | 'forwards',
      }
      
      if (flags.start) {
        historyParams.start = new Date(flags.start).getTime()
      }
      
      if (flags.end) {
        historyParams.end = new Date(flags.end).getTime()
      }
      
      // Get history
      const history = await channel.history(historyParams)
      const messages = history.items
      
      // Output messages based on format
      if (flags.format === 'json') {
        this.log(JSON.stringify(messages, null, 2))
      } else {
        if (messages.length === 0) {
          this.log('No messages found in the channel history.')
          return
        }
        
        this.log(`Found ${chalk.cyan(messages.length.toString())} messages in the history of channel ${chalk.green(channelName)}:`)
        this.log('')
        
        messages.forEach((message, index) => {
          const timestamp = message.timestamp 
            ? new Date(message.timestamp).toISOString() 
            : 'Unknown timestamp'
          
          this.log(chalk.dim(`[${index + 1}] ${timestamp}`))
          this.log(`Event: ${chalk.yellow(message.name || '(none)')}`)
          
          if (message.clientId) {
            this.log(`Client ID: ${chalk.blue(message.clientId)}`)
          }
          
          this.log('Data:')
          try {
            // Try to pretty-print if data is an object/array
            if (typeof message.data === 'object' && message.data !== null) {
              this.log(JSON.stringify(message.data, null, 2))
            } else {
              this.log(String(message.data))
            }
          } catch (error) {
            this.log(String(message.data))
          }
          
          this.log('')
        })
        
        if (messages.length === flags.limit) {
          this.log(chalk.yellow(`Showing maximum of ${flags.limit} messages. Use --limit to show more.`))
        }
      }
    } catch (error) {
      this.error(`Error retrieving channel history: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      client.close()
    }
  }
} 