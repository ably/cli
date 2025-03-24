import { Args, Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import * as readline from 'readline'
import AppsSwitch from './switch.js'

export default class AppsDeleteCommand extends ControlBaseCommand {
  static description = 'Delete an app'

  static examples = [
    '$ ably apps delete',
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
      description: 'App ID to delete (uses current app if not specified)',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AppsDeleteCommand)
    
    const controlApi = this.createControlApi(flags)
    
    // Use current app ID if none is provided
    let appIdToDelete = args.id
    if (!appIdToDelete) {
      appIdToDelete = this.configManager.getCurrentAppId()
      if (!appIdToDelete) {
        this.error('No app ID provided and no current app selected. Please provide an app ID or select a default app with "ably apps switch".')
      }
    }
    
    // Check if we're deleting the current app
    const isDeletingCurrentApp = appIdToDelete === this.configManager.getCurrentAppId()
    
    try {
      // Get app details
      const app = await controlApi.getApp(appIdToDelete)
      
      // If not using force flag, get app details and prompt for confirmation
      if (!flags.force) {
        this.log(`\nYou are about to delete the following app:`)
        this.log(`App ID: ${app.id}`)
        this.log(`Name: ${app.name}`)
        this.log(`Status: ${app.status}`)
        this.log(`Account ID: ${app.accountId}`)
        this.log(`Created: ${this.formatDate(app.created)}`)
        
        // For additional confirmation, prompt user to enter the app name
        const nameConfirmed = await this.promptForAppName(app.name)
        if (!nameConfirmed) {
          this.log('Deletion cancelled - app name did not match')
          return
        }
        
        const confirmed = await this.promptForConfirmation(`\nAre you sure you want to delete app "${app.name}" (${app.id})? This action cannot be undone. [y/N]`)
        
        if (!confirmed) {
          this.log('Deletion cancelled')
          return
        }
      }
      
      this.log(`Deleting app ${appIdToDelete}...`)
      
      await controlApi.deleteApp(appIdToDelete)
      
      this.log('App deleted successfully')
      
      // If we deleted the current app, run switch command to select a new one
      if (isDeletingCurrentApp) {
        this.log('\nThe current app was deleted. Switching to another app...')
        
        // Create a new instance of AppsSwitch and run it
        const switchCommand = new AppsSwitch(this.argv, this.config)
        await switchCommand.run()
      }
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
  
  private async promptForAppName(appName: string): Promise<boolean> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    return new Promise<boolean>((resolve) => {
      rl.question(`For confirmation, please enter the app name (${appName}): `, (answer) => {
        rl.close()
        resolve(answer === appName)
      })
    })
  }
} 