import { AblyBaseCommand } from '../../base-command.js'

export default class Auth extends AblyBaseCommand {
  static description = 'Authentication for Ably including key management and token generation'

  static examples = [
    '$ ably auth keys list',
    '$ ably auth keys get KEY_ID',
    '$ ably auth keys revoke KEY_ID',
    '$ ably auth keys update KEY_ID',
    '$ ably auth keys switch KEY_ID',
    '$ ably auth issue-jwt-token',
    '$ ably auth issue-ably-token',
    '$ ably auth revoke-token TOKEN',
  ]

  async run(): Promise<void> {
    const { args } = await this.parse(Auth)
    
    this.log('Auth commands help:')
    this.log('')
    this.log('Usage:')
    this.log('  $ ably auth [COMMAND]')
    this.log('')
    this.log('Commands:')
    this.log('  keys:list         List all keys in the app')
    this.log('  keys:get          View details for a key')
    this.log('  keys:revoke       Revoke a key')
    this.log('  keys:update       Update a key\'s properties')
    this.log('  keys:switch       Switch to a key for all client requests')
    this.log('  issue-jwt-token   Creates an Ably JWT token with capabilities')
    this.log('  issue-ably-token  Creates an Ably Token with capabilities')
    this.log('  revoke-token      Revokes a token')
    this.log('')
    this.log('Run $ ably auth [COMMAND] --help for more information on a command.')
  }
} 