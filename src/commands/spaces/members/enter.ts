import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'
import type { ProfileData } from '@ably/spaces'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

export default class SpacesMembersEnter extends SpacesBaseCommand {
  static override description = 'Enter a space and remain present until terminated'

  static override examples = [
    '$ ably spaces members enter my-space',
    '$ ably spaces members enter my-space --profile \'{"name":"User","status":"active"}\'',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    profile: Flags.string({
      description: 'Optional profile data to include with the member (JSON format)',
      required: false,
    }),
    'format': Flags.string({
      description: 'Output format',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
  }

  static override args = {
    spaceId: Args.string({
      description: 'Space ID to enter',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesMembersEnter)
    
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
      
      // Parse profile data if provided
      let profileData: ProfileData | undefined
      if (flags.profile) {
        try {
          profileData = JSON.parse(flags.profile)
        } catch (error) {
          this.error(`Invalid profile JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      
      // Get the space
      const space = await spacesClient.get(spaceId)
      
      // Enter the space with optional profile
      await space.enter(profileData)
      this.log(`${chalk.green('Successfully entered space:')} ${chalk.cyan(spaceId)}`)
      
      if (profileData) {
        this.log(`${chalk.dim('Profile:')} ${JSON.stringify(profileData, null, 2)}`)
      }
      
      // Subscribe to member presence events to show other members' activities
      this.log(`\n${chalk.dim('Watching for other members. Press Ctrl+C to exit.')}\n`)
      
      subscription = await space.members.subscribe('update', (member) => {
        const timestamp = new Date().toISOString()
        const now = Date.now()
        
        // Determine the action from the member's lastEvent
        const action = member.lastEvent?.name || 'unknown'
        const clientId = member.clientId || 'Unknown'
        const connectionId = member.connectionId || 'Unknown'
        
        // Skip self events - check connection ID instead of isCurrentMember
        const selfConnectionId = clients?.realtimeClient.connection.id
        if (member.connectionId === selfConnectionId) {
          return
        }
        
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
          
          this.log(`\n${chalk.yellow('Leaving space and closing connection...')}`)
          
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