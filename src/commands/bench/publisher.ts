import {Args, Flags} from '@oclif/core'
import {AblyBaseCommand} from '../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'
import Table from 'cli-table3'

interface TestMetrics {
  messagesSent: number
  messagesEchoed: number
  errors: number
  startTime: number
  lastBatchTime: number
  batchCount: number
  batchSize: number
  requestLatencies: number[] // Time for publish request to complete
  echoLatencies: number[] // Time for message to be published and received back
}

interface MessageTracking {
  [msgId: string]: {
    publishTime: number
    requestCompleteTime?: number
  }
}

export default class BenchPublisher extends AblyBaseCommand {
  static override description = 'Run a publisher benchmark test'

  static override examples = [
    '$ ably bench publisher my-channel',
    '$ ably bench publisher --messages 5000 --rate 10 my-channel',
    '$ ably bench publisher --transport realtime my-channel',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    messages: Flags.integer({
      char: 'm',
      description: 'Number of messages to publish (max 10,000)',
      default: 1000,
    }),
    rate: Flags.integer({
      char: 'r',
      description: 'Messages per second to publish (max 20)',
      default: 15,
    }),
    transport: Flags.string({
      char: 't',
      description: 'Transport to use for publishing',
      options: ['rest', 'realtime'],
      default: 'realtime',
    }),
    'wait-for-subscribers': Flags.boolean({
      description: 'Wait for subscribers to be present before starting',
      default: false,
    }),
    'message-size': Flags.integer({
      description: 'Size of the message payload in bytes',
      default: 100,
    }),
  }

