import { BaseTopicCommand } from '../../base-topic-command.js';

export default class SpacesIndex extends BaseTopicCommand {
  protected topicName = 'spaces';
  protected commandGroup = 'Spaces';
  
  static override description = 'Interact with Ably Spaces';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %> list',
    '<%= config.bin %> <%= command.id %> members enter my-space',
    '<%= config.bin %> <%= command.id %> locations set my-space',
  ];
}
