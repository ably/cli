import chalk from 'chalk'

export interface StatsDisplayOptions {
  intervalSeconds?: number
  isAccountStats?: boolean
  isConnectionStats?: boolean
  json?: boolean
  live?: boolean
  startTime?: Date
  unit?: 'day' | 'hour' | 'minute' | 'month'
}

export interface StatsDisplayData {
  accountId?: string
  appId?: string
  entries?: {
    [key: string]: any
  }
  inProgress?: string
  intervalId?: string
  schema?: string
  unit?: string
}

export class StatsDisplay {
  private cumulativeStats: {
    apiRequests: { failed: number; refused: number; succeeded: number; total: number }
    channels: { current: number; opened: number; peak: number; total: number }
    connections: { current: number; opened: number; peak: number; total: number }
    messages: { data: { delivered: number; published: number }; delivered: number; published: number }
    tokenRequests: { failed: number; refused: number; succeeded: number; total: number }
  } = {
    apiRequests: { failed: 0, refused: 0, succeeded: 0, total: 0 },
    channels: { current: 0, opened: 0, peak: 0, total: 0 },
    connections: { current: 0, opened: 0, peak: 0, total: 0 },
    messages: { data: { delivered: 0, published: 0 }, delivered: 0, published: 0 },
    tokenRequests: { failed: 0, refused: 0, succeeded: 0, total: 0 }
  }

  private lastStats: StatsDisplayData | null = null
  private lastUpdateTime: Date | undefined
  private peakRates: {
    apiRequests: number
    channels: number
    connections: number
    messages: { delivered: number; published: number }
    tokenRequests: number
  } = {
    apiRequests: 0,
    channels: 0,
    connections: 0,
    messages: { delivered: 0, published: 0 },
    tokenRequests: 0
  }

  private startTime: Date | undefined

  constructor(private options: StatsDisplayOptions = {}) {
    // Initialize start time if live mode is enabled
    if (options.live) {
      this.startTime = options.startTime || new Date()
    }
  }

  public display(stats: StatsDisplayData): void {
    if (this.options.json) {
      console.log(JSON.stringify(stats))
      return
    }

    // For no stats, just return
    if (!stats) {
      return
    }

    const entries = stats.entries || {}
    const getEntry = (key: string, defaultVal = 0) => entries[key] ?? defaultVal

    if (this.options.live) {
      // For live stats, we need to update the cumulative totals if stats have changed
      const statsChanged = !this.lastStats || JSON.stringify(this.lastStats.entries) !== JSON.stringify(stats.entries)
      
      if (statsChanged) {
        this.lastStats = stats
        this.updateCumulativeStats(stats)
        this.calculatePeakRates(stats)
      }
      
      // Always clear the console and redisplay for live updates, even if just updating the timer
      process.stdout.write('\u001Bc')
      
      if (this.options.isConnectionStats) {
        this.displayConnectionLiveStats(stats, getEntry)
      } else {
        this.displayLiveStats(stats, getEntry)
      }
    } else {
      // Skip if it's the same stats we displayed before (for historical stats only)
      if (this.lastStats && JSON.stringify(this.lastStats) === JSON.stringify(stats)) {
        return
      }
      
      // For historical stats, just display the data for this interval
      this.lastStats = stats
      this.displayHistoricalStats(stats, getEntry)
    }
  }

  private calculateAverageRates(): { channels: number, connections: number, messages: { delivered: number; published: number } } {
    if (!this.startTime) return { channels: 0, connections: 0, messages: { delivered: 0, published: 0 } }
    
    const elapsed = (Date.now() - this.startTime.getTime()) / 1000 // Convert to seconds
    if (elapsed <= 0) return { channels: 0, connections: 0, messages: { delivered: 0, published: 0 } }

    return {
      channels: this.cumulativeStats.channels.opened / elapsed,
      connections: this.cumulativeStats.connections.opened / elapsed,
      messages: {
        delivered: this.cumulativeStats.messages.delivered / elapsed,
        published: this.cumulativeStats.messages.published / elapsed
      }
    }
  }

