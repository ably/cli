import { BaseTopicCommand } from '../../base-topic-command.js';

export default class Auth extends BaseTopicCommand {
  protected topicName = 'auth';
  protected commandGroup = 'authentication';
  
  static description = 'Authentication for Ably including key management and token generation';
  
  static examples = [
    '<%= config.bin %> <%= command.id %> keys list',
    '<%= config.bin %> <%= command.id %> issue-jwt-token',
    '<%= config.bin %> <%= command.id %> issue-ably-token',
  ];
}
