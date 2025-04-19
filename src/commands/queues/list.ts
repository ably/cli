import { Flags } from "@oclif/core";
import chalk from "chalk";

import { ControlBaseCommand } from "../../control-base-command.js";

interface QueueStats {
  acknowledgementRate: null | number;
  deliveryRate: null | number;
  publishRate: null | number;
}

interface QueueMessages {
  ready: number;
  total: number;
  unacknowledged: number;
}

interface QueueAmqp {
  queueName: string;
  uri: string;
}

interface QueueStomp {
  destination: string;
  host: string;
  uri: string;
}

interface Queue {
  amqp: QueueAmqp;
  deadletter?: boolean;
  deadletterId?: string;
  id: string;
  maxLength: number;
  messages: QueueMessages;
  name: string;
  region: string;
  state: string;
  stats: QueueStats;
  stomp: QueueStomp;
  ttl: number;
}

export default class QueuesListCommand extends ControlBaseCommand {
  static description = "List all queues";

  static examples = [
    "$ ably queues list",
    "$ ably queues list --json",
    '$ ably queues list --app "My App" --pretty-json',
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,

    app: Flags.string({
      description: "App ID or name to list queues for",
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(QueuesListCommand);

    // Display authentication information
    this.showAuthInfoIfNeeded(flags);

    const controlApi = this.createControlApi(flags);
    const appId = await this.resolveAppId(flags);

    try {
      if (!appId) {
        this.error(
          'No app specified. Use --app flag or select an app with "ably apps switch"',
        );
        return;
      }

      const queues = await controlApi.listQueues(appId);

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              appId,
              queues: queues.map((queue: Queue) => ({
                amqp: queue.amqp,
                deadletter: queue.deadletter || false,
                deadletterId: queue.deadletterId,
                id: queue.id,
                maxLength: queue.maxLength,
                messages: queue.messages,
                name: queue.name,
                region: queue.region,
                state: queue.state,
                stats: queue.stats,
                stomp: queue.stomp,
                ttl: queue.ttl,
              })),
              success: true,
              timestamp: new Date().toISOString(),
              total: queues.length,
            },
            flags,
          ),
        );
      } else {
        if (queues.length === 0) {
          this.log("No queues found");
          return;
        }

        this.log(`Found ${queues.length} queues:\n`);

        queues.forEach((queue: Queue) => {
          this.log(chalk.bold(`Queue ID: ${queue.id}`));
          this.log(`  Name: ${queue.name}`);
          this.log(`  Region: ${queue.region}`);
          this.log(`  State: ${queue.state}`);

          this.log(`  AMQP:`);
          this.log(`    URI: ${queue.amqp.uri}`);
          this.log(`    Queue Name: ${queue.amqp.queueName}`);

          this.log(`  STOMP:`);
          this.log(`    URI: ${queue.stomp.uri}`);
          this.log(`    Host: ${queue.stomp.host}`);
          this.log(`    Destination: ${queue.stomp.destination}`);

          this.log(`  Messages:`);
          this.log(`    Ready: ${queue.messages.ready}`);
          this.log(`    Unacknowledged: ${queue.messages.unacknowledged}`);
          this.log(`    Total: ${queue.messages.total}`);

          if (
            queue.stats.publishRate !== null ||
            queue.stats.deliveryRate !== null ||
            queue.stats.acknowledgementRate !== null
          ) {
            this.log(`  Stats:`);
            if (queue.stats.publishRate !== null) {
              this.log(`    Publish Rate: ${queue.stats.publishRate} msg/s`);
            }

            if (queue.stats.deliveryRate !== null) {
              this.log(`    Delivery Rate: ${queue.stats.deliveryRate} msg/s`);
            }

            if (queue.stats.acknowledgementRate !== null) {
              this.log(
                `    Acknowledgement Rate: ${queue.stats.acknowledgementRate} msg/s`,
              );
            }
          }

          this.log(`  TTL: ${queue.ttl} seconds`);
          this.log(`  Max Length: ${queue.maxLength} messages`);
          if (queue.deadletter) {
            this.log(`  Deadletter Queue ID: ${queue.deadletterId}`);
          }

          this.log(""); // Add a blank line between queues
        });
      }
    } catch (error) {
      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              appId,
              error: error instanceof Error ? error.message : String(error),
              status: "error",
              success: false,
            },
            flags,
          ),
        );
      } else {
        this.error(
          `Error listing queues: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
