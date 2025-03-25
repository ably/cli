import { Flags, Args } from '@oclif/core'
import { ControlBaseCommand } from '../../../control-base-command.js'
import * as readline from 'readline'

export default class ChannelRulesDeleteCommand extends ControlBaseCommand {
  static description = 'Delete a channel rule'

  static examples = [
    '$ ably apps channel-rules delete chat',
    '$ ably apps channel-rules delete events --app "My App"',
    '$ ably apps channel-rules delete notifications --force',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID or name to delete the channel rule from',
      required: false,
    }),
    'force': Flags.boolean({
      description: 'Force deletion without confirmation',
      required: false,
      default: false,
      char: 'f',
    }),
  }

  static args = {
    nameOrId: Args.string({
      description: 'Name or ID of the channel rule to delete',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(ChannelRulesDeleteCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      // Find the namespace by name or ID
      const namespaces = await controlApi.listNamespaces(appId)
      const namespace = namespaces.find(n => n.id === args.nameOrId)
      
      if (!namespace) {
        this.error(`Channel rule "${args.nameOrId}" not found`)
        return
      }
      
      // If not using force flag, prompt for confirmation
      if (!flags.force) {
        this.log(`\nYou are about to delete the following channel rule:`)
        this.log(`ID: ${namespace.id}`)
        this.log(`Persisted: ${namespace.persisted ? 'Yes' : 'No'}`)
        this.log(`Push Enabled: ${namespace.pushEnabled ? 'Yes' : 'No'}`)
        this.log(`Created: ${this.formatDate(namespace.created)}`)
        
        const confirmed = await this.promptForConfirmation(`\nAre you sure you want to delete channel rule with ID "${namespace.id}"? [y/N]`)
        
        if (!confirmed) {
          this.log('Deletion cancelled')
          return
        }
      }
      
      await controlApi.deleteNamespace(appId, namespace.id)
      
      this.log(`Channel rule with ID "${namespace.id}" deleted successfully`)
    } catch (error) {
      this.error(`Error deleting channel rule: ${error instanceof Error ? error.message : String(error)}`)
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