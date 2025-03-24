import { Args } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'

export default class AppsSwitch extends ControlBaseCommand {
  static override description = 'Switch to a different Ably app'

  static override examples = [
    '<%= config.bin %> <%= command.id %> APP_ID',
    '<%= config.bin %> <%= command.id %>'
  ]

  static override flags = {
    ...ControlBaseCommand.globalFlags,
  }

  static override args = {
    appId: Args.string({
      description: 'ID of the app to switch to',
      required: false
    })
  }

  public async run(): Promise<void> {
    const { args } = await this.parse(AppsSwitch)
    
    const controlApi = this.createControlApi({})
    
    // If app ID is provided, switch directly
    if (args.appId) {
      await this.switchToApp(args.appId, controlApi)
      return
    }
    
    // Otherwise, show interactive selection
    this.log('Select an app to switch to:')
    const selectedApp = await this.interactiveHelper.selectApp(controlApi)
    
    if (selectedApp) {
      // Save the app info and set as current
      this.configManager.setCurrentApp(selectedApp.id)
      this.configManager.storeAppInfo(selectedApp.id, { appName: selectedApp.name })
      this.log(`Switched to app: ${selectedApp.name} (${selectedApp.id})`)
    } else {
      this.log('App switch cancelled.')
    }
  }
  
  private async switchToApp(appId: string, controlApi: any): Promise<void> {
    try {
      // Verify the app exists
      const app = await controlApi.getApp(appId)
      
      // Save app info and set as current
      this.configManager.setCurrentApp(appId)
      this.configManager.storeAppInfo(appId, { appName: app.name })
      
      this.log(`Switched to app: ${app.name} (${app.id})`)
    } catch (error) {
      this.error(`App with ID "${appId}" not found or access denied.`)
    }
  }
} 