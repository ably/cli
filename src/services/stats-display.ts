import chalk from 'chalk'

export interface StatsDisplayOptions {
  live?: boolean
  startTime?: Date
  format?: 'json' | 'pretty'
  unit?: 'minute' | 'hour' | 'day' | 'month'
  isAccountStats?: boolean
}

export interface StatsDisplayData {
  intervalId?: string
  entries?: {
    [key: string]: any
  }
  unit?: string
}

export class StatsDisplay {
  private lastStats: StatsDisplayData | null = null
  private startTime: Date | undefined
  private lastUpdateTime: Date | undefined
  private cumulativeStats: {
    messages: { published: number; delivered: number; data: { published: number; delivered: number } }
    connections: { peak: number; current: number; opened: number; total: number }
    channels: { peak: number; current: number; opened: number; total: number }
    apiRequests: { succeeded: number; failed: number; refused: number; total: number }
    tokenRequests: { succeeded: number; failed: number; refused: number; total: number }
  } = {
    messages: { published: 0, delivered: 0, data: { published: 0, delivered: 0 } },
    connections: { peak: 0, current: 0, opened: 0, total: 0 },
    channels: { peak: 0, current: 0, opened: 0, total: 0 },
    apiRequests: { succeeded: 0, failed: 0, refused: 0, total: 0 },
    tokenRequests: { succeeded: 0, failed: 0, refused: 0, total: 0 }
  }

  private peakRates: {
    messages: { published: number; delivered: number }
    connections: number
    channels: number
    apiRequests: number
    tokenRequests: number
  } = {
    messages: { published: 0, delivered: 0 },
    connections: 0,
    channels: 0,
    apiRequests: 0,
    tokenRequests: 0
  }

  constructor(private options: StatsDisplayOptions = {}) {
    // Initialize start time if live mode is enabled
    if (options.live) {
      this.startTime = options.startTime || new Date()
    }
  }

  private formatNumber(num: number): string {
    return num.toLocaleString()
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

  private formatRate(rate: number): string {
    if (rate > 0 && rate < 1) {
      return rate.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    }
    return rate.toLocaleString(undefined, { maximumFractionDigits: 1 })
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

  private formatElapsedTime(): string {
    if (!this.startTime) return ''
    const elapsed = Date.now() - this.startTime.getTime()
    const seconds = Math.floor(elapsed / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  private calculateAverageRates(): { messages: { published: number; delivered: number }, connections: number, channels: number } {
    if (!this.startTime) return { messages: { published: 0, delivered: 0 }, connections: 0, channels: 0 }
    
    const elapsed = (Date.now() - this.startTime.getTime()) / 1000 // Convert to seconds
    if (elapsed <= 0) return { messages: { published: 0, delivered: 0 }, connections: 0, channels: 0 }

    return {
      messages: {
        published: this.cumulativeStats.messages.published / elapsed,
        delivered: this.cumulativeStats.messages.delivered / elapsed
      },
      connections: this.cumulativeStats.connections.opened / elapsed,
      channels: this.cumulativeStats.channels.opened / elapsed
    }
  }

  public display(stats: StatsDisplayData): void {
    if (this.options.format === 'json') {
      console.log(JSON.stringify(stats))
      return
    }

    // Skip if no valid stats or no change from last update
    if (!stats || (this.lastStats && JSON.stringify(this.lastStats) === JSON.stringify(stats))) {
      return
    }

    this.lastStats = stats
    this.updateCumulativeStats(stats)
    this.calculatePeakRates(stats)

    const entries = stats.entries || {}
    const getEntry = (key: string, defaultVal = 0) => entries[key] ?? defaultVal

    // Clear the console for live updates
    if (this.options.live) {
      process.stdout.write('\x1Bc')
    }

    // Display header
    console.log(chalk.bold('Ably Stats Dashboard'))
    if (this.options.live) {
      console.log(chalk.dim('Live updates every 6 seconds. Press Ctrl+C to exit.\n'))
    }

    // Display time information
    const now = new Date()
    console.log(chalk.cyan(`Time: ${now.toLocaleString()}`))
    if (this.startTime) {
      console.log(chalk.cyan(`Elapsed: ${this.formatElapsedTime()}`))
    }
    console.log('')

    // Display current stats
    console.log(chalk.bold('Current Stats:'))
    if (this.options.isAccountStats) {
      // For account stats, show both current values and peak rates
      console.log(chalk.blue('Messages:'), 
        `${this.formatNumber(getEntry('messages.inbound.all.messages.count'))} published, ` +
        `${this.formatNumber(getEntry('messages.outbound.all.messages.count'))} delivered ` +
        `(${this.formatRate(getEntry('peakRates.messages'))} msgs/s peak)`
      )
      console.log(chalk.yellow('Connections:'), 
        `${this.formatNumber(getEntry('connections.all.peak'))} peak, ` +
        `${this.formatNumber(getEntry('connections.all.mean'))} current ` +
        `(${this.formatRate(getEntry('peakRates.connections'))} new conns/s peak)`
      )
      console.log(chalk.green('Channels:'), 
        `${this.formatNumber(getEntry('channels.peak'))} peak, ` +
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
      // For app stats, show current period peak values
      console.log(chalk.yellow('Connections:'), `${this.formatNumber(getEntry('connections.all.peak'))} peak`)
      console.log(chalk.green('Channels:'), `${this.formatNumber(getEntry('channels.peak'))} peak`)
      console.log(chalk.blue('Messages:'), `${this.formatNumber(getEntry('messages.inbound.all.messages.count'))} published, ${this.formatNumber(getEntry('messages.outbound.all.messages.count'))} delivered`)
    }
    console.log('')

    // Display cumulative stats
    console.log(chalk.bold('Cumulative Stats:'))
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
} 