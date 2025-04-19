import { Command } from "@oclif/core";

export default class Connections extends Command {
  static override description = "Interact with Ably Pub/Sub connections";

  static override examples = [
    "$ ably connections stats",
    "$ ably connections logs connections-lifecycle",
    "$ ably connections test",
  ];

  async run() {
    this.log("Ably Pub/Sub connection commands:");
    this.log("");
    this.log(
      "  ably connections stats                - View connection statistics",
    );
    this.log(
      "  ably connections logs connections-lifecycle - View connection lifecycle logs",
    );
    this.log(
      "  ably connections test                 - Test connection to Ably",
    );
    this.log("");
    this.log(
      "Run `ably connections COMMAND --help` for more information on a command.",
    );
  }
}
