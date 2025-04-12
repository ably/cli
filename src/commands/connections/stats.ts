import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'
import { StatsDisplay } from '../../services/stats-display.js'
import chalk from 'chalk'

export default class ConnectionsStats extends AblyBaseCommand {
  static override description = 'View connection statistics for an Ably app'

  static override examples = [
    '$ ably connections stats',
    '$ ably connections stats --unit hour',
    '$ ably connections stats --start 1618005600000 --end 1618091999999',
    '$ ably connections stats --limit 10',
    '$ ably connections stats --json',
    '$ ably connections stats --pretty-json',
    '$ ably connections stats --live',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
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
    
    'live': Flags.boolean({
      description: 'Subscribe to live stats updates (uses minute interval)',
      default: false,
    }),
    'interval': Flags.integer({
      description: 'Polling interval in seconds (only used with --live)',
      default: 6,
    }),
    'debug': Flags.boolean({
      description: 'Show debug information for live stats polling',
      default: false,
    }),
  }

  private pollInterval: NodeJS.Timeout | undefined = undefined
  private statsDisplay: StatsDisplay | null = null
  private isPolling = false // Track when we're already fetching stats

  async run(): Promise<void> {
    const {flags} = await this.parse(ConnectionsStats)
    
    // For live stats, enforce minute interval
    if (flags.live && flags.unit !== 'minute') {
      this.warn('Live stats only support minute intervals. Using minute interval.')
      flags.unit = 'minute'
    }
    
    // Get API key from flags or config
    const apiKey = flags['api-key'] || await this.configManager.getApiKey()
    if (!apiKey) {
      this.error('No API key found. Please set an API key using "ably keys add" or set the ABLY_API_KEY environment variable.')
      return
    }

    // Create the Ably REST client
    const options: Ably.ClientOptions = this.getClientOptions(flags)
    const client = new Ably.Rest(options)
    
    // Create stats display
    this.statsDisplay = new StatsDisplay({
      live: flags.live,
      startTime: flags.live ? new Date() : undefined,
      json: this.shouldOutputJson(flags),
      unit: flags.unit as 'minute' | 'hour' | 'day' | 'month',
      isConnectionStats: true,
      intervalSeconds: flags.interval
    })
    
    if (flags.live) {
      await this.runLiveStats(flags, client)
    } else {
      await this.runOneTimeStats(flags, client)
    }
  }

  async runLiveStats(flags: any, client: Ably.Rest): Promise<void> {
    try {
      this.log('Subscribing to live connection stats...')
      
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
      await this.fetchAndDisplayStats(flags, client)
      
      // Poll for stats at the specified interval
      this.pollInterval = setInterval(() => {
        // Use non-blocking polling - don't wait for previous poll to complete
        if (!this.isPolling) {
          this.pollStats(flags, client)
        } else if (flags.debug) {
          // Only show this message if debug flag is enabled
          console.log(chalk.yellow('Skipping poll - previous request still in progress'))
        }
      }, (flags.interval || 6) * 1000)
      
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

  private async pollStats(flags: any, client: Ably.Rest): Promise<void> {
    try {
      this.isPolling = true
      if (flags.debug) {
        console.log(chalk.dim(`[${new Date().toISOString()}] Polling for new stats...`))
      }
      
      await this.fetchAndDisplayStats(flags, client)
    } catch (error) {
      if (flags.debug) {
        console.error(chalk.red(`Error during stats polling: ${error instanceof Error ? error.message : String(error)}`))
      }
    } finally {
      this.isPolling = false
    }
  }

  private async fetchAndDisplayStats(flags: any, client: Ably.Rest): Promise<void> {
    try {
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
      const statsPage = await client.stats(params)
      const stats = statsPage.items
      
      if (stats.length === 0) {
        if (!flags.live) {
          this.log('No connection stats available.')
        }
        return
      }

      // Display stats using the StatsDisplay class
      this.statsDisplay!.display(stats[0])
    } catch (error) {
      this.error(`Failed to fetch stats: ${error}`)
    }
  }

  async runOneTimeStats(flags: any, client: Ably.Rest): Promise<void> {
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
      limit: flags.limit,
      unit: flags.unit as 'minute' | 'hour' | 'day' | 'month',
      direction: 'backwards' as 'backwards' | 'forwards',
    }

    // Get stats
    const statsPage = await client.stats(params)
    const stats = statsPage.items
    
    if (stats.length === 0) {
      this.log('No connection stats available.')
      return
    }

    // Display stats using the StatsDisplay class
    this.statsDisplay!.display(stats[0])
  }
} 