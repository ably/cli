import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import chalk from 'chalk'

export default class IntegrationsListCommand extends ControlBaseCommand {
  static description = 'List all integration rules'

  static examples = [
    '$ ably integrations list',
    '$ ably integrations list --app "My App" --json',
    '$ ably integrations list --app "My App" --pretty-json']

  static flags = {
    ...ControlBaseCommand.globalFlags,
    
    'app': Flags.string({
      description: 'App ID or name to list integration rules for',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(IntegrationsListCommand)
    
    // Display authentication information
    this.showAuthInfoIfNeeded(flags)
    
    const controlApi = this.createControlApi(flags)
    let appId: string | undefined;
    
    try {
      // Get app ID from flags or config
      appId = await this.getAppId(flags)
      
      if (!appId) {
        if (this.shouldOutputJson(flags)) {
          this.log(this.formatJsonOutput({
            success: false,
            error: 'No app specified. Use --app flag or select an app with "ably apps switch"',
            status: 'error'
          }, flags));
        } else {
          this.error('No app specified. Use --app flag or select an app with "ably apps switch"');
        }
        return;
      }
      
      const rules = await controlApi.listRules(appId)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: true,
          timestamp: new Date().toISOString(),
          appId,
          rules: rules.map(rule => ({
            id: rule.id,
            appId: rule.appId,
            type: rule.ruleType,
            requestMode: rule.requestMode,
            status: rule.status,
            source: {
              type: rule.source.type,
              channelFilter: rule.source.channelFilter || null
            },
            target: rule.target,
            version: rule.version,
            created: new Date(rule.created).toISOString(),
            modified: new Date(rule.modified).toISOString()
          })),
          total: rules.length
        }, flags));
      } else {
        if (rules.length === 0) {
          this.log('No integration rules found');
          return;
        }
        
        this.log(`Found ${rules.length} integration rules:\n`);
        
        rules.forEach(rule => {
          this.log(chalk.bold(`Rule ID: ${rule.id}`));
          this.log(`  App ID: ${rule.appId}`);
          this.log(`  Type: ${rule.ruleType}`);
          this.log(`  Request Mode: ${rule.requestMode}`);
          this.log(`  Status: ${rule.status}`);
          this.log(`  Source:`);
          this.log(`    Type: ${rule.source.type}`);
          this.log(`    Channel Filter: ${rule.source.channelFilter || '(none)'}`);
          this.log(`  Target: ${this.formatJsonOutput(rule.target, flags).replace(/\n/g, '\n    ')}`);
          this.log(`  Version: ${rule.version}`);
          this.log(`  Created: ${this.formatDate(rule.created)}`);
          this.log(`  Updated: ${this.formatDate(rule.modified)}`);
          this.log(''); // Add a blank line between rules
        });
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          status: 'error',
          appId
        }, flags));
      } else {
        this.error(`Error listing integration rules: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
} 