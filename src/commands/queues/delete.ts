import { Args, Flags } from '@oclif/core'
import * as readline from 'node:readline'

import { ControlBaseCommand } from '../../control-base-command.js'

export default class QueuesDeleteCommand extends ControlBaseCommand {
  static args = {
    queueName: Args.string({
      description: 'Name of the queue to delete',
      required: true,
    }),
  }

  static description = 'Delete a queue'

  static examples = [
    '$ ably queues delete my-queue',
    '$ ably queues delete my-queue --app "My App"',
    '$ ably queues delete my-queue --force',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID or name to delete the queue from',
      required: false,
    }),
    'force': Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force deletion without confirmation',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(QueuesDeleteCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      // Get all queues and find the one we want to delete
      const queues = await controlApi.listQueues(appId)
      const queue = queues.find(q => q.name === args.queueName)
      
      if (!queue) {
        this.error(`Queue "${args.queueName}" not found`)
        return
      }
      
      // If not using force flag, prompt for confirmation
      if (!flags.force) {
        this.log(`\nYou are about to delete the following queue:`)
        this.log(`Queue ID: ${queue.id}`)
        this.log(`Name: ${queue.name}`)
        this.log(`Region: ${queue.region}`)
        this.log(`State: ${queue.state}`)
        this.log(`Messages: ${queue.messages.total} total (${queue.messages.ready} ready, ${queue.messages.unacknowledged} unacknowledged)`)
        
        const confirmed = await this.promptForConfirmation(`\nAre you sure you want to delete queue "${queue.name}"? [y/N]`)
        
        if (!confirmed) {
          this.log('Deletion cancelled')
          return
        }
      }
      
      await controlApi.deleteQueue(appId, args.queueName)
      
      this.log(`Queue "${args.queueName}" deleted successfully`)
    } catch (error) {
      this.error(`Error deleting queue: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  private async promptForConfirmation(message: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise<boolean>((resolve) => {
      rl.question(message + ' ', (answer) => {
        rl.close()
        resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes')
      })
    })
  }
} 