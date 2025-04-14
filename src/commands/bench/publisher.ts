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

  private realtime: Ably.Realtime | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private messageLogBuffer: string[] = []; // Buffer for the last 10 logs
  private readonly MAX_LOG_LINES = 10;

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BenchPublisher)
    
    // Validate max values
    const messageCount = Math.min(flags.messages, 10000)
    const messageRate = Math.min(flags.rate, 20)
    const messageSize = Math.max(flags['message-size'], 10)
    
    // Create Ably client
    this.realtime = await this.createAblyClient(flags)
    
    if (!this.realtime) {
      this.error('Failed to create Ably client. Please check your API key and try again.')
      return
    }

    const client = this.realtime; // Use a local const for easier access
    
    // Add listeners for connection state changes
    client.connection.on((stateChange: Ably.ConnectionStateChange) => {
      this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
    });

    try {
      const channel = client.channels.get(args.channel, { params: { rewind: '1' } })
      
      // Add listeners for channel state changes
      channel.on((stateChange: Ably.ChannelStateChange) => {
        this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${args.channel}' state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });
      
      // Create a message tracking object to measure echo latency
      const messageTracking: MessageTracking = {}
      
      // Set up message subscription for echo latency measurement
      await channel.subscribe('benchmark', (message: Ably.Message) => {
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
          this.logCliEvent(flags, 'benchmark', 'messageEchoReceived', `Echo received for message ${msgId}`, { msgId, echoLatency });
          
          // Remove from tracking once processed
          delete messageTracking[msgId]
        }
      })
      this.logCliEvent(flags, 'benchmark', 'subscribedToEcho', `Subscribed to benchmark messages on channel '${args.channel}'`);
      
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
      
      // Add listeners for presence state changes
      channel.presence.subscribe('enter', (member: Ably.PresenceMessage) => {
        this.logCliEvent(flags, 'presence', 'memberEntered', `Member entered presence: ${member.clientId}`, { clientId: member.clientId, data: member.data });
      });
      channel.presence.subscribe('leave', (member: Ably.PresenceMessage) => {
        this.logCliEvent(flags, 'presence', 'memberLeft', `Member left presence: ${member.clientId}`, { clientId: member.clientId });
      });
      channel.presence.subscribe('update', (member: Ably.PresenceMessage) => {
        this.logCliEvent(flags, 'presence', 'memberUpdated', `Member updated presence: ${member.clientId}`, { clientId: member.clientId, data: member.data });
      });

      this.logCliEvent(flags, 'presence', 'enteringPresence', `Entering presence as publisher with test ID: ${testId}`);
      await channel.presence.enter(presenceData)
      this.logCliEvent(flags, 'presence', 'presenceEntered', `Entered presence as publisher with test ID: ${testId}`, { testId });
      
      // Check for subscribers if flag is set
      if (flags['wait-for-subscribers']) {
        this.logCliEvent(flags, 'benchmark', 'waitingForSubscribers', 'Waiting for subscribers...');

        // Use a promise to wait for the first subscriber
        await new Promise<void>((resolve) => {
          const subscriberCheck = (member: Ably.PresenceMessage) => {
            if (member.data && typeof member.data === 'object' && 'role' in member.data && member.data.role === 'subscriber') {
              this.logCliEvent(flags, 'benchmark', 'subscriberDetected', `Subscriber detected: ${member.clientId}`, { clientId: member.clientId });
              channel.presence.unsubscribe('enter', subscriberCheck); // Use unsubscribe here
              resolve();
            }
          };

          channel.presence.subscribe('enter', subscriberCheck); // Use subscribe here

          // Check if subscribers are already present
          channel.presence.get().then((members) => {
            const subscribers = members.filter(m => 
              m.data && typeof m.data === 'object' && 'role' in m.data && m.data.role === 'subscriber'
            )
            if (subscribers.length > 0) {
              this.logCliEvent(flags, 'benchmark', 'subscribersFound', `Found ${subscribers.length} subscribers already present`);
              channel.presence.unsubscribe('enter', subscriberCheck); // Use unsubscribe here if found
              resolve();
            } else {
              // Message already logged by logCliEvent
            }
          }).catch(error => {
            this.logCliEvent(flags, 'presence', 'getPresenceError', `Error getting initial presence: ${error instanceof Error ? error.message : String(error)}`);
            // Continue waiting even if initial check fails
          });
        });
      } else {
        // Check if any subscribers are present and notify the user (only in non-JSON mode)
        const members = await channel.presence.get()
        const subscribers = members.filter(m => 
          m.data && typeof m.data === 'object' && 'role' in m.data && m.data.role === 'subscriber'
        )
        this.logCliEvent(flags, 'benchmark', 'subscriberCheckComplete', `Found ${subscribers.length} subscribers present`);

        if (subscribers.length === 0 && !this.shouldOutputJson(flags)) {
          const shouldContinue = await this.interactiveHelper.confirm(
            'No subscribers found. Continue anyway?'
          )
          
          if (!shouldContinue) {
            this.logCliEvent(flags, 'benchmark', 'testCancelled', 'Benchmark test cancelled by user.');
            await channel.presence.leave()
            client.close()
            return
          }
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
      this.logCliEvent(flags, 'benchmark', 'startingTest', `Starting benchmark test with ID: ${testId}`, { messageCount, messageRate, transport: flags.transport, messageSize });
      if (!this.shouldOutputJson(flags)) {
        this.log(`\nStarting benchmark test with ID: ${testId}`)
        this.log(`Publishing ${messageCount} messages at ${messageRate} msg/sec using ${flags.transport} transport`)
        this.log(`Message size: ${messageSize} bytes\n`)
      }
      
      // Start progress display (only in non-JSON mode)
      let progressDisplay: Table.Table | null = null;
      if (!this.shouldOutputJson(flags)) {
        progressDisplay = this.createProgressDisplay();
        // Initial display before logs start coming in
        process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen
        this.log(progressDisplay.toString()); // Show initial table
        this.log('\n--- Logs (Last 10) ---'); // Log section header

        this.intervalId = setInterval(() => {
          if (progressDisplay) {
            this.updateProgressAndLogs(metrics, progressDisplay, messageCount);
          }
        }, 500);
      } else {
        // Log progress periodically in JSON mode
        this.intervalId = setInterval(() => {
          const progressPercent = Math.min(100, Math.floor((metrics.messagesSent / messageCount) * 100));
          this.logCliEvent(flags, 'benchmark', 'testProgress', 'Benchmark test in progress', {
            messagesSent: metrics.messagesSent,
            messagesEchoed: metrics.messagesEchoed,
            errors: metrics.errors,
            progressPercent
          });
        }, 2000); // Log progress every 2 seconds in JSON mode
      }
      
      // Calculate delay between messages
      const messageDelay = 1000 / messageRate
      
      // Publish messages
      const startTime = Date.now()
      
      if (flags.transport === 'rest') {
        this.logCliEvent(flags, 'benchmark', 'publishingStart', 'Starting to publish messages via REST');
        // Using REST transport - non-blocking implementation
        let messagePromises: Promise<void>[] = []
        let i = 0
        
        const publishInterval = setInterval(() => {
          if (i >= messageCount) {
            clearInterval(publishInterval)
            return
          }
          
          const payload = createPayload(i, messageSize)
          const msgIndex = i; // Capture index for logging
          
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
              const logMsg = `Message ${msgIndex} published (req: ${requestLatency}ms)`;
              this.addLogToBuffer(logMsg);
              this.logCliEvent(flags, 'benchmark', 'messagePublished', logMsg, { msgId: payload.msgId, requestLatency });
            })
            .catch(error => {
              metrics.errors++
              const errorMsg = `Error publishing message ${msgIndex}: ${error instanceof Error ? error.message : String(error)}`;
              this.addLogToBuffer(chalk.red(errorMsg)); // Add errors in red
              this.logCliEvent(flags, 'benchmark', 'publishError', errorMsg, { msgIndex, error: error instanceof Error ? error.message : String(error) });
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
              this.logCliEvent(flags, 'benchmark', 'publishLoopComplete', 'All messages scheduled for publishing');
              // Wait for any pending publish operations to complete
              Promise.all(messagePromises)
                .then(() => {
                  this.logCliEvent(flags, 'benchmark', 'allPublishesAcknowledged', 'All publish operations acknowledged');
                  resolve();
                })
                .catch(() => {
                  this.logCliEvent(flags, 'benchmark', 'publishAcknowledgeError', 'Error occurred while waiting for publish acknowledgements');
                  resolve(); // Resolve even if some promises failed
                })
            }
          }, 100)
        })
      } else {
        this.logCliEvent(flags, 'benchmark', 'publishingStart', 'Starting to publish messages via Realtime');
        // Using Realtime transport - non-blocking implementation
        await new Promise<void>(resolve => {
          let i = 0
          let messagePromises: Promise<void>[] = []
          
          const publishInterval = setInterval(() => {
            if (i >= messageCount) {
              clearInterval(publishInterval)
              this.logCliEvent(flags, 'benchmark', 'publishLoopComplete', 'All messages scheduled for publishing');
              
              // Wait for any pending publish operations to complete
              Promise.all(messagePromises)
                .then(() => {
                  this.logCliEvent(flags, 'benchmark', 'allPublishesAcknowledged', 'All publish operations acknowledged');
                  resolve();
                })
                .catch(() => {
                  this.logCliEvent(flags, 'benchmark', 'publishAcknowledgeError', 'Error occurred while waiting for publish acknowledgements');
                  resolve(); // Resolve even if some promises failed
                })
              
              return
            }
            
            const payload = createPayload(i, messageSize)
            const msgIndex = i; // Capture index for logging
            
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
                const logMsg = `Message ${msgIndex} published (req: ${requestLatency}ms)`;
                this.addLogToBuffer(logMsg);
                this.logCliEvent(flags, 'benchmark', 'messagePublished', logMsg, { msgId: payload.msgId, requestLatency });
              })
              .catch(error => {
                metrics.errors++
                const errorMsg = `Error publishing message ${msgIndex}: ${error instanceof Error ? error.message : String(error)}`;
                this.addLogToBuffer(chalk.red(errorMsg)); // Add errors in red
                this.logCliEvent(flags, 'benchmark', 'publishError', errorMsg, { msgIndex, error: error instanceof Error ? error.message : String(error) });
              })
            
            messagePromises.push(publishPromise)
            metrics.messagesSent++
            i++
          }, messageDelay)
        })
      }
      
      // Wait a bit for remaining echoes to be received
      this.logCliEvent(flags, 'benchmark', 'waitingForEchoes', 'Waiting for remaining messages to be echoed back...');
      if (!this.shouldOutputJson(flags)) {
        this.log('\nWaiting for remaining messages to be echoed back...')
      }
      await new Promise(resolve => setTimeout(resolve, 3000))
      
      // Clear update interval
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      
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
      
      // Log completion event
      const summaryData = {
        testId,
        channel: args.channel,
        transport: flags.transport,
        messageCount,
        messagesSent: metrics.messagesSent,
        messagesEchoed: metrics.messagesEchoed,
        errors: metrics.errors,
        totalTimeSeconds: totalTime,
        actualRateMsgsPerSec: avgRate,
        requestLatencyAvgMs: avgRequestLatency,
        requestLatencyP50Ms: reqP50,
        requestLatencyP90Ms: reqP90,
        requestLatencyP95Ms: reqP95,
        echoLatencyAvgMs: avgEchoLatency,
        echoLatencyP50Ms: echoP50,
        echoLatencyP90Ms: echoP90,
        echoLatencyP95Ms: echoP95,
      };
      this.logCliEvent(flags, 'benchmark', 'testCompleted', 'Benchmark test completed', summaryData);

      // Always output the final summary object in JSON modes
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput(summaryData, flags));
      }

      // Display final results (only in non-JSON mode)
      if (!this.shouldOutputJson(flags)) {
        // Clear console if progress was shown
        if (progressDisplay) {
          process.stdout.write('\x1B[2J\x1B[0f');
        }

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
          ['Echo Average', avgEchoLatency.toFixed(2)],
          ['Echo P50', echoP50.toFixed(2)],
          ['Echo P90', echoP90.toFixed(2)],
          ['Echo P95', echoP95.toFixed(2)]
        )
        
        this.log('\nLatency Measurements:')
        this.log('• Echo Latency: Round trip time (Publisher → Ably → Publisher)')
        this.log(latencyTable.toString())
        
        this.log('\nTest complete. Disconnecting...')
      }
      
      // Leave presence
      this.logCliEvent(flags, 'presence', 'leavingPresence', 'Leaving presence');
      await channel.presence.leave()
      this.logCliEvent(flags, 'presence', 'presenceLeft', 'Left presence');
      
    } catch (error) {
      this.logCliEvent(flags, 'benchmark', 'testError', `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`, { error: error instanceof Error ? error.stack : String(error) });
      this.error(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      if (this.realtime && this.realtime.connection.state !== 'closed') {
        this.realtime.close()
        this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed.');
      }
    }
  }
  
  private createProgressDisplay(): Table.Table {
    const table = new Table({
      head: [chalk.white('Benchmark Progress'), chalk.white('Status')],
      colWidths: [20, 40], // Adjust column widths
      style: {
        head: [], // No additional styles for the header
        border: [] // No additional styles for the border
      }
    })
    
    table.push(
      ['Messages sent', '0'],
      ['Messages echoed', '0'],
      ['Current rate', '0 msg/sec'],
      ['Echo latency', '0 ms'], // Changed from Request latency
      ['Progress', '0%']
    )
    
    return table
  }
  
  private updateProgressAndLogs(metrics: TestMetrics, displayTable: Table.Table, total: number): void {
    const now = Date.now();
    const elapsed = now - metrics.lastBatchTime;

    // Only update if at least 100ms has passed
    if (elapsed < 100) return;

    // Calculate current rate (messages per second in this batch)
    const currentRate = metrics.messagesSent > metrics.batchCount
      ? ((metrics.messagesSent - metrics.batchCount) / elapsed) * 1000
      : 0;

    // Update batch count and time
    metrics.batchCount = metrics.messagesSent;
    metrics.lastBatchTime = now;

    // Calculate average latency of recent messages (only echo)
    const recentEchoLatencies = metrics.echoLatencies.slice(-metrics.batchSize);
    const avgEchoLatency = recentEchoLatencies.length > 0
      ? recentEchoLatencies.reduce((sum, lat) => sum + lat, 0) / recentEchoLatencies.length
      : 0;

    // Calculate progress percentage
    const progressPercent = Math.min(100, Math.floor((metrics.messagesSent / total) * 100));

    // Create progress bar
    const progressBarWidth = 30; // Match colWidths - 10 for label
    const filledChars = Math.floor((progressPercent / 100) * progressBarWidth);
    const progressBar = `[${'='.repeat(filledChars)}${' '.repeat(progressBarWidth - filledChars)}] ${progressPercent}%`;

    // Clear console and redraw table and logs
    process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen and move cursor to top-left

    // Recreate table with updated data
    const updatedTable = new Table({
        head: [chalk.white('Benchmark Progress'), chalk.white('Status')],
        colWidths: [20, 40],
        style: {
            head: [], border: []
        }
    });
    // Push data as arrays matching the head order
    updatedTable.push(
        ['Messages sent', `${metrics.messagesSent}/${total}`],
        ['Messages echoed', `${metrics.messagesEchoed}/${metrics.messagesSent}`],
        ['Current rate', `${currentRate.toFixed(1)} msg/sec`],
        ['Echo latency', `${avgEchoLatency.toFixed(1)} ms`],
        ['Progress', progressBar]
    );
    this.log(updatedTable.toString());

    this.log('\n--- Logs (Last 10) ---');
    this.messageLogBuffer.forEach(log => this.log(log));
  }

  // Function to add logs to the buffer, keeping only the last MAX_LOG_LINES
  private addLogToBuffer(logMessage: string): void {
     if (this.shouldOutputJson({})) return; // Don't buffer in JSON mode
    this.messageLogBuffer.push(`[${new Date().toLocaleTimeString()}] ${logMessage}`);
    if (this.messageLogBuffer.length > this.MAX_LOG_LINES) {
      this.messageLogBuffer.shift(); // Remove the oldest log
    }
  }

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<any> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.realtime && this.realtime.connection.state !== 'closed') {
      this.realtime.close();
    }
    return super.finally(err);
  }
} 