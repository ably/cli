import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import chalk from 'chalk'

export default class QueuesListCommand extends ControlBaseCommand {
  static description = 'List all queues'

  static examples = [
    '$ ably queues list',
    '$ ably queues list --app "My App" --format json',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'format': Flags.string({
      description: 'Output format (json or pretty)',
      options: ['json', 'pretty'],
      default: 'pretty',
    }),
    'app': Flags.string({
      description: 'App ID or name to list queues for',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(QueuesListCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      const queues = await controlApi.listQueues(appId)
      
      if (flags.format === 'json') {
        this.log(JSON.stringify(queues))
      } else {
        if (queues.length === 0) {
          this.log('No queues found')
          return
        }
        
        this.log(`Found ${queues.length} queues:\n`)
        
        queues.forEach(queue => {
          this.log(chalk.bold(`Queue ID: ${queue.id}`))
          this.log(`  Name: ${queue.name}`)
          this.log(`  Region: ${queue.region}`)
          this.log(`  State: ${queue.state}`)
          
          this.log(`  AMQP:`)
          this.log(`    URI: ${queue.amqp.uri}`)
          this.log(`    Queue Name: ${queue.amqp.queueName}`)
          
          this.log(`  STOMP:`)
          this.log(`    URI: ${queue.stomp.uri}`)
          this.log(`    Host: ${queue.stomp.host}`)
          this.log(`    Destination: ${queue.stomp.destination}`)
          
          this.log(`  Messages:`)
          this.log(`    Ready: ${queue.messages.ready}`)
          this.log(`    Unacknowledged: ${queue.messages.unacknowledged}`)
          this.log(`    Total: ${queue.messages.total}`)
          
          if (queue.stats.publishRate !== null || 
              queue.stats.deliveryRate !== null || 
              queue.stats.acknowledgementRate !== null) {
            this.log(`  Stats:`)
            if (queue.stats.publishRate !== null) {
              this.log(`    Publish Rate: ${queue.stats.publishRate} msg/s`)
            }
            if (queue.stats.deliveryRate !== null) {
              this.log(`    Delivery Rate: ${queue.stats.deliveryRate} msg/s`)
            }
            if (queue.stats.acknowledgementRate !== null) {
              this.log(`    Acknowledgement Rate: ${queue.stats.acknowledgementRate} msg/s`)
            }
          }
          
          this.log(`  TTL: ${queue.ttl} seconds`)
          this.log(`  Max Length: ${queue.maxLength} messages`)
          if (queue.deadletter) {
            this.log(`  Deadletter Queue ID: ${queue.deadletterId}`)
          }
          
          this.log('') // Add a blank line between queues
        })
      }
    } catch (error) {
      this.error(`Error listing queues: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 