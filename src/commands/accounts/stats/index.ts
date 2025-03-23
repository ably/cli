import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../../control-base-command.js'
import { AccountStats } from '../../../services/control-api.js'

export default class AccountsStatsCommand extends ControlBaseCommand {
  static description = 'Get account stats with optional live updates'

  static examples = [
    '$ ably accounts stats',
    '$ ably accounts stats --unit hour',
    '$ ably accounts stats --start 1618005600000 --end 1618091999999',
    '$ ably accounts stats --limit 10',
    '$ ably accounts stats --format json',
    '$ ably accounts stats --live',
    '$ ably accounts stats --live --interval 15',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'start': Flags.integer({
      description: 'Start time in milliseconds since epoch',
    }),
    'end': Flags.integer({
      description: 'End time in milliseconds since epoch',
    }),
    'unit': Flags.string({
      description: 'Time unit for stats',
      options: ['minute', 'hour', 'day', 'month'],
      default: 'minute',
    }),
    'limit': Flags.integer({
      description: 'Maximum number of stats records to return',
      default: 10,
    }),
    'format': Flags.string({
      description: 'Output format',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
    'live': Flags.boolean({
      description: 'Subscribe to live stats updates',
      default: false,
    }),
    'interval': Flags.integer({
      description: 'Polling interval in seconds (only used with --live)',
      default: 6,
    }),
  }

  private lastStats: AccountStats | null = null
  private pollInterval: NodeJS.Timeout | undefined = undefined

  async run(): Promise<void> {
    const { flags } = await this.parse(AccountsStatsCommand)
    
    const controlApi = this.createControlApi(flags)
    
    if (flags.live) {
      await this.runLiveStats(flags, controlApi)
    } else {
      await this.runOneTimeStats(flags, controlApi)
    }
  }

  private async runOneTimeStats(flags: any, controlApi: any): Promise<void> {
    try {
      // Get account info to display the name
      const { account } = await controlApi.getMe()
      this.log(`Fetching stats for account ${account.name} (${account.id})...`)
      
      // If no start/end time provided, use the last 24 hours
      if (!flags.start && !flags.end) {
        const now = new Date()
        flags.end = now.getTime()
        flags.start = now.getTime() - (24 * 60 * 60 * 1000) // 24 hours ago
      }
      
      const stats = await controlApi.getAccountStats({
        start: flags.start,
        end: flags.end,
        unit: flags.unit,
        limit: flags.limit,
      })
      
      if (stats.length === 0) {
        this.log('No stats found for the specified period')
        return
      }
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(stats))
      } else {
        this.log(`\nStats for account ${account.name} (${account.id}):\n`)
        
        stats.forEach((stat: AccountStats, index: number) => {
          if (!stat) {
            this.log(`Interval ${index + 1}: No data available`)
            return
          }
          
          // Format the interval ID
          const intervalDisplay = stat.intervalId ? 
            this.formatIntervalId(stat.intervalId, flags.unit) : 
            'Unknown time'
          
          this.log(`Interval ${index + 1}: ${intervalDisplay} (${stat.unit || 'unknown unit'})`)

          // Helper function to safely get entry values
          const getEntry = (key: string, defaultVal = 0) => {
            return stat.entries?.[key] ?? defaultVal
          }
          
          // Helper function to format numbers with comma separators
          const formatNumber = (num: number) => {
            return num.toLocaleString()
          }
          
          // Helper function to format peak rates (per second)
          const formatPeakRate = (rate: number) => {
            // Include at least one decimal place for values between 0 and 1
            if (rate > 0 && rate < 1) {
              return rate.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
            }
            return rate.toLocaleString(undefined, { maximumFractionDigits: 1 })
          }
          
          // Display message stats with peak rates
          this.log('  Messages:')
          const inboundMsgCount = getEntry('messages.inbound.all.messages.count')
          const inboundMsgData = getEntry('messages.inbound.all.messages.data')
          const outboundMsgCount = getEntry('messages.outbound.all.messages.count')
          const outboundMsgData = getEntry('messages.outbound.all.messages.data')
          const messagesPeakRate = getEntry('peakRates.messages')
          
          this.log(`    Published: ${formatNumber(inboundMsgCount)} (${this.formatBytes(inboundMsgData)})`)
          this.log(`    Delivered: ${formatNumber(outboundMsgCount)} (${this.formatBytes(outboundMsgData)})`)
          this.log(`    Peak Message Rate: ${formatPeakRate(messagesPeakRate)}/second`)
          
          // Display presence stats
          this.log('  Presence:')
          const inboundPresCount = getEntry('messages.inbound.all.presence.count')
          const inboundPresData = getEntry('messages.inbound.all.presence.data')
          this.log(`    Published: ${formatNumber(inboundPresCount)} (${this.formatBytes(inboundPresData)})`)
          
          const outboundPresCount = getEntry('messages.outbound.all.presence.count')
          const outboundPresData = getEntry('messages.outbound.all.presence.data')
          this.log(`    Delivered: ${formatNumber(outboundPresCount)} (${this.formatBytes(outboundPresData)})`)
          
          // Display connection stats with peak rates
          this.log('  Connections:')
          const peakConnections = getEntry('connections.all.peak')
          const meanConnections = Math.round(getEntry('connections.all.mean'))
          const openedConnections = getEntry('connections.all.opened')
          const connectionsPeakRate = getEntry('peakRates.connections')
          
          this.log(`    Peak: ${formatNumber(peakConnections)}, Mean: ${formatNumber(meanConnections)}, Opened: ${formatNumber(openedConnections)}`)
          this.log(`    Peak Connection Rate: ${formatPeakRate(connectionsPeakRate)}/second`)
          
          // Display channel stats with peak rates
          this.log('  Channels:')
          const channelsPeak = getEntry('channels.peak')
          const channelsMean = Math.round(getEntry('channels.mean'))
          const channelsOpened = getEntry('channels.opened')
          const channelsPeakRate = getEntry('peakRates.channels')
          
          this.log(`    Peak: ${formatNumber(channelsPeak)}, Mean: ${formatNumber(channelsMean)}, Opened: ${formatNumber(channelsOpened)}`)
          if (channelsPeakRate) {
            this.log(`    Peak Channel Rate: ${formatPeakRate(channelsPeakRate)}/second`)
          }
          
          // Display API request stats with peak rates
          this.log('  API Requests:')
          const apiSucceeded = getEntry('apiRequests.all.succeeded')
          const apiFailed = getEntry('apiRequests.all.failed', 0)
          const apiRefused = getEntry('apiRequests.all.refused', 0)
          const apiRequestsPeakRate = getEntry('peakRates.apiRequests')
          
          this.log(`    Succeeded: ${formatNumber(apiSucceeded)}, Failed: ${formatNumber(apiFailed)}, Refused: ${formatNumber(apiRefused)}`)
          if (apiRequestsPeakRate) {
            this.log(`    Peak API Request Rate: ${formatPeakRate(apiRequestsPeakRate)}/second`)
          }
          
          // Display token request stats with peak rates
          this.log('  Token Requests:')
          const tokenSucceeded = getEntry('apiRequests.tokenRequests.succeeded')
          const tokenFailed = getEntry('apiRequests.tokenRequests.failed', 0)
          const tokenRefused = getEntry('apiRequests.tokenRequests.refused', 0)
          const tokenRequestsPeakRate = getEntry('peakRates.tokenRequests')
          
          this.log(`    Succeeded: ${formatNumber(tokenSucceeded)}, Failed: ${formatNumber(tokenFailed)}, Refused: ${formatNumber(tokenRefused)}`)
          this.log(`    Peak Token Request Rate: ${formatPeakRate(tokenRequestsPeakRate)}/second`)
          
          // Check for reactor peak rates
          const reactorHttpEventRate = getEntry('peakRates.reactor.httpEvent')
          const reactorAmqpRate = getEntry('peakRates.reactor.amqp')
          const reactorExternalQueueRate = getEntry('peakRates.reactor.externalQueue')
          const reactorWebhookRate = getEntry('peakRates.reactor.webhook')
          
          if (reactorHttpEventRate || reactorAmqpRate || reactorExternalQueueRate || reactorWebhookRate) {
            this.log('  Integration Rates:')
            if (reactorHttpEventRate) {
              this.log(`    HTTP Event: ${formatPeakRate(reactorHttpEventRate)}/second`)
            }
            if (reactorAmqpRate) {
              this.log(`    AMQP: ${formatPeakRate(reactorAmqpRate)}/second`)
            }
            if (reactorExternalQueueRate) {
              this.log(`    External Queue: ${formatPeakRate(reactorExternalQueueRate)}/second`)
            }
            if (reactorWebhookRate) {
              this.log(`    Webhook: ${formatPeakRate(reactorWebhookRate)}/second`)
            }
          }
          
          // Display Push Notification stats if available
          const pushNotifications = getEntry('pushStats.messages', 0)
          const pushRequestsPeakRate = getEntry('peakRates.pushRequests')
          
          if (pushNotifications > 0 || pushRequestsPeakRate) {
            this.log('  Push Notifications:')
            if (pushNotifications > 0) {
              this.log(`    Messages: ${formatNumber(pushNotifications)}`)
              
              const pushSucceeded = getEntry('pushStats.notifications.succeeded', 0)
              const pushFailed = getEntry('pushStats.notifications.failed', 0)
              this.log(`    Delivered: ${formatNumber(pushSucceeded)}, Failed: ${formatNumber(pushFailed)}`)
            }
            if (pushRequestsPeakRate) {
              this.log(`    Peak Push Request Rate: ${formatPeakRate(pushRequestsPeakRate)}/second`)
            }
          }
          
          this.log('') // Add a blank line between stat records
        })
      }
    } catch (error) {
      this.error(`Error fetching account stats: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async runLiveStats(flags: any, controlApi: any): Promise<void> {
    try {
      // Get account info to display the name
      const { account } = await controlApi.getMe()
      this.log(`Subscribing to live stats for account ${account.name} (${account.id})...`)
      
      // Setup graceful shutdown
      const cleanup = () => {
        if (this.pollInterval) {
          clearInterval(this.pollInterval)
          this.pollInterval = undefined
        }
        this.log('\nUnsubscribed from live stats')
        process.exit(0)
      }

      process.on('SIGINT', cleanup)
      process.on('SIGTERM', cleanup)
      
      // Show stats immediately before starting polling
      await this.fetchAndDisplayStats(flags, controlApi)
      
      this.log(`Polling every ${flags.interval} seconds. Press Ctrl+C to exit.\n`)
      
      // Poll for stats at the specified interval
      this.pollInterval = setInterval(async () => {
        await this.fetchAndDisplayStats(flags, controlApi)
      }, flags.interval * 1000)
      
      // Keep the process running
      await new Promise<void>(() => {
        // This promise is intentionally never resolved
        // The process will exit via the SIGINT/SIGTERM handlers
      })
      
    } catch (error) {
      this.error(`Error setting up live stats: ${error instanceof Error ? error.message : String(error)}`)
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
      }
    }
  }

  private async fetchAndDisplayStats(flags: any, controlApi: any): Promise<void> {
    try {
      const now = new Date()
      
      // Calculate time range based on the specified unit
      let startTime: Date
      if (flags.unit === 'minute') {
        startTime = new Date(now.getTime() - 60 * 60 * 1000) // 1 hour ago
      } else if (flags.unit === 'hour') {
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago
      } else if (flags.unit === 'day') {
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
      } else {
        startTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) // 90 days ago
      }
      
      const stats = await controlApi.getAccountStats({
        start: startTime.getTime(),
        end: now.getTime(),
        unit: flags.unit,
        limit: 5, // Get multiple stats to find the most recent one
      })
      
      if (stats.length > 0) {
        // Use the most recent stats (first in the array)
        const currentStats = stats[0]
        
        // Skip if no valid stats or no change from last update
        if (!currentStats || 
            (this.lastStats && JSON.stringify(this.lastStats) === JSON.stringify(currentStats))) {
          return
        }
        
        // Helper function to safely get entry values
        const getEntry = (key: string, defaultVal = 0) => {
          return currentStats.entries?.[key] ?? defaultVal
        }
        
        // Helper function to format numbers with comma separators
        const formatNumber = (num: number) => {
          return num.toLocaleString()
        }
        
        // Helper function to format peak rates (per second)
        const formatPeakRate = (rate: number) => {
          // Include at least one decimal place for values between 0 and 1
          if (rate > 0 && rate < 1) {
            return rate.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
          }
          return rate.toLocaleString(undefined, { maximumFractionDigits: 1 })
        }
        
        if (flags.format === 'json') {
          this.log(JSON.stringify(currentStats))
        } else {
          const timestamp = new Date().toLocaleString()
          
          // Format the interval ID
          const intervalDisplay = currentStats.intervalId ? 
            this.formatIntervalId(currentStats.intervalId, flags.unit) : 
            'Unknown time'
          
          this.log(`[${timestamp}] Stats update for interval: ${intervalDisplay} (${currentStats.unit || 'unknown unit'})`)
          
          // Display message stats with peak rates
          this.log('  Messages:')
          const inboundCount = getEntry('messages.inbound.all.messages.count')
          const inboundData = getEntry('messages.inbound.all.messages.data')
          const outboundCount = getEntry('messages.outbound.all.messages.count')
          const outboundData = getEntry('messages.outbound.all.messages.data')
          const messagesPeakRate = getEntry('peakRates.messages')
          
          this.log(`    Published: ${formatNumber(inboundCount)} (${this.formatBytes(inboundData)})`)
          this.log(`    Delivered: ${formatNumber(outboundCount)} (${this.formatBytes(outboundData)})`)
          this.log(`    Peak Message Rate: ${formatPeakRate(messagesPeakRate)}/second`)
          
          // Display connection stats with peak rates
          this.log('  Connections:')
          const peakConnections = getEntry('connections.all.peak')
          const meanConnections = Math.round(getEntry('connections.all.mean'))
          const connectionsPeakRate = getEntry('peakRates.connections')
          
          this.log(`    Peak: ${formatNumber(peakConnections)}, Current: ~${formatNumber(meanConnections)}`)
          this.log(`    Peak Connection Rate: ${formatPeakRate(connectionsPeakRate)}/second`)
          
          // Display channel stats with peak rates
          this.log('  Channels:')
          const peakChannels = getEntry('channels.peak')
          const meanChannels = Math.round(getEntry('channels.mean'))
          const channelsPeakRate = getEntry('peakRates.channels')
          
          this.log(`    Peak: ${formatNumber(peakChannels)}, Current: ~${formatNumber(meanChannels)}`)
          if (channelsPeakRate) {
            this.log(`    Peak Channel Rate: ${formatPeakRate(channelsPeakRate)}/second`)
          }
          
          // Display API request stats with peak rates
          this.log('  API Requests:')
          const succeededRequests = getEntry('apiRequests.all.succeeded')
          const failedRequests = getEntry('apiRequests.all.failed', 0)
          const apiRequestsPeakRate = getEntry('peakRates.apiRequests')
          
          this.log(`    Succeeded: ${formatNumber(succeededRequests)}, Failed: ${formatNumber(failedRequests)}`)
          if (apiRequestsPeakRate) {
            this.log(`    Peak API Request Rate: ${formatPeakRate(apiRequestsPeakRate)}/second`)
          }
          
          // Display token request stats with peak rates
          this.log('  Token Requests:')
          const tokenRequests = getEntry('apiRequests.tokenRequests.succeeded')
          const tokenRequestsPeakRate = getEntry('peakRates.tokenRequests')
          
          this.log(`    Count: ${formatNumber(tokenRequests)}`)
          this.log(`    Peak Token Request Rate: ${formatPeakRate(tokenRequestsPeakRate)}/second`)
          
          this.log('') // Add a blank line between updates
        }
        
        this.lastStats = currentStats
      }
    } catch (error) {
      this.error(`Error fetching account stats: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Format bytes to a human-readable string
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Parse an interval ID in the format "YYYY-MM-DD:HH:MM" to a Date object
  private parseIntervalId(intervalId: string, unit: string = 'minute'): Date | null {
    try {
      // Different formats based on unit type
      let year, month, day, hour, minute;
      
      // Split by first colon
      const colonIndex = intervalId.indexOf(':');
      if (colonIndex === -1) return null;
      
      const datePart = intervalId.substring(0, colonIndex);
      const timePart = intervalId.substring(colonIndex + 1);
      
      if (!datePart || !timePart) return null;
      
      // Parse date part
      const dateComponents = datePart.split('-');
      if (dateComponents.length !== 3) return null;
      
      year = parseInt(dateComponents[0], 10);
      month = parseInt(dateComponents[1], 10);
      day = parseInt(dateComponents[2], 10);
      
      // Parse time part
      if (unit === 'minute') {
        const timeComponents = timePart.split(':');
        if (timeComponents.length !== 2) return null;
        hour = parseInt(timeComponents[0], 10);
        minute = parseInt(timeComponents[1], 10);
      } else if (unit === 'hour') {
        hour = parseInt(timePart, 10);
        minute = 0;
      } else if (unit === 'day') {
        hour = 0;
        minute = 0;
      } else if (unit === 'month') {
        // For month unit, day is set to 1
        day = 1;
        hour = 0;
        minute = 0;
      }
      
      // Month is 0-based in JavaScript Date
      return new Date(Date.UTC(year, month - 1, day, hour, minute));
    } catch (e) {
      return null;
    }
  }
  
  // Format an interval ID to a readable string based on unit
  private formatIntervalId(intervalId: string, unit: string = 'minute'): string {
    const date = this.parseIntervalId(intervalId, unit);
    if (!date || isNaN(date.getTime())) {
      return `${intervalId}`;
    }
    
    // Format differently based on unit
    let formattedDate;
    const options: Intl.DateTimeFormatOptions = {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone // Use local time zone
    };
    
    if (unit === 'minute') {
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
      options.hour = '2-digit';
      options.minute = '2-digit';
    } else if (unit === 'hour') {
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
      options.hour = '2-digit';
    } else if (unit === 'day') {
      options.year = 'numeric';
      options.month = 'short';
      options.day = 'numeric';
    } else if (unit === 'month') {
      options.year = 'numeric';
      options.month = 'long';
    }
    
    formattedDate = new Intl.DateTimeFormat('en-US', options).format(date);
    
    // Return both formatted date and original interval ID for reference
    return `${formattedDate} (${intervalId})`;
  }
} 