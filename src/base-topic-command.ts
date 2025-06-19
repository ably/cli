import { Command } from '@oclif/core';
import chalk from 'chalk';

export abstract class BaseTopicCommand extends Command {
  protected abstract topicName: string;
  protected abstract commandGroup: string;
  
  async run(): Promise<void> {
    const commands = await this.getTopicCommands();
    
    this.log(`Ably ${this.commandGroup} commands:`);
    this.log('');
    
    const maxLength = Math.max(...commands.map(cmd => cmd.id.length));
    
    for (const cmd of commands) {
      const paddedId = `ably ${cmd.id}`.padEnd(maxLength + 7); // +7 for "ably " prefix
      const description = cmd.description || '';
      this.log(`  ${chalk.cyan(paddedId)} - ${description}`);
    }
    
    this.log('');
    this.log(`Run \`${chalk.cyan(`ably ${this.topicName} COMMAND --help`)}\` for more information on a command.`);
  }
  
  private async getTopicCommands(): Promise<Array<{id: string; description: string}>> {
    const commands: Array<{id: string; description: string}> = [];
    const topicPrefix = `${this.topicName}:`;
    
    for (const cmd of this.config.commands) {
      if (cmd.id.startsWith(topicPrefix) && !cmd.hidden) {
        try {
          const loadedCmd = await cmd.load();
          if (!loadedCmd.hidden) {
            commands.push({
              id: cmd.id.replace(':', ' '),
              description: loadedCmd.description || ''
            });
          }
        } catch {
          // Skip commands that can't be loaded
        }
      }
    }
    
    return commands.sort((a, b) => a.id.localeCompare(b.id));
  }
}