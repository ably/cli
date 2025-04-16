import { Flags } from '@oclif/core'

import { ControlBaseCommand } from '../../control-base-command.js'

export default class QueuesCreateCommand extends ControlBaseCommand {
  static description = 'Create a queue'

  static examples = [
    '$ ably queues create --name "my-queue"',
    '$ ably queues create --name "my-queue" --ttl 3600 --max-length 100000',
    '$ ably queues create --name "my-queue" --region "eu-west-1-a" --app "My App"',
  ]

  static flags = {
    ...ControlBaseCommand.globalFlags,
    'app': Flags.string({
      description: 'App ID or name to create the queue in',
      required: false,
    }),
    'max-length': Flags.integer({
      default: 10_000,
      description: 'Maximum number of messages in the queue',
      required: false,
    }),
    'name': Flags.string({
      description: 'Name of the queue',
      required: true,
    }),
    'region': Flags.string({
      default: 'us-east-1-a',
      description: 'Region for the queue',
      required: false,
    }),
    'ttl': Flags.integer({
      default: 60,
      description: 'Time to live for messages in seconds',
      required: false,
    }),
    
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(QueuesCreateCommand)
    
    const controlApi = this.createControlApi(flags)
    
    try {
      // Get app ID from flags or config
      const appId = await this.resolveAppId(flags)
      
      if (!appId) {
        this.error('No app specified. Use --app flag or select an app with "ably apps switch"')
        return
      }
      
      const queueData = {
        maxLength: flags['max-length'],
        name: flags.name,
        region: flags.region,
        ttl: flags.ttl,
      }
      
      const createdQueue = await controlApi.createQueue(appId, queueData)
      
      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput(JSON.parse(JSON.stringify(createdQueue)), flags))
      } else {
        this.log('Queue created successfully:')
        this.log(`Queue ID: ${createdQueue.id}`)
        this.log(`Name: ${createdQueue.name}`)
        this.log(`Region: ${createdQueue.region}`)
        this.log(`TTL: ${createdQueue.ttl} seconds`)
        this.log(`Max Length: ${createdQueue.maxLength} messages`)
        this.log(`State: ${createdQueue.state}`)
        
        this.log(`\nAMQP Connection Details:`)
        this.log(`URI: ${createdQueue.amqp.uri}`)
        this.log(`Queue Name: ${createdQueue.amqp.queueName}`)
        
        this.log(`\nSTOMP Connection Details:`)
        this.log(`URI: ${createdQueue.stomp.uri}`)
        this.log(`Host: ${createdQueue.stomp.host}`)
        this.log(`Destination: ${createdQueue.stomp.destination}`)
      }
    } catch (error) {
      this.error(`Error creating queue: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
} 