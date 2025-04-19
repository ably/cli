import { Flags } from "@oclif/core";
import chalk from "chalk";

import { ControlBaseCommand } from "../../control-base-command.js";

// Interface for basic rule data structure
interface RuleData {
  requestMode: string;
  ruleType: string;
  source: {
    channelFilter: string;
    type: string;
  };
  status: "disabled" | "enabled";
  target: Record<string, unknown>; // Target is highly variable
}

export default class IntegrationsCreateCommand extends ControlBaseCommand {
  static description = "Create an integration rule";

  static examples = [
    '$ ably integrations create --rule-type "http" --source-type "channel.message" --target-url "https://example.com/webhook"',
    '$ ably integrations create --rule-type "amqp" --source-type "channel.message" --channel-filter "chat:*"',
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,
    app: Flags.string({
      description: "App ID or name to create the integration rule in",
      required: false,
    }),
    "channel-filter": Flags.string({
      description: "Channel filter pattern",
      required: false,
    }),
    "request-mode": Flags.string({
      default: "single",
      description: "Request mode for the rule",
      options: ["single", "batch"],
      required: false,
    }),
    "rule-type": Flags.string({
      description: "Type of integration rule (http, amqp, etc.)",
      options: [
        "http",
        "amqp",
        "kinesis",
        "firehose",
        "pulsar",
        "kafka",
        "azure",
        "azure-functions",
        "mqtt",
        "cloudmqtt",
      ],
      required: true,
    }),
    "source-type": Flags.string({
      description: "The event source type",
      options: [
        "channel.message",
        "channel.presence",
        "channel.lifecycle",
        "presence.message",
      ],
      required: true,
    }),
    status: Flags.string({
      default: "enabled",
      description: "Initial status of the rule",
      options: ["enabled", "disabled"],
      required: false,
    }),
    "target-url": Flags.string({
      description: "Target URL for HTTP rules",
      required: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(IntegrationsCreateCommand);

    const controlApi = this.createControlApi(flags);

    try {
      // Get app ID from flags or config
      const appId = await this.resolveAppId(flags);

      if (!appId) {
        this.error(
          'No app specified. Use --app flag or select an app with "ably apps switch"',
        );
        return;
      }

      // Prepare rule data
      const ruleData: RuleData = {
        requestMode: flags["request-mode"] as string,
        ruleType: flags["rule-type"] as string,
        source: {
          channelFilter: flags["channel-filter"] || "",
          type: flags["source-type"],
        },
        status: flags.status === "enabled" ? "enabled" : "disabled",
        target: {},
      };

      // Add target data based on rule type
      switch (flags["rule-type"]) {
        case "http": {
          if (!flags["target-url"]) {
            this.error("--target-url is required for HTTP integration rules");
            return;
          }

          ruleData.target = {
            enveloped: true,
            format: "json",
            url: flags["target-url"],
          };
          break;
        }

        case "amqp": {
          // Simplified AMQP config for demo purposes
          ruleData.target = {
            enveloped: true,
            exchangeName: "ably",
            format: "json",
            headers: {},
            immediate: false,
            mandatory: true,
            persistent: true,
            queueType: "classic",
            routingKey: "events",
          };
          break;
        }

        default: {
          this.log(
            `Note: Using default target for ${flags["rule-type"]}. In a real implementation, more target options would be required.`,
          );
          ruleData.target = { enveloped: true, format: "json" };
        }
      }

      const createdRule = await controlApi.createRule(appId, ruleData);

      if (this.shouldOutputJson(flags)) {
        this.log(this.formatJsonOutput({ rule: createdRule }, flags));
      } else {
        this.log(chalk.green("Integration Rule Created Successfully:"));
        this.log(`ID: ${createdRule.id}`);
        this.log(`App ID: ${createdRule.appId}`);
        this.log(`Rule Type: ${createdRule.ruleType}`);
        this.log(`Request Mode: ${createdRule.requestMode}`);
        this.log(`Source Channel Filter: ${createdRule.source.channelFilter}`);
        this.log(`Source Type: ${createdRule.source.type}`);
        this.log(
          `Target: ${this.formatJsonOutput(createdRule.target as Record<string, unknown>, flags)}`,
        );
      }
    } catch (error) {
      this.error(
        `Error creating integration rule: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
