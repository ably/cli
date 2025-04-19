import { Command } from "@oclif/core";

export default class RoomsOccupancy extends Command {
  static override description = "Commands for monitoring room occupancy";

  static override examples = [
    "$ ably rooms occupancy get my-room",
    "$ ably rooms occupancy subscribe my-room",
  ];

  async run(): Promise<void> {
    this.log(
      "This is a placeholder. Please use a subcommand: get or subscribe",
    );
    this.log("Examples:");
    this.log("  $ ably rooms occupancy get my-room");
    this.log("  $ ably rooms occupancy subscribe my-room");
  }
}
