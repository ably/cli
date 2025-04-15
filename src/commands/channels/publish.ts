import {Args, Flags} from '@oclif/core'
import * as Ably from 'ably'
import chalk from 'chalk'

import {AblyBaseCommand} from '../../base-command.js'

export default class ChannelsPublish extends AblyBaseCommand {
  static override args = {
    channel: Args.string({
      description: 'The channel name to publish to',
      required: true,
    }),
    message: Args.string({
      description: 'The message to publish (JSON format or plain text)',
      required: true,
    }),
  }

  static override description = 'Publish a message to an Ably channel'

  static override examples = [
    '$ ably channels publish my-channel \'{"name":"event","data":"Hello World"}\'',
    '$ ably channels publish --api-key "YOUR_API_KEY" my-channel \'{"data":"Simple message"}\'',
    '$ ably channels publish --token "YOUR_ABLY_TOKEN" my-channel \'{"data":"Using token auth"}\'',
    '$ ably channels publish --name event my-channel \'{"text":"Hello World"}\'',
    '$ ably channels publish my-channel "Hello World"',
    '$ ably channels publish --name event my-channel "Plain text message"',
    '$ ably channels publish --count 5 my-channel "Message number {{.Count}}"',
    '$ ably channels publish --count 10 --delay 1000 my-channel "Message at {{.Timestamp}}"',
    '$ ably channels publish --transport realtime my-channel "Using realtime transport"',
    '$ ably channels publish my-channel "Hello World" --json',
    '$ ably channels publish my-channel "Hello World" --pretty-json'
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    count: Flags.integer({
      char: 'c',
      default: 1,
      description: 'Number of messages to publish',
    }),
    delay: Flags.integer({
      char: 'd',
      default: 0,
      description: 'Delay between messages in milliseconds (min 10ms when count > 1)',
    }),
    encoding: Flags.string({
      char: 'e',
      description: 'The encoding for the message',
    }),
    name: Flags.string({
      char: 'n',
      description: 'The event name (if not specified in the message JSON)',
    }),
    transport: Flags.string({
      default: 'rest',
      description: 'Transport method to use for publishing (rest or realtime)',
      options: ['rest', 'realtime'],
    }),
  }

  private progressIntervalId: NodeJS.Timeout | null = null;
  private realtime: Ably.Realtime | null = null;

  // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<void> {
    if (this.progressIntervalId) {
       clearInterval(this.progressIntervalId);
       this.progressIntervalId = null;
    }

    if (this.realtime && this.realtime.connection.state !== 'closed' && // Check state before closing to avoid errors if already closed
       this.realtime.connection.state !== 'failed') {
           this.realtime.close();
       }

