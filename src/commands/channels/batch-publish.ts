import {Args, Flags} from '@oclif/core'
import * as Ably from 'ably'

import {AblyBaseCommand} from '../../base-command.js'

// --- Types for Ably Batch Publish/Response ---
interface BatchSpec {
  channels: string | string[];
  messages: Ably.Message | Ably.Message[];
}

interface AblyError {
  code: number;
  href?: string;
  message: string;
  statusCode: number;
}

interface BatchResponseItem {
  channel: string;
  error?: AblyError;
  messageId?: string;
}

interface BatchErrorResponse {
  batchResponse?: BatchResponseItem[];
  error: AblyError;
}

interface BatchSuccessResponse {
  batchResponse: BatchResponseItem[]; // Assuming success means all items might have messageId
  success: boolean;
}
// --- End Types ---

export default class ChannelsBatchPublish extends AblyBaseCommand {
  static override args = {
    message: Args.string({
      description: 'The message to publish (JSON format or plain text, not needed if using --spec)',
      required: false,
    }),
  }

  static override description = 'Publish messages to multiple Ably channels with a single request'

  static override examples = [
    '$ ably channels batch-publish --channels channel1,channel2 \'{"data":"Message to multiple channels"}\'',
    '$ ably channels batch-publish --channels channel1,channel2 --name event \'{"text":"Hello World"}\'',
    '$ ably channels batch-publish --channels-json \'["channel1", "channel2"]\' \'{"data":"Using JSON array for channels"}\'',
    '$ ably channels batch-publish --spec \'{"channels": ["channel1", "channel2"], "messages": {"data": "Using complete batch spec"}}\'',
    '$ ably channels batch-publish --spec \'[{"channels": "channel1", "messages": {"data": "First spec"}}, {"channels": "channel2", "messages": {"data": "Second spec"}}]\'',
    '$ ably channels batch-publish --channels channel1,channel2 \'{"data":"Message"}\' --json',
    '$ ably channels batch-publish --channels channel1,channel2 \'{"data":"Message"}\' --pretty-json'
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    channels: Flags.string({
      description: 'Comma-separated list of channel names to publish to',
      exclusive: ['channels-json', 'spec'],
    }),
    'channels-json': Flags.string({
      description: 'JSON array of channel names to publish to',
      exclusive: ['channels', 'spec'],
    }),
    encoding: Flags.string({
      char: 'e',
      description: 'The encoding for the message',
      exclusive: ['spec'],
    }),
    name: Flags.string({
      char: 'n',
      description: 'The event name (if not specified in the message JSON)',
      exclusive: ['spec'],
    }),
    spec: Flags.string({
      description: 'Complete batch spec JSON (either a single BatchSpec object or an array of BatchSpec objects)',
      exclusive: ['channels', 'channels-json', 'name', 'encoding'],
    }),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ChannelsBatchPublish)
    
    // Show authentication information
    this.showAuthInfoIfNeeded(flags)
    
