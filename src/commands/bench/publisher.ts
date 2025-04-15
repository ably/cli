import {Args, Flags} from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'
import Table from 'cli-table3'

import {AblyBaseCommand} from '../../base-command.js'

interface TestMetrics {
  batchCount: number
  batchSize: number
  echoLatencies: number[] // Time for message to be published and received back
  errors: number
  lastBatchTime: number
  messagesEchoed: number
  messagesSent: number
  requestLatencies: number[] // Time for publish request to complete
  startTime: number
}

interface MessageTracking {
  [msgId: string]: {
    publishTime: number
    requestCompleteTime?: number
  }
}

export default class BenchPublisher extends AblyBaseCommand {
  static override args = {
    channel: Args.string({
      description: 'The channel name to publish to',
      required: true,
    }),
  }

  static override description = 'Run a publisher benchmark test'

  static override examples = [
    '$ ably bench publisher my-channel',
    '$ ably bench publisher --messages 5000 --rate 10 my-channel',
    '$ ably bench publisher --transport realtime my-channel',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    'message-size': Flags.integer({
      default: 100,
      description: 'Size of the message payload in bytes',
    }),
    messages: Flags.integer({
      char: 'm',
      default: 1000,
      description: 'Number of messages to publish (max 10,000)',
    }),
    rate: Flags.integer({
      char: 'r',
      default: 15,
      description: 'Messages per second to publish (max 20)',
    }),
    transport: Flags.string({
      char: 't',
      default: 'realtime',
      description: 'Transport to use for publishing',
      options: ['rest', 'realtime'],
    }),
    'wait-for-subscribers': Flags.boolean({
      default: false,
      description: 'Wait for subscribers to be present before starting',
    }),
  }

  // Helper function for delays
  private delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
  private intervalId: NodeJS.Timeout | null = null;
  private readonly MAX_LOG_LINES = 10; // Buffer for the last 10 logs
  private messageLogBuffer: string[] = [];

