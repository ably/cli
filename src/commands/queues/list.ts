import { Flags } from '@oclif/core'
import { ControlBaseCommand } from '../../control-base-command.js'
import chalk from 'chalk'

interface QueueStats {
  publishRate: number | null;
  deliveryRate: number | null;
  acknowledgementRate: number | null;
}

interface QueueMessages {
  ready: number;
  unacknowledged: number;
  total: number;
}

interface QueueAmqp {
  uri: string;
  queueName: string;
}

interface QueueStomp {
  uri: string;
  host: string;
  destination: string;
}

interface Queue {
  id: string;
  name: string;
  region: string;
  state: string;
  amqp: QueueAmqp;
  stomp: QueueStomp;
  messages: QueueMessages;
  stats: QueueStats;
  ttl: number;
  maxLength: number;
  deadletter?: boolean;
  deadletterId?: string;
}

export default class QueuesListCommand extends ControlBaseCommand {
  static description = 'List all queues'

  static examples = [
    '$ ably queues list',
    '$ ably queues list --json',
    '$ ably queues list --app "My App" --pretty-json']

  static flags = {
    ...ControlBaseCommand.globalFlags,
    
    'app': Flags.string({
      description: 'App ID or name to list queues for',
      required: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(QueuesListCommand)
    
    // Display authentication information
    this.showAuthInfoIfNeeded(flags)
    
    const controlApi = this.createControlApi(flags)
    let appId: string | undefined;
    
    try {
      // Get app ID from flags or config
      appId = await this.getAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      const queues = await controlApi.listQueues(appId)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: true,
          timestamp: new Date().toISOString(),
          appId,
          queues: queues.map((queue: Queue) => ({
            id: queue.id,
            name: queue.name,
            region: queue.region,
            state: queue.state,
            amqp: queue.amqp,
            stomp: queue.stomp,
            messages: queue.messages,
            stats: queue.stats,
            ttl: queue.ttl,
            maxLength: queue.maxLength,
            deadletter: queue.deadletter || false,
            deadletterId: queue.deadletterId
          })),
          total: queues.length
        }, flags));
      } else {
        if (queues.length === 0) {
          this.log('No queues found')
          return
        }
        
        this.log(`Found ${queues.length} queues:\n`)
        
        queues.forEach((queue: Queue) => {
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
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          status: 'error',
          appId: appId
        }, flags));
      } else {
        this.error(`Error listing queues: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
} 