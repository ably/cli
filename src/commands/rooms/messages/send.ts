import {Args, Flags} from '@oclif/core'
import chalk from 'chalk'

import {ChatBaseCommand} from '../../../chat-base-command.js'

export default class MessagesSend extends ChatBaseCommand {
  static override args = {
    roomId: Args.string({
      description: 'The room ID to send the message to',
      required: true,
    }),
    text: Args.string({
      description: 'The message text to send',
      required: true,
    }),
  }

  static override description = 'Send a message to an Ably Chat room'

  static override examples = [
    '$ ably rooms messages send my-room "Hello World!"',
    '$ ably rooms messages send --api-key "YOUR_API_KEY" my-room "Welcome to the chat!"',
    '$ ably rooms messages send --metadata \'{"isImportant":true}\' my-room "Attention please!"',
    '$ ably rooms messages send --count 5 my-room "Message number {{.Count}}"',
    '$ ably rooms messages send --count 10 --delay 1000 my-room "Message at {{.Timestamp}}"',
    '$ ably rooms messages send my-room "Hello World!" --json',
    '$ ably rooms messages send my-room "Hello World!" --pretty-json'
  ]

  static override flags = {
    ...ChatBaseCommand.globalFlags,
    count: Flags.integer({
      char: 'c',
      default: 1,
      description: 'Number of messages to send',
    }),
    delay: Flags.integer({
      char: 'd',
      default: 0,
      description: 'Delay between messages in milliseconds (min 10ms when count > 1)',
    }),
    metadata: Flags.string({
      description: 'Additional metadata for the message (JSON format)',
    }),
  }

  private clients: { chatClient: any, realtimeClient: any } | null = null;
  private progressIntervalId: NodeJS.Timeout | null = null;

