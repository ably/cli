import {Args, Flags} from '@oclif/core'
import {ChatBaseCommand} from '../../../chat-base-command.js'
import chalk from 'chalk'

export default class MessagesSend extends ChatBaseCommand {
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
    metadata: Flags.string({
      description: 'Additional metadata for the message (JSON format)',
    }),
    count: Flags.integer({
      char: 'c',
      description: 'Number of messages to send',
      default: 1,
    }),
    delay: Flags.integer({
      char: 'd',
      description: 'Delay between messages in milliseconds (min 10ms when count > 1)',
      default: 0,
    }),
  }

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

  async run(): Promise<void> {
    const {args, flags} = await this.parse(MessagesSend)
    
    let clients = null
    
    try {
      // Create Chat client
      clients = await this.createChatClient(flags)
      if (!clients) return

      const {chatClient, realtimeClient} = clients
      
      // Parse metadata if provided
      let metadata = undefined
      if (flags.metadata) {
        try {
          metadata = JSON.parse(flags.metadata)
        } catch (error) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              error: `Invalid metadata JSON: ${error instanceof Error ? error.message : String(error)}`
            }, flags))
            return
          }
          this.error(`Invalid metadata JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      
      // Get the room with default options
      const room = await chatClient.rooms.get(args.roomId, {})
      
      // Attach to the room
      await room.attach()
      
      // Validate count and delay
      const count = Math.max(1, flags.count)
      let delay = flags.delay
      
      // Enforce minimum delay when sending multiple messages
      if (count > 1 && delay < 10) {
        delay = 10
        if (!this.shouldSuppressOutput(flags)) {
          this.log('Using minimum delay of 10ms for multiple messages')
        }
      }
      
      // If sending multiple messages, show a progress indication
      if (count > 1 && !this.shouldSuppressOutput(flags)) {
        this.log(`Sending ${count} messages with ${delay}ms delay...`)
      }
      
      // Track send progress
      let sentCount = 0
      let errorCount = 0
      let results: any[] = []
      
      // Send messages
      if (count > 1) {
        // Sending multiple messages without awaiting each send
        let progressInterval: NodeJS.Timeout | undefined
        
        if (!this.shouldSuppressOutput(flags)) {
          progressInterval = setInterval(() => {
            this.log(`Progress: ${sentCount}/${count} messages sent (${errorCount} errors)`)
          }, 1000)
        }
        
        for (let i = 0; i < count; i++) {
          // Apply interpolation to the message
          const interpolatedText = this.interpolateMessage(args.text, i + 1)
          
          // Send the message without awaiting
          room.messages.send({
            text: interpolatedText,
            ...(metadata ? { metadata } : {}),
          })
          .then(() => {
            sentCount++
            results.push({
              success: true,
              index: i + 1,
              message: {
                text: interpolatedText,
                ...(metadata ? { metadata } : {})
              },
              roomId: args.roomId
            })
            
            if (!this.shouldSuppressOutput(flags)) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  index: i + 1,
                  message: {
                    text: interpolatedText,
                    ...(metadata ? { metadata } : {})
                  },
                  roomId: args.roomId
                }, flags))
              }
            }
          })
          .catch(err => {
            errorCount++
            results.push({
              success: false,
              index: i + 1,
              error: err instanceof Error ? err.message : String(err),
              roomId: args.roomId
            })
            
            if (!this.shouldSuppressOutput(flags)) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  index: i + 1,
                  error: err instanceof Error ? err.message : String(err),
                  roomId: args.roomId
                }, flags))
              } else {
                this.log(`Error sending message ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
              }
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
              if (progressInterval) clearInterval(progressInterval)
              clearInterval(checkInterval)
              resolve()
            }
          }, 100)
        })
        
        if (!this.shouldSuppressOutput(flags)) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: errorCount === 0,
              total: count,
              sent: sentCount,
              errors: errorCount,
              results
            }, flags))
          } else {
            this.log(`${sentCount}/${count} messages sent successfully (${errorCount} errors).`)
          }
        }
      } else {
        // Single message - await the send for better error handling
        try {
          // Apply interpolation to the message
          const interpolatedText = this.interpolateMessage(args.text, 1)
          
          // Send the message
          await room.messages.send({
            text: interpolatedText,
            ...(metadata ? { metadata } : {}),
          })
          
          if (!this.shouldSuppressOutput(flags)) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: true,
                message: {
                  text: interpolatedText,
                  ...(metadata ? { metadata } : {})
                },
                roomId: args.roomId
              }, flags))
            } else {
              this.log('Message sent successfully.')
            }
          }
        } catch (error) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              roomId: args.roomId
            }, flags))
          } else {
            this.error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
      
      // Release the room
      await chatClient.rooms.release(args.roomId)
      
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }, flags))
      } else {
        this.error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      // Close the connection
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
  
  private interpolateMessage(message: string, count: number): string {
    // Replace {{.Count}} with the current count
    let result = message.replace(/\{\{\.Count\}\}/g, count.toString())
    
    // Replace {{.Timestamp}} with the current timestamp
    result = result.replace(/\{\{\.Timestamp\}\}/g, Date.now().toString())
    
    return result
  }
} 