import { BaseTopicCommand } from '../../base-topic-command.js';

export default class SupportCommand extends BaseTopicCommand {
  protected topicName = 'support';
  protected commandGroup = 'support';
  
  static description = 'Get support and help from Ably';
  
  static examples = [
    '$ ably support ask "How do I publish to a channel?"',
    '$ ably support contact',
    '$ ably support info',
  ];
}