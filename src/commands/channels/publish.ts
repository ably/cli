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
      const rest = new Ably.Rest(options)
      
      // Get the channel
      const channel = rest.channels.get(args.channel)
      
      if (!this.shouldSuppressOutput(flags)) {
        this.log('Using REST transport')
      }
      
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
        this.log(`Publishing ${count} messages with ${delay}ms delay...`)
      }
      
      // Track publish progress
      let publishedCount = 0
      let errorCount = 0
      let results: any[] = []
      
      // Publish messages
      if (count > 1) {
        // Publishing multiple messages without awaiting each publish
        let progressInterval: NodeJS.Timeout | undefined
        
        if (!this.shouldSuppressOutput(flags)) {
          progressInterval = setInterval(() => {
            this.log(`Progress: ${publishedCount}/${count} messages published (${errorCount} errors)`)
          }, 1000)
        }
        
        for (let i = 0; i < count; i++) {
          // Apply interpolation to the message
          const interpolatedMessage = this.interpolateMessage(args.message, i + 1)
          
          // Parse the message
          let messageData
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

          try {
            // Publish the message
            await channel.publish(message)
            publishedCount++
            results.push({
              success: true,
              index: i + 1,
              message,
              channel: args.channel
            })
            
            if (!this.shouldSuppressOutput(flags)) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  index: i + 1,
                  message,
                  channel: args.channel
                }, flags))
              } else {
                this.log(`${chalk.green('✓')} Message published successfully.`)
              }
            }
          } catch (err) {
            errorCount++
            results.push({
              success: false,
              index: i + 1,
              error: err instanceof Error ? err.message : String(err),
              channel: args.channel
            })
            
            if (!this.shouldSuppressOutput(flags)) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  index: i + 1,
                  error: err instanceof Error ? err.message : String(err),
                  channel: args.channel
                }, flags))
              } else {
                this.log(`Error publishing message ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
              }
            }
          }
          
          // Delay before sending next message if not the last one
          if (i < count - 1 && delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
        
        // Wait for all publishes to complete (or timeout after a reasonable period)
        const maxWaitTime = Math.max(5000, count * delay * 2) // At least 5 seconds or twice the expected duration
        const startWaitTime = Date.now()
        
        await new Promise<void>(resolve => {
          const checkInterval = setInterval(() => {
            if (publishedCount + errorCount >= count || (Date.now() - startWaitTime > maxWaitTime)) {
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
              published: publishedCount,
              errors: errorCount,
              results
            }, flags))
          } else {
            this.log(`${chalk.green('✓')} ${publishedCount}/${count} messages published successfully${errorCount > 0 ? ` (${chalk.red(errorCount)} errors)` : ''}.`)
          }
        }
      } else {
        // Single message - await the publish for better error handling
        try {
          // Apply interpolation to the message
          const interpolatedMessage = this.interpolateMessage(args.message, 1)
          
          // Parse the message
          let messageData
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

          // Publish the message
          await channel.publish(message)
          
          if (!this.shouldSuppressOutput(flags)) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: true,
                message,
                channel: args.channel
              }, flags))
            } else {
              this.log(`${chalk.green('✓')} Message published successfully.`)
            }
          }
        } catch (error) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              channel: args.channel
            }, flags))
          } else {
            this.error(`Failed to publish message: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }, flags))
      } else {
        this.error(`Failed to publish message: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  
  async publishWithRealtime(args: any, flags: any): Promise<void> {
    // Declare realtime outside try block for scope
    let realtime: Ably.Realtime | null = null
    
    try {
      // Create Ably client
      realtime = await this.createAblyClient(flags)
      
      if (!realtime) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            error: 'Failed to create Ably client. Please check your API key and try again.'
          }, flags))
          return
        } else {
          this.error('Failed to create Ably client. Please check your API key and try again.')
          return
        }
      }

      if (!this.shouldSuppressOutput(flags)) {
        this.log('Using Realtime transport')
      }

      // Get the channel
      const channel = realtime.channels.get(args.channel)
      
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
        this.log(`Publishing ${count} messages with ${delay}ms delay...`)
      }
      
      // Track publish progress
      let publishedCount = 0
      let errorCount = 0
      let results: any[] = []
      
      // Publish messages
      if (count > 1) {
        // Publishing multiple messages without awaiting each publish
        let progressInterval: NodeJS.Timeout | undefined
        
        if (!this.shouldSuppressOutput(flags)) {
          progressInterval = setInterval(() => {
            this.log(`Progress: ${publishedCount}/${count} messages published (${errorCount} errors)`)
          }, 1000)
        }
        
        for (let i = 0; i < count; i++) {
          // Apply interpolation to the message
          const interpolatedMessage = this.interpolateMessage(args.message, i + 1)
          
          // Parse the message
          let messageData
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

          try {
            // Publish the message
            await channel.publish(message)
            publishedCount++
            results.push({
              success: true,
              index: i + 1,
              message,
              channel: args.channel
            })
            
            if (!this.shouldSuppressOutput(flags)) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  index: i + 1,
                  message,
                  channel: args.channel
                }, flags))
              } else {
                this.log(`${chalk.green('✓')} Message published successfully.`)
              }
            }
          } catch (err) {
            errorCount++
            results.push({
              success: false,
              index: i + 1,
              error: err instanceof Error ? err.message : String(err),
              channel: args.channel
            })
            
            if (!this.shouldSuppressOutput(flags)) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  index: i + 1,
                  error: err instanceof Error ? err.message : String(err),
                  channel: args.channel
                }, flags))
              } else {
                this.log(`Error publishing message ${i + 1}: ${err instanceof Error ? err.message : String(err)}`)
              }
            }
          }
          
          // Delay before sending next message if not the last one
          if (i < count - 1 && delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
        
        // Wait for all publishes to complete (or timeout after a reasonable period)
        const maxWaitTime = Math.max(5000, count * delay * 2) // At least 5 seconds or twice the expected duration
        const startWaitTime = Date.now()
        
        await new Promise<void>(resolve => {
          const checkInterval = setInterval(() => {
            if (publishedCount + errorCount >= count || (Date.now() - startWaitTime > maxWaitTime)) {
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
              published: publishedCount,
              errors: errorCount,
              results
            }, flags))
          } else {
            this.log(`${chalk.green('✓')} ${publishedCount}/${count} messages published successfully${errorCount > 0 ? ` (${chalk.red(errorCount)} errors)` : ''}.`)
          }
        }
      } else {
        // Single message - await the publish for better error handling
        try {
          // Apply interpolation to the message
          const interpolatedMessage = this.interpolateMessage(args.message, 1)
          
          // Parse the message
          let messageData
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

          // Publish the message
          await channel.publish(message)
          
          if (!this.shouldSuppressOutput(flags)) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: true,
                message,
                channel: args.channel
              }, flags))
            } else {
              this.log(`${chalk.green('✓')} Message published successfully.`)
            }
          }
        } catch (error) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              success: false,
              error: error instanceof Error ? error.message : String(error),
              channel: args.channel
            }, flags))
          } else {
            this.error(`Failed to publish message: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
      
      // Close connection when done
      realtime.close()
    } catch (error) {
      // Close connection in case of error
      if (realtime) {
        realtime.close()
      }
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }, flags))
      } else {
        this.error(`Failed to publish message: ${error instanceof Error ? error.message : String(error)}`)
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