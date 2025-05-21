import { Command } from "@oclif/core";

export default class MessagesReactionsIndex extends Command {
  static override description =
    "Commands for working with message reactions in chat rooms";

  static override examples = [
    '$ ably rooms messages reactions add my-room "message-id" "👍"',
    "$ ably rooms messages reactions subscribe my-room",
    '$ ably rooms messages reactions remove my-room "message-id" "👍"',
  ];

  async run(): Promise<void> {
    this.log("Use one of the message reactions subcommands:");
    this.log("");
    this.log(
      "  ably rooms messages reactions add       - Add a reaction to a message",
    );
    this.log(
      "  ably rooms messages reactions subscribe - Subscribe to message reactions in a room",
    );
    this.log(
      "  ably rooms messages reactions remove    - Remove a reaction from a message",
    );
  }
}
