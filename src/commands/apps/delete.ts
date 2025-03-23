import { Args, Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import * as readline from 'readline'

export default class AppsDeleteCommand extends ControlBaseCommand {
  static description = 'Delete an app'

  static examples = [
    '$ ably apps delete app-id',
    '$ ably apps delete app-id --access-token "YOUR_ACCESS_TOKEN"',
    '$ ably apps delete app-id --force',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'force': Flags.boolean({
      description: 'Skip confirmation prompt',
      default: false,
      char: 'f',
    }),
  }

  static args = {
    id: Args.string({
      description: 'App ID to delete',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsDeleteCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // If not using force flag, get app details and prompt for confirmation
      if (!flags.force) {
        const app = await controlApi.getApp(args.id)
        
        this.log(`\nYou are about to delete the following app:`)
        this.log(`App ID: ${app.id}`)
        this.log(`Name: ${app.name}`)
        this.log(`Status: ${app.status}`)
        this.log(`Account ID: ${app.accountId}`)
        this.log(`Created: ${this.formatDate(app.created)}`)
        
        const confirmed = await this.promptForConfirmation(`\nAre you sure you want to delete app "${app.name}" (${app.id})? This action cannot be undone. [y/N]`)
        
        if (!confirmed) {
          this.log('Deletion cancelled')
          return
        }
      }
      
      this.log(`Deleting app ${args.id}...`)
      
      await controlApi.deleteApp(args.id)
      
      this.log('App deleted successfully')
    } catch (error) {
      this.error(`Error deleting app: ${error instanceof Error ? error.message : String(error)}`)
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