import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'

interface SpacesClients {
  spacesClient: any;
  realtimeClient: any;
}

export default class SpacesLocksGet extends SpacesBaseCommand {
  static override description = 'Get a lock in a space'

  static override examples = [
    '$ ably spaces locks get my-space my-lock',
    '$ ably spaces locks get my-space my-lock --json',
    '$ ably spaces locks get my-space my-lock --pretty-json']

  static override flags = {
    ...SpacesBaseCommand.globalFlags,
  }

  static override args = {
    spaceId: Args.string({
      description: 'Space ID to get lock from',
      required: true,
    }),
    lockId: Args.string({
      description: 'Lock ID to get',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(SpacesLocksGet)
    
    let clients: SpacesClients | null = null
    
    try {
      // Create Spaces client
      clients = await this.createSpacesClient(flags)
      if (!clients) return

      const { spacesClient } = clients
      const spaceId = args.spaceId
      const lockId = args.lockId
      
      // Get the space
      const space = await spacesClient.get(spaceId)
      
      // Enter the space first
      await space.enter()
      this.log(`${chalk.green('Successfully entered space:')} ${chalk.cyan(spaceId)}`)
      
      // Try to get the lock
      try {
        const lock = await space.locks.get(lockId)
        
        if (!lock) {
          if (this.shouldOutputJson(flags)) {
            this.log(this.formatJsonOutput({ error: 'Lock not found', lockId }, flags))
          } else {
            this.log(chalk.yellow(`Lock '${lockId}' not found in space '${spaceId}'`))
          }
          return
        }
        
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput(lock, flags))
        } else {
          this.log(`${chalk.dim('Lock details:')} ${this.formatJsonOutput(lock, flags)}`)
        }
      } catch (error) {
        this.error(`Failed to get lock: ${error instanceof Error ? error.message : String(error)}`)
      }
    } catch (error) {
      this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 