import { Args, Flags } from '@oclif/core'
import { SpacesBaseCommand } from '../../../spaces-base-command.js'
import chalk from 'chalk'

interface SpacesClients {
  spacesClient: any;
  realtimeClient: any;
}

export default class SpacesLocksGet extends SpacesBaseCommand {
  static override description = 'Get information about a specific lock'

  static override examples = [
    '$ ably spaces locks get my-space my-lock-id',
    '$ ably spaces locks get my-space my-lock-id --format json',
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
      description: 'Space ID to get lock from',
      required: true,
    }),
    lockId: Args.string({
      description: 'ID of the lock to get',
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
      
      // Enter the space temporarily
      await space.enter()
      this.log(`${chalk.green('Connected to space:')} ${chalk.cyan(spaceId)}`)
      
      // Get the specific lock
      try {
        const lock = await space.locks.get(lockId)
        
        // Output lock information based on format
        if (flags.format === 'json') {
          this.log(JSON.stringify(lock, null, 2))
        } else {
          this.log(`\n${chalk.cyan('Lock details for:')} ${chalk.blue(lockId)}\n`)
          
          this.log(`${chalk.dim('Status:')} ${lock.status}`)
          this.log(`${chalk.dim('Holder Client ID:')} ${lock.member?.clientId || 'None'}`)
          
          if (lock.attributes && Object.keys(lock.attributes).length > 0) {
            this.log(`${chalk.dim('Attributes:')} ${JSON.stringify(lock.attributes, null, 2)}`)
          }
        }
      } catch (error) {
        this.log(chalk.yellow(`Lock ${lockId} does not exist or could not be retrieved.`))
        if (flags.format === 'json') {
          this.log(JSON.stringify({ error: 'Lock not found', lockId }, null, 2))
        }
      }
      
      // Leave the space
      await space.leave()
      this.log(chalk.green('\nSuccessfully disconnected.'))
      process.exit(0)
    } catch (error) {
      this.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (clients?.realtimeClient) {
        clients.realtimeClient.close()
      }
    }
  }
} 