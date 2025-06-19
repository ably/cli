import { BaseTopicCommand } from '../../base-topic-command.js';

export default class BenchTopic extends BaseTopicCommand {
  protected topicName = 'bench';
  protected commandGroup = 'benchmark testing';
  
  static description = 'Commands for running benchmark tests';
  
  static examples = [
    '<%= config.bin %> <%= command.id %> publisher my-channel',
    '<%= config.bin %> <%= command.id %> subscriber my-channel',
  ];
}
