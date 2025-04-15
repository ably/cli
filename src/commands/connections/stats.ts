import {Flags} from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import {AblyBaseCommand} from '../../base-command.js'
import { StatsDisplay } from '../../services/stats-display.js'

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
    'debug': Flags.boolean({
      default: false,
      description: 'Show debug information for live stats polling',
    }),
    'end': Flags.integer({
      description: 'End time in milliseconds since epoch',
    }),
    'interval': Flags.integer({
      default: 6,
      description: 'Polling interval in seconds (only used with --live)',
    }),
    'limit': Flags.integer({
      default: 10,
      description: 'Maximum number of stats records to return',
    }),
    
    'live': Flags.boolean({
      default: false,
      description: 'Subscribe to live stats updates (uses minute interval)',
    }),
    'start': Flags.integer({
      description: 'Start time in milliseconds since epoch',
    }),
    'unit': Flags.string({
      default: 'minute',
      description: 'Time unit for stats',
      options: ['minute', 'hour', 'day', 'month'],
    }),
  }

  private client: Ably.Rest | null = null;
  private isPolling = false
  private pollInterval: NodeJS.Timeout | undefined = undefined // Track when we're already fetching stats
  private statsDisplay: StatsDisplay | null = null // Store client for finally block

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    // No need to close REST client explicitly
    return super.finally(err);
  }

  async run(): Promise<void> {
    const {flags} = await this.parse(ConnectionsStats)
    
    // For live stats, enforce minute interval
    if (flags.live && flags.unit !== 'minute') {
      this.logCliEvent(flags, 'stats', 'liveIntervalOverride', 'Live stats only support minute intervals. Using minute interval.');
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
    this.client = new Ably.Rest(options)
    const {client} = this; // Local const
    
    // Create stats display
    this.statsDisplay = new StatsDisplay({
      intervalSeconds: flags.interval,
      isConnectionStats: true,
      json: this.shouldOutputJson(flags),
      live: flags.live,
      startTime: flags.live ? new Date() : undefined,
      unit: flags.unit as 'day' | 'hour' | 'minute' | 'month'
    })
    
    await (flags.live ? this.runLiveStats(flags, client) : this.runOneTimeStats(flags, client));
  }

  async runLiveStats(flags: Record<string, unknown>, client: Ably.Rest): Promise<void> {
    try {
      this.logCliEvent(flags, 'stats', 'liveSubscribeStarting', 'Subscribing to live connection stats...');
      if (!this.shouldOutputJson(flags)) {
          this.log('Subscribing to live connection stats...');
      }
      
      // Setup graceful shutdown
      const cleanup = () => {
        this.logCliEvent(flags, 'stats', 'liveCleanupInitiated', 'Cleanup initiated for live stats');
        if (this.pollInterval) {
          clearInterval(this.pollInterval)
          this.pollInterval = undefined
        }

        if (!this.shouldOutputJson(flags)) {
           this.log('\nUnsubscribed from live stats');
        }
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
          this.logCliEvent(flags, 'stats', 'pollSkipped', 'Skipping poll - previous request still in progress');
          // Only show this message if debug flag is enabled
          console.log(chalk.yellow('Skipping poll - previous request still in progress'))
        }
      }, (flags.interval as number || 6) * 1000)
      
      this.logCliEvent(flags, 'stats', 'liveListening', 'Now listening for live stats updates');
      // Keep the process running
      await new Promise<void>(() => {
        // This promise is intentionally never resolved
        // The process will exit via the SIGINT/SIGTERM handlers
      })
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, 'stats', 'liveSetupError', `Error setting up live stats: ${errorMsg}`, { error: errorMsg });
      this.error(`Error setting up live stats: ${errorMsg}`)
      if (this.pollInterval) {
        clearInterval(this.pollInterval)
      }
    }
  }

  async runOneTimeStats(flags: Record<string, unknown>, client: Ably.Rest): Promise<void> {
    // Calculate time range based on the unit
    const now = new Date()
    let startTime = new Date()
    
    switch (flags.unit) {
    case 'minute': {
      startTime = new Date(now.getTime() - 60 * 60 * 1000) // 1 hour ago for minutes
    
    break;
    }

    case 'hour': {
      startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago for hours
    
    break;
    }

    case 'day': {
      startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago for days
    
    break;
    }

    default: {
      startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago for months
    }
    }

    // Prepare query parameters
    const params = {
      direction: 'backwards' as 'backwards' | 'forwards',
      end: (flags.end as number | undefined) ?? now.getTime(),
      limit: flags.limit as number,
      start: (flags.start as number | undefined) ?? startTime.getTime(),
      unit: flags.unit as 'day' | 'hour' | 'minute' | 'month',
    }
    this.logCliEvent(flags, 'stats', 'oneTimeFetchRequest', 'Fetching one-time stats with parameters', { params });

    try {
        // Get stats
        const statsPage = await client.stats(params)
        const stats = statsPage.items
        this.logCliEvent(flags, 'stats', 'oneTimeFetchResponse', `Received ${stats.length} stats records`, { count: stats.length, stats });

        if (stats.length === 0) {
            this.logCliEvent(flags, 'stats', 'noStatsAvailable', 'No connection stats available for the requested period');
            if (!this.shouldOutputJson(flags)) {
              this.log('No connection stats available.');
            }

            return
        }

        // Display stats using the StatsDisplay class
        this.statsDisplay!.display(stats[0]) // Display only the latest/first record for simplicity
        // If you need to display all records for one-time stats, you'll need to adjust StatsDisplay or loop here.
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.logCliEvent(flags, 'stats', 'oneTimeFetchError', `Failed to fetch one-time stats: ${errorMsg}`, { error: errorMsg });
        this.error(`Failed to fetch stats: ${errorMsg}`)
    }
  }

  private async fetchAndDisplayStats(flags: Record<string, unknown>, client: Ably.Rest): Promise<void> {
    try {
      // Calculate time range based on the unit
      const now = new Date()
      let startTime = new Date()
      
      switch (flags.unit) {
      case 'minute': {
        startTime = new Date(now.getTime() - 60 * 60 * 1000) // 1 hour ago for minutes
      
      break;
      }

      case 'hour': {
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000) // 24 hours ago for hours
      
      break;
      }

      case 'day': {
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) // 7 days ago for days
      
      break;
      }

      default: {
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago for months
      }
      }

      // Prepare query parameters
      const params = {
        direction: 'backwards' as 'backwards' | 'forwards',
        end: now.getTime(),
        limit: flags.live ? 1 : (flags.limit as number),
        start: startTime.getTime(),
        unit: flags.unit as 'day' | 'hour' | 'minute' | 'month',
      }
      this.logCliEvent(flags, 'stats', 'fetchRequest', 'Fetching stats with parameters', { params });

      // Get stats
      const statsPage = await client.stats(params)
      const stats = statsPage.items
      this.logCliEvent(flags, 'stats', 'fetchResponse', `Received ${stats.length} stats records`, { count: stats.length, stats });
      
      if (stats.length === 0) {
        this.logCliEvent(flags, 'stats', 'noStatsAvailable', 'No connection stats available for the requested period');
        if (!flags.live && !this.shouldOutputJson(flags)) {
           this.log('No connection stats available.');
        }

        return
      }

      // Display stats using the StatsDisplay class
      this.statsDisplay!.display(stats[0])
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, 'stats', 'fetchError', `Failed to fetch stats: ${errorMsg}`, { error: errorMsg });
      this.error(`Failed to fetch stats: ${errorMsg}`)
    }
  }

  private async pollStats(flags: Record<string, unknown>, client: Ably.Rest): Promise<void> {
    try {
      this.isPolling = true
      this.logCliEvent(flags, 'stats', 'pollStarting', 'Polling for new stats...');
      if (flags.debug) {
        console.log(chalk.dim(`[${new Date().toISOString()}] Polling for new stats...`))
      }
      
      await this.fetchAndDisplayStats(flags, client)
      this.logCliEvent(flags, 'stats', 'pollSuccess', 'Successfully polled and displayed stats');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, 'stats', 'pollError', `Error during stats polling: ${errorMsg}`, { error: errorMsg });
      if (flags.debug) {
        console.error(chalk.red(`Error during stats polling: ${errorMsg}`))
      }
    } finally {
      this.isPolling = false
    }
  }
} 