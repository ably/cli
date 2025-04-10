import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../../control-base-command.js'
import chalk from 'chalk'

export default class ChannelRulesListCommand extends ControlBaseCommand {
  static description = 'List all channel rules'

  static examples = [
    '$ ably apps channel-rules list',
    '$ ably apps channel-rules list --app "My App" --format json',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
    'app': Flags.string({
      description: 'App ID or name to list channel rules for',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(ChannelRulesListCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      const namespaces = await controlApi.listNamespaces(appId)
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(namespaces))
      } else {
        if (namespaces.length === 0) {
          this.log('No channel rules found')
          return
        }
        
        this.log(`Found ${namespaces.length} channel rules:\n`)
        
        namespaces.forEach(namespace => {
          this.log(chalk.bold(`Channel Rule ID: ${namespace.id}`))
          this.log(`  Persisted: ${namespace.persisted ? chalk.bold.green('✓ Yes') : 'No'}`)
          this.log(`  Push Enabled: ${namespace.pushEnabled ? chalk.bold.green('✓ Yes') : 'No'}`)
          if (namespace.authenticated !== undefined) {
            this.log(`  Authenticated: ${namespace.authenticated ? chalk.bold.green('✓ Yes') : 'No'}`)
          }
          if (namespace.persistLast !== undefined) {
            this.log(`  Persist Last Message: ${namespace.persistLast ? chalk.bold.green('✓ Yes') : 'No'}`)
          }
          if (namespace.exposeTimeSerial !== undefined) {
            this.log(`  Expose Time Serial: ${namespace.exposeTimeSerial ? chalk.bold.green('✓ Yes') : 'No'}`)
          }
          if (namespace.populateChannelRegistry !== undefined) {
            this.log(`  Populate Channel Registry: ${namespace.populateChannelRegistry ? chalk.bold.green('✓ Yes') : 'No'}`)
          }
          if (namespace.batchingEnabled !== undefined) {
            this.log(`  Batching Enabled: ${namespace.batchingEnabled ? chalk.bold.green('✓ Yes') : 'No'}`)
          }
          if (namespace.batchingInterval !== undefined && namespace.batchingInterval !== null && namespace.batchingInterval !== 0) {
            this.log(`  Batching Interval: ${chalk.bold.green(`✓ ${namespace.batchingInterval}`)}`)
          }
          if (namespace.conflationEnabled !== undefined) {
            this.log(`  Conflation Enabled: ${namespace.conflationEnabled ? chalk.bold.green('✓ Yes') : 'No'}`)
          }
          if (namespace.conflationInterval !== undefined && namespace.conflationInterval !== null && namespace.conflationInterval !== 0) {
            this.log(`  Conflation Interval: ${chalk.bold.green(`✓ ${namespace.conflationInterval}`)}`)
          }
          if (namespace.conflationKey !== undefined && namespace.conflationKey && namespace.conflationKey !== '') {
            this.log(`  Conflation Key: ${chalk.bold.green(`✓ ${namespace.conflationKey}`)}`)
          }
          if (namespace.tlsOnly !== undefined) {
            this.log(`  TLS Only: ${namespace.tlsOnly ? chalk.bold.green('✓ Yes') : 'No'}`)
          }
          this.log(`  Created: ${this.formatDate(namespace.created)}`)
          this.log(`  Updated: ${this.formatDate(namespace.modified)}`)
          this.log('') // Add a blank line between rules
        })
      }
    } catch (error) {
      this.error(`Error listing channel rules: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 