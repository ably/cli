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
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
  }

  static override args = {
    channel: Args.string({
      description: 'The channel name to subscribe to',
      required: true,
    }),
  }

  private realtime: Ably.Realtime | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private checkPublisherIntervalId: NodeJS.Timeout | null = null;
  private messageLogBuffer: string[] = []; // Buffer for the last 10 logs
  private readonly MAX_LOG_LINES = 10;

  async run(): Promise<void> {
    const {args, flags} = await this.parse(BenchSubscriber)

    // Create Ably client
    this.realtime = await this.createAblyClient(flags)

    if (!this.realtime) {
      this.error('Failed to create Ably client. Please check your API key and try again.')
      return
    }

    const client = this.realtime; // Use local const

    // Add listeners for connection state changes
    client.connection.on((stateChange: Ably.ConnectionStateChange) => {
      this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
    });

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

      const channel = client.channels.get(args.channel, { params: { rewind: '1' } })

      // Add listeners for channel state changes
      channel.on((stateChange: Ably.ChannelStateChange) => {
        this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${args.channel}' state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Enter presence as a subscriber
      this.logCliEvent(flags, 'presence', 'enteringPresence', `Entering presence as subscriber on channel: ${args.channel}`);
      await channel.presence.enter({ role: 'subscriber' })
      this.logCliEvent(flags, 'presence', 'presenceEntered', `Entered presence as subscriber on channel: ${args.channel}`);

      // Display waiting message
      this.logCliEvent(flags, 'benchmark', 'waitingForTest', 'Waiting for a benchmark test to start...');
      if (!this.shouldOutputJson(flags)) {
          this.log('\nWaiting for a benchmark test to start...');
      }

      // Create display for updating status
      let display: Table.Table | null = null
      let testInProgress = false

      // Subscribe to benchmark messages
      await channel.subscribe('benchmark', (message: Ably.Message) => {
        // Check if message is valid benchmark message
        if (!message.data || typeof message.data !== 'object' || !('timestamp' in message.data) || !('testId' in message.data)) {
          return
        }

        const now = Date.now()
        const publishTime = message.data.timestamp as number
        const testId = message.data.testId as string
        const msgIndex = message.data.index as number;

        // If this is a new test
        if (metrics.testId !== testId) {
          // If we were already tracking a test, show final results
          if (testInProgress) {
            this.finishTest(flags, metrics)
          }

          // Reset metrics for new test
          this.logCliEvent(flags, 'benchmark', 'newTestDetected', `New benchmark test detected with ID: ${testId}`, { testId });
          metrics.messagesReceived = 0
          metrics.totalLatency = 0
          metrics.endToEndLatencies = []
          metrics.testId = testId
          metrics.testStartTime = now
          metrics.publisherActive = true
          metrics.lastMessageTime = now
          testInProgress = true

          // Set up progress display updates (non-JSON mode)
          if (this.intervalId) {
            clearInterval(this.intervalId)
          }
          if (!this.shouldOutputJson(flags)) {
            display = this.createStatusDisplay(testId)
            // Initial display before logs start coming in
            process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen
            this.log(display.toString()); // Show initial table
            this.log('\n--- Logs (Last 10) ---'); // Log section header

            this.intervalId = setInterval(() => {
              this.updateStatusAndLogs(display, metrics);
            }, 500)
          } else {
             // Log progress periodically in JSON mode
             this.intervalId = setInterval(() => {
               this.logCliEvent(flags, 'benchmark', 'testProgress', 'Benchmark test in progress', {
                 testId: metrics.testId,
                 messagesReceived: metrics.messagesReceived,
                 avgLatencyMs: metrics.endToEndLatencies.length > 0
                   ? (metrics.endToEndLatencies.reduce((sum, l) => sum + l, 0) / metrics.endToEndLatencies.length).toFixed(1)
                   : 0
               });
            }, 2000);
          }

          // Setup publisher activity check
          if (this.checkPublisherIntervalId) {
            clearInterval(this.checkPublisherIntervalId)
          }

          this.checkPublisherIntervalId = setInterval(() => {
            const publisherInactiveTime = Date.now() - metrics.lastMessageTime
            // If no message received for 5 seconds, consider publisher inactive
            if (publisherInactiveTime > 5000 && metrics.publisherActive) {
              this.logCliEvent(flags, 'benchmark', 'publisherInactive', `Publisher seems inactive (no messages for ${(publisherInactiveTime / 1000).toFixed(1)}s)`, { testId: metrics.testId });
              metrics.publisherActive = false
              this.finishTest(flags, metrics)
              testInProgress = false

              if (this.intervalId) {
                clearInterval(this.intervalId)
                this.intervalId = null
              }

              if (this.checkPublisherIntervalId) {
                clearInterval(this.checkPublisherIntervalId)
                this.checkPublisherIntervalId = null
              }

              if (!this.shouldOutputJson(flags)) {
                 display = this.createStatusDisplay(null)
                 this.log('\nWaiting for a new benchmark test to start...')
              } else {
                 this.logCliEvent(flags, 'benchmark', 'waitingForTest', 'Waiting for a new benchmark test to start...')
              }
            }
          }, 1000)

          if (!this.shouldOutputJson(flags)) {
             this.log(`\nNew benchmark test detected with ID: ${testId}`) // Already logged via logCliEvent
          }
        }

        // Update last message time to track publisher activity
        metrics.lastMessageTime = now
        metrics.publisherActive = true

        // Calculate end-to-end latency
        const endToEndLatency = now - publishTime

        // Update metrics
        metrics.messagesReceived++
        metrics.endToEndLatencies.push(endToEndLatency)
        const logMsg = `Received message ${msgIndex} (latency: ${endToEndLatency}ms)`;
        this.addLogToBuffer(logMsg); // Add to buffer for default view
        // Only log the event if JSON output is enabled
        if (this.shouldOutputJson(flags)) {
           this.logCliEvent(flags, 'benchmark', 'messageReceived', logMsg, { testId, msgIndex, endToEndLatency });
        }
      })
      this.logCliEvent(flags, 'benchmark', 'subscribedToMessages', `Subscribed to benchmark messages on channel '${args.channel}'`);

      // Subscribe to presence to detect test parameters and publisher activity
      channel.presence.subscribe('enter', (member: Ably.PresenceMessage) => {
        const data = member.data
        this.logCliEvent(flags, 'presence', 'memberEntered', `Member entered presence: ${member.clientId}`, { clientId: member.clientId, data: member.data });

        // Check if this is a publisher entering with test details
        if (data && typeof data === 'object' && 'role' in data && data.role === 'publisher' && 'testDetails' in data) {
          const testDetails = data.testDetails
          const testId = data.testId as string

          this.logCliEvent(flags, 'benchmark', 'publisherDetected', `Publisher detected with test ID: ${testId}`, { testId, testDetails });
          metrics.testDetails = testDetails
          metrics.publisherActive = true
          metrics.lastMessageTime = Date.now()

          if (!this.shouldOutputJson(flags)) {
             this.log(`\nPublisher detected with test ID: ${testId}`)
             this.log(`Test will send ${testDetails.messageCount} messages at ${testDetails.messageRate} msg/sec using ${testDetails.transport} transport`)
          }
        }
      })

      channel.presence.subscribe('leave', (member: Ably.PresenceMessage) => {
        this.logCliEvent(flags, 'presence', 'memberLeft', `Member left presence: ${member.clientId}`, { clientId: member.clientId });
        if (member.data && typeof member.data === 'object' && 'role' in member.data && member.data.role === 'publisher' &&
            'testId' in member.data && member.data.testId === metrics.testId) {
          if (testInProgress) {
            this.logCliEvent(flags, 'benchmark', 'publisherLeft', `Publisher with test ID ${metrics.testId} has left. Finishing test.`, { testId: metrics.testId });
            metrics.publisherActive = false
            this.finishTest(flags, metrics)
            testInProgress = false

            if (this.intervalId) {
              clearInterval(this.intervalId)
              this.intervalId = null
            }

            if (this.checkPublisherIntervalId) {
              clearInterval(this.checkPublisherIntervalId)
              this.checkPublisherIntervalId = null
            }

            if (!this.shouldOutputJson(flags)) {
              display = this.createStatusDisplay(null)
              this.log('\nWaiting for a new benchmark test to start...')
            } else {
              this.logCliEvent(flags, 'benchmark', 'waitingForTest', 'Waiting for a new benchmark test to start...')
            }
          }
        }
      })

      // Also check if a publisher is already present
      const members = await channel.presence.get()
      const publishers = members.filter(m =>
        m.data && typeof m.data === 'object' && 'role' in m.data && m.data.role === 'publisher'
      )

      if (publishers.length > 0) {
         this.logCliEvent(flags, 'benchmark', 'initialPublishersFound', `Found ${publishers.length} publisher(s) already present`);
         if (!this.shouldOutputJson(flags)) {
             this.log(`Found ${publishers.length} publisher(s) already present`);
         }

        for (const publisher of publishers) {
          if (publisher.data && typeof publisher.data === 'object' && 'testDetails' in publisher.data) {
            this.logCliEvent(flags, 'benchmark', 'activeTestFound', `Found active test from existing publisher`, { testId: publisher.data.testId, testDetails: publisher.data.testDetails });
            metrics.testDetails = publisher.data.testDetails
            metrics.testId = publisher.data.testId as string
            metrics.publisherActive = true
            metrics.lastMessageTime = Date.now()

            if (!this.shouldOutputJson(flags)) {
               this.log(`Active test ID: ${metrics.testId}`)
               this.log(`Test will send ${metrics.testDetails.messageCount} messages at ${metrics.testDetails.messageRate} msg/sec using ${metrics.testDetails.transport} transport`)
            }
          }
        }
      }

      // Keep the CLI running until manually terminated
      if (!this.shouldOutputJson(flags)) {
         this.log('\nSubscriber is ready. Waiting for messages...')
         this.log('Press Ctrl+C to exit.')
      }
      this.logCliEvent(flags, 'benchmark', 'subscriberReady', 'Subscriber is ready and waiting for messages');

      // Keep the connection open
      await new Promise(() => {
        // This promise is intentionally never resolved to keep the process running
        // until the user terminates it with Ctrl+C
      })

    } catch (error) {
       this.logCliEvent(flags, 'benchmark', 'testError', `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`, { error: error instanceof Error ? error.stack : String(error) });
       this.error(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      if (this.intervalId) {
         clearInterval(this.intervalId);
         this.intervalId = null;
      }
       if (this.checkPublisherIntervalId) {
         clearInterval(this.checkPublisherIntervalId);
         this.checkPublisherIntervalId = null;
       }
      if (this.realtime) {
         // Check state before closing to avoid errors if already closed
         if (this.realtime.connection.state !== 'closed' && this.realtime.connection.state !== 'failed') {
             this.realtime.close();
             this.logCliEvent(flags || {}, 'connection', 'closed', 'Realtime connection closed.'); // Use empty flags if needed
         }
      }
    }
  }

  private finishTest(flags: any, metrics: TestMetrics): void {
    if (!metrics.testId) return

    // Calculate final statistics before logging
    const testDurationSeconds = ((Date.now() - metrics.testStartTime) / 1000);
    metrics.endToEndLatencies.sort((a, b) => a - b);
    const avgEndToEndLatency = metrics.endToEndLatencies.length > 0 ? metrics.endToEndLatencies.reduce((sum, l) => sum + l, 0) / metrics.endToEndLatencies.length : 0;
    const e2eP50 = metrics.endToEndLatencies[Math.floor(metrics.endToEndLatencies.length * 0.5)] || 0;
    const e2eP90 = metrics.endToEndLatencies[Math.floor(metrics.endToEndLatencies.length * 0.9)] || 0;
    const e2eP95 = metrics.endToEndLatencies[Math.floor(metrics.endToEndLatencies.length * 0.95)] || 0;
    const e2eP99 = metrics.endToEndLatencies[Math.floor(metrics.endToEndLatencies.length * 0.99)] || 0;

    const results = {
        testId: metrics.testId,
        messagesReceived: metrics.messagesReceived,
        testDurationSeconds,
        latencyMs: metrics.endToEndLatencies.length > 0 ? {
            average: parseFloat(avgEndToEndLatency.toFixed(2)),
            p50: parseFloat(e2eP50.toFixed(2)),
            p90: parseFloat(e2eP90.toFixed(2)),
            p95: parseFloat(e2eP95.toFixed(2)),
            p99: parseFloat(e2eP99.toFixed(2))
        } : null
    };

    this.logCliEvent(flags, 'benchmark', 'testFinished', `Benchmark test ${metrics.testId} finished`, { results });

    if (this.shouldOutputJson(flags)) {
      // In JSON mode, output the structured results object
      this.log(this.formatJsonOutput(results, flags));
      return;
    }

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
      colWidths: [20, 30], // Adjust column widths
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

  // New combined update function
  private updateStatusAndLogs(displayTable: Table.Table | null, metrics: TestMetrics): void {
     if (!displayTable || !metrics.testId || this.shouldOutputJson({})) {
       return;
     }

     // Calculate average latency from most recent messages
     const recentCount = Math.min(metrics.messagesReceived, 50);
     const recentLatencies = metrics.endToEndLatencies.slice(-recentCount);

     const avgLatency = recentLatencies.length > 0
       ? recentLatencies.reduce((sum, l) => sum + l, 0) / recentLatencies.length
       : 0;

     // Create updated table data
     const newTableData = [
         ['Messages received', metrics.messagesReceived.toString()],
         ['Average latency', `${avgLatency.toFixed(1)} ms`]
     ];

     // Clear console and redraw
     process.stdout.write('\x1B[2J\x1B[0f'); // Clear screen, move cursor

     // Recreate table with updated data
     const updatedTable = new Table({
         head: [chalk.white('Benchmark Test'), chalk.white(metrics.testId || '')],
         colWidths: [20, 30],
         style: {
             head: [], border: []
         }
     });
     updatedTable.push(...newTableData);
     this.log(updatedTable.toString());

     this.log('\n--- Logs (Last 10) ---');
     this.messageLogBuffer.forEach(log => this.log(log));
  }

  // Function to add logs to the buffer
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
    if (this.checkPublisherIntervalId) {
       clearInterval(this.checkPublisherIntervalId);
       this.checkPublisherIntervalId = null;
    }
    if (this.realtime && this.realtime.connection.state !== 'closed') {
       // Check state before closing to avoid errors if already closed
       if (this.realtime.connection.state !== 'failed') {
           this.realtime.close();
       }
    }
    return super.finally(err);
  }
} 