  private realtime: Ably.Realtime | null = null;
  private presenceCount = 0;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.realtime && this.realtime.connection.state !== 'closed') {
      this.realtime.close();
    }

    return super.finally(err);
  }
  
  async run(): Promise<void> {
    const {args, flags} = await this.parse(BenchPublisher)
    
    // Validate max values
    const messageCount = Math.min(flags.messages, 10_000)
    const messageRate = Math.min(flags.rate, 20)
    const messageSize = Math.max(flags['message-size'], 10)
    
    this.realtime = await this.createAblyClient(flags)
    
    if (!this.realtime) {
      this.error('Failed to create Ably client. Please check your API key and try again.')
      return
    }

    const client = this.realtime;
    
    client.connection.on((stateChange: Ably.ConnectionStateChange) => {
      this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
    });

    let channel: Ably.RealtimeChannel | null = null;
    const testId = `test-${Date.now()}`;
    const messageTracking: MessageTracking = {};
    const metrics: TestMetrics = {
      batchCount: 0,
      batchSize: Math.ceil(messageRate / 2),
      echoLatencies: [],
      errors: 0,
      lastBatchTime: Date.now(),
      messagesEchoed: 0,
      messagesSent: 0,
      requestLatencies: [],
      startTime: 0, // Will be set before publishing starts
    };

    try {
      channel = client.channels.get(args.channel, { params: { rewind: '1' } })
      
      channel.on((stateChange: Ably.ChannelStateChange) => {
        this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${args.channel}' state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });
      
      await this.subscribeToEcho(channel, metrics, messageTracking, flags, args.channel);

      await this.enterPresence(channel, testId, messageCount, messageRate, messageSize, flags);
      
      const shouldContinue = await this.checkAndWaitForSubscribers(channel, flags);
          if (!shouldContinue) {
            this.logCliEvent(flags, 'benchmark', 'testCancelled', 'Benchmark test cancelled by user.');
        return; // Exits run method, finally will handle cleanup
      }
      
      this.logCliEvent(flags, 'benchmark', 'startingTest', `Starting benchmark test with ID: ${testId}`, { messageCount, messageRate, messageSize, transport: flags.transport });
      if (!this.shouldOutputJson(flags)) {
        this.log(`\nStarting benchmark test with ID: ${testId}`)
        this.log(`Publishing ${messageCount} messages at ${messageRate} msg/sec using ${flags.transport} transport`)
        this.log(`Message size: ${messageSize} bytes\n`)
      }
      
      const { intervalId: progressIntervalId, progressDisplay } = this.setupProgressDisplay(flags, metrics, messageCount);
      this.intervalId = progressIntervalId; // Assign to class property for finally block

      metrics.startTime = Date.now();

      await (flags.transport === 'rest' ? this.publishMessagesRest(channel, metrics, messageTracking, messageCount, messageRate, messageSize, testId, flags) : this.publishMessagesRealtime(channel, metrics, messageTracking, messageCount, messageRate, messageSize, testId, flags));
      
      // Wait a bit for remaining echoes
      this.logCliEvent(flags, 'benchmark', 'waitingForEchoes', 'Waiting for remaining messages to be echoed back...');
      if (!this.shouldOutputJson(flags)) {
        this.log('\nWaiting for remaining messages to be echoed back...')
      }

      await this.delay(3000);
      
      // Clear progress interval if it exists
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      
      this.displaySummary(metrics, flags, metrics.startTime, messageCount, args, testId, progressDisplay);

    } catch (error) {
      this.logCliEvent(flags, 'benchmark', 'testError', `Benchmark failed: ${error instanceof Error ? error.message : String(error)}`, { error: error instanceof Error ? error.stack : String(error) });
      this.error(`Benchmark failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      // Cleanup managed by the finally method override
      if (channel) {
        try {
          await channel.presence.leave();
          this.logCliEvent(flags, 'presence', 'presenceLeft', 'Left presence');
        } catch (leaveError) {
          this.logCliEvent(flags, 'presence', 'leaveError', `Error leaving presence: ${leaveError instanceof Error ? leaveError.message : String(leaveError)}`);
        }
      }
    }
  }

  // --- Refactored Helper Methods ---

  // --- Original Private Methods ---
  private addLogToBuffer(logMessage: string): void {
     if (this.shouldOutputJson({})) return; // Don't buffer in JSON mode
    this.messageLogBuffer.push(`[${new Date().toLocaleTimeString()}] ${logMessage}`);
    if (this.messageLogBuffer.length > this.MAX_LOG_LINES) {
      this.messageLogBuffer.shift(); // Remove the oldest log
    }
  }

  private async checkAndWaitForSubscribers(channel: Ably.RealtimeChannel, flags: any): Promise<boolean> {
    if (flags['wait-for-subscribers']) {
      this.logCliEvent(flags, 'benchmark', 'waitingForSubscribers', 'Waiting for subscribers...');
      await new Promise<void>((resolve) => {
        const subscriberCheck = (member: Ably.PresenceMessage) => {
          if (member.data && typeof member.data === 'object' && 'role' in member.data && member.data.role === 'subscriber') {
            this.logCliEvent(flags, 'benchmark', 'subscriberDetected', `Subscriber detected: ${member.clientId}`, { clientId: member.clientId });
            channel.presence.unsubscribe('enter', subscriberCheck);
            resolve();
          }
        };

        channel.presence.subscribe('enter', subscriberCheck);
        channel.presence.get().then((members) => {
          const subscribers = members.filter(m => 
            m.data && typeof m.data === 'object' && 'role' in m.data && m.data.role === 'subscriber'
          )
          if (subscribers.length > 0) {
            this.logCliEvent(flags, 'benchmark', 'subscribersFound', `Found ${subscribers.length} subscribers already present`);
            channel.presence.unsubscribe('enter', subscriberCheck);
            resolve();
          }
        }).catch(error => {
          this.logCliEvent(flags, 'presence', 'getPresenceError', `Error getting initial presence: ${error instanceof Error ? error.message : String(error)}`);
          // Continue waiting
        });
      });
    } else {
      const members = await channel.presence.get()
      const subscribers = members.filter(m => 
        m.data && typeof m.data === 'object' && 'role' in m.data && m.data.role === 'subscriber'
      )
      this.logCliEvent(flags, 'benchmark', 'subscriberCheckComplete', `Found ${subscribers.length} subscribers present`);
      if (subscribers.length === 0 && !this.shouldOutputJson(flags)) {
        const shouldContinue = await this.interactiveHelper.confirm('No subscribers found. Continue anyway?');
        if (!shouldContinue) {
          return false; // Indicate cancellation
        }
      }
    }

    return true; // Indicate test should continue
  }

  private createPayload(index: number, size: number, testId: string, messageTracking: MessageTracking): any {
    const timestamp = Date.now()
    const msgId = `${testId}-${index}`
    
    messageTracking[msgId] = { publishTime: timestamp }
    
    const basePayload = { index, msgId, testId, timestamp }
    const basePayloadString = JSON.stringify(basePayload)
    const paddingSize = Math.max(0, size - basePayloadString.length - 2)
    const padding = paddingSize > 0 ? 'a'.repeat(paddingSize) : ''
    
    return { ...basePayload, padding }
  }

  private createProgressDisplay(): InstanceType<typeof Table> {
    const table = new Table({
      colWidths: [20, 40], // Adjust column widths
      head: [chalk.white('Benchmark Progress'), chalk.white('Status')],
      style: {
        border: [], // No additional styles for the border
        head: [] // No additional styles for the header
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

  private displaySummary(metrics: TestMetrics, flags: any, startTime: number, messageCount: number, args: any, testId: string, progressDisplay: InstanceType<typeof Table> | null): void {
    const totalTime = (Date.now() - startTime) / 1000
      const avgRate = metrics.messagesSent / totalTime
      
      const avgRequestLatency = metrics.requestLatencies.length > 0 
        ? metrics.requestLatencies.reduce((sum, lat) => sum + lat, 0) / metrics.requestLatencies.length 
        : 0
        
      const avgEchoLatency = metrics.echoLatencies.length > 0 
        ? metrics.echoLatencies.reduce((sum, lat) => sum + lat, 0) / metrics.echoLatencies.length 
        : 0
      
      metrics.requestLatencies.sort((a, b) => a - b)
      const reqP50 = metrics.requestLatencies[Math.floor(metrics.requestLatencies.length * 0.5)] || 0
      const reqP90 = metrics.requestLatencies[Math.floor(metrics.requestLatencies.length * 0.9)] || 0
      const reqP95 = metrics.requestLatencies[Math.floor(metrics.requestLatencies.length * 0.95)] || 0
      
      metrics.echoLatencies.sort((a, b) => a - b)
      const echoP50 = metrics.echoLatencies[Math.floor(metrics.echoLatencies.length * 0.5)] || 0
      const echoP90 = metrics.echoLatencies[Math.floor(metrics.echoLatencies.length * 0.9)] || 0
      const echoP95 = metrics.echoLatencies[Math.floor(metrics.echoLatencies.length * 0.95)] || 0
      
      const summaryData = {
        actualRateMsgsPerSec: avgRate,
        channel: args.channel,
        echoLatencyAvgMs: avgEchoLatency,
        echoLatencyP50Ms: echoP50,
        echoLatencyP90Ms: echoP90,
        echoLatencyP95Ms: echoP95,
        errors: metrics.errors,
        messageCount,
        messagesEchoed: metrics.messagesEchoed,
        messagesSent: metrics.messagesSent,
        requestLatencyAvgMs: avgRequestLatency,
        requestLatencyP50Ms: reqP50,
        requestLatencyP90Ms: reqP90,
        requestLatencyP95Ms: reqP95,
        testId,
        totalTimeSeconds: totalTime,
        transport: flags.transport,
      };
      this.logCliEvent(flags, 'benchmark', 'testCompleted', 'Benchmark test completed', summaryData);

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput(summaryData, flags));
    } else {
        if (progressDisplay) {
          process.stdout.write('\u001B[2J\u001B[0f');
        }

        this.log('\n\n' + chalk.green('Benchmark Complete') + '\n')
      const summaryTable = new Table({ head: [chalk.white('Metric'), chalk.white('Value')], style: { border: [], head: [] } })
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
        
      const latencyTable = new Table({ head: [chalk.white('Latency Metric'), chalk.white('Value (ms)')], style: { border: [], head: [] } })
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
  }

  private async enterPresence(channel: Ably.RealtimeChannel, testId: string, messageCount: number, messageRate: number, messageSize: number, flags: any): Promise<void> {
    const presenceData = {
      role: 'publisher',
      testDetails: {
        messageCount,
        messageRate,
        messageSize,
        startTime: Date.now(),
        transport: flags.transport,
      },
      testId,
    }
    
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
  }

  private async publishMessagesRealtime(channel: Ably.RealtimeChannel, metrics: TestMetrics, messageTracking: MessageTracking, messageCount: number, messageRate: number, messageSize: number, testId: string, flags: any): Promise<void> {
    this.logCliEvent(flags, 'benchmark', 'publishingStart', 'Starting to publish messages via Realtime');
    const messagePromises: Promise<void>[] = []
    let i = 0
    const messageDelay = 1000 / messageRate

    await new Promise<void>(resolveOuter => {
      const publishInterval = setInterval(() => {
        if (i >= messageCount) {
          clearInterval(publishInterval)
          this.logCliEvent(flags, 'benchmark', 'publishLoopComplete', 'All messages scheduled for publishing');
          Promise.all(messagePromises)
            .then(() => {
              this.logCliEvent(flags, 'benchmark', 'allPublishesAcknowledged', 'All publish operations acknowledged');
              resolveOuter();
            })
            .catch(() => {
              this.logCliEvent(flags, 'benchmark', 'publishAcknowledgeError', 'Error occurred while waiting for publish acknowledgements');
              resolveOuter();
            })
          return
        }
        
        const payload = this.createPayload(i, messageSize, testId, messageTracking)
        const msgIndex = i;
        const publishStart = Date.now()
        
        const publishPromise = channel.publish('benchmark', payload)
          .then(() => {
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
            this.addLogToBuffer(chalk.red(errorMsg));
            this.logCliEvent(flags, 'benchmark', 'publishError', errorMsg, { error: error instanceof Error ? error.message : String(error), msgIndex });
          })
        
        messagePromises.push(publishPromise)
        metrics.messagesSent++
        i++
      }, messageDelay)
    })
  }

  private async publishMessagesRest(channel: Ably.RealtimeChannel, metrics: TestMetrics, messageTracking: MessageTracking, messageCount: number, messageRate: number, messageSize: number, testId: string, flags: any): Promise<void> {
    this.logCliEvent(flags, 'benchmark', 'publishingStart', 'Starting to publish messages via REST');
    const messagePromises: Promise<void>[] = []
    let i = 0
    const messageDelay = 1000 / messageRate
    
    await new Promise<void>(resolveOuter => {
      const publishInterval = setInterval(() => {
        if (i >= messageCount) {
          clearInterval(publishInterval)
          this.logCliEvent(flags, 'benchmark', 'publishLoopComplete', 'All messages scheduled for publishing');
          Promise.all(messagePromises)
            .then(() => {
              this.logCliEvent(flags, 'benchmark', 'allPublishesAcknowledged', 'All publish operations acknowledged');
              resolveOuter();
            })
            .catch(() => {
              this.logCliEvent(flags, 'benchmark', 'publishAcknowledgeError', 'Error occurred while waiting for publish acknowledgements');
              resolveOuter();
            })
          return
        }
        
        const payload = this.createPayload(i, messageSize, testId, messageTracking)
        const msgIndex = i;
        const publishStart = Date.now()
        
        const publishPromise = channel.publish('benchmark', payload)
          .then(() => {
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
            this.addLogToBuffer(chalk.red(errorMsg));
            this.logCliEvent(flags, 'benchmark', 'publishError', errorMsg, { error: error instanceof Error ? error.message : String(error), msgIndex });
          })
        
        messagePromises.push(publishPromise)
        metrics.messagesSent++
        i++
      }, messageDelay)
    })
  }
  
  private setupProgressDisplay(flags: any, metrics: TestMetrics, messageCount: number): { intervalId: NodeJS.Timeout | null, progressDisplay: InstanceType<typeof Table> | null } {
    if (this.shouldOutputJson(flags) || flags.logLevel === 'debug') {
      return { intervalId: null, progressDisplay: null };
    }

    let intervalId: NodeJS.Timeout | null = null;
    const progressDisplay = new Table({
      colWidths: [20, 40],
      head: [chalk.white('Benchmark Progress'), chalk.white('Status')],
      style: {
        border: [],
        head: []
      }
    });
    
    progressDisplay.push(
      ['Messages sent', '0'],
      ['Messages echoed', '0'],
      ['Current rate', '0 msg/sec'],
      ['Echo latency', '0 ms'],
      ['Progress', '0%']
    );
    
    process.stdout.write('\u001B[2J\u001B[0f');
    this.log(progressDisplay.toString());
    this.log('\n--- Logs (Last 10) ---');
    intervalId = setInterval(() => {
      if (progressDisplay) {
        this.updateProgressAndLogs(metrics, progressDisplay, messageCount);
      }
    }, 500);

    return { intervalId, progressDisplay };
  }

  private async subscribeToEcho(channel: Ably.RealtimeChannel, metrics: TestMetrics, messageTracking: MessageTracking, flags: any, channelName: string): Promise<void> {
    await channel.subscribe('benchmark', (message: Ably.Message) => {
      if (!message.data || typeof message.data !== 'object' || !('msgId' in message.data)) {
        return // Not our benchmark message
      }
      
      const msgId = message.data.msgId as string
      const tracker = messageTracking[msgId]
      
      if (tracker && tracker.publishTime) {
        const echoLatency = Date.now() - tracker.publishTime
        metrics.echoLatencies.push(echoLatency)
        metrics.messagesEchoed++
        this.logCliEvent(flags, 'benchmark', 'messageEchoReceived', `Echo received for message ${msgId}`, { echoLatency, msgId });
        delete messageTracking[msgId]
      }
    })
    this.logCliEvent(flags, 'benchmark', 'subscribedToEcho', `Subscribed to benchmark messages on channel '${channelName}'`);
  }

  private updateProgressAndLogs(metrics: TestMetrics, displayTable: InstanceType<typeof Table>, total: number): void {
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
    process.stdout.write('\u001B[2J\u001B[0f'); // Clear screen and move cursor to top-left

    // Recreate table with updated data
    const updatedTable = new Table({
        colWidths: [20, 40],
        head: [chalk.white('Benchmark Progress'), chalk.white('Status')],
        style: {
            border: [], head: []
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
    for (const log of this.messageLogBuffer) {
      this.log(log);
    }
  }
} 