  // Override finally to ensure resources are cleaned up
   async finally(err: Error | undefined): Promise<any> {
     if (this.progressIntervalId) {
        clearInterval(this.progressIntervalId);
        this.progressIntervalId = null;
     }

     if (this.clients?.realtimeClient && this.clients.realtimeClient.connection.state !== 'closed' && this.clients.realtimeClient.connection.state !== 'failed') {
           this.clients.realtimeClient.close();
       }

     return super.finally(err);
   }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessagesSend)

    try {
      // Create Chat client
      this.clients = await this.createChatClient(flags)
      if (!this.clients) return

      const {chatClient, realtimeClient} = this.clients

      // Add listeners for connection state changes
      realtimeClient.connection.on((stateChange: any) => {
        this.logCliEvent(flags, 'connection', stateChange.current, `Realtime connection state changed to ${stateChange.current}`, { reason: stateChange.reason });
      });

      // Parse metadata if provided
      let metadata
      if (flags.metadata) {
        try {
          metadata = JSON.parse(flags.metadata)
          this.logCliEvent(flags, 'message', 'metadataParsed', 'Message metadata parsed successfully', { metadata });
        } catch (error) {
          const errorMsg = `Invalid metadata JSON: ${error instanceof Error ? error.message : String(error)}`;
          this.logCliEvent(flags, 'message', 'metadataParseError', errorMsg, { error: errorMsg });
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({ error: errorMsg, success: false }, flags))
          } else {
            this.error(errorMsg)
          }

          return;
        }
      }

      // Get the room with default options
      this.logCliEvent(flags, 'room', 'gettingRoom', `Getting room handle for ${args.roomId}`);
      const room = await chatClient.rooms.get(args.roomId, {})
      this.logCliEvent(flags, 'room', 'gotRoom', `Got room handle for ${args.roomId}`);

      // Attach to the room
      this.logCliEvent(flags, 'room', 'attaching', `Attaching to room ${args.roomId}`);
      await room.attach()
      this.logCliEvent(flags, 'room', 'attached', `Successfully attached to room ${args.roomId}`);

      // Validate count and delay
      const count = Math.max(1, flags.count)
      let {delay} = flags

      // Enforce minimum delay when sending multiple messages
      if (count > 1 && delay < 10) {
        delay = 10
        this.logCliEvent(flags, 'message', 'minDelayEnforced', 'Using minimum delay of 10ms for multiple messages', { delay });
      }

      // If sending multiple messages, show a progress indication
      this.logCliEvent(flags, 'message', 'startingSend', `Sending ${count} messages with ${delay}ms delay...`, { count, delay });
      if (count > 1 && !this.shouldOutputJson(flags)) {
         this.log(`Sending ${count} messages with ${delay}ms delay...`);
      }

      // Track send progress
      let sentCount = 0
      let errorCount = 0
      const results: any[] = []

      // Send messages
      if (count > 1) {
        // Sending multiple messages
        this.progressIntervalId = this.shouldOutputJson(flags) ? setInterval(() => {
               this.logCliEvent(flags, 'message', 'progress', 'Sending messages', {
                  errors: errorCount,
                  sent: sentCount,
                  total: count
               });
            }, 2000) : setInterval(() => {
              this.log(`Progress: ${sentCount}/${count} messages sent (${errorCount} errors)`);
            }, 1000);

        for (let i = 0; i < count; i++) {
          // Apply interpolation to the message
          const interpolatedText = this.interpolateMessage(args.text, i + 1)
          const messageToSend = {
              text: interpolatedText,
              ...(metadata ? { metadata } : {}),
          };
          this.logCliEvent(flags, 'message', 'sending', `Attempting to send message ${i + 1}`, { index: i + 1, message: messageToSend });

          // Send the message without awaiting
          room.messages.send(messageToSend)
          .then(() => {
            sentCount++
            const result = {
              index: i + 1,
              message: messageToSend,
              roomId: args.roomId,
              success: true
            };
            results.push(result);
            this.logCliEvent(flags, 'message', 'sentSuccess', `Message ${i + 1} sent successfully`, { index: i + 1 });

            if (!this.shouldSuppressOutput(flags) && !this.shouldOutputJson(flags)) {
               // Logged implicitly by progress interval
            }
          })
          .catch((error: any) => {
            errorCount++
            const errorMsg = error instanceof Error ? error.message : String(error);
            const result = {
              error: errorMsg,
              index: i + 1,
              roomId: args.roomId,
              success: false
            };
            results.push(result);
            this.logCliEvent(flags, 'message', 'sendError', `Error sending message ${i + 1}: ${errorMsg}`, { error: errorMsg, index: i + 1 });

            if (!this.shouldSuppressOutput(flags) && !this.shouldOutputJson(flags)) {
               // Logged implicitly by progress interval
            }
          })

          // Delay before sending next message if not the last one
          if (i < count - 1 && delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }

        // Wait for all sends to complete (or timeout after a reasonable period)
        const maxWaitTime = Math.max(5000, count * delay * 2) // At least 5 seconds or twice the expected duration
        const startWaitTime = Date.now()

        await new Promise<void>(resolve => {
          const checkInterval = setInterval(() => {
            if (sentCount + errorCount >= count || (Date.now() - startWaitTime > maxWaitTime)) {
              if (this.progressIntervalId) clearInterval(this.progressIntervalId);
              clearInterval(checkInterval)
              resolve()
            }
          }, 100)
        })

        const finalResult = {
            errors: errorCount,
            results,
            sent: sentCount,
            success: errorCount === 0,
            total: count
        };
        this.logCliEvent(flags, 'message', 'multiSendComplete', `Finished sending ${count} messages`, finalResult);

        if (!this.shouldSuppressOutput(flags)) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput(finalResult, flags))
          } else {
             // Clear the last progress line before final summary
             process.stdout.write('\r' + ' '.repeat(process.stdout.columns) + '\r');
             this.log(`${sentCount}/${count} messages sent successfully (${errorCount} errors).`);
          }
        }
      } else {
        // Single message
        try {
          // Apply interpolation to the message
          const interpolatedText = this.interpolateMessage(args.text, 1)
          const messageToSend = {
             text: interpolatedText,
             ...(metadata ? { metadata } : {}),
          };
          this.logCliEvent(flags, 'message', 'sending', 'Attempting to send single message', { message: messageToSend });

          // Send the message
          await room.messages.send(messageToSend);
          const result = {
              message: messageToSend,
              roomId: args.roomId,
              success: true
          };
          this.logCliEvent(flags, 'message', 'singleSendComplete', 'Message sent successfully', result);

          if (!this.shouldSuppressOutput(flags)) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput(result, flags))
            } else {
              this.log('Message sent successfully.')
            }
          }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            const result = {
               error: errorMsg,
               roomId: args.roomId,
               success: false
            };
            this.logCliEvent(flags, 'message', 'singleSendError', `Failed to send message: ${errorMsg}`, { error: errorMsg });
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput(result, flags))
            } else {
              this.error(`Failed to send message: ${errorMsg}`)
            }
        }
      }

      // Release the room
      this.logCliEvent(flags, 'room', 'releasing', `Releasing room ${args.roomId}`);
      await chatClient.rooms.release(args.roomId)
      this.logCliEvent(flags, 'room', 'released', `Room ${args.roomId} released`);

    } catch (error) {
       const errorMsg = error instanceof Error ? error.message : String(error);
       this.logCliEvent(flags, 'message', 'fatalError', `Failed to send message: ${errorMsg}`, { error: errorMsg });
       if (this.shouldOutputJson(flags)) {
         this.log(this.formatJsonOutput({ error: errorMsg, success: false }, flags))
       } else {
         this.error(`Failed to send message: ${errorMsg}`)
       }
    } finally {
      // Close the connection
       if (this.clients?.realtimeClient) {
           this.logCliEvent(flags || {}, 'connection', 'closing', 'Closing Realtime connection.');
           this.clients.realtimeClient.close();
           this.logCliEvent(flags || {}, 'connection', 'closed', 'Realtime connection closed.');
       }

       if (this.progressIntervalId) {
          clearInterval(this.progressIntervalId);
          this.progressIntervalId = null;
       }
    }
  }

   private interpolateMessage(message: string, count: number): string {
    // Replace {{.Count}} with the current count
    let result = message.replaceAll('{{.Count}}', count.toString())

    // Replace {{.Timestamp}} with the current timestamp
    result = result.replaceAll('{{.Timestamp}}', Date.now().toString())

    return result
  }
} 