import { Command, Args, Flags } from '@oclif/core';
import CustomHelp from '../help.js';

export default class HelpCommand extends Command {
  static description = 'Display help for ably';
  
  static args = {
    commands: Args.string({
      description: 'Command to show help for',
      required: false,
    }),
  };
  
  static strict = false; // Allow multiple arguments for nested commands
  
  static flags = {
    'web-cli-help': Flags.boolean({
      description: 'Show help formatted for the web CLI',
      hidden: true,
    }),
  };
  
  static examples = [
    '$ ably help',
    '$ ably help channels',
    '$ ably help channels publish',
  ];

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(HelpCommand);
    const help = new CustomHelp(this.config);
    
    // If web-cli-help flag is provided, show web CLI help
    if (flags['web-cli-help']) {
      const output = help.formatWebCliRoot();
      console.log(output);
      return;
    }
    
    // If no arguments, show root help
    if (argv.length === 0) {
      await help.showRootHelp();
      return;
    }
    
    // Join all arguments to form the command ID
    const commandId = argv.join(':');
    const command = this.config.findCommand(commandId);
    
    if (command) {
      // Show help for the specific command
      await help.showCommandHelp(command);
    } else {
      // Try with spaces instead of colons (for user convenience)
      const commandIdWithSpaces = argv.join(' ');
      const commandWithSpaces = this.config.findCommand(commandIdWithSpaces);
      
      if (commandWithSpaces) {
        await help.showCommandHelp(commandWithSpaces);
      } else {
        this.error(`Command "${commandIdWithSpaces}" not found.`);
      }
    }
  }
}