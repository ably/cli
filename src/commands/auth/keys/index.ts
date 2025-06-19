import { BaseTopicCommand } from '../../../base-topic-command.js';

export default class AuthKeys extends BaseTopicCommand {
  protected topicName = 'auth:keys';
  protected commandGroup = 'API key management';
  
  static description = 'Key management commands';
  
  static examples = [
    '$ ably auth keys list',
    '$ ably auth keys create --name "My New Key"',
    '$ ably auth keys get KEY_ID',
    '$ ably auth keys revoke KEY_ID',
    '$ ably auth keys update KEY_ID',
    '$ ably auth keys switch KEY_ID',
  ];
}