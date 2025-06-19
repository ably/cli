import { BaseTopicCommand } from '../../base-topic-command.js';

export default class AppsCommand extends BaseTopicCommand {
  protected topicName = 'apps';
  protected commandGroup = 'apps management';
  
  static description = 'Manage Ably apps';
  
  static examples = [
    '<%= config.bin %> <%= command.id %> list',
    '<%= config.bin %> <%= command.id %> create',
    '<%= config.bin %> <%= command.id %> update',
    '<%= config.bin %> <%= command.id %> delete',
  ];
}
