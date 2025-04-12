import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'
import type { LocationsEvents } from '@ably/spaces'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

export default class SpacesLocationsSet extends SpacesBaseCommand {
  static override description = 'Set your location in a space'

  static override examples = [
    '$ ably spaces locations set my-space --location \'{"x":10,"y":20}\'',
    '$ ably spaces locations set my-space --location \'{"sectionId":"section1"}\'',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    location: Flags.string({
      description: 'Location data to set (JSON format)',
      required: true,
    }),
    
  }

  static override args = {
    spaceId: Args.string({
      description: 'Space ID to set location in',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocationsSet)
    
    let clients: SpacesClients | null = null
    let subscription: any = null
    let cleanupInProgress = false
    
    try {
      // Create Spaces client
      clients = await this.createSpacesClient(flags)
      if (!clients) return

      const { spacesClient } = clients
      const spaceId = args.spaceId
      
      // Parse location data
      let location: Record<string, any>
      try {
        location = JSON.parse(flags.location)
      } catch (error) {
        this.error(`Invalid location JSON: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Get the space
      const space = await spacesClient.get(spaceId)
      
      // Enter the space first
      await space.enter()
      this.log(`${chalk.green('Successfully entered space:')} ${chalk.cyan(spaceId)}`)
      
      // Set the location
      await space.locations.set(location)
      this.log(`${chalk.green('Successfully set location:')} ${JSON.stringify(location, null, 2)}`)
      
      // Subscribe to location updates from other users
      this.log(`\n${chalk.dim('Watching for other location changes. Press Ctrl+C to exit.')}\n`)
      
      subscription = await space.locations.subscribe('update', (locationUpdate: LocationsEvents.UpdateEvent) => {
        const timestamp = new Date().toISOString()
        const member = locationUpdate.member
        const location = locationUpdate.currentLocation
        const connectionId = member.connectionId
        
        // Skip self events - check connection ID instead of isCurrentMember
        const selfConnectionId = clients?.realtimeClient.connection.id
        if (connectionId === selfConnectionId) {
          return
        }
        
        if (this.shouldOutputJson(flags)) {
          const jsonOutput = {
            timestamp,
            action: 'update',
            member: {
              clientId: member.clientId,
              connectionId: member.connectionId
            },
            location: location
          }
          this.log(JSON.stringify(jsonOutput))
        } else {
          // For locations, use yellow for updates
          const actionColor = chalk.yellow
          const action = 'update'
          
          this.log(`[${timestamp}] ${chalk.blue(member.clientId || 'Unknown')} ${actionColor(action)}d location:`)
          this.log(`  ${chalk.dim('Location:')} ${JSON.stringify(location, null, 2)}`)
        }
      })

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          if (cleanupInProgress) return
          cleanupInProgress = true
          
          this.log(`\n${chalk.yellow('Cleaning up and closing connection...')}`)
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            this.log(chalk.red('Force exiting after timeout...'))
            process.exit(1)
          }, 5000)
          
          try {
            // Unsubscribe from location events
            if (subscription) {
              subscription.unsubscribe()
            }
            
            try {
              // Clear the location - locations doesn't have a remove method but has a set method that can be called with null
              await space.locations.set(null)
              this.log(chalk.green('Successfully cleared location.'))
              
              // Leave the space
              await space.leave()
              this.log(chalk.green('Successfully left the space.'))
            } catch (error) {
              this.log(`Error during cleanup: ${error instanceof Error ? error.message : String(error)}`)
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