  private calculatePeakRates(stats: StatsDisplayData): void {
    const entries = stats.entries || {}
    const getEntry = (key: string, defaultVal = 0) => entries[key] ?? defaultVal

    if (!this.lastUpdateTime) {
      this.lastUpdateTime = new Date()
      return
    }

    const now = new Date()
    const timeDiff = (now.getTime() - this.lastUpdateTime.getTime()) / 1000 // Convert to seconds
    this.lastUpdateTime = now

    if (timeDiff <= 0) return

    // Calculate rates for messages
    const publishedMessages = getEntry('messages.inbound.all.messages.count')
    const deliveredMessages = getEntry('messages.outbound.all.messages.count')
    this.peakRates.messages.published = Math.max(this.peakRates.messages.published, publishedMessages / timeDiff)
    this.peakRates.messages.delivered = Math.max(this.peakRates.messages.delivered, deliveredMessages / timeDiff)

    // Calculate rates for connections
    const connections = getEntry('connections.all.peak')
    this.peakRates.connections = Math.max(this.peakRates.connections, connections / timeDiff)

    // Calculate rates for channels
    const channels = getEntry('channels.peak')
    this.peakRates.channels = Math.max(this.peakRates.channels, channels / timeDiff)

    // Calculate rates for API requests
    const apiRequests = getEntry('apiRequests.all.succeeded') + getEntry('apiRequests.all.failed') + getEntry('apiRequests.all.refused')
    this.peakRates.apiRequests = Math.max(this.peakRates.apiRequests, apiRequests / timeDiff)

    // Calculate rates for token requests
    const tokenRequests = getEntry('apiRequests.tokenRequests.succeeded') + getEntry('apiRequests.tokenRequests.failed') + getEntry('apiRequests.tokenRequests.refused')
    this.peakRates.tokenRequests = Math.max(this.peakRates.tokenRequests, tokenRequests / timeDiff)
  }

  private calculateTimeToNextInterval(): number {
    const now = new Date()
    const nextMinute = new Date(now)
    nextMinute.setSeconds(0)
    nextMinute.setMilliseconds(0)
    nextMinute.setMinutes(nextMinute.getMinutes() + 1)
    return Math.ceil((nextMinute.getTime() - now.getTime()) / 1000)
  }

  private displayAccountHistoricalMetrics(stats: StatsDisplayData, getEntry: (key: string, defaultVal?: number) => number): void {
    // Include account-specific metrics like peak rates
    this.displayAppHistoricalMetrics(stats, getEntry)
    
    // Add peak rates section
    console.log(chalk.magenta('Peak Rates:'))
    console.log(`  Messages: ${this.formatRate(getEntry('peakRates.messages'))} msgs/s`)
    console.log(`  Connections: ${this.formatRate(getEntry('peakRates.connections'))} conns/s`)
    console.log(`  Channels: ${this.formatRate(getEntry('peakRates.channels'))} chans/s`)
    console.log(`  API Requests: ${this.formatRate(getEntry('peakRates.apiRequests'))} reqs/s`)
    console.log(`  Token Requests: ${this.formatRate(getEntry('peakRates.tokenRequests'))} tokens/s`)
  }

