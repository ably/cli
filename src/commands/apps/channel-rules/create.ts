import { Flags } from "@oclif/core";
import chalk from "chalk";

import { ControlBaseCommand } from "../../../control-base-command.js";

export default class ChannelRulesCreateCommand extends ControlBaseCommand {
  static description = "Create a channel rule";

  static examples = [
    '$ ably apps channel-rules create --name "chat" --persisted',
    '$ ably apps channel-rules create --name "events" --push-enabled',
    '$ ably apps channel-rules create --name "notifications" --persisted --push-enabled --app "My App"',
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,
    app: Flags.string({
      description: "App ID or name to create the channel rule in",
      required: false,
    }),
    authenticated: Flags.boolean({
      description:
        "Whether channels matching this rule require clients to be authenticated",
      required: false,
    }),
    "batching-enabled": Flags.boolean({
      description:
        "Whether to enable batching for messages on channels matching this rule",
      required: false,
    }),
    "batching-interval": Flags.integer({
      description:
        "The batching interval for messages on channels matching this rule",
      required: false,
    }),
    "conflation-enabled": Flags.boolean({
      description:
        "Whether to enable conflation for messages on channels matching this rule",
      required: false,
    }),
    "conflation-interval": Flags.integer({
      description:
        "The conflation interval for messages on channels matching this rule",
      required: false,
    }),
    "conflation-key": Flags.string({
      description:
        "The conflation key for messages on channels matching this rule",
      required: false,
    }),
    "expose-time-serial": Flags.boolean({
      description:
        "Whether to expose the time serial for messages on channels matching this rule",
      required: false,
    }),
    name: Flags.string({
      description: "Name of the channel rule",
      required: true,
    }),
    "persist-last": Flags.boolean({
      description:
        "Whether to persist only the last message on channels matching this rule",
      required: false,
    }),
    persisted: Flags.boolean({
      default: false,
      description:
        "Whether messages on channels matching this rule should be persisted",
      required: false,
    }),
    "populate-channel-registry": Flags.boolean({
      description:
        "Whether to populate the channel registry for channels matching this rule",
      required: false,
    }),
    "push-enabled": Flags.boolean({
      default: false,
      description:
        "Whether push notifications should be enabled for channels matching this rule",
      required: false,
    }),
    "tls-only": Flags.boolean({
      description: "Whether to enforce TLS for channels matching this rule",
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ChannelRulesCreateCommand);

    const controlApi = this.createControlApi(flags);
    let appId: string | undefined;

    try {
      let appId = flags.app;
      if (!appId) {
        appId = await this.resolveAppId(flags);
      }

      if (!appId) {
        if (this.shouldOutputJson(flags)) {
          this.log(
            this.formatJsonOutput(
              {
                error:
                  'No app specified. Use --app flag or select an app with "ably apps switch"',
                status: "error",
                success: false,
              },
              flags,
            ),
          );
        } else {
          this.error(
            'No app specified. Use --app flag or select an app with "ably apps switch"',
          );
        }

        return;
      }

      const namespaceData = {
        authenticated: flags.authenticated,
        batchingEnabled: flags["batching-enabled"],
        batchingInterval: flags["batching-interval"],
        channelNamespace: flags.name,
        conflationEnabled: flags["conflation-enabled"],
        conflationInterval: flags["conflation-interval"],
        conflationKey: flags["conflation-key"],
        exposeTimeSerial: flags["expose-time-serial"],
        persistLast: flags["persist-last"],
        persisted: flags.persisted,
        populateChannelRegistry: flags["populate-channel-registry"],
        pushEnabled: flags["push-enabled"],
        tlsOnly: flags["tls-only"],
      };

      const createdNamespace = await controlApi.createNamespace(
        appId,
        namespaceData,
      );

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              appId,
              rule: {
                authenticated: createdNamespace.authenticated,
                batchingEnabled: createdNamespace.batchingEnabled,
                batchingInterval: createdNamespace.batchingInterval,
                conflationEnabled: createdNamespace.conflationEnabled,
                conflationInterval: createdNamespace.conflationInterval,
                conflationKey: createdNamespace.conflationKey,
                created: new Date(createdNamespace.created).toISOString(),
                exposeTimeSerial: createdNamespace.exposeTimeSerial,
                id: createdNamespace.id,
                name: flags.name,
                persistLast: createdNamespace.persistLast,
                persisted: createdNamespace.persisted,
                populateChannelRegistry:
                  createdNamespace.populateChannelRegistry,
                pushEnabled: createdNamespace.pushEnabled,
                tlsOnly: createdNamespace.tlsOnly,
              },
              success: true,
              timestamp: new Date().toISOString(),
            },
            flags,
          ),
        );
      } else {
        this.log("Channel rule created successfully:");
        this.log(`ID: ${createdNamespace.id}`);
        this.log(
          `Persisted: ${createdNamespace.persisted ? chalk.green("Yes") : "No"}`,
        );
        this.log(
          `Push Enabled: ${createdNamespace.pushEnabled ? chalk.green("Yes") : "No"}`,
        );

        if (createdNamespace.authenticated !== undefined) {
          this.log(
            `Authenticated: ${createdNamespace.authenticated ? chalk.green("Yes") : "No"}`,
          );
        }

        if (createdNamespace.persistLast !== undefined) {
          this.log(
            `Persist Last: ${createdNamespace.persistLast ? chalk.green("Yes") : "No"}`,
          );
        }

        if (createdNamespace.exposeTimeSerial !== undefined) {
          this.log(
            `Expose Time Serial: ${createdNamespace.exposeTimeSerial ? chalk.green("Yes") : "No"}`,
          );
        }

        if (createdNamespace.populateChannelRegistry !== undefined) {
          this.log(
            `Populate Channel Registry: ${createdNamespace.populateChannelRegistry ? chalk.green("Yes") : "No"}`,
          );
        }

        if (createdNamespace.batchingEnabled !== undefined) {
          this.log(
            `Batching Enabled: ${createdNamespace.batchingEnabled ? chalk.green("Yes") : "No"}`,
          );
        }

        if (createdNamespace.batchingInterval !== undefined) {
          this.log(
            `Batching Interval: ${chalk.green(createdNamespace.batchingInterval.toString())}`,
          );
        }

        if (createdNamespace.conflationEnabled !== undefined) {
          this.log(
            `Conflation Enabled: ${createdNamespace.conflationEnabled ? chalk.green("Yes") : "No"}`,
          );
        }

        if (createdNamespace.conflationInterval !== undefined) {
          this.log(
            `Conflation Interval: ${chalk.green(createdNamespace.conflationInterval.toString())}`,
          );
        }

        if (createdNamespace.conflationKey !== undefined) {
          this.log(
            `Conflation Key: ${chalk.green(createdNamespace.conflationKey)}`,
          );
        }

        if (createdNamespace.tlsOnly !== undefined) {
          this.log(
            `TLS Only: ${createdNamespace.tlsOnly ? chalk.green("Yes") : "No"}`,
          );
        }

        this.log(`Created: ${this.formatDate(createdNamespace.created)}`);
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
          `Error creating channel rule: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
