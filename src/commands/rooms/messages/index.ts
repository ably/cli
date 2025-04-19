import { Command } from "@oclif/core";

export default class MessagesIndex extends Command {
  static override description =
    "Commands for working with chat messages in rooms";

  static override examples = [
    '$ ably rooms messages send my-room "Hello world!"',
    "$ ably rooms messages subscribe my-room",
    "$ ably rooms messages get my-room",
  ];

  async run(): Promise<void> {
    this.log("Use one of the messages subcommands:");
    this.log("");
    this.log(
      "  ably rooms messages send       - Send a message to a chat room",
    );
    this.log(
      "  ably rooms messages subscribe  - Subscribe to messages in a chat room",
    );
    this.log(
      "  ably rooms messages get        - Get historical messages from a chat room",
    );
  }
}
