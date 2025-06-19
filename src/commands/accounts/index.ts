import { BaseTopicCommand } from '../../base-topic-command.js';

export default class AccountsCommand extends BaseTopicCommand {
  protected topicName = 'accounts';
  protected commandGroup = 'accounts management';
  
  static description = 'Manage Ably accounts and your configured access tokens';
  
  static examples = [
    '$ ably accounts login',
    '$ ably accounts list', 
    '$ ably accounts current',
    '$ ably accounts logout',
    '$ ably accounts switch my-account',
    '$ ably accounts stats',
  ];
}