  private displayAppHistoricalMetrics(stats: StatsDisplayData, getEntry: (key: string, defaultVal?: number) => number): void {
    // Connections
    console.log(chalk.yellow('Connections:'), 
      `${this.formatNumber(getEntry('connections.all.peak'))} peak, ` +
      `${this.formatNumber(getEntry('connections.all.min'))} min, ` +
      `${this.formatNumber(getEntry('connections.all.mean'))} mean, ` +
      `${this.formatNumber(getEntry('connections.all.opened'))} opened, ` +
      `${this.formatNumber(getEntry('connections.all.refused'))} refused, ` +
      `${this.formatNumber(getEntry('connections.all.count'))} active`
    )
    
    // Channels
    console.log(chalk.green('Channels:'), 
      `${this.formatNumber(getEntry('channels.peak'))} peak, ` +
      `${this.formatNumber(getEntry('channels.min'))} min, ` +
      `${this.formatNumber(getEntry('channels.mean'))} mean, ` +
      `${this.formatNumber(getEntry('channels.opened'))} opened, ` +
      `${this.formatNumber(getEntry('channels.refused'))} refused, ` +
      `${this.formatNumber(getEntry('channels.count'))} active`
    )
    
    // Messages
    console.log(chalk.blue('Messages:'), 
      `${this.formatNumber(getEntry('messages.all.all.count'))} total, ` +
      `${this.formatNumber(getEntry('messages.inbound.all.messages.count'))} published, ` +
      `${this.formatNumber(getEntry('messages.outbound.all.messages.count'))} delivered, ` +
      `${this.formatBytes(getEntry('messages.all.all.data'))} data volume`
    )
    
    // API Requests
    console.log(chalk.magenta('API Requests:'), 
      `${this.formatNumber(getEntry('apiRequests.all.succeeded'))} succeeded, ` +
      `${this.formatNumber(getEntry('apiRequests.all.failed'))} failed, ` +
      `${this.formatNumber(getEntry('apiRequests.all.refused'))} refused, ` +
      `${this.formatNumber(getEntry('apiRequests.all.succeeded') + getEntry('apiRequests.all.failed') + getEntry('apiRequests.all.refused'))} total`
    )
    
    // Token Requests
    console.log(chalk.cyan('Token Requests:'), 
      `${this.formatNumber(getEntry('apiRequests.tokenRequests.succeeded'))} succeeded, ` +
      `${this.formatNumber(getEntry('apiRequests.tokenRequests.failed'))} failed, ` +
      `${this.formatNumber(getEntry('apiRequests.tokenRequests.refused'))} refused`
    )
  }

  private displayConnectionCumulativeStats(): void {
    const avgRates = this.calculateAverageRates()
    
    // Connections stats - simplified
    console.log(chalk.yellow('Connections:'), 
      `${this.formatNumber(this.cumulativeStats.connections.peak)} peak`
    )
    
    // Channels stats - simplified
    console.log(chalk.green('Channels:'), 
      `${this.formatNumber(this.cumulativeStats.channels.peak)} peak`
    )
    
    // Messages stats - simplified
    console.log(chalk.blue('Messages:'), 
      `${this.formatNumber(this.cumulativeStats.messages.published)} published, ` +
      `${this.formatNumber(this.cumulativeStats.messages.delivered)} delivered`
    )
  }

  private displayConnectionLiveStats(stats: StatsDisplayData, getEntry: (key: string, defaultVal?: number) => number): void {
    // Display header
    console.log(chalk.bold('Ably Connection Stats Dashboard - Live Updates'))
    console.log(chalk.dim(`Polling every ${this.options.intervalSeconds || 6} seconds. Press Ctrl+C to exit.\n`))

    // Get current minute interval and seconds to next interval
    const now = new Date()
    const secondsToNextMinute = this.calculateTimeToNextInterval()
    
    // Display time information in a single, clear line
    const currentUtcTime = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    const currentLocalTime = now.toLocaleString()
    console.log(chalk.cyan(`Current time: ${currentUtcTime} (local: ${currentLocalTime})`))
    console.log(chalk.cyan(`Stats interval resets in: ${secondsToNextMinute} seconds`))
    
    if (this.startTime) {
      console.log(chalk.cyan(`Monitoring since: ${this.startTime.toLocaleString()} (${this.formatElapsedTime()})`))
    }

    console.log('')

    // Connection stats - simplified version with just the essential metrics
    console.log(chalk.bold('Current Minute Stats:'))
    
    // Connections - simplified
    console.log(chalk.yellow('Connections:'), 
      `${this.formatNumber(getEntry('connections.all.peak'))} peak, ` +
      `${this.formatNumber(getEntry('connections.all.mean'))} current`
    )
    
    // Channels - simplified
    console.log(chalk.green('Channels:'), 
      `${this.formatNumber(getEntry('channels.peak'))} peak`
    )
    
    // Messages - simplified
    console.log(chalk.blue('Messages:'), 
      `${this.formatNumber(getEntry('messages.inbound.all.messages.count'))} published, ` +
      `${this.formatNumber(getEntry('messages.outbound.all.messages.count'))} delivered`
    )
    
    console.log('')

    // Display simplified cumulative stats
    console.log(chalk.bold('Cumulative Stats (since monitoring started):'))
    this.displayConnectionCumulativeStats()
  }

