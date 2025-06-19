import { BaseTopicCommand } from '../../base-topic-command.js';

export default class AppsCommand extends BaseTopicCommand {
  protected topicName = 'apps';
  protected commandGroup = 'apps management';
  
  static description = 'Manage Ably apps';
  
  static examples = [
    '$ ably apps list',
    '$ ably apps create',
    '$ ably apps update',
    '$ ably apps delete',
    '$ ably apps set-apns-p12',
    '$ ably apps stats',
    '$ ably apps channel-rules list',
    '$ ably apps switch my-app',
  ];
}
