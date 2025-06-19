import { BaseTopicCommand } from '../../base-topic-command.js';

export default class ChannelsPresence extends BaseTopicCommand {
  protected topicName = 'channels:presence';
  protected commandGroup = 'channel presence';
  
  static override description = 'Manage presence on Ably channels';
  
  static override examples = [
    '$ ably channels presence enter my-channel',
    '$ ably channels presence subscribe my-channel',
  ];
}