import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ChannelsPresenceSubscribe extends AblyBaseCommand {
  static override description = 'Subscribe to presence events on a channel'

  static override examples = [
    '$ ably channels presence subscribe my-channel',
    '$ ably channels presence subscribe my-channel --json',
    '$ ably channels presence subscribe my-channel --pretty-json']

  static override flags = {
    ...AblyBaseCommand.globalFlags,
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
      
      // Setup connection state change handler
      client.connection.on('connected', () => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            status: 'connected',
            channel: channelName
          }, flags))
        } else {
          this.log('Successfully connected to Ably')
        }
      })

      client.connection.on('disconnected', () => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            status: 'disconnected',
            channel: channelName
          }, flags))
        } else {
          this.log('Disconnected from Ably')
        }
      })

      client.connection.on('failed', (err: Ably.ConnectionStateChange) => {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            status: 'failed',
            error: err.reason?.message || 'Unknown error',
            channel: channelName
          }, flags))
        } else {
          this.error(`Connection failed: ${err.reason?.message || 'Unknown error'}`)
        }
      })
      
      // Get current presence set
      if (!this.shouldOutputJson(flags)) {
        this.log(`Fetching current presence members for channel ${chalk.cyan(channelName)}...`)
      }
      
      const members = await channel.presence.get()
      
      // Output current members based on format
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: true,
          timestamp: new Date().toISOString(),
          channel: channelName,
          members: members.map(member => ({
            clientId: member.clientId,
            connectionId: member.connectionId,
            data: member.data
          }))
        }, flags))
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
      
      if (!this.shouldOutputJson(flags)) {
        this.log('\nSubscribing to presence events. Press Ctrl+C to exit.\n')
      }
      
      channel.presence.subscribe('enter', (presenceMessage) => {
        const timestamp = presenceMessage.timestamp 
          ? new Date(presenceMessage.timestamp).toISOString() 
          : new Date().toISOString()
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            action: 'enter',
            channel: channelName,
            member: {
              clientId: presenceMessage.clientId,
              connectionId: presenceMessage.connectionId,
              data: presenceMessage.data
            }
          }, flags))
        } else {
          this.log(`[${chalk.dim(timestamp)}] ${chalk.green('✓')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} entered presence`)
          
          if (presenceMessage.data && Object.keys(presenceMessage.data).length > 0) {
            this.log(`  Data: ${this.formatJsonOutput(presenceMessage.data, flags)}`)
          }
        }
      })
      
      channel.presence.subscribe('leave', (presenceMessage) => {
        const timestamp = presenceMessage.timestamp 
          ? new Date(presenceMessage.timestamp).toISOString() 
          : new Date().toISOString()
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            action: 'leave',
            channel: channelName,
            member: {
              clientId: presenceMessage.clientId,
              connectionId: presenceMessage.connectionId,
              data: presenceMessage.data
            }
          }, flags))
        } else {
          this.log(`[${chalk.dim(timestamp)}] ${chalk.red('✗')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} left presence`)
        }
      })
      
      channel.presence.subscribe('update', (presenceMessage) => {
        const timestamp = presenceMessage.timestamp 
          ? new Date(presenceMessage.timestamp).toISOString() 
          : new Date().toISOString()
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: true,
            timestamp,
            action: 'update',
            channel: channelName,
            member: {
              clientId: presenceMessage.clientId,
              connectionId: presenceMessage.connectionId,
              data: presenceMessage.data
            }
          }, flags))
        } else {
          this.log(`[${chalk.dim(timestamp)}] ${chalk.yellow('⟲')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} updated presence data:`)
          
          if (presenceMessage.data && Object.keys(presenceMessage.data).length > 0) {
            this.log(`  Data: ${this.formatJsonOutput(presenceMessage.data, flags)}`)
          }
        }
      })
      
      // Keep the process running until interrupted
      await new Promise((resolve) => {
        let cleanupInProgress = false
        
        const cleanup = async () => {
          if (cleanupInProgress) return
          cleanupInProgress = true
          
          if (!this.shouldOutputJson(flags)) {
            this.log('\nUnsubscribing from presence events and closing connection...')
          }
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                error: 'Force exiting after timeout',
                channel: channelName
              }, flags))
            } else {
              this.log(chalk.red('Force exiting after timeout...'))
            }
            process.exit(1)
          }, 5000)
          
          try {
            try {
              // Attempt to unsubscribe from presence
              channel.presence.unsubscribe()
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  action: 'unsubscribed',
                  channel: channelName
                }, flags))
              } else {
                this.log(chalk.green('Successfully unsubscribed from presence events.'))
              }
            } catch (error) {
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: false,
                  error: error instanceof Error ? error.message : String(error),
                  channel: channelName
                }, flags))
              } else {
                this.log(`Note: ${error instanceof Error ? error.message : String(error)}`)
                this.log('Continuing with connection close.')
              }
            }
            
            // Now close the connection
            if (client) {
              client.close()
              if (this.shouldOutputJson(flags)) {
                this.log(this.formatJsonOutput({
                  success: true,
                  status: 'closed',
                  channel: channelName
                }, flags))
              } else {
                this.log(chalk.green('Successfully closed connection.'))
              }
            }
            
            clearTimeout(forceExitTimeout)
            resolve(null)
            process.exit(0)
          } catch (error) {
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                channel: channelName
              }, flags))
            } else {
              this.log(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`)
            }
            clearTimeout(forceExitTimeout)
            process.exit(1)
          }
        }
        
        process.once('SIGINT', () => void cleanup())
        process.once('SIGTERM', () => void cleanup())
      })
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          channel: args.channel
        }, flags))
      } else {
        this.error(`Error subscribing to presence: ${error instanceof Error ? error.message : String(error)}`)
      }
    } finally {
      if (client) client.close()
    }
  }
} 