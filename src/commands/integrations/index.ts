import { BaseTopicCommand } from '../../base-topic-command.js';

export default class IntegrationsIndexCommand extends BaseTopicCommand {
  protected topicName = 'integrations';
  protected commandGroup = 'integrations management';
  
  static description = 'Manage Ably integrations';
  
  static examples = [
    '<%= config.bin %> <%= command.id %> list',
    '<%= config.bin %> <%= command.id %> get rule123',
    '<%= config.bin %> <%= command.id %> create',
  ];
}
