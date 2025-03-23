import { ControlBaseCommand } from '../../control-base-command.js'

export default class AppsCommand extends ControlBaseCommand {
  static description = 'Manage Ably apps'

  static examples = [
    '$ ably apps list',
    '$ ably apps create',
    '$ ably apps update',
    '$ ably apps delete',
  ]

  async run(): Promise<void> {
    this.log('Ably apps management commands')
    this.log('\nAvailable Commands:')
    this.log('  list          List all apps')
    this.log('  create        Create a new app')
    this.log('  update        Update an app')
    this.log('  delete        Delete an app')
    this.log('  set-apns-p12  Upload Apple Push Notification Service P12 certificate for an app')
    this.log('  stats         Get app stats with optional live updates')
    this.log('\nRun ably apps COMMAND --help for more information on a command')
  }
} 