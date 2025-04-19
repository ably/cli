import { Command } from "@oclif/core";

export default class RoomsPresence extends Command {
  static override description = "Manage presence on Ably chat rooms";

  static override examples = [
    "$ ably rooms presence enter my-room",
    "$ ably rooms presence subscribe my-room",
  ];

  async run(): Promise<void> {
    this.log(
      "This is a placeholder. Please use a subcommand: enter or subscribe",
    );
    this.log("Examples:");
    this.log("  $ ably rooms presence enter my-room");
    this.log("  $ ably rooms presence subscribe my-room");
  }
}
