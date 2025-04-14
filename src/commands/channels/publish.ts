import {Args, Flags} from '@oclif/core'
import * as Ably from 'ably'
import {AblyBaseCommand} from '../../base-command.js'
import chalk from 'chalk'

export default class ChannelsPublish extends AblyBaseCommand {
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
    name: Flags.string({
      char: 'n',
      description: 'The event name (if not specified in the message JSON)',
    }),
    encoding: Flags.string({
      char: 'e',
      description: 'The encoding for the message',
    }),
    count: Flags.integer({
      char: 'c',
      description: 'Number of messages to publish',
      default: 1,
    }),
    delay: Flags.integer({
      char: 'd',
      description: 'Delay between messages in milliseconds (min 10ms when count > 1)',
      default: 0,
    }),
    transport: Flags.string({
      description: 'Transport method to use for publishing (rest or realtime)',
      options: ['rest', 'realtime'],
      default: 'rest',
    }),
  }

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

  private realtime: Ably.Realtime | null = null;
  private progressIntervalId: NodeJS.Timeout | null = null;

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelsPublish)
    
    // Show authentication information
    this.showAuthInfoIfNeeded(flags)
    
    // Use REST by default now - only create Realtime client if explicitly requested
    if (flags.transport === 'realtime') {
      await this.publishWithRealtime(args, flags)
    } else {
      await this.publishWithRest(args, flags)
    }
  }
  
  async publishWithRest(args: any, flags: any): Promise<void> {
    let rest: Ably.Rest | null = null;
    try {
      // First ensure the app and key are set up properly for consistent auth display
      if (!flags.token && !flags['api-key'] && !process.env.ABLY_API_KEY) {
        const appAndKey = await this.ensureAppAndKey(flags)
        if (!appAndKey) {
          this.error(`${chalk.yellow('No app or API key configured for this command')}.\nPlease log in first with "${chalk.cyan('ably accounts login')}" (recommended approach).\nAlternatively you can provide an API key with the ${chalk.cyan('--api-key')} argument or set the ${chalk.cyan('ABLY_API_KEY')} environment variable.`)
          return
        }
        flags['api-key'] = appAndKey.apiKey
      }

      // Create REST client with the same options as we would for Realtime
      const options = this.getClientOptions(flags)
      rest = new Ably.Rest(options)
      
      // Get the channel
      const channel = rest.channels.get(args.channel)
      
      this.logCliEvent(flags, 'publish', 'transportSelected', 'Using REST transport');
      
      // Validate count and delay
      const count = Math.max(1, flags.count)
      let delay = flags.delay
      
      // Enforce minimum delay when sending multiple messages
      if (count > 1 && delay < 10) {
        delay = 10
        this.logCliEvent(flags, 'publish', 'minDelayEnforced', 'Using minimum delay of 10ms for multiple messages', { delay });
      }
      
      // If sending multiple messages, show a progress indication
      this.logCliEvent(flags, 'publish', 'startingPublish', `Publishing ${count} messages with ${delay}ms delay...`, { count, delay });
      if (count > 1 && !this.shouldOutputJson(flags)) {
         this.log(`Publishing ${count} messages with ${delay}ms delay...`);
      }
      
      // Track publish progress
      let publishedCount = 0
      let errorCount = 0
      let results: any[] = []
      
      // Publish messages
      if (count > 1) {
        // Publishing multiple messages
        if (!this.shouldOutputJson(flags)) {
           this.progressIntervalId = setInterval(() => {
              this.log(`Progress: ${publishedCount}/${count} messages published (${errorCount} errors)`);
           }, 1000);
        } else {
           this.progressIntervalId = setInterval(() => {
             this.logCliEvent(flags, 'publish', 'progress', 'Publishing messages', {
                published: publishedCount,
                errors: errorCount,
                total: count
             });
           }, 2000);
        }

        for (let i = 0; i < count; i++) {
          const message = this.prepareMessage(args.message, flags, i + 1);
          try {
            // Publish the message
            await channel.publish(message)
            publishedCount++
             const result = {
               success: true,
               index: i + 1,
               message,
               channel: args.channel
             };
             results.push(result);
             this.logCliEvent(flags, 'publish', 'messagePublished', `Message ${i + 1} published successfully`, { index: i + 1, message });

             if (!this.shouldSuppressOutput(flags) && !this.shouldOutputJson(flags)) {
                this.log(`${chalk.green('✓')} Message published successfully.`);
             }
          } catch (err) {
            errorCount++
            const errorMsg = err instanceof Error ? err.message : String(err);
             const result = {
               success: false,
               index: i + 1,
               error: errorMsg,
               channel: args.channel
             };
             results.push(result);
             this.logCliEvent(flags, 'publish', 'publishError', `Error publishing message ${i + 1}: ${errorMsg}`, { index: i + 1, error: errorMsg });

             if (!this.shouldSuppressOutput(flags) && !this.shouldOutputJson(flags)) {
                this.log(`Error publishing message ${i + 1}: ${errorMsg}`);
             }
          }
          
          // Delay before sending next message if not the last one
          if (i < count - 1 && delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }

        if (this.progressIntervalId) clearInterval(this.progressIntervalId);

        const finalResult = {
            success: errorCount === 0,
            total: count,
            published: publishedCount,
            errors: errorCount,
            results
        };
        this.logCliEvent(flags, 'publish', 'multiPublishComplete', `Finished publishing ${count} messages`, finalResult);

        if (!this.shouldSuppressOutput(flags)) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput(finalResult, flags))
          } else {
            this.log(`${chalk.green('✓')} ${publishedCount}/${count} messages published successfully${errorCount > 0 ? ` (${chalk.red(errorCount)} errors)` : ''}.`);
          }
        }
      } else {
        // Single message
        try {
           const message = this.prepareMessage(args.message, flags, 1);

          // Publish the message
          await channel.publish(message)
           const result = {
               success: true,
               message,
               channel: args.channel
           };
           this.logCliEvent(flags, 'publish', 'singlePublishComplete', 'Message published successfully', result);

           if (!this.shouldSuppressOutput(flags)) {
             if (this.shouldOutputJson(flags)) {
               this.log(this.formatJsonOutput(result, flags))
             } else {
               this.log(`${chalk.green('✓')} Message published successfully.`);
             }
           }
        } catch (error) {
           const errorMsg = error instanceof Error ? error.message : String(error);
           const result = {
              success: false,
              error: errorMsg,
              channel: args.channel
            };
           this.logCliEvent(flags, 'publish', 'singlePublishError', `Failed to publish message: ${errorMsg}`, result);
           if (this.shouldOutputJson(flags)) {
             this.log(this.formatJsonOutput(result, flags))
           } else {
             this.error(`Failed to publish message: ${errorMsg}`)
           }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, 'publish', 'fatalError', `Failed to publish message: ${errorMsg}`, { error: errorMsg });
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: errorMsg
        }, flags))
      } else {
        this.error(`Failed to publish message: ${errorMsg}`)
      }
    }
  }
  
  async publishWithRealtime(args: any, flags: any): Promise<void> {
    try {
      // Create Ably client
      this.realtime = await this.createAblyClient(flags)

      if (!this.realtime) {
          const errorMsg = 'Failed to create Ably client. Please check your API key and try again.';
          this.logCliEvent(flags, 'publish', 'clientCreationFailed', errorMsg, { error: errorMsg });
          if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                  success: false,
                  error: errorMsg
              }, flags));
          } else {
              this.error(errorMsg);
          }
          return;
      }

      const client = this.realtime;

       // Add listeners for connection state changes
       client.connection.on((stateChange: Ably.ConnectionStateChange) => {
         this.logCliEvent(flags, 'connection', stateChange.current, `Connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
       });

      this.logCliEvent(flags, 'publish', 'transportSelected', 'Using Realtime transport');

      // Get the channel
      const channel = client.channels.get(args.channel)

       // Add listeners for channel state changes
       channel.on((stateChange: Ably.ChannelStateChange) => {
         this.logCliEvent(flags, 'channel', stateChange.current, `Channel '${args.channel}' state changed to ${stateChange.current}`, { reason: stateChange.reason });
       });

      // Validate count and delay
      const count = Math.max(1, flags.count)
      let delay = flags.delay
      
      // Enforce minimum delay when sending multiple messages
      if (count > 1 && delay < 10) {
        delay = 10
        this.logCliEvent(flags, 'publish', 'minDelayEnforced', 'Using minimum delay of 10ms for multiple messages', { delay });
      }

      this.logCliEvent(flags, 'publish', 'startingPublish', `Publishing ${count} messages with ${delay}ms delay...`, { count, delay });
       if (count > 1 && !this.shouldOutputJson(flags)) {
         this.log(`Publishing ${count} messages with ${delay}ms delay...`);
       }

      // Track publish progress
      let publishedCount = 0
      let errorCount = 0
      let results: any[] = []

      // Publish messages
      if (count > 1) {
        // Publishing multiple messages
        if (!this.shouldOutputJson(flags)) {
           this.progressIntervalId = setInterval(() => {
              this.log(`Progress: ${publishedCount}/${count} messages published (${errorCount} errors)`);
           }, 1000);
        } else {
           this.progressIntervalId = setInterval(() => {
             this.logCliEvent(flags, 'publish', 'progress', 'Publishing messages', {
                published: publishedCount,
                errors: errorCount,
                total: count
             });
           }, 2000);
        }

        for (let i = 0; i < count; i++) {
          const message = this.prepareMessage(args.message, flags, i + 1);
          try {
            // Publish the message
            await channel.publish(message)
            publishedCount++
             const result = {
               success: true,
               index: i + 1,
               message,
               channel: args.channel
             };
             results.push(result);
             this.logCliEvent(flags, 'publish', 'messagePublished', `Message ${i + 1} published successfully`, { index: i + 1, message });

             if (!this.shouldSuppressOutput(flags) && !this.shouldOutputJson(flags)) {
                this.log(`${chalk.green('✓')} Message published successfully.`);
             }
          } catch (err) {
            errorCount++
            const errorMsg = err instanceof Error ? err.message : String(err);
             const result = {
               success: false,
               index: i + 1,
               error: errorMsg,
               channel: args.channel
             };
             results.push(result);
             this.logCliEvent(flags, 'publish', 'publishError', `Error publishing message ${i + 1}: ${errorMsg}`, { index: i + 1, error: errorMsg });

             if (!this.shouldSuppressOutput(flags) && !this.shouldOutputJson(flags)) {
                this.log(`Error publishing message ${i + 1}: ${errorMsg}`);
             }
          }
          
          // Delay before sending next message if not the last one
          if (i < count - 1 && delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }

        if (this.progressIntervalId) clearInterval(this.progressIntervalId);

        const finalResult = {
            success: errorCount === 0,
            total: count,
            published: publishedCount,
            errors: errorCount,
            results
        };
        this.logCliEvent(flags, 'publish', 'multiPublishComplete', `Finished publishing ${count} messages`, finalResult);

        if (!this.shouldSuppressOutput(flags)) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput(finalResult, flags))
          } else {
            this.log(`${chalk.green('✓')} ${publishedCount}/${count} messages published successfully${errorCount > 0 ? ` (${chalk.red(errorCount)} errors)` : ''}.`);
          }
        }
      } else {
        // Single message
        try {
           const message = this.prepareMessage(args.message, flags, 1);

          // Publish the message
          await channel.publish(message)
           const result = {
               success: true,
               message,
               channel: args.channel
           };
           this.logCliEvent(flags, 'publish', 'singlePublishComplete', 'Message published successfully', result);

           if (!this.shouldSuppressOutput(flags)) {
             if (this.shouldOutputJson(flags)) {
               this.log(this.formatJsonOutput(result, flags))
             } else {
               this.log(`${chalk.green('✓')} Message published successfully.`);
             }
           }
        } catch (error) {
           const errorMsg = error instanceof Error ? error.message : String(error);
           const result = {
              success: false,
              error: errorMsg,
              channel: args.channel
            };
           this.logCliEvent(flags, 'publish', 'singlePublishError', `Failed to publish message: ${errorMsg}`, result);
           if (this.shouldOutputJson(flags)) {
             this.log(this.formatJsonOutput(result, flags))
           } else {
             this.error(`Failed to publish message: ${errorMsg}`)
           }
        }
      }

      // Close connection when done
      if (this.realtime) {
          this.realtime.close();
          this.logCliEvent(flags, 'connection', 'closed', 'Realtime connection closed.');
      }
    } catch (error) {
      // Close connection in case of error
      if (this.realtime) {
        this.realtime.close()
      }

      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logCliEvent(flags, 'publish', 'fatalError', `Failed to publish message: ${errorMsg}`, { error: errorMsg });
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: errorMsg
        }, flags))
      } else {
        this.error(`Failed to publish message: ${errorMsg}`)
      }
    }
  }
  
  private prepareMessage(rawMessage: string, flags: any, index: number): any {
       // Apply interpolation to the message
       const interpolatedMessage = this.interpolateMessage(rawMessage, index)

       // Parse the message
       let messageData;
       try {
         messageData = JSON.parse(interpolatedMessage)
       } catch (error) {
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
       return message;
   }

  private interpolateMessage(message: string, count: number): string {
    // Replace {{.Count}} with the current count
    let result = message.replace(/\{\{\.Count\}\}/g, count.toString())
    
    // Replace {{.Timestamp}} with the current timestamp
    result = result.replace(/\{\{\.Timestamp\}\}/g, Date.now().toString())
    
    return result
  }

   // Override finally to ensure resources are cleaned up
  async finally(err: Error | undefined): Promise<any> {
    if (this.progressIntervalId) {
       clearInterval(this.progressIntervalId);
       this.progressIntervalId = null;
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