  private displayCumulativeStats(): void {
    const avgRates = this.calculateAverageRates()
    
    // Connections stats
    console.log(chalk.yellow('Connections:'), 
      `${this.formatNumber(this.cumulativeStats.connections.peak)} peak, ` +
      `${this.formatNumber(this.cumulativeStats.connections.opened)} opened (${this.formatRate(avgRates.connections)} new conns/s avg)`
    )
    
    // Channels stats
    console.log(chalk.green('Channels:'), 
      `${this.formatNumber(this.cumulativeStats.channels.peak)} peak, ` +
      `${this.formatNumber(this.cumulativeStats.channels.opened)} opened (${this.formatRate(avgRates.channels)} new chans/s avg)`
    )
    
    // Messages stats
    console.log(chalk.blue('Messages:'), 
      `${this.formatNumber(this.cumulativeStats.messages.published)} published (${this.formatBytes(this.cumulativeStats.messages.data.published)}, ${this.formatRate(avgRates.messages.published)} msgs/s avg), ` +
      `${this.formatNumber(this.cumulativeStats.messages.delivered)} delivered (${this.formatBytes(this.cumulativeStats.messages.data.delivered)}, ${this.formatRate(avgRates.messages.delivered)} msgs/s avg)`
    )
    
    // API Requests stats with success rate
    const apiSuccessRate = this.cumulativeStats.apiRequests.total > 0 
      ? (this.cumulativeStats.apiRequests.succeeded / this.cumulativeStats.apiRequests.total * 100).toFixed(1)
      : '0.0'
    console.log(chalk.magenta('API Requests:'), 
      `${this.formatNumber(this.cumulativeStats.apiRequests.succeeded)} succeeded, ` +
      `${this.formatNumber(this.cumulativeStats.apiRequests.failed)} failed, ` +
      `${this.formatNumber(this.cumulativeStats.apiRequests.refused)} refused, ` +
      `${this.formatNumber(this.cumulativeStats.apiRequests.total)} total, ` +
      `${apiSuccessRate}% success rate`
    )
    
    // Token Requests stats with success rate
    const tokenSuccessRate = this.cumulativeStats.tokenRequests.total > 0 
      ? (this.cumulativeStats.tokenRequests.succeeded / this.cumulativeStats.tokenRequests.total * 100).toFixed(1)
      : '0.0'
    console.log(chalk.cyan('Token Requests:'), 
      `${this.formatNumber(this.cumulativeStats.tokenRequests.succeeded)} succeeded, ` +
      `${this.formatNumber(this.cumulativeStats.tokenRequests.failed)} failed, ` +
      `${this.formatNumber(this.cumulativeStats.tokenRequests.refused)} refused, ` +
      `${this.formatNumber(this.cumulativeStats.tokenRequests.total)} total, ` +
      `${tokenSuccessRate}% success rate`
    )
  }

  private displayHistoricalStats(stats: StatsDisplayData, getEntry: (key: string, defaultVal?: number) => number): void {
    const unit = stats.unit || this.options.unit || 'minute'
    const intervalInfo = stats.intervalId ? this.parseIntervalId(stats.intervalId, unit) : { period: 'Unknown period', start: new Date() }
    
    console.log(chalk.bold(`Stats for ${intervalInfo.period}`))
    
    if (this.options.isAccountStats) {
      // Account-specific metrics
      this.displayAccountHistoricalMetrics(stats, getEntry)
    } else {
      // App-specific metrics
      this.displayAppHistoricalMetrics(stats, getEntry)
    }
    
    console.log('') // Empty line between intervals
  }

