import { BaseTopicCommand } from '../../base-topic-command.js';

export default class Channels extends BaseTopicCommand {
  protected topicName = 'channels';
  protected commandGroup = 'Pub/Sub channel';
  
  static override description = 'Interact with Ably Pub/Sub channels';
  
  static override examples = [
    '<%= config.bin %> <%= command.id %> publish my-channel \'{"name":"message","data":"Hello, World"}\'',
    '<%= config.bin %> <%= command.id %> subscribe my-channel',
    '<%= config.bin %> <%= command.id %> list',
  ];
}
