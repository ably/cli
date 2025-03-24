import {Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'
import { StatsDisplay } from '../../services/stats-display.js'

export default class ConnectionsStats extends AblyBaseCommand {
  static override description = 'View connection statistics for an Ably app'

  static override examples = [
    '$ ably connections stats',
    '$ ably connections stats --unit hour',
    '$ ably connections stats --start 1618005600000 --end 1618091999999',
    '$ ably connections stats --limit 10',
    '$ ably connections stats --format json',
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
    'format': Flags.string({
      description: 'Output format',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
    'live': Flags.boolean({
      description: 'Subscribe to live stats updates (uses minute interval)',
      default: false,
    }),
    'interval': Flags.integer({
      description: 'Polling interval in seconds (only used with --live)',
      default: 6,
    }),
  }

  private pollInterval: NodeJS.Timeout | undefined = undefined
  private statsDisplay: StatsDisplay | null = null

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
      format: flags.format as 'json' | 'pretty',
      unit: flags.unit as 'minute' | 'hour' | 'day' | 'month'
    })
    
    if (flags.live) {
      await this.runLiveStats(flags, client)
    } else {
      await this.runOneTimeStats(flags, client)
    }
  }

  async runLiveStats(flags: any, client: Ably.Rest): Promise<void> {
    let poller: NodeJS.Timeout | null = null

    try {
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
        const statsPage = await client.stats(params)
        const stats = statsPage.items
        
        if (stats.length === 0) {
          this.log('No connection stats available.')
          return
        }

        // Display stats using the StatsDisplay class
        this.statsDisplay!.display(stats[0])
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
    } catch (error) {
      this.error(`Failed to fetch stats: ${error}`)
    } finally {
      if (poller) {
        clearInterval(poller)
      }
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