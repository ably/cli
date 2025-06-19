import { BaseTopicCommand } from '../../../base-topic-command.js';

export default class ChannelRulesIndexCommand extends BaseTopicCommand {
  protected topicName = 'apps:channel-rules';
  protected commandGroup = 'channel rules';
  
  static description = 'Manage Ably channel rules (namespaces)';
  
  static examples = [
    'ably apps channel-rules list',
    'ably apps channel-rules create --name "chat" --persisted',
    'ably apps channel-rules update chat --push-enabled',
    'ably apps channel-rules delete chat',
  ];
}