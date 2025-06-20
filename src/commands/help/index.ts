import { BaseTopicCommand } from '../../base-topic-command.js';
import CustomHelp from '../../help.js';

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

  async run(): Promise<void> {
    // Check if there are any arguments passed (like "help doesnotexist")
    const { argv } = await this.parse(HelpCommand);
    
    if (argv.length > 0) {
      // If arguments provided, let the default BaseTopicCommand behavior handle it
      // This will show an error for non-existent commands
      return super.run();
    }
    
    // Otherwise, show root help like 'ably --help' but also include help subcommands
    // This is more intuitive than showing only help subcommands
    const help = new CustomHelp(this.config);
    const rootHelp = help.formatRoot();
    
    // Add help subcommands section
    const helpCommands = await this.getTopicCommands();
    if (helpCommands.length > 0) {
      const helpSection = [
        '',
        '',
        'Ably help commands:',
        '',
        ...helpCommands.map(cmd => `  ${cmd.id.padEnd(20)} - ${cmd.description}`),
        '',
        'Run `ably help COMMAND --help` for more information on a command.'
      ].join('\n');
      
      console.log(rootHelp + helpSection);
    } else {
      console.log(rootHelp);
    }
  }
}