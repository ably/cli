import { BaseTopicCommand } from '../../base-topic-command.js';

export default class Logs extends BaseTopicCommand {
  protected topicName = 'logs';
  protected commandGroup = 'logging';
  
  static override description = 'Streaming and retrieving logs from Ably';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %> app subscribe',
    '<%= config.bin %> <%= command.id %> app history',
    '<%= config.bin %> <%= command.id %> channel-lifecycle subscribe',
  ];
}
