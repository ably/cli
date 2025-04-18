import { Command, Flags, Config } from "@oclif/core";
import chalk from "chalk";
import stripAnsi from 'strip-ansi';

import { ConfigManager } from "../../services/config-manager.js";

export default class HelpCommand extends Command {
  static description = 'Get help from Ably'

  static examples = [
    '$ ably help ask "How do I publish to a channel?"',
    '$ ably help status',
    '$ ably help contact',
    '$ ably help support',
  ]

  static flags = {
    help: Flags.help({char: 'h'}),
  }

  protected webCliMode: boolean;
  protected configManager: ConfigManager;
  protected isShowingRootHelp: boolean = false;

  constructor(argv: string[], config: Config) {
    super(argv, config);
    this.webCliMode = process.env.ABLY_WEB_CLI_MODE === 'true';
    this.configManager = new ConfigManager();
  }
  
  async run(): Promise<void> {
    await this.parse(HelpCommand)
    
    this.log('Ably help commands:')
    this.log('')
    this.log('  ably help ask       - Ask a question to the Ably AI agent for help')
    this.log('  ably help contact   - Contact Ably for assistance')
    this.log('  ably help support   - Get support from Ably')
    this.log('  ably help status    - Check the status of the Ably service')
    this.log('')
    this.log('Run `ably help COMMAND --help` for more information on a command.')
    
    this.log('')
    this.log(chalk.yellow('Did you mean ably --help? Here\'s a list of all commands available for ably:'))
    this.log('')
    
    this.log(`${chalk.bold('USAGE')}`)
    this.log(`  $ ably [COMMAND]`)
    this.log('')
    
    this.displayAllCommands()
  }

  formatHelpOutput(output: string): string {
    if (process.env.GENERATING_README === 'true') {
      return stripAnsi(output);
    }
    return output;
  }

  private async displayAllCommands(): Promise<void> {
    const rootCommands: { description: string, id: string }[] = []
    for (const c of this.config.commands) {
      try {
        if (c.id.startsWith('--') || c.id.includes(' ') || c.id.includes(':')) {
          continue
        }
        const cmd = await c.load()
        if ((cmd && ('isAlias' in cmd && cmd.isAlias)) || 
            (cmd && ('isInternal' in cmd && cmd.isInternal)) || 
            (cmd && ('hidden' in cmd && cmd.hidden))) {
          continue
        }
        rootCommands.push({
          description: cmd.description || '',
          id: c.id
        })
      } catch { /* Skip commands that can't be loaded */ }
    }
    rootCommands.sort((a, b) => a.id.localeCompare(b.id))
    const maxLength = Math.max(...rootCommands.map(cmd => cmd.id.length))
    const paddingLength = maxLength + 4
    this.log(`${chalk.bold('COMMANDS')}`)
    for (const entry of rootCommands) {
      const padding = ' '.repeat(paddingLength - entry.id.length)
      this.log(`  ${chalk.cyan(entry.id)}${padding}${entry.description}`)
    }
  }
} 