  private displayLiveStats(stats: StatsDisplayData, getEntry: (key: string, defaultVal?: number) => number): void {
    // Display header
    console.log(chalk.bold('Ably Stats Dashboard - Live Updates'))
    console.log(chalk.dim(`Polling every ${this.options.intervalSeconds || 6} seconds. Press Ctrl+C to exit.\n`))

    // Get current minute interval and seconds to next interval
    const now = new Date()
    const secondsToNextMinute = this.calculateTimeToNextInterval()
    
    // Display time information in a single, clear line
    const currentUtcTime = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    const currentLocalTime = now.toLocaleString()
    console.log(chalk.cyan(`Current time: ${currentUtcTime} (local: ${currentLocalTime})`))
    console.log(chalk.cyan(`Stats interval resets in: ${secondsToNextMinute} seconds`))
    
    if (this.startTime) {
      console.log(chalk.cyan(`Monitoring since: ${this.startTime.toLocaleString()} (${this.formatElapsedTime()})`))
    }

    console.log('')

    // Display current stats (for the current minute interval)
    console.log(chalk.bold('Current Minute Stats:'))
    if (this.options.isAccountStats) {
      // Account-specific metrics for live view (including peak rates)
      console.log(chalk.blue('Messages:'), 
        `${this.formatNumber(getEntry('messages.inbound.all.messages.count'))} published, ` +
        `${this.formatNumber(getEntry('messages.outbound.all.messages.count'))} delivered ` +
        `(${this.formatRate(getEntry('peakRates.messages'))} msgs/s peak)`
      )
      console.log(chalk.yellow('Connections:'), 
        `${this.formatNumber(getEntry('connections.all.peak'))} peak, ` +
        `${this.formatNumber(getEntry('connections.all.min'))} min, ` +
        `${this.formatNumber(getEntry('connections.all.mean'))} current, ` +
        `${this.formatNumber(getEntry('connections.all.opened'))} opened ` +
        `(${this.formatRate(getEntry('peakRates.connections'))} new conns/s peak)`
      )
      console.log(chalk.green('Channels:'), 
        `${this.formatNumber(getEntry('channels.peak'))} peak, ` +
        `${this.formatNumber(getEntry('channels.min'))} min, ` +
        `${this.formatNumber(getEntry('channels.mean'))} current ` +
        `(${this.formatRate(getEntry('peakRates.channels'))} new chans/s peak)`
      )
      console.log(chalk.magenta('API Requests:'), 
        `${this.formatNumber(getEntry('apiRequests.all.succeeded'))} succeeded, ` +
        `${this.formatNumber(getEntry('apiRequests.all.failed'))} failed, ` +
        `${this.formatNumber(getEntry('apiRequests.all.refused'))} refused ` +
        `(${this.formatRate(getEntry('peakRates.apiRequests'))} reqs/s peak)`
      )
      console.log(chalk.cyan('Token Requests:'), 
        `${this.formatNumber(getEntry('apiRequests.tokenRequests.succeeded'))} succeeded, ` +
        `${this.formatNumber(getEntry('apiRequests.tokenRequests.failed'))} failed, ` +
        `${this.formatNumber(getEntry('apiRequests.tokenRequests.refused'))} refused ` +
        `(${this.formatRate(getEntry('peakRates.tokenRequests'))} tokens/s peak)`
      )
    } else {
      // App-specific metrics for live view (more detailed, like account stats but without peak rates)
      console.log(chalk.yellow('Connections:'), 
        `${this.formatNumber(getEntry('connections.all.peak'))} peak, ` + 
        `${this.formatNumber(getEntry('connections.all.min'))} min, ` +
        `${this.formatNumber(getEntry('connections.all.mean'))} mean, ` +
        `${this.formatNumber(getEntry('connections.all.opened'))} opened, ` +
        `${this.formatNumber(getEntry('connections.all.refused'))} refused`
      )
      console.log(chalk.green('Channels:'), 
        `${this.formatNumber(getEntry('channels.peak'))} peak, ` +
        `${this.formatNumber(getEntry('channels.min'))} min, ` +
        `${this.formatNumber(getEntry('channels.mean'))} mean, ` +
        `${this.formatNumber(getEntry('channels.opened'))} opened`
      )
      console.log(chalk.blue('Messages:'), 
        `${this.formatNumber(getEntry('messages.all.all.count'))} total, ` +
        `${this.formatNumber(getEntry('messages.inbound.all.messages.count'))} published, ` +
        `${this.formatNumber(getEntry('messages.outbound.all.messages.count'))} delivered, ` +
        `${this.formatBytes(getEntry('messages.all.all.data'))} data volume`
      )
      console.log(chalk.magenta('API Requests:'), 
        `${this.formatNumber(getEntry('apiRequests.all.succeeded'))} succeeded, ` +
        `${this.formatNumber(getEntry('apiRequests.all.failed'))} failed, ` +
        `${this.formatNumber(getEntry('apiRequests.all.refused'))} refused, ` +
        `${this.formatNumber(getEntry('apiRequests.all.succeeded') + getEntry('apiRequests.all.failed') + getEntry('apiRequests.all.refused'))} total`
      )
      console.log(chalk.cyan('Token Requests:'), 
        `${this.formatNumber(getEntry('apiRequests.tokenRequests.succeeded'))} succeeded, ` +
        `${this.formatNumber(getEntry('apiRequests.tokenRequests.failed'))} failed, ` +
        `${this.formatNumber(getEntry('apiRequests.tokenRequests.refused'))} refused`
      )
    }

    console.log('')

    // Display cumulative stats (since live monitoring started)
    console.log(chalk.bold('Cumulative Stats (since monitoring started):'))
    this.displayCumulativeStats()
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = bytes
    let unitIndex = 0

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`
  }

  private formatElapsedTime(): string {
    if (!this.startTime) return ''
    const elapsed = Date.now() - this.startTime.getTime()
    const seconds = Math.floor(elapsed / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    }

 if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    }
 
      return `${seconds}s`
    
  }

  private formatNumber(num: number): string {
    return num.toLocaleString()
  }

  private formatRate(rate: number): string {
    if (rate > 0 && rate < 1) {
      return rate.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })
    }

    return rate.toLocaleString(undefined, { maximumFractionDigits: 1 })
  }

  private parseIntervalId(intervalId: string, unit: string): { period: string, start: Date } {
    // Parse intervalId which is in format yyyy-mm-dd:hh:mm for minute or yyyy-mm-dd:hh for hour, etc.
    let date: Date
    let period: string
    
    try {
      switch (unit) {
      case 'minute': {
        // Format: yyyy-mm-dd:hh:mm
        const parts = intervalId.split(':')
        if (parts.length >= 3) {
          const [year, month, day] = parts[0].split('-').map(Number)
          const hour = Number.parseInt(parts[1])
          const minute = Number.parseInt(parts[2])
          date = new Date(Date.UTC(year, month - 1, day, hour, minute))
          
          const utcTime = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} UTC`
          const localTime = date.toLocaleString()
          period = `${utcTime} (local: ${localTime}) - 1 minute interval`
        } else {
          // Try alternative format with colon separator: yyyy-mm-dd:hh:mm
          const match = intervalId.match(/^(\d{4})-(\d{2})-(\d{2}):(\d{2}):(\d{2})$/)
          if (match) {
            const [_, year, month, day, hour, minute] = match.map(Number)
            date = new Date(Date.UTC(year, month - 1, day, hour, minute))
            
            const utcTime = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} UTC`
            const localTime = date.toLocaleString()
            period = `${utcTime} (local: ${localTime}) - 1 minute interval`
          } else {
            throw new Error('Invalid minute format')
          }
        }
      
      break;
      }

      case 'hour': {
        // Format: yyyy-mm-dd:hh
        const match = intervalId.match(/^(\d{4})-(\d{2})-(\d{2}):(\d{2})$/)
        if (match) {
          const [_, year, month, day, hour] = match.map(Number)
          date = new Date(Date.UTC(year, month - 1, day, hour))
          
          const utcTime = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:00 UTC`
          const localTime = date.toLocaleString([], { day: 'numeric', hour: '2-digit', month: 'numeric', year: 'numeric' })
          period = `${utcTime} (local: ${localTime}) - 1 hour interval`
        } else {
          throw new Error('Invalid hour format')
        }
      
