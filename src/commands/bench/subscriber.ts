import {Args, Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'
import Table from 'cli-table3'

interface TestMetrics {
  messagesReceived: number
  totalLatency: number
  endToEndLatencies: number[] // Publisher -> Subscriber
  testStartTime: number
  testId: string | null
  testDetails: any
  publisherActive: boolean
  lastMessageTime: number
}

export default class BenchSubscriber extends AblyBaseCommand {
  static override description = 'Run a subscriber benchmark test'

  static override examples = [
    '$ ably bench subscriber my-channel',
    '$ ably bench subscriber --transport realtime my-channel',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    transport: Flags.string({
      char: 't',
      description: 'Transport to use for subscribing',
      options: ['rest', 'realtime'],
      default: 'realtime',
    }),
  }

  static override args = {
    channel: Args.string({
      description: 'The channel name to subscribe to',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BenchSubscriber)
    
    // Create Ably client
    const realtime = await this.createAblyClient(flags)
    
    if (!realtime) {
      this.error('Failed to create Ably client. Please check your API key and try again.')
      return
    }

    try {
      // Initialize metrics
      const metrics: TestMetrics = {
        messagesReceived: 0,
        totalLatency: 0,
        endToEndLatencies: [],
        testStartTime: 0,
        testId: null,
        testDetails: null,
        publisherActive: false,
        lastMessageTime: 0
      }

      const channel = realtime.channels.get(args.channel, { params: { rewind: '1' } })
      
      // Enter presence as a subscriber
      await channel.presence.enter({ role: 'subscriber' })
      this.log(`Entered presence as subscriber on channel: ${args.channel}`)
      
      // Display waiting message
      this.log('\nWaiting for a benchmark test to start...')
      
      // Create display for updating status
      let display: Table.Table | null = null
      let updateInterval: NodeJS.Timeout | null = null
      let checkPublisherInterval: NodeJS.Timeout | null = null
      let testInProgress = false
      
      // Subscribe to benchmark messages
      channel.subscribe('benchmark', (message: Ably.Message) => {
        // Check if message is valid benchmark message
        if (!message.data || typeof message.data !== 'object' || !('timestamp' in message.data) || !('testId' in message.data)) {
          return
        }
        
        const now = Date.now()
        const publishTime = message.data.timestamp as number
        const testId = message.data.testId as string
        
        // If this is a new test
        if (metrics.testId !== testId) {
          // If we were already tracking a test, show final results
          if (testInProgress) {
            this.finishTest(metrics)
          }
          
          // Reset metrics for new test
          metrics.messagesReceived = 0
          metrics.totalLatency = 0
          metrics.endToEndLatencies = []
          metrics.testId = testId
          metrics.testStartTime = now
          metrics.publisherActive = true
          metrics.lastMessageTime = now
          testInProgress = true
          
          // Set up progress display updates
          if (updateInterval) {
            clearInterval(updateInterval)
          }
          
          display = this.createStatusDisplay(testId)
          updateInterval = setInterval(() => {
            this.updateStatus(display, metrics)
          }, 500)
          
          // Setup publisher activity check
          if (checkPublisherInterval) {
            clearInterval(checkPublisherInterval)
          }
          
          checkPublisherInterval = setInterval(() => {
            const publisherInactiveTime = Date.now() - metrics.lastMessageTime
            // If no message received for 5 seconds, consider publisher inactive
            if (publisherInactiveTime > 5000 && metrics.publisherActive) {
              metrics.publisherActive = false
              this.log(`\nPublisher seems to be inactive (no messages for ${(publisherInactiveTime / 1000).toFixed(1)} seconds)`)
              this.finishTest(metrics)
              testInProgress = false
              
              if (updateInterval) {
                clearInterval(updateInterval)
                updateInterval = null
              }
              
              if (checkPublisherInterval) {
                clearInterval(checkPublisherInterval)
                checkPublisherInterval = null
              }
              
              display = this.createStatusDisplay(null)
              this.log('\nWaiting for a new benchmark test to start...')
            }
          }, 1000)
          
          this.log(`\nNew benchmark test detected with ID: ${testId}`)
        }
        
        // Update last message time to track publisher activity
        metrics.lastMessageTime = now
        metrics.publisherActive = true
        
        // Calculate end-to-end latency
        const endToEndLatency = now - publishTime
        
        // Update metrics
        metrics.messagesReceived++
        metrics.endToEndLatencies.push(endToEndLatency)
      })
      
      // Subscribe to presence to detect test parameters
      channel.presence.subscribe('enter', (member: Ably.PresenceMessage) => {
        const data = member.data
        
        // Check if this is a publisher entering with test details
        if (data && typeof data === 'object' && 'role' in data && data.role === 'publisher' && 'testDetails' in data) {
          const testDetails = data.testDetails
          const testId = data.testId as string
          
          metrics.testDetails = testDetails
          metrics.publisherActive = true
          metrics.lastMessageTime = Date.now()
          
          this.log(`\nPublisher detected with test ID: ${testId}`)
          this.log(`Test will send ${testDetails.messageCount} messages at ${testDetails.messageRate} msg/sec using ${testDetails.transport} transport`)
        }
      })
      
      // Also check if a publisher is already present
      const members = await channel.presence.get()
      const publishers = members.filter(m => 
        m.data && typeof m.data === 'object' && 'role' in m.data && m.data.role === 'publisher'
      )
      
      if (publishers.length > 0) {
        this.log(`Found ${publishers.length} publisher(s) already present`)
        
        for (const publisher of publishers) {
          if (publisher.data && typeof publisher.data === 'object' && 'testDetails' in publisher.data) {
            metrics.testDetails = publisher.data.testDetails
            metrics.testId = publisher.data.testId as string
            metrics.publisherActive = true
            metrics.lastMessageTime = Date.now()
            
            this.log(`Active test ID: ${metrics.testId}`)
            this.log(`Test will send ${metrics.testDetails.messageCount} messages at ${metrics.testDetails.messageRate} msg/sec using ${metrics.testDetails.transport} transport`)
          }
        }
      }
      
      // Keep the CLI running until manually terminated
      this.log('\nSubscriber is ready. Waiting for messages...')
      this.log('Press Ctrl+C to exit.')
      
      // Listen for presence leave events to detect when publisher leaves
      channel.presence.subscribe('leave', (member: Ably.PresenceMessage) => {
        if (member.data && typeof member.data === 'object' && 'role' in member.data && member.data.role === 'publisher' && 
            'testId' in member.data && member.data.testId === metrics.testId) {
          if (testInProgress) {
            this.log(`\nPublisher with test ID ${metrics.testId} has left.`)
            metrics.publisherActive = false
            this.finishTest(metrics)
            testInProgress = false
            
            if (updateInterval) {
              clearInterval(updateInterval)
              updateInterval = null
            }
            
            if (checkPublisherInterval) {
              clearInterval(checkPublisherInterval)
              checkPublisherInterval = null
            }
            
            display = this.createStatusDisplay(null)
            this.log('\nWaiting for a new benchmark test to start...')
          }
        }
      })
      
      // Keep the connection open
      await new Promise(() => {
        // This promise is intentionally never resolved to keep the process running
        // until the user terminates it with Ctrl+C
      })
      
    } catch (error) {
      this.error(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      realtime.close()
    }
  }
  
  private finishTest(metrics: TestMetrics): void {
    if (!metrics.testId) return
    
    this.log('\n' + chalk.green('Benchmark Results') + '\n')
    
    // Create a summary table
    const summaryTable = new Table({
      head: [chalk.white('Metric'), chalk.white('Value')],
      style: {
        head: [], // No additional styles for the header
        border: [] // No additional styles for the border
      }
    })
    
    summaryTable.push(
      ['Test ID', metrics.testId],
      ['Messages received', metrics.messagesReceived.toString()],
      ['Test duration', `${((Date.now() - metrics.testStartTime) / 1000).toFixed(2)} seconds`],
    )
    
    this.log(summaryTable.toString())
    
    if (metrics.endToEndLatencies.length === 0) {
      this.log('\nNo messages received during the test.')
      return
    }
    
    // Calculate statistics
    metrics.endToEndLatencies.sort((a, b) => a - b)
    
    const avgEndToEndLatency = metrics.endToEndLatencies.reduce((sum, l) => sum + l, 0) / metrics.endToEndLatencies.length
    
    const e2eP50 = metrics.endToEndLatencies[Math.floor(metrics.endToEndLatencies.length * 0.5)] || 0
    const e2eP90 = metrics.endToEndLatencies[Math.floor(metrics.endToEndLatencies.length * 0.9)] || 0
    const e2eP95 = metrics.endToEndLatencies[Math.floor(metrics.endToEndLatencies.length * 0.95)] || 0
    const e2eP99 = metrics.endToEndLatencies[Math.floor(metrics.endToEndLatencies.length * 0.99)] || 0
    
    // Create a latency table
    const latencyTable = new Table({
      head: [chalk.white('Latency Metric'), chalk.white('Value (ms)')],
      style: {
        head: [], // No additional styles for the header
        border: [] // No additional styles for the border
      }
    })
    
    latencyTable.push(
      ['End-to-End Average', avgEndToEndLatency.toFixed(2)],
      ['End-to-End P50', e2eP50.toFixed(2)],
      ['End-to-End P90', e2eP90.toFixed(2)],
      ['End-to-End P95', e2eP95.toFixed(2)],
      ['End-to-End P99', e2eP99.toFixed(2)]
    )
    
    this.log('\nLatency Measurements:')
    this.log('(Time from message creation on publisher to receipt by subscriber)')
    this.log(latencyTable.toString())
  }
  
  private createStatusDisplay(testId: string | null): Table.Table {
    let table: Table.Table
    
    if (!testId) {
      table = new Table({
        style: {
          border: [] // No additional styles for the border
        }
      })
      table.push([chalk.yellow('Waiting for benchmark test to start...')])
      return table
    }
    
    table = new Table({
      head: [chalk.white('Benchmark Test'), chalk.white(testId)],
      style: {
        head: [], // No additional styles for the header
        border: [] // No additional styles for the border
      }
    })
    
    table.push(
      ['Messages received', '0'],
      ['Average latency', '0 ms']
    )
    
    return table
  }
  
  private updateStatus(display: Table.Table | null, metrics: TestMetrics): void {
    if (!display || !metrics.testId) {
      return
    }
    
    // Calculate average latency from most recent messages
    const recentCount = Math.min(metrics.messagesReceived, 50)
    const recentLatencies = metrics.endToEndLatencies.slice(-recentCount)
    
    const avgLatency = recentLatencies.length > 0 
      ? recentLatencies.reduce((sum, l) => sum + l, 0) / recentLatencies.length 
      : 0
    
    // Create a new table with updated values
    let newTable: Table.Table
    
    if (display.length > 0) {
      // Check if this is a waiting display
      const firstRow = display[0] as string[] | undefined
      if (firstRow && firstRow[0] === 'Waiting for benchmark test to start...') {
        // This is the waiting display, create a new proper table
        newTable = new Table({
          head: [chalk.white('Benchmark Test'), chalk.white(metrics.testId || '')],
          style: {
            head: [], // No additional styles for the header
            border: [] // No additional styles for the border
          }
        })
      } else {
        // Use the same table format
        newTable = new Table({
          head: [chalk.white('Benchmark Test'), chalk.white(metrics.testId || '')],
          style: {
            head: [], // No additional styles for the header
            border: [] // No additional styles for the border
          }
        })
      }
    } else {
      // Create a default table
      newTable = new Table({
        head: [chalk.white('Benchmark Test'), chalk.white(metrics.testId || '')],
        style: {
          head: [], // No additional styles for the header
          border: [] // No additional styles for the border
        }
      })
    }
    
    newTable.push(
      ['Messages received', metrics.messagesReceived.toString()],
      ['Average latency', `${avgLatency.toFixed(1)} ms`]
    )
    
    // Clear console and redraw
    process.stdout.write('\x1B[2J\x1B[0f')
    this.log(newTable.toString())
  }
} 