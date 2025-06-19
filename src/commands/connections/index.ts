import { BaseTopicCommand } from '../../base-topic-command.js';

export default class Connections extends BaseTopicCommand {
  protected topicName = 'connections';
  protected commandGroup = 'Pub/Sub connection';
  
  static override description = 'Interact with Ably Pub/Sub connections';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %> stats',
    '<%= config.bin %> <%= command.id %> logs connections-lifecycle',
    '<%= config.bin %> <%= command.id %> test',
  ];
}