      break;
      }

      case 'day': {
        // Format: yyyy-mm-dd or yyyy-mm-dd:00
        let match = intervalId.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        if (!match) {
          // Try with hour component (e.g., 2025-04-11:00)
          match = intervalId.match(/^(\d{4})-(\d{2})-(\d{2}):(\d{2})$/)
        }
        
        if (match) {
          const [_, year, month, day] = match.map(Number)
          date = new Date(Date.UTC(year, month - 1, day))
          
          const utcTime = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} UTC`
          const localTime = date.toLocaleString([], { day: 'numeric', month: 'numeric', year: 'numeric' })
          period = `${utcTime} (local: ${localTime}) - 1 day interval`
        } else {
          throw new Error('Invalid day format')
        }
      
      break;
      }

      case 'month': {
        // Format: yyyy-mm or yyyy-mm-dd:00 where dd is always 01
        let match = intervalId.match(/^(\d{4})-(\d{2})$/)
        if (!match) {
          // Try with day and hour component (e.g., 2025-04-01:00)
          match = intervalId.match(/^(\d{4})-(\d{2})-\d{2}:(\d{2})$/)
        }
        
        if (match) {
          const year = Number.parseInt(match[1])
          const month = Number.parseInt(match[2])
          date = new Date(Date.UTC(year, month - 1, 1))
          
          const utcTime = `${year}-${month.toString().padStart(2, '0')} UTC`
          const localTime = date.toLocaleString([], { month: 'long', year: 'numeric' })
          period = `${utcTime} (local: ${localTime}) - 1 month interval`
        } else {
          throw new Error('Invalid month format')
        }
      
      break;
      }

      default: {
        throw new Error('Unknown unit format')
      }
      }
    } catch {
      // If parsing fails, use a more direct approach
      console.log(chalk.yellow(`Note: Could not parse intervalId '${intervalId}' with unit '${unit}'. Using original format.`))
      date = new Date()
      
      // Format based on the unit
      const utcNote = chalk.cyan('UTC')
      switch (unit) {
      case 'minute': {
        period = `${intervalId} ${utcNote} - 1 minute interval`
      
      break;
      }

      case 'hour': {
        period = `${intervalId} ${utcNote} - 1 hour interval`
      
      break;
      }

      case 'day': {
        period = `${intervalId} ${utcNote} - 1 day interval`
      
      break;
      }

      case 'month': {
        period = `${intervalId} ${utcNote} - 1 month interval`
      
      break;
      }

      default: {
        period = `${intervalId} - Unknown interval format`
      }
      }
    }
    
    return { period, start: date }
  }

  private updateCumulativeStats(stats: StatsDisplayData): void {
    const entries = stats.entries || {}
    
    // Helper function to safely get entry values
    const getEntry = (key: string, defaultVal = 0) => entries[key] ?? defaultVal

    // Update cumulative stats
    this.cumulativeStats.messages.published += getEntry('messages.inbound.all.messages.count')
    this.cumulativeStats.messages.delivered += getEntry('messages.outbound.all.messages.count')
    this.cumulativeStats.messages.data.published += getEntry('messages.inbound.all.messages.data')
    this.cumulativeStats.messages.data.delivered += getEntry('messages.outbound.all.messages.data')
    
    this.cumulativeStats.connections.peak = Math.max(this.cumulativeStats.connections.peak, getEntry('connections.all.peak'))
    this.cumulativeStats.connections.current = Math.round(getEntry('connections.all.mean'))
    this.cumulativeStats.connections.opened += getEntry('connections.all.opened')
    this.cumulativeStats.connections.total += getEntry('connections.all.count')
    
    this.cumulativeStats.channels.peak = Math.max(this.cumulativeStats.channels.peak, getEntry('channels.peak'))
    this.cumulativeStats.channels.current = Math.round(getEntry('channels.mean'))
    this.cumulativeStats.channels.opened += getEntry('channels.opened')
    this.cumulativeStats.channels.total += getEntry('channels.count')
    
    this.cumulativeStats.apiRequests.succeeded += getEntry('apiRequests.all.succeeded')
    this.cumulativeStats.apiRequests.failed += getEntry('apiRequests.all.failed')
    this.cumulativeStats.apiRequests.refused += getEntry('apiRequests.all.refused')
    this.cumulativeStats.apiRequests.total += getEntry('apiRequests.all.succeeded') + getEntry('apiRequests.all.failed') + getEntry('apiRequests.all.refused')
    
    this.cumulativeStats.tokenRequests.succeeded += getEntry('apiRequests.tokenRequests.succeeded')
    this.cumulativeStats.tokenRequests.failed += getEntry('apiRequests.tokenRequests.failed')
    this.cumulativeStats.tokenRequests.refused += getEntry('apiRequests.tokenRequests.refused')
    this.cumulativeStats.tokenRequests.total += getEntry('apiRequests.tokenRequests.succeeded') + getEntry('apiRequests.tokenRequests.failed') + getEntry('apiRequests.tokenRequests.refused')
  }
} 