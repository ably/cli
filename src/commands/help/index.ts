import { BaseTopicCommand } from '../../base-topic-command.js';

export default class HelpCommand extends BaseTopicCommand {
  protected topicName = 'help';
  protected commandGroup = 'help';
  
  static description = 'Get help from Ably';
  
  static examples = [
    '$ ably help ask "How do I publish to a channel?"',
    '$ ably help status',
    '$ ably help contact',
    '$ ably help support',
  ];
}