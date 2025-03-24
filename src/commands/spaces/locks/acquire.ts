import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'
import Spaces from '@ably/spaces'
import * as Ably from 'ably'

interface SpacesClients {
  spacesClient: Spaces;
  realtimeClient: Ably.Realtime;
}

export default class SpacesLocksAcquire extends SpacesBaseCommand {
  static override description = 'Acquire a lock in a space'

  static override examples = [
    '$ ably spaces locks acquire my-space my-lock-id',
    '$ ably spaces locks acquire my-space my-lock-id --data \'{"type":"editor"}\'',
  ]

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
    data: Flags.string({
      description: 'Optional data to associate with the lock (JSON format)',
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
      description: 'Space ID to acquire lock in',
      required: true,
    }),
    lockId: Args.string({
      description: 'ID of the lock to acquire',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocksAcquire)
    
    let clients: SpacesClients | null = null
    let subscription: any = null
    let cleanupInProgress = false
    
    try {
      // Create Spaces client
      clients = await this.createSpacesClient(flags)
      if (!clients) return

      const { spacesClient } = clients
      const spaceId = args.spaceId
      const lockId = args.lockId
      
      // Parse lock data if provided
      let lockData: any = undefined
      if (flags.data) {
        try {
          lockData = JSON.parse(flags.data)
        } catch (error) {
          this.error(`Invalid lock data JSON: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      
      // Get the space
      const space = await spacesClient.get(spaceId)
      
      // Enter the space first
      await space.enter()
      this.log(`${chalk.green('Successfully entered space:')} ${chalk.cyan(spaceId)}`)
      
      // Try to acquire the lock
      try {
        const lock = await space.locks.acquire(lockId, lockData)
        this.log(`${chalk.green('Successfully acquired lock:')} ${chalk.cyan(lockId)}`)
        
        if (lockData) {
          this.log(`${chalk.dim('Lock data:')} ${JSON.stringify(lockData, null, 2)}`)
        }
      } catch (error) {
        this.error(`Failed to acquire lock: ${error instanceof Error ? error.message : String(error)}`)
      }

      // Keep the process running until interrupted
      await new Promise<void>((resolve) => {
        const cleanup = async () => {
          if (cleanupInProgress) return
          cleanupInProgress = true
          
          this.log(`\n${chalk.yellow('Releasing lock and closing connection...')}`)
          
          // Set a force exit timeout
          const forceExitTimeout = setTimeout(() => {
            this.log(chalk.red('Force exiting after timeout...'))
            process.exit(1)
          }, 5000)
          
          try {
            // Unsubscribe from lock events
            if (subscription) {
              subscription.unsubscribe()
            }
            
            try {
              // Release the lock
              await space.locks.release(lockId)
              this.log(chalk.green('Successfully released lock.'))
              
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