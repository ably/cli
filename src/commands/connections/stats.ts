import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ConnectionsStats extends AblyBaseCommand {
  static override description = 'View connection statistics for an Ably app'

  static override examples = [
    '$ ably connections stats',
    '$ ably connections stats --live',
    '$ ably connections stats --interval hour',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    live: Flags.boolean({
      description: 'Poll for stats every 6 seconds and display live updates',
      default: false,
    }),
    interval: Flags.string({
      description: 'Stats interval granularity',
      options: ['minute', 'hour', 'day', 'month'],
      default: 'minute',
    }),
    unit: Flags.string({
      description: 'Unit of time for the interval',
      options: ['minute', 'hour', 'day', 'month'],
      default: 'minute',
    }),
    limit: Flags.integer({
      description: 'Maximum number of intervals to retrieve',
      default: 10,
    }),
    json: Flags.boolean({
      description: 'Output results as JSON',
      default: false,
    }),
  }

  private lastStatsData: any = null

  // Function to format numbers with commas
  private formatNumber(num: number): string {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  // Format stats data for display
  private formatStats(stats: any, timestamp?: Date): string {
    // Extract connection statistics from the entries object
    const entries = stats.entries || {}
    
    // Extract specific connection-related metrics
    const connectionsAll = entries['connections.all'] || {}
    const connectionsPeak = entries['connections.all.peak'] || 0
    const connectionsMean = entries['connections.all.mean'] || 0
    const connectionsOpened = entries['connections.all.opened'] || 0
    
    // Channel stats
    const channelsPeak = entries['channels.peak'] || 0
    const channelsOpened = entries['channels.opened'] || 0
    
    // Message stats
    const inboundMsgCount = entries['messages.inbound.all.messages.count'] || 0
    const inboundMsgData = entries['messages.inbound.all.messages.data'] || 0
    const outboundMsgCount = entries['messages.outbound.all.messages.count'] || 0
    const outboundMsgData = entries['messages.outbound.all.messages.data'] || 0
    
    // Format the time
    const displayTime = timestamp ? 
      timestamp.toISOString() : 
      (stats.intervalId ? new Date(stats.intervalId).toISOString() : 'Unknown')
    
    return [
      `${chalk.bold('Time:')} ${chalk.cyan(displayTime)}`,
      `${chalk.bold('Connections:')} ${chalk.yellow('Peak=')}${this.formatNumber(connectionsPeak)} ${chalk.yellow('Mean=')}${this.formatNumber(Math.round(connectionsMean))} ${chalk.yellow('Opened=')}${this.formatNumber(connectionsOpened)}`,
      `${chalk.bold('Channels:')} ${chalk.green('Peak=')}${this.formatNumber(channelsPeak)} ${chalk.green('Opened=')}${this.formatNumber(channelsOpened)}`,
      `${chalk.bold('Messages:')} ${chalk.blue('In=')}${this.formatNumber(inboundMsgCount)} (${this.formatBytes(inboundMsgData)}) ${chalk.blue('Out=')}${this.formatNumber(outboundMsgCount)} (${this.formatBytes(outboundMsgData)})`,
    ].join('\n')
  }

  // Format bytes to human-readable format
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ConnectionsStats)
    
    let client: Ably.Rest | null = null
    let poller: NodeJS.Timeout | null = null

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

      // Function to fetch and display stats
      const fetchAndDisplayStats = async () => {
        // Calculate time range based on the unit
        const now = new Date()
        let startTime = new Date()
        
        if (flags.unit === 'minute') {
          startTime = new Date(now.getTime() - 60 * 60 * 1000) // 1 hour ago for minutes
        } else if (flags.unit === 'hour') {
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago for hours
        } else if (flags.unit === 'day') {
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago for days
        } else {
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago for months
        }

        // Prepare query parameters
        const params = {
          start: startTime.getTime(),
          end: now.getTime(),
          limit: flags.live ? 1 : flags.limit,
          unit: flags.unit as 'minute' | 'hour' | 'day' | 'month',
          direction: 'backwards' as 'backwards' | 'forwards',
        }

        // Get stats
        const statsPage = await client!.stats(params)
        const stats = statsPage.items
        
        if (stats.length === 0) {
          this.log('No connection stats available.')
          return
        }
        
        if (flags.json) {
          // Output in JSON format
          this.log(JSON.stringify(stats, null, 2))
          return
        }

        // For live mode, check if stats have changed
        if (flags.live) {
          const currentStats = stats[0]
          
          // Skip if no change
          if (this.lastStatsData && 
              JSON.stringify(currentStats) === JSON.stringify(this.lastStatsData)) {
            return
          }
          
          // Update last stats data
          this.lastStatsData = currentStats
          
          // Clear the console
          process.stdout.write('\x1Bc')
          this.log(`${chalk.bold('Ably Connections Stats')} ${chalk.dim('(Live updates every 6 seconds)')}`)
          this.log(chalk.dim('Press Ctrl+C to exit'))
          this.log('')
          
          // Add current timestamp to show when update occurred
          const updateTime = new Date()
          this.log(`Last updated: ${chalk.dim(updateTime.toLocaleTimeString())}`)
          this.log('')
        }

        // Format and display each stat
        for (const stat of stats) {
          this.log(this.formatStats(stat, flags.live ? new Date() : undefined))
          if (!flags.live && stats.length > 1) {
            this.log(chalk.dim('---------------------------------------------------'))
          }
        }
        
        if (!flags.live) {
          this.log(`Displayed ${stats.length} stat intervals.`)
        }
      }
      
      // Initial fetch
      await fetchAndDisplayStats()
      
      // Set up polling if live flag is enabled
      if (flags.live) {
        // Set up cleanup for when the process is terminated
        const cleanup = () => {
          if (poller) {
            clearInterval(poller)
          }
        }
      
        // Handle process termination
        process.on('SIGINT', () => {
          this.log('\nLive updates ended')
          cleanup()
          process.exit(0)
        })
        
        // Poll every 6 seconds
        poller = setInterval(fetchAndDisplayStats, 6000)
        
        // Wait indefinitely
        await new Promise(() => {})
      }
    } catch (error: unknown) {
      const err = error as Error
      this.error(err.message)
    } finally {
      if (poller) {
        clearInterval(poller)
      }
    }
  }
} 