    return super.finally(err);
  }
  
  // --- Refactored Publish Logic ---
  
  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelsPublish)
    
    // Show authentication information
    this.showAuthInfoIfNeeded(flags)
    
    // Use REST by default now - only create Realtime client if explicitly requested
    await (flags.transport === 'realtime' ? this.publishWithRealtime(args, flags) : this.publishWithRest(args, flags));
  }

  private clearProgressIndicator(): void {
      if (this.progressIntervalId) {
          clearInterval(this.progressIntervalId);
          this.progressIntervalId = null;
      }
  }

  private async ensureAuthForRest(flags: Record<string, unknown>): Promise<void> {
      if (!flags.token && !flags['api-key'] && !process.env.ABLY_API_KEY) {
        const appAndKey = await this.ensureAppAndKey(flags)
        if (!appAndKey) {
          this.logErrorAndExit(`${chalk.yellow('No app or API key configured for this command')}.\nPlease log in first with "${chalk.cyan('ably accounts login')}" (recommended approach).\nAlternatively you can provide an API key with the ${chalk.cyan('--api-key')} argument or set the ${chalk.cyan('ABLY_API_KEY')} environment variable.`, flags);
          // Throw an error to stop execution after logging
          throw new Error('Auth configuration missing.');
        }

        // Assign the key to flags if found via config
        flags['api-key'] = appAndKey.apiKey
      }
  }

  private handlePublishError(error: unknown, flags: Record<string, unknown>): void {
     const errorMsg = error instanceof Error ? error.message : String(error);
     this.logCliEvent(flags, 'publish', 'fatalError', `Failed to publish message: ${errorMsg}`, { error: errorMsg });
     this.logErrorAndExit(`Failed to publish message: ${errorMsg}`, flags);
  }

  // --- Original Methods (modified) ---

  private interpolateMessage(message: string, count: number): string {
    // Replace {{.Count}} with the current count
    let result = message.replaceAll('{{.Count}}', count.toString())
    
    // Replace {{.Timestamp}} with the current timestamp
    result = result.replaceAll('{{.Timestamp}}', Date.now().toString())
    
    return result
  }

  private logErrorAndExit(message: string, flags: Record<string, unknown>): void {
    if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ error: message, success: false }, flags));
        process.exitCode = 1; // Set exit code for JSON output errors
    } else {
        this.error(message); // Use oclif error which sets exit code
    }
  }
  
  private logFinalSummary(flags: Record<string, unknown>, total: number, published: number, errors: number, results: Array<Record<string, unknown>>): void {
      const finalResult = {
          errors,
          published,
          results,
          success: errors === 0 && published === total,
          total
      };
      const eventType = total > 1 ? 'multiPublishComplete' : 'singlePublishComplete';
      const eventMessage = total > 1 ? `Finished publishing ${total} messages` : 'Finished publishing message';
      this.logCliEvent(flags, 'publish', eventType, eventMessage, finalResult);

      if (!this.shouldSuppressOutput(flags)) {
          if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput(finalResult, flags));
          } else if (total > 1) {
                 this.log(`${chalk.green('✓')} ${published}/${total} messages published successfully${errors > 0 ? ` (${chalk.red(errors)} errors)` : ''}.`);
              } else if (errors === 0) {
                 this.log(`${chalk.green('✓')} Message published successfully.`);
              } else {
                 // Error message already logged by publishMessages loop or prepareMessage
              }
      }
  }

  private prepareMessage(rawMessage: string, flags: Record<string, unknown>, index: number): Ably.Message {
       // Apply interpolation to the message
       const interpolatedMessage = this.interpolateMessage(rawMessage, index)

       // Parse the message
       let messageData;
       try {
         messageData = JSON.parse(interpolatedMessage)
       } catch {
         // If parsing fails, use the raw message as data
         messageData = { data: interpolatedMessage }
       }

       // Prepare the message
       const message: any = {}

       // If name is provided in flags, use it. Otherwise, check if it's in the message data
       if (flags.name) {
         message.name = flags.name
       } else if (messageData.name) {
         message.name = messageData.name
         // Remove the name from the data to avoid duplication
         delete messageData.name
       }

       // If data is explicitly provided in the message, use it
       if ('data' in messageData) {
         message.data = messageData.data
       } else {
         // Otherwise use the entire messageData as the data
         message.data = messageData
       }

       // Add encoding if provided
       if (flags.encoding) {
         message.encoding = flags.encoding
       }

       return message as Ably.Message;
   }

  private async publishMessages(args: Record<string, unknown>, flags: Record<string, unknown>, publisher: (msg: Ably.Message) => Promise<void>): Promise<void> {
    // Validate count and delay
    const count = Math.max(1, flags.count as number)
    let delay = flags.delay as number
    
    if (count > 1 && delay < 10) {
      delay = 10
      this.logCliEvent(flags, 'publish', 'minDelayEnforced', 'Using minimum delay of 10ms for multiple messages', { delay });
    }

    this.logCliEvent(flags, 'publish', 'startingPublish', `Publishing ${count} messages with ${delay}ms delay...`, { count, delay });
    if (count > 1 && !this.shouldOutputJson(flags)) {
      this.log(`Publishing ${count} messages with ${delay}ms delay...`);
    }

    let publishedCount = 0
    let errorCount = 0
    const results: { error?: string; index: number; message?: Ably.Message; success: boolean }[] = [];

    // Setup progress indicator
    this.setupProgressIndicator(flags, count, () => publishedCount, () => errorCount);

    for (let i = 0; i < count; i++) {
      const messageIndex = i + 1;
      const message = this.prepareMessage(args.message as string, flags, messageIndex);
      try {
        // eslint-disable-next-line no-await-in-loop
        await publisher(message);
        publishedCount++;
        const result = { index: messageIndex, message, success: true };
        results.push(result);
        this.logCliEvent(flags, 'publish', 'messagePublished', `Message ${messageIndex} published successfully`, { index: messageIndex, message });
        if (!this.shouldSuppressOutput(flags) && !this.shouldOutputJson(flags)) {
           this.log(`${chalk.green('✓')} Message ${messageIndex} published successfully.`);
        }
      } catch (error) {
        errorCount++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        const result = { error: errorMsg, index: messageIndex, success: false };
        results.push(result);
        this.logCliEvent(flags, 'publish', 'publishError', `Error publishing message ${messageIndex}: ${errorMsg}`, { error: errorMsg, index: messageIndex });
        if (!this.shouldSuppressOutput(flags) && !this.shouldOutputJson(flags)) {
           this.log(`${chalk.red('✗')} Error publishing message ${messageIndex}: ${errorMsg}`);
        }
      }

      // Delay if needed
      if (i < count - 1 && delay > 0) {
        // eslint-disable-next-line no-await-in-loop, no-promise-executor-return
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.clearProgressIndicator();
    this.logFinalSummary(flags, count, publishedCount, errorCount, results);
  }

  private async publishWithRealtime(args: Record<string, unknown>, flags: Record<string, unknown>): Promise<void> {
    try {
      this.realtime = await this.createAblyClient(flags);
      if (!this.realtime) {
          const errorMsg = 'Failed to create Ably client. Please check your API key and try again.';
          this.logCliEvent(flags, 'publish', 'clientCreationFailed', errorMsg, { error: errorMsg });
          this.logErrorAndExit(errorMsg, flags);
          return;
      }

      const client = this.realtime;

      client.connection.on((stateChange: Ably.ConnectionStateChange) => {
         this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      this.logCliEvent(flags, 'publish', 'transportSelected', 'Using Realtime transport');
      const channel = client.channels.get(args.channel as string);

      channel.on((stateChange: Ably.ChannelStateChange) => {
         this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${args.channel}' state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      await this.publishMessages(args, flags, (msg) => channel.publish(msg));

    } catch (error) {
      this.handlePublishError(error, flags);
    } finally {
       // Ensure connection is closed if it was opened
       if (this.realtime) {
         this.realtime.close();
         this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed.');
       }
    }
  }

  private async publishWithRest(args: Record<string, unknown>, flags: Record<string, unknown>): Promise<void> {
    try {
      // Ensure auth setup first for consistent display
      await this.ensureAuthForRest(flags);
      
      const options = this.getClientOptions(flags);
      const rest = new Ably.Rest(options);
      const channel = rest.channels.get(args.channel as string);
      
      this.logCliEvent(flags, 'publish', 'transportSelected', 'Using REST transport');
      
      await this.publishMessages(args, flags, (msg) => channel.publish(msg));

    } catch (error) {
      this.handlePublishError(error, flags);
    }
     // No finally block needed here as REST client doesn't maintain a connection
  }

   private setupProgressIndicator(flags: Record<string, unknown>, total: number, getPublishedCount: () => number, getErrorCount: () => number): void {
     if (total <= 1) return; // No progress for single message
     if (this.progressIntervalId) clearInterval(this.progressIntervalId);

     this.progressIntervalId = this.shouldOutputJson(flags) ? setInterval(() => {
             this.logCliEvent(flags, 'publish', 'progress', 'Publishing messages', {
                errors: getErrorCount(),
                published: getPublishedCount(),
                total
             });
           }, 2000) : setInterval(() => {
              this.log(`Progress: ${getPublishedCount()}/${total} messages published (${getErrorCount()} errors)`);
           }, 1000);
   }
} 