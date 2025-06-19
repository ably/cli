import { BaseTopicCommand } from '../../base-topic-command.js';

export default class AccountsCommand extends BaseTopicCommand {
  protected topicName = 'accounts';
  protected commandGroup = 'accounts management';
  
  static description = 'Manage Ably accounts and your configured access tokens';
  
  static examples = [
    '<%= config.bin %> <%= command.id %> login',
    '<%= config.bin %> <%= command.id %> list',
    '<%= config.bin %> <%= command.id %> current',
  ];
}
