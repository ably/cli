import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'
import type { SpaceMember, ProfileData } from '@ably/spaces'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

export default class SpacesMembersSubscribe extends SpacesBaseCommand {
  static override description = 'Subscribe to member presence events in a space'

  static override examples = [
    '$ ably spaces members subscribe my-space',
    '$ ably spaces members subscribe my-space --format json',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  static override args = {
    spaceId: Args.string({
      description: 'Space ID to subscribe to members for',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesMembersSubscribe)
    
    let clients: SpacesClients | null = null
    let subscription: any = null
    let cleanupInProgress = false
    
    // Keep track of the last event we've seen for each client to avoid duplicates
    const lastSeenEvents = new Map<string, {action: string, timestamp: number}>()
    
    try {
      // Create Spaces client
      clients = await this.createSpacesClient(flags)
      if (!clients) return

      const { spacesClient } = clients
      const spaceId = args.spaceId
      
      // Get the space
      const space = await spacesClient.get(spaceId)
      
      // Attach to the space
      await space.enter()
      this.log(`${chalk.green('Successfully entered space:')} ${chalk.cyan(spaceId)}`)
      
      // Get current members
      this.log(`Fetching current members for space ${chalk.cyan(spaceId)}...`)
      
      const members = await space.members.getAll()
      
      // Output current members based on format
      if (flags.format === 'json') {
        this.log(JSON.stringify(members, null, 2))
      } else {
        if (members.length === 0) {
          this.log(chalk.yellow('No members are currently present in this space.'))
        } else {
          this.log(`\n${chalk.cyan('Current members')} (${chalk.bold(members.length.toString())}):\n`)
          
          members.forEach((member) => {
            this.log(`- ${chalk.blue(member.clientId || 'Unknown')}`)
            
            if (member.profileData && Object.keys(member.profileData).length > 0) {
              this.log(`  ${chalk.dim('Profile:')} ${JSON.stringify(member.profileData, null, 2)}`)
            }
            
            if (member.connectionId) {
              this.log(`  ${chalk.dim('Connection ID:')} ${member.connectionId}`)
            }
            
            if (member.isConnected === false) {
              this.log(`  ${chalk.dim('Status:')} Not connected`)
            }
          })
        }
      }
      
      // Subscribe to member presence events
      this.log(`\n${chalk.dim('Subscribing to member events. Press Ctrl+C to exit.')}\n`)
      
      subscription = await space.members.subscribe('update', (member) => {
        const timestamp = new Date().toISOString()
        const now = Date.now()
        
        // Determine the action from the member's lastEvent
        const action = member.lastEvent?.name || 'unknown'
        const clientId = member.clientId || 'Unknown'
        const connectionId = member.connectionId || 'Unknown'
        
        // Create a unique key for this client+connection combination
        const clientKey = `${clientId}:${connectionId}`
        
        // Check if we've seen this exact event recently (within 500ms)
        // This helps avoid duplicate enter/leave events that might come through
        const lastEvent = lastSeenEvents.get(clientKey)
        
        if (lastEvent && 
            lastEvent.action === action && 
            (now - lastEvent.timestamp) < 500) {
          // Skip duplicate events within 500ms window
          return
        }
        
        // Update the last seen event for this client+connection
        lastSeenEvents.set(clientKey, {
          action,
          timestamp: now
        })
        
        if (flags.format === 'json') {
          const jsonOutput = {
            timestamp,
            action,
            member: {
              clientId: member.clientId,
              profileData: member.profileData,
              connectionId: member.connectionId,
              isConnected: member.isConnected
            }
          }
          this.log(JSON.stringify(jsonOutput))
        } else {
          let actionSymbol = '•'
          let actionColor = chalk.white
          
          switch (action) {
            case 'enter':
              actionSymbol = '✓'
              actionColor = chalk.green
              break
            case 'leave':
              actionSymbol = '✗'
              actionColor = chalk.red
              break
            case 'update':
              actionSymbol = '⟲'
              actionColor = chalk.yellow
              break
          }
          
          this.log(`[${timestamp}] ${actionColor(actionSymbol)} ${chalk.blue(clientId)} ${actionColor(action)}`)
          
          if (member.profileData && Object.keys(member.profileData).length > 0) {
            this.log(`  ${chalk.dim('Profile:')} ${JSON.stringify(member.profileData, null, 2)}`)
          }
          
          if (connectionId !== 'Unknown') {
            this.log(`  ${chalk.dim('Connection ID:')} ${connectionId}`)
          }
          
          if (member.isConnected === false) {
            this.log(`  ${chalk.dim('Status:')} Not connected`)
          }
        }
      })

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          if (cleanupInProgress) return
          cleanupInProgress = true
          
          this.log(`\n${chalk.yellow('Unsubscribing and closing connection...')}`)
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            this.log(chalk.red('Force exiting after timeout...'))
            process.exit(1)
          }, 5000)
          
          try {
            // Unsubscribe from member events
            if (subscription) {
              subscription.unsubscribe()
            }
            
            try {
              await space.leave()
              this.log(chalk.green('Successfully left the space.'))
            } catch (error) {
              this.log(`Error leaving space: ${error instanceof Error ? error.message : String(error)}`)
            }
            
            if (clients?.realtimeClient) {
              clients.realtimeClient.close()
            }
            
            this.log(chalk.green('Successfully disconnected.'))
            clearTimeout(forceExitTimeout)
            resolve()
            // Force exit after cleanup
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
      this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 