    try {
      // Create REST client with the options
      const options = this.getClientOptions(flags)
      const rest = new Ably.Rest(options)
      
      // Prepare the batch request content
      let batchContent: any
      
      if (flags.spec) {
        // Use the provided spec directly
        try {
          batchContent = JSON.parse(flags.spec)
        } catch (error) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              error: `Failed to parse spec JSON: ${error instanceof Error ? error.message : String(error)}`,
              success: false
            }, flags))
            return
          }

          this.error(`Failed to parse spec JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
      } else {
        // Build the batch content from flags and args
        let channels: string[] = []
        
        if (flags.channels) {
          channels = flags.channels.split(',').map(c => c.trim())
        } else if (flags['channels-json']) {
          try {
            const parsedChannels = JSON.parse(flags['channels-json'])
            if (!Array.isArray(parsedChannels)) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  error: 'channels-json must be a valid JSON array of channel names',
                  success: false
                }, flags))
                return
              }

              this.error('channels-json must be a valid JSON array of channel names')
            }

            channels = parsedChannels
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                error: `Failed to parse channels-json: ${error instanceof Error ? error.message : String(error)}`,
                success: false
              }, flags))
              return
            }

            this.error(`Failed to parse channels-json: ${error instanceof Error ? error.message : String(error)}`)
          }
        } else {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              error: 'You must specify either --channels, --channels-json, or --spec',
              success: false
            }, flags))
            return
          }

          this.error('You must specify either --channels, --channels-json, or --spec')
        }
        
        if (!args.message) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              error: 'Message is required when not using --spec',
              success: false
            }, flags))
            return
          }

          this.error('Message is required when not using --spec')
        }

        // Parse the message
        let messageData: any
        try {
          messageData = JSON.parse(args.message)
        } catch {
          // If parsing fails, use the raw message as data
          messageData = { data: args.message }
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

        // Create the batch spec
        batchContent = {
          channels,
          messages: message
        }
      }
      
      if (!this.shouldSuppressOutput(flags)) {
        this.log('Sending batch publish request...')
      }

      // Make the batch publish request using the REST client's request method
      const response = await rest.request('post', '/messages', 2, null, batchContent)
  
      if (response.statusCode >= 200 && response.statusCode < 300) {
        // Success response
        const responseItems = response.items || []
        
        if (!this.shouldSuppressOutput(flags)) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              channels: Array.isArray(batchContent.channels) ? batchContent.channels : [batchContent.channels],
              message: batchContent.messages,
              response: responseItems,
              success: true
            }, flags))
          } else {
            this.log('Batch publish successful!')
            this.log(`Response: ${this.formatJsonOutput(responseItems, flags)}`)
          }
        }
      } else if (response.statusCode === 400) {
        // Partial success or error
        const responseData = response.items
        
        // Handle the error response which could contain a batchResponse field
        if (responseData && typeof responseData === 'object') {
          const errorInfo = responseData as any
          
          if (errorInfo.error && errorInfo.error.code === 40_020 && errorInfo.batchResponse) {
            // This is a partial success with batchResponse field
            if (!this.shouldSuppressOutput(flags)) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  channels: Array.isArray(batchContent.channels) ? batchContent.channels : [batchContent.channels],
                  error: errorInfo.error,
                  message: batchContent.messages,
                  partial: true,
                  response: errorInfo.batchResponse,
                  success: false
                }, flags))
              } else {
                this.log('Batch publish partially successful (some messages failed).')
                // Format batch response in a friendly way
                const batchResponses = errorInfo.batchResponse as any[]
                batchResponses.forEach((item: any) => {
                  if (item.error) {
                    this.log(`Failed to publish to channel '${item.channel}': ${item.error.message} (${item.error.code})`)
                  } else {
                    this.log(`Published to channel '${item.channel}' with messageId: ${item.messageId}`)
                  }
                })
              }
            }
          } else {
            // Complete failure
            const errorMessage = errorInfo.error ? errorInfo.error.message : 'Unknown error'
            const errorCode = errorInfo.error ? errorInfo.error.code : response.statusCode
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                error: {
                  code: errorCode,
                  message: errorMessage
                },
                success: false
              }, flags))
            } else {
              this.error(`Batch publish failed: ${errorMessage} (${errorCode})`)
            }
          }
        } else if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({
              error: {
                code: response.statusCode,
                message: `Batch publish failed with status code ${response.statusCode}`
              },
              success: false
            }, flags))
          } else {
            this.error(`Batch publish failed with status code ${response.statusCode}`)
          }
      } else {
        // Other error response
        const responseData = response.items
        let errorMessage = 'Unknown error'
        let errorCode = response.statusCode
        
        if (responseData && typeof responseData === 'object') {
          const errorInfo = responseData as any
          if (errorInfo.error) {
            errorMessage = errorInfo.error.message || errorMessage
            errorCode = errorInfo.error.code || errorCode
          }
        }
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            error: {
              code: errorCode,
              message: errorMessage
            },
            success: false
          }, flags))
        } else {
          this.error(`Batch publish failed: ${errorMessage} (${errorCode})`)
        }
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          error: error instanceof Error ? error.message : String(error),
          success: false
        }, flags))
      } else {
        this.error(`Failed to execute batch publish: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
} 