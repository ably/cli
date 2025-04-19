import { Command } from "@oclif/core";

export default class TypingIndex extends Command {
  static override description =
    "Commands for working with typing indicators in chat rooms";

  static override examples = [
    "$ ably rooms typing subscribe my-room",
    "$ ably rooms typing start my-room",
  ];

  async run(): Promise<void> {
    this.log("Use one of the typing subcommands:");
    this.log("");
    this.log(
      "  ably rooms typing subscribe  - Subscribe to typing indicators in a chat room",
    );
    this.log("  ably rooms typing start      - Start typing in a chat room");
  }
}
