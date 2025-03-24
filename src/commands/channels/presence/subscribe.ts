import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ChannelsPresenceSubscribe extends AblyBaseCommand {
  static override description = 'Subscribe to presence events on a channel'

  static override examples = [
    '$ ably channels presence:subscribe my-channel',
    '$ ably channels presence:subscribe my-channel --format json',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  static override args = {
    channel: Args.string({
      description: 'Channel name to subscribe to presence on',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsPresenceSubscribe)
    
    let client: Ably.Realtime | null = null

    try {
      // Create the Ably client
      client = await this.createAblyClient(flags)
      if (!client) return

      const channelName = args.channel
      
      // Get the channel
      const channel = client.channels.get(channelName)
      
      // Get current presence set
      this.log(`Fetching current presence members for channel ${chalk.cyan(channelName)}...`)
      
      const members = await channel.presence.get()
      
      // Output current members based on format
      if (flags.format === 'json') {
        this.log(JSON.stringify(members, null, 2))
      } else {
        if (members.length === 0) {
          this.log('No members are currently present on this channel.')
        } else {
          this.log(`\nCurrent presence members (${chalk.cyan(members.length.toString())}):\n`)
          
          members.forEach(member => {
            this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
            
            if (member.data && Object.keys(member.data).length > 0) {
              this.log(`  Data: ${JSON.stringify(member.data, null, 2)}`)
            }
            
            if (member.connectionId) {
              this.log(`  Connection ID: ${chalk.dim(member.connectionId)}`)
            }
          })
        }
      }
      
      // Subscribe to presence events
      this.log('\nSubscribing to presence events. Press Ctrl+C to exit.\n')
      
      channel.presence.subscribe('enter', (presenceMessage) => {
        if (flags.format === 'json') {
          this.log(JSON.stringify({
            action: 'enter',
            timestamp: new Date().toISOString(),
            message: presenceMessage,
          }, null, 2))
        } else {
          const timestamp = presenceMessage.timestamp 
            ? new Date(presenceMessage.timestamp).toISOString() 
            : new Date().toISOString()
          
          this.log(`[${chalk.dim(timestamp)}] ${chalk.green('✓')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} entered presence`)
          
          if (presenceMessage.data && Object.keys(presenceMessage.data).length > 0) {
            this.log(`  Data: ${JSON.stringify(presenceMessage.data, null, 2)}`)
          }
        }
      })
      
      channel.presence.subscribe('leave', (presenceMessage) => {
        if (flags.format === 'json') {
          this.log(JSON.stringify({
            action: 'leave',
            timestamp: new Date().toISOString(),
            message: presenceMessage,
          }, null, 2))
        } else {
          const timestamp = presenceMessage.timestamp 
            ? new Date(presenceMessage.timestamp).toISOString() 
            : new Date().toISOString()
          
          this.log(`[${chalk.dim(timestamp)}] ${chalk.red('✗')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} left presence`)
        }
      })
      
      channel.presence.subscribe('update', (presenceMessage) => {
        if (flags.format === 'json') {
          this.log(JSON.stringify({
            action: 'update',
            timestamp: new Date().toISOString(),
            message: presenceMessage,
          }, null, 2))
        } else {
          const timestamp = presenceMessage.timestamp 
            ? new Date(presenceMessage.timestamp).toISOString() 
            : new Date().toISOString()
          
          this.log(`[${chalk.dim(timestamp)}] ${chalk.yellow('⟲')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} updated presence data:`)
          
          if (presenceMessage.data && Object.keys(presenceMessage.data).length > 0) {
            this.log(`  Data: ${JSON.stringify(presenceMessage.data, null, 2)}`)
          }
        }
      })
      
      // Keep the process running until interrupted
      await new Promise((resolve) => {
        let cleanupInProgress = false
        
        const cleanup = async () => {
          if (cleanupInProgress) return
          cleanupInProgress = true
          
          this.log('\nUnsubscribing from presence events and closing connection...')
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            this.log(chalk.red('Force exiting after timeout...'))
            process.exit(1)
          }, 5000)
          
          try {
            try {
              // Attempt to unsubscribe from presence
              channel.presence.unsubscribe()
              this.log(chalk.green('Successfully unsubscribed from presence events.'))
            } catch (error) {
              // If unsubscribing fails (likely due to channel being detached), just log and continue
              this.log(`Note: ${error instanceof Error ? error.message : String(error)}`)
              this.log('Continuing with connection close.')
            }
            
            // Now close the connection
            if (client) {
              client.close()
              this.log(chalk.green('Successfully closed connection.'))
            }
            
            clearTimeout(forceExitTimeout)
            resolve(null)
            process.exit(0)
          } catch (error) {
            this.log(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`)
            clearTimeout(forceExitTimeout)
            process.exit(1)
          }
        }
        
        process.once('SIGINT', () => void cleanup())
        process.once('SIGTERM', () => void cleanup())
      })
    } catch (error) {
      this.error(`Error subscribing to presence: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (client) client.close()
    }
  }
} 