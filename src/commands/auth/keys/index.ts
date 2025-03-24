import { AblyBaseCommand } from '../../../base-command.js'

export default class AuthKeys extends AblyBaseCommand {
  static description = 'Key management commands'

  static examples = [
    '$ ably auth keys list',
    '$ ably auth keys get KEY_ID',
    '$ ably auth keys revoke KEY_ID',
    '$ ably auth keys update KEY_ID',
    '$ ably auth keys switch KEY_ID',
  ]

  async run(): Promise<void> {
    const { args } = await this.parse(AuthKeys)
    
    this.log('Key management commands:')
    this.log('')
    this.log('Usage:')
    this.log('  $ ably auth keys [COMMAND]')
    this.log('')
    this.log('Commands:')
    this.log('  list     List all keys in the app')
    this.log('  get      View details for a key')
    this.log('  revoke   Revoke a key')
    this.log('  update   Update a key\'s properties')
    this.log('  switch   Switch to a key for all client requests')
    this.log('')
    this.log('Run $ ably auth keys [COMMAND] --help for more information on a command.')
  }
} 