import { BaseTopicCommand } from '../../base-topic-command.js';

export default class RoomsIndex extends BaseTopicCommand {
  protected topicName = 'rooms';
  protected commandGroup = 'Chat rooms';
  
  static override description = 'Interact with Ably Chat rooms';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %> list',
    '<%= config.bin %> <%= command.id %> messages send my-room "Hello world!"',
    '<%= config.bin %> <%= command.id %> messages subscribe my-room',
  ];
}
