import {Args, Flags} from '@oclif/core'
import * as Ably from 'ably'
import {AblyBaseCommand} from '../../base-command.js'

export default class ChannelsPublish extends AblyBaseCommand {
  static override description = 'Publish a message to an Ably channel'

  static override examples = [
    '$ ably channels publish my-channel \'{"name":"event","data":"Hello World"}\'',
    '$ ably channels publish --api-key "YOUR_API_KEY" my-channel \'{"data":"Simple message"}\'',
    '$ ably channels publish --name event my-channel \'{"text":"Hello World"}\'',
    '$ ably channels publish my-channel "Hello World"',
    '$ ably channels publish --name event my-channel "Plain text message"',
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
    
    // Declare realtime outside try block for scope
    let realtime: Ably.Realtime | null = null
    
    try {
      // Create Ably client
      realtime = await this.createAblyClient(flags)
      
      if (!realtime) {
        this.error('Failed to create Ably client. Please check your API key and try again.')
        return
      }
      
      // Parse the message
      let messageData
      try {
        messageData = JSON.parse(args.message)
      } catch (error) {
        // If parsing fails, use the raw message as data
        messageData = { data: args.message }
      }

      // Get the channel
      const channel = realtime.channels.get(args.channel)

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
      
      // Close connection when done
      realtime.close()
      this.log('Message published successfully.')
    } catch (error) {
      // Close connection in case of error
      if (realtime) {
        realtime.close()
      }
      this.error(`Failed to publish message: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 