import { ControlBaseCommand } from '../../control-base-command.js'

export default class AppsCommand extends ControlBaseCommand {
  static description = 'Manage Ably apps'

  static examples = [
    '$ ably apps list',
    '$ ably apps create',
    '$ ably apps update',
    '$ ably apps delete',
    '$ ably apps set-apns-p12',
    '$ ably apps stats',
    '$ ably apps channel-rules list',
    '$ ably apps switch my-app',
  ]

  async run(): Promise<void> {
    this.log('Ably apps management commands:')
    this.log('')
    this.log('  ably apps list              - List all apps')
    this.log('  ably apps create            - Create a new app')
    this.log('  ably apps update            - Update an app')
    this.log('  ably apps delete            - Delete an app')
    this.log('  ably apps set-apns-p12      - Upload Apple Push Notification Service P12 certificate')
    this.log('  ably apps stats             - Get app stats with optional live updates')
    this.log('  ably apps channel-rules     - Manage Ably channel rules (namespaces)')
    this.log('  ably apps logs              - Stream or retrieve app logs')
    this.log('  ably apps switch            - Switch to a different app')
    this.log('')
    this.log('Run `ably apps COMMAND --help` for more information on a command.')
  }
} 
