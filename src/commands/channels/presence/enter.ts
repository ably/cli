import { Args, Flags } from '@oclif/core'
import { AblyBaseCommand } from '../../../base-command.js'
import * as Ably from 'ably'
import chalk from 'chalk'

export default class ChannelsPresenceEnter extends AblyBaseCommand {
  static override description = 'Enter presence on a channel and remain present until terminated'

  static override examples = [
    '$ ably channels presence enter my-channel',
    '$ ably channels presence enter my-channel --data \'{"status":"online"}\'',
    '$ ably channels presence enter my-channel --client-id "user123"',
  ]

  static override flags = {
    ...AblyBaseCommand.globalFlags,
    'data': Flags.string({
      description: 'Presence data to publish (JSON string)',
      default: '{}',
    }),
    'show-others': Flags.boolean({
      description: 'Show other presence events while present',
      default: true,
    }),
  }

  static override args = {
    channel: Args.string({
      description: 'Channel name to enter presence on',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelsPresenceEnter)

    let client: Ably.Realtime | null = null

    try {
      // Create the Ably client
      client = await this.createAblyClient(flags)
      if (!client) return

      const channelName = args.channel
      
      // Get the channel
      const channel = client.channels.get(channelName)
      
      // Parse the data
      let presenceData = {}
      try {
        presenceData = JSON.parse(flags.data)
      } catch (error) {
        this.error('Invalid JSON data format. Please provide a valid JSON string.')
        return
      }

      // Setup presence event handlers if we're showing other presence events
      if (flags['show-others']) {
        channel.presence.subscribe('enter', (presenceMessage) => {
          if (presenceMessage.clientId !== client?.auth.clientId) {
            this.log(`${chalk.green('✓')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} entered presence`)
          }
        })

        channel.presence.subscribe('leave', (presenceMessage) => {
          if (presenceMessage.clientId !== client?.auth.clientId) {
            this.log(`${chalk.red('✗')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} left presence`)
          }
        })

        channel.presence.subscribe('update', (presenceMessage) => {
          if (presenceMessage.clientId !== client?.auth.clientId) {
            this.log(`${chalk.yellow('⟲')} ${chalk.blue(presenceMessage.clientId || 'Unknown')} updated presence data:`)
            if (this.shouldOutputJson(flags)) {
              this.log(this.formatJsonOutput(presenceMessage.data, flags))
            } else {
              this.log(`Successfully entered presence on channel '${channelName}'`)
              this.log(`  Client ID: ${presenceMessage.clientId}`)
              if (presenceMessage.data) {
                this.log(`  Data: ${this.formatJsonOutput(presenceMessage.data, flags)}`)
              }
            }
          }
        })
      }

      // Enter presence
      await channel.presence.enter(presenceData)
      
      this.log(`${chalk.green('✓')} Entered presence on channel ${chalk.cyan(channelName)} as ${chalk.blue(client.auth.clientId)}`)
      
      if (flags['show-others']) {
        // Get and display current presence members
        const members = await channel.presence.get()
        
        if (members.length > 1) {
          this.log(`\nCurrent presence members (${members.length}):\n`)
          
          members.forEach(member => {
            if (member.clientId !== client?.auth.clientId) {
              this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
              if (member.data && Object.keys(member.data).length > 0) {
                this.log(`  Data: ${JSON.stringify(member.data, null, 2)}`)
              }
            }
          })
        } else {
          this.log('\nNo other clients are present in this channel')
        }
        
        this.log('\nListening for presence events until terminated. Press Ctrl+C to exit.')
      } else {
        this.log('\nStaying present until terminated. Press Ctrl+C to exit.')
      }

      // Keep the process running until interrupted
      await new Promise((resolve) => {
        let cleanupInProgress = false
        
        const cleanup = async () => {
          if (cleanupInProgress) return
          cleanupInProgress = true
          
          this.log('\nLeaving presence and closing connection...')
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            this.log(chalk.red('Force exiting after timeout...'))
            process.exit(1)
          }, 5000)
          
          try {
            try {
              // Try to leave presence first
              await channel.presence.leave()
              this.log(chalk.green('Successfully left presence.'))
            } catch (error) {
              // If leaving presence fails (likely due to channel being detached), just log and continue
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
      this.error(`Error entering presence: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (client) client.close()
    }
  }
} 