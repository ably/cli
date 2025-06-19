import { BaseTopicCommand } from '../../base-topic-command.js';

export default class QueuesIndexCommand extends BaseTopicCommand {
  protected topicName = 'queues';
  protected commandGroup = 'queues management';
  
  static description = 'Manage Ably Queues';
  
  static examples = [
    '<%= config.bin %> <%= command.id %> list',
    '<%= config.bin %> <%= command.id %> create --name "my-queue"',
    '<%= config.bin %> <%= command.id %> delete my-queue',
  ];
}