  static override args = {
    channel: Args.string({
      description: 'The channel name to publish to',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BenchPublisher)
    
    // Validate max values
    const messageCount = Math.min(flags.messages, 10000)
    const messageRate = Math.min(flags.rate, 20)
    const messageSize = Math.max(flags['message-size'], 10)
    
    // Create Ably client
    const realtime = await this.createAblyClient(flags)
    
    if (!realtime) {
      this.error('Failed to create Ably client. Please check your API key and try again.')
      return
    }

    try {
      const channel = realtime.channels.get(args.channel, { params: { rewind: '1' } })
      
      // Create a message tracking object to measure echo latency
      const messageTracking: MessageTracking = {}
      
      // Set up message subscription for echo latency measurement
      channel.subscribe('benchmark', (message: Ably.Message) => {
        if (!message.data || typeof message.data !== 'object' || !('msgId' in message.data)) {
          return // Not our benchmark message
        }
        
        const msgId = message.data.msgId as string
        const tracker = messageTracking[msgId]
        
        if (tracker && tracker.publishTime) {
          // Calculate echo latency
          const echoLatency = Date.now() - tracker.publishTime
          metrics.echoLatencies.push(echoLatency)
          metrics.messagesEchoed++
          
          // Remove from tracking once processed
          delete messageTracking[msgId]
        }
      })
      
      // Enter presence as a publisher with test details
      const testId = `test-${Date.now()}`
      const presenceData = {
        role: 'publisher',
        testId,
        testDetails: {
          messageCount,
          messageRate,
          transport: flags.transport,
          messageSize,
          startTime: Date.now(),
        },
      }
      
      await channel.presence.enter(presenceData)
      this.log(`Entered presence as publisher with test ID: ${testId}`)
      
      // Check for subscribers if flag is set
      if (flags['wait-for-subscribers']) {
        this.log('Checking for subscribers...')
        
        // Subscribe to presence
        await new Promise<void>((resolve) => {
          channel.presence.subscribe('enter', (member: Ably.PresenceMessage) => {
            if (member.data && typeof member.data === 'object' && 'role' in member.data && member.data.role === 'subscriber') {
              this.log(`Subscriber detected: ${member.clientId}`)
              resolve()
            }
          })
          
          // Check if subscribers are already present
          channel.presence.get().then((members) => {
            const subscribers = members.filter(m => 
              m.data && typeof m.data === 'object' && 'role' in m.data && m.data.role === 'subscriber'
            )
            if (subscribers.length > 0) {
              this.log(`Found ${subscribers.length} subscribers already present`)
              resolve()
            } else {
              this.log('No subscribers found. Waiting for subscribers to join...')
            }
          })
        })
      } else {
        // Check if any subscribers are present and notify the user
        const members = await channel.presence.get()
        const subscribers = members.filter(m => 
          m.data && typeof m.data === 'object' && 'role' in m.data && m.data.role === 'subscriber'
        )
        
        if (subscribers.length === 0) {
          const shouldContinue = await this.interactiveHelper.confirm(
            'No subscribers found. Continue anyway?'
          )
          
          if (!shouldContinue) {
            this.log('Benchmark test cancelled.')
            await channel.presence.leave()
            realtime.close()
            return
          }
        } else {
          this.log(`Found ${subscribers.length} subscribers present`)
        }
      }
      
      // Initialize metrics
      const metrics: TestMetrics = {
        messagesSent: 0,
        messagesEchoed: 0,
        errors: 0,
        startTime: Date.now(),
        lastBatchTime: Date.now(),
        batchCount: 0,
        batchSize: Math.ceil(messageRate / 2), // Update metrics twice per second
        requestLatencies: [],
        echoLatencies: []
      }
      
      // Create payload with specified size
      const createPayload = (index: number, size: number) => {
        const timestamp = Date.now()
        const msgId = `${testId}-${index}`
        
        // Track this message for echo latency measurement
        messageTracking[msgId] = {
          publishTime: timestamp
        }
        
        const basePayload = {
          index,
          timestamp,
          testId,
          msgId
        }
        
        // Add padding to reach desired size
        const basePayloadString = JSON.stringify(basePayload)
        const paddingSize = Math.max(0, size - basePayloadString.length - 2) // -2 for quotes around padding
        const padding = paddingSize > 0 ? 'a'.repeat(paddingSize) : ''
        
        return {
          ...basePayload,
          padding,
        }
      }
      
      // Display start message
      this.log(`\nStarting benchmark test with ID: ${testId}`)
      this.log(`Publishing ${messageCount} messages at ${messageRate} msg/sec using ${flags.transport} transport`)
      this.log(`Message size: ${messageSize} bytes\n`)
      
      // Start progress display
      let progressDisplay = this.createProgressDisplay()
      const updateInterval = setInterval(() => {
        this.updateProgress(metrics, progressDisplay, messageCount)
      }, 500)
      
      // Calculate delay between messages
      const messageDelay = 1000 / messageRate
      
      // Publish messages
      const startTime = Date.now()
      
      if (flags.transport === 'rest') {
        // Using REST transport - non-blocking implementation
        let messagePromises: Promise<void>[] = []
        let i = 0
        
        const publishInterval = setInterval(() => {
          if (i >= messageCount) {
            clearInterval(publishInterval)
            return
          }
          
          const payload = createPayload(i, messageSize)
          
          // Start publish without awaiting
          const publishStart = Date.now()
          const publishPromise = channel.publish('benchmark', payload)
            .then(() => {
              // Record metrics after publish completes (non-blocking)
              const requestLatency = Date.now() - publishStart
              if (messageTracking[payload.msgId]) {
                messageTracking[payload.msgId].requestCompleteTime = Date.now()
              }
              metrics.requestLatencies.push(requestLatency)
            })
            .catch(error => {
              metrics.errors++
              this.log(`Error publishing message ${i}: ${error instanceof Error ? error.message : String(error)}`)
            })
          
          messagePromises.push(publishPromise)
          metrics.messagesSent++
          i++
        }, messageDelay)
        
        // Wait for all messages to be published
        await new Promise<void>(resolve => {
          const checkComplete = setInterval(() => {
            if (i >= messageCount) {
              clearInterval(checkComplete)
              // Wait for any pending publish operations to complete
              Promise.all(messagePromises)
                .then(() => resolve())
                .catch(() => resolve()) // Resolve even if some promises failed
            }
          }, 100)
        })
      } else {
        // Using Realtime transport - non-blocking implementation
        await new Promise<void>(resolve => {
          let i = 0
          let messagePromises: Promise<void>[] = []
          
          const publishInterval = setInterval(() => {
            if (i >= messageCount) {
              clearInterval(publishInterval)
              
              // Wait for any pending publish operations to complete
              Promise.all(messagePromises)
                .then(() => resolve())
                .catch(() => resolve()) // Resolve even if some promises failed
              
              return
            }
            
            const payload = createPayload(i, messageSize)
            
            // Start publish without awaiting
            const publishStart = Date.now()
            const publishPromise = channel.publish('benchmark', payload)
              .then(() => {
                // Record metrics after publish completes (non-blocking)
                const requestLatency = Date.now() - publishStart
                if (messageTracking[payload.msgId]) {
                  messageTracking[payload.msgId].requestCompleteTime = Date.now()
                }
                metrics.requestLatencies.push(requestLatency)
              })
              .catch(error => {
                metrics.errors++
                this.log(`Error publishing message ${i}: ${error instanceof Error ? error.message : String(error)}`)
              })
            
            messagePromises.push(publishPromise)
            metrics.messagesSent++
            i++
          }, messageDelay)
        })
      }
      
      // Wait a bit for remaining echoes to be received
      this.log('\nWaiting for remaining messages to be echoed back...')
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Clear update interval
      clearInterval(updateInterval)
      
      // Calculate final statistics
      const totalTime = (Date.now() - startTime) / 1000 // in seconds
      const avgRate = metrics.messagesSent / totalTime
      
      const avgRequestLatency = metrics.requestLatencies.length > 0 
        ? metrics.requestLatencies.reduce((sum, lat) => sum + lat, 0) / metrics.requestLatencies.length 
        : 0
        
      const avgEchoLatency = metrics.echoLatencies.length > 0 
        ? metrics.echoLatencies.reduce((sum, lat) => sum + lat, 0) / metrics.echoLatencies.length 
        : 0
      
      // Sort latencies for percentiles
      metrics.requestLatencies.sort((a, b) => a - b)
      const reqP50 = metrics.requestLatencies[Math.floor(metrics.requestLatencies.length * 0.5)] || 0
      const reqP90 = metrics.requestLatencies[Math.floor(metrics.requestLatencies.length * 0.9)] || 0
      const reqP95 = metrics.requestLatencies[Math.floor(metrics.requestLatencies.length * 0.95)] || 0
      
      metrics.echoLatencies.sort((a, b) => a - b)
      const echoP50 = metrics.echoLatencies[Math.floor(metrics.echoLatencies.length * 0.5)] || 0
      const echoP90 = metrics.echoLatencies[Math.floor(metrics.echoLatencies.length * 0.9)] || 0
      const echoP95 = metrics.echoLatencies[Math.floor(metrics.echoLatencies.length * 0.95)] || 0
      
      // Display final results
      this.log('\n\n' + chalk.green('Benchmark Complete') + '\n')

      // Create a summary table
      const summaryTable = new Table({
        head: [chalk.white('Metric'), chalk.white('Value')],
        style: {
          head: [], // No additional styles for the header
          border: [] // No additional styles for the border
        }
      })
      
      summaryTable.push(
        ['Test ID', testId],
        ['Channel', args.channel],
        ['Transport', flags.transport],
        ['Messages sent', `${metrics.messagesSent}/${messageCount}`],
        ['Messages echoed', `${metrics.messagesEchoed}/${metrics.messagesSent}`],
        ['Errors', metrics.errors.toString()],
        ['Total time', `${totalTime.toFixed(2)} seconds`],
        ['Actual rate', `${avgRate.toFixed(2)} msg/sec`]
      )
      
      this.log(summaryTable.toString())
      
      // Create a latency table
      const latencyTable = new Table({
        head: [chalk.white('Latency Metric'), chalk.white('Value (ms)')],
        style: {
          head: [], // No additional styles for the header
          border: [] // No additional styles for the border
        }
      })
      
      latencyTable.push(
        ['Request Average', avgRequestLatency.toFixed(2)],
        ['Request P50', reqP50.toFixed(2)],
        ['Request P90', reqP90.toFixed(2)],
        ['Request P95', reqP95.toFixed(2)],
        ['Echo Average', avgEchoLatency.toFixed(2)],
        ['Echo P50', echoP50.toFixed(2)],
        ['Echo P90', echoP90.toFixed(2)],
        ['Echo P95', echoP95.toFixed(2)]
      )
      
      this.log('\nLatency Measurements:')
      this.log('• Request Latency: Time to complete publish API call')
      this.log('• Echo Latency: Round trip time (Publisher → Ably → Publisher)')
      this.log(latencyTable.toString())
      
      // Leave presence and close connection
      await channel.presence.leave()
      this.log('\nTest complete. Disconnecting...')
      
    } catch (error) {
      this.error(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      realtime.close()
    }
  }
  
  private createProgressDisplay(): Table.Table {
    const table = new Table({
      head: [chalk.white('Benchmark Progress'), chalk.white('Status')],
      style: {
        head: [], // No additional styles for the header
        border: [] // No additional styles for the border
      }
    })
    
    table.push(
      ['Messages sent', '0'],
      ['Messages echoed', '0'],
      ['Current rate', '0 msg/sec'],
      ['Request latency', '0 ms'],
      ['Echo latency', '0 ms'],
      ['Progress', '0%']
    )
    
    return table
  }
  
  private updateProgress(metrics: TestMetrics, display: Table.Table, total: number): void {
    const now = Date.now()
    const elapsed = now - metrics.lastBatchTime
    
    // Only update if at least 100ms has passed
    if (elapsed < 100) return
    
    // Calculate current rate (messages per second in this batch)
    const currentRate = metrics.messagesSent > metrics.batchCount 
      ? ((metrics.messagesSent - metrics.batchCount) / elapsed) * 1000 
      : 0
    
    // Update batch count and time
    metrics.batchCount = metrics.messagesSent
    metrics.lastBatchTime = now
    
    // Calculate average latency of recent messages
    const recentRequestLatencies = metrics.requestLatencies.slice(-metrics.batchSize)
    const avgRequestLatency = recentRequestLatencies.length > 0 
      ? recentRequestLatencies.reduce((sum, lat) => sum + lat, 0) / recentRequestLatencies.length 
      : 0
      
    const recentEchoLatencies = metrics.echoLatencies.slice(-metrics.batchSize)
    const avgEchoLatency = recentEchoLatencies.length > 0 
      ? recentEchoLatencies.reduce((sum, lat) => sum + lat, 0) / recentEchoLatencies.length 
      : 0
    
    // Calculate progress percentage
    const progressPercent = Math.min(100, Math.floor((metrics.messagesSent / total) * 100))
    
    // Create a new table with updated values
    const newTable = new Table({
      head: [chalk.white('Benchmark Progress'), chalk.white('Status')],
      style: {
        head: [], // No additional styles for the header
        border: [] // No additional styles for the border
      }
    })
    
    // Create a progress bar
    const progressBarWidth = 20
    const filledChars = Math.floor((progressPercent / 100) * progressBarWidth)
    const progressBar = `[${'='.repeat(filledChars)}${' '.repeat(progressBarWidth - filledChars)}] ${progressPercent}%`
    
    newTable.push(
      ['Messages sent', `${metrics.messagesSent}/${total}`],
      ['Messages echoed', `${metrics.messagesEchoed}/${metrics.messagesSent}`],
      ['Current rate', `${currentRate.toFixed(1)} msg/sec`],
      ['Request latency', `${avgRequestLatency.toFixed(1)} ms`],
      ['Echo latency', `${avgEchoLatency.toFixed(1)} ms`],
      ['Progress', progressBar]
    )
    
    // Clear console and redraw
    process.stdout.write('\x1B[2J\x1B[0f')
    this.log(newTable.toString